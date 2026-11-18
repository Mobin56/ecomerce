import "server-only";
import { authenticator } from "otplib";
import { db } from "../db";
import { AppError } from "../errors";
import { burnPasswordCheck, verifyPassword } from "./password";
import { createSession, destroySession, getAdminSession, markTwoFactorOk } from "./session";
import { getSettings } from "../settings";
import { logActivity } from "../activity";
import { rateLimit, clientIp } from "../rate-limit";
import { decryptSecret, encryptSecret } from "../crypto";

authenticator.options = { window: 1 };

const GENERIC = "Invalid email or password.";

export async function adminLogin(email: string, password: string) {
  const ip = await clientIp();
  const rl = await rateLimit(`admin-login:${ip}`, 10, 15 * 60);
  if (!rl.ok) throw new AppError("RATE_LIMITED", "Too many attempts. Try again in 15 minutes.", 429);

  const sec = await getSettings("security");
  const user = await db.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (!user || !user.isActive) {
    await burnPasswordCheck(password);
    throw new AppError("INVALID_CREDENTIALS", GENERIC, 401);
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new AppError("LOCKED", "Account temporarily locked after failed attempts. Try again later.", 423);
  }
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    const failed = user.failedLogins + 1;
    await db.user.update({
      where: { id: user.id },
      data: { failedLogins: failed, lockedUntil: failed >= sec.maxLoginAttempts ? new Date(Date.now() + 15 * 60_000) : null },
    });
    await logActivity({ userId: user.id, action: "auth.login_failed" });
    throw new AppError("INVALID_CREDENTIALS", GENERIC, 401);
  }
  await db.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } });
  await createSession({ kind: "ADMIN", userId: user.id, ttlHours: sec.adminSessionHours, twoFactorOk: false });
  await logActivity({ userId: user.id, action: "auth.login" });
  const needs2fa = user.totpEnabled || sec.require2faForAdmins;
  return { needs2fa, setup2fa: !user.totpEnabled && sec.require2faForAdmins };
}

export async function verifyAdmin2fa(code: string) {
  const admin = await getAdminSession();
  if (!admin) throw new AppError("UNAUTHORIZED", "Session expired. Please sign in again.", 401);
  const rl = await rateLimit(`2fa:${admin.id}`, 6, 5 * 60);
  if (!rl.ok) throw new AppError("RATE_LIMITED", "Too many attempts.", 429);
  const user = await db.user.findUniqueOrThrow({ where: { id: admin.id } });
  if (!user.totpSecret) throw new AppError("NO_2FA", "Two-factor is not set up.", 400);
  if (!authenticator.check(code.replace(/\s/g, ""), decryptSecret(user.totpSecret))) {
    throw new AppError("INVALID_CODE", "Invalid code.", 401);
  }
  if (!user.totpEnabled) await db.user.update({ where: { id: user.id }, data: { totpEnabled: true } });
  await markTwoFactorOk(admin.sessionId);
  await logActivity({ userId: admin.id, action: "auth.2fa_verified" });
}

/** Generates (or returns pending) TOTP secret for enrolment; returns otpauth URL for a QR code. */
export async function beginTotpSetup() {
  const admin = await getAdminSession();
  if (!admin) throw new AppError("UNAUTHORIZED", "Please sign in.", 401);
  const user = await db.user.findUniqueOrThrow({ where: { id: admin.id } });
  let secret = user.totpSecret ? decryptSecret(user.totpSecret) : null;
  if (!secret || user.totpEnabled) {
    if (user.totpEnabled) throw new AppError("ALREADY", "Two-factor is already enabled.", 400);
    secret = authenticator.generateSecret();
    await db.user.update({ where: { id: user.id }, data: { totpSecret: encryptSecret(secret) } });
  }
  const store = await getSettings("store");
  return { secret, otpauth: authenticator.keyuri(user.email, store.name, secret) };
}

export async function adminLogout() {
  const admin = await getAdminSession();
  await destroySession("ADMIN");
  if (admin) await logActivity({ userId: admin.id, action: "auth.logout" });
}

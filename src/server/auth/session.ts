import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { db } from "../db";
import { hashToken, randomToken } from "../crypto";
import { clientInfo } from "../rate-limit";

export const ADMIN_COOKIE = "__Host-admin_session";
export const CUSTOMER_COOKIE = "__Host-session";

// __Host- cookies require Secure; on http://localhost browsers reject them, so drop the prefix in dev.
const secure = process.env.NODE_ENV === "production";
export const cookieName = (name: string) => (secure ? name : name.replace("__Host-", ""));

export async function createSession(opts: { kind: "ADMIN" | "CUSTOMER"; userId?: string; customerId?: string; ttlHours: number; twoFactorOk?: boolean }) {
  const token = randomToken();
  const info = await clientInfo();
  const expiresAt = new Date(Date.now() + opts.ttlHours * 3600_000);
  await db.session.create({
    data: {
      tokenHash: hashToken(token),
      kind: opts.kind,
      userId: opts.userId,
      customerId: opts.customerId,
      twoFactorOk: opts.twoFactorOk ?? false,
      ip: info.ip,
      userAgent: info.userAgent,
      expiresAt,
    },
  });
  const jar = await cookies();
  jar.set(cookieName(opts.kind === "ADMIN" ? ADMIN_COOKIE : CUSTOMER_COOKIE), token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
  return token;
}

async function readSession(kind: "ADMIN" | "CUSTOMER") {
  const jar = await cookies();
  const token = jar.get(cookieName(kind === "ADMIN" ? ADMIN_COOKIE : CUSTOMER_COOKIE))?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include:
      kind === "ADMIN"
        ? { user: { include: { role: { include: { permissions: { include: { permission: true } } } } } } }
        : { customer: true },
  });
  if (!session || session.kind !== kind || session.expiresAt < new Date()) return null;
  // Touch at most every 5 minutes to avoid a write per request.
  if (Date.now() - session.lastSeenAt.getTime() > 5 * 60_000) {
    await db.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => undefined);
  }
  return session;
}

export interface AdminPrincipal {
  sessionId: string;
  id: string;
  name: string;
  email: string;
  roleKey: string;
  roleName: string;
  permissions: string[];
  twoFactorOk: boolean;
  totpEnabled: boolean;
}

export const getAdminSession = cache(async (): Promise<AdminPrincipal | null> => {
  const s = await readSession("ADMIN");
  const u = s && "user" in s ? s.user : null;
  if (!s || !u || !u.isActive) return null;
  return {
    sessionId: s.id,
    id: u.id,
    name: u.name,
    email: u.email,
    roleKey: u.role.key,
    roleName: u.role.name,
    permissions: u.role.permissions.map((rp) => rp.permission.key),
    twoFactorOk: s.twoFactorOk,
    totpEnabled: u.totpEnabled,
  };
});

export const getCustomerSession = cache(async () => {
  const s = await readSession("CUSTOMER");
  if (!s || !("customer" in s) || !s.customer || s.customer.isBlocked) return null;
  return { sessionId: s.id, customer: s.customer };
});

export async function destroySession(kind: "ADMIN" | "CUSTOMER") {
  const jar = await cookies();
  const name = cookieName(kind === "ADMIN" ? ADMIN_COOKIE : CUSTOMER_COOKIE);
  const token = jar.get(name)?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  jar.delete(name);
}

export async function markTwoFactorOk(sessionId: string) {
  await db.session.update({ where: { id: sessionId }, data: { twoFactorOk: true } });
}

import "server-only";
import { db } from "../db";
import { AppError } from "../errors";
import { hashPassword, verifyPassword, burnPasswordCheck } from "./password";
import { createSession, destroySession } from "./session";
import { getSettings } from "../settings";
import { claimCart } from "../cart";
import { rateLimit, clientIp } from "../rate-limit";

/** Customer accounts are optional — checkout works as a guest by phone. */
export async function registerCustomer(input: { name: string; phone: string; email?: string; password: string }) {
  const rl = await rateLimit(`register:${await clientIp()}`, 5, 3600);
  if (!rl.ok) throw new AppError("RATE_LIMITED", "Too many attempts", 429);
  const existing = await db.customer.findUnique({ where: { phone: input.phone } });
  if (existing?.passwordHash) throw new AppError("EXISTS", "An account with this phone already exists. Please sign in.", 409);
  const passwordHash = await hashPassword(input.password);
  const customer = existing
    ? await db.customer.update({ where: { id: existing.id }, data: { passwordHash, name: input.name, email: input.email || existing.email } })
    : await db.customer.create({ data: { phone: input.phone, name: input.name, email: input.email || null, passwordHash } });
  const sec = await getSettings("security");
  await createSession({ kind: "CUSTOMER", customerId: customer.id, ttlHours: sec.customerSessionDays * 24 });
  await claimCart(customer.id);
  return customer;
}

export async function loginCustomer(phone: string, password: string) {
  const rl = await rateLimit(`clogin:${await clientIp()}`, 10, 900);
  const rlPhone = await rateLimit(`clogin:${phone}`, 8, 900);
  if (!rl.ok || !rlPhone.ok) throw new AppError("RATE_LIMITED", "Too many attempts. Try again in 15 minutes.", 429);
  const c = await db.customer.findUnique({ where: { phone } });
  if (!c?.passwordHash) {
    await burnPasswordCheck(password);
    throw new AppError("INVALID", "Incorrect phone or password.", 401);
  }
  if (c.isBlocked || !(await verifyPassword(password, c.passwordHash))) throw new AppError("INVALID", "Incorrect phone or password.", 401);
  const sec = await getSettings("security");
  await createSession({ kind: "CUSTOMER", customerId: c.id, ttlHours: sec.customerSessionDays * 24 });
  await claimCart(c.id);
  return c;
}

export const logoutCustomer = () => destroySession("CUSTOMER");

import "server-only";
import { db } from "./db";
import { clientInfo } from "./rate-limit";

/**
 * Admin activity log. Call for every admin mutation and for sensitive reads
 * (customer data accessed). `before`/`after` should contain only the fields
 * that changed — never secrets.
 */
export async function logActivity(entry: {
  userId: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
}) {
  const info = await clientInfo().catch(() => ({ ip: null, userAgent: null }));
  await db.adminActivityLog.create({
    data: {
      userId: entry.userId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      before: (entry.before ?? undefined) as object | undefined,
      after: (entry.after ?? undefined) as object | undefined,
      ip: info.ip,
      userAgent: info.userAgent,
    },
  });
}

/** Keep only changed keys: diff({price:1200,name:"a"},{price:1350,name:"a"}) → {before:{price:1200},after:{price:1350}} */
export function diff<T extends Record<string, unknown>>(before: T, after: Partial<T>) {
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  for (const k of Object.keys(after)) {
    if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) {
      b[k] = before[k];
      a[k] = after[k];
    }
  }
  return { before: b, after: a, changed: Object.keys(a).length > 0 };
}

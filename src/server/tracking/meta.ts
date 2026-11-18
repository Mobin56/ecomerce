import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "../db";
import { getSettings } from "../settings";
import { logger } from "../logger";
import { buildCapiEvent, type CapiEventInput } from "@/core/tracking";

const log = logger("meta-capi");
const GRAPH_VERSION = "v21.0";

/**
 * Send one server event to the Meta Conversions API.
 *
 * Dedup guarantees:
 *  1. Browser Pixel and CAPI share `event_id` → Meta merges them.
 *  2. `meta_event_logs` has UNIQUE(eventName, eventId). A second attempt to
 *     send an already SENT event is skipped locally — so Purchase can never be
 *     sent twice by us, whatever retries/webhooks/reloads happen.
 */
export async function sendMetaEvent(input: CapiEventInput): Promise<"SENT" | "SKIPPED" | "FAILED" | "DISABLED"> {
  const cfg = await getSettings("meta");
  if (!cfg.capiEnabled || !cfg.pixelId || !cfg.capiAccessToken) return "DISABLED";

  const event = buildCapiEvent(input);
  let logRow;
  try {
    logRow = await db.metaEventLog.create({
      data: { eventName: input.eventName, eventId: input.eventId, orderId: input.orderId, payload: event as unknown as Prisma.InputJsonValue, status: "QUEUED" },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const existing = await db.metaEventLog.findUnique({ where: { eventName_eventId: { eventName: input.eventName, eventId: input.eventId } } });
      if (!existing || existing.status === "SENT" || existing.status === "SKIPPED") return "SKIPPED";
      logRow = existing; // previously FAILED/QUEUED → retry
    } else throw e;
  }
  return deliver(logRow.id, cfg.pixelId, cfg.capiAccessToken, cfg.testEventCode);
}

async function deliver(logId: string, pixelId: string, token: string, testEventCode: string) {
  const row = await db.metaEventLog.findUniqueOrThrow({ where: { id: logId } });
  const body: Record<string, unknown> = { data: [row.payload] };
  if (testEventCode) body.test_event_code = testEventCode;
  try {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(pixelId)}/events?access_token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8_000),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const msg = (json.error as { message?: string } | undefined)?.message ?? `HTTP ${res.status}`;
      await db.metaEventLog.update({ where: { id: logId }, data: { status: "FAILED", attempts: { increment: 1 }, error: msg.slice(0, 500), response: json as Prisma.InputJsonValue } });
      log.warn("CAPI event failed", { eventName: row.eventName, eventId: row.eventId, error: msg });
      return "FAILED" as const;
    }
    await db.metaEventLog.update({ where: { id: logId }, data: { status: "SENT", attempts: { increment: 1 }, sentAt: new Date(), error: null, response: json as Prisma.InputJsonValue } });
    return "SENT" as const;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.metaEventLog.update({ where: { id: logId }, data: { status: "FAILED", attempts: { increment: 1 }, error: msg.slice(0, 500) } });
    log.warn("CAPI network error", { eventName: row.eventName, error: msg });
    return "FAILED" as const;
  }
}

/** Retry FAILED events (cron / admin button). Max 5 attempts, within Meta's 7-day window. */
export async function retryFailedMetaEvents(limit = 50) {
  const cfg = await getSettings("meta");
  if (!cfg.capiEnabled || !cfg.pixelId || !cfg.capiAccessToken) return { retried: 0 };
  const rows = await db.metaEventLog.findMany({
    where: { status: "FAILED", attempts: { lt: 5 }, createdAt: { gt: new Date(Date.now() - 6 * 86_400_000) } },
    take: limit,
    orderBy: { createdAt: "asc" },
  });
  for (const r of rows) await deliver(r.id, cfg.pixelId, cfg.capiAccessToken, cfg.testEventCode);
  return { retried: rows.length };
}

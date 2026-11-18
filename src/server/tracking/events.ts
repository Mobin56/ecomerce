import "server-only";
import { Prisma } from "@prisma/client";
import { cookies } from "next/headers";
import { db } from "../db";
import { decodeAttribution } from "@/core/attribution";
import { VISITOR_COOKIE } from "../cart";
import { getSettings } from "../settings";
import { logger } from "../logger";

export const ATTRIBUTION_COOKIE = "attr";
const log = logger("tracking");

/**
 * First-party funnel event (page_view, view_item, add_to_cart, begin_checkout,
 * purchase...). This is the source of truth for dashboard funnel numbers;
 * Meta/GA are for ad optimisation. Idempotent on (name, eventId).
 */
export async function recordFunnelEvent(e: { name: string; eventId: string; productId?: string; orderId?: string; value?: number; path?: string; visitorId?: string }) {
  const jar = await cookies();
  const attr = decodeAttribution(jar.get(ATTRIBUTION_COOKIE)?.value);
  const visitorId = e.visitorId ?? jar.get(VISITOR_COOKIE)?.value ?? "unknown";
  try {
    await db.marketingEvent.create({
      data: {
        name: e.name,
        eventId: e.eventId,
        visitorId,
        productId: e.productId,
        orderId: e.orderId,
        value: e.value,
        path: e.path?.slice(0, 300),
        utmSource: attr?.last.utmSource,
        utmCampaign: attr?.last.utmCampaign,
        channel: attr?.last.channel ?? "direct",
      },
    });
    if (e.name === "view_item" && e.productId) {
      await db.product.update({ where: { id: e.productId }, data: { viewCount: { increment: 1 } } }).catch(() => undefined);
    }
  } catch (err) {
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) log.warn("funnel event failed", { error: err, name: e.name });
  }
}

/**
 * GA4 Measurement Protocol (server-side) — used for `purchase` confirmed by
 * payment webhooks and for `refund`, which have no browser page to fire from.
 * Needs the GA client id (from the _ga cookie, stored with the order).
 */
export async function sendGa4ServerEvent(clientId: string | null, events: { name: string; params: Record<string, unknown> }[]) {
  const g = await getSettings("google");
  if (!g.ga4MeasurementId || !g.ga4ApiSecret) return;
  try {
    await fetch(`https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(g.ga4MeasurementId)}&api_secret=${encodeURIComponent(g.ga4ApiSecret)}`, {
      method: "POST",
      body: JSON.stringify({ client_id: clientId ?? `server.${Date.now()}`, events }),
      signal: AbortSignal.timeout(5_000),
    });
  } catch (e) {
    log.warn("GA4 MP failed", { error: e });
  }
}

export async function readTrackingCookies() {
  const jar = await cookies();
  const ga = jar.get("_ga")?.value; // GA1.1.123456789.1700000000
  return {
    fbp: jar.get("_fbp")?.value ?? null,
    fbc: jar.get("_fbc")?.value ?? null,
    gaClientId: ga ? ga.split(".").slice(-2).join(".") : null,
    visitorId: jar.get(VISITOR_COOKIE)?.value ?? null,
    attribution: decodeAttribution(jar.get(ATTRIBUTION_COOKIE)?.value),
  };
}

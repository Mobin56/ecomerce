import { NextResponse } from "next/server";
import { handle } from "@/server/errors";
import { trackEventSchema } from "@/validation";
import { sendMetaEvent } from "@/server/tracking/meta";
import { recordFunnelEvent, readTrackingCookies } from "@/server/tracking/events";
import { getCustomerSession } from "@/server/auth/session";
import { clientInfo, rateLimit } from "@/server/rate-limit";
import { META_TO_FUNNEL } from "@/core/tracking";

export const dynamic = "force-dynamic";

/**
 * Browser events → (1) first-party funnel table, (2) Meta CAPI with the same
 * event_id the Pixel used (dedup). Purchase is NOT accepted here; it is sent
 * only by the server when the order is placed / payment verified.
 */
export const POST = handle(async (req: Request) => {
  const info = await clientInfo();
  const rl = await rateLimit(`track:${info.ip}`, 240, 60);
  if (!rl.ok) return NextResponse.json({ ok: false }, { status: 429 });
  if (/bot|crawl|spider|slurp|headless|lighthouse/i.test(info.userAgent)) return NextResponse.json({ ok: true, skipped: "bot" });

  const e = trackEventSchema.parse(await req.json());
  const funnelName = META_TO_FUNNEL[e.event];
  const path = new URL(e.url).pathname;
  if (funnelName) await recordFunnelEvent({ name: funnelName, eventId: e.eventId, productId: e.productId, value: e.value, path });

  const [cookies, session] = await Promise.all([readTrackingCookies(), getCustomerSession()]);
  const c = session?.customer;
  void sendMetaEvent({
    eventName: e.event,
    eventId: e.eventId,
    sourceUrl: e.url,
    items: e.items,
    value: e.value,
    searchString: e.searchString,
    user: { email: c?.email, phone: c?.phone, name: c?.name, externalId: c?.id ?? cookies.visitorId, ip: info.ip, userAgent: info.userAgent, fbp: cookies.fbp, fbc: cookies.fbc },
  }).catch(() => undefined);
  return NextResponse.json({ ok: true });
});

import { NextResponse } from "next/server";
import { confirmPayment } from "@/server/orders";
import { siteUrl } from "@/server/env";
import { logger } from "@/server/logger";

export const dynamic = "force-dynamic";
const log = logger("payment-callback");

/**
 * Browser returns here from the gateway (GET or POST form). We verify
 * server-to-server, then redirect to the result page. The redirect itself
 * never marks anything paid.
 */
async function run(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const url = new URL(req.url);
  const query = Object.fromEntries(url.searchParams);
  let form: Record<string, string> = {};
  if (req.method === "POST") {
    const ct = req.headers.get("content-type") ?? "";
    if (ct.includes("form")) form = Object.fromEntries([...(await req.formData()).entries()].map(([k, v]) => [k, String(v)]));
    else if (ct.includes("json")) form = (await req.json().catch(() => ({}))) as Record<string, string>;
  }
  const all = { ...query, ...form };
  const orderId = all.orderId ?? all.tran_id ?? "";
  if (all.result === "cancel" || all.result === "fail") {
    if (provider !== "bkash") return NextResponse.redirect(`${siteUrl()}/checkout/payment-failed?order=${encodeURIComponent(orderId)}&reason=${all.result}`, 303);
  }
  try {
    const r = await confirmPayment(provider, all, "callback");
    const ok = r.status === "PAID" || r.status === "SUCCEEDED";
    return NextResponse.redirect(ok ? `${siteUrl()}/checkout/success?order=${r.orderId}` : `${siteUrl()}/checkout/payment-failed?order=${r.orderId}&reason=${String(r.status).toLowerCase()}`, 303);
  } catch (e) {
    log.error("callback failed", { provider, error: e });
    return NextResponse.redirect(`${siteUrl()}/checkout/payment-failed?order=${encodeURIComponent(orderId)}&reason=error`, 303);
  }
}
export const GET = run;
export const POST = run;

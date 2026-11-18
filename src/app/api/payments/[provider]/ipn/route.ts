import { NextResponse } from "next/server";
import { confirmPayment } from "@/server/orders";
import { logger } from "@/server/logger";

export const dynamic = "force-dynamic";
const log = logger("payment-ipn");

/** Server-to-server notification. Idempotent: replays are detected via webhook_events. */
export async function POST(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const ct = req.headers.get("content-type") ?? "";
  const body = ct.includes("json")
    ? ((await req.json().catch(() => ({}))) as Record<string, string>)
    : Object.fromEntries([...(await req.formData()).entries()].map(([k, v]) => [k, String(v)]));
  try {
    const r = await confirmPayment(provider, body, "ipn");
    return NextResponse.json({ received: true, status: r.status });
  } catch (e) {
    log.error("ipn failed", { provider, error: e });
    // 500 makes the gateway retry later.
    return NextResponse.json({ received: false }, { status: 500 });
  }
}

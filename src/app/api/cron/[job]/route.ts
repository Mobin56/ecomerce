import { NextResponse } from "next/server";
import { safeEqual } from "@/server/crypto";
import { processAbandonedCarts } from "@/server/abandoned-carts";
import { syncOpenShipments } from "@/server/shipments";
import { retryFailedMetaEvents } from "@/server/tracking/meta";
import { db } from "@/server/db";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Scheduled jobs. Call with `Authorization: Bearer $CRON_SECRET`
 * (Vercel Cron, GitHub Actions, or system cron + curl on a VPS).
 *   abandoned-carts  every 15 min
 *   courier-sync     every 30 min
 *   meta-retry       hourly
 *   cleanup          daily
 */
export async function GET(req: Request, { params }: { params: Promise<{ job: string }> }) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { job } = await params;
  switch (job) {
    case "abandoned-carts":
      return NextResponse.json(await processAbandonedCarts());
    case "courier-sync":
      return NextResponse.json(await syncOpenShipments());
    case "meta-retry":
      return NextResponse.json(await retryFailedMetaEvents());
    case "cleanup": {
      const [sessions, carts] = await Promise.all([
        db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } }),
        db.cart.deleteMany({ where: { status: { in: ["ACTIVE", "ABANDONED"] }, items: { none: {} }, updatedAt: { lt: new Date(Date.now() - 30 * 86_400_000) } } }),
      ]);
      return NextResponse.json({ sessions: sessions.count, emptyCarts: carts.count });
    }
    default:
      return NextResponse.json({ error: "unknown job" }, { status: 404 });
  }
}

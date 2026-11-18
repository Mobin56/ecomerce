import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, AppError } from "@/server/errors";
import { db } from "@/server/db";
import { rateLimit, clientIp } from "@/server/rate-limit";

export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const ip = await clientIp();
  const rl = await rateLimit(`report:${ip}`, 10, 3600);
  if (!rl.ok) throw new AppError("RATE_LIMITED", "Too many reports", 429);
  const { id } = await params;
  const { reason } = z.object({ reason: z.string().trim().min(3).max(300) }).parse(await req.json());
  await db.$transaction([db.reviewReport.create({ data: { reviewId: id, reason, ip } }), db.review.update({ where: { id }, data: { reportCount: { increment: 1 } } })]);
  return NextResponse.json({ ok: true });
});

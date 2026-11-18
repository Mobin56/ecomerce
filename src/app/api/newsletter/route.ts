import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, AppError } from "@/server/errors";
import { db } from "@/server/db";
import { rateLimit, clientIp } from "@/server/rate-limit";

export const POST = handle(async (req: Request) => {
  const rl = await rateLimit(`nl:${await clientIp()}`, 5, 3600);
  if (!rl.ok) throw new AppError("RATE_LIMITED", "Too many requests", 429);
  const { email } = z.object({ email: z.string().trim().toLowerCase().email() }).parse(await req.json());
  await db.newsletterSubscriber.upsert({ where: { email }, create: { email, source: "footer" }, update: {} });
  return NextResponse.json({ ok: true, message: "You're subscribed!" });
});

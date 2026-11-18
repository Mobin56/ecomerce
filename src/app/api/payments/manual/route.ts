import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, AppError } from "@/server/errors";
import { submitManualTrxId } from "@/server/orders";
import { rateLimit, clientIp } from "@/server/rate-limit";

const schema = z.object({ orderId: z.string().cuid(), phone: z.string().max(20), trxId: z.string().trim().regex(/^[A-Za-z0-9]{6,30}$/, "Enter a valid Transaction ID") });

export const POST = handle(async (req: Request) => {
  const rl = await rateLimit(`trx:${await clientIp()}`, 10, 600);
  if (!rl.ok) throw new AppError("RATE_LIMITED", "Too many attempts", 429);
  const b = schema.parse(await req.json());
  await submitManualTrxId(b.orderId, b.phone, b.trxId);
  return NextResponse.json({ ok: true, message: "Thanks! We'll verify your payment shortly." });
});

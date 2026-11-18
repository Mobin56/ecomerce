import { NextResponse } from "next/server";
import { handle, AppError } from "@/server/errors";
import { db } from "@/server/db";
import { orderLookupSchema } from "@/validation";
import { rateLimit, clientIp } from "@/server/rate-limit";

/** Public order tracking: requires order number AND the phone used (no enumeration). */
export const POST = handle(async (req: Request) => {
  const rl = await rateLimit(`lookup:${await clientIp()}`, 15, 600);
  if (!rl.ok) throw new AppError("RATE_LIMITED", "Too many attempts. Try again later.", 429);
  const { orderNumber, phone } = orderLookupSchema.parse(await req.json());
  const order = await db.order.findFirst({
    where: { number: Number.parseInt(orderNumber.replace("#", ""), 10), shipPhone: phone },
    select: {
      number: true, status: true, total: true, createdAt: true, paymentMethod: true, paymentStatus: true,
      items: { select: { name: true, variantTitle: true, quantity: true, lineTotal: true } },
      history: { select: { to: true, createdAt: true }, orderBy: { createdAt: "asc" } },
      shipments: { select: { courier: true, trackingId: true, status: true }, orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!order) throw new AppError("NOT_FOUND", "No order found with that number and phone.", 404);
  return NextResponse.json(order);
});

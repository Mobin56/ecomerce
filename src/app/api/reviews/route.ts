import { NextResponse } from "next/server";
import { handle, AppError } from "@/server/errors";
import { db } from "@/server/db";
import { reviewSchema } from "@/validation";
import { rateLimit, clientIp } from "@/server/rate-limit";
import { getCustomerSession } from "@/server/auth/session";

/** Reviews are held for moderation. "Verified purchase" when the phone has a delivered order containing the product. */
export const POST = handle(async (req: Request) => {
  const rl = await rateLimit(`review:${await clientIp()}`, 5, 3600);
  if (!rl.ok) throw new AppError("RATE_LIMITED", "Too many reviews. Please try later.", 429);
  const r = reviewSchema.parse(await req.json());
  const session = await getCustomerSession();
  const phone = session?.customer.phone ?? r.phone;
  const order = phone
    ? await db.order.findFirst({ where: { shipPhone: phone, status: "DELIVERED", items: { some: { productId: r.productId } } }, select: { id: true, customerId: true } })
    : null;
  await db.review.create({
    data: {
      productId: r.productId,
      rating: r.rating,
      title: r.title || null,
      body: r.body,
      authorName: r.name,
      images: r.images,
      customerId: session?.customer.id ?? order?.customerId ?? null,
      orderId: order?.id ?? null,
      verifiedPurchase: Boolean(order),
    },
  });
  return NextResponse.json({ ok: true, message: "Thanks! Your review will appear after moderation." }, { status: 201 });
});

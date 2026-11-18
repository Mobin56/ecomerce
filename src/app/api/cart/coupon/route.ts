import { NextResponse } from "next/server";
import { handle, AppError } from "@/server/errors";
import { getCartView, setCartCoupon } from "@/server/cart";
import { couponSchema } from "@/validation";
import { rateLimit, clientIp } from "@/server/rate-limit";

export const POST = handle(async (req: Request) => {
  const rl = await rateLimit(`coupon:${await clientIp()}`, 20, 600);
  if (!rl.ok) throw new AppError("RATE_LIMITED", "Too many coupon attempts. Try again later.", 429);
  const { code } = couponSchema.parse(await req.json());
  await setCartCoupon(code);
  const view = await getCartView();
  if (code && view.totals?.couponError) {
    await setCartCoupon(null);
    return NextResponse.json({ ...(await getCartView()), couponMessage: view.totals.couponError }, { status: 422 });
  }
  return NextResponse.json(view);
});

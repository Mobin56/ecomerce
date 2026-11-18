import { NextResponse } from "next/server";
import { handle } from "@/server/errors";
import { addToCart, getCartView, updateCartItem } from "@/server/cart";
import { cartAddSchema, cartUpdateSchema } from "@/validation";
import { rateLimit, clientIp } from "@/server/rate-limit";
import { AppError } from "@/server/errors";

export const dynamic = "force-dynamic";

async function limit() {
  const rl = await rateLimit(`cart:${await clientIp()}`, 120, 60);
  if (!rl.ok) throw new AppError("RATE_LIMITED", "Too many requests", 429);
}

export const GET = handle(async (req: Request) => {
  const district = new URL(req.url).searchParams.get("district");
  return NextResponse.json(await getCartView(district), { headers: { "Cache-Control": "no-store" } });
});

export const POST = handle(async (req: Request) => {
  await limit();
  const body = cartAddSchema.parse(await req.json());
  await addToCart(body.variantId, body.quantity);
  return NextResponse.json(await getCartView());
});

export const PATCH = handle(async (req: Request) => {
  await limit();
  const body = cartUpdateSchema.parse(await req.json());
  await updateCartItem(body.variantId, body.quantity, body.newVariantId);
  return NextResponse.json(await getCartView());
});

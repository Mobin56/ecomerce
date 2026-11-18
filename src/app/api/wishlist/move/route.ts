import { NextResponse } from "next/server";
import { z } from "zod";
import { handle } from "@/server/errors";
import { moveWishlistItemToCart } from "@/server/wishlist";
import { getCartView } from "@/server/cart";

export const POST = handle(async (req: Request) => {
  const { productId } = z.object({ productId: z.string().cuid() }).parse(await req.json());
  await moveWishlistItemToCart(productId);
  return NextResponse.json(await getCartView());
});

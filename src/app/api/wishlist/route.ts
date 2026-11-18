import { NextResponse } from "next/server";
import { z } from "zod";
import { handle } from "@/server/errors";
import { getWishlistIds, toggleWishlist } from "@/server/wishlist";

export const dynamic = "force-dynamic";
export const GET = handle(async () => NextResponse.json({ ids: await getWishlistIds() }));
export const POST = handle(async (req: Request) => {
  const { productId } = z.object({ productId: z.string().cuid() }).parse(await req.json());
  return NextResponse.json(await toggleWishlist(productId));
});

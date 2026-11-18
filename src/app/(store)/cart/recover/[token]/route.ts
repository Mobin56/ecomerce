import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { CART_COOKIE } from "@/server/cart";
import { siteUrl } from "@/server/env";

/** Abandoned-cart reminder link: restores the cart cookie, keeps UTM params for attribution. */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const url = new URL(req.url);
  const cart = await db.cart.findUnique({ where: { token } });
  const target = new URL(`${siteUrl()}/checkout`);
  url.searchParams.forEach((v, k) => target.searchParams.set(k, v));
  const res = NextResponse.redirect(cart && cart.status !== "CONVERTED" ? target : new URL(`${siteUrl()}/`), 303);
  if (cart && cart.status !== "CONVERTED") {
    await db.cart.update({ where: { id: cart.id }, data: { status: "RECOVERED", recoveredAt: new Date(), lastActivityAt: new Date() } });
    res.cookies.set(CART_COOKIE, cart.token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 30 });
  }
  return res;
}

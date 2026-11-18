import "server-only";
import { cookies } from "next/headers";
import { db } from "./db";
import { randomToken } from "./crypto";
import { getCustomerSession } from "./auth/session";
import { addToCart } from "./cart";
import { AppError } from "./errors";

const WL_COOKIE = "wl";

async function getWishlist(create: boolean) {
  const session = await getCustomerSession();
  if (session) {
    const existing = await db.wishlist.findUnique({ where: { customerId: session.customer.id } });
    if (existing || !create) return existing;
    return db.wishlist.create({ data: { customerId: session.customer.id } });
  }
  const jar = await cookies();
  const token = jar.get(WL_COOKIE)?.value;
  if (token) {
    const wl = await db.wishlist.findUnique({ where: { token } });
    if (wl) return wl;
  }
  if (!create) return null;
  const wl = await db.wishlist.create({ data: { token: randomToken(18) } });
  jar.set(WL_COOKIE, wl.token!, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 180 });
  return wl;
}

export async function getWishlistIds(): Promise<string[]> {
  const wl = await getWishlist(false);
  if (!wl) return [];
  return (await db.wishlistItem.findMany({ where: { wishlistId: wl.id }, select: { productId: true }, orderBy: { createdAt: "desc" } })).map((i) => i.productId);
}

export async function toggleWishlist(productId: string) {
  const wl = (await getWishlist(true))!;
  const existing = await db.wishlistItem.findUnique({ where: { wishlistId_productId: { wishlistId: wl.id, productId } } });
  if (existing) {
    await db.wishlistItem.delete({ where: { id: existing.id } });
    return { added: false };
  }
  await db.wishlistItem.create({ data: { wishlistId: wl.id, productId } });
  return { added: true };
}

export async function moveWishlistItemToCart(productId: string) {
  const v = await db.productVariant.findFirst({ where: { productId, isActive: true }, orderBy: [{ isDefault: "desc" }, { position: "asc" }] });
  if (!v) throw new AppError("UNAVAILABLE", "This product is unavailable.", 404);
  await addToCart(v.id, 1);
  const wl = await getWishlist(false);
  if (wl) await db.wishlistItem.deleteMany({ where: { wishlistId: wl.id, productId } });
}

/** Admin analytics: most wishlisted products. */
export async function wishlistAnalytics(take = 20) {
  return db.$queryRaw<{ productId: string; name: string; count: number }[]>`
    SELECT wi."productId", MAX(p.name) AS name, COUNT(*)::int AS count FROM wishlist_items wi JOIN products p ON p.id = wi."productId"
    GROUP BY 1 ORDER BY 3 DESC LIMIT ${take}`;
}

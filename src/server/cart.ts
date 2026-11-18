import "server-only";
import { cookies } from "next/headers";
import { db, type Tx } from "./db";
import { randomToken } from "./crypto";
import { AppError } from "./errors";
import { calculateTotals, effectivePrice, MAX_QTY_PER_LINE, type PricedLine, type ShippingQuote } from "@/core/pricing";
import { zoneForDistrict, deliveryEstimate } from "@/core/locations";
import { normalizeBDPhone } from "@/core/phone";
import { loadCouponRule, customerCouponContext } from "./coupons";
import { getSettings } from "./settings";
import { getCustomerSession } from "./auth/session";

export const CART_COOKIE = "cart";
export const VISITOR_COOKIE = "vid";

const cartInclude = {
  items: {
    orderBy: { createdAt: "asc" as const },
    include: {
      variant: {
        include: {
          image: true,
          product: {
            select: {
              id: true, name: true, slug: true, regularPrice: true, salePrice: true, costPrice: true, status: true,
              categoryId: true, subcategoryId: true, weightGrams: true, optionNames: true,
              brand: { select: { name: true } }, category: { select: { name: true } },
              images: { take: 1, orderBy: { position: "asc" as const }, select: { url: true, alt: true } },
            },
          },
        },
      },
    },
  },
};

async function readToken(): Promise<string | undefined> {
  return (await cookies()).get(CART_COOKIE)?.value;
}

export async function getCartRecord(tx: Tx | typeof db = db) {
  const token = await readToken();
  if (!token) return null;
  return tx.cart.findUnique({ where: { token }, include: cartInclude });
}

async function getOrCreateCart() {
  const jar = await cookies();
  const token = jar.get(CART_COOKIE)?.value;
  if (token) {
    const existing = await db.cart.findUnique({ where: { token } });
    if (existing && existing.status !== "CONVERTED") return existing;
  }
  const session = await getCustomerSession();
  const cart = await db.cart.create({
    data: { token: randomToken(24), customerId: session?.customer.id, visitorId: jar.get(VISITOR_COOKIE)?.value },
  });
  jar.set(CART_COOKIE, cart.token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 30 });
  return cart;
}

async function availableFor(variantId: string) {
  const v = await db.productVariant.findUnique({ where: { id: variantId }, include: { product: { select: { status: true } } } });
  if (!v || !v.isActive || !["ACTIVE", "OUT_OF_STOCK"].includes(v.product.status)) throw new AppError("UNAVAILABLE", "This product is no longer available.", 404);
  return v.stock - v.reserved;
}

export async function addToCart(variantId: string, quantity: number) {
  const cart = await getOrCreateCart();
  const available = await availableFor(variantId);
  const existing = await db.cartItem.findUnique({ where: { cartId_variantId: { cartId: cart.id, variantId } } });
  const next = Math.min((existing?.quantity ?? 0) + quantity, MAX_QTY_PER_LINE);
  if (available <= 0) throw new AppError("OUT_OF_STOCK", "Sorry, this item is out of stock.", 409);
  if (next > available) throw new AppError("INSUFFICIENT_STOCK", `Only ${available} left in stock.`, 409);
  await db.$transaction([
    db.cartItem.upsert({ where: { cartId_variantId: { cartId: cart.id, variantId } }, create: { cartId: cart.id, variantId, quantity: next }, update: { quantity: next } }),
    db.cart.update({ where: { id: cart.id }, data: { lastActivityAt: new Date(), status: "ACTIVE", abandonedAt: null } }),
  ]);
}

export async function updateCartItem(variantId: string, quantity: number, newVariantId?: string) {
  const cart = await getOrCreateCart();
  if (quantity <= 0) {
    await db.cartItem.deleteMany({ where: { cartId: cart.id, variantId } });
  } else if (newVariantId && newVariantId !== variantId) {
    const available = await availableFor(newVariantId);
    if (quantity > available) throw new AppError("INSUFFICIENT_STOCK", `Only ${Math.max(available, 0)} left in stock.`, 409);
    await db.$transaction([
      db.cartItem.deleteMany({ where: { cartId: cart.id, variantId } }),
      db.cartItem.upsert({ where: { cartId_variantId: { cartId: cart.id, variantId: newVariantId } }, create: { cartId: cart.id, variantId: newVariantId, quantity }, update: { quantity } }),
    ]);
  } else {
    const available = await availableFor(variantId);
    if (quantity > available) throw new AppError("INSUFFICIENT_STOCK", `Only ${Math.max(available, 0)} left in stock.`, 409);
    await db.cartItem.update({ where: { cartId_variantId: { cartId: cart.id, variantId } }, data: { quantity: Math.min(quantity, MAX_QTY_PER_LINE) } });
  }
  await db.cart.update({ where: { id: cart.id }, data: { lastActivityAt: new Date() } });
}

export async function setCartCoupon(code: string | null) {
  const cart = await getOrCreateCart();
  await db.cart.update({ where: { id: cart.id }, data: { couponCode: code ? code.trim().toUpperCase() : null, lastActivityAt: new Date() } });
}

type CartRecord = NonNullable<Awaited<ReturnType<typeof getCartRecord>>>;

export function toPricedLines(cart: CartRecord): PricedLine[] {
  return cart.items.map((i) => {
    const p = i.variant.product;
    const { price } = effectivePrice({ productRegular: p.regularPrice, productSale: p.salePrice, variantPrice: i.variant.price, variantSale: i.variant.salePrice });
    const sellable = i.variant.isActive && ["ACTIVE", "OUT_OF_STOCK"].includes(p.status);
    return {
      variantId: i.variantId,
      productId: p.id,
      categoryIds: [p.categoryId, p.subcategoryId].filter((x): x is string => Boolean(x)),
      name: p.name,
      unitPrice: price,
      unitCost: i.variant.costPrice ?? p.costPrice,
      quantity: i.quantity,
      available: sellable ? i.variant.stock - i.variant.reserved : 0,
    };
  });
}

export async function shippingQuoteFor(district: string | null | undefined): Promise<ShippingQuote | null> {
  const zones = await db.shippingZone.findMany();
  const zone = district ? zoneForDistrict(zones, district) : zones.filter((z) => z.isActive).sort((a, b) => a.position - b.position)[0];
  return zone ? { key: zone.key, name: zone.name, charge: zone.charge, courierCost: zone.courierCost, minDays: zone.minDays, maxDays: zone.maxDays } : null;
}

/** Price any cart server-side. Used by the cart drawer AND by order placement. */
export async function priceCart(cart: CartRecord, opts: { district?: string | null; phone?: string | null; tx?: Tx }) {
  const tx = opts.tx ?? db;
  const [shipping, shipCfg] = await Promise.all([shippingQuoteFor(opts.district), getSettings("shipping")]);
  const coupon = cart.couponCode ? await loadCouponRule(cart.couponCode, tx) : null;
  let customerId = cart.customerId;
  const phone = opts.phone ? normalizeBDPhone(opts.phone) : null;
  if (!customerId && phone) customerId = (await tx.customer.findUnique({ where: { phone }, select: { id: true } }))?.id ?? null;
  const ctx = await customerCouponContext(customerId, coupon?.id ?? null, tx);
  const totals = calculateTotals({
    lines: toPricedLines(cart),
    shipping,
    coupon,
    customerId,
    customerOrderCount: ctx.orderCount,
    customerCouponUsage: ctx.usage,
    freeShippingThreshold: shipCfg.freeShippingThreshold,
  });
  const estimate = shipping ? deliveryEstimate(shipping.minDays, shipping.maxDays) : null;
  return { totals, shipping, estimate, customerId };
}

/** Browser-safe cart view model. */
export async function getCartView(district?: string | null) {
  const cart = await getCartRecord();
  if (!cart || cart.items.length === 0) return { items: [], totals: null, shipping: null, estimate: null, couponCode: null };
  const { totals, shipping, estimate } = await priceCart(cart, { district });
  return {
    couponCode: cart.couponCode,
    items: cart.items.map((i, idx) => {
      const p = i.variant.product;
      const line = totals.lines[idx]!;
      const { compareAt } = effectivePrice({ productRegular: p.regularPrice, productSale: p.salePrice, variantPrice: i.variant.price, variantSale: i.variant.salePrice });
      return {
        variantId: i.variantId,
        productId: p.id,
        slug: p.slug,
        name: p.name,
        variantTitle: i.variant.title === "Default" ? null : i.variant.title,
        options: i.variant.options as Record<string, string>,
        image: i.variant.image?.url ?? p.images[0]?.url ?? null,
        unitPrice: line.unitPrice,
        compareAt,
        quantity: i.quantity,
        lineTotal: line.lineTotal,
        available: Math.max(i.variant.stock - i.variant.reserved, 0),
        brand: p.brand?.name ?? null,
        category: p.category?.name ?? null,
      };
    }),
    totals: {
      subtotal: totals.subtotal,
      discount: totals.discount,
      shippingFee: totals.shippingFee,
      total: totals.total,
      itemCount: totals.itemCount,
      freeShipping: totals.freeShipping,
      freeShippingRemaining: totals.freeShippingRemaining,
      couponError: totals.couponError?.message ?? null,
      stockErrors: totals.stockErrors,
    },
    shipping: shipping ? { name: shipping.name, charge: shipping.charge } : null,
    estimate: estimate ? { from: estimate.from.toISOString(), to: estimate.to.toISOString() } : null,
  };
}
export type CartView = Awaited<ReturnType<typeof getCartView>>;

/** Attach a guest cart to a customer after login, merging quantities. */
export async function claimCart(customerId: string) {
  const cart = await getCartRecord();
  if (cart && !cart.customerId) await db.cart.update({ where: { id: cart.id }, data: { customerId } });
}

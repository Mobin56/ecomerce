import { allocate } from "./money.ts";
import { evaluateCoupon, type CouponRule, type CouponError } from "./coupons.ts";

/**
 * Server-side order total calculation.
 *
 *   Σ(price × qty) + shipping − valid discount = total
 *
 * Inputs come from the DATABASE (variant prices, zone charges, coupon rules),
 * never from the client. The client only sends variant ids + quantities.
 */

export interface PricedLine {
  variantId: string;
  productId: string;
  categoryIds: string[];
  name: string;
  /** Effective unit price (sale price if active), poisha */
  unitPrice: number;
  unitCost: number;
  quantity: number;
  /** Units available to sell (stock − reserved) */
  available: number;
}

export interface ShippingQuote {
  key: string;
  name: string;
  charge: number;
  courierCost: number;
  minDays: number;
  maxDays: number;
}

export interface PricingInput {
  lines: PricedLine[];
  shipping: ShippingQuote | null;
  coupon: CouponRule | null;
  customerId: string | null;
  customerOrderCount: number;
  customerCouponUsage: number;
  /** Free delivery when subtotal after discount ≥ threshold. null = disabled */
  freeShippingThreshold: number | null;
  now?: Date;
}

export interface LineTotal {
  variantId: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  lineTotal: number;
  discount: number;
}

export interface PricingResult {
  lines: LineTotal[];
  subtotal: number;
  discount: number;
  shippingFee: number;
  total: number;
  itemCount: number;
  freeShipping: boolean;
  /** Amount left to unlock free delivery, null if not applicable */
  freeShippingRemaining: number | null;
  coupon: { code: string; id: string } | null;
  couponError: { code: CouponError; message: string } | null;
  stockErrors: { variantId: string; name: string; available: number; requested: number }[];
}

export const MAX_QTY_PER_LINE = 50;

export function calculateTotals(input: PricingInput): PricingResult {
  const now = input.now ?? new Date();
  const stockErrors: PricingResult["stockErrors"] = [];

  const lines = input.lines.map((l) => {
    if (!Number.isInteger(l.quantity) || l.quantity < 1 || l.quantity > MAX_QTY_PER_LINE) {
      throw new Error(`Invalid quantity for ${l.variantId}`);
    }
    if (!Number.isInteger(l.unitPrice) || l.unitPrice < 0) throw new Error(`Invalid price for ${l.variantId}`);
    if (l.quantity > l.available) {
      stockErrors.push({ variantId: l.variantId, name: l.name, available: Math.max(l.available, 0), requested: l.quantity });
    }
    return { ...l, lineTotal: l.unitPrice * l.quantity };
  });

  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  const itemCount = lines.reduce((s, l) => s + l.quantity, 0);

  let discount = 0;
  let couponFreeShipping = false;
  let coupon: PricingResult["coupon"] = null;
  let couponError: PricingResult["couponError"] = null;

  if (input.coupon) {
    const res = evaluateCoupon(input.coupon, {
      lines: lines.map((l) => ({ productId: l.productId, categoryIds: l.categoryIds, lineTotal: l.lineTotal })),
      subtotal,
      customerId: input.customerId,
      customerOrderCount: input.customerOrderCount,
      customerUsageCount: input.customerCouponUsage,
      now,
    });
    if (res.ok) {
      discount = res.discount;
      couponFreeShipping = res.freeShipping;
      coupon = { code: input.coupon.code, id: input.coupon.id };
    } else {
      couponError = { code: res.error, message: res.message };
    }
  }

  const afterDiscount = subtotal - discount;
  const threshold = input.freeShippingThreshold;
  const thresholdMet = threshold !== null && afterDiscount >= threshold;
  const freeShipping = couponFreeShipping || thresholdMet;
  const shippingFee = input.shipping && !freeShipping ? input.shipping.charge : 0;

  const freeShippingRemaining =
    threshold !== null && !freeShipping && subtotal > 0 ? Math.max(threshold - afterDiscount, 0) : null;

  // Allocate the discount across lines (for per-product profit reporting).
  const lineDiscounts = allocate(discount, lines.map((l) => l.lineTotal));

  return {
    lines: lines.map((l, i) => ({
      variantId: l.variantId,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      unitCost: l.unitCost,
      lineTotal: l.lineTotal,
      discount: lineDiscounts[i] ?? 0,
    })),
    subtotal,
    discount,
    shippingFee,
    total: afterDiscount + shippingFee,
    itemCount,
    freeShipping,
    freeShippingRemaining,
    coupon,
    couponError,
    stockErrors,
  };
}

/** Effective unit price for a variant: variant overrides → product prices. */
export function effectivePrice(p: {
  productRegular: number;
  productSale: number | null;
  variantPrice: number | null;
  variantSale: number | null;
}): { price: number; compareAt: number | null } {
  const regular = p.variantPrice ?? p.productRegular;
  const sale = p.variantSale ?? p.productSale;
  if (sale !== null && sale > 0 && sale < regular) return { price: sale, compareAt: regular };
  return { price: regular, compareAt: null };
}

export function discountPercent(price: number, compareAt: number | null): number {
  if (!compareAt || compareAt <= price) return 0;
  return Math.round(((compareAt - price) / compareAt) * 100);
}

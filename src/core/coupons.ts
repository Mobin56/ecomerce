import { percentOf } from "./money.ts";

export type CouponType = "PERCENTAGE" | "FIXED" | "FREE_SHIPPING";

export interface CouponRule {
  id: string;
  code: string;
  type: CouponType;
  /** Percent (0-100) for PERCENTAGE, poisha for FIXED. Ignored for FREE_SHIPPING. */
  value: number;
  minOrder: number;
  maxDiscount: number | null;
  productIds: string[];
  categoryIds: string[];
  firstOrderOnly: boolean;
  /** Empty = any customer. */
  customerIds: string[];
  usageLimit: number | null;
  perCustomerLimit: number | null;
  usedCount: number;
  startsAt: Date | null;
  expiresAt: Date | null;
  isActive: boolean;
}

export interface CouponLine {
  productId: string;
  categoryIds: string[];
  /** unit price × quantity, poisha */
  lineTotal: number;
}

export interface CouponContext {
  lines: CouponLine[];
  subtotal: number;
  customerId: string | null;
  /** Number of previous non-cancelled orders by this customer (by phone). */
  customerOrderCount: number;
  /** How many times this customer already used this coupon. */
  customerUsageCount: number;
  now: Date;
}

export type CouponError =
  | "INACTIVE"
  | "NOT_STARTED"
  | "EXPIRED"
  | "USAGE_LIMIT_REACHED"
  | "CUSTOMER_LIMIT_REACHED"
  | "MIN_ORDER_NOT_MET"
  | "FIRST_ORDER_ONLY"
  | "NOT_ELIGIBLE_CUSTOMER"
  | "NO_ELIGIBLE_ITEMS"
  | "LOGIN_REQUIRED";

export type CouponResult =
  | { ok: true; discount: number; freeShipping: boolean; eligibleSubtotal: number }
  | { ok: false; error: CouponError; message: string };

const MESSAGES: Record<CouponError, string> = {
  INACTIVE: "This coupon is not active.",
  NOT_STARTED: "This coupon is not valid yet.",
  EXPIRED: "This coupon has expired.",
  USAGE_LIMIT_REACHED: "This coupon has reached its usage limit.",
  CUSTOMER_LIMIT_REACHED: "You have already used this coupon.",
  MIN_ORDER_NOT_MET: "Your order does not meet the minimum amount for this coupon.",
  FIRST_ORDER_ONLY: "This coupon is only valid on your first order.",
  NOT_ELIGIBLE_CUSTOMER: "This coupon is not available for your account.",
  NO_ELIGIBLE_ITEMS: "No items in your cart are eligible for this coupon.",
  LOGIN_REQUIRED: "Please enter your phone number to use this coupon.",
};

function fail(error: CouponError, minOrder?: number): CouponResult {
  let message = MESSAGES[error];
  if (error === "MIN_ORDER_NOT_MET" && minOrder !== undefined) {
    message = `Minimum order of ৳${(minOrder / 100).toLocaleString("en-BD")} required for this coupon.`;
  }
  return { ok: false, error, message };
}

export function normalizeCouponCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}

/**
 * Pure coupon evaluation. The server loads the coupon + context from the
 * database and calls this; the client never decides the discount.
 */
export function evaluateCoupon(c: CouponRule, ctx: CouponContext): CouponResult {
  if (!c.isActive) return fail("INACTIVE");
  if (c.startsAt && ctx.now < c.startsAt) return fail("NOT_STARTED");
  if (c.expiresAt && ctx.now > c.expiresAt) return fail("EXPIRED");
  if (c.usageLimit !== null && c.usedCount >= c.usageLimit) return fail("USAGE_LIMIT_REACHED");

  // Customer-specific coupons need a known customer. First-order / per-customer
  // limits are re-checked at order placement, when the phone number is known.
  if (c.customerIds.length > 0 && !ctx.customerId) return fail("LOGIN_REQUIRED");
  if (c.customerIds.length > 0 && ctx.customerId && !c.customerIds.includes(ctx.customerId)) {
    return fail("NOT_ELIGIBLE_CUSTOMER");
  }
  if (c.firstOrderOnly && ctx.customerOrderCount > 0) return fail("FIRST_ORDER_ONLY");
  if (c.perCustomerLimit !== null && ctx.customerUsageCount >= c.perCustomerLimit) {
    return fail("CUSTOMER_LIMIT_REACHED");
  }

  const scoped = c.productIds.length > 0 || c.categoryIds.length > 0;
  const eligibleSubtotal = scoped
    ? ctx.lines
        .filter(
          (l) =>
            c.productIds.includes(l.productId) || l.categoryIds.some((cat) => c.categoryIds.includes(cat)),
        )
        .reduce((s, l) => s + l.lineTotal, 0)
    : ctx.subtotal;

  if (scoped && eligibleSubtotal === 0) return fail("NO_ELIGIBLE_ITEMS");
  if (ctx.subtotal < c.minOrder) return fail("MIN_ORDER_NOT_MET", c.minOrder);

  let discount = 0;
  let freeShipping = false;
  switch (c.type) {
    case "PERCENTAGE":
      discount = percentOf(eligibleSubtotal, Math.min(Math.max(c.value, 0), 100));
      break;
    case "FIXED":
      discount = Math.max(c.value, 0);
      break;
    case "FREE_SHIPPING":
      freeShipping = true;
      break;
  }
  if (c.maxDiscount !== null) discount = Math.min(discount, c.maxDiscount);
  discount = Math.min(discount, eligibleSubtotal);

  return { ok: true, discount, freeShipping, eligibleSubtotal };
}

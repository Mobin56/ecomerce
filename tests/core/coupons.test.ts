import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateCoupon, normalizeCouponCode, type CouponRule, type CouponContext } from "../../src/core/coupons.ts";

const c = (o: Partial<CouponRule> = {}): CouponRule => ({
  id: "c", code: "X", type: "PERCENTAGE", value: 25, minOrder: 0, maxDiscount: null, productIds: [], categoryIds: [],
  firstOrderOnly: false, customerIds: [], usageLimit: null, perCustomerLimit: null, usedCount: 0, startsAt: null,
  expiresAt: null, isActive: true, ...o,
});
const ctx = (o: Partial<CouponContext> = {}): CouponContext => ({
  lines: [
    { productId: "p1", categoryIds: ["shirts"], lineTotal: 1000_00 },
    { productId: "p2", categoryIds: ["shoes"], lineTotal: 3000_00 },
  ],
  subtotal: 4000_00, customerId: "cu", customerOrderCount: 0, customerUsageCount: 0, now: new Date("2026-06-01"), ...o,
});

test("percentage with max discount (EID25)", () => {
  const r = evaluateCoupon(c({ maxDiscount: 500_00 }), ctx());
  assert.ok(r.ok && r.discount === 500_00);
});

test("fixed discount (SAVE200) never exceeds subtotal", () => {
  const r = evaluateCoupon(c({ type: "FIXED", value: 200_00 }), ctx());
  assert.ok(r.ok && r.discount === 200_00);
  const r2 = evaluateCoupon(c({ type: "FIXED", value: 9999_00 }), ctx({ subtotal: 100_00, lines: [{ productId: "p", categoryIds: [], lineTotal: 100_00 }] }));
  assert.ok(r2.ok && r2.discount === 100_00);
});

test("minimum order", () => {
  const r = evaluateCoupon(c({ minOrder: 5000_00 }), ctx());
  assert.ok(!r.ok && r.error === "MIN_ORDER_NOT_MET");
  assert.ok(!r.ok && r.message.includes("5,000"));
});

test("product / category scoped coupons only discount eligible lines", () => {
  const byCat = evaluateCoupon(c({ categoryIds: ["shirts"], value: 10 }), ctx());
  assert.ok(byCat.ok && byCat.discount === 100_00);
  const byProduct = evaluateCoupon(c({ productIds: ["p2"], value: 10 }), ctx());
  assert.ok(byProduct.ok && byProduct.discount === 300_00);
  const none = evaluateCoupon(c({ productIds: ["zzz"] }), ctx());
  assert.ok(!none.ok && none.error === "NO_ELIGIBLE_ITEMS");
});

test("first order only (WELCOME10)", () => {
  assert.ok(evaluateCoupon(c({ firstOrderOnly: true }), ctx()).ok);
  const r = evaluateCoupon(c({ firstOrderOnly: true }), ctx({ customerOrderCount: 2 }));
  assert.ok(!r.ok && r.error === "FIRST_ORDER_ONLY");
});

test("customer specific", () => {
  assert.ok(evaluateCoupon(c({ customerIds: ["cu"] }), ctx()).ok);
  const other = evaluateCoupon(c({ customerIds: ["someone"] }), ctx());
  assert.ok(!other.ok && other.error === "NOT_ELIGIBLE_CUSTOMER");
  const guest = evaluateCoupon(c({ customerIds: ["cu"] }), ctx({ customerId: null }));
  assert.ok(!guest.ok && guest.error === "LOGIN_REQUIRED");
});

test("usage limits, dates, inactive", () => {
  assert.equal((evaluateCoupon(c({ usageLimit: 10, usedCount: 10 }), ctx()) as { error: string }).error, "USAGE_LIMIT_REACHED");
  assert.equal((evaluateCoupon(c({ perCustomerLimit: 1 }), ctx({ customerUsageCount: 1 })) as { error: string }).error, "CUSTOMER_LIMIT_REACHED");
  assert.equal((evaluateCoupon(c({ expiresAt: new Date("2026-05-31") }), ctx()) as { error: string }).error, "EXPIRED");
  assert.equal((evaluateCoupon(c({ startsAt: new Date("2026-07-01") }), ctx()) as { error: string }).error, "NOT_STARTED");
  assert.equal((evaluateCoupon(c({ isActive: false }), ctx()) as { error: string }).error, "INACTIVE");
});

test("free shipping coupon", () => {
  const r = evaluateCoupon(c({ type: "FREE_SHIPPING" }), ctx());
  assert.ok(r.ok && r.freeShipping && r.discount === 0);
});

test("code normalisation", () => {
  assert.equal(normalizeCouponCode("  welcome 10 "), "WELCOME10");
});

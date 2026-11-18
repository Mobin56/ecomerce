import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateTotals, effectivePrice, discountPercent, type PricedLine } from "../../src/core/pricing.ts";
import type { CouponRule } from "../../src/core/coupons.ts";
import { allocate, formatMoney, toPoisha } from "../../src/core/money.ts";

const line = (o: Partial<PricedLine> = {}): PricedLine => ({
  variantId: "v1",
  productId: "p1",
  categoryIds: ["c1"],
  name: "T-Shirt",
  unitPrice: 1200_00,
  unitCost: 600_00,
  quantity: 2,
  available: 10,
  ...o,
});

const zone = { key: "inside_dhaka", name: "Inside Dhaka", charge: 70_00, courierCost: 60_00, minDays: 1, maxDays: 2 };

const coupon = (o: Partial<CouponRule> = {}): CouponRule => ({
  id: "cp1",
  code: "SAVE10",
  type: "PERCENTAGE",
  value: 10,
  minOrder: 0,
  maxDiscount: null,
  productIds: [],
  categoryIds: [],
  firstOrderOnly: false,
  customerIds: [],
  usageLimit: null,
  perCustomerLimit: null,
  usedCount: 0,
  startsAt: null,
  expiresAt: null,
  isActive: true,
  ...o,
});

const base = { shipping: zone, coupon: null, customerId: "cu1", customerOrderCount: 0, customerCouponUsage: 0, freeShippingThreshold: null };

test("price × qty + shipping − discount = total", () => {
  const r = calculateTotals({ ...base, lines: [line(), line({ variantId: "v2", unitPrice: 500_00, quantity: 1 })], coupon: coupon() });
  assert.equal(r.subtotal, 2900_00);
  assert.equal(r.discount, 290_00);
  assert.equal(r.shippingFee, 70_00);
  assert.equal(r.total, 2900_00 - 290_00 + 70_00);
  assert.equal(r.lines.reduce((s, l) => s + l.discount, 0), r.discount, "line discounts sum to order discount");
});

test("free delivery threshold and 'X away' message", () => {
  const below = calculateTotals({ ...base, lines: [line({ quantity: 1 })], freeShippingThreshold: 2000_00 });
  assert.equal(below.shippingFee, 70_00);
  assert.equal(below.freeShippingRemaining, 800_00);
  const above = calculateTotals({ ...base, lines: [line({ quantity: 2 })], freeShippingThreshold: 2000_00 });
  assert.equal(above.shippingFee, 0);
  assert.equal(above.freeShipping, true);
  assert.equal(above.freeShippingRemaining, null);
});

test("threshold is checked after discount", () => {
  const r = calculateTotals({ ...base, lines: [line({ quantity: 2 })], freeShippingThreshold: 2200_00, coupon: coupon({ type: "FIXED", value: 300_00 }) });
  assert.equal(r.subtotal - r.discount, 2100_00);
  assert.equal(r.shippingFee, 70_00);
});

test("invalid coupon is reported, not applied", () => {
  const r = calculateTotals({ ...base, lines: [line()], coupon: coupon({ expiresAt: new Date("2020-01-01") }) });
  assert.equal(r.discount, 0);
  assert.equal(r.couponError?.code, "EXPIRED");
  assert.equal(r.total, 2400_00 + 70_00);
});

test("stock errors are collected", () => {
  const r = calculateTotals({ ...base, lines: [line({ quantity: 5, available: 3 })] });
  assert.deepEqual(r.stockErrors, [{ variantId: "v1", name: "T-Shirt", available: 3, requested: 5 }]);
});

test("rejects tampered quantities and prices", () => {
  assert.throws(() => calculateTotals({ ...base, lines: [line({ quantity: 0 })] }));
  assert.throws(() => calculateTotals({ ...base, lines: [line({ quantity: 1.5 })] }));
  assert.throws(() => calculateTotals({ ...base, lines: [line({ quantity: 999 })] }));
  assert.throws(() => calculateTotals({ ...base, lines: [line({ unitPrice: -1 })] }));
});

test("effective price picks valid sale price and variant overrides", () => {
  assert.deepEqual(effectivePrice({ productRegular: 1000, productSale: 800, variantPrice: null, variantSale: null }), { price: 800, compareAt: 1000 });
  assert.deepEqual(effectivePrice({ productRegular: 1000, productSale: 1200, variantPrice: null, variantSale: null }), { price: 1000, compareAt: null });
  assert.deepEqual(effectivePrice({ productRegular: 1000, productSale: 800, variantPrice: 1500, variantSale: null }), { price: 800, compareAt: 1500 });
  assert.equal(discountPercent(800, 1000), 20);
});

test("money helpers", () => {
  assert.deepEqual(allocate(100, [1, 1, 1]), [34, 33, 33]);
  assert.equal(allocate(0, [5, 5]).reduce((a, b) => a + b, 0), 0);
  assert.equal(toPoisha(1350.5), 135050);
  assert.equal(formatMoney(135000), "৳1,350");
});

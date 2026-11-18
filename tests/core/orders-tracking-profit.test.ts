import { test } from "node:test";
import assert from "node:assert/strict";
import { canTransition, inventoryEffect } from "../../src/core/order-status.ts";
import { buildCapiEvent, purchaseEventId, hashUserData, sha256, toGa4Items } from "../../src/core/tracking.ts";
import { computeOrderProfit, summarizePeriod, campaignKpis, gatewayFee } from "../../src/core/profit.ts";
import { can, DEFAULT_ROLES, ADMIN_NAV } from "../../src/core/rbac.ts";
import { checkVerifiedPayment, parseGatewayAmount, type VerifiedPayment } from "../../src/core/payments/types.ts";
import { mapCourierStatus, orderStatusForShipment } from "../../src/core/courier/types.ts";
import { suggestCorrection, levenshtein } from "../../src/core/search.ts";
import { zoneForDistrict, DISTRICTS } from "../../src/core/locations.ts";

test("order state machine", () => {
  assert.ok(canTransition("PENDING", "CONFIRMED"));
  assert.ok(!canTransition("DELIVERED", "PENDING"));
  assert.ok(!canTransition("CANCELLED", "CONFIRMED"));
  assert.equal(inventoryEffect("PACKED", "SHIPPED"), "FULFILL");
  assert.equal(inventoryEffect("CONFIRMED", "CANCELLED"), "RELEASE");
  assert.equal(inventoryEffect("SHIPPED", "RETURNED"), "RESTOCK");
  assert.equal(inventoryEffect("FAILED_DELIVERY", "SHIPPED"), "NONE", "re-shipping must not deduct stock twice");
  assert.throws(() => inventoryEffect("DELIVERED", "CANCELLED"));
});

test("purchase event id is deterministic (dedup)", () => {
  assert.equal(purchaseEventId("ord_1"), purchaseEventId("ord_1"));
});

test("CAPI payload hashes PII and converts money", () => {
  const e = buildCapiEvent({
    eventName: "Purchase",
    eventId: purchaseEventId("o1"),
    value: 1350_00,
    orderId: "o1",
    items: [{ id: "p1", name: "Shirt", price: 1350_00, quantity: 1 }],
    user: { phone: "01712345678", email: " A@B.com ", name: "Mobin Islam", ip: "1.2.3.4", userAgent: "UA", fbp: "fb.1.x" },
  });
  assert.equal(e.event_id, "purchase.o1");
  assert.equal(e.custom_data.value, 1350);
  assert.equal(e.custom_data.currency, "BDT");
  assert.deepEqual(e.custom_data.content_ids, ["p1"]);
  assert.deepEqual(e.user_data.ph, [sha256("8801712345678")]);
  assert.deepEqual(e.user_data.em, [sha256("a@b.com")]);
  assert.deepEqual(e.user_data.fn, [sha256("mobin")]);
  assert.ok(!JSON.stringify(e).includes("01712345678"), "raw phone must never be sent");
  assert.deepEqual(hashUserData({}), {});
  assert.equal(toGa4Items([{ id: "p", name: "n", price: 1000, quantity: 2 }])[0]!.price, 10);
});

test("true profit: delivered, returned, cancelled", () => {
  const delivered = computeOrderProfit({
    status: "DELIVERED", subtotal: 2000_00, discount: 200_00, shippingFee: 70_00, deliveryCost: 60_00, gatewayFee: 0, returnCost: 0,
    items: [{ unitCost: 600_00, quantity: 2, restocked: false }], paymentMethod: "cod",
  });
  assert.equal(delivered.netProfit, 1800_00 + 70_00 - 1200_00 - 60_00);
  const returned = computeOrderProfit({
    status: "RETURNED", subtotal: 2000_00, discount: 0, shippingFee: 70_00, deliveryCost: 60_00, gatewayFee: 0, returnCost: 30_00,
    items: [{ unitCost: 600_00, quantity: 2, restocked: true }], paymentMethod: "cod",
  });
  assert.equal(returned.revenue, 0);
  assert.equal(returned.netProfit, -90_00);
  const pnl = summarizePeriod([delivered, returned], 300_00, 100_00);
  assert.equal(pnl.netProfit, delivered.netProfit + returned.netProfit - 400_00);
  assert.equal(gatewayFee(1000_00, { percent: 1.85, fixed: 0 }), 18_50);
  const k = campaignKpis({ visitors: 12450, productViews: 0, addToCart: 0, checkouts: 0, orders: 384, revenue: 485_000_00, adSpend: 120_000_00, contribution: 150_000_00 });
  assert.equal(k.roas?.toFixed(2), "4.04");
  assert.equal(k.profit, 30_000_00);
});

test("RBAC: marketing manager cannot reach payments/users/finance settings", () => {
  const mm = { roleKey: "MARKETING_MANAGER", permissions: DEFAULT_ROLES.MARKETING_MANAGER.permissions };
  assert.ok(can(mm, "marketing.view"));
  assert.ok(can(mm, "analytics.view"));
  assert.ok(!can(mm, "payments.manage"));
  assert.ok(!can(mm, "users.manage"));
  assert.ok(!can(mm, "settings.manage"));
  assert.ok(can({ roleKey: "SUPER_ADMIN", permissions: [] }, "users.manage"));
  assert.ok(!can(null, "dashboard.view"));
  assert.ok(ADMIN_NAV.every((n) => n.href.startsWith("/admin")));
});

test("payment verification checks amount, order, txn, currency, replay", () => {
  const v: VerifiedPayment = { status: "SUCCEEDED", orderId: "o1", amount: 1350_00, currency: "BDT", transactionId: "T1", providerRef: null, raw: {} };
  const exp = { orderId: "o1", amount: 1350_00, currency: "BDT", alreadyPaidTxnIds: [] as string[] };
  assert.deepEqual(checkVerifiedPayment(exp, v), { ok: true });
  assert.deepEqual(checkVerifiedPayment(exp, { ...v, amount: 1_00 }), { ok: false, reason: "AMOUNT_MISMATCH" });
  assert.deepEqual(checkVerifiedPayment(exp, { ...v, orderId: "o2" }), { ok: false, reason: "ORDER_MISMATCH" });
  assert.deepEqual(checkVerifiedPayment(exp, { ...v, status: "PENDING" }), { ok: false, reason: "NOT_SUCCEEDED" });
  assert.deepEqual(checkVerifiedPayment({ ...exp, alreadyPaidTxnIds: ["T1"] }, v), { ok: false, reason: "ALREADY_PROCESSED" });
  assert.equal(parseGatewayAmount("1350.00"), 1350_00);
});

test("courier status mapping", () => {
  assert.equal(mapCourierStatus("steadfast", "delivered"), "DELIVERED");
  assert.equal(mapCourierStatus("steadfast", "cancelled"), "RETURNED");
  assert.equal(mapCourierStatus("pathao", "Delivery Failed"), "FAILED");
  assert.equal(mapCourierStatus("redx", "delivery-in-progress"), "IN_TRANSIT");
  assert.equal(orderStatusForShipment("DELIVERED"), "DELIVERED");
  assert.equal(orderStatusForShipment("CREATED"), null);
});

test("search typo tolerance", () => {
  assert.equal(levenshtein("tshrt", "tshirt"), 1);
  assert.equal(suggestCorrection("cotten tshrt", ["Premium Cotton T-Shirt", "tshirt"]), "cotton tshirt");
  assert.equal(suggestCorrection("cotton", ["Premium Cotton T-Shirt"]), null);
});

test("delivery zones", () => {
  assert.equal(DISTRICTS.length, 64);
  const zones = [
    { key: "inside", districts: ["Dhaka"], isActive: true, position: 0 },
    { key: "outside", districts: [], isActive: true, position: 1 },
  ];
  assert.equal(zoneForDistrict(zones, "dhaka")!.key, "inside");
  assert.equal(zoneForDistrict(zones, "Sylhet")!.key, "outside");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreRisk, type RiskSignals } from "../../src/core/risk.ts";
import { touchFromLanding, mergeTouch, encodeAttribution, decodeAttribution, describeSource, classifyChannel } from "../../src/core/attribution.ts";
import { normalizeBDPhone, phoneLooksSuspicious, maskPhone } from "../../src/core/phone.ts";
import { segmentCustomer } from "../../src/core/segments.ts";

const sig = (o: Partial<RiskSignals> = {}): RiskSignals => ({
  previousOrders: 0, previousCancelled: 0, previousReturned: 0, previousFailedDelivery: 0, ordersLast24h: 0,
  phonesAtSameAddress: 1, addressesForPhone: 1, totalQuantity: 1, maxLineQuantity: 1, orderTotal: 1000_00,
  averageOrderValue: null, isBlockedCustomer: false, phoneLooksInvalid: false, ordersFromIpLastHour: 0, ...o,
});

test("new clean customer is LOW risk", () => {
  const r = scoreRisk(sig());
  assert.equal(r.level, "LOW");
  assert.equal(r.score, 0);
});

test("serial canceller is HIGH risk with reasons", () => {
  const r = scoreRisk(sig({ previousOrders: 5, previousCancelled: 3, previousReturned: 1, previousFailedDelivery: 1, ordersLast24h: 3 }));
  assert.equal(r.level, "HIGH");
  assert.ok(r.reasons.some((x) => x.code === "cancel_rate"));
});

test("unusual quantity alone is MEDIUM at most", () => {
  const r = scoreRisk(sig({ totalQuantity: 25, maxLineQuantity: 25, phoneLooksInvalid: true }));
  assert.equal(r.level, "MEDIUM");
});

test("good history lowers score", () => {
  const withHistory = scoreRisk(sig({ previousOrders: 10, ordersLast24h: 2 }));
  const without = scoreRisk(sig({ ordersLast24h: 2 }));
  assert.ok(withHistory.score < without.score);
});

test("UTM landing creates a facebook_ads touch", () => {
  const t = touchFromLanding("https://shop.com/products/x?utm_source=facebook&utm_medium=paid&utm_campaign=Summer+Sale&fbclid=abc", null)!;
  assert.equal(t.channel, "facebook_ads");
  assert.equal(t.utmCampaign, "Summer Sale");
  assert.equal(t.fbclid, "abc");
  assert.equal(t.landingPage, "/products/x?utm_source=facebook&utm_medium=paid&utm_campaign=Summer+Sale&fbclid=abc");
  assert.equal(describeSource(t), "Facebook Ads → Summer Sale");
});

test("internal navigation is ignored, external referrer classified", () => {
  assert.equal(touchFromLanding("https://shop.com/cart", "https://shop.com/products/x"), null);
  assert.equal(touchFromLanding("https://shop.com/", "https://www.google.com/")!.channel, "organic_search");
  assert.equal(touchFromLanding("https://shop.com/", "https://m.facebook.com/")!.channel, "organic_social");
  assert.equal(classifyChannel({ gclid: "x" }), "google_ads");
  assert.equal(classifyChannel({ utmSource: "newsletter", utmMedium: "email" }), "email");
});

test("direct visit never overrides a paid touch; first touch is kept", () => {
  const fb = touchFromLanding("https://s.com/?utm_source=facebook&utm_medium=cpc&utm_campaign=A", null);
  const g = touchFromLanding("https://s.com/?gclid=1", null);
  const direct = touchFromLanding("https://s.com/", null);
  let s = mergeTouch(null, fb);
  s = mergeTouch(s, direct);
  assert.equal(s!.last.utmCampaign, "A");
  s = mergeTouch(s, g);
  assert.equal(s!.first.utmCampaign, "A");
  assert.equal(s!.last.channel, "google_ads");
  assert.deepEqual(decodeAttribution(encodeAttribution(s!)), s);
  assert.equal(decodeAttribution("garbage"), null);
});

test("BD phone normalisation", () => {
  assert.equal(normalizeBDPhone("+880 1712-345678"), "01712345678");
  assert.equal(normalizeBDPhone("8801712345678"), "01712345678");
  assert.equal(normalizeBDPhone("1712345678"), "01712345678");
  assert.equal(normalizeBDPhone("01212345678"), null);
  assert.equal(normalizeBDPhone("123"), null);
  assert.equal(phoneLooksSuspicious("01711111111"), true);
  assert.equal(phoneLooksSuspicious("01712345678"), true, "sequential tail");
  assert.equal(phoneLooksSuspicious("01791834560"), false);
  assert.equal(maskPhone("01712345678"), "017*****678");
});

test("customer segments", () => {
  const now = new Date("2026-06-01");
  assert.deepEqual(segmentCustomer({ totalOrders: 1, deliveredOrders: 0, cancelledOrders: 0, returnedOrders: 0, totalSpent: 0, lastOrderAt: now }, now), ["NEW"]);
  const vip = segmentCustomer({ totalOrders: 8, deliveredOrders: 7, cancelledOrders: 1, returnedOrders: 0, totalSpent: 60_000_00, lastOrderAt: new Date("2025-01-01") }, now);
  assert.ok(vip.includes("VIP") && vip.includes("RETURNING") && vip.includes("HIGH_VALUE") && vip.includes("INACTIVE"));
  const risky = segmentCustomer({ totalOrders: 4, deliveredOrders: 1, cancelledOrders: 3, returnedOrders: 0, totalSpent: 1000_00, lastOrderAt: now }, now);
  assert.ok(risky.includes("HIGH_CANCELLATION_RISK"));
});

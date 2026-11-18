/**
 * Order risk engine. Produces a 0–100 score and LOW/MEDIUM/HIGH level from
 * configurable weighted signals. It never rejects an order by itself; the
 * caller only auto-holds/rejects when Admin enabled `autoRejectHigh`.
 */

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

export interface RiskSignals {
  /** Past orders for this phone (excluding this one) */
  previousOrders: number;
  previousCancelled: number;
  previousReturned: number;
  previousFailedDelivery: number;
  /** Orders from this phone in the last 24h (excluding this one) */
  ordersLast24h: number;
  /** Distinct phone numbers that used this exact address in the last 30 days */
  phonesAtSameAddress: number;
  /** Distinct addresses this phone used in the last 30 days */
  addressesForPhone: number;
  totalQuantity: number;
  maxLineQuantity: number;
  orderTotal: number;
  /** Customer's average delivered order value; null if none */
  averageOrderValue: number | null;
  isBlockedCustomer: boolean;
  phoneLooksInvalid: boolean;
  /** Orders from the same IP in the last hour */
  ordersFromIpLastHour: number;
}

export interface RiskConfig {
  weights: {
    cancellationRate: number;
    returnRate: number;
    failedDelivery: number;
    frequency: number;
    sharedAddress: number;
    manyAddresses: number;
    quantity: number;
    highValue: number;
    blocked: number;
    invalidPhone: number;
    ipVelocity: number;
  };
  thresholds: { medium: number; high: number };
  unusualQuantity: number;
  highValueMultiplier: number;
  /** Only when explicitly enabled by Admin */
  autoRejectHigh: boolean;
}

export const DEFAULT_RISK_CONFIG: RiskConfig = {
  weights: {
    cancellationRate: 30,
    returnRate: 25,
    failedDelivery: 20,
    frequency: 15,
    sharedAddress: 10,
    manyAddresses: 8,
    quantity: 12,
    highValue: 10,
    blocked: 60,
    invalidPhone: 25,
    ipVelocity: 15,
  },
  thresholds: { medium: 25, high: 50 },
  unusualQuantity: 10,
  highValueMultiplier: 4,
  autoRejectHigh: false,
};

export interface RiskResult {
  score: number;
  level: RiskLevel;
  reasons: { code: string; label: string; points: number }[];
}

export function scoreRisk(s: RiskSignals, cfg: RiskConfig = DEFAULT_RISK_CONFIG): RiskResult {
  const w = cfg.weights;
  const reasons: RiskResult["reasons"] = [];
  const add = (code: string, label: string, points: number) => {
    const p = Math.round(points);
    if (p > 0) reasons.push({ code, label, points: p });
  };

  if (s.isBlockedCustomer) add("blocked", "Customer is blocked", w.blocked);
  if (s.phoneLooksInvalid) add("invalid_phone", "Phone number looks invalid", w.invalidPhone);

  if (s.previousOrders >= 2) {
    const cancelRate = s.previousCancelled / s.previousOrders;
    const returnRate = s.previousReturned / s.previousOrders;
    if (cancelRate >= 0.3) add("cancel_rate", `Cancels ${Math.round(cancelRate * 100)}% of orders`, w.cancellationRate * Math.min(cancelRate / 0.6, 1));
    if (returnRate >= 0.25) add("return_rate", `Returns ${Math.round(returnRate * 100)}% of orders`, w.returnRate * Math.min(returnRate / 0.5, 1));
  } else if (s.previousOrders === 1 && s.previousCancelled + s.previousReturned >= 1) {
    add("prior_issue", "Only previous order was cancelled/returned", w.cancellationRate * 0.5);
  }
  if (s.previousFailedDelivery > 0) {
    add("failed_delivery", `${s.previousFailedDelivery} failed deliveries`, w.failedDelivery * Math.min(s.previousFailedDelivery / 2, 1));
  }
  if (s.ordersLast24h >= 2) add("frequency", `${s.ordersLast24h} orders in 24h`, w.frequency * Math.min((s.ordersLast24h - 1) / 3, 1));
  if (s.phonesAtSameAddress >= 3) add("shared_address", `Address used by ${s.phonesAtSameAddress} phone numbers`, w.sharedAddress);
  if (s.addressesForPhone >= 3) add("many_addresses", `Phone used ${s.addressesForPhone} different addresses`, w.manyAddresses);
  if (s.maxLineQuantity >= cfg.unusualQuantity || s.totalQuantity >= cfg.unusualQuantity * 2) {
    add("quantity", `Unusual quantity (${s.totalQuantity} items)`, w.quantity);
  }
  if (s.averageOrderValue && s.orderTotal > s.averageOrderValue * cfg.highValueMultiplier) {
    add("high_value", "Much larger than customer's usual order", w.highValue);
  }
  if (s.ordersFromIpLastHour >= 3) add("ip_velocity", `${s.ordersFromIpLastHour} orders from same IP in 1h`, w.ipVelocity);

  // Good history lowers risk.
  const delivered = s.previousOrders - s.previousCancelled - s.previousReturned - s.previousFailedDelivery;
  let score = reasons.reduce((a, r) => a + r.points, 0);
  if (delivered >= 3 && !s.isBlockedCustomer) score -= Math.min(delivered * 3, 20);
  score = Math.max(0, Math.min(100, score));

  const level: RiskLevel = score >= cfg.thresholds.high ? "HIGH" : score >= cfg.thresholds.medium ? "MEDIUM" : "LOW";
  return { score, level, reasons };
}

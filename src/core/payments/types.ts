/**
 * Payment provider adapter contract. Adding a gateway = implement this
 * interface and register it in src/server/payments/registry.ts.
 * Nothing outside the adapter knows gateway-specific details.
 */

export interface PaymentOrder {
  orderId: string;
  orderNumber: number;
  amount: number; // poisha, server-calculated
  currency: string;
  customer: { name: string; phone: string; email?: string | null; address: string; district: string };
  itemSummary: string;
  urls: { success: string; fail: string; cancel: string; ipn: string };
}

export type InitiateResult =
  | { kind: "none" } // e.g. COD – order is placed, nothing to pay now
  | { kind: "redirect"; url: string; providerRef: string }
  | { kind: "manual"; instructions: string; providerRef: string }; // send-money with TrxID

/** Normalised verification result returned by the gateway's server-side API. */
export interface VerifiedPayment {
  status: "SUCCEEDED" | "FAILED" | "PENDING" | "CANCELLED";
  orderId: string; // our order id as echoed by gateway
  amount: number; // poisha, as reported by gateway
  currency: string;
  transactionId: string | null;
  providerRef: string | null;
  fee?: number;
  raw: unknown;
}

export interface PaymentProvider {
  readonly key: string;
  readonly label: string;
  readonly isConfigured: boolean;
  /** Prepaid providers must be verified before an order is considered paid. */
  readonly prepaid: boolean;
  initiate(order: PaymentOrder): Promise<InitiateResult>;
  /**
   * Verify using the gateway's server-to-server API. `params` are the
   * callback/IPN params; they are only used to look up the transaction –
   * NEVER trusted as proof of payment.
   */
  verify(params: Record<string, string>): Promise<VerifiedPayment>;
  refund?(input: { transactionId: string; providerRef: string | null; amount: number; reason: string }): Promise<{ ok: boolean; refundRef?: string; raw: unknown }>;
}

export type PaymentCheck =
  | { ok: true }
  | { ok: false; reason: "NOT_SUCCEEDED" | "ORDER_MISMATCH" | "AMOUNT_MISMATCH" | "CURRENCY_MISMATCH" | "MISSING_TRANSACTION" | "ALREADY_PROCESSED" };

/**
 * Final gate before marking an order paid. Every field is checked against
 * OUR database record, not against anything the browser sent.
 */
export function checkVerifiedPayment(
  expected: { orderId: string; amount: number; currency: string; alreadyPaidTxnIds: string[] },
  v: VerifiedPayment,
): PaymentCheck {
  if (v.status !== "SUCCEEDED") return { ok: false, reason: "NOT_SUCCEEDED" };
  if (v.orderId !== expected.orderId) return { ok: false, reason: "ORDER_MISMATCH" };
  if (!v.transactionId) return { ok: false, reason: "MISSING_TRANSACTION" };
  if (expected.alreadyPaidTxnIds.includes(v.transactionId)) return { ok: false, reason: "ALREADY_PROCESSED" };
  if (v.currency.toUpperCase() !== expected.currency.toUpperCase()) return { ok: false, reason: "CURRENCY_MISMATCH" };
  // Gateways report decimals; allow < 1 poisha rounding difference only.
  if (Math.abs(v.amount - expected.amount) >= 1) return { ok: false, reason: "AMOUNT_MISMATCH" };
  return { ok: true };
}

/** "1350.00" (gateway, taka) → 135000 poisha */
export function parseGatewayAmount(v: string | number | undefined | null): number {
  const n = typeof v === "number" ? v : Number.parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? Math.round(n * 100) : Number.NaN;
}

export function formatGatewayAmount(poisha: number): string {
  return (poisha / 100).toFixed(2);
}

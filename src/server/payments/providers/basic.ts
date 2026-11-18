import "server-only";
import type { PaymentProvider } from "@/core/payments/types";

/** Cash on Delivery: nothing to collect online; courier collects. */
export const codProvider: PaymentProvider = {
  key: "cod",
  label: "Cash on Delivery",
  isConfigured: true,
  prepaid: false,
  async initiate() {
    return { kind: "none" };
  },
  async verify() {
    throw new Error("COD payments are confirmed on delivery, not verified online");
  },
};

/**
 * Manual mobile-wallet payment (bKash/Nagad/Rocket "Send Money" to a merchant
 * or personal number). The customer submits their TrxID; an admin verifies it
 * against the wallet statement and marks the payment paid in the order screen.
 * Used when gateway API credentials are not available (e.g. Rocket has no
 * public checkout API).
 */
export function manualWalletProvider(key: "bkash_manual" | "nagad" | "rocket", label: string, number: string): PaymentProvider {
  return {
    key,
    label,
    isConfigured: Boolean(number),
    prepaid: true,
    async initiate(order) {
      return {
        kind: "manual",
        providerRef: `${key}-${order.orderNumber}`,
        instructions: `Send ৳${(order.amount / 100).toFixed(2)} to ${label} number ${number} using "Send Money", with reference ${order.orderNumber}. Then enter the Transaction ID below.`,
      };
    },
    async verify(params) {
      // Never auto-approve: return PENDING so an admin must confirm against the statement.
      return { status: "PENDING", orderId: params.orderId ?? "", amount: Number.NaN, currency: "BDT", transactionId: params.trxId ?? null, providerRef: null, raw: params };
    },
  };
}

/** Development gateway — simulates a redirect + server verification. Disabled in production. */
export const mockProvider: PaymentProvider = {
  key: "mock",
  label: "Test card (development)",
  isConfigured: process.env.NODE_ENV !== "production",
  prepaid: true,
  async initiate(order) {
    const ref = `mock_${order.orderId}`;
    const url = new URL(order.urls.success);
    url.searchParams.set("ref", ref);
    url.searchParams.set("orderId", order.orderId);
    url.searchParams.set("amount", String(order.amount));
    return { kind: "redirect", url: url.toString(), providerRef: ref };
  },
  async verify(params) {
    return {
      status: "SUCCEEDED",
      orderId: params.orderId ?? "",
      amount: Number(params.amount),
      currency: "BDT",
      transactionId: `MOCK-${params.ref ?? Date.now()}`,
      providerRef: params.ref ?? null,
      raw: { simulated: true },
    };
  },
};

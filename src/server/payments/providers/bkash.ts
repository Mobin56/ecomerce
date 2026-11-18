import "server-only";
import { env } from "../../env";
import { formatGatewayAmount, parseGatewayAmount, type PaymentProvider } from "@/core/payments/types";

/**
 * bKash Tokenized Checkout (v1.2.0-beta).
 * Flow: grant token → create payment → redirect to bkashURL → callback with
 * paymentID & status → server calls EXECUTE (captures funds) → then QUERY to
 * confirm amount/merchantInvoiceNumber. Only the execute/query response is trusted.
 */
let tokenCache: { token: string; exp: number } | null = null;

export function bkashProvider(): PaymentProvider {
  const e = env();
  const base = e.BKASH_SANDBOX
    ? "https://tokenized.sandbox.bka.sh/v1.2.0-beta/tokenized/checkout"
    : "https://tokenized.pay.bka.sh/v1.2.0-beta/tokenized/checkout";
  const configured = Boolean(e.BKASH_APP_KEY && e.BKASH_APP_SECRET && e.BKASH_USERNAME && e.BKASH_PASSWORD);

  async function token(): Promise<string> {
    if (tokenCache && tokenCache.exp > Date.now()) return tokenCache.token;
    const res = await fetch(`${base}/token/grant`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", username: e.BKASH_USERNAME!, password: e.BKASH_PASSWORD! },
      body: JSON.stringify({ app_key: e.BKASH_APP_KEY, app_secret: e.BKASH_APP_SECRET }),
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json()) as { id_token?: string; expires_in?: number; statusMessage?: string };
    if (!json.id_token) throw new Error(`bKash token failed: ${json.statusMessage ?? res.status}`);
    tokenCache = { token: json.id_token, exp: Date.now() + ((json.expires_in ?? 3600) - 120) * 1000 };
    return json.id_token;
  }

  async function call(path: string, body: unknown) {
    const res = await fetch(`${base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: await token(), "X-APP-Key": e.BKASH_APP_KEY! },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    return (await res.json()) as Record<string, string>;
  }

  return {
    key: "bkash",
    label: "bKash",
    isConfigured: configured,
    prepaid: true,
    async initiate(order) {
      const json = await call("/create", {
        mode: "0011",
        payerReference: order.customer.phone,
        callbackURL: order.urls.success,
        amount: formatGatewayAmount(order.amount),
        currency: "BDT",
        intent: "sale",
        merchantInvoiceNumber: order.orderId,
      });
      if (!json.bkashURL || !json.paymentID) throw new Error(`bKash create failed: ${json.statusMessage ?? json.errorMessage ?? "unknown"}`);
      return { kind: "redirect", url: json.bkashURL, providerRef: json.paymentID };
    },
    async verify(params) {
      const paymentID = params.paymentID;
      if (!paymentID || params.status !== "success") {
        return { status: params.status === "cancel" ? "CANCELLED" : "FAILED", orderId: "", amount: Number.NaN, currency: "BDT", transactionId: null, providerRef: paymentID ?? null, raw: params };
      }
      let r = await call("/execute", { paymentID });
      // Execute may time out after capture; query is the source of truth.
      if (r.transactionStatus !== "Completed") r = await call("/payment/status", { paymentID });
      return {
        status: r.transactionStatus === "Completed" ? "SUCCEEDED" : r.transactionStatus === "Initiated" ? "PENDING" : "FAILED",
        orderId: r.merchantInvoiceNumber ?? "",
        amount: parseGatewayAmount(r.amount),
        currency: r.currency ?? "BDT",
        transactionId: r.trxID ?? null,
        providerRef: paymentID,
        raw: r,
      };
    },
    async refund({ transactionId, providerRef, amount, reason }) {
      const r = await call("/payment/refund", { paymentID: providerRef, trxID: transactionId, amount: formatGatewayAmount(amount), sku: "order", reason: reason.slice(0, 255) });
      return { ok: r.transactionStatus === "Completed", refundRef: r.refundTrxID, raw: r };
    },
  };
}

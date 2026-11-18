import "server-only";
import { env } from "../../env";
import { formatGatewayAmount, parseGatewayAmount, type PaymentProvider } from "@/core/payments/types";

/**
 * SSLCommerz (cards, mobile banking, internet banking).
 * Docs: https://developer.sslcommerz.com/doc/v4/
 * Flow: session API → redirect to GatewayPageURL → callback/IPN with val_id →
 *       server-side Validation API (the only thing we trust).
 */
export function sslcommerzProvider(): PaymentProvider {
  const e = env();
  const base = e.SSLCOMMERZ_SANDBOX ? "https://sandbox.sslcommerz.com" : "https://securepay.sslcommerz.com";
  const storeId = e.SSLCOMMERZ_STORE_ID ?? "";
  const storePass = e.SSLCOMMERZ_STORE_PASSWORD ?? "";

  return {
    key: "sslcommerz",
    label: "Card / Mobile banking (SSLCommerz)",
    isConfigured: Boolean(storeId && storePass),
    prepaid: true,

    async initiate(order) {
      const body = new URLSearchParams({
        store_id: storeId,
        store_passwd: storePass,
        total_amount: formatGatewayAmount(order.amount),
        currency: order.currency,
        tran_id: order.orderId, // our order id; echoed back and re-checked
        success_url: order.urls.success,
        fail_url: order.urls.fail,
        cancel_url: order.urls.cancel,
        ipn_url: order.urls.ipn,
        cus_name: order.customer.name,
        cus_email: order.customer.email || "customer@example.com",
        cus_phone: order.customer.phone,
        cus_add1: order.customer.address.slice(0, 50),
        cus_city: order.customer.district,
        cus_country: "Bangladesh",
        shipping_method: "Courier",
        ship_name: order.customer.name,
        ship_add1: order.customer.address.slice(0, 50),
        ship_city: order.customer.district,
        ship_postcode: "1000",
        ship_country: "Bangladesh",
        product_name: order.itemSummary.slice(0, 250),
        product_category: "General",
        product_profile: "physical-goods",
        value_a: String(order.orderNumber),
      });
      const res = await fetch(`${base}/gwprocess/v4/api.php`, { method: "POST", body, signal: AbortSignal.timeout(15_000) });
      const json = (await res.json()) as { status?: string; GatewayPageURL?: string; sessionkey?: string; failedreason?: string };
      if (json.status !== "SUCCESS" || !json.GatewayPageURL) throw new Error(`SSLCommerz init failed: ${json.failedreason ?? res.status}`);
      return { kind: "redirect", url: json.GatewayPageURL, providerRef: json.sessionkey ?? order.orderId };
    },

    async verify(params) {
      const valId = params.val_id;
      if (!valId) return { status: "FAILED", orderId: params.tran_id ?? "", amount: Number.NaN, currency: "BDT", transactionId: null, providerRef: null, raw: params };
      const url = `${base}/validator/api/validationserverAPI.php?val_id=${encodeURIComponent(valId)}&store_id=${encodeURIComponent(storeId)}&store_passwd=${encodeURIComponent(storePass)}&format=json`;
      const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      const v = (await res.json()) as Record<string, string>;
      const ok = v.status === "VALID" || v.status === "VALIDATED";
      return {
        status: ok ? "SUCCEEDED" : v.status === "PENDING" ? "PENDING" : "FAILED",
        orderId: v.tran_id ?? "",
        amount: parseGatewayAmount(v.currency_amount ?? v.amount),
        currency: v.currency_type ?? v.currency ?? "BDT",
        transactionId: v.bank_tran_id ?? v.val_id ?? null,
        providerRef: v.val_id ?? null,
        fee: Number.isFinite(parseGatewayAmount(v.store_amount)) ? parseGatewayAmount(v.amount) - parseGatewayAmount(v.store_amount) : undefined,
        raw: v,
      };
    },

    async refund({ transactionId, amount, reason }) {
      const url = new URL(`${base}/validator/api/merchantTransIDvalidationAPI.php`);
      url.search = new URLSearchParams({
        bank_tran_id: transactionId,
        refund_amount: formatGatewayAmount(amount),
        refund_remarks: reason.slice(0, 100),
        store_id: storeId,
        store_passwd: storePass,
        format: "json",
      }).toString();
      const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      const json = (await res.json()) as Record<string, string>;
      return { ok: json.APIConnect === "DONE" && json.status === "success", refundRef: json.refund_ref_id, raw: json };
    },
  };
}

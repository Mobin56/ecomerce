import "server-only";
import { env } from "../env";
import { mapCourierStatus, type CourierProvider } from "@/core/courier/types";

const json = async (res: Response) => (await res.json().catch(() => ({}))) as Record<string, unknown>;

/** Steadfast Courier — https://portal.packzy.com/api/v1 */
export function steadfastProvider(): CourierProvider {
  const e = env();
  const base = "https://portal.packzy.com/api/v1";
  const headers = { "Api-Key": e.STEADFAST_API_KEY ?? "", "Secret-Key": e.STEADFAST_SECRET_KEY ?? "", "Content-Type": "application/json" };
  return {
    key: "steadfast",
    label: "Steadfast",
    isConfigured: Boolean(e.STEADFAST_API_KEY && e.STEADFAST_SECRET_KEY),
    async createShipment(r) {
      const res = await fetch(`${base}/create_order`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          invoice: `${r.orderNumber}`,
          recipient_name: r.recipient.name,
          recipient_phone: r.recipient.phone,
          recipient_address: `${r.recipient.address}, ${r.recipient.area}, ${r.recipient.district}`.slice(0, 250),
          cod_amount: Math.round(r.codAmount / 100),
          note: r.note ?? "",
          item_description: r.itemDescription.slice(0, 250),
          total_lot: r.itemCount,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      const j = await json(res);
      const c = j.consignment as Record<string, unknown> | undefined;
      if (j.status !== 200 || !c) return { ok: false, error: String(j.message ?? `HTTP ${res.status}`), raw: j };
      return { ok: true, trackingId: String(c.tracking_code), consignmentId: String(c.consignment_id), status: mapCourierStatus("steadfast", String(c.status ?? "in_review")), raw: j };
    },
    async track({ trackingId }) {
      const res = await fetch(`${base}/status_by_trackingcode/${encodeURIComponent(trackingId)}`, { headers, signal: AbortSignal.timeout(10_000) });
      const j = await json(res);
      const raw = String(j.delivery_status ?? "");
      return raw ? { ok: true, rawStatus: raw, status: mapCourierStatus("steadfast", raw), raw: j } : { ok: false, error: "No status", raw: j };
    },
  };
}

/** Pathao Courier (Aladdin API) — OAuth password grant. */
let pathaoToken: { token: string; exp: number } | null = null;
export function pathaoProvider(): CourierProvider {
  const e = env();
  const base = e.PATHAO_SANDBOX ? "https://courier-api-sandbox.pathao.com" : "https://api-hermes.pathao.com";
  async function token() {
    if (pathaoToken && pathaoToken.exp > Date.now()) return pathaoToken.token;
    const res = await fetch(`${base}/aladdin/api/v1/issue-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: e.PATHAO_CLIENT_ID, client_secret: e.PATHAO_CLIENT_SECRET, username: e.PATHAO_USERNAME, password: e.PATHAO_PASSWORD, grant_type: "password" }),
      signal: AbortSignal.timeout(15_000),
    });
    const j = await json(res);
    if (!j.access_token) throw new Error("Pathao auth failed");
    pathaoToken = { token: String(j.access_token), exp: Date.now() + (Number(j.expires_in ?? 3600) - 300) * 1000 };
    return pathaoToken.token;
  }
  return {
    key: "pathao",
    label: "Pathao",
    isConfigured: Boolean(e.PATHAO_CLIENT_ID && e.PATHAO_CLIENT_SECRET && e.PATHAO_USERNAME && e.PATHAO_PASSWORD && e.PATHAO_STORE_ID),
    async createShipment(r) {
      // Pathao can auto-resolve city/zone from the address text when ids are omitted.
      const res = await fetch(`${base}/aladdin/api/v1/orders`, {
        method: "POST",
        headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          store_id: Number(e.PATHAO_STORE_ID),
          merchant_order_id: String(r.orderNumber),
          recipient_name: r.recipient.name,
          recipient_phone: r.recipient.phone,
          recipient_address: `${r.recipient.address}, ${r.recipient.area}, ${r.recipient.district}`.slice(0, 220),
          delivery_type: 48,
          item_type: 2,
          item_quantity: r.itemCount,
          item_weight: Math.max(0.5, r.weightGrams / 1000),
          amount_to_collect: Math.round(r.codAmount / 100),
          item_description: r.itemDescription.slice(0, 200),
          special_instruction: r.note ?? "",
        }),
        signal: AbortSignal.timeout(15_000),
      });
      const j = await json(res);
      const d = j.data as Record<string, unknown> | undefined;
      if (!res.ok || !d?.consignment_id) return { ok: false, error: String(j.message ?? `HTTP ${res.status}`), raw: j };
      return { ok: true, trackingId: String(d.consignment_id), consignmentId: String(d.consignment_id), deliveryCharge: d.delivery_fee ? Math.round(Number(d.delivery_fee) * 100) : undefined, status: "CREATED", raw: j };
    },
    async track({ trackingId }) {
      const res = await fetch(`${base}/aladdin/api/v1/orders/${encodeURIComponent(trackingId)}/info`, { headers: { Authorization: `Bearer ${await token()}` }, signal: AbortSignal.timeout(10_000) });
      const j = await json(res);
      const raw = String((j.data as Record<string, unknown> | undefined)?.order_status ?? "");
      return raw ? { ok: true, rawStatus: raw, status: mapCourierStatus("pathao", raw), raw: j } : { ok: false, error: "No status", raw: j };
    },
  };
}

/** RedX — https://openapi.redx.com.bd */
export function redxProvider(): CourierProvider {
  const e = env();
  const base = e.REDX_SANDBOX ? "https://sandbox.redx.com.bd/v1.0.0-beta" : "https://openapi.redx.com.bd/v1.0.0-beta";
  const headers = { "API-ACCESS-TOKEN": `Bearer ${e.REDX_API_TOKEN ?? ""}`, "Content-Type": "application/json" };
  return {
    key: "redx",
    label: "RedX",
    isConfigured: Boolean(e.REDX_API_TOKEN),
    async createShipment(r) {
      const res = await fetch(`${base}/parcel`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          customer_name: r.recipient.name,
          customer_phone: r.recipient.phone,
          delivery_area: r.recipient.area,
          customer_address: `${r.recipient.address}, ${r.recipient.district}`,
          merchant_invoice_id: String(r.orderNumber),
          cash_collection_amount: String(Math.round(r.codAmount / 100)),
          parcel_weight: Math.max(500, r.weightGrams),
          value: String(Math.round(r.codAmount / 100)),
          instruction: r.note ?? "",
        }),
        signal: AbortSignal.timeout(15_000),
      });
      const j = await json(res);
      if (!res.ok || !j.tracking_id) return { ok: false, error: String(j.message ?? `HTTP ${res.status}`), raw: j };
      return { ok: true, trackingId: String(j.tracking_id), status: "CREATED", raw: j };
    },
    async track({ trackingId }) {
      const res = await fetch(`${base}/parcel/info/${encodeURIComponent(trackingId)}`, { headers, signal: AbortSignal.timeout(10_000) });
      const j = await json(res);
      const raw = String((j.parcel as Record<string, unknown> | undefined)?.status ?? "");
      return raw ? { ok: true, rawStatus: raw, status: mapCourierStatus("redx", raw), raw: j } : { ok: false, error: "No status", raw: j };
    },
  };
}

/**
 * Paperfly / eCourier: merchant APIs are issued on onboarding. Registered as
 * "not configured" adapters so they appear in Admin; implement createShipment/
 * track here once credentials + docs are provided by the courier.
 */
function pendingIntegration(key: string, label: string): CourierProvider {
  return {
    key,
    label,
    isConfigured: false,
    async createShipment() {
      return { ok: false, error: `${label} API credentials not configured`, raw: null };
    },
    async track() {
      return { ok: false, error: `${label} API credentials not configured`, raw: null };
    },
  };
}
export const paperflyProvider = () => pendingIntegration("paperfly", "Paperfly");
export const ecourierProvider = () => pendingIntegration("ecourier", "eCourier");

/** Development courier: generates tracking ids, advances status on each track(). */
export const mockCourier: CourierProvider = {
  key: "mock",
  label: "Manual / Test courier",
  isConfigured: true,
  async createShipment(r) {
    return { ok: true, trackingId: `TEST-${r.orderNumber}-${Date.now().toString(36).toUpperCase()}`, status: "CREATED", deliveryCharge: undefined, raw: { simulated: true } };
  },
  async track() {
    return { ok: true, status: "IN_TRANSIT", rawStatus: "in_transit", raw: { simulated: true } };
  },
};

export function allCouriers(): CourierProvider[] {
  return [steadfastProvider(), pathaoProvider(), redxProvider(), paperflyProvider(), ecourierProvider(), mockCourier];
}

export function getCourier(key: string): CourierProvider | null {
  return allCouriers().find((c) => c.key === key) ?? null;
}

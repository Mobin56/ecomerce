import { createHash } from "node:crypto";
import type { MetaEventName, TrackItem } from "./tracking-shared.ts";

export * from "./tracking-shared.ts";

/**
 * Meta Pixel + Conversions API and GA4 event builders.
 *
 * DEDUPLICATION: the browser Pixel and the server CAPI send the SAME
 * `event_id` (Pixel: eventID option; CAPI: event_id). Meta keeps one.
 * For Purchase the id is derived from the order id, so every retry — browser
 * reload of the thank-you page, webhook replay, admin re-send — produces the
 * same id and can never double count. The server additionally keeps a unique
 * (eventName, eventId) row in meta_event_logs and refuses to send twice.
 */

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Meta normalisation rules: lowercase, trimmed; phone digits with country code. */
export function hashUserData(u: {
  email?: string | null;
  phone?: string | null; // 01XXXXXXXXX
  firstName?: string | null;
  lastName?: string | null;
  city?: string | null;
  externalId?: string | null;
}): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const put = (k: string, v: string | null | undefined, norm: (s: string) => string) => {
    if (!v) return;
    const n = norm(v);
    if (n) out[k] = [sha256(n)];
  };
  put("em", u.email, (s) => s.trim().toLowerCase());
  put("ph", u.phone, (s) => {
    const d = s.replace(/\D/g, "");
    return d.startsWith("880") ? d : d.startsWith("0") ? `88${d}` : d;
  });
  put("fn", u.firstName, (s) => s.trim().toLowerCase());
  put("ln", u.lastName, (s) => s.trim().toLowerCase());
  put("ct", u.city, (s) => s.trim().toLowerCase().replace(/[^a-z]/g, ""));
  put("external_id", u.externalId, (s) => s.trim());
  if (Object.keys(out).length) out.country = [sha256("bd")];
  return out;
}

export interface CapiEventInput {
  eventName: MetaEventName;
  eventId: string;
  eventTime?: Date;
  sourceUrl?: string;
  items?: TrackItem[];
  value?: number; // poisha
  currency?: string;
  orderId?: string;
  searchString?: string;
  user: {
    email?: string | null;
    phone?: string | null;
    name?: string | null;
    city?: string | null;
    externalId?: string | null;
    ip?: string | null;
    userAgent?: string | null;
    fbp?: string | null;
    fbc?: string | null;
  };
}

/** Build one CAPI `data[]` entry. Values converted from poisha to currency units. */
export function buildCapiEvent(e: CapiEventInput) {
  const [firstName, ...rest] = (e.user.name ?? "").trim().split(/\s+/);
  const user_data: Record<string, unknown> = {
    ...hashUserData({
      email: e.user.email,
      phone: e.user.phone,
      firstName: firstName || null,
      lastName: rest.join(" ") || null,
      city: e.user.city,
      externalId: e.user.externalId,
    }),
  };
  if (e.user.ip) user_data.client_ip_address = e.user.ip;
  if (e.user.userAgent) user_data.client_user_agent = e.user.userAgent;
  if (e.user.fbp) user_data.fbp = e.user.fbp;
  if (e.user.fbc) user_data.fbc = e.user.fbc;

  const custom_data: Record<string, unknown> = {};
  if (e.items?.length) {
    custom_data.content_ids = e.items.map((i) => i.id);
    custom_data.content_type = "product";
    custom_data.contents = e.items.map((i) => ({ id: i.id, quantity: i.quantity, item_price: i.price / 100 }));
    custom_data.num_items = e.items.reduce((s, i) => s + i.quantity, 0);
    if (e.items.length === 1) custom_data.content_name = e.items[0]!.name;
  }
  if (e.value !== undefined) {
    custom_data.value = e.value / 100;
    custom_data.currency = e.currency ?? "BDT";
  }
  if (e.orderId) custom_data.order_id = e.orderId;
  if (e.searchString) custom_data.search_string = e.searchString;

  return {
    event_name: e.eventName,
    event_time: Math.floor((e.eventTime ?? new Date()).getTime() / 1000),
    event_id: e.eventId,
    action_source: "website" as const,
    ...(e.sourceUrl ? { event_source_url: e.sourceUrl } : {}),
    user_data,
    custom_data,
  };
}


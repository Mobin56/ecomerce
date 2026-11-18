/**
 * UTM / click-id attribution.
 *
 * A touch is captured on every landing that carries campaign info (or an
 * external referrer). We persist BOTH first touch and last non-direct touch in
 * a first-party cookie (90 days) and copy them onto the order at checkout.
 * Orders are credited to the last non-direct touch (standard last-click).
 */

export interface Touch {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  fbclid?: string;
  gclid?: string;
  landingPage?: string;
  referrer?: string;
  channel: Channel;
  at: string; // ISO
}

export type Channel =
  | "facebook_ads"
  | "google_ads"
  | "tiktok_ads"
  | "paid_other"
  | "email"
  | "sms"
  | "organic_search"
  | "organic_social"
  | "referral"
  | "direct";

export interface AttributionState {
  first: Touch;
  last: Touch;
}

const PARAM_MAP = {
  utm_source: "utmSource",
  utm_medium: "utmMedium",
  utm_campaign: "utmCampaign",
  utm_content: "utmContent",
  utm_term: "utmTerm",
  fbclid: "fbclid",
  gclid: "gclid",
} as const;

const SEARCH_ENGINES = ["google.", "bing.", "yahoo.", "duckduckgo.", "yandex.", "baidu."];
const SOCIAL = ["facebook.", "fb.", "instagram.", "messenger.", "t.co", "twitter.", "x.com", "linkedin.", "youtube.", "tiktok.", "pinterest.", "reddit."];
const PAID_MEDIUMS = ["cpc", "ppc", "paid", "paid_social", "paidsocial", "cpm", "display", "ads"];

function clean(v: string | null): string | undefined {
  if (!v) return undefined;
  const t = v.trim().slice(0, 200);
  return t || undefined;
}

function hostOf(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function classifyChannel(t: Omit<Touch, "channel" | "at">, siteHost?: string): Channel {
  const src = (t.utmSource ?? "").toLowerCase();
  const med = (t.utmMedium ?? "").toLowerCase();
  if (t.fbclid && (PAID_MEDIUMS.includes(med) || !t.utmSource)) {
    // fbclid is also added to organic FB link clicks; treat as ads only with paid medium or campaign tag.
    if (PAID_MEDIUMS.includes(med) || t.utmCampaign) return "facebook_ads";
  }
  if (t.gclid) return "google_ads";
  if (src || med) {
    if (med === "email" || src.includes("newsletter") || src === "email") return "email";
    if (med === "sms" || src === "sms") return "sms";
    const paid = PAID_MEDIUMS.includes(med);
    if (/(facebook|fb|instagram|ig|meta)/.test(src)) return paid || t.utmCampaign ? "facebook_ads" : "organic_social";
    if (src.includes("google")) return paid ? "google_ads" : "organic_search";
    if (src.includes("tiktok")) return paid ? "tiktok_ads" : "organic_social";
    if (paid) return "paid_other";
    return "referral";
  }
  if (t.fbclid) return "organic_social";
  const ref = hostOf(t.referrer);
  if (ref && ref !== siteHost && !(siteHost && ref.endsWith(`.${siteHost}`))) {
    if (SEARCH_ENGINES.some((s) => ref.includes(s))) return "organic_search";
    if (SOCIAL.some((s) => ref.includes(s))) return "organic_social";
    return "referral";
  }
  return "direct";
}

/** Build a touch from the landing URL + document.referrer. Returns null for internal navigation. */
export function touchFromLanding(url: string, referrer: string | null, now = new Date()): Touch | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const partial: Omit<Touch, "channel" | "at"> = {};
  for (const [param, key] of Object.entries(PARAM_MAP)) {
    const v = clean(u.searchParams.get(param));
    if (v) partial[key] = v;
  }
  const ref = clean(referrer);
  const refHost = hostOf(ref);
  const isInternal = refHost !== null && (refHost === u.hostname || refHost.endsWith(`.${u.hostname}`));
  const hasCampaign = Object.keys(partial).length > 0;
  if (!hasCampaign && isInternal) return null;
  if (ref && !isInternal) partial.referrer = ref;
  partial.landingPage = `${u.pathname}${u.search}`.slice(0, 500);
  return { ...partial, channel: classifyChannel(partial, u.hostname), at: now.toISOString() };
}

/**
 * Merge a new touch into existing state.
 * - first touch is kept forever (until cookie expiry)
 * - last touch is replaced unless the new touch is "direct" (direct never overrides a known source)
 */
export function mergeTouch(state: AttributionState | null, touch: Touch | null): AttributionState | null {
  if (!touch) return state;
  if (!state) return { first: touch, last: touch };
  if (touch.channel === "direct") return state;
  return { first: state.first, last: touch };
}

// Edge-runtime safe base64url (middleware runs without Buffer).
function b64urlEncode(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(raw: string): string {
  const b64 = raw.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((raw.length + 3) % 4);
  const bin = atob(b64);
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export function encodeAttribution(s: AttributionState): string {
  return b64urlEncode(JSON.stringify(s));
}

export function decodeAttribution(raw: string | undefined | null): AttributionState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(b64urlDecode(raw)) as AttributionState;
    if (!parsed?.first?.channel || !parsed?.last?.channel) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Human readable source for admin: "Facebook Ads → Summer Sale" */
export function describeSource(t: Pick<Touch, "channel" | "utmCampaign" | "utmSource">): string {
  const names: Record<Channel, string> = {
    facebook_ads: "Facebook Ads",
    google_ads: "Google Ads",
    tiktok_ads: "TikTok Ads",
    paid_other: "Paid",
    email: "Email",
    sms: "SMS",
    organic_search: "Organic Search",
    organic_social: "Organic Social",
    referral: "Referral",
    direct: "Direct",
  };
  const base = names[t.channel] ?? t.channel;
  return t.utmCampaign ? `${base} → ${t.utmCampaign}` : t.utmSource && t.channel === "referral" ? `${base} (${t.utmSource})` : base;
}

/** Meta's fbc cookie format: fb.1.<ts>.<fbclid> */
export function buildFbc(fbclid: string, at: Date = new Date()): string {
  return `fb.1.${at.getTime()}.${fbclid}`;
}

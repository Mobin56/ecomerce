import "server-only";
import { cache } from "react";
import { z } from "zod";
import { db } from "./db";
import { decryptSecret, encryptSecret } from "./crypto";
import { DEFAULT_RISK_CONFIG } from "@/core/risk";
import { DEFAULT_SEGMENT_CONFIG } from "@/core/segments";

/**
 * All business configuration lives in the `settings` table (one JSON row per
 * section) — nothing is hardcoded. Each section has a schema with defaults.
 * Fields listed in SECRET_FIELDS are encrypted at rest and never sent to the
 * browser in clear text.
 */

const money = z.number().int().min(0);

export const SETTINGS_SCHEMAS = {
  general: z.object({
    maintenanceMode: z.boolean().default(false),
    timezone: z.string().default("Asia/Dhaka"),
    currency: z.literal("BDT").default("BDT"),
  }),
  store: z.object({
    name: z.string().default("Your Store"),
    tagline: z.string().default("Premium quality, delivered fast"),
    logoUrl: z.string().default(""),
    supportPhone: z.string().default(""),
    supportEmail: z.string().default(""),
    whatsapp: z.string().default(""),
    address: z.string().default(""),
    facebookUrl: z.string().default(""),
    instagramUrl: z.string().default(""),
    returnPolicySummary: z.string().default("7-day easy returns"),
    warrantySummary: z.string().default(""),
  }),
  shipping: z.object({
    freeShippingThreshold: money.nullable().default(3000_00),
    defaultWeightGrams: z.number().int().default(500),
  }),
  courier: z.object({
    defaultCourier: z.string().default("mock"),
    autoCreateOnConfirm: z.boolean().default(false),
  }),
  payment: z.object({
    enabled: z.array(z.string()).default(["cod"]),
    codMaxAmount: money.nullable().default(null),
    fees: z.record(z.object({ percent: z.number().min(0).max(10), fixed: money })).default({
      cod: { percent: 1, fixed: 0 }, // courier COD charge
      sslcommerz: { percent: 2.5, fixed: 0 },
      bkash: { percent: 1.85, fixed: 0 },
      nagad: { percent: 1.5, fixed: 0 },
      rocket: { percent: 1.8, fixed: 0 },
    }),
    manualMfsNumbers: z.record(z.string()).default({ bkash: "", nagad: "", rocket: "" }),
  }),
  tax: z.object({ enabled: z.boolean().default(false), ratePercent: z.number().min(0).max(30).default(0), inclusive: z.boolean().default(true) }),
  meta: z.object({
    pixelEnabled: z.boolean().default(false),
    capiEnabled: z.boolean().default(false),
    pixelId: z.string().default(""),
    capiAccessToken: z.string().default(""),
    testEventCode: z.string().default(""),
  }),
  google: z.object({
    ga4MeasurementId: z.string().default(""),
    ga4ApiSecret: z.string().default(""),
    gtmId: z.string().default(""),
    googleAdsId: z.string().default(""),
    googleAdsPurchaseLabel: z.string().default(""),
  }),
  seo: z.object({
    defaultTitle: z.string().default("Your Store — Shop Online in Bangladesh"),
    titleTemplate: z.string().default("%s | Your Store"),
    defaultDescription: z.string().default("Shop premium products with fast delivery across Bangladesh. Cash on delivery available."),
    ogImage: z.string().default(""),
  }),
  notifications: z.object({
    adminEmails: z.array(z.string().email()).default([]),
    adminPhones: z.array(z.string()).default([]),
    customerSms: z.boolean().default(true),
    customerEmail: z.boolean().default(true),
    customerWhatsapp: z.boolean().default(false),
    lowStockAlerts: z.boolean().default(true),
  }),
  email: z.object({ fromName: z.string().default("Your Store"), replyTo: z.string().default("") }),
  sms: z.object({ senderId: z.string().default(""), apiKey: z.string().default("") }),
  whatsapp: z.object({ enabled: z.boolean().default(false), phoneNumberId: z.string().default(""), token: z.string().default("") }),
  security: z.object({
    require2faForAdmins: z.boolean().default(false),
    adminSessionHours: z.number().int().min(1).max(720).default(12),
    customerSessionDays: z.number().int().min(1).max(365).default(30),
    maxLoginAttempts: z.number().int().min(3).max(20).default(5),
  }),
  risk: z
    .object({
      weights: z.record(z.number()),
      thresholds: z.object({ medium: z.number(), high: z.number() }),
      unusualQuantity: z.number(),
      highValueMultiplier: z.number(),
      autoRejectHigh: z.boolean(),
    })
    .default(DEFAULT_RISK_CONFIG),
  segments: z
    .object({ vipMinSpent: money, vipMinOrders: z.number().int(), highValueMinAov: money, inactiveDays: z.number().int(), riskCancelRate: z.number() })
    .default(DEFAULT_SEGMENT_CONFIG),
  abandonedCart: z.object({
    enabled: z.boolean().default(true),
    afterMinutes: z.number().int().min(15).default(60),
    maxAttempts: z.number().int().min(0).max(3).default(2),
    hoursBetween: z.number().int().min(6).default(24),
    channels: z.array(z.enum(["EMAIL", "SMS", "WHATSAPP", "PUSH"])).default(["SMS"]),
    couponCode: z.string().default(""),
  }),
  ai: z.object({
    productWriter: z.boolean().default(true),
    businessAssistant: z.boolean().default(true),
    supportChatbot: z.boolean().default(true),
    tone: z.string().default("Friendly, premium, concise"),
  }),
  system: z.object({ lastBackupAt: z.string().nullable().default(null), backupNote: z.string().default("") }),
} as const;

export type SettingsKey = keyof typeof SETTINGS_SCHEMAS;
export type Settings<K extends SettingsKey> = z.infer<(typeof SETTINGS_SCHEMAS)[K]>;

export const SECRET_FIELDS: Partial<Record<SettingsKey, string[]>> = {
  meta: ["capiAccessToken"],
  google: ["ga4ApiSecret"],
  sms: ["apiKey"],
  whatsapp: ["token"],
};

/** Env fallbacks so a fresh install works from .env before anything is saved in Admin. */
function envDefaults(key: SettingsKey): Record<string, unknown> {
  const e = process.env;
  if (key === "meta")
    return {
      pixelId: e.META_PIXEL_ID ?? "",
      capiAccessToken: e.META_CAPI_ACCESS_TOKEN ?? "",
      testEventCode: e.META_TEST_EVENT_CODE ?? "",
      pixelEnabled: Boolean(e.META_PIXEL_ID),
      capiEnabled: Boolean(e.META_CAPI_ACCESS_TOKEN),
    };
  if (key === "google")
    return { ga4MeasurementId: e.GA4_MEASUREMENT_ID ?? "", ga4ApiSecret: e.GA4_API_SECRET ?? "", gtmId: e.GTM_ID ?? "", googleAdsId: e.GOOGLE_ADS_ID ?? "" };
  if (key === "store") return { name: e.NEXT_PUBLIC_SITE_NAME ?? "Your Store" };
  return {};
}

function decryptFields(key: SettingsKey, value: Record<string, unknown>): Record<string, unknown> {
  const fields = SECRET_FIELDS[key] ?? [];
  const out = { ...value };
  for (const f of fields) {
    const v = out[f];
    if (typeof v === "string" && v.startsWith("v1:")) {
      try {
        out[f] = decryptSecret(v);
      } catch {
        out[f] = "";
      }
    }
  }
  return out;
}

/** Per-request cached read. */
export const getSettings = cache(async <K extends SettingsKey>(key: K): Promise<Settings<K>> => {
  const row = await db.setting.findUnique({ where: { key } });
  const stored = row ? decryptFields(key, row.value as Record<string, unknown>) : {};
  const merged = { ...envDefaults(key), ...stored };
  return SETTINGS_SCHEMAS[key].parse(merged) as Settings<K>;
});

/**
 * Save a section. Secret fields left blank (or equal to the masked value)
 * keep their previous value, so admins can save forms without re-typing tokens.
 */
export async function saveSettings<K extends SettingsKey>(key: K, input: unknown): Promise<{ before: Settings<K>; after: Settings<K> }> {
  const before = await getSettings(key);
  const parsed = SETTINGS_SCHEMAS[key].parse(input) as Record<string, unknown>;
  const toStore: Record<string, unknown> = { ...parsed };
  for (const f of SECRET_FIELDS[key] ?? []) {
    const v = parsed[f];
    const prev = (before as Record<string, unknown>)[f];
    if (typeof v !== "string" || v === "" || v.includes("••••")) {
      toStore[f] = typeof prev === "string" && prev ? encryptSecret(prev) : "";
    } else {
      toStore[f] = encryptSecret(v);
    }
  }
  await db.setting.upsert({ where: { key }, create: { key, value: toStore as object }, update: { value: toStore as object } });
  const after = SETTINGS_SCHEMAS[key].parse(decryptFields(key, toStore)) as Settings<K>;
  return { before, after };
}

/** Public, browser-safe tracking config (no tokens). */
export async function getPublicTrackingConfig() {
  const [meta, google] = await Promise.all([getSettings("meta"), getSettings("google")]);
  return {
    metaPixelId: meta.pixelEnabled && meta.pixelId ? meta.pixelId : null,
    ga4Id: google.ga4MeasurementId || null,
    gtmId: google.gtmId || null,
    googleAdsId: google.googleAdsId || null,
    googleAdsPurchaseLabel: google.googleAdsPurchaseLabel || null,
  };
}
export type PublicTrackingConfig = Awaited<ReturnType<typeof getPublicTrackingConfig>>;

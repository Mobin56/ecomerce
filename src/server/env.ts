import "server-only";
import { z } from "zod";

const bool = z
  .enum(["true", "false", "1", "0", ""])
  .optional()
  .transform((v) => v === "true" || v === "1");

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  NEXT_PUBLIC_SITE_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_SITE_NAME: z.string().default("Store"),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().optional(),
  APP_ENCRYPTION_KEY: z.string().min(40, "APP_ENCRYPTION_KEY must be 32 random bytes, base64"),
  SESSION_SECRET: z.string().min(32),
  CRON_SECRET: z.string().min(16).optional(),

  META_PIXEL_ID: z.string().optional(),
  META_CAPI_ACCESS_TOKEN: z.string().optional(),
  META_TEST_EVENT_CODE: z.string().optional(),
  GA4_MEASUREMENT_ID: z.string().optional(),
  GA4_API_SECRET: z.string().optional(),
  GTM_ID: z.string().optional(),
  GOOGLE_ADS_ID: z.string().optional(),

  SSLCOMMERZ_STORE_ID: z.string().optional(),
  SSLCOMMERZ_STORE_PASSWORD: z.string().optional(),
  SSLCOMMERZ_SANDBOX: bool,
  BKASH_APP_KEY: z.string().optional(),
  BKASH_APP_SECRET: z.string().optional(),
  BKASH_USERNAME: z.string().optional(),
  BKASH_PASSWORD: z.string().optional(),
  BKASH_SANDBOX: bool,

  STEADFAST_API_KEY: z.string().optional(),
  STEADFAST_SECRET_KEY: z.string().optional(),
  PATHAO_CLIENT_ID: z.string().optional(),
  PATHAO_CLIENT_SECRET: z.string().optional(),
  PATHAO_USERNAME: z.string().optional(),
  PATHAO_PASSWORD: z.string().optional(),
  PATHAO_STORE_ID: z.string().optional(),
  PATHAO_SANDBOX: bool,
  REDX_API_TOKEN: z.string().optional(),
  REDX_SANDBOX: bool,

  STORAGE_ENDPOINT: z.string().optional(),
  STORAGE_REGION: z.string().default("auto"),
  STORAGE_BUCKET: z.string().optional(),
  STORAGE_ACCESS_KEY_ID: z.string().optional(),
  STORAGE_SECRET_ACCESS_KEY: z.string().optional(),
  STORAGE_PUBLIC_BASE_URL: z.string().optional(),

  EMAIL_PROVIDER: z.enum(["log", "resend"]).default("log"),
  EMAIL_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("Store <no-reply@example.com>"),
  SMS_PROVIDER: z.enum(["log", "http"]).default("log"),
  SMS_API_URL: z.string().optional(),
  SMS_API_KEY: z.string().optional(),
  SMS_SENDER_ID: z.string().optional(),
  WHATSAPP_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),

  AI_PROVIDER: z.enum(["anthropic", "openai", "none"]).default("anthropic"),
  AI_API_KEY: z.string().optional(),
  AI_MODEL: z.string().default("claude-sonnet-4-5"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

/** Validated server env. Throws a readable error at first use if misconfigured. */
export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export const siteUrl = () => env().NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");

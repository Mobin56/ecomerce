import { z } from "zod";
import { normalizeBDPhone } from "@/core/phone";
import { DISTRICTS } from "@/core/locations";

/** Shared zod schemas — used by API routes and server actions (never trust the client). */

const trimmed = (max: number) => z.string().trim().max(max);
/** Money entered in Taka in forms → poisha integer. */
export const takaToPoisha = z.coerce.number().min(0).max(10_000_000).transform((v) => Math.round(v * 100));
export const optionalTaka = z.union([z.literal(""), z.null(), z.undefined(), z.coerce.number().min(0)]).transform((v) => (v === "" || v === null || v === undefined ? null : Math.round(Number(v) * 100)));

export const bdPhone = z.string().trim().transform((v, ctx) => {
  const p = normalizeBDPhone(v);
  if (!p) {
    ctx.addIssue({ code: "custom", message: "Enter a valid mobile number (01XXXXXXXXX)" });
    return z.NEVER;
  }
  return p;
});

export const slug = z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and dashes").max(120);

export function slugify(s: string) {
  return s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100) || "item";
}

// ---------------- Storefront ----------------

export const cartAddSchema = z.object({ variantId: z.string().cuid(), quantity: z.number().int().min(1).max(50), eventId: z.string().max(80).optional() });
export const cartUpdateSchema = z.object({ variantId: z.string().cuid(), quantity: z.number().int().min(0).max(50), newVariantId: z.string().cuid().optional() });
export const couponSchema = z.object({ code: z.string().trim().min(2).max(40).nullable() });

export const checkoutSchema = z.object({
  name: trimmed(80).min(2, "Please enter your name"),
  phone: bdPhone,
  email: z.union([z.literal(""), z.string().trim().email("Invalid email").max(120)]).optional(),
  district: z.string().refine((d) => DISTRICTS.includes(d), "Select your district"),
  area: trimmed(80).min(2, "Enter your area / thana"),
  address: trimmed(300).min(8, "Enter your full address (house, road, area)"),
  paymentMethod: z.string().min(2).max(30),
  notes: trimmed(500).optional(),
  idempotencyKey: z.string().uuid(),
  eventId: z.string().max(80).optional(),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;

export const checkoutContactSchema = z.object({ phone: z.string().max(20).optional(), email: z.string().max(120).optional(), name: z.string().max(80).optional() });

export const trackEventSchema = z.object({
  event: z.enum(["PageView", "ViewContent", "Search", "AddToCart", "InitiateCheckout", "AddPaymentInfo", "AddToWishlist"]),
  eventId: z.string().min(6).max(80),
  url: z.string().url().max(1000),
  productId: z.string().cuid().optional(),
  value: z.number().int().min(0).max(1_000_000_000).optional(),
  searchString: z.string().max(100).optional(),
  items: z.array(z.object({ id: z.string().max(40), name: z.string().max(200), price: z.number().int().min(0), quantity: z.number().int().min(1).max(50) })).max(50).optional(),
});

export const reviewSchema = z.object({
  productId: z.string().cuid(),
  rating: z.number().int().min(1).max(5),
  title: trimmed(100).optional(),
  body: trimmed(2000).min(10, "Please write at least a few words"),
  name: trimmed(60).min(2),
  phone: bdPhone.optional(),
  images: z.array(z.string().url().max(500)).max(4).default([]),
});

export const orderLookupSchema = z.object({ orderNumber: z.string().trim().regex(/^#?\d{1,10}$/, "Enter your order number"), phone: bdPhone });

export const customerRegisterSchema = z.object({ name: trimmed(80).min(2), phone: bdPhone, email: z.union([z.literal(""), z.string().email()]).optional(), password: z.string().min(8).max(100) });
export const customerLoginSchema = z.object({ phone: bdPhone, password: z.string().min(1).max(100) });

// ---------------- Admin ----------------

export const variantInputSchema = z.object({
  id: z.string().optional(),
  sku: trimmed(64).min(1),
  title: trimmed(120),
  options: z.record(z.string()).default({}),
  price: optionalTaka,
  salePrice: optionalTaka,
  costPrice: optionalTaka,
  stock: z.coerce.number().int().min(0).max(1_000_000).default(0),
  weightGrams: z.union([z.literal(""), z.null(), z.coerce.number().int().min(0)]).transform((v) => (v === "" || v === null ? null : Number(v))).optional(),
  imageUrl: z.string().max(500).optional().nullable(),
  isActive: z.boolean().default(true),
});

export const productInputSchema = z
  .object({
    name: trimmed(200).min(2),
    slug: slug.optional().or(z.literal("")),
    sku: trimmed(64).min(1),
    barcode: trimmed(64).optional().nullable(),
    shortDescription: trimmed(500).optional().nullable(),
    description: z.string().max(50_000).optional().nullable(),
    brandId: z.string().optional().nullable(),
    categoryId: z.string().optional().nullable(),
    subcategoryId: z.string().optional().nullable(),
    tags: z.array(trimmed(40)).max(30).default([]),
    regularPrice: takaToPoisha,
    salePrice: optionalTaka,
    costPrice: takaToPoisha.default(0),
    lowStockThreshold: z.coerce.number().int().min(0).max(10_000).default(5),
    weightGrams: z.union([z.literal(""), z.null(), z.coerce.number().int().min(0)]).transform((v) => (v === "" || v === null ? null : Number(v))).optional(),
    lengthCm: z.coerce.number().min(0).optional().nullable(),
    widthCm: z.coerce.number().min(0).optional().nullable(),
    heightCm: z.coerce.number().min(0).optional().nullable(),
    videoUrl: z.string().url().max(500).optional().nullable().or(z.literal("")),
    warranty: trimmed(200).optional().nullable(),
    optionNames: z.array(trimmed(30)).max(4).default([]),
    status: z.enum(["DRAFT", "ACTIVE", "INACTIVE", "OUT_OF_STOCK", "ARCHIVED"]),
    isFeatured: z.boolean().default(false),
    seoTitle: trimmed(70).optional().nullable(),
    seoDescription: trimmed(170).optional().nullable(),
    seoKeywords: z.array(trimmed(40)).max(20).default([]),
    images: z.array(z.object({ url: z.string().max(500), alt: trimmed(200).optional().nullable() })).max(15).default([]),
    attributes: z.array(z.object({ name: trimmed(60).min(1), value: trimmed(300).min(1) })).max(40).default([]),
    variants: z.array(variantInputSchema).min(1).max(200),
  })
  .refine((p) => p.salePrice === null || p.salePrice < p.regularPrice, { message: "Sale price must be lower than regular price", path: ["salePrice"] });
export type ProductInput = z.infer<typeof productInputSchema>;

export const categorySchema = z.object({
  name: trimmed(80).min(2),
  slug: slug.optional().or(z.literal("")),
  parentId: z.string().optional().nullable(),
  description: trimmed(500).optional().nullable(),
  imageUrl: z.string().max(500).optional().nullable(),
  position: z.coerce.number().int().default(0),
  isActive: z.boolean().default(true),
  seoTitle: trimmed(70).optional().nullable(),
  seoDescription: trimmed(170).optional().nullable(),
});

export const couponInputSchema = z
  .object({
    code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,30}$/, "3-30 letters/numbers"),
    description: trimmed(200).optional().nullable(),
    type: z.enum(["PERCENTAGE", "FIXED", "FREE_SHIPPING"]),
    value: z.coerce.number().min(0),
    minOrder: takaToPoisha.default(0),
    maxDiscount: optionalTaka,
    productIds: z.array(z.string()).default([]),
    categoryIds: z.array(z.string()).default([]),
    customerPhones: z.array(bdPhone).default([]),
    firstOrderOnly: z.boolean().default(false),
    usageLimit: z.union([z.literal(""), z.null(), z.coerce.number().int().min(1)]).transform((v) => (v === "" || v === null ? null : Number(v))),
    perCustomerLimit: z.union([z.literal(""), z.null(), z.coerce.number().int().min(1)]).transform((v) => (v === "" || v === null ? null : Number(v))),
    startsAt: z.coerce.date().optional().nullable(),
    expiresAt: z.coerce.date().optional().nullable(),
    isActive: z.boolean().default(true),
  })
  .transform((c) => ({ ...c, value: c.type === "FIXED" ? Math.round(c.value * 100) : Math.round(c.value) }))
  .refine((c) => c.type !== "PERCENTAGE" || (c.value > 0 && c.value <= 100), { message: "Percentage must be 1-100", path: ["value"] });

export const expenseSchema = z.object({ category: trimmed(40).min(2), amount: takaToPoisha, date: z.coerce.date(), note: trimmed(300).optional().nullable() });
export const adSpendSchema = z.object({ campaignId: z.string(), date: z.coerce.date(), amount: takaToPoisha, impressions: z.coerce.number().int().optional().nullable(), clicks: z.coerce.number().int().optional().nullable() });
export const campaignSchema = z.object({ name: trimmed(100).min(2), utmCampaign: trimmed(100).min(1), platform: z.enum(["facebook", "google", "tiktok", "email", "sms", "other"]), budget: optionalTaka, startsAt: z.coerce.date().optional().nullable(), endsAt: z.coerce.date().optional().nullable() });
export const adminUserSchema = z.object({ name: trimmed(80).min(2), email: z.string().trim().toLowerCase().email(), roleId: z.string(), password: z.string().min(10).max(100).optional().or(z.literal("")), isActive: z.boolean().default(true) });

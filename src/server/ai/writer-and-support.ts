import "server-only";
import { db } from "../db";
import { getSettings } from "../settings";
import { aiConfigured, complete, parseJsonBlock } from "./provider";
import { AppError } from "../errors";
import { normalizeBDPhone } from "@/core/phone";
import { STATUS_LABELS, type OrderStatus } from "@/core/order-status";
import { formatMoney } from "@/core/money";
import { tokenize } from "@/core/search";
import { sanitizeBasicHtml } from "@/lib/sanitize";

export interface ProductCopy {
  title: string;
  shortDescription: string;
  description: string;
  seoTitle: string;
  metaDescription: string;
  socialCaption: string;
}

/** AI Product Writer. Admin reviews the draft before saving — nothing is published automatically. */
export async function generateProductCopy(input: { name: string; info: string; category?: string }): Promise<ProductCopy> {
  if (!aiConfigured()) throw new AppError("AI_NOT_CONFIGURED", "Set AI_API_KEY to use the product writer.", 503);
  const [ai, store] = await Promise.all([getSettings("ai"), getSettings("store")]);
  const text = await complete(
    `You write eCommerce product copy for "${store.name}", an online store in Bangladesh. Tone: ${ai.tone}.
Only use facts given by the user; never invent specifications, materials, certifications or guarantees.
Respond with ONLY a JSON object with keys: title (max 70 chars), shortDescription (max 160 chars), description (HTML using <p>, <ul>, <li>, <strong> only, 120-250 words), seoTitle (max 60 chars), metaDescription (max 155 chars), socialCaption (Facebook post, 1-3 short lines, 2-4 relevant emojis, ends with a call to order).`,
    `Product name: ${input.name}\nCategory: ${input.category ?? "-"}\nInformation:\n${input.info.slice(0, 3000)}`,
    1500,
  );
  const copy = parseJsonBlock<ProductCopy>(text);
  return {
    title: String(copy.title ?? input.name).slice(0, 120),
    shortDescription: String(copy.shortDescription ?? "").slice(0, 300),
    description: sanitizeBasicHtml(String(copy.description ?? "")),
    seoTitle: String(copy.seoTitle ?? "").slice(0, 70),
    metaDescription: String(copy.metaDescription ?? "").slice(0, 170),
    socialCaption: String(copy.socialCaption ?? "").slice(0, 600),
  };
}

/**
 * Customer support chatbot. Answers from store policies, FAQ and catalogue.
 * Order-specific info is ONLY returned after the customer provides an order
 * number + matching phone number (authentication); otherwise it asks for them.
 */
export async function supportReply(message: string, auth?: { orderNumber?: string; phone?: string }): Promise<{ reply: string; needsAuth?: boolean }> {
  const m = message.toLowerCase();
  const wantsOrder = /order|track|where is|delivery status|parcel|অর্ডার/.test(m) && /my|status|track|where|কোথায়/.test(m);
  if (wantsOrder || auth?.orderNumber) {
    if (!auth?.orderNumber || !auth.phone) return { reply: "I can check your order. Please share your order number and the phone number used for the order.", needsAuth: true };
    const phone = normalizeBDPhone(auth.phone);
    const number = Number.parseInt(auth.orderNumber.replace(/\D/g, ""), 10);
    const order = phone && Number.isFinite(number) ? await db.order.findFirst({ where: { number, shipPhone: phone }, include: { shipments: { orderBy: { createdAt: "desc" }, take: 1 } } }) : null;
    // Same message whether the order doesn't exist or the phone doesn't match — no enumeration.
    if (!order) return { reply: "I couldn't find an order with that number and phone. Please double-check both, or contact us.", needsAuth: true };
    const s = order.shipments[0];
    return {
      reply: `Order #${order.number} is ${STATUS_LABELS[order.status as OrderStatus].toLowerCase()} (total ${formatMoney(order.total)}).${s?.trackingId ? ` Courier tracking: ${s.trackingId}.` : ""}`,
    };
  }

  const [store, faqs, pages, payment] = await Promise.all([
    getSettings("store"),
    db.faq.findMany({ where: { isActive: true }, orderBy: { position: "asc" } }),
    db.page.findMany({ where: { slug: { in: ["shipping-policy", "return-policy"] }, isPublished: true }, select: { slug: true, title: true, content: true } }),
    getSettings("payment"),
  ]);
  const zones = await db.shippingZone.findMany({ where: { isActive: true }, orderBy: { position: "asc" } });
  const context = [
    `Store: ${store.name}. Support phone: ${store.supportPhone || "see website"}. WhatsApp: ${store.whatsapp || "-"}.`,
    `Delivery: ${zones.map((z) => `${z.name}: ${formatMoney(z.charge)}, ${z.minDays}-${z.maxDays} days`).join("; ")}.`,
    `Payment methods: ${payment.enabled.join(", ")}.`,
    `Returns: ${store.returnPolicySummary}.`,
    ...pages.map((p) => `${p.title}: ${p.content.replace(/<[^>]+>/g, " ").slice(0, 1500)}`),
    ...faqs.map((f) => `Q: ${f.question}\nA: ${f.answer}`),
  ].join("\n\n");

  if (aiConfigured()) {
    const products = await db.product.findMany({ where: { status: "ACTIVE", name: { contains: tokenize(message)[0] ?? "", mode: "insensitive" } }, select: { name: true, slug: true, regularPrice: true, salePrice: true }, take: 5 });
    const reply = await complete(
      `You are the friendly support assistant of ${store.name}. Answer in the customer's language (Bangla or English), max 4 sentences.
Use ONLY the store information below. If the answer isn't there, say you're not sure and give the support phone. Never make up prices, policies or delivery times.
Never reveal order details — order questions require the order number + phone.\n\nSTORE INFORMATION:\n${context}\n\nMATCHING PRODUCTS:\n${products.map((p) => `${p.name}: ${formatMoney(p.salePrice ?? p.regularPrice)} — /products/${p.slug}`).join("\n") || "none"}`,
      message.slice(0, 800),
      400,
    );
    return { reply };
  }

  // No AI: best FAQ match by token overlap.
  const q = new Set(tokenize(message));
  const best = faqs
    .map((f) => ({ f, score: tokenize(`${f.question} ${f.answer}`).filter((t) => q.has(t)).length }))
    .sort((a, b) => b.score - a.score)[0];
  if (best && best.score >= 2) return { reply: best.f.answer };
  if (/deliver|shipping|charge|ডেলিভারি/.test(m)) return { reply: `Delivery: ${zones.map((z) => `${z.name} ${formatMoney(z.charge)} (${z.minDays}-${z.maxDays} days)`).join(", ")}.` };
  if (/return|refund|exchange|ফেরত/.test(m)) return { reply: store.returnPolicySummary };
  if (/pay|bkash|nagad|cash|card/.test(m)) return { reply: `We accept: ${payment.enabled.join(", ").replace("cod", "Cash on Delivery")}.` };
  return { reply: `I'm not sure about that. Please contact us${store.supportPhone ? ` at ${store.supportPhone}` : ""}.` };
}

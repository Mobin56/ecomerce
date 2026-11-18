"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { action, AppError, type ActionResult } from "@/server/errors";
import { requireAdmin } from "@/server/auth/admin";
import { logActivity } from "@/server/activity";
import { db } from "@/server/db";
import { sanitizeBasicHtml } from "@/lib/sanitize";
import { slug as slugSchema } from "@/validation";

type R = Promise<ActionResult<unknown>>;
const SECTION_TYPES = ["announcement", "hero", "categories", "flash_sale", "best_sellers", "new_arrivals", "trending", "recommended", "promo", "reviews", "faq", "newsletter"] as const;

export async function saveSectionAction(_: unknown, fd: FormData): R {
  return action(async () => {
    const admin = await requireAdmin("content.manage");
    const d = z.object({ id: z.string().optional(), type: z.enum(SECTION_TYPES), title: z.string().max(200).optional(), subtitle: z.string().max(300).optional(), position: z.coerce.number().int(), config: z.string().max(20_000) }).parse(Object.fromEntries(fd));
    let config: unknown;
    try {
      config = JSON.parse(d.config || "{}");
    } catch {
      throw new AppError("BAD_JSON", "Config must be valid JSON.");
    }
    const data = { type: d.type, title: d.title || null, subtitle: d.subtitle || null, position: d.position, enabled: fd.get("enabled") === "on", config: config as object };
    const saved = d.id ? await db.homepageSection.update({ where: { id: d.id }, data }) : await db.homepageSection.create({ data });
    await logActivity({ userId: admin.id, action: "homepage.section_saved", entityType: "homepage_section", entityId: saved.id, after: { type: saved.type, enabled: saved.enabled, position: saved.position } });
    revalidateTag("homepage");
    revalidatePath("/admin/content/homepage");
  }, "Section saved");
}

export async function moveSectionAction(_: unknown, fd: FormData): R {
  return action(async () => {
    await requireAdmin("content.manage");
    const { id, dir } = z.object({ id: z.string(), dir: z.enum(["up", "down"]) }).parse(Object.fromEntries(fd));
    const all = await db.homepageSection.findMany({ orderBy: { position: "asc" } });
    const i = all.findIndex((s) => s.id === id);
    const j = dir === "up" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= all.length) return;
    const reordered = [...all];
    [reordered[i], reordered[j]] = [reordered[j]!, reordered[i]!];
    await db.$transaction(reordered.map((s, idx) => db.homepageSection.update({ where: { id: s.id }, data: { position: idx } })));
    revalidateTag("homepage");
    revalidatePath("/admin/content/homepage");
  });
}

export async function deleteSectionAction(_: unknown, fd: FormData): R {
  return action(async () => {
    await requireAdmin("content.manage");
    await db.homepageSection.delete({ where: { id: String(fd.get("id")) } });
    revalidateTag("homepage");
    revalidatePath("/admin/content/homepage");
  }, "Section deleted");
}

export async function savePageAction(_: unknown, fd: FormData): R {
  return action(async () => {
    const admin = await requireAdmin("content.manage");
    const d = z.object({ id: z.string().optional(), slug: slugSchema, title: z.string().min(2).max(120), content: z.string().max(100_000), seoTitle: z.string().max(70).optional(), seoDescription: z.string().max(170).optional() }).parse(Object.fromEntries(fd));
    const data = { slug: d.slug, title: d.title, content: sanitizeBasicHtml(d.content), isPublished: fd.get("isPublished") === "on", seoTitle: d.seoTitle || null, seoDescription: d.seoDescription || null };
    const saved = d.id ? await db.page.update({ where: { id: d.id }, data }) : await db.page.create({ data });
    await logActivity({ userId: admin.id, action: "page.saved", entityType: "page", entityId: saved.id, after: { slug: saved.slug } });
    revalidatePath(`/pages/${saved.slug}`);
    revalidatePath("/admin/content/pages");
  }, "Page saved");
}

export async function saveFaqAction(_: unknown, fd: FormData): R {
  return action(async () => {
    await requireAdmin("content.manage");
    const d = z.object({ id: z.string().optional(), question: z.string().min(3).max(300), answer: z.string().min(2).max(3000), group: z.string().max(40).default("general"), position: z.coerce.number().int().default(0) }).parse(Object.fromEntries(fd));
    const data = { question: d.question, answer: d.answer, group: d.group, position: d.position, isActive: fd.get("isActive") === "on" };
    if (d.id) await db.faq.update({ where: { id: d.id }, data });
    else await db.faq.create({ data });
    revalidateTag("homepage");
    revalidatePath("/admin/content/pages");
  }, "FAQ saved");
}

export async function saveBlogPostAction(_: unknown, fd: FormData): R {
  return action(async () => {
    await requireAdmin("content.manage");
    const d = z.object({ id: z.string().optional(), slug: slugSchema, title: z.string().min(2).max(200), excerpt: z.string().max(300).optional(), content: z.string().max(100_000), coverUrl: z.string().max(500).optional() }).parse(Object.fromEntries(fd));
    const data = { slug: d.slug, title: d.title, excerpt: d.excerpt || null, content: sanitizeBasicHtml(d.content), coverUrl: d.coverUrl || null, publishedAt: fd.get("publish") === "on" ? new Date() : null };
    if (d.id) await db.blogPost.update({ where: { id: d.id }, data });
    else await db.blogPost.create({ data });
    revalidatePath("/blog");
    revalidatePath("/admin/content/pages");
  }, "Post saved");
}

export async function moderateReviewAction(_: unknown, fd: FormData): R {
  return action(async () => {
    const admin = await requireAdmin("reviews.moderate");
    const d = z.object({ id: z.string(), status: z.enum(["APPROVED", "REJECTED", "PENDING"]).optional(), reply: z.string().max(1000).optional() }).parse(Object.fromEntries(fd));
    const review = await db.review.update({
      where: { id: d.id },
      data: { ...(d.status ? { status: d.status } : {}), ...(d.reply !== undefined ? { adminReply: d.reply || null, repliedById: admin.id, repliedAt: new Date() } : {}) },
    });
    // Keep denormalised rating in sync.
    const agg = await db.review.aggregate({ where: { productId: review.productId, status: "APPROVED" }, _avg: { rating: true }, _count: true });
    const product = await db.product.update({ where: { id: review.productId }, data: { ratingAvg: agg._avg.rating ?? 0, ratingCount: agg._count } });
    await logActivity({ userId: admin.id, action: "review.moderated", entityType: "review", entityId: d.id, after: { status: d.status, replied: Boolean(d.reply) } });
    revalidatePath(`/products/${product.slug}`);
    revalidatePath("/admin/reviews");
  }, "Review updated");
}

export async function markNotificationsReadAction(_?: unknown, __?: FormData): R {
  return action(async () => {
    await requireAdmin();
    await db.notification.updateMany({ where: { audience: "ADMIN", readAt: null }, data: { readAt: new Date() } });
    revalidatePath("/admin", "layout");
  });
}

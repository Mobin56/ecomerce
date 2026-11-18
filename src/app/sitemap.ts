import type { MetadataRoute } from "next";
import { db } from "@/server/db";
import { absoluteUrl } from "@/lib/seo";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [products, categories, pages, posts] = await Promise.all([
    db.product.findMany({ where: { status: { in: ["ACTIVE", "OUT_OF_STOCK"] } }, select: { slug: true, updatedAt: true, images: { select: { url: true }, take: 1, orderBy: { position: "asc" } } } }),
    db.category.findMany({ where: { isActive: true }, select: { slug: true, updatedAt: true } }),
    db.page.findMany({ where: { isPublished: true }, select: { slug: true, updatedAt: true } }),
    db.blogPost.findMany({ where: { publishedAt: { not: null, lte: new Date() } }, select: { slug: true, updatedAt: true } }),
  ]);
  return [
    { url: absoluteUrl("/"), changeFrequency: "daily", priority: 1 },
    { url: absoluteUrl("/products"), changeFrequency: "daily", priority: 0.8 },
    ...categories.map((c) => ({ url: absoluteUrl(`/category/${c.slug}`), lastModified: c.updatedAt, changeFrequency: "daily" as const, priority: 0.8 })),
    ...products.map((p) => ({ url: absoluteUrl(`/products/${p.slug}`), lastModified: p.updatedAt, changeFrequency: "weekly" as const, priority: 0.7, images: p.images.map((i) => i.url) })),
    ...pages.map((p) => ({ url: absoluteUrl(`/pages/${p.slug}`), lastModified: p.updatedAt, priority: 0.3 })),
    ...posts.map((p) => ({ url: absoluteUrl(`/blog/${p.slug}`), lastModified: p.updatedAt, priority: 0.5 })),
  ];
}

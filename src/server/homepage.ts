import "server-only";
import { unstable_cache } from "next/cache";
import { db } from "./db";
import { cardSelect, toCard, getCardsByIds, type ProductCard } from "./catalog";

export interface HeroSlide { image: string; mobileImage?: string; heading: string; subheading?: string; ctaLabel?: string; ctaHref?: string }
export type SectionData =
  | { id: string; type: "hero"; title: string | null; slides: HeroSlide[] }
  | { id: string; type: "categories"; title: string | null; subtitle: string | null; categories: { id: string; name: string; slug: string; imageUrl: string | null }[] }
  | { id: string; type: "products"; variant: string; title: string | null; subtitle: string | null; products: ProductCard[]; endsAt?: string | null; viewAllHref?: string }
  | { id: string; type: "promo"; title: string | null; subtitle: string | null; image?: string; ctaLabel?: string; ctaHref?: string }
  | { id: string; type: "reviews"; title: string | null; reviews: { id: string; authorName: string; rating: number; body: string; product: string; verified: boolean }[] }
  | { id: string; type: "faq"; title: string | null; faqs: { id: string; question: string; answer: string }[] }
  | { id: string; type: "newsletter"; title: string | null; subtitle: string | null };

const visible = { status: { in: ["ACTIVE" as const] } };

async function auto(kind: string, take: number): Promise<ProductCard[]> {
  const orderBy =
    kind === "best_sellers" ? { soldCount: "desc" as const } : kind === "trending" ? { viewCount: "desc" as const } : { publishedAt: "desc" as const };
  const where = kind === "recommended" ? { ...visible, isFeatured: true } : kind === "flash_sale" ? { ...visible, salePrice: { not: null } } : visible;
  return (await db.product.findMany({ where, select: cardSelect, orderBy, take })).map(toCard);
}

/** Homepage sections, ordered and toggled from Admin > Content > Homepage. Cached 60s, revalidated on save. */
export const getHomepage = unstable_cache(
  async (): Promise<SectionData[]> => {
    const sections = await db.homepageSection.findMany({ where: { enabled: true, type: { not: "announcement" } }, orderBy: { position: "asc" } });
    const out: SectionData[] = [];
    for (const s of sections) {
      const c = (s.config ?? {}) as Record<string, unknown>;
      const ids = Array.isArray(c.productIds) ? (c.productIds as string[]) : [];
      const limit = typeof c.limit === "number" ? c.limit : 10;
      switch (s.type) {
        case "hero":
          out.push({ id: s.id, type: "hero", title: s.title, slides: (c.slides as HeroSlide[] | undefined) ?? [] });
          break;
        case "categories": {
          const catIds = Array.isArray(c.categoryIds) ? (c.categoryIds as string[]) : [];
          const categories = await db.category.findMany({ where: { isActive: true, ...(catIds.length ? { id: { in: catIds } } : { parentId: null }) }, orderBy: { position: "asc" }, select: { id: true, name: true, slug: true, imageUrl: true }, take: 12 });
          out.push({ id: s.id, type: "categories", title: s.title, subtitle: s.subtitle, categories });
          break;
        }
        case "flash_sale":
        case "best_sellers":
        case "new_arrivals":
        case "trending":
        case "recommended": {
          const products = ids.length ? await getCardsByIds(ids) : await auto(s.type, limit);
          const endsAt = typeof c.endsAt === "string" ? c.endsAt : null;
          if (s.type === "flash_sale" && endsAt && new Date(endsAt) < new Date()) break;
          if (products.length) out.push({ id: s.id, type: "products", variant: s.type, title: s.title, subtitle: s.subtitle, products, endsAt, viewAllHref: s.type === "new_arrivals" ? "/products?sort=newest" : s.type === "best_sellers" ? "/products?sort=best_selling" : undefined });
          break;
        }
        case "promo":
          out.push({ id: s.id, type: "promo", title: s.title, subtitle: s.subtitle, image: c.image as string | undefined, ctaLabel: c.ctaLabel as string | undefined, ctaHref: c.ctaHref as string | undefined });
          break;
        case "reviews": {
          const reviews = await db.review.findMany({ where: { status: "APPROVED", rating: { gte: 4 } }, orderBy: { createdAt: "desc" }, take: 6, include: { product: { select: { name: true } } } });
          if (reviews.length) out.push({ id: s.id, type: "reviews", title: s.title, reviews: reviews.map((r) => ({ id: r.id, authorName: r.authorName, rating: r.rating, body: r.body, product: r.product.name, verified: r.verifiedPurchase })) });
          break;
        }
        case "faq": {
          const faqs = await db.faq.findMany({ where: { isActive: true, group: (c.group as string) ?? "general" }, orderBy: { position: "asc" }, take: 8 });
          if (faqs.length) out.push({ id: s.id, type: "faq", title: s.title, faqs });
          break;
        }
        case "newsletter":
          out.push({ id: s.id, type: "newsletter", title: s.title, subtitle: s.subtitle });
          break;
      }
    }
    return out;
  },
  ["homepage"],
  { revalidate: 60, tags: ["homepage", "products"] },
);

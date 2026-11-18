import "server-only";
import { cache } from "react";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { effectivePrice, discountPercent } from "@/core/pricing";
import { normalizeQuery, suggestCorrection, type SortKey } from "@/core/search";

/** Minimal shape for product cards — keeps listing payloads small. */
export interface ProductCard {
  id: string;
  slug: string;
  name: string;
  image: { url: string; alt: string } | null;
  price: number;
  compareAt: number | null;
  discountPercent: number;
  ratingAvg: number;
  ratingCount: number;
  inStock: boolean;
  brand: string | null;
  category: string | null;
  defaultVariantId: string | null;
  hasOptions: boolean;
}

export const cardSelect = {
  id: true,
  slug: true,
  name: true,
  regularPrice: true,
  salePrice: true,
  ratingAvg: true,
  ratingCount: true,
  optionNames: true,
  brand: { select: { name: true } },
  category: { select: { name: true } },
  images: { select: { url: true, alt: true }, orderBy: { position: "asc" }, take: 1 },
  variants: {
    where: { isActive: true },
    select: { id: true, price: true, salePrice: true, stock: true, reserved: true, isDefault: true },
    orderBy: { position: "asc" },
  },
} satisfies Prisma.ProductSelect;

type CardRow = Prisma.ProductGetPayload<{ select: typeof cardSelect }>;

export function toCard(p: CardRow): ProductCard {
  const prices = p.variants.map((v) => effectivePrice({ productRegular: p.regularPrice, productSale: p.salePrice, variantPrice: v.price, variantSale: v.salePrice }));
  const cheapest = prices.length ? prices.reduce((a, b) => (b.price < a.price ? b : a)) : effectivePrice({ productRegular: p.regularPrice, productSale: p.salePrice, variantPrice: null, variantSale: null });
  const def = p.variants.find((v) => v.isDefault) ?? p.variants[0];
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    image: p.images[0] ? { url: p.images[0].url, alt: p.images[0].alt ?? p.name } : null,
    price: cheapest.price,
    compareAt: cheapest.compareAt,
    discountPercent: discountPercent(cheapest.price, cheapest.compareAt),
    ratingAvg: p.ratingAvg,
    ratingCount: p.ratingCount,
    inStock: p.variants.some((v) => v.stock - v.reserved > 0),
    brand: p.brand?.name ?? null,
    category: p.category?.name ?? null,
    defaultVariantId: p.variants.length === 1 && def ? def.id : null,
    hasOptions: p.optionNames.length > 0,
  };
}

const visible: Prisma.ProductWhereInput = { status: { in: ["ACTIVE", "OUT_OF_STOCK"] } };

export async function listProducts(opts: {
  categorySlug?: string;
  brandSlug?: string;
  q?: string;
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  sort?: SortKey;
  page?: number;
  perPage?: number;
  ids?: string[];
  tag?: string;
}) {
  const perPage = Math.min(opts.perPage ?? 24, 60);
  const page = Math.max(opts.page ?? 1, 1);
  const where: Prisma.ProductWhereInput = { ...visible };
  const and: Prisma.ProductWhereInput[] = [];
  if (opts.ids) where.id = { in: opts.ids };
  if (opts.tag) where.tags = { has: opts.tag };
  if (opts.categorySlug) and.push({ OR: [{ category: { slug: opts.categorySlug } }, { subcategory: { slug: opts.categorySlug } }, { category: { parent: { slug: opts.categorySlug } } }] });
  if (opts.brandSlug) where.brand = { slug: opts.brandSlug };
  if (opts.minPrice !== undefined || opts.maxPrice !== undefined) {
    // Filter on the effective price (sale price when set).
    const range = { ...(opts.minPrice !== undefined ? { gte: opts.minPrice } : {}), ...(opts.maxPrice !== undefined ? { lte: opts.maxPrice } : {}) };
    and.push({ OR: [{ salePrice: range }, { salePrice: null, regularPrice: range }] });
  }
  if (opts.inStock) where.status = "ACTIVE";

  let searchIds: string[] | null = null;
  if (opts.q) {
    searchIds = await searchProductIds(opts.q, 500);
    and.push({ id: { in: searchIds } });
  }
  if (and.length) where.AND = and;

  const orderBy: Prisma.ProductOrderByWithRelationInput[] =
    opts.sort === "price_asc"
      ? [{ salePrice: { sort: "asc", nulls: "last" } }, { regularPrice: "asc" }]
      : opts.sort === "price_desc"
        ? [{ regularPrice: "desc" }]
        : opts.sort === "best_selling"
          ? [{ soldCount: "desc" }]
          : opts.sort === "rating"
            ? [{ ratingAvg: "desc" }, { ratingCount: "desc" }]
            : [{ publishedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }];

  const [total, rows] = await Promise.all([
    db.product.count({ where }),
    db.product.findMany({ where, select: cardSelect, orderBy, skip: (page - 1) * perPage, take: perPage }),
  ]);
  let items = rows.map(toCard);
  // Keep search relevance order when no explicit sort was chosen.
  if (searchIds && (!opts.sort || opts.sort === "relevance")) {
    const rank = new Map(searchIds.map((id, i) => [id, i]));
    items = items.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
  }
  return { items, total, page, perPage, pages: Math.ceil(total / perPage) };
}

/**
 * Postgres search: trigram similarity (typo tolerant) on name + ILIKE on
 * brand/category/tags/sku. Backed by a GIN trigram index. For catalogues
 * beyond ~100k SKUs swap this function for Meilisearch/Typesense — callers
 * only depend on the returned ordered ids.
 */
export async function searchProductIds(q: string, limit = 50): Promise<string[]> {
  const term = normalizeQuery(q);
  if (!term) return [];
  const like = `%${term}%`;
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT p.id
    FROM products p
    LEFT JOIN brands b ON b.id = p."brandId"
    LEFT JOIN categories c ON c.id = p."categoryId"
    WHERE p.status IN ('ACTIVE','OUT_OF_STOCK')
      AND (
        p.name ILIKE ${like}
        OR similarity(p.name, ${term}) > 0.2
        OR word_similarity(${term}, p.name) > 0.4
        OR b.name ILIKE ${like}
        OR c.name ILIKE ${like}
        OR p.sku ILIKE ${like}
        OR EXISTS (SELECT 1 FROM unnest(p.tags) t WHERE t ILIKE ${like})
      )
    ORDER BY
      (p.name ILIKE ${`${term}%`}) DESC,
      GREATEST(similarity(p.name, ${term}), word_similarity(${term}, p.name)) DESC,
      p."soldCount" DESC
    LIMIT ${limit}`;
  return rows.map((r) => r.id);
}

/** Autocomplete: products + categories + brands + "did you mean". */
export async function suggest(q: string) {
  const term = normalizeQuery(q);
  if (term.length < 2) return { products: [], categories: [], brands: [], correction: null };
  const ids = await searchProductIds(term, 6);
  const [products, categories, brands] = await Promise.all([
    db.product.findMany({ where: { id: { in: ids } }, select: cardSelect }),
    db.category.findMany({ where: { isActive: true, name: { contains: term, mode: "insensitive" } }, select: { name: true, slug: true }, take: 4 }),
    db.brand.findMany({ where: { name: { contains: term, mode: "insensitive" } }, select: { name: true, slug: true }, take: 3 }),
  ]);
  let correction: string | null = null;
  if (!ids.length) {
    const vocab = await getSearchVocabulary();
    correction = suggestCorrection(term, vocab);
  }
  const order = new Map(ids.map((id, i) => [id, i]));
  return {
    products: products.map(toCard).sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)),
    categories,
    brands,
    correction,
  };
}

let vocabCache: { at: number; words: string[] } | null = null;
async function getSearchVocabulary(): Promise<string[]> {
  if (vocabCache && Date.now() - vocabCache.at < 10 * 60_000) return vocabCache.words;
  const [p, c, b] = await Promise.all([
    db.product.findMany({ where: visible, select: { name: true }, take: 5000 }),
    db.category.findMany({ select: { name: true } }),
    db.brand.findMany({ select: { name: true } }),
  ]);
  vocabCache = { at: Date.now(), words: [...p, ...c, ...b].map((x) => x.name) };
  return vocabCache.words;
}

export const getProductBySlug = cache(async (slug: string) => {
  return db.product.findFirst({
    where: { slug, ...visible },
    include: {
      brand: true,
      category: { include: { parent: true } },
      subcategory: true,
      images: { orderBy: { position: "asc" } },
      variants: { where: { isActive: true }, orderBy: { position: "asc" } },
      attributes: { orderBy: { position: "asc" } },
    },
  });
});

export async function getRelatedProducts(productId: string, categoryId: string | null, take = 8) {
  const manual = await db.productRelation.findMany({ where: { fromId: productId, type: "RELATED" }, select: { toId: true }, take });
  const ids = manual.map((m) => m.toId);
  const rows = await db.product.findMany({
    where: { ...visible, id: { not: productId }, ...(ids.length ? { id: { in: ids } } : categoryId ? { categoryId } : {}) },
    select: cardSelect,
    orderBy: { soldCount: "desc" },
    take,
  });
  return rows.map(toCard);
}

/** Manual "bought together" first, then mined from order co-occurrence. */
export async function getBoughtTogether(productId: string, take = 3) {
  const manual = await db.productRelation.findMany({ where: { fromId: productId, type: "BOUGHT_TOGETHER" }, select: { toId: true }, take });
  let ids = manual.map((m) => m.toId);
  if (ids.length < take) {
    const mined = await db.$queryRaw<{ productId: string }[]>`
      SELECT oi2."productId" FROM order_items oi1
      JOIN order_items oi2 ON oi2."orderId" = oi1."orderId" AND oi2."productId" <> oi1."productId"
      JOIN orders o ON o.id = oi1."orderId" AND o.status NOT IN ('CANCELLED')
      WHERE oi1."productId" = ${productId}
      GROUP BY oi2."productId" ORDER BY COUNT(*) DESC LIMIT ${take}`;
    ids = [...new Set([...ids, ...mined.map((m) => m.productId)])].slice(0, take);
  }
  if (!ids.length) return [];
  const rows = await db.product.findMany({ where: { id: { in: ids }, ...visible }, select: cardSelect });
  return rows.map(toCard);
}

export const getCategoryTree = cache(async () => {
  return db.category.findMany({
    where: { isActive: true, parentId: null },
    orderBy: { position: "asc" },
    select: { id: true, name: true, slug: true, imageUrl: true, children: { where: { isActive: true }, orderBy: { position: "asc" }, select: { id: true, name: true, slug: true } } },
  });
});

export async function getCardsByIds(ids: string[]) {
  if (!ids.length) return [];
  const rows = await db.product.findMany({ where: { id: { in: ids }, ...visible }, select: cardSelect });
  const order = new Map(ids.map((id, i) => [id, i]));
  return rows.map(toCard).sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

export async function getProductReviews(productId: string, take = 10) {
  const [reviews, dist] = await Promise.all([
    db.review.findMany({ where: { productId, status: "APPROVED" }, orderBy: { createdAt: "desc" }, take }),
    db.review.groupBy({ by: ["rating"], where: { productId, status: "APPROVED" }, _count: true }),
  ]);
  return { reviews, distribution: Object.fromEntries(dist.map((d) => [d.rating, d._count])) as Record<number, number> };
}

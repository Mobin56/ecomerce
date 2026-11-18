import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Fragment, Suspense } from "react";
import { RotateCcw, ShieldCheck, Truck } from "lucide-react";
import { getProductBySlug, getRelatedProducts, getBoughtTogether, getProductReviews } from "@/server/catalog";
import { getSettings } from "@/server/settings";
import { db } from "@/server/db";
import { effectivePrice } from "@/core/pricing";
import { formatMoney } from "@/core/money";
import { Gallery } from "@/components/store/product/gallery";
import { ProductPurchase } from "@/components/store/product/purchase";
import { ReviewsSection } from "@/components/store/product/reviews";
import { RecentlyViewed } from "@/components/store/product/recently-viewed";
import { ProductRail, ProductGridSkeleton } from "@/components/store/product-card";
import { Rating, SectionHeading } from "@/components/ui/misc";
import { JsonLd, productLd, breadcrumbLd, absoluteUrl } from "@/lib/seo";
import { sanitizeBasicHtml } from "@/lib/sanitize";

export const revalidate = 300;

export async function generateStaticParams() {
  // Pre-render the top 200 products at build; others render on first request (ISR).
  const rows = await db.product.findMany({ where: { status: "ACTIVE" }, orderBy: { soldCount: "desc" }, select: { slug: true }, take: 200 }).catch(() => []);
  return rows.map((r) => ({ slug: r.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const p = await getProductBySlug(slug);
  if (!p) return { title: "Product not found" };
  const title = p.seoTitle || p.name;
  const description = p.seoDescription || p.shortDescription || `Buy ${p.name} online in Bangladesh. Cash on delivery available.`;
  return {
    title,
    description,
    keywords: p.seoKeywords,
    alternates: { canonical: `/products/${p.slug}` },
    openGraph: { type: "website", title, description, url: absoluteUrl(`/products/${p.slug}`), images: p.images.slice(0, 4).map((i) => ({ url: i.url, alt: i.alt ?? p.name })) },
    twitter: { card: "summary_large_image", title, description, images: p.images[0] ? [p.images[0].url] : undefined },
  };
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = await getProductBySlug(slug);
  if (!p) notFound();
  const [store, zones] = await Promise.all([getSettings("store"), db.shippingZone.findMany({ where: { isActive: true }, orderBy: { position: "asc" } })]);

  const variants = p.variants.map((v) => {
    const { price, compareAt } = effectivePrice({ productRegular: p.regularPrice, productSale: p.salePrice, variantPrice: v.price, variantSale: v.salePrice });
    return { id: v.id, title: v.title, options: (v.options ?? {}) as Record<string, string>, price, compareAt, available: Math.max(v.stock - v.reserved, 0), imageId: v.imageId };
  });
  const cheapest = variants.reduce((a, b) => (b.price < a.price ? b : a), variants[0]!);
  const inStock = variants.some((v) => v.available > 0);
  const crumbs = [{ name: "Home", path: "/" }, ...(p.category?.parent ? [{ name: p.category.parent.name, path: `/category/${p.category.parent.slug}` }] : []), ...(p.category ? [{ name: p.category.name, path: `/category/${p.category.slug}` }] : []), { name: p.name, path: `/products/${p.slug}` }];

  return (
    <div className="container-x pb-28 pt-4 lg:pb-10">
      <nav aria-label="Breadcrumb" className="mb-4 text-xs text-muted">
        <ol className="flex flex-wrap items-center gap-1.5">
          {crumbs.map((c, i) => (
            <li key={c.path} className="flex items-center gap-1.5">
              {i < crumbs.length - 1 ? <Link href={c.path} className="hover:text-ink">{c.name}</Link> : <span aria-current="page" className="line-clamp-1 text-ink">{c.name}</span>}
              {i < crumbs.length - 1 && <span aria-hidden>/</span>}
            </li>
          ))}
        </ol>
      </nav>

      <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr] lg:gap-14">
        <Gallery images={p.images.map((i) => ({ id: i.id, url: i.url, alt: i.alt ?? p.name, width: i.width, height: i.height }))} videoUrl={p.videoUrl} name={p.name} />

        <div className="lg:sticky lg:top-24 lg:self-start">
          {p.brand && <p className="text-xs font-semibold uppercase tracking-wider text-muted">{p.brand.name}</p>}
          <h1 className="mt-1 font-display text-2xl font-semibold leading-tight sm:text-3xl">{p.name}</h1>
          {p.ratingCount > 0 && (
            <a href="#reviews" className="mt-2 inline-flex items-center gap-2 text-sm"><Rating value={p.ratingAvg} /> <span className="text-muted underline-offset-2 hover:underline">{p.ratingCount} reviews</span></a>
          )}
          {p.shortDescription && <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">{p.shortDescription}</p>}

          <ProductPurchase
            product={{ id: p.id, name: p.name, slug: p.slug, category: p.category?.name ?? null, brand: p.brand?.name ?? null, optionNames: p.optionNames, lowStockThreshold: p.lowStockThreshold, image: p.images[0]?.url ?? null }}
            variants={variants}
          />

          <ul className="mt-6 grid gap-3 rounded-[var(--radius-card)] border border-line bg-card p-4 text-sm">
            <li className="flex gap-3"><Truck size={18} className="mt-0.5 shrink-0" /><span>{zones.map((z) => `${z.name}: ${formatMoney(z.charge)} · ${z.minDays}-${z.maxDays} days`).join(" | ") || "Delivery all over Bangladesh"}</span></li>
            <li className="flex gap-3"><RotateCcw size={18} className="mt-0.5 shrink-0" /><span>{store.returnPolicySummary} · <Link href="/pages/return-policy" className="underline underline-offset-2">Return policy</Link></span></li>
            {(p.warranty || store.warrantySummary) && <li className="flex gap-3"><ShieldCheck size={18} className="mt-0.5 shrink-0" /><span>{p.warranty || store.warrantySummary}</span></li>}
          </ul>

          <div className="mt-6 divide-y divide-line border-y border-line">
            {p.description && (
              <details open className="group py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between font-semibold">Description<span className="text-muted group-open:rotate-45">+</span></summary>
                <div className="prose-store mt-2" dangerouslySetInnerHTML={{ __html: sanitizeBasicHtml(p.description) }} />
              </details>
            )}
            {p.attributes.length > 0 && (
              <details className="group py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between font-semibold">Specifications<span className="text-muted group-open:rotate-45">+</span></summary>
                <dl className="mt-3 grid grid-cols-[minmax(110px,40%)_1fr] gap-x-4 gap-y-2 text-sm">
                  {p.attributes.map((a) => (
                    <Fragment key={a.id}>
                      <dt className="text-muted">{a.name}</dt>
                      <dd>{a.value}</dd>
                    </Fragment>
                  ))}
                </dl>
              </details>
            )}
          </div>
        </div>
      </div>

      <Suspense fallback={<div className="mt-16"><ProductGridSkeleton count={4} /></div>}>
        <BoughtTogether productId={p.id} />
      </Suspense>
      <Suspense fallback={<div className="skeleton mt-16 h-64" />}>
        <ReviewsBlock productId={p.id} ratingAvg={p.ratingAvg} ratingCount={p.ratingCount} />
      </Suspense>
      <Suspense fallback={<div className="mt-16"><ProductGridSkeleton count={4} /></div>}>
        <Related productId={p.id} categoryId={p.categoryId} />
      </Suspense>
      <RecentlyViewed current={{ id: p.id, slug: p.slug, name: p.name, image: p.images[0]?.url ?? null, price: cheapest.price }} />

      <JsonLd data={productLd({ name: p.name, slug: p.slug, description: p.description ?? p.shortDescription, sku: p.sku, brand: p.brand?.name, images: p.images.map((i) => i.url), price: cheapest.price, compareAt: cheapest.compareAt, inStock, ratingAvg: p.ratingAvg, ratingCount: p.ratingCount })} />
      <JsonLd data={breadcrumbLd(crumbs)} />
    </div>
  );
}

async function BoughtTogether({ productId }: { productId: string }) {
  const items = await getBoughtTogether(productId, 4);
  if (!items.length) return null;
  return (
    <section className="mt-16">
      <SectionHeading title="Frequently bought together" />
      <ProductRail products={items} listName="bought_together" />
    </section>
  );
}

async function Related({ productId, categoryId }: { productId: string; categoryId: string | null }) {
  const items = await getRelatedProducts(productId, categoryId, 10);
  if (!items.length) return null;
  return (
    <section className="mt-16">
      <SectionHeading title="You may also like" />
      <ProductRail products={items} listName="related" />
    </section>
  );
}

async function ReviewsBlock({ productId, ratingAvg, ratingCount }: { productId: string; ratingAvg: number; ratingCount: number }) {
  const { reviews, distribution } = await getProductReviews(productId, 10);
  return (
    <ReviewsSection
      productId={productId}
      ratingAvg={ratingAvg}
      ratingCount={ratingCount}
      distribution={distribution}
      reviews={reviews.map((r) => ({ id: r.id, authorName: r.authorName, rating: r.rating, title: r.title, body: r.body, images: r.images, verified: r.verifiedPurchase, adminReply: r.adminReply, createdAt: r.createdAt.toISOString() }))}
    />
  );
}

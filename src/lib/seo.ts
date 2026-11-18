import { createElement } from "react";

const base = () => (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
export const absoluteUrl = (path: string) => `${base()}${path.startsWith("/") ? path : `/${path}`}`;

/** Safe JSON-LD: escapes "<" so content can't break out of the script tag. */
export function JsonLd({ data }: { data: unknown }) {
  return createElement("script", { type: "application/ld+json", dangerouslySetInnerHTML: { __html: JSON.stringify(data).replace(/</g, "\\u003c") } });
}

export function organizationLd(store: { name: string; logoUrl: string; supportPhone: string; facebookUrl: string; instagramUrl: string }) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: store.name,
    url: base(),
    ...(store.logoUrl ? { logo: store.logoUrl } : {}),
    ...(store.supportPhone ? { contactPoint: { "@type": "ContactPoint", telephone: store.supportPhone, contactType: "customer service", areaServed: "BD" } } : {}),
    sameAs: [store.facebookUrl, store.instagramUrl].filter(Boolean),
  };
}

export function breadcrumbLd(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: absoluteUrl(it.path) })),
  };
}

export function productLd(p: {
  name: string; slug: string; description: string | null; sku: string; brand?: string | null; images: string[]; price: number; compareAt: number | null; inStock: boolean; ratingAvg: number; ratingCount: number;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    sku: p.sku,
    image: p.images,
    description: (p.description ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 5000),
    ...(p.brand ? { brand: { "@type": "Brand", name: p.brand } } : {}),
    offers: {
      "@type": "Offer",
      url: absoluteUrl(`/products/${p.slug}`),
      priceCurrency: "BDT",
      price: (p.price / 100).toFixed(2),
      availability: p.inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
    },
    ...(p.ratingCount > 0 ? { aggregateRating: { "@type": "AggregateRating", ratingValue: p.ratingAvg.toFixed(1), reviewCount: p.ratingCount } } : {}),
  };
}

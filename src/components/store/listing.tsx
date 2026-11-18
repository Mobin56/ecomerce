import Link from "next/link";
import { listProducts } from "@/server/catalog";
import { db } from "@/server/db";
import { SORT_OPTIONS, type SortKey } from "@/core/search";
import { ProductGrid } from "./product-card";
import { FilterDrawer, ListTracker } from "./listing-client";
import { EmptyState } from "@/components/ui/misc";

export type ListingParams = { [k: string]: string | string[] | undefined };
const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? undefined;

export function parseListing(sp: ListingParams) {
  const toPoisha = (v?: string) => (v && !Number.isNaN(Number(v)) ? Math.round(Number(v) * 100) : undefined);
  const sort = str(sp.sort) as SortKey | undefined;
  return {
    q: str(sp.q),
    brandSlug: str(sp.brand),
    minPrice: toPoisha(str(sp.min)),
    maxPrice: toPoisha(str(sp.max)),
    inStock: str(sp.stock) === "1",
    sort: sort && sort in SORT_OPTIONS ? sort : undefined,
    page: Number.parseInt(str(sp.page) ?? "1", 10) || 1,
  };
}

/** Server-rendered listing with URL-driven filters (works without JS, shareable, crawlable). */
export async function Listing({ basePath, params, categorySlug, title, description }: { basePath: string; params: ListingParams; categorySlug?: string; title: string; description?: string | null }) {
  const opts = parseListing(params);
  const [result, brands] = await Promise.all([
    listProducts({ ...opts, categorySlug, perPage: 24 }),
    db.brand.findMany({ where: { products: { some: { status: "ACTIVE", ...(categorySlug ? { OR: [{ category: { slug: categorySlug } }, { subcategory: { slug: categorySlug } }] } : {}) } } }, select: { name: true, slug: true }, orderBy: { name: "asc" } }),
  ]);
  const qs = (patch: Record<string, string | undefined>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, str(v)])), ...patch })) if (v) u.set(k, v);
    const s = u.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  const sortKey = opts.sort ?? (opts.q ? "relevance" : "newest");

  const filters = (
    <form action={basePath} method="get" className="space-y-6">
      {opts.q && <input type="hidden" name="q" value={opts.q} />}
      <div>
        <h3 className="mb-2 text-sm font-semibold">Price (৳)</h3>
        <div className="flex items-center gap-2">
          <input name="min" type="number" inputMode="numeric" min={0} placeholder="Min" defaultValue={opts.minPrice ? opts.minPrice / 100 : ""} className="h-10 w-full rounded-lg border border-line bg-card px-3 text-sm" aria-label="Minimum price" />
          <span className="text-muted">–</span>
          <input name="max" type="number" inputMode="numeric" min={0} placeholder="Max" defaultValue={opts.maxPrice ? opts.maxPrice / 100 : ""} className="h-10 w-full rounded-lg border border-line bg-card px-3 text-sm" aria-label="Maximum price" />
        </div>
      </div>
      {brands.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold">Brand</h3>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm"><input type="radio" name="brand" value="" defaultChecked={!opts.brandSlug} /> All</label>
            {brands.map((b) => (
              <label key={b.slug} className="flex items-center gap-2 text-sm"><input type="radio" name="brand" value={b.slug} defaultChecked={opts.brandSlug === b.slug} /> {b.name}</label>
            ))}
          </div>
        </div>
      )}
      <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" name="stock" value="1" defaultChecked={opts.inStock} className="h-4 w-4" /> In stock only</label>
      <input type="hidden" name="sort" value={opts.sort ?? ""} />
      <div className="flex gap-2">
        <button type="submit" className="h-10 flex-1 rounded-full bg-ink text-sm font-semibold text-white">Apply</button>
        <Link href={opts.q ? `${basePath}?q=${encodeURIComponent(opts.q)}` : basePath} className="grid h-10 flex-1 place-items-center rounded-full border border-line text-sm font-semibold">Reset</Link>
      </div>
    </form>
  );

  return (
    <div className="container-x pb-16 pt-6">
      <div className="mb-6">
        <h1 className="font-display text-3xl font-semibold sm:text-4xl">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-sm text-muted sm:text-[15px]">{description}</p>}
      </div>
      <div className="grid gap-8 lg:grid-cols-[230px_1fr]">
        <aside className="hidden lg:block" aria-label="Filters">{filters}</aside>
        <div>
          <div className="mb-5 flex items-center justify-between gap-3">
            <p className="text-sm text-muted" aria-live="polite">{result.total} products</p>
            <div className="flex items-center gap-2">
              <FilterDrawer>{filters}</FilterDrawer>
              <nav aria-label="Sort" className="no-scrollbar flex max-w-[60vw] gap-1 overflow-x-auto">
                {(Object.keys(SORT_OPTIONS) as SortKey[]).filter((k) => k !== "relevance" || opts.q).map((k) => (
                  <Link key={k} href={qs({ sort: k, page: undefined })} aria-current={sortKey === k} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ${sortKey === k ? "bg-ink text-white" : "bg-card text-ink-soft hover:bg-line"}`}>{SORT_OPTIONS[k]}</Link>
                ))}
              </nav>
            </div>
          </div>
          {result.items.length ? (
            <>
              <ProductGrid products={result.items} listName={title} priorityCount={4} />
              <ListTracker listName={title} items={result.items.slice(0, 20).map((p) => ({ id: p.id, name: p.name, price: p.price, quantity: 1 }))} />
            </>
          ) : (
            <EmptyState title="No products found" body={opts.q ? `We couldn't find anything for “${opts.q}”. Try a different word or check the spelling.` : "Try removing some filters."} action={<Link href="/products" className="text-sm font-semibold underline">Browse all products</Link>} />
          )}
          {result.pages > 1 && (
            <nav aria-label="Pagination" className="mt-10 flex items-center justify-center gap-2">
              {opts.page > 1 && <Link rel="prev" href={qs({ page: String(opts.page - 1) })} className="rounded-full border border-line px-4 py-2 text-sm">Previous</Link>}
              <span className="px-3 text-sm text-muted">Page {opts.page} of {result.pages}</span>
              {opts.page < result.pages && <Link rel="next" href={qs({ page: String(opts.page + 1) })} className="rounded-full border border-line px-4 py-2 text-sm">Next</Link>}
            </nav>
          )}
        </div>
      </div>
    </div>
  );
}

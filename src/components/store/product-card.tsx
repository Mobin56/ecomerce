import Image from "next/image";
import Link from "next/link";
import type { ProductCard as Card } from "@/server/catalog";
import { Price, Rating, Badge } from "@/components/ui/misc";
import { QuickAdd } from "./quick-add";
import { WishlistButton } from "./wishlist-button";

/** Server component — no client JS except the small quick-add and wishlist buttons. */
export function ProductCard({ p, priority, listName }: { p: Card; priority?: boolean; listName?: string }) {
  return (
    <article className="group relative flex flex-col">
      <Link href={`/products/${p.slug}`} className="relative block aspect-[4/5] overflow-hidden rounded-[var(--radius-card)] bg-card" data-list={listName}>
        {p.image ? (
          <Image src={p.image.url} alt={p.image.alt} fill priority={priority} sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw" className="object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
        ) : (
          <div className="grid h-full place-items-center text-xs text-muted">No image</div>
        )}
        <div className="absolute left-2 top-2 flex flex-col gap-1">
          {p.discountPercent > 0 && <Badge tone="accent">−{p.discountPercent}%</Badge>}
          {!p.inStock && <Badge tone="ink">Sold out</Badge>}
        </div>
      </Link>
      <div className="absolute right-2 top-2">
        <WishlistButton productId={p.id} productName={p.name} price={p.price} />
      </div>
      <div className="mt-3 flex flex-1 flex-col gap-1 px-0.5">
        {p.brand && <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">{p.brand}</p>}
        <h3 className="line-clamp-2 text-sm font-medium leading-snug sm:text-[15px]">
          <Link href={`/products/${p.slug}`} className="hover:underline">{p.name}</Link>
        </h3>
        {p.ratingCount > 0 && <Rating value={p.ratingAvg} count={p.ratingCount} size={12} />}
        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <Price price={p.price} compareAt={p.compareAt} size="sm" />
          {p.inStock && <QuickAdd product={p} />}
        </div>
      </div>
    </article>
  );
}

export function ProductGrid({ products, listName, priorityCount = 0 }: { products: Card[]; listName?: string; priorityCount?: number }) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-7 sm:grid-cols-3 sm:gap-x-5 lg:grid-cols-4 2xl:grid-cols-5">
      {products.map((p, i) => (
        <ProductCard key={p.id} p={p} priority={i < priorityCount} listName={listName} />
      ))}
    </div>
  );
}

export function ProductRail({ products, listName }: { products: Card[]; listName?: string }) {
  return (
    <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-5 sm:overflow-visible sm:px-0 lg:grid-cols-4 2xl:grid-cols-5">
      {products.map((p) => (
        <div key={p.id} className="w-[44vw] max-w-[220px] shrink-0 snap-start sm:w-auto sm:max-w-none">
          <ProductCard p={p} listName={listName} />
        </div>
      ))}
    </div>
  );
}

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-7 sm:grid-cols-3 sm:gap-x-5 lg:grid-cols-4" aria-busy aria-label="Loading products">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i}>
          <div className="skeleton aspect-[4/5] rounded-[var(--radius-card)]" />
          <div className="skeleton mt-3 h-4 w-4/5" />
          <div className="skeleton mt-2 h-4 w-1/3" />
        </div>
      ))}
    </div>
  );
}

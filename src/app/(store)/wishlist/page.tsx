import type { Metadata } from "next";
import Link from "next/link";
import { Heart } from "lucide-react";
import { getWishlistIds } from "@/server/wishlist";
import { getCardsByIds } from "@/server/catalog";
import { ProductCard } from "@/components/store/product-card";
import { MoveToCartButton } from "@/components/store/move-to-cart";
import { EmptyState } from "@/components/ui/misc";

export const metadata: Metadata = { title: "Wishlist", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function WishlistPage() {
  const products = await getCardsByIds(await getWishlistIds());
  return (
    <div className="container-x pb-16 pt-6">
      <h1 className="mb-6 font-display text-3xl font-semibold">Wishlist</h1>
      {products.length ? (
        <div className="grid grid-cols-2 gap-x-3 gap-y-7 sm:grid-cols-3 sm:gap-x-5 lg:grid-cols-4">
          {products.map((p) => (
            <div key={p.id}>
              <ProductCard p={p} listName="wishlist" />
              {p.inStock && <MoveToCartButton productId={p.id} />}
            </div>
          ))}
        </div>
      ) : <EmptyState icon={<Heart size={32} />} title="Your wishlist is empty" body="Tap the heart on any product to save it here." action={<Link href="/products" className="font-semibold underline">Browse products</Link>} />}
    </div>
  );
}

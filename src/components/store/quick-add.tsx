"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import type { ProductCard } from "@/server/catalog";
import { useCart } from "./cart-context";

/** One-tap add for single-variant products; products with options link to the page. */
export function QuickAdd({ product }: { product: ProductCard }) {
  const { add, loading } = useCart();
  const cls = "grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line bg-card transition-colors hover:border-ink hover:bg-ink hover:text-white";
  if (!product.defaultVariantId || product.hasOptions) {
    return (
      <Link href={`/products/${product.slug}`} className={cls} aria-label={`Choose options for ${product.name}`}>
        <Plus size={16} />
      </Link>
    );
  }
  return (
    <button
      type="button"
      disabled={loading}
      className={cls}
      aria-label={`Add ${product.name} to cart`}
      onClick={() => add(product.defaultVariantId!, 1, { productId: product.id, name: product.name, price: product.price, category: product.category })}
    >
      <Plus size={16} />
    </button>
  );
}

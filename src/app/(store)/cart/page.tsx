import type { Metadata } from "next";
import { CartPageClient } from "@/components/store/cart-page";
import { listProducts } from "@/server/catalog";
import { ProductRail } from "@/components/store/product-card";
import { SectionHeading } from "@/components/ui/misc";

export const metadata: Metadata = { title: "Your cart", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function CartPage() {
  const recommended = await listProducts({ sort: "best_selling", perPage: 8 });
  return (
    <div className="container-x pb-16 pt-6">
      <h1 className="mb-6 font-display text-3xl font-semibold">Your cart</h1>
      <CartPageClient />
      {recommended.items.length > 0 && (
        <section className="mt-16">
          <SectionHeading title="You might also like" />
          <ProductRail products={recommended.items} listName="cart_recommendations" />
        </section>
      )}
    </div>
  );
}

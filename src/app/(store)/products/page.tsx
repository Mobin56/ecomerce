import type { Metadata } from "next";
import { Listing, type ListingParams } from "@/components/store/listing";

export const metadata: Metadata = { title: "All products", alternates: { canonical: "/products" } };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<ListingParams> }) {
  return <Listing basePath="/products" params={await searchParams} title="All products" />;
}

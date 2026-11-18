import type { Metadata } from "next";
import { Listing, type ListingParams } from "@/components/store/listing";

export async function generateMetadata({ searchParams }: { searchParams: Promise<ListingParams> }): Promise<Metadata> {
  const q = (await searchParams).q;
  return { title: q ? `Search: ${q}` : "Search", robots: { index: false, follow: true } };
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<ListingParams> }) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  return <Listing basePath="/search" params={sp} title={q ? `Results for “${q}”` : "Search"} />;
}

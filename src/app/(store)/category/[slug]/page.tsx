import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { db } from "@/server/db";
import { Listing, type ListingParams } from "@/components/store/listing";
import { JsonLd, breadcrumbLd } from "@/lib/seo";

const getCategory = cache((slug: string) => db.category.findFirst({ where: { slug, isActive: true }, include: { parent: true } }));

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const c = await getCategory((await params).slug);
  if (!c) return { title: "Category not found" };
  return { title: c.seoTitle ?? c.name, description: c.seoDescription ?? c.description ?? `Shop ${c.name} online in Bangladesh.`, alternates: { canonical: `/category/${c.slug}` } };
}

export default async function CategoryPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<ListingParams> }) {
  const { slug } = await params;
  const c = await getCategory(slug);
  if (!c) notFound();
  const crumbs = [{ name: "Home", path: "/" }, ...(c.parent ? [{ name: c.parent.name, path: `/category/${c.parent.slug}` }] : []), { name: c.name, path: `/category/${c.slug}` }];
  return (
    <>
      <Listing basePath={`/category/${slug}`} params={await searchParams} categorySlug={slug} title={c.name} description={c.description} />
      <JsonLd data={breadcrumbLd(crumbs)} />
    </>
  );
}

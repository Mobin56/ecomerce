import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { db } from "@/server/db";
import { sanitizeBasicHtml } from "@/lib/sanitize";
import { formatDate } from "@/lib/utils";

export const revalidate = 600;
const getPost = cache((slug: string) => db.blogPost.findFirst({ where: { slug, publishedAt: { not: null, lte: new Date() } } }));

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const p = await getPost((await params).slug);
  return p ? { title: p.title, description: p.excerpt ?? undefined, alternates: { canonical: `/blog/${p.slug}` }, openGraph: { type: "article", images: p.coverUrl ? [p.coverUrl] : undefined } } : { title: "Not found" };
}

export default async function BlogPost({ params }: { params: Promise<{ slug: string }> }) {
  const p = await getPost((await params).slug);
  if (!p) notFound();
  return (
    <article className="container-x max-w-3xl py-12">
      <p className="text-sm text-muted">{p.publishedAt && formatDate(p.publishedAt)}</p>
      <h1 className="mt-2 font-display text-4xl font-semibold">{p.title}</h1>
      <div className="prose-store mt-8" dangerouslySetInnerHTML={{ __html: sanitizeBasicHtml(p.content) }} />
    </article>
  );
}

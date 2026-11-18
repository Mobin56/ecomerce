import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { db } from "@/server/db";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Journal", alternates: { canonical: "/blog" } };
export const revalidate = 600;

export default async function BlogIndex() {
  const posts = await db.blogPost.findMany({ where: { publishedAt: { not: null, lte: new Date() } }, orderBy: { publishedAt: "desc" }, take: 30 });
  return (
    <div className="container-x py-12">
      <h1 className="font-display text-4xl font-semibold">Journal</h1>
      {posts.length === 0 && <p className="mt-4 text-muted">No articles yet.</p>}
      <div className="mt-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {posts.map((p) => (
          <Link key={p.id} href={`/blog/${p.slug}`} className="group">
            <span className="relative block aspect-[16/10] overflow-hidden rounded-[var(--radius-card)] bg-card">{p.coverUrl && <Image src={p.coverUrl} alt="" fill sizes="(max-width:640px) 100vw, 33vw" className="object-cover transition-transform group-hover:scale-105" />}</span>
            <p className="mt-3 text-xs text-muted">{p.publishedAt && formatDate(p.publishedAt)}</p>
            <h2 className="mt-1 text-lg font-semibold group-hover:underline">{p.title}</h2>
            {p.excerpt && <p className="mt-1 line-clamp-2 text-sm text-muted">{p.excerpt}</p>}
          </Link>
        ))}
      </div>
    </div>
  );
}

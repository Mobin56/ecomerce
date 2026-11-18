import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { db } from "@/server/db";
import { sanitizeBasicHtml } from "@/lib/sanitize";

export const revalidate = 300;
const getPage = cache((slug: string) => db.page.findFirst({ where: { slug, isPublished: true } }));

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const p = await getPage((await params).slug);
  return p ? { title: p.seoTitle ?? p.title, description: p.seoDescription ?? undefined, alternates: { canonical: `/pages/${p.slug}` } } : { title: "Not found" };
}

export default async function CmsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (slug === "faq") {
    const faqs = await db.faq.findMany({ where: { isActive: true }, orderBy: [{ group: "asc" }, { position: "asc" }] });
    return (
      <article className="container-x max-w-3xl py-12">
        <h1 className="font-display text-4xl font-semibold">Frequently asked questions</h1>
        <div className="mt-8 divide-y divide-line rounded-[var(--radius-card)] border border-line bg-card">
          {faqs.map((f) => (
            <details key={f.id} className="group px-5"><summary className="flex cursor-pointer list-none justify-between py-4 font-medium">{f.question}<span className="text-muted group-open:rotate-45">+</span></summary><p className="pb-4 text-sm text-muted">{f.answer}</p></details>
          ))}
        </div>
      </article>
    );
  }
  const page = await getPage(slug);
  if (!page) notFound();
  return (
    <article className="container-x max-w-3xl py-12">
      <h1 className="font-display text-4xl font-semibold">{page.title}</h1>
      <div className="prose-store mt-6" dangerouslySetInnerHTML={{ __html: sanitizeBasicHtml(page.content) }} />
    </article>
  );
}

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BadgeCheck } from "lucide-react";
import { getHomepage, type SectionData } from "@/server/homepage";
import { ProductRail } from "@/components/store/product-card";
import { Countdown } from "@/components/store/countdown";
import { NewsletterForm } from "@/components/store/newsletter-form";
import { SectionHeading, Rating } from "@/components/ui/misc";
import { JsonLd } from "@/lib/seo";

export const revalidate = 60;

export default async function HomePage() {
  const sections = await getHomepage();
  return (
    <div className="space-y-14 pb-8 sm:space-y-20">
      {sections.map((s, i) => (
        <Section key={s.id} s={s} first={i === 0} />
      ))}
      {sections.length === 0 && (
        <div className="container-x py-24 text-center text-muted">Add homepage sections in Admin → Content → Homepage.</div>
      )}
    </div>
  );
}

function Section({ s, first }: { s: SectionData; first: boolean }) {
  switch (s.type) {
    case "hero":
      return <Hero slides={s.slides} first={first} />;
    case "categories":
      return (
        <section className="container-x" aria-labelledby={`h-${s.id}`}>
          <SectionHeading title={s.title ?? "Shop by category"} subtitle={s.subtitle} />
          <ul className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 sm:mx-0 sm:grid sm:grid-cols-4 sm:gap-4 sm:px-0 lg:grid-cols-6">
            {s.categories.map((c) => (
              <li key={c.id} className="w-28 shrink-0 sm:w-auto">
                <Link href={`/category/${c.slug}`} className="group block text-center">
                  <span className="relative block aspect-square overflow-hidden rounded-full bg-card sm:rounded-[var(--radius-card)]">
                    {c.imageUrl && <Image src={c.imageUrl} alt="" fill sizes="(max-width:640px) 112px, 200px" className="object-cover transition-transform duration-500 group-hover:scale-105" />}
                  </span>
                  <span className="mt-2 block text-sm font-medium">{c.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      );
    case "products":
      return (
        <section className="container-x" aria-label={s.title ?? undefined}>
          <SectionHeading
            title={s.title ?? ""}
            subtitle={s.subtitle}
            action={
              s.variant === "flash_sale" && s.endsAt ? (
                <Countdown endsAt={s.endsAt} />
              ) : s.viewAllHref ? (
                <Link href={s.viewAllHref} className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold hover:underline">View all <ArrowRight size={15} /></Link>
              ) : undefined
            }
          />
          <ProductRail products={s.products} listName={s.variant} />
        </section>
      );
    case "promo":
      return (
        <section className="container-x">
          <div className="relative overflow-hidden rounded-3xl bg-ink text-white">
            {s.image && <Image src={s.image} alt="" fill sizes="100vw" className="object-cover opacity-60" />}
            <div className="relative max-w-xl px-6 py-14 sm:px-12 sm:py-20">
              <h2 className="font-display text-3xl font-semibold sm:text-4xl">{s.title}</h2>
              {s.subtitle && <p className="mt-3 text-white/80">{s.subtitle}</p>}
              {s.ctaHref && <Link href={s.ctaHref} className="mt-6 inline-flex h-12 items-center rounded-full bg-white px-6 font-semibold text-ink hover:bg-white/90">{s.ctaLabel ?? "Shop now"}</Link>}
            </div>
          </div>
        </section>
      );
    case "reviews":
      return (
        <section className="container-x">
          <SectionHeading title={s.title ?? "What customers say"} />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {s.reviews.map((r) => (
              <figure key={r.id} className="rounded-[var(--radius-card)] border border-line bg-card p-5">
                <Rating value={r.rating} />
                <blockquote className="mt-3 line-clamp-4 text-[15px] leading-relaxed">“{r.body}”</blockquote>
                <figcaption className="mt-4 flex items-center gap-1.5 text-sm text-muted">
                  <span className="font-medium text-ink">{r.authorName}</span>
                  {r.verified && <BadgeCheck size={14} className="text-success" aria-label="Verified purchase" />}
                  <span>· {r.product}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      );
    case "faq":
      return (
        <section className="container-x max-w-3xl">
          <SectionHeading title={s.title ?? "Frequently asked questions"} />
          <div className="divide-y divide-line rounded-[var(--radius-card)] border border-line bg-card">
            {s.faqs.map((f) => (
              <details key={f.id} className="group px-5">
                <summary className="flex cursor-pointer list-none items-center justify-between py-4 font-medium">{f.question}<span className="text-muted transition group-open:rotate-45">+</span></summary>
                <p className="pb-4 text-sm leading-relaxed text-muted">{f.answer}</p>
              </details>
            ))}
          </div>
          <JsonLd data={{ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: s.faqs.map((f) => ({ "@type": "Question", name: f.question, acceptedAnswer: { "@type": "Answer", text: f.answer } })) }} />
        </section>
      );
    case "newsletter":
      return (
        <section className="container-x">
          <div className="grid gap-6 rounded-3xl bg-ink px-6 py-10 text-white sm:px-12 md:grid-cols-2 md:items-center">
            <div>
              <h2 className="font-display text-2xl font-semibold sm:text-3xl">{s.title ?? "Join the list"}</h2>
              {s.subtitle && <p className="mt-2 text-white/70">{s.subtitle}</p>}
            </div>
            <NewsletterForm dark />
          </div>
        </section>
      );
  }
}

function Hero({ slides, first }: { slides: { image: string; mobileImage?: string; heading: string; subheading?: string; ctaLabel?: string; ctaHref?: string }[]; first: boolean }) {
  if (!slides.length) return null;
  return (
    <section aria-label="Featured" className="container-x pt-4 sm:pt-6">
      <div className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto rounded-3xl">
        {slides.map((sl, i) => (
          <div key={i} className="relative aspect-[4/5] w-full shrink-0 snap-center overflow-hidden rounded-3xl bg-ink sm:aspect-[21/9]">
            <Image src={sl.mobileImage ?? sl.image} alt="" fill priority={first && i === 0} fetchPriority={first && i === 0 ? "high" : undefined} sizes="100vw" className="object-cover sm:hidden" />
            <Image src={sl.image} alt="" fill priority={first && i === 0} sizes="(max-width: 1440px) 100vw, 1440px" className="hidden object-cover sm:block" />
            <div className="absolute inset-0 bg-gradient-to-t from-ink/70 via-ink/10 to-transparent sm:bg-gradient-to-r sm:from-ink/60 sm:via-ink/20" />
            <div className="absolute inset-x-0 bottom-0 p-6 text-white sm:inset-y-0 sm:flex sm:max-w-xl sm:flex-col sm:justify-center sm:p-14">
              {i === 0 ? <h1 className="font-display text-3xl font-semibold leading-tight sm:text-5xl">{sl.heading}</h1> : <h2 className="font-display text-3xl font-semibold leading-tight sm:text-5xl">{sl.heading}</h2>}
              {sl.subheading && <p className="mt-3 text-[15px] text-white/85 sm:text-lg">{sl.subheading}</p>}
              {sl.ctaHref && <Link href={sl.ctaHref} className="mt-6 inline-flex h-12 w-fit items-center rounded-full bg-white px-7 font-semibold text-ink hover:bg-white/90">{sl.ctaLabel ?? "Shop now"}</Link>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

import Link from "next/link";
import { getSettings } from "@/server/settings";
import { getCategoryTree } from "@/server/catalog";
import { NewsletterForm } from "./newsletter-form";

export async function Footer() {
  const [store, categories] = await Promise.all([getSettings("store"), getCategoryTree()]);
  return (
    <footer className="mt-20 border-t border-line bg-card pb-24 md:pb-0">
      <div className="container-x grid gap-10 py-12 md:grid-cols-2 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <p className="font-display text-2xl font-semibold">{store.name}</p>
          <p className="mt-2 max-w-sm text-sm text-muted">{store.tagline}</p>
          <div className="mt-6 max-w-sm"><NewsletterForm /></div>
        </div>
        <FooterCol title="Shop" links={categories.slice(0, 6).map((c) => ({ href: `/category/${c.slug}`, label: c.name }))} />
        <FooterCol title="Help" links={[{ href: "/track", label: "Track order" }, { href: "/pages/shipping-policy", label: "Shipping" }, { href: "/pages/return-policy", label: "Returns" }, { href: "/pages/contact", label: "Contact" }, { href: "/pages/faq", label: "FAQ" }]} />
        <FooterCol title="Company" links={[{ href: "/pages/about", label: "About" }, { href: "/blog", label: "Journal" }, { href: "/pages/privacy-policy", label: "Privacy" }, { href: "/pages/terms", label: "Terms" }]} />
      </div>
      <div className="border-t border-line">
        <div className="container-x flex flex-col gap-2 py-5 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} {store.name}. All rights reserved.</p>
          <p>{[store.supportPhone && `Call ${store.supportPhone}`, store.supportEmail].filter(Boolean).join(" · ")}</p>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: { href: string; label: string }[] }) {
  return (
    <div>
      <h2 className="text-sm font-semibold">{title}</h2>
      <ul className="mt-3 space-y-2.5 text-sm text-muted">
        {links.map((l) => <li key={l.href}><Link href={l.href} className="hover:text-ink">{l.label}</Link></li>)}
      </ul>
    </div>
  );
}

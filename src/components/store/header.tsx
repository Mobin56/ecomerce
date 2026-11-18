import Link from "next/link";
import { getCategoryTree } from "@/server/catalog";
import { getSettings } from "@/server/settings";
import { db } from "@/server/db";
import { HeaderActions, MobileMenuButton, MobileBottomNav } from "./header-client";
import { SearchBox } from "./search-box";

export async function AnnouncementBar() {
  const section = await db.homepageSection.findFirst({ where: { type: "announcement", enabled: true }, select: { title: true, config: true } });
  if (!section?.title) return null;
  const link = (section.config as { link?: string } | null)?.link;
  return (
    <div className="bg-ink px-4 py-2 text-center text-xs font-medium tracking-wide text-white sm:text-[13px]">
      {link ? <Link href={link} className="underline-offset-2 hover:underline">{section.title}</Link> : section.title}
    </div>
  );
}

export async function Header() {
  const [categories, store] = await Promise.all([getCategoryTree(), getSettings("store")]);
  return (
    <>
      <AnnouncementBar />
      <header className="sticky top-0 z-40 border-b border-line bg-paper/95 backdrop-blur supports-[backdrop-filter]:bg-paper/80">
        <div className="container-x flex h-16 items-center gap-3 lg:h-[72px] lg:gap-8">
          <MobileMenuButton categories={categories} />
          <Link href="/" className="font-display text-xl font-semibold tracking-tight sm:text-2xl" aria-label={`${store.name} home`}>
            {store.name}
          </Link>
          <nav aria-label="Main" className="hidden lg:block">
            <ul className="flex items-center gap-6 text-[15px] font-medium">
              {categories.slice(0, 6).map((c) => (
                <li key={c.id} className="group relative">
                  <Link href={`/category/${c.slug}`} className="py-6 hover:text-accent">{c.name}</Link>
                  {c.children.length > 0 && (
                    <div className="invisible absolute left-0 top-full z-50 min-w-52 rounded-2xl border border-line bg-card p-2 opacity-0 shadow-[var(--shadow-soft)] transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
                      {c.children.map((s) => (
                        <Link key={s.id} href={`/category/${s.slug}`} className="block rounded-lg px-3 py-2 text-sm hover:bg-paper">{s.name}</Link>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </nav>
          <div className="ml-auto hidden w-full max-w-md md:block">
            <SearchBox />
          </div>
          <HeaderActions />
        </div>
      </header>
      <MobileBottomNav />
    </>
  );
}

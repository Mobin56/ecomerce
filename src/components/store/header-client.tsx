"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Heart, Home, LayoutGrid, Menu, Search, ShoppingBag, User } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { useCart } from "./cart-context";
import { SearchBox } from "./search-box";
import { cn } from "@/lib/utils";

type Cat = { id: string; name: string; slug: string; children: { id: string; name: string; slug: string }[] };

export function HeaderActions() {
  const { count, setOpen } = useCart();
  const [search, setSearch] = useState(false);
  return (
    <div className="ml-auto flex items-center gap-1 md:ml-0">
      <button className="grid h-10 w-10 place-items-center rounded-full hover:bg-line/60 md:hidden" onClick={() => setSearch(true)} aria-label="Search">
        <Search size={20} />
      </button>
      <Link href="/account" className="hidden h-10 w-10 place-items-center rounded-full hover:bg-line/60 sm:grid" aria-label="Account"><User size={20} /></Link>
      <Link href="/wishlist" className="hidden h-10 w-10 place-items-center rounded-full hover:bg-line/60 sm:grid" aria-label="Wishlist"><Heart size={20} /></Link>
      <button className="relative grid h-10 w-10 place-items-center rounded-full hover:bg-line/60" onClick={() => setOpen(true)} aria-label={`Cart, ${count} items`}>
        <ShoppingBag size={20} />
        {count > 0 && <span className="absolute right-0.5 top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-white">{count}</span>}
      </button>
      <Sheet open={search} onClose={() => setSearch(false)} title="Search" side="bottom" className="min-h-[60dvh]">
        <div className="p-4">{search && <SearchBox autoFocus onDone={() => setSearch(false)} />}</div>
      </Sheet>
    </div>
  );
}

export function MobileMenuButton({ categories }: { categories: Cat[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="-ml-2 grid h-10 w-10 place-items-center rounded-full hover:bg-line/60 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
        <Menu size={22} />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Menu" side="left">
        <nav className="p-3" aria-label="Mobile">
          {categories.map((c) => (
            <details key={c.id} className="group border-b border-line">
              <summary className="flex cursor-pointer list-none items-center justify-between px-2 py-3.5 text-[15px] font-medium">
                <Link href={`/category/${c.slug}`} onClick={() => setOpen(false)}>{c.name}</Link>
                {c.children.length > 0 && <span className="text-muted transition group-open:rotate-45">+</span>}
              </summary>
              {c.children.length > 0 && (
                <div className="pb-2 pl-4">
                  {c.children.map((s) => <Link key={s.id} href={`/category/${s.slug}`} onClick={() => setOpen(false)} className="block py-2 text-sm text-ink-soft">{s.name}</Link>)}
                </div>
              )}
            </details>
          ))}
          <div className="mt-4 grid gap-1 text-sm">
            <Link href="/track" onClick={() => setOpen(false)} className="rounded-lg px-2 py-2.5 hover:bg-paper">Track order</Link>
            <Link href="/account" onClick={() => setOpen(false)} className="rounded-lg px-2 py-2.5 hover:bg-paper">My account</Link>
            <Link href="/pages/contact" onClick={() => setOpen(false)} className="rounded-lg px-2 py-2.5 hover:bg-paper">Contact</Link>
          </div>
        </nav>
      </Sheet>
    </>
  );
}

/** Thumb-reachable bottom nav on phones. Hidden on product/checkout pages, which have their own sticky bars. */
export function MobileBottomNav() {
  const pathname = usePathname();
  const { count, setOpen } = useCart();
  if (pathname.startsWith("/products/") || pathname.startsWith("/checkout")) return null;
  const item = (active: boolean) => cn("flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium", active ? "text-ink" : "text-muted");
  return (
    <nav aria-label="Quick" className="safe-bottom fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-card/95 backdrop-blur md:hidden">
      <Link href="/" className={item(pathname === "/")}><Home size={21} />Home</Link>
      <Link href="/products" className={item(pathname.startsWith("/category") || pathname === "/products")}><LayoutGrid size={21} />Shop</Link>
      <Link href="/wishlist" className={item(pathname === "/wishlist")}><Heart size={21} />Wishlist</Link>
      <button onClick={() => setOpen(true)} className={cn(item(false), "relative")}>
        <ShoppingBag size={21} />Cart
        {count > 0 && <span className="absolute left-1/2 top-1 ml-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-white">{count}</span>}
      </button>
      <Link href="/account" className={item(pathname.startsWith("/account"))}><User size={21} />Account</Link>
    </nav>
  );
}

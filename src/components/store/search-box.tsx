"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import type { ProductCard } from "@/server/catalog";
import { formatMoney } from "@/core/money";
import { track } from "./tracking";

type Suggest = { products: ProductCard[]; categories: { name: string; slug: string }[]; brands: { name: string; slug: string }[]; correction: string | null };

/** Debounced autocomplete with keyboard navigation (combobox pattern). */
export function SearchBox({ autoFocus, onDone }: { autoFocus?: boolean; onDone?: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [data, setData] = useState<Suggest | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = useId();
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    if (q.trim().length < 2) {
      setData(null);
      return;
    }
    const t = setTimeout(async () => {
      abort.current?.abort();
      abort.current = new AbortController();
      try {
        const res = await fetch(`/api/search/suggest?q=${encodeURIComponent(q)}`, { signal: abort.current.signal });
        setData((await res.json()) as Suggest);
        setOpen(true);
        setActive(-1);
      } catch {
        /* aborted */
      }
    }, 180);
    return () => clearTimeout(t);
  }, [q]);

  const submit = (term = q) => {
    const s = term.trim();
    if (!s) return;
    track("Search", { searchString: s });
    setOpen(false);
    onDone?.();
    router.push(`/search?q=${encodeURIComponent(s)}`);
  };

  const products = data?.products ?? [];
  return (
    <div className="relative w-full">
      <form role="search" onSubmit={(e) => { e.preventDefault(); if (active >= 0 && products[active]) { router.push(`/products/${products[active]!.slug}`); setOpen(false); onDone?.(); } else submit(); }}>
        <label htmlFor={`${listId}-input`} className="sr-only">Search products</label>
        <div className="flex h-11 items-center gap-2 rounded-full border border-line bg-card px-4 focus-within:border-ink">
          <Search size={18} className="shrink-0 text-muted" aria-hidden />
          <input
            id={`${listId}-input`}
            type="search"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
            autoFocus={autoFocus}
            autoComplete="off"
            enterKeyHint="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onFocus={() => data && setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, products.length - 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, -1)); }
              if (e.key === "Escape") setOpen(false);
            }}
            placeholder="Search products, brands, categories"
            className="h-full w-full bg-transparent text-[15px] outline-none placeholder:text-muted/70 [&::-webkit-search-cancel-button]:hidden"
          />
          {q && <button type="button" onClick={() => setQ("")} aria-label="Clear search" className="text-muted"><X size={16} /></button>}
        </div>
      </form>
      {open && data && (
        <div id={listId} role="listbox" className="absolute inset-x-0 top-12 z-50 max-h-[70vh] overflow-y-auto rounded-2xl border border-line bg-card p-2 shadow-[var(--shadow-soft)]">
          {data.correction && (
            <button className="w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-paper" onMouseDown={() => { setQ(data.correction!); submit(data.correction!); }}>
              Did you mean <strong>{data.correction}</strong>?
            </button>
          )}
          {products.map((p, i) => (
            <Link key={p.id} id={`${listId}-${i}`} role="option" aria-selected={i === active} href={`/products/${p.slug}`} onClick={() => { setOpen(false); onDone?.(); }} className={`flex items-center gap-3 rounded-xl p-2 ${i === active ? "bg-paper" : "hover:bg-paper"}`}>
              <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-paper">{p.image && <Image src={p.image.url} alt="" fill sizes="48px" className="object-cover" />}</span>
              <span className="min-w-0 flex-1"><span className="line-clamp-1 text-sm">{p.name}</span><span className="text-xs text-muted">{formatMoney(p.price)}</span></span>
            </Link>
          ))}
          {(data.categories.length > 0 || data.brands.length > 0) && (
            <div className="flex flex-wrap gap-2 border-t border-line px-2 pt-2 mt-1">
              {data.categories.map((c) => <Link key={c.slug} href={`/category/${c.slug}`} onClick={onDone} className="rounded-full bg-paper px-3 py-1 text-xs hover:bg-line">{c.name}</Link>)}
              {data.brands.map((b) => <Link key={b.slug} href={`/search?brand=${b.slug}`} onClick={onDone} className="rounded-full bg-paper px-3 py-1 text-xs hover:bg-line">{b.name}</Link>)}
            </div>
          )}
          {!products.length && !data.correction && <p className="px-3 py-4 text-sm text-muted">No matches. Press Enter to search all products.</p>}
        </div>
      )}
    </div>
  );
}

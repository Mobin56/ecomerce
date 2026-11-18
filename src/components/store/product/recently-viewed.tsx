"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { formatMoney } from "@/core/money";

type Item = { id: string; slug: string; name: string; image: string | null; price: number };
const KEY = "recently-viewed";

/** Stored locally (no server round trip, no PII). */
export function RecentlyViewed({ current }: { current: Item }) {
  const [items, setItems] = useState<Item[]>([]);
  useEffect(() => {
    try {
      const prev = (JSON.parse(localStorage.getItem(KEY) ?? "[]") as Item[]).filter((i) => i.id !== current.id);
      setItems(prev.slice(0, 8));
      localStorage.setItem(KEY, JSON.stringify([current, ...prev].slice(0, 12)));
    } catch {
      /* storage unavailable */
    }
  }, [current]);
  if (!items.length) return null;
  return (
    <section className="mt-16">
      <h2 className="mb-5 font-display text-2xl font-semibold">Recently viewed</h2>
      <div className="no-scrollbar flex gap-3 overflow-x-auto">
        {items.map((i) => (
          <Link key={i.id} href={`/products/${i.slug}`} className="w-32 shrink-0 sm:w-40">
            <span className="relative block aspect-square overflow-hidden rounded-xl bg-card">{i.image && <Image src={i.image} alt="" fill sizes="160px" className="object-cover" />}</span>
            <span className="mt-2 line-clamp-1 block text-sm">{i.name}</span>
            <span className="text-sm font-semibold">{formatMoney(i.price)}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

"use client";

import { Heart } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { track } from "./tracking";

const Ctx = createContext<{ ids: Set<string>; toggle: (id: string, meta: { name: string; price: number }) => Promise<void> } | null>(null);

export function WishlistProvider({ children }: { children: ReactNode }) {
  const [ids, setIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    api<{ ids: string[] }>("/api/wishlist").then((r) => setIds(new Set(r.ids))).catch(() => undefined);
  }, []);
  const toggle = useCallback(async (id: string, meta: { name: string; price: number }) => {
    setIds((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
    const r = await api<{ added: boolean }>("/api/wishlist", { body: { productId: id } }).catch(() => null);
    if (r?.added) track("AddToWishlist", { productId: id, value: meta.price, items: [{ id, name: meta.name, price: meta.price, quantity: 1 }] });
  }, []);
  return <Ctx.Provider value={{ ids, toggle }}>{children}</Ctx.Provider>;
}

export function WishlistButton({ productId, productName, price, className }: { productId: string; productName: string; price: number; className?: string }) {
  const ctx = useContext(Ctx);
  const active = ctx?.ids.has(productId) ?? false;
  return (
    <button
      type="button"
      onClick={() => ctx?.toggle(productId, { name: productName, price })}
      aria-pressed={active}
      aria-label={active ? `Remove ${productName} from wishlist` : `Add ${productName} to wishlist`}
      className={cn("grid h-9 w-9 place-items-center rounded-full bg-card/90 shadow-sm backdrop-blur transition hover:scale-105", className)}
    >
      <Heart size={17} className={active ? "fill-accent text-accent" : "text-ink"} />
    </button>
  );
}

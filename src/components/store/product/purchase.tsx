"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Share2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Price } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { formatMoney } from "@/core/money";
import { discountPercent } from "@/core/pricing";
import { cn } from "@/lib/utils";
import { useCart } from "../cart-context";
import { QtyStepper } from "../cart-drawer";
import { WishlistButton } from "../wishlist-button";
import { track } from "../tracking";

type Variant = { id: string; title: string; options: Record<string, string>; price: number; compareAt: number | null; available: number; imageId: string | null };
type Product = { id: string; name: string; slug: string; category: string | null; brand: string | null; optionNames: string[]; lowStockThreshold: number; image: string | null };

export function ProductPurchase({ product, variants }: { product: Product; variants: Variant[] }) {
  const router = useRouter();
  const toast = useToast();
  const { add, loading } = useCart();
  const firstAvailable = variants.find((v) => v.available > 0) ?? variants[0]!;
  const [selected, setSelected] = useState<Record<string, string>>(firstAvailable.options);
  const [qty, setQty] = useState(1);
  const [showSticky, setShowSticky] = useState(false);
  const buttonsRef = useRef<HTMLDivElement>(null);

  const variant = useMemo(() => (product.optionNames.length ? variants.find((v) => product.optionNames.every((n) => v.options[n] === selected[n])) : variants[0]) ?? null, [variants, selected, product.optionNames]);
  const values = (name: string) => [...new Set(variants.map((v) => v.options[name]).filter((x): x is string => Boolean(x)))];
  const availableFor = (name: string, value: string) => variants.some((v) => v.options[name] === value && v.available > 0 && product.optionNames.filter((n) => n !== name).every((n) => !selected[n] || v.options[n] === selected[n]));

  useEffect(() => {
    track("ViewContent", { productId: product.id, value: firstAvailable.price, items: [{ id: product.id, name: product.name, price: firstAvailable.price, quantity: 1, category: product.category ?? undefined, brand: product.brand ?? undefined }] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.id]);

  useEffect(() => {
    const el = buttonsRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setShowSticky(!e!.isIntersecting && e!.boundingClientRect.top < 0), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (variant && qty > variant.available) setQty(Math.max(1, variant.available));
  }, [variant, qty]);

  const canBuy = Boolean(variant && variant.available > 0);
  const meta = () => ({ productId: product.id, name: product.name, price: variant!.price, category: product.category, variant: variant!.title });
  const onAdd = () => variant && add(variant.id, qty, meta());
  const onBuyNow = async () => {
    if (!variant) return;
    if (await add(variant.id, qty, meta(), { openDrawer: false })) router.push("/checkout");
  };
  const share = async () => {
    const url = window.location.href;
    if (navigator.share) await navigator.share({ title: product.name, url }).catch(() => undefined);
    else {
      await navigator.clipboard.writeText(url);
      toast("Link copied");
    }
  };

  const urgency = variant && variant.available > 0 && variant.available <= product.lowStockThreshold;
  const dp = variant ? discountPercent(variant.price, variant.compareAt) : 0;

  return (
    <div className="mt-5">
      <div className="flex items-center gap-3">
        {variant && <Price price={variant.price} compareAt={variant.compareAt} size="lg" />}
        {dp > 0 && <span className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-bold text-accent">Save {dp}%</span>}
      </div>
      <p className={cn("mt-2 text-sm font-medium", !variant || variant.available === 0 ? "text-danger" : urgency ? "text-warn" : "text-success")} aria-live="polite">
        {!variant ? "This combination is unavailable" : variant.available === 0 ? "Out of stock" : urgency ? `Hurry — only ${variant.available} left in stock` : "In stock, ready to ship"}
      </p>

      {product.optionNames.map((name) => (
        <fieldset key={name} className="mt-5">
          <legend className="mb-2 text-sm font-medium">{name}: <span className="text-muted">{selected[name]}</span></legend>
          <div className="flex flex-wrap gap-2">
            {values(name).map((val) => {
              const active = selected[name] === val;
              const avail = availableFor(name, val);
              return (
                <button
                  key={val}
                  type="button"
                  onClick={() => setSelected((s) => ({ ...s, [name]: val }))}
                  aria-pressed={active}
                  className={cn("min-h-11 min-w-12 rounded-full border px-4 text-sm font-medium transition", active ? "border-ink bg-ink text-white" : "border-line bg-card hover:border-ink", !avail && !active && "text-muted line-through decoration-1")}
                >
                  {val}
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}

      <div ref={buttonsRef} className="mt-6 flex flex-wrap items-center gap-3">
        <QtyStepper value={qty} max={Math.max(1, Math.min(variant?.available ?? 1, 50))} onChange={setQty} />
        <Button onClick={onAdd} disabled={!canBuy} loading={loading} variant="outline" className="h-11 flex-1 sm:flex-none sm:px-8">Add to cart</Button>
        <Button onClick={onBuyNow} disabled={!canBuy} className="h-11 w-full sm:w-auto sm:flex-1"><Zap size={16} /> Buy now</Button>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <WishlistButton productId={product.id} productName={product.name} price={variant?.price ?? firstAvailable.price} className="border border-line shadow-none" />
        <button onClick={share} className="grid h-9 w-9 place-items-center rounded-full border border-line hover:border-ink" aria-label="Share"><Share2 size={16} /></button>
      </div>

      {/* Sticky mobile bar */}
      <div className={cn("safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card/95 p-3 backdrop-blur transition-transform lg:hidden", showSticky ? "translate-y-0" : "translate-y-full")} aria-hidden={!showSticky}>
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="line-clamp-1 text-xs text-muted">{product.name}</p>
            <p className="font-bold tabular-nums">{variant ? formatMoney(variant.price * qty) : "—"}</p>
          </div>
          <Button size="md" variant="outline" onClick={onAdd} disabled={!canBuy} tabIndex={showSticky ? 0 : -1}>Add</Button>
          <Button size="md" onClick={onBuyNow} disabled={!canBuy} tabIndex={showSticky ? 0 : -1}>Buy now</Button>
        </div>
      </div>
    </div>
  );
}

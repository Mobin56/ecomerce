"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect } from "react";
import { Minus, Plus, ShoppingBag, Trash2, Truck } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/core/money";
import { useCart } from "./cart-context";
import { trackGa } from "./tracking";

export function FreeShippingBar({ remaining, freeShipping, subtotal }: { remaining: number | null; freeShipping: boolean; subtotal: number }) {
  if (freeShipping) {
    return (
      <p className="flex items-center gap-2 rounded-xl bg-success-soft px-3 py-2.5 text-sm font-medium text-success">
        <Truck size={16} /> You&apos;ve unlocked FREE delivery!
      </p>
    );
  }
  if (remaining === null) return null;
  const pct = Math.min(100, Math.round((subtotal / (subtotal + remaining)) * 100));
  return (
    <div className="space-y-2 rounded-xl bg-paper px-3 py-2.5">
      <p className="text-sm">
        You&apos;re <strong>{formatMoney(remaining)}</strong> away from <strong>FREE DELIVERY</strong>
      </p>
      <div className="h-1.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-ink transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function QtyStepper({ value, max, onChange, size = "md" }: { value: number; max: number; onChange: (v: number) => void; size?: "sm" | "md" }) {
  const h = size === "sm" ? "h-9" : "h-11";
  return (
    <div className={`inline-flex ${h} items-center rounded-full border border-line bg-card`}>
      <button type="button" className="grid h-full w-9 place-items-center rounded-l-full hover:bg-line/50 disabled:opacity-40" onClick={() => onChange(value - 1)} disabled={value <= 1} aria-label="Decrease quantity">
        <Minus size={15} />
      </button>
      <span className="w-8 text-center text-sm font-semibold tabular-nums" aria-live="polite">{value}</span>
      <button type="button" className="grid h-full w-9 place-items-center rounded-r-full hover:bg-line/50 disabled:opacity-40" onClick={() => onChange(value + 1)} disabled={value >= max} aria-label="Increase quantity">
        <Plus size={15} />
      </button>
    </div>
  );
}

export function CartLines({ compact }: { compact?: boolean }) {
  const { cart, update } = useCart();
  if (!cart?.items.length) return null;
  return (
    <ul className="divide-y divide-line">
      {cart.items.map((i) => (
        <li key={i.variantId} className="flex gap-3 py-4">
          <Link href={`/products/${i.slug}`} className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-paper sm:h-24 sm:w-24">
            {i.image && <Image src={i.image} alt={i.name} fill sizes="96px" className="object-cover" />}
          </Link>
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex justify-between gap-2">
              <div className="min-w-0">
                <Link href={`/products/${i.slug}`} className="line-clamp-2 text-sm font-medium hover:underline">{i.name}</Link>
                {i.variantTitle && <p className="text-xs text-muted">{i.variantTitle}</p>}
              </div>
              <p className="text-sm font-semibold tabular-nums">{formatMoney(i.lineTotal)}</p>
            </div>
            {i.quantity > i.available && <p className="mt-1 text-xs font-medium text-danger">{i.available === 0 ? "Out of stock — please remove" : `Only ${i.available} left`}</p>}
            <div className="mt-auto flex items-center justify-between pt-2">
              <QtyStepper size="sm" value={i.quantity} max={Math.max(1, Math.min(i.available, 50))} onChange={(q) => update(i.variantId, q)} />
              <button onClick={() => update(i.variantId, 0)} className="rounded-full p-2 text-muted hover:bg-line/60 hover:text-danger" aria-label={`Remove ${i.name}`}>
                <Trash2 size={16} />
              </button>
            </div>
            {!compact && <p className="mt-1 text-xs text-muted">{formatMoney(i.unitPrice)} each</p>}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function CartDrawer() {
  const { cart, open, setOpen } = useCart();
  const t = cart?.totals;
  useEffect(() => {
    if (open && cart?.items.length && t) trackGa("view_cart", { value: t.subtotal, items: cart.items.map((i) => ({ id: i.productId, name: i.name, price: i.unitPrice, quantity: i.quantity })) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return (
    <Sheet
      open={open}
      onClose={() => setOpen(false)}
      title={`Your cart${cart?.items.length ? ` (${cart.items.reduce((s, i) => s + i.quantity, 0)})` : ""}`}
      footer={
        t ? (
          <div className="space-y-3">
            <div className="flex justify-between text-sm"><span className="text-muted">Subtotal</span><span className="font-semibold tabular-nums">{formatMoney(t.subtotal)}</span></div>
            {t.discount > 0 && <div className="flex justify-between text-sm text-success"><span>Discount</span><span className="tabular-nums">−{formatMoney(t.discount)}</span></div>}
            <Link href="/checkout" onClick={() => setOpen(false)} className="flex h-12 w-full items-center justify-center rounded-full bg-ink font-semibold text-white hover:bg-ink-soft">
              Checkout · {formatMoney(t.subtotal - t.discount)}
            </Link>
            <Link href="/cart" onClick={() => setOpen(false)} className="block text-center text-sm font-medium text-muted underline-offset-2 hover:underline">View cart</Link>
          </div>
        ) : undefined
      }
    >
      <div className="px-5">
        {!cart?.items.length ? (
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <ShoppingBag size={36} className="text-muted" />
            <p className="font-medium">Your cart is empty</p>
            <Button variant="outline" onClick={() => setOpen(false)}>Continue shopping</Button>
          </div>
        ) : (
          <>
            {t && <div className="pt-4"><FreeShippingBar remaining={t.freeShippingRemaining} freeShipping={t.freeShipping} subtotal={t.subtotal - t.discount} /></div>}
            <CartLines compact />
          </>
        )}
      </div>
    </Sheet>
  );
}

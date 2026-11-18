"use client";

import Link from "next/link";
import { useState } from "react";
import { ShoppingBag, Tag, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { formatMoney } from "@/core/money";
import { formatDate } from "@/lib/utils";
import { useCart } from "./cart-context";
import { CartLines, FreeShippingBar } from "./cart-drawer";

export function CouponBox() {
  const { cart, applyCoupon } = useCart();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (cart?.couponCode && !cart.totals?.couponError) {
    return (
      <div className="flex items-center justify-between rounded-xl bg-success-soft px-3 py-2.5 text-sm text-success">
        <span className="inline-flex items-center gap-2 font-semibold"><Tag size={15} /> {cart.couponCode} applied</span>
        <button onClick={() => applyCoupon(null)} aria-label="Remove coupon" className="rounded-full p-1 hover:bg-white/60"><X size={15} /></button>
      </div>
    );
  }
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!code.trim()) return;
        setBusy(true);
        setError(await applyCoupon(code.trim()));
        setBusy(false);
      }}
    >
      <label htmlFor="coupon" className="sr-only">Coupon code</label>
      <div className="flex gap-2">
        <input id="coupon" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Coupon code" autoComplete="off" className="h-11 min-w-0 flex-1 rounded-full border border-line bg-card px-4 text-sm uppercase outline-none focus:border-ink" aria-invalid={Boolean(error)} aria-describedby={error ? "coupon-err" : undefined} />
        <Button type="submit" variant="outline" loading={busy}>Apply</Button>
      </div>
      {error && <p id="coupon-err" role="alert" className="mt-1.5 text-xs text-danger">{error}</p>}
    </form>
  );
}

export function TotalsBlock() {
  const { cart } = useCart();
  const t = cart?.totals;
  if (!t) return null;
  return (
    <dl className="space-y-2.5 text-sm">
      <div className="flex justify-between"><dt className="text-muted">Subtotal ({t.itemCount} items)</dt><dd className="tabular-nums">{formatMoney(t.subtotal)}</dd></div>
      {t.discount > 0 && <div className="flex justify-between text-success"><dt>Discount</dt><dd className="tabular-nums">−{formatMoney(t.discount)}</dd></div>}
      <div className="flex justify-between"><dt className="text-muted">Delivery{cart?.shipping ? ` (${cart.shipping.name})` : ""}</dt><dd className="tabular-nums">{t.freeShipping ? <span className="font-semibold text-success">FREE</span> : formatMoney(t.shippingFee)}</dd></div>
      {cart?.estimate && <div className="flex justify-between text-xs text-muted"><dt>Estimated delivery</dt><dd>{formatDate(cart.estimate.from, { day: "numeric", month: "short" })} – {formatDate(cart.estimate.to, { day: "numeric", month: "short" })}</dd></div>}
      <div className="flex justify-between border-t border-line pt-3 text-base font-bold"><dt>Total</dt><dd className="tabular-nums">{formatMoney(t.total)}</dd></div>
    </dl>
  );
}

export function CartPageClient() {
  const { cart } = useCart();
  if (!cart) return <div className="skeleton h-64 w-full" />;
  if (!cart.items.length) return <EmptyState icon={<ShoppingBag size={36} />} title="Your cart is empty" body="Find something you love." action={<Link href="/products" className="inline-flex h-11 items-center rounded-full bg-ink px-6 font-semibold text-white">Start shopping</Link>} />;
  const t = cart.totals!;
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
      <div>
        <FreeShippingBar remaining={t.freeShippingRemaining} freeShipping={t.freeShipping} subtotal={t.subtotal - t.discount} />
        <CartLines />
      </div>
      <aside className="h-fit space-y-4 rounded-[var(--radius-card)] border border-line bg-card p-5 lg:sticky lg:top-24">
        <CouponBox />
        <TotalsBlock />
        <p className="text-xs text-muted">Delivery charge is calculated for your district at checkout.</p>
        <Link href="/checkout" className="flex h-12 w-full items-center justify-center rounded-full bg-ink font-semibold text-white hover:bg-ink-soft">Proceed to checkout</Link>
      </aside>
    </div>
  );
}

"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Banknote, CreditCard, Lock, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/misc";
import { api, ApiError } from "@/lib/api-client";
import { formatMoney } from "@/core/money";
import { useCart } from "./cart-context";
import { CouponBox, TotalsBlock } from "./cart-page";
import { track } from "./tracking";
import { cn } from "@/lib/utils";

type Method = { key: string; label: string; prepaid: boolean };
type Defaults = { name: string; phone: string; email: string; district: string; area: string; address: string };
type PlaceResult = { orderId: string; orderNumber: number; payment: { kind: "none" } | { kind: "redirect"; url: string } | { kind: "manual"; instructions: string } | { kind: "error"; message: string } };

const ICONS: Record<string, typeof Banknote> = { cod: Banknote, sslcommerz: CreditCard, mock: CreditCard };

/** One-page checkout: minimal fields, mobile-first, server-priced totals. */
export function CheckoutForm({ methods, districts, defaults }: { methods: Method[]; districts: string[]; defaults: Defaults }) {
  const router = useRouter();
  const { cart, refresh } = useCart();
  const [form, setForm] = useState({ ...defaults, notes: "", paymentMethod: methods[0]?.key ?? "cod" });
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);
  const initiated = useRef(false);

  useEffect(() => {
    void refresh(form.district);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.district]);

  useEffect(() => {
    if (initiated.current || !cart?.items.length || !cart.totals) return;
    initiated.current = true;
    track("InitiateCheckout", { value: cart.totals.total, items: cart.items.map((i) => ({ id: i.productId, name: i.name, price: i.unitPrice, quantity: i.quantity })) });
  }, [cart]);

  // Save contact for abandoned-cart recovery (debounced).
  useEffect(() => {
    if (form.phone.replace(/\D/g, "").length < 11 && !form.email) return;
    const t = setTimeout(() => void api("/api/cart/contact", { body: { phone: form.phone, email: form.email, name: form.name } }).catch(() => undefined), 800);
    return () => clearTimeout(t);
  }, [form.phone, form.email, form.name]);

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setErrors((er) => ({ ...er, [k]: undefined }));
  };

  if (cart && !cart.items.length) {
    return <EmptyState title="Your cart is empty" action={<Link href="/products" className="font-semibold underline">Continue shopping</Link>} />;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      const r = await api<PlaceResult>("/api/checkout", { body: { ...form, idempotencyKey } });
      if (r.payment.kind === "redirect") {
        window.location.assign(r.payment.url);
        return;
      }
      router.push(`/checkout/success?order=${r.orderId}${r.payment.kind === "error" ? "&payment=error" : ""}`);
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.message);
        if (err.fields) setErrors(Object.fromEntries(Object.entries(err.fields).map(([k, v]) => [k, v?.[0]])));
        if (err.code === "INSUFFICIENT_STOCK" || err.code === "INVALID_COUPON") void refresh(form.district);
      } else setFormError("Network error — please check your connection and try again.");
      setSubmitting(false);
    }
  }

  const total = cart?.totals?.total ?? 0;
  return (
    <form onSubmit={submit} noValidate className="grid gap-8 lg:grid-cols-[1fr_400px]">
      <div className="space-y-8">
        <fieldset className="space-y-4">
          <legend className="mb-3 text-lg font-semibold">Delivery details</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" htmlFor="name" error={errors.name}><Input id="name" autoComplete="name" required value={form.name} onChange={set("name")} aria-invalid={Boolean(errors.name)} /></Field>
            <Field label="Mobile number" htmlFor="phone" error={errors.phone} hint="We'll call to confirm your order"><Input id="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="01XXXXXXXXX" required value={form.phone} onChange={set("phone")} aria-invalid={Boolean(errors.phone)} /></Field>
          </div>
          <Field label="Email (optional)" htmlFor="email" error={errors.email}><Input id="email" type="email" autoComplete="email" value={form.email} onChange={set("email")} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="District" htmlFor="district" error={errors.district}>
              <Select id="district" value={form.district} onChange={set("district")} autoComplete="address-level1">{districts.map((d) => <option key={d}>{d}</option>)}</Select>
            </Field>
            <Field label="Area / Thana" htmlFor="area" error={errors.area}><Input id="area" autoComplete="address-level2" required value={form.area} onChange={set("area")} aria-invalid={Boolean(errors.area)} /></Field>
          </div>
          <Field label="Full address" htmlFor="address" error={errors.address} hint="House, road, block, landmark"><Textarea id="address" autoComplete="street-address" required rows={2} value={form.address} onChange={set("address")} aria-invalid={Boolean(errors.address)} className="min-h-20" /></Field>
        </fieldset>

        <fieldset>
          <legend className="mb-3 text-lg font-semibold">Payment</legend>
          <div className="grid gap-2" role="radiogroup">
            {methods.map((m) => {
              const Icon = ICONS[m.key] ?? Smartphone;
              const active = form.paymentMethod === m.key;
              return (
                <label key={m.key} className={cn("flex cursor-pointer items-center gap-3 rounded-xl border p-4 transition", active ? "border-ink bg-card ring-1 ring-ink" : "border-line bg-card hover:border-ink/40")}>
                  <input
                    type="radio"
                    name="paymentMethod"
                    value={m.key}
                    checked={active}
                    onChange={() => {
                      setForm((f) => ({ ...f, paymentMethod: m.key }));
                      track("AddPaymentInfo", { value: total, ga4Extra: { payment_type: m.key } });
                    }}
                    className="h-4 w-4 accent-[var(--color-ink)]"
                  />
                  <Icon size={20} aria-hidden />
                  <span className="flex-1 text-[15px] font-medium">{m.label}</span>
                  {m.key === "cod" && <span className="text-xs text-muted">Pay when you receive</span>}
                </label>
              );
            })}
          </div>
        </fieldset>

        <Field label="Order notes (optional)" htmlFor="notes"><Textarea id="notes" rows={2} value={form.notes} onChange={set("notes")} placeholder="Delivery instructions, preferred time…" className="min-h-16" /></Field>
      </div>

      <aside className="h-fit space-y-4 rounded-[var(--radius-card)] border border-line bg-card p-5 lg:sticky lg:top-24">
        <h2 className="font-semibold">Order summary</h2>
        {!cart ? <div className="skeleton h-40" /> : (
          <ul className="max-h-64 space-y-3 overflow-y-auto">
            {cart.items.map((i) => (
              <li key={i.variantId} className="flex items-center gap-3 text-sm">
                <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-paper">{i.image && <Image src={i.image} alt="" fill sizes="56px" className="object-cover" />}<span className="absolute -right-0 -top-0 grid h-5 min-w-5 place-items-center rounded-full bg-ink px-1 text-[10px] font-bold text-white">{i.quantity}</span></span>
                <span className="min-w-0 flex-1"><span className="line-clamp-1">{i.name}</span>{i.variantTitle && <span className="text-xs text-muted">{i.variantTitle}</span>}</span>
                <span className="tabular-nums">{formatMoney(i.lineTotal)}</span>
              </li>
            ))}
          </ul>
        )}
        <CouponBox />
        <TotalsBlock />
        {cart?.totals?.stockErrors.length ? <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-danger">Some items are no longer available in the requested quantity. Please update your cart.</p> : null}
        {formError && <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-danger">{formError}</p>}
        <Button type="submit" size="lg" className="h-13 w-full text-base" loading={submitting} disabled={!cart?.items.length || Boolean(cart?.totals?.stockErrors.length)}>
          {methods.find((m) => m.key === form.paymentMethod)?.prepaid ? "Pay" : "Place order"} · {formatMoney(total)}
        </Button>
        <p className="flex items-center justify-center gap-1.5 text-xs text-muted"><Lock size={12} /> Secure checkout. Prices are confirmed on our server.</p>
      </aside>
    </form>
  );
}

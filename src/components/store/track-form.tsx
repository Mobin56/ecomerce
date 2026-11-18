"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { api, ApiError } from "@/lib/api-client";
import { formatMoney } from "@/core/money";
import { STATUS_LABELS, ORDER_FLOW, type OrderStatus } from "@/core/order-status";
import { formatDateTime } from "@/lib/utils";

type Result = { number: number; status: OrderStatus; total: number; createdAt: string; items: { name: string; variantTitle: string; quantity: number }[]; history: { to: OrderStatus; createdAt: string }[]; shipments: { courier: string; trackingId: string | null }[] };

export function TrackOrderForm() {
  const [res, setRes] = useState<Result | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  return (
    <>
      <form
        className="mt-6 grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setLoading(true);
          setErr(null);
          try {
            setRes(await api<Result>("/api/orders/lookup", { body: { orderNumber: f.get("orderNumber"), phone: f.get("phone") } }));
          } catch (e2) {
            setRes(null);
            setErr(e2 instanceof ApiError ? e2.message : "Try again");
          } finally {
            setLoading(false);
          }
        }}
      >
        <Field label="Order number" htmlFor="on"><Input id="on" name="orderNumber" inputMode="numeric" placeholder="10021" required /></Field>
        <Field label="Phone" htmlFor="ph"><Input id="ph" name="phone" type="tel" inputMode="tel" placeholder="01XXXXXXXXX" required /></Field>
        <Button type="submit" loading={loading}>Track</Button>
      </form>
      {err && <p role="alert" className="mt-4 text-sm text-danger">{err}</p>}
      {res && (
        <div className="mt-8 rounded-[var(--radius-card)] border border-line bg-card p-5">
          <div className="flex items-center justify-between"><h2 className="font-semibold">Order #{res.number}</h2><span className="text-sm font-semibold">{formatMoney(res.total)}</span></div>
          <ol className="mt-5 space-y-4">
            {(["CANCELLED", "RETURNED", "FAILED_DELIVERY"].includes(res.status) ? [...res.history.map((h) => h.to)] : ORDER_FLOW).filter((s, i, a) => a.indexOf(s) === i).map((s) => {
              const h = res.history.find((x) => x.to === s);
              const done = Boolean(h);
              return (
                <li key={s} className="flex gap-3">
                  <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${done ? "bg-ink text-white" : "border border-line"}`}>{done && <Check size={14} />}</span>
                  <span><span className={`block text-sm font-medium ${done ? "" : "text-muted"}`}>{STATUS_LABELS[s]}</span>{h && <span className="text-xs text-muted">{formatDateTime(h.createdAt)}</span>}</span>
                </li>
              );
            })}
          </ol>
          {res.shipments[0]?.trackingId && <p className="mt-5 text-sm">Courier: <strong className="capitalize">{res.shipments[0].courier}</strong> · Tracking ID <strong>{res.shipments[0].trackingId}</strong></p>}
        </div>
      )}
    </>
  );
}

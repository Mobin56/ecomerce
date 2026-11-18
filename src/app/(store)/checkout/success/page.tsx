import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { CheckCircle2 } from "lucide-react";
import { db } from "@/server/db";
import { LAST_ORDER_COOKIE } from "@/server/orders";
import { getSettings } from "@/server/settings";
import { formatMoney } from "@/core/money";
import { PurchaseTracker } from "@/components/store/tracking";
import { ManualPaymentForm } from "@/components/store/manual-payment-form";

export const metadata: Metadata = { title: "Order confirmed", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function SuccessPage({ searchParams }: { searchParams: Promise<{ order?: string; payment?: string }> }) {
  const { order: orderId, payment } = await searchParams;
  const jar = await cookies();
  // Only the browser that placed the order sees its details.
  const order = orderId && jar.get(LAST_ORDER_COOKIE)?.value === orderId ? await db.order.findUnique({ where: { id: orderId }, include: { items: true } }) : null;
  const pay = await getSettings("payment");

  if (!order) {
    return (
      <div className="container-x max-w-xl py-20 text-center">
        <h1 className="font-display text-3xl font-semibold">Thank you!</h1>
        <p className="mt-3 text-muted">Your order has been received. You can check its status any time.</p>
        <Link href="/track" className="mt-6 inline-flex h-11 items-center rounded-full bg-ink px-6 font-semibold text-white">Track your order</Link>
      </div>
    );
  }
  const manual = ["bkash_manual", "nagad", "rocket"].includes(order.paymentMethod) && order.paymentStatus !== "PAID";
  const manualNumber = order.paymentMethod === "bkash_manual" ? pay.manualMfsNumbers.bkash : pay.manualMfsNumbers[order.paymentMethod];
  return (
    <div className="container-x max-w-2xl py-12">
      <div className="text-center">
        <CheckCircle2 size={52} className="mx-auto text-success" aria-hidden />
        <h1 className="mt-4 font-display text-3xl font-semibold">Order #{order.number} placed!</h1>
        <p className="mt-2 text-muted">We&apos;ll call {order.shipPhone} to confirm. A confirmation SMS is on its way.</p>
      </div>
      {payment === "error" && <p role="alert" className="mt-6 rounded-xl bg-warn-soft p-4 text-sm text-warn">We couldn&apos;t start the online payment, but your order is saved. Our team will contact you, or you can pay cash on delivery.</p>}
      {manual && (
        <div className="mt-8 rounded-[var(--radius-card)] border border-line bg-card p-5">
          <h2 className="font-semibold">Complete your payment</h2>
          <p className="mt-2 text-sm text-ink-soft">Send <strong>{formatMoney(order.total)}</strong> to <strong>{manualNumber}</strong> using “Send Money”, with reference <strong>{order.number}</strong>. Then enter the Transaction ID:</p>
          <ManualPaymentForm orderId={order.id} phone={order.shipPhone} />
        </div>
      )}
      <div className="mt-8 rounded-[var(--radius-card)] border border-line bg-card p-5">
        <ul className="divide-y divide-line text-sm">
          {order.items.map((i) => (
            <li key={i.id} className="flex justify-between gap-4 py-3"><span>{i.name}{i.variantTitle !== "Default" ? ` · ${i.variantTitle}` : ""} × {i.quantity}</span><span className="tabular-nums">{formatMoney(i.lineTotal)}</span></li>
          ))}
        </ul>
        <dl className="mt-3 space-y-1.5 border-t border-line pt-3 text-sm">
          <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd>{formatMoney(order.subtotal)}</dd></div>
          {order.discount > 0 && <div className="flex justify-between text-success"><dt>Discount</dt><dd>−{formatMoney(order.discount)}</dd></div>}
          <div className="flex justify-between"><dt className="text-muted">Delivery</dt><dd>{order.shippingFee ? formatMoney(order.shippingFee) : "FREE"}</dd></div>
          <div className="flex justify-between text-base font-bold"><dt>Total</dt><dd>{formatMoney(order.total)}</dd></div>
        </dl>
        <p className="mt-4 text-sm text-muted">Delivering to: {order.shipAddress}, {order.shipArea}, {order.shipDistrict}</p>
      </div>
      <div className="mt-8 flex justify-center gap-3">
        <Link href="/products" className="inline-flex h-11 items-center rounded-full border border-line px-6 font-semibold">Continue shopping</Link>
        <Link href="/track" className="inline-flex h-11 items-center rounded-full bg-ink px-6 font-semibold text-white">Track order</Link>
      </div>
      <PurchaseTracker
        enabled={Boolean(order.purchaseTrackedAt)}
        orderId={order.id}
        eventId={order.metaEventId ?? `purchase.${order.id}`}
        value={order.total}
        items={order.items.map((i) => ({ id: i.productId, name: i.name, price: i.unitPrice, quantity: i.quantity }))}
      />
    </div>
  );
}

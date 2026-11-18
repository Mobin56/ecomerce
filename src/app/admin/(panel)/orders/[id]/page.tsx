import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MessageCircle, Phone, Printer } from "lucide-react";
import { requireAdminPage } from "@/server/auth/admin";
import { db } from "@/server/db";
import { allCouriers } from "@/server/courier/providers";
import { logActivity } from "@/server/activity";
import { PageHeader, Card, OrderStatusBadge, RiskBadge, inputCls, labelCls } from "@/components/admin/ui";
import { ActionForm, SubmitButton } from "@/components/admin/action-form";
import { formatMoney } from "@/core/money";
import { nextStatuses, STATUS_LABELS, type OrderStatus } from "@/core/order-status";
import { toE164Digits } from "@/core/phone";
import { DISTRICTS } from "@/core/locations";
import { can } from "@/core/rbac";
import { formatDateTime } from "@/lib/utils";
import { changeStatusAction, createShipmentAction, trackShipmentAction, refundAction, editOrderAction, verifyManualPaymentAction, addOrderNoteAction } from "../../../_actions/orders";

export default async function OrderDetail({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminPage("orders.view");
  const { id } = await params;
  const o = await db.order.findUnique({
    where: { id },
    include: {
      items: true,
      customer: { select: { id: true, name: true, phone: true, _count: { select: { orders: true } } } },
      payments: { orderBy: { createdAt: "desc" } },
      shipments: { orderBy: { createdAt: "desc" }, include: { events: { orderBy: { createdAt: "desc" }, take: 10 } } },
      history: { orderBy: { createdAt: "desc" }, include: { user: { select: { name: true } } } },
      attribution: true,
      profit: true,
    },
  });
  if (!o) notFound();
  await logActivity({ userId: admin.id, action: "customer.data_accessed", entityType: "order", entityId: o.id });
  const couriers = allCouriers().filter((c) => c.isConfigured);
  const next = nextStatuses(o.status as OrderStatus);
  const reasons = (o.riskReasons as { label: string; points: number }[]) ?? [];
  const activeShipment = o.shipments.find((s) => !["FAILED", "CANCELLED"].includes(s.status));
  const paid = o.payments.filter((p) => p.status === "SUCCEEDED").reduce((s, p) => s + p.amount - p.refundedAmount, 0);
  const pendingManual = o.payments.find((p) => p.status === "PENDING" && p.transactionId);

  return (
    <>
      <PageHeader
        title={`Order #${o.number}`}
        description={`Placed ${formatDateTime(o.createdAt)} · ${o.deviceType ?? "unknown device"}`}
        actions={
          <>
            <a href={`tel:${o.shipPhone}`} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line bg-card px-3 text-sm"><Phone size={14} /> Call</a>
            <a href={`https://wa.me/${toE164Digits(o.shipPhone)}?text=${encodeURIComponent(`Hello ${o.shipName}, about your order #${o.number}:`)}`} target="_blank" rel="noopener" className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line bg-card px-3 text-sm"><MessageCircle size={14} /> WhatsApp</a>
            <Link href={`/admin/orders/${o.id}/print?type=invoice`} target="_blank" className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line bg-card px-3 text-sm"><Printer size={14} /> Invoice</Link>
            <Link href={`/admin/orders/${o.id}/print?type=packing`} target="_blank" className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line bg-card px-3 text-sm"><Printer size={14} /> Packing slip</Link>
          </>
        }
      />
      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          <Card title="Status" actions={<div className="flex items-center gap-2"><OrderStatusBadge status={o.status} /><RiskBadge level={o.riskLevel} /></div>}>
            {can(admin, "orders.update") && next.length > 0 ? (
              <ActionForm action={changeStatusAction} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="orderId" value={o.id} />
                <div><label className={labelCls} htmlFor="status">Move to</label>
                  <select id="status" name="status" className={inputCls}>{next.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}</select></div>
                <div className="min-w-48 flex-1"><label className={labelCls} htmlFor="note">Note (optional)</label><input id="note" name="note" className={inputCls} /></div>
                {next.includes("RETURNED") && (
                  <div><label className={labelCls} htmlFor="restock">On return</label><select id="restock" name="restock" className={inputCls}><option value="yes">Restock items</option><option value="no">Damaged — don&apos;t restock</option></select></div>
                )}
                <SubmitButton>Update</SubmitButton>
              </ActionForm>
            ) : <p className="text-sm text-muted">No further status changes available.</p>}
            {reasons.length > 0 && (
              <div className="mt-4 rounded-lg bg-warn-soft p-3 text-sm text-warn">
                <p className="font-semibold">Risk score {o.riskScore}/100</p>
                <ul className="mt-1 list-disc pl-5">{reasons.map((r, i) => <li key={i}>{r.label} (+{r.points})</li>)}</ul>
              </div>
            )}
          </Card>

          <Card title="Items" padded={false}>
            <ul className="divide-y divide-line">
              {o.items.map((i) => (
                <li key={i.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                  <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-paper">{i.imageUrl && <Image src={i.imageUrl} alt="" fill sizes="48px" className="object-cover" />}</span>
                  <span className="min-w-0 flex-1"><Link href={`/admin/products/${i.productId}`} className="font-medium hover:underline">{i.name}</Link><span className="block text-xs text-muted">{i.variantTitle !== "Default" ? `${i.variantTitle} · ` : ""}SKU {i.sku}</span></span>
                  <span className="text-xs text-muted">{formatMoney(i.unitPrice)} × {i.quantity}</span>
                  <span className="w-24 text-right font-semibold tabular-nums">{formatMoney(i.lineTotal)}</span>
                </li>
              ))}
            </ul>
            <dl className="space-y-1 border-t border-line px-5 py-4 text-sm">
              <Row k="Subtotal" v={formatMoney(o.subtotal)} />
              {o.discount > 0 && <Row k={`Discount${o.couponCode ? ` (${o.couponCode})` : ""}`} v={`−${formatMoney(o.discount)}`} />}
              <Row k="Delivery charge" v={formatMoney(o.shippingFee)} />
              <Row k="Total" v={formatMoney(o.total)} bold />
            </dl>
          </Card>

          {can(admin, "shipping.manage") && (
            <Card title="Courier">
              {o.shipments.map((s) => (
                <div key={s.id} className="mb-4 rounded-lg border border-line p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p><strong className="capitalize">{s.courier}</strong> · {s.trackingId ?? "no tracking id"} · <span className={s.status === "FAILED" ? "text-danger" : ""}>{s.status}</span></p>
                    {s.trackingId && (
                      <ActionForm action={trackShipmentAction}><input type="hidden" name="shipmentId" value={s.id} /><input type="hidden" name="orderId" value={o.id} /><SubmitButton variant="outline">Refresh tracking</SubmitButton></ActionForm>
                    )}
                  </div>
                  {s.error && <p className="mt-1 text-xs text-danger">{s.error}</p>}
                  <p className="mt-1 text-xs text-muted">COD {formatMoney(s.codAmount)} · charge {formatMoney(s.deliveryCharge)} · attempt {s.attempts}</p>
                  {s.events.length > 0 && <ul className="mt-2 space-y-0.5 text-xs text-muted">{s.events.map((e) => <li key={e.id}>{formatDateTime(e.createdAt)} — {e.status}{e.message ? `: ${e.message}` : ""}</li>)}</ul>}
                  <details className="mt-2 text-xs"><summary className="cursor-pointer text-muted">Courier response</summary><pre className="mt-1 max-h-48 overflow-auto rounded bg-paper p-2">{JSON.stringify(s.lastResponse, null, 2)}</pre></details>
                </div>
              ))}
              {!activeShipment && ["CONFIRMED", "PROCESSING", "PACKED"].includes(o.status) && (
                <ActionForm action={createShipmentAction} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="orderId" value={o.id} />
                  <div><label className={labelCls} htmlFor="courier">Courier</label><select id="courier" name="courier" className={inputCls}>{couriers.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select></div>
                  <SubmitButton>{o.shipments.some((s) => s.status === "FAILED") ? "Retry shipment" : "Create shipment"}</SubmitButton>
                </ActionForm>
              )}
              {!activeShipment && !["CONFIRMED", "PROCESSING", "PACKED"].includes(o.status) && o.shipments.length === 0 && <p className="text-sm text-muted">Confirm the order to create a shipment.</p>}
            </Card>
          )}

          <Card title="Timeline">
            <ActionForm action={addOrderNoteAction} className="mb-4 flex gap-2"><input type="hidden" name="orderId" value={o.id} /><input name="note" placeholder="Add an internal note (call outcome, etc.)" className={inputCls} /><SubmitButton variant="outline">Add</SubmitButton></ActionForm>
            <ol className="space-y-3 text-sm">
              {o.history.map((h) => (
                <li key={h.id} className="border-l-2 border-line pl-3">
                  <p>{h.from !== h.to ? <strong>{STATUS_LABELS[h.to]}</strong> : null} {h.note}</p>
                  <p className="text-xs text-muted">{formatDateTime(h.createdAt)}{h.user ? ` · ${h.user.name}` : ""}</p>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Customer">
            <p className="font-semibold"><Link href={`/admin/customers/${o.customer.id}`} className="hover:underline">{o.shipName}</Link></p>
            <p className="text-sm">{o.shipPhone}{o.shipEmail ? ` · ${o.shipEmail}` : ""}</p>
            <p className="mt-2 text-sm text-ink-soft">{o.shipAddress}, {o.shipArea}, {o.shipDistrict}</p>
            {o.notes && <p className="mt-2 rounded-lg bg-paper p-2 text-sm">“{o.notes}”</p>}
            <p className="mt-2 text-xs text-muted">{o.customer._count.orders} orders total</p>
            {can(admin, "orders.update") && !["SHIPPED", "DELIVERED", "RETURNED", "CANCELLED"].includes(o.status) && (
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer font-semibold">Edit delivery details</summary>
                <ActionForm action={editOrderAction} className="mt-3 space-y-2">
                  <input type="hidden" name="orderId" value={o.id} />
                  <input name="shipName" defaultValue={o.shipName} className={inputCls} aria-label="Name" />
                  <input name="shipPhone" defaultValue={o.shipPhone} className={inputCls} aria-label="Phone" />
                  <select name="shipDistrict" defaultValue={o.shipDistrict} className={inputCls} aria-label="District">{DISTRICTS.map((d) => <option key={d}>{d}</option>)}</select>
                  <input name="shipArea" defaultValue={o.shipArea} className={inputCls} aria-label="Area" />
                  <textarea name="shipAddress" defaultValue={o.shipAddress} className={`${inputCls} h-20 py-2`} aria-label="Address" />
                  <textarea name="notes" defaultValue={o.notes ?? ""} className={`${inputCls} h-16 py-2`} aria-label="Notes" />
                  <SubmitButton>Save</SubmitButton>
                </ActionForm>
              </details>
            )}
          </Card>

          <Card title="Payment">
            <dl className="space-y-1 text-sm">
              <Row k="Method" v={o.paymentMethod.toUpperCase()} />
              <Row k="Status" v={o.paymentStatus} />
              <Row k="Collected" v={formatMoney(paid)} />
            </dl>
            <ul className="mt-3 space-y-1 text-xs text-muted">
              {o.payments.map((p) => <li key={p.id}>{p.provider} · {p.status} · {formatMoney(p.amount)}{p.transactionId ? ` · ${p.transactionId}` : ""}{p.refundedAmount ? ` · refunded ${formatMoney(p.refundedAmount)}` : ""}</li>)}
            </ul>
            {pendingManual && can(admin, "orders.update") && (
              <ActionForm action={verifyManualPaymentAction} className="mt-3 rounded-lg bg-warn-soft p-3" confirm="Have you confirmed this TrxID in the wallet statement?">
                <p className="text-sm text-warn">Customer submitted TrxID <strong>{pendingManual.transactionId}</strong>. Verify it in your {o.paymentMethod} statement.</p>
                <input type="hidden" name="orderId" value={o.id} /><input type="hidden" name="trxId" value={pendingManual.transactionId!} />
                <SubmitButton className="mt-2">Mark as paid</SubmitButton>
              </ActionForm>
            )}
            {can(admin, "orders.refund") && paid > 0 && (
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer font-semibold">Refund</summary>
                <ActionForm action={refundAction} className="mt-2 space-y-2" confirm="Issue this refund?">
                  <input type="hidden" name="orderId" value={o.id} />
                  <input name="amount" type="number" step="0.01" max={paid / 100} placeholder={`Max ${paid / 100}`} className={inputCls} aria-label="Amount (৳)" required />
                  <input name="reason" placeholder="Reason" className={inputCls} required aria-label="Reason" />
                  <SubmitButton variant="danger">Refund</SubmitButton>
                </ActionForm>
              </details>
            )}
          </Card>

          <Card title="Source & attribution">
            {o.attribution ? (
              <dl className="space-y-1 text-sm">
                <Row k="Channel" v={o.attribution.channel.replace(/_/g, " ")} />
                {o.attribution.utmSource && <Row k="Source" v={o.attribution.utmSource} />}
                {o.attribution.utmMedium && <Row k="Medium" v={o.attribution.utmMedium} />}
                {o.attribution.utmCampaign && <Row k="Campaign" v={o.attribution.utmCampaign} />}
                {o.attribution.utmContent && <Row k="Content / ad" v={o.attribution.utmContent} />}
                {o.attribution.utmTerm && <Row k="Term" v={o.attribution.utmTerm} />}
                {o.attribution.landingPage && <Row k="Landing" v={o.attribution.landingPage} />}
                {o.attribution.referrer && <Row k="Referrer" v={o.attribution.referrer} />}
                <Row k="Click ids" v={[o.attribution.fbclid && "fbclid", o.attribution.gclid && "gclid"].filter(Boolean).join(", ") || "—"} />
                {(o.attribution.firstTouch as { channel?: string; utmCampaign?: string } | null)?.channel && (
                  <Row k="First touch" v={`${(o.attribution.firstTouch as { channel: string }).channel}${(o.attribution.firstTouch as { utmCampaign?: string }).utmCampaign ? ` → ${(o.attribution.firstTouch as { utmCampaign?: string }).utmCampaign}` : ""}`} />
                )}
              </dl>
            ) : <p className="text-sm text-muted">Direct / unknown</p>}
            {can(admin, "marketing.view") && <p className="mt-3 text-xs text-muted">Meta Purchase: {o.purchaseTrackedAt ? `sent ${formatDateTime(o.purchaseTrackedAt)}` : "not yet (waiting for payment)"} · event_id {o.metaEventId}</p>}
          </Card>

          {o.profit && can(admin, "finance.view") && (
            <Card title="Order profit">
              <dl className="space-y-1 text-sm">
                <Row k="Revenue" v={formatMoney(o.profit.revenue)} />
                <Row k="Shipping income" v={formatMoney(o.profit.shippingIncome)} />
                <Row k="Product cost" v={`−${formatMoney(o.profit.productCost)}`} />
                <Row k="Delivery cost" v={`−${formatMoney(o.profit.deliveryCost)}`} />
                <Row k="Gateway fee" v={`−${formatMoney(o.profit.gatewayFee)}`} />
                {o.profit.returnLoss > 0 && <Row k="Return loss" v={`−${formatMoney(o.profit.returnLoss)}`} />}
                <Row k="Net" v={formatMoney(o.profit.netProfit)} bold />
              </dl>
            </Card>
          )}
          <p className="px-1 text-xs text-muted">IP {o.ip ?? "—"}</p>
        </div>
      </div>
    </>
  );
}

function Row({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return <div className={`flex justify-between gap-4 ${bold ? "border-t border-line pt-2 font-semibold" : ""}`}><dt className="text-muted">{k}</dt><dd className="break-all text-right">{v}</dd></div>;
}

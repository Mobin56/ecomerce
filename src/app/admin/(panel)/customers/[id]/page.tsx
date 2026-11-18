import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/server/auth/admin";
import { getCustomerProfile } from "@/server/customers";
import { logActivity } from "@/server/activity";
import { PageHeader, Card, Stat, OrderStatusBadge, RiskBadge } from "@/components/admin/ui";
import { ActionForm, SubmitButton } from "@/components/admin/action-form";
import { Badge } from "@/components/ui/misc";
import { formatMoney } from "@/core/money";
import { SEGMENT_LABELS } from "@/core/segments";
import { can } from "@/core/rbac";
import { formatDate } from "@/lib/utils";
import { blockCustomerAction } from "../../../_actions/system";

export default async function CustomerProfile({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminPage("customers.view");
  const { id } = await params;
  const p = await getCustomerProfile(id);
  if (!p) notFound();
  await logActivity({ userId: admin.id, action: "customer.data_accessed", entityType: "customer", entityId: id });
  const { customer: c, stats: s } = p;
  return (
    <>
      <PageHeader title={c.name ?? c.phone} description={`${c.phone}${c.email ? ` · ${c.email}` : ""} · customer since ${formatDate(c.createdAt)}`} actions={<div className="flex flex-wrap gap-1">{p.segments.map((x) => <Badge key={x}>{SEGMENT_LABELS[x]}</Badge>)}{c.isBlocked && <Badge tone="danger">Blocked</Badge>}</div>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <Stat label="Total orders" value={s.totalOrders} />
        <Stat label="Delivered" value={s.deliveredOrders} />
        <Stat label="Cancelled" value={s.cancelledOrders} tone={s.cancelledOrders ? "bad" : undefined} />
        <Stat label="Returned" value={s.returnedOrders} tone={s.returnedOrders ? "bad" : undefined} />
        <Stat label="Total spent" value={formatMoney(s.totalSpent)} />
        <Stat label="Avg order" value={formatMoney(s.aov)} />
        <Stat label="Est. lifetime value" value={formatMoney(s.clv)} sub="24-month projection" />
        <Stat label="First / last order" value={<span className="text-sm">{s.firstOrderAt ? formatDate(s.firstOrderAt) : "—"}<br />{s.lastOrderAt ? formatDate(s.lastOrderAt) : ""}</span>} />
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_340px]">
        <Card title="Orders" padded={false}>
          <ul className="divide-y divide-line text-sm">
            {p.orders.map((o) => (
              <li key={o.id}><Link href={`/admin/orders/${o.id}`} className="grid grid-cols-[70px_1fr_auto_auto] items-center gap-3 px-5 py-3 hover:bg-paper"><span className="font-semibold">#{o.number}</span><span className="text-xs text-muted">{formatDate(o.createdAt)} · {o.source}</span><span className="flex gap-1"><OrderStatusBadge status={o.status} />{o.riskLevel !== "LOW" && <RiskBadge level={o.riskLevel} />}</span><span className="tabular-nums">{formatMoney(o.total)}</span></Link></li>
            ))}
          </ul>
        </Card>
        <div className="space-y-4">
          <Card title="Acquisition"><p className="text-sm capitalize">{p.acquisition.source.replace(/_/g, " ")}</p>{p.acquisition.campaign && <p className="text-sm text-muted">Campaign: {p.acquisition.campaign}</p>}</Card>
          <Card title="Favourite products"><ul className="space-y-1 text-sm">{p.favourites.length === 0 && <li className="text-muted">—</li>}{p.favourites.map((f) => <li key={f.productId} className="flex justify-between"><Link href={`/admin/products/${f.productId}`} className="line-clamp-1 hover:underline">{f.name}</Link><span className="text-muted">×{f.qty}</span></li>)}</ul></Card>
          <Card title="Addresses"><ul className="space-y-2 text-sm">{c.addresses.length === 0 && <li className="text-muted">Uses order addresses</li>}{c.addresses.map((a) => <li key={a.id}>{a.line1}, {a.area}, {a.district}</li>)}</ul></Card>
          {can(admin, "customers.update") && (
            <Card title="Account">
              <ActionForm action={blockCustomerAction} confirm={c.isBlocked ? "Unblock this customer?" : "Block this customer? New orders will be flagged HIGH risk."}>
                <input type="hidden" name="id" value={c.id} />
                <textarea name="notes" defaultValue={c.notes ?? ""} placeholder="Internal notes" className="mb-2 h-20 w-full rounded-lg border border-line p-2 text-sm" aria-label="Notes" />
                <SubmitButton variant={c.isBlocked ? "outline" : "danger"}>{c.isBlocked ? "Unblock & save" : "Block customer"}</SubmitButton>
              </ActionForm>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

import Link from "next/link";
import type { Prisma, OrderStatus } from "@prisma/client";
import { requireAdminPage } from "@/server/auth/admin";
import { db } from "@/server/db";
import { PageHeader, Card, Table, Pager, OrderStatusBadge, RiskBadge, inputCls } from "@/components/admin/ui";
import { ActionForm, SubmitButton } from "@/components/admin/action-form";
import { formatMoney } from "@/core/money";
import { STATUS_LABELS } from "@/core/order-status";
import { formatDateTime } from "@/lib/utils";
import { bulkStatusAction } from "../../_actions/orders";

type SP = { status?: string; risk?: string; payment?: string; q?: string; page?: string; from?: string; to?: string };

export default async function OrdersPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdminPage("orders.view");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const where: Prisma.OrderWhereInput = {};
  if (sp.status && sp.status in STATUS_LABELS) where.status = sp.status as OrderStatus;
  if (sp.risk === "HIGH" || sp.risk === "MEDIUM") where.riskLevel = sp.risk;
  if (sp.payment) where.paymentMethod = sp.payment;
  if (sp.from || sp.to) where.createdAt = { ...(sp.from ? { gte: new Date(sp.from) } : {}), ...(sp.to ? { lt: new Date(new Date(sp.to).getTime() + 86_400_000) } : {}) };
  if (sp.q) {
    const q = sp.q.trim();
    const num = Number.parseInt(q.replace("#", ""), 10);
    where.OR = [{ shipName: { contains: q, mode: "insensitive" } }, { shipPhone: { contains: q.replace(/\D/g, "") || q } }, ...(Number.isFinite(num) ? [{ number: num }] : []), { shipments: { some: { trackingId: q } } }];
  }
  const [total, orders, counts] = await Promise.all([
    db.order.count({ where }),
    db.order.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * 30, take: 30, include: { _count: { select: { items: true } }, shipments: { select: { trackingId: true, courier: true }, take: 1, orderBy: { createdAt: "desc" } } } }),
    db.order.groupBy({ by: ["status"], _count: true }),
  ]);
  const qs = (patch: Partial<SP>) => `/admin/orders?${new URLSearchParams(Object.entries({ ...sp, ...patch }).filter(([, v]) => v) as [string, string][]).toString()}`;

  return (
    <>
      <PageHeader title="Orders" description={`${total} orders`} />
      <nav className="no-scrollbar mb-4 flex gap-1 overflow-x-auto">
        <Link href={qs({ status: undefined, page: undefined })} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${!sp.status ? "bg-ink text-white" : "bg-card"}`}>All</Link>
        {(Object.keys(STATUS_LABELS) as OrderStatus[]).map((s) => (
          <Link key={s} href={qs({ status: s, page: undefined })} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${sp.status === s ? "bg-ink text-white" : "bg-card"}`}>
            {STATUS_LABELS[s]} <span className="opacity-60">{counts.find((c) => c.status === s)?._count ?? 0}</span>
          </Link>
        ))}
      </nav>
      <form className="mb-4 grid gap-2 sm:grid-cols-[1fr_140px_150px_150px_auto]" method="get">
        {sp.status && <input type="hidden" name="status" value={sp.status} />}
        <input name="q" defaultValue={sp.q} placeholder="Search #, name, phone, tracking" className={inputCls} />
        <select name="risk" defaultValue={sp.risk ?? ""} className={inputCls}><option value="">Any risk</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option></select>
        <input type="date" name="from" defaultValue={sp.from} className={inputCls} aria-label="From date" />
        <input type="date" name="to" defaultValue={sp.to} className={inputCls} aria-label="To date" />
        <button className="h-10 rounded-lg bg-ink px-4 text-sm font-semibold text-white">Filter</button>
      </form>
      <Card padded={false}>
        <ActionForm action={bulkStatusAction} confirm="Apply status to selected orders?">
          <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
            <span className="text-xs text-muted">Selected →</span>
            <select name="status" className="h-8 rounded-lg border border-line px-2 text-xs" aria-label="Bulk status">
              {(["CONFIRMED", "PROCESSING", "PACKED", "SHIPPED", "DELIVERED", "CANCELLED"] as const).map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </select>
            <SubmitButton variant="outline">Apply</SubmitButton>
          </div>
          <Table head={["", "Order", "Customer", "Items", "Total", "Payment", "Status", "Risk", "Source", "Date"]} empty={orders.length === 0}>
            {orders.map((o) => (
              <tr key={o.id} className="hover:bg-paper">
                <td><input type="checkbox" name="ids" value={o.id} aria-label={`Select order ${o.number}`} /></td>
                <td><Link href={`/admin/orders/${o.id}`} className="font-semibold hover:underline">#{o.number}</Link></td>
                <td><p>{o.shipName}</p><p className="text-xs text-muted">{o.shipPhone} · {o.shipDistrict}</p></td>
                <td>{o._count.items}</td>
                <td className="tabular-nums">{formatMoney(o.total)}</td>
                <td><p className="uppercase text-xs">{o.paymentMethod}</p><p className="text-xs text-muted">{o.paymentStatus}</p></td>
                <td><OrderStatusBadge status={o.status} />{o.shipments[0]?.trackingId && <p className="mt-1 text-[11px] text-muted">{o.shipments[0].courier}: {o.shipments[0].trackingId}</p>}</td>
                <td>{o.riskLevel !== "LOW" ? <RiskBadge level={o.riskLevel} /> : <span className="text-xs text-muted">Low</span>}</td>
                <td className="max-w-40 truncate text-xs text-muted">{o.source}</td>
                <td className="whitespace-nowrap text-xs text-muted">{formatDateTime(o.createdAt)}</td>
              </tr>
            ))}
          </Table>
        </ActionForm>
        <Pager page={page} pages={Math.ceil(total / 30)} href={(p) => qs({ page: String(p) })} />
      </Card>
    </>
  );
}

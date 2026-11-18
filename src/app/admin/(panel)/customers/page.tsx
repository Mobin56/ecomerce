import Link from "next/link";
import { requireAdminPage } from "@/server/auth/admin";
import { listCustomers } from "@/server/customers";
import { PageHeader, Card, Table, Pager, inputCls } from "@/components/admin/ui";
import { Badge } from "@/components/ui/misc";
import { formatMoney } from "@/core/money";
import { SEGMENT_LABELS, type Segment } from "@/core/segments";
import { formatDate } from "@/lib/utils";

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; segment?: string; page?: string; sort?: string }> }) {
  await requireAdminPage("customers.view");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const segment = sp.segment && sp.segment in SEGMENT_LABELS ? (sp.segment as Segment) : undefined;
  const { items, total } = await listCustomers({ q: sp.q, segment, page, sort: (sp.sort as "spent" | "recent" | "orders") ?? "spent" });
  const qs = (patch: Record<string, string | undefined>) => `/admin/customers?${new URLSearchParams(Object.entries({ ...sp, ...patch }).filter(([, v]) => v) as [string, string][])}`;
  return (
    <>
      <PageHeader title="Customers" description={`${total} customers`} />
      <nav className="mb-3 flex flex-wrap gap-1">
        <Link href={qs({ segment: undefined, page: undefined })} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${!segment ? "bg-ink text-white" : "bg-card"}`}>All</Link>
        {(Object.keys(SEGMENT_LABELS) as Segment[]).map((s) => <Link key={s} href={qs({ segment: s, page: undefined })} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${segment === s ? "bg-ink text-white" : "bg-card"}`}>{SEGMENT_LABELS[s]}</Link>)}
      </nav>
      <form className="mb-4 flex gap-2">
        {segment && <input type="hidden" name="segment" value={segment} />}
        <input name="q" defaultValue={sp.q} placeholder="Name, phone or email" className={`${inputCls} max-w-sm`} />
        <select name="sort" defaultValue={sp.sort ?? "spent"} className={`${inputCls} max-w-[180px]`}><option value="spent">Top spenders</option><option value="orders">Most orders</option><option value="recent">Recent</option></select>
        <button className="h-10 rounded-lg bg-ink px-4 text-sm font-semibold text-white">Search</button>
      </form>
      <Card padded={false}>
        <Table head={["Customer", "Orders", "Delivered", "Cancel/Return", "Spent", "AOV", "Last order", "Source", "Segments"]} empty={!items.length}>
          {items.map((c) => (
            <tr key={c.id} className="hover:bg-paper">
              <td><Link href={`/admin/customers/${c.id}`} className="font-medium hover:underline">{c.name ?? "—"}</Link><p className="text-xs text-muted">{c.phone}</p></td>
              <td>{c.totalOrders}</td>
              <td>{c.deliveredOrders}</td>
              <td className={c.cancelledOrders + c.returnedOrders > 0 ? "text-danger" : ""}>{c.cancelledOrders}/{c.returnedOrders}</td>
              <td className="tabular-nums">{formatMoney(c.totalSpent)}</td>
              <td className="tabular-nums">{formatMoney(c.aov)}</td>
              <td className="text-xs text-muted">{c.lastOrderAt ? formatDate(c.lastOrderAt) : "—"}</td>
              <td className="text-xs">{c.acquisitionSource ?? "—"}{c.acquisitionCampaign ? ` · ${c.acquisitionCampaign}` : ""}</td>
              <td><div className="flex flex-wrap gap-1">{c.isBlocked && <Badge tone="danger">Blocked</Badge>}{c.segments.map((s) => <Badge key={s} tone={s === "VIP" ? "ink" : s === "HIGH_CANCELLATION_RISK" ? "danger" : "neutral"}>{SEGMENT_LABELS[s]}</Badge>)}</div></td>
            </tr>
          ))}
        </Table>
        <Pager page={page} pages={Math.ceil(total / 25)} href={(p) => qs({ page: String(p) })} />
      </Card>
    </>
  );
}

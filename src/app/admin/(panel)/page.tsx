import Link from "next/link";
import { requireAdminPage } from "@/server/auth/admin";
import { dashboardKpis, dailySeries, rangeFromPreset, topProducts, campaignAnalytics, channelBreakdown } from "@/server/analytics";
import { lowStockReport } from "@/server/inventory";
import { db } from "@/server/db";
import { PageHeader, Card, Stat, RangeTabs, OrderStatusBadge, RiskBadge } from "@/components/admin/ui";
import { TrendChart } from "@/components/admin/charts";
import { formatMoney } from "@/core/money";
import { pct, formatDateTime } from "@/lib/utils";
import { can } from "@/core/rbac";

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const admin = await requireAdminPage("dashboard.view");
  const { range = "today" } = await searchParams;
  const r = rangeFromPreset(range);
  const chartRange = range === "today" || range === "yesterday" ? rangeFromPreset("30d") : r;
  const showFinance = can(admin, "finance.view");
  const [k, series, top, campaigns, channels, lowStock, recent] = await Promise.all([
    dashboardKpis(r),
    dailySeries(chartRange),
    topProducts(r, 5),
    can(admin, "marketing.view") ? campaignAnalytics(r) : Promise.resolve([]),
    channelBreakdown(r),
    lowStockReport(8),
    db.order.findMany({ orderBy: { createdAt: "desc" }, take: 8, select: { id: true, number: true, shipName: true, total: true, status: true, riskLevel: true, createdAt: true, source: true } }),
  ]);

  return (
    <>
      <PageHeader title="Dashboard" description={`Hello ${admin.name}. All numbers come from your own orders and tracking data.`} actions={<RangeTabs current={range} base="/admin" />} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <Stat label="Orders" value={k.orders} sub={`${k.pending} pending`} />
        <Stat label="Revenue" value={formatMoney(k.revenue)} sub={`AOV ${formatMoney(k.aov)}`} />
        {showFinance && <Stat label="Net profit" value={formatMoney(k.profit)} tone={k.profit >= 0 ? "good" : "bad"} sub="Delivered/returned orders" />}
        <Stat label="New customers" value={k.customers} />
        <Stat label="Delivered" value={k.delivered} />
        <Stat label="Cancelled" value={k.cancelled} tone={k.cancelled ? "bad" : undefined} />
        <Stat label="Returned" value={k.returned} tone={k.returned ? "bad" : undefined} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Visitors" value={k.visitors} />
        <Stat label="Conversion rate" value={pct(k.conversionRate, 2)} />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <Card title="Revenue"><TrendChart data={series} dataKey="revenue" /></Card>
        <Card title="Orders"><TrendChart data={series} dataKey="orders" kind="count" type="bar" /></Card>
        {showFinance && <Card title="Net profit (after ads & expenses)"><TrendChart data={series} dataKey="profit" type="line" /></Card>}
        <Card title="Visitors"><TrendChart data={series} dataKey="visitors" kind="count" /></Card>
        <Card title="Conversion rate"><TrendChart data={series} dataKey="conversionRate" kind="percent" type="line" /></Card>
        <Card title="Revenue by channel">
          <ul className="space-y-2 text-sm">
            {channels.length === 0 && <li className="text-muted">No orders in this period.</li>}
            {channels.map((c) => (
              <li key={c.channel} className="flex items-center gap-3">
                <span className="w-32 shrink-0 capitalize">{c.channel.replace(/_/g, " ")}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-line"><span className="block h-full bg-ink" style={{ width: `${(c.revenue / Math.max(...channels.map((x) => x.revenue), 1)) * 100}%` }} /></span>
                <span className="w-28 text-right tabular-nums">{formatMoney(c.revenue)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        <TopList title="Best sellers (units)" rows={top.bestSellers} fmt={(v) => `${v} sold`} />
        <TopList title="Highest revenue" rows={top.highestRevenue} fmt={formatMoney} />
        {showFinance && <TopList title="Highest profit" rows={top.highestProfit} fmt={formatMoney} />}
        <TopList title="Most viewed" rows={top.mostViewed} fmt={(v) => `${v} views`} />
        <TopList title="Most added to cart" rows={top.mostAddedToCart} fmt={(v) => `${v} adds`} />
        <Card title="Needs restocking" actions={<Link href="/admin/inventory?filter=low" className="text-xs font-semibold underline">All</Link>}>
          <ul className="space-y-2 text-sm">
            {lowStock.length === 0 && <li className="text-muted">All good.</li>}
            {lowStock.map((l) => <li key={l.variantId} className="flex justify-between gap-2"><span className="line-clamp-1">{l.name}{l.title !== "Default" ? ` · ${l.title}` : ""}</span><span className={l.available <= 0 ? "font-semibold text-danger" : "text-warn"}>{l.available} left</span></li>)}
          </ul>
        </Card>
      </div>

      {campaigns.length > 0 && (
        <Card title="Campaign performance" className="mt-6" actions={<Link href="/admin/marketing/campaigns" className="text-xs font-semibold underline">Details</Link>}>
          <ul className="space-y-2 text-sm">
            {campaigns.slice(0, 5).map((c) => (
              <li key={c.utmCampaign} className="grid grid-cols-[1fr_auto_auto_auto] gap-4">
                <span className="line-clamp-1 font-medium">{c.name}</span>
                <span className="tabular-nums">{c.orders} orders</span>
                <span className="tabular-nums">{formatMoney(c.revenue)}</span>
                <span className="w-16 text-right tabular-nums">{c.roas ? `${c.roas.toFixed(2)}x` : "—"}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Latest orders" className="mt-6" padded={false} actions={<Link href="/admin/orders" className="text-xs font-semibold underline">All orders</Link>}>
        <ul className="divide-y divide-line text-sm">
          {recent.map((o) => (
            <li key={o.id}>
              <Link href={`/admin/orders/${o.id}`} className="grid grid-cols-[70px_1fr_auto] items-center gap-3 px-5 py-3 hover:bg-paper sm:grid-cols-[80px_1fr_140px_120px_110px_auto]">
                <span className="font-semibold">#{o.number}</span>
                <span className="line-clamp-1">{o.shipName}</span>
                <span className="hidden text-xs text-muted sm:block">{o.source}</span>
                <span className="hidden sm:block"><OrderStatusBadge status={o.status} /></span>
                <span className="hidden text-xs text-muted sm:block">{formatDateTime(o.createdAt)}</span>
                <span className="flex items-center gap-2 tabular-nums">{o.riskLevel !== "LOW" && <RiskBadge level={o.riskLevel} />}{formatMoney(o.total)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}

function TopList({ title, rows, fmt }: { title: string; rows: { id: string; name: string; value: number }[]; fmt: (v: number) => string }) {
  return (
    <Card title={title}>
      <ol className="space-y-2 text-sm">
        {rows.length === 0 && <li className="text-muted">No data for this period.</li>}
        {rows.map((r, i) => (
          <li key={r.id} className="flex justify-between gap-3"><span className="line-clamp-1"><span className="mr-2 text-muted">{i + 1}.</span><Link href={`/admin/products/${r.id}`} className="hover:underline">{r.name}</Link></span><span className="shrink-0 tabular-nums">{fmt(r.value)}</span></li>
        ))}
      </ol>
    </Card>
  );
}

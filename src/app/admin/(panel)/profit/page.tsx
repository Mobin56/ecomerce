import { requireAdminPage } from "@/server/auth/admin";
import { periodPnL, profitByPeriod, productProfit, campaignAnalytics, rangeFromPreset } from "@/server/analytics";
import { db } from "@/server/db";
import { PageHeader, Card, Stat, Table, RangeTabs } from "@/components/admin/ui";
import { formatMoney } from "@/core/money";
import { pct } from "@/lib/utils";

export default async function ProfitPage({ searchParams }: { searchParams: Promise<{ range?: string; unit?: string }> }) {
  await requireAdminPage("finance.view");
  const { range = "30d", unit = "day" } = await searchParams;
  const r = rangeFromPreset(range);
  const u = unit === "week" || unit === "month" ? unit : "day";
  const [pnl, periods, products, campaigns, orders] = await Promise.all([
    periodPnL(r),
    profitByPeriod(r, u),
    productProfit(r, 30),
    campaignAnalytics(r),
    db.profitRecord.findMany({ where: { date: { gte: r.from, lt: r.to } }, orderBy: { netProfit: "asc" }, take: 10, include: { order: { select: { number: true, id: true, status: true } } } }),
  ]);
  return (
    <>
      <PageHeader title="True profit" description="Profit counts final orders (delivered / returned / cancelled) — not just sales minus product cost." actions={<RangeTabs current={range} base="/admin/profit" />} />
      <Card title="Profit & loss">
        <dl className="grid max-w-xl gap-1.5 text-sm">
          {[
            ["Revenue (after discounts)", pnl.revenue, ""],
            ["+ Delivery charges collected", pnl.shippingIncome, ""],
            ["− Product cost", -pnl.productCost, ""],
            ["− Delivery cost", -pnl.deliveryCost, ""],
            ["− Payment / COD fees", -pnl.gatewayFee, ""],
            ["− Return loss", -pnl.returnLoss, ""],
            ["− Ad spend", -pnl.adSpend, ""],
            ["− Other expenses", -pnl.otherExpenses, ""],
          ].map(([k, v]) => <div key={k as string} className="flex justify-between"><dt className="text-muted">{k}</dt><dd className="tabular-nums">{formatMoney(v as number)}</dd></div>)}
          <div className="flex justify-between border-t border-line pt-2 text-base font-bold"><dt>Net profit</dt><dd className={pnl.netProfit < 0 ? "text-danger" : "text-success"}>{formatMoney(pnl.netProfit)}</dd></div>
          <div className="flex justify-between text-xs text-muted"><dt>Net margin</dt><dd>{pct(pnl.margin)}</dd></div>
        </dl>
      </Card>
      <Card title="By period" className="mt-4" padded={false} actions={<div className="flex gap-1 text-xs">{["day", "week", "month"].map((x) => <a key={x} href={`/admin/profit?range=${range}&unit=${x}`} className={`rounded-full px-2.5 py-1 font-semibold ${u === x ? "bg-ink text-white" : "bg-paper"}`}>{x}</a>)}</div>}>
        <Table head={["Period", "Revenue", "Product cost", "Delivery", "Fees", "Returns", "Ad spend", "Expenses", "Net profit"]} empty={!periods.length}>
          {periods.map((p) => (
            <tr key={p.period}><td>{p.period}</td><td>{formatMoney(p.revenue)}</td><td>{formatMoney(p.productCost)}</td><td>{formatMoney(p.deliveryCost)}</td><td>{formatMoney(p.gatewayFee)}</td><td>{formatMoney(p.returnLoss)}</td><td>{formatMoney(p.adSpend)}</td><td>{formatMoney(p.otherExpenses)}</td><td className={`font-semibold ${p.netProfit < 0 ? "text-danger" : ""}`}>{formatMoney(p.netProfit)}</td></tr>
          ))}
        </Table>
      </Card>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card title="Product profit (delivered)" padded={false}>
          <Table head={["Product", "Units", "Revenue", "Cost", "Profit", "Returned"]} empty={!products.length}>
            {products.map((p) => <tr key={p.productId}><td className="max-w-56 truncate">{p.name}</td><td>{p.units}</td><td>{formatMoney(p.revenue)}</td><td>{formatMoney(p.cost)}</td><td className="font-semibold">{formatMoney(p.profit)}</td><td className={p.returned ? "text-danger" : ""}>{p.returned}</td></tr>)}
          </Table>
        </Card>
        <Card title="Campaign profit" padded={false}>
          <Table head={["Campaign", "Revenue", "Ad spend", "ROAS", "Profit"]} empty={!campaigns.length}>
            {campaigns.map((c) => <tr key={c.utmCampaign}><td>{c.name}</td><td>{formatMoney(c.revenue)}</td><td>{formatMoney(c.adSpend)}</td><td>{c.roas ? `${c.roas.toFixed(2)}x` : "—"}</td><td className={`font-semibold ${c.profit < 0 ? "text-danger" : "text-success"}`}>{formatMoney(c.profit)}</td></tr>)}
          </Table>
        </Card>
      </div>
      <Card title="Least profitable orders" className="mt-4" padded={false}>
        <Table head={["Order", "Status", "Revenue", "Net"]} empty={!orders.length}>
          {orders.map((o) => <tr key={o.id}><td><a className="underline" href={`/admin/orders/${o.order.id}`}>#{o.order.number}</a></td><td className="text-xs">{o.order.status}</td><td>{formatMoney(o.revenue)}</td><td className={o.netProfit < 0 ? "font-semibold text-danger" : ""}>{formatMoney(o.netProfit)}</td></tr>)}
        </Table>
      </Card>
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4"><Stat label="Gross profit (revenue − COGS)" value={formatMoney(pnl.grossProfit)} /></div>
    </>
  );
}

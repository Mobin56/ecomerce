import "server-only";
import { db } from "./db";
import { campaignKpis, summarizePeriod } from "@/core/profit";

/**
 * Reporting queries. All numbers come from our own DB (orders, profit
 * snapshots, first-party marketing events, ad spend, expenses) — not from
 * Meta/GA — so they are always explainable.
 */

export type Range = { from: Date; to: Date };

export function rangeFromPreset(preset: string | undefined, now = new Date()): Range {
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const today = start(now);
  const end = new Date(today.getTime() + 86_400_000);
  switch (preset) {
    case "today":
      return { from: today, to: end };
    case "yesterday":
      return { from: new Date(today.getTime() - 86_400_000), to: today };
    case "7d":
      return { from: new Date(today.getTime() - 6 * 86_400_000), to: end };
    case "month":
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: end };
    case "90d":
      return { from: new Date(today.getTime() - 89 * 86_400_000), to: end };
    default:
      return { from: new Date(today.getTime() - 29 * 86_400_000), to: end };
  }
}

const NON_SALE = ["CANCELLED"] as const;

export async function dashboardKpis(r: Range) {
  const where = { createdAt: { gte: r.from, lt: r.to } };
  const [orders, byStatus, newCustomers, visitors, pnl] = await Promise.all([
    db.order.aggregate({ where: { ...where, status: { notIn: [...NON_SALE] } }, _count: true, _sum: { total: true } }),
    db.order.groupBy({ by: ["status"], where, _count: true }),
    db.customer.count({ where }),
    db.marketingEvent.findMany({ where: { name: "page_view", ...where }, distinct: ["visitorId"], select: { visitorId: true } }).then((v) => v.length),
    periodPnL(r),
  ]);
  const count = (s: string) => byStatus.find((b) => b.status === s)?._count ?? 0;
  const orderCount = orders._count;
  return {
    orders: orderCount,
    revenue: orders._sum.total ?? 0,
    profit: pnl.netProfit,
    customers: newCustomers,
    delivered: count("DELIVERED"),
    cancelled: count("CANCELLED"),
    returned: count("RETURNED"),
    pending: count("PENDING"),
    visitors,
    conversionRate: visitors > 0 ? orderCount / visitors : 0,
    aov: orderCount ? Math.round((orders._sum.total ?? 0) / orderCount) : 0,
  };
}

/** Daily series for charts. Profit uses snapshots (final orders) minus ad spend & expenses of that day. */
export async function dailySeries(r: Range) {
  const [orderRows, profitRows, adRows, expRows, visitorRows] = await Promise.all([
    db.$queryRaw<{ day: Date; orders: number; revenue: number }[]>`
      SELECT date_trunc('day', "createdAt") AS day, COUNT(*)::int AS orders, COALESCE(SUM(total),0)::int AS revenue
      FROM orders WHERE "createdAt" >= ${r.from} AND "createdAt" < ${r.to} AND status <> 'CANCELLED' GROUP BY 1`,
    db.$queryRaw<{ day: Date; profit: number }[]>`
      SELECT date AS day, COALESCE(SUM("netProfit"),0)::int AS profit FROM profit_records WHERE date >= ${r.from} AND date < ${r.to} GROUP BY 1`,
    db.$queryRaw<{ day: Date; spend: number }[]>`SELECT date AS day, COALESCE(SUM(amount),0)::int AS spend FROM ad_spend WHERE date >= ${r.from} AND date < ${r.to} GROUP BY 1`,
    db.$queryRaw<{ day: Date; spend: number }[]>`SELECT date AS day, COALESCE(SUM(amount),0)::int AS spend FROM expenses WHERE date >= ${r.from} AND date < ${r.to} GROUP BY 1`,
    db.$queryRaw<{ day: Date; visitors: number }[]>`
      SELECT date_trunc('day', "createdAt") AS day, COUNT(DISTINCT "visitorId")::int AS visitors
      FROM marketing_events WHERE name = 'page_view' AND "createdAt" >= ${r.from} AND "createdAt" < ${r.to} GROUP BY 1`,
  ]);
  const key = (d: Date) => d.toISOString().slice(0, 10);
  const days: string[] = [];
  for (let d = new Date(r.from); d < r.to; d = new Date(d.getTime() + 86_400_000)) days.push(key(d));
  const map = <T extends { day: Date }>(rows: T[]) => new Map(rows.map((x) => [key(new Date(x.day)), x]));
  const o = map(orderRows), p = map(profitRows), a = map(adRows), e = map(expRows), v = map(visitorRows);
  return days.map((day) => {
    const orders = o.get(day)?.orders ?? 0;
    const visitors = v.get(day)?.visitors ?? 0;
    return {
      day,
      orders,
      revenue: o.get(day)?.revenue ?? 0,
      profit: (p.get(day)?.profit ?? 0) - (a.get(day)?.spend ?? 0) - (e.get(day)?.spend ?? 0),
      visitors,
      conversionRate: visitors ? orders / visitors : 0,
    };
  });
}

export async function periodPnL(r: Range) {
  const [records, ad, exp] = await Promise.all([
    db.profitRecord.findMany({ where: { date: { gte: r.from, lt: r.to } } }),
    db.adSpend.aggregate({ where: { date: { gte: r.from, lt: r.to } }, _sum: { amount: true } }),
    db.expense.aggregate({ where: { date: { gte: r.from, lt: r.to } }, _sum: { amount: true } }),
  ]);
  return summarizePeriod(records, ad._sum.amount ?? 0, exp._sum.amount ?? 0);
}

export async function profitByPeriod(r: Range, unit: "day" | "week" | "month") {
  const rows = await db.$queryRaw<{ bucket: Date; revenue: number; cost: number; delivery: number; fees: number; returns: number; net: number }[]>`
    SELECT date_trunc(${unit}, date) AS bucket,
      SUM(revenue)::int AS revenue, SUM("productCost")::int AS cost, SUM("deliveryCost")::int AS delivery,
      SUM("gatewayFee")::int AS fees, SUM("returnLoss")::int AS returns, SUM("netProfit")::int AS net
    FROM profit_records WHERE date >= ${r.from} AND date < ${r.to} GROUP BY 1 ORDER BY 1`;
  const ads = await db.$queryRaw<{ bucket: Date; spend: number }[]>`SELECT date_trunc(${unit}, date) AS bucket, SUM(amount)::int AS spend FROM ad_spend WHERE date >= ${r.from} AND date < ${r.to} GROUP BY 1`;
  const exps = await db.$queryRaw<{ bucket: Date; spend: number }[]>`SELECT date_trunc(${unit}, date) AS bucket, SUM(amount)::int AS spend FROM expenses WHERE date >= ${r.from} AND date < ${r.to} GROUP BY 1`;
  const k = (d: Date) => new Date(d).toISOString().slice(0, 10);
  const adMap = new Map(ads.map((a) => [k(a.bucket), a.spend]));
  const exMap = new Map(exps.map((a) => [k(a.bucket), a.spend]));
  return rows.map((x) => {
    const adSpend = adMap.get(k(x.bucket)) ?? 0;
    const other = exMap.get(k(x.bucket)) ?? 0;
    return { period: k(x.bucket), revenue: x.revenue, productCost: x.cost, deliveryCost: x.delivery, gatewayFee: x.fees, returnLoss: x.returns, adSpend, otherExpenses: other, netProfit: x.net - adSpend - other };
  });
}

export async function productProfit(r: Range, take = 50) {
  return db.$queryRaw<{ productId: string; name: string; units: number; revenue: number; cost: number; profit: number; returned: number }[]>`
    SELECT oi."productId", MAX(oi.name) AS name,
      SUM(CASE WHEN o.status = 'DELIVERED' THEN oi.quantity ELSE 0 END)::int AS units,
      SUM(CASE WHEN o.status = 'DELIVERED' THEN oi."lineTotal" ELSE 0 END)::int AS revenue,
      SUM(CASE WHEN o.status = 'DELIVERED' THEN oi."unitCost" * oi.quantity ELSE 0 END)::int AS cost,
      SUM(CASE WHEN o.status = 'DELIVERED' THEN oi."lineTotal" - oi."unitCost" * oi.quantity ELSE 0 END)::int AS profit,
      SUM(CASE WHEN o.status = 'RETURNED' THEN oi.quantity ELSE 0 END)::int AS returned
    FROM order_items oi JOIN orders o ON o.id = oi."orderId"
    WHERE o."createdAt" >= ${r.from} AND o."createdAt" < ${r.to}
    GROUP BY oi."productId" ORDER BY profit DESC LIMIT ${take}`;
}

export async function topProducts(r: Range, take = 5) {
  const [bySold, byRevenue, byProfit, byViews, byCart] = await Promise.all([
    db.$queryRaw<{ id: string; name: string; value: number }[]>`
      SELECT oi."productId" AS id, MAX(oi.name) AS name, SUM(oi.quantity)::int AS value FROM order_items oi JOIN orders o ON o.id = oi."orderId"
      WHERE o."createdAt" >= ${r.from} AND o."createdAt" < ${r.to} AND o.status <> 'CANCELLED' GROUP BY 1 ORDER BY 3 DESC LIMIT ${take}`,
    db.$queryRaw<{ id: string; name: string; value: number }[]>`
      SELECT oi."productId" AS id, MAX(oi.name) AS name, SUM(oi."lineTotal")::int AS value FROM order_items oi JOIN orders o ON o.id = oi."orderId"
      WHERE o."createdAt" >= ${r.from} AND o."createdAt" < ${r.to} AND o.status <> 'CANCELLED' GROUP BY 1 ORDER BY 3 DESC LIMIT ${take}`,
    productProfit(r, take).then((x) => x.map((p) => ({ id: p.productId, name: p.name, value: p.profit }))),
    db.$queryRaw<{ id: string; name: string; value: number }[]>`
      SELECT e."productId" AS id, MAX(p.name) AS name, COUNT(*)::int AS value FROM marketing_events e JOIN products p ON p.id = e."productId"
      WHERE e.name = 'view_item' AND e."createdAt" >= ${r.from} AND e."createdAt" < ${r.to} GROUP BY 1 ORDER BY 3 DESC LIMIT ${take}`,
    db.$queryRaw<{ id: string; name: string; value: number }[]>`
      SELECT e."productId" AS id, MAX(p.name) AS name, COUNT(*)::int AS value FROM marketing_events e JOIN products p ON p.id = e."productId"
      WHERE e.name = 'add_to_cart' AND e."createdAt" >= ${r.from} AND e."createdAt" < ${r.to} GROUP BY 1 ORDER BY 3 DESC LIMIT ${take}`,
  ]);
  return { bestSellers: bySold, highestRevenue: byRevenue, highestProfit: byProfit, mostViewed: byViews, mostAddedToCart: byCart };
}

/**
 * Campaign analytics: funnel from first-party events (keyed by utm_campaign
 * at event time), orders/revenue from order attribution, profit from
 * snapshots, spend from ad_spend.
 */
export async function campaignAnalytics(r: Range) {
  const [funnel, orders, contributions, campaigns] = await Promise.all([
    db.$queryRaw<{ campaign: string; visitors: number; views: number; atc: number; checkouts: number }[]>`
      SELECT "utmCampaign" AS campaign,
        COUNT(DISTINCT CASE WHEN name = 'page_view' THEN "visitorId" END)::int AS visitors,
        COUNT(*) FILTER (WHERE name = 'view_item')::int AS views,
        COUNT(*) FILTER (WHERE name = 'add_to_cart')::int AS atc,
        COUNT(*) FILTER (WHERE name = 'begin_checkout')::int AS checkouts
      FROM marketing_events WHERE "utmCampaign" IS NOT NULL AND "createdAt" >= ${r.from} AND "createdAt" < ${r.to}
      GROUP BY 1`,
    db.$queryRaw<{ campaign: string; orders: number; revenue: number }[]>`
      SELECT a."utmCampaign" AS campaign, COUNT(*)::int AS orders, COALESCE(SUM(o.total),0)::int AS revenue
      FROM attributions a JOIN orders o ON o.id = a."orderId"
      WHERE a."utmCampaign" IS NOT NULL AND o.status <> 'CANCELLED' AND o."createdAt" >= ${r.from} AND o."createdAt" < ${r.to}
      GROUP BY 1`,
    db.$queryRaw<{ campaign: string; contribution: number }[]>`
      SELECT campaign, COALESCE(SUM("netProfit"),0)::int AS contribution FROM profit_records
      WHERE campaign IS NOT NULL AND date >= ${r.from} AND date < ${r.to} GROUP BY 1`,
    db.campaign.findMany({ include: { adSpend: { where: { date: { gte: r.from, lt: r.to } } } } }),
  ]);
  const names = new Set<string>([...funnel.map((f) => f.campaign), ...orders.map((o) => o.campaign), ...campaigns.map((c) => c.utmCampaign)]);
  return [...names]
    .map((utm) => {
      const f = funnel.find((x) => x.campaign === utm);
      const o = orders.find((x) => x.campaign === utm);
      const c = campaigns.find((x) => x.utmCampaign === utm);
      return {
        utmCampaign: utm,
        name: c?.name ?? utm,
        platform: c?.platform ?? "unknown",
        ...campaignKpis({
          visitors: f?.visitors ?? 0,
          productViews: f?.views ?? 0,
          addToCart: f?.atc ?? 0,
          checkouts: f?.checkouts ?? 0,
          orders: o?.orders ?? 0,
          revenue: o?.revenue ?? 0,
          adSpend: c?.adSpend.reduce((s, a) => s + a.amount, 0) ?? 0,
          contribution: contributions.find((x) => x.campaign === utm)?.contribution ?? 0,
        }),
      };
    })
    .sort((a, b) => b.revenue - a.revenue);
}

export async function channelBreakdown(r: Range) {
  return db.$queryRaw<{ channel: string; orders: number; revenue: number }[]>`
    SELECT a.channel, COUNT(*)::int AS orders, COALESCE(SUM(o.total),0)::int AS revenue
    FROM attributions a JOIN orders o ON o.id = a."orderId"
    WHERE o.status <> 'CANCELLED' AND o."createdAt" >= ${r.from} AND o."createdAt" < ${r.to}
    GROUP BY 1 ORDER BY revenue DESC`;
}

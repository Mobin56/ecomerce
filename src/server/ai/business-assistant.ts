import "server-only";
import { db } from "../db";
import { campaignAnalytics, periodPnL, rangeFromPreset, topProducts, dashboardKpis } from "../analytics";
import { lowStockReport } from "../inventory";
import { aiConfigured, runWithTools, type Tool } from "./provider";
import { formatMoney } from "@/core/money";

/**
 * AI Business Assistant. The model has NO direct knowledge of the store; it
 * must call these tools, which run real DB queries. The system prompt forbids
 * stating any number not returned by a tool. Without an AI key, a keyword
 * router answers the common questions straight from the same tools.
 */

const PERIODS = ["today", "yesterday", "7d", "30d", "month", "90d"] as const;
const periodProp = { type: "string", enum: PERIODS, description: "today, yesterday, 7d (last 7 days, i.e. 'this week'), 30d, month (this calendar month), 90d" };

const TOOLS: Tool[] = [
  { name: "sales_summary", description: "Orders, revenue, AOV, visitors, conversion rate, delivered/cancelled/returned counts for a period.", input_schema: { type: "object", properties: { period: periodProp }, required: ["period"] } },
  { name: "net_profit", description: "True profit for a period: revenue, product cost, delivery, gateway fees, return loss, ad spend, other expenses, net profit.", input_schema: { type: "object", properties: { period: periodProp }, required: ["period"] } },
  { name: "top_products", description: "Best sellers by units, revenue, profit, views and add-to-carts for a period.", input_schema: { type: "object", properties: { period: periodProp }, required: ["period"] } },
  { name: "campaign_performance", description: "Per-campaign visitors, orders, revenue, ad spend, ROAS, cost per order, profit.", input_schema: { type: "object", properties: { period: periodProp }, required: ["period"] } },
  { name: "low_stock", description: "Products/variants at or below their low-stock threshold.", input_schema: { type: "object", properties: {} } },
  { name: "customer_overview", description: "Customer counts: total, new in period, repeat customers.", input_schema: { type: "object", properties: { period: periodProp }, required: ["period"] } },
];

async function runTool(name: string, input: Record<string, unknown>) {
  const period = PERIODS.includes(input.period as (typeof PERIODS)[number]) ? (input.period as string) : "30d";
  const r = rangeFromPreset(period);
  switch (name) {
    case "sales_summary":
      return money(await dashboardKpis(r));
    case "net_profit":
      return money(await periodPnL(r));
    case "top_products":
      return await topProducts(r, 5);
    case "campaign_performance":
      return (await campaignAnalytics(r)).slice(0, 10).map((c) => money({ campaign: c.name, visitors: c.visitors, orders: c.orders, revenue: c.revenue, adSpend: c.adSpend, roas: c.roas, costPerOrder: c.costPerOrder, profit: c.profit, conversionRate: c.conversionRate }));
    case "low_stock":
      return await lowStockReport(25);
    case "customer_overview": {
      const [total, fresh, repeat] = await Promise.all([
        db.customer.count(),
        db.customer.count({ where: { createdAt: { gte: r.from, lt: r.to } } }),
        db.$queryRaw<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM (SELECT "customerId" FROM orders WHERE status = 'DELIVERED' GROUP BY 1 HAVING COUNT(*) >= 2) x`,
      ]);
      return { totalCustomers: total, newCustomersInPeriod: fresh, repeatCustomers: repeat[0]?.n ?? 0 };
    }
    default:
      throw new Error(`Unknown tool ${name}`);
  }
}

/** Convert poisha fields to formatted taka strings so the model never mis-scales money. */
function money<T extends object>(o: T): Record<string, unknown> {
  const MONEY = /revenue|profit|cost|spend|fee|loss|aov|expenses|income|value|total/i;
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === "number" && MONEY.test(k) && !/rate|roas|margin|count/i.test(k) ? formatMoney(v) : v]));
}

const SYSTEM = `You are the business analyst for an online store in Bangladesh (currency ৳ BDT).
Rules:
- ALWAYS call a tool to get data before answering. Never guess, estimate or invent any number, product, campaign or name.
- Only state figures that appear in tool results. If the data is empty, say there is no data for that period.
- Money values from tools are already formatted in ৳. Rates are fractions (0.034 = 3.4%).
- "this week" = 7d, "this month" = month. Mention the period you used.
- Be concise: lead with the answer, then up to 3 supporting bullets.`;

export async function askBusinessAssistant(question: string): Promise<{ answer: string; mode: "ai" | "rules" }> {
  if (aiConfigured()) {
    const answer = await runWithTools({ system: SYSTEM, user: question.slice(0, 1000), tools: TOOLS, runTool });
    return { answer, mode: "ai" };
  }
  return { answer: await ruleBased(question), mode: "rules" };
}

async function ruleBased(q: string): Promise<string> {
  const s = q.toLowerCase();
  const period = /today/.test(s) ? "today" : /yesterday/.test(s) ? "yesterday" : /week|7 ?d/.test(s) ? "7d" : /this month/.test(s) ? "month" : "30d";
  const label = { today: "today", yesterday: "yesterday", "7d": "the last 7 days", month: "this month", "30d": "the last 30 days" }[period];
  if (/low|stock|restock/.test(s)) {
    const rows = await lowStockReport(15);
    if (!rows.length) return "No products are at or below their low-stock threshold.";
    return `Products needing restock:\n${rows.map((r) => `• ${r.name}${r.title !== "Default" ? ` (${r.title})` : ""} — ${r.available} left`).join("\n")}`;
  }
  if (/roas|campaign/.test(s)) {
    const c = (await campaignAnalytics(rangeFromPreset(period))).filter((x) => x.roas !== null).sort((a, b) => (b.roas ?? 0) - (a.roas ?? 0));
    if (!c.length) return `No campaigns with ad spend recorded for ${label}.`;
    return `Best ROAS in ${label}: ${c[0]!.name} at ${c[0]!.roas!.toFixed(2)}x (${formatMoney(c[0]!.revenue)} revenue on ${formatMoney(c[0]!.adSpend)} spend).`;
  }
  if (/profit/.test(s)) {
    const p = await periodPnL(rangeFromPreset(period));
    return `Net profit for ${label}: ${formatMoney(p.netProfit)} (revenue ${formatMoney(p.revenue)}, product cost ${formatMoney(p.productCost)}, delivery ${formatMoney(p.deliveryCost)}, ads ${formatMoney(p.adSpend)}, other expenses ${formatMoney(p.otherExpenses)}). Profit counts delivered/returned orders only.`;
  }
  if (/sold the most|best sell|top product|most sold/.test(s)) {
    const t = await topProducts(rangeFromPreset(period), 3);
    if (!t.bestSellers.length) return `No sales recorded for ${label}.`;
    return `Top sellers for ${label}:\n${t.bestSellers.map((p, i) => `${i + 1}. ${p.name} — ${p.value} units`).join("\n")}`;
  }
  const k = await dashboardKpis(rangeFromPreset(period));
  return `For ${label}: ${k.orders} orders, ${formatMoney(k.revenue)} revenue, ${k.delivered} delivered, ${k.cancelled} cancelled. (Set AI_API_KEY for free-form questions.)`;
}

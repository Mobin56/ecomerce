/**
 * True profit. NOT "sales − product cost".
 *
 *   Revenue (net of discount)
 * − Product cost        (only for goods that were not restocked)
 * − Delivery cost       (what the courier charges us)
 * − Payment gateway fee
 * − Return loss         (return courier charge + damaged goods)
 * − Ad spend            (period level, by campaign)
 * − Other expenses      (period level)
 * = Net profit
 *
 * Shipping fees collected from the customer are income.
 */

export interface OrderForProfit {
  status: string;
  subtotal: number;
  discount: number;
  shippingFee: number;
  deliveryCost: number;
  gatewayFee: number;
  returnCost: number; // courier return charge
  items: { unitCost: number; quantity: number; restocked: boolean }[];
  paymentMethod: string;
}

export interface OrderProfit {
  revenue: number;
  shippingIncome: number;
  productCost: number;
  deliveryCost: number;
  gatewayFee: number;
  returnLoss: number;
  netProfit: number;
}

export function computeOrderProfit(o: OrderForProfit): OrderProfit {
  if (o.status === "CANCELLED") {
    // Cancelled before shipping: no revenue, no cost (gateway fees on refunded prepaid orders still count).
    return { revenue: 0, shippingIncome: 0, productCost: 0, deliveryCost: 0, gatewayFee: o.gatewayFee, returnLoss: 0, netProfit: -o.gatewayFee };
  }

  if (o.status === "RETURNED" || o.status === "FAILED_DELIVERY") {
    // Goods came back. No sales revenue. We paid delivery + return charge; non-restockable goods are lost.
    const damaged = o.items.filter((i) => !i.restocked).reduce((s, i) => s + i.unitCost * i.quantity, 0);
    const returnLoss = o.returnCost + damaged;
    return {
      revenue: 0,
      shippingIncome: 0,
      productCost: 0,
      deliveryCost: o.deliveryCost,
      gatewayFee: o.gatewayFee,
      returnLoss,
      netProfit: -(o.deliveryCost + o.gatewayFee + returnLoss),
    };
  }

  const revenue = o.subtotal - o.discount;
  const productCost = o.items.reduce((s, i) => s + i.unitCost * i.quantity, 0);
  const netProfit = revenue + o.shippingFee - productCost - o.deliveryCost - o.gatewayFee;
  return {
    revenue,
    shippingIncome: o.shippingFee,
    productCost,
    deliveryCost: o.deliveryCost,
    gatewayFee: o.gatewayFee,
    returnLoss: 0,
    netProfit,
  };
}

export interface PeriodPnL {
  revenue: number;
  shippingIncome: number;
  productCost: number;
  deliveryCost: number;
  gatewayFee: number;
  returnLoss: number;
  adSpend: number;
  otherExpenses: number;
  grossProfit: number; // after COGS only
  netProfit: number;
  margin: number; // net / revenue, 0..1
}

export function summarizePeriod(records: OrderProfit[], adSpend: number, otherExpenses: number): PeriodPnL {
  const sum = (k: keyof OrderProfit) => records.reduce((s, r) => s + r[k], 0);
  const revenue = sum("revenue");
  const contribution = sum("netProfit");
  const netProfit = contribution - adSpend - otherExpenses;
  return {
    revenue,
    shippingIncome: sum("shippingIncome"),
    productCost: sum("productCost"),
    deliveryCost: sum("deliveryCost"),
    gatewayFee: sum("gatewayFee"),
    returnLoss: sum("returnLoss"),
    adSpend,
    otherExpenses,
    grossProfit: revenue - sum("productCost"),
    netProfit,
    margin: revenue > 0 ? netProfit / revenue : 0,
  };
}

/** Gateway fee as configured per provider: percent + fixed, poisha. */
export function gatewayFee(amount: number, cfg: { percent: number; fixed: number } | undefined): number {
  if (!cfg) return 0;
  return Math.round((amount * cfg.percent) / 100) + cfg.fixed;
}

export interface CampaignMetrics {
  visitors: number;
  productViews: number;
  addToCart: number;
  checkouts: number;
  orders: number;
  revenue: number;
  adSpend: number;
  contribution: number; // order-level net profit attributed to the campaign
}

export function campaignKpis(m: CampaignMetrics) {
  return {
    ...m,
    costPerOrder: m.orders > 0 ? Math.round(m.adSpend / m.orders) : null,
    conversionRate: m.visitors > 0 ? m.orders / m.visitors : 0,
    roas: m.adSpend > 0 ? m.revenue / m.adSpend : null,
    profit: m.contribution - m.adSpend,
  };
}

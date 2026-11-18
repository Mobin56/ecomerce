import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { getSettings } from "./settings";
import { segmentCustomer, type Segment, type SegmentConfig } from "@/core/segments";

export interface CustomerRow {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  createdAt: Date;
  acquisitionSource: string | null;
  acquisitionCampaign: string | null;
  isBlocked: boolean;
  totalOrders: number;
  deliveredOrders: number;
  cancelledOrders: number;
  returnedOrders: number;
  totalSpent: number;
  firstOrderAt: Date | null;
  lastOrderAt: Date | null;
}

/** One aggregate query for the CRM list (no N+1). */
export async function listCustomers(opts: { q?: string; segment?: Segment; page?: number; perPage?: number; sort?: "spent" | "recent" | "orders" }) {
  const perPage = opts.perPage ?? 25;
  const page = Math.max(opts.page ?? 1, 1);
  const q = opts.q?.trim();
  const search = q ? Prisma.sql`AND (c.name ILIKE ${`%${q}%`} OR c.phone LIKE ${`%${q.replace(/\D/g, "") || q}%`} OR c.email ILIKE ${`%${q}%`})` : Prisma.empty;
  const order =
    opts.sort === "orders" ? Prisma.sql`"totalOrders" DESC` : opts.sort === "recent" ? Prisma.sql`"lastOrderAt" DESC NULLS LAST` : Prisma.sql`"totalSpent" DESC`;
  const rows = await db.$queryRaw<CustomerRow[]>`
    SELECT c.id, c.name, c.phone, c.email, c."createdAt", c."acquisitionSource", c."acquisitionCampaign", c."isBlocked",
      COUNT(o.id)::int AS "totalOrders",
      COUNT(o.id) FILTER (WHERE o.status = 'DELIVERED')::int AS "deliveredOrders",
      COUNT(o.id) FILTER (WHERE o.status = 'CANCELLED')::int AS "cancelledOrders",
      COUNT(o.id) FILTER (WHERE o.status = 'RETURNED')::int AS "returnedOrders",
      COALESCE(SUM(o.total) FILTER (WHERE o.status = 'DELIVERED'), 0)::int AS "totalSpent",
      MIN(o."createdAt") AS "firstOrderAt", MAX(o."createdAt") AS "lastOrderAt"
    FROM customers c LEFT JOIN orders o ON o."customerId" = c.id
    WHERE TRUE ${search}
    GROUP BY c.id ORDER BY ${order}
    LIMIT 2000`;
  const cfg = (await getSettings("segments")) as SegmentConfig;
  const now = new Date();
  let items = rows.map((r) => ({ ...r, segments: segmentCustomer(r, now, cfg), aov: r.deliveredOrders ? Math.round(r.totalSpent / r.deliveredOrders) : 0 }));
  if (opts.segment) items = items.filter((i) => i.segments.includes(opts.segment!));
  return { items: items.slice((page - 1) * perPage, page * perPage), total: items.length, page, perPage };
}

export async function getCustomerProfile(id: string) {
  const customer = await db.customer.findUnique({ where: { id }, include: { addresses: true } });
  if (!customer) return null;
  const [orders, favourites, firstAttribution] = await Promise.all([
    db.order.findMany({ where: { customerId: id }, orderBy: { createdAt: "desc" }, select: { id: true, number: true, total: true, status: true, paymentMethod: true, createdAt: true, source: true, riskLevel: true } }),
    db.$queryRaw<{ productId: string; name: string; qty: number }[]>`
      SELECT oi."productId", MAX(oi.name) AS name, SUM(oi.quantity)::int AS qty FROM order_items oi JOIN orders o ON o.id = oi."orderId"
      WHERE o."customerId" = ${id} AND o.status <> 'CANCELLED' GROUP BY 1 ORDER BY 3 DESC LIMIT 5`,
    db.attribution.findFirst({ where: { order: { customerId: id } }, orderBy: { createdAt: "asc" } }),
  ]);
  const delivered = orders.filter((o) => o.status === "DELIVERED");
  const totalSpent = delivered.reduce((s, o) => s + o.total, 0);
  const stats = {
    totalOrders: orders.length,
    deliveredOrders: delivered.length,
    cancelledOrders: orders.filter((o) => o.status === "CANCELLED").length,
    returnedOrders: orders.filter((o) => o.status === "RETURNED").length,
    totalSpent,
    lastOrderAt: orders[0]?.createdAt ?? null,
  };
  const firstOrderAt = orders.at(-1)?.createdAt ?? null;
  // Simple CLV: average monthly spend since first order × 24-month horizon.
  const months = firstOrderAt ? Math.max(1, (Date.now() - firstOrderAt.getTime()) / (30 * 86_400_000)) : 1;
  const clv = Math.round((totalSpent / months) * 24);
  const cfg = (await getSettings("segments")) as SegmentConfig;
  return {
    customer,
    orders,
    favourites,
    stats: { ...stats, firstOrderAt, aov: delivered.length ? Math.round(totalSpent / delivered.length) : 0, clv },
    segments: segmentCustomer(stats, new Date(), cfg),
    acquisition: {
      source: customer.acquisitionSource ?? firstAttribution?.channel ?? "direct",
      campaign: customer.acquisitionCampaign ?? firstAttribution?.utmCampaign ?? null,
    },
  };
}

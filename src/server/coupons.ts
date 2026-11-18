import "server-only";
import { db, type Tx } from "./db";
import { normalizeCouponCode, type CouponRule } from "@/core/coupons";

export async function loadCouponRule(code: string, tx: Tx | typeof db = db): Promise<CouponRule | null> {
  const c = await tx.coupon.findUnique({ where: { code: normalizeCouponCode(code) }, include: { customers: { select: { id: true } } } });
  if (!c) return null;
  return {
    id: c.id,
    code: c.code,
    type: c.type,
    value: c.value,
    minOrder: c.minOrder,
    maxDiscount: c.maxDiscount,
    productIds: c.productIds,
    categoryIds: c.categoryIds,
    firstOrderOnly: c.firstOrderOnly,
    customerIds: c.customers.map((x) => x.id),
    usageLimit: c.usageLimit,
    perCustomerLimit: c.perCustomerLimit,
    usedCount: c.usedCount,
    startsAt: c.startsAt,
    expiresAt: c.expiresAt,
    isActive: c.isActive,
  };
}

export async function customerCouponContext(customerId: string | null, couponId: string | null, tx: Tx | typeof db = db) {
  if (!customerId) return { orderCount: 0, usage: 0 };
  const [orderCount, usage] = await Promise.all([
    tx.order.count({ where: { customerId, status: { notIn: ["CANCELLED"] } } }),
    couponId ? tx.couponRedemption.count({ where: { customerId, couponId } }) : Promise.resolve(0),
  ]);
  return { orderCount, usage };
}

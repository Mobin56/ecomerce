import "server-only";
import { Prisma, type OrderStatus } from "@prisma/client";
import { cookies } from "next/headers";
import { db, type Tx } from "./db";
import { AppError, notFound } from "./errors";
import { getCartRecord, priceCart } from "./cart";
import { reserveStock, releaseStock, fulfillStock, restockReturn, syncProductStockStatus, checkLowStock } from "./inventory";
import { enabledProviders, getProvider } from "./payments/registry";
import { getSettings, getPublicTrackingConfig } from "./settings";
import { notifyAdmins, notifyCustomer } from "./notifications";
import { sendMetaEvent } from "./tracking/meta";
import { recordFunnelEvent, readTrackingCookies, sendGa4ServerEvent } from "./tracking/events";
import { clientInfo, rateLimit } from "./rate-limit";
import { logger } from "./logger";
import { siteUrl } from "./env";
import { normalizeBDPhone, phoneLooksSuspicious } from "@/core/phone";
import { scoreRisk, type RiskConfig, type RiskSignals } from "@/core/risk";
import { canTransition, inventoryEffect, isFinal } from "@/core/order-status";
import { purchaseEventId } from "@/core/tracking";
import { checkVerifiedPayment } from "@/core/payments/types";
import { computeOrderProfit, gatewayFee } from "@/core/profit";
import { describeSource, buildFbc } from "@/core/attribution";

const log = logger("orders");
export const LAST_ORDER_COOKIE = "last_order";

export interface PlaceOrderInput {
  name: string;
  phone: string;
  email?: string | null;
  district: string;
  area: string;
  address: string;
  paymentMethod: string;
  notes?: string | null;
  idempotencyKey: string;
}

/**
 * Place an order from the current cart.
 * Prices, discounts, shipping and totals are recalculated here from the DB —
 * nothing price-related is accepted from the client.
 */
export async function placeOrder(input: PlaceOrderInput) {
  const phone = normalizeBDPhone(input.phone);
  if (!phone) throw new AppError("INVALID_PHONE", "Please enter a valid Bangladeshi mobile number (01XXXXXXXXX).", 422);

  const info = await clientInfo();
  const [ipLimit, phoneLimit] = await Promise.all([rateLimit(`order:ip:${info.ip}`, 10, 3600), rateLimit(`order:phone:${phone}`, 5, 3600)]);
  if (!ipLimit.ok || !phoneLimit.ok) throw new AppError("RATE_LIMITED", "Too many orders in a short time. Please call us to complete your order.", 429);

  // Idempotency: double-clicks / retries return the same order.
  const existing = await db.order.findUnique({ where: { idempotencyKey: input.idempotencyKey }, select: { id: true, number: true, total: true, paymentMethod: true } });
  if (existing) return { orderId: existing.id, orderNumber: existing.number, total: existing.total, payment: { kind: "none" as const } };

  const providers = await enabledProviders();
  const provider = providers.find((p) => p.key === input.paymentMethod);
  if (!provider) throw new AppError("INVALID_PAYMENT", "Please choose an available payment method.", 422);

  const cart = await getCartRecord();
  if (!cart || cart.items.length === 0) throw new AppError("EMPTY_CART", "Your cart is empty.", 400);

  const tracking = await readTrackingCookies();
  const [riskCfg, payCfg] = await Promise.all([getSettings("risk"), getSettings("payment")]);

  const result = await db.$transaction(
    async (tx) => {
      const customer = await tx.customer.upsert({
        where: { phone },
        create: {
          phone,
          name: input.name,
          email: input.email || null,
          acquisitionSource: tracking.attribution?.first.channel,
          acquisitionCampaign: tracking.attribution?.first.utmCampaign,
        },
        update: { name: input.name, ...(input.email ? { email: input.email } : {}) },
      });
      if (customer.isBlocked && riskCfg.autoRejectHigh) throw new AppError("BLOCKED", "We could not place this order. Please contact support.", 403);

      const { totals, shipping } = await priceCart(cart, { district: input.district, phone, tx });
      if (!shipping) throw new AppError("NO_SHIPPING", "We do not deliver to this district yet.", 422);
      if (totals.stockErrors.length) {
        const s = totals.stockErrors[0]!;
        throw new AppError("INSUFFICIENT_STOCK", s.available > 0 ? `Only ${s.available} of "${s.name}" left. Please update your cart.` : `"${s.name}" is out of stock. Please remove it from your cart.`, 409, totals.stockErrors);
      }
      if (cart.couponCode && totals.couponError) throw new AppError("INVALID_COUPON", totals.couponError.message, 422);
      if (input.paymentMethod === "cod" && payCfg.codMaxAmount !== null && totals.total > payCfg.codMaxAmount) {
        throw new AppError("COD_LIMIT", "Cash on delivery is not available for this order amount. Please pay online.", 422);
      }

      const risk = scoreRisk(await gatherRiskSignals(tx, { phone, customerId: customer.id, isBlocked: customer.isBlocked, address: input.address, ip: info.ip, lines: totals.lines, total: totals.total }), riskCfg as RiskConfig);
      if (risk.level === "HIGH" && riskCfg.autoRejectHigh) {
        throw new AppError("RISK_REJECTED", "We could not place this order automatically. Please call us to complete it.", 403);
      }

      const itemsById = new Map(cart.items.map((i) => [i.variantId, i]));
      const fee = provider.prepaid ? gatewayFee(totals.total, payCfg.fees[provider.key]) : gatewayFee(totals.total, payCfg.fees.cod);
      const attr = tracking.attribution?.last;

      const order = await tx.order.create({
        data: {
          customerId: customer.id,
          shipName: input.name,
          shipPhone: phone,
          shipEmail: input.email || null,
          shipDistrict: input.district,
          shipArea: input.area,
          shipAddress: input.address,
          deliveryMethod: shipping.key,
          notes: input.notes || null,
          subtotal: totals.subtotal,
          discount: totals.discount,
          shippingFee: totals.shippingFee,
          total: totals.total,
          couponId: totals.coupon?.id,
          couponCode: totals.coupon?.code,
          paymentMethod: provider.key,
          paymentStatus: provider.prepaid ? "PENDING" : "UNPAID",
          riskScore: risk.score,
          riskLevel: risk.level,
          riskReasons: risk.reasons as unknown as Prisma.InputJsonValue,
          source: attr ? describeSource(attr) : "Direct",
          ip: info.ip,
          userAgent: info.userAgent,
          deviceType: info.deviceType,
          deliveryCost: shipping.courierCost,
          gatewayFee: fee,
          idempotencyKey: input.idempotencyKey,
          items: {
            create: totals.lines.map((l) => {
              const ci = itemsById.get(l.variantId)!;
              const p = ci.variant.product;
              return {
                productId: p.id,
                variantId: l.variantId,
                name: p.name,
                variantTitle: ci.variant.title,
                sku: ci.variant.sku,
                imageUrl: ci.variant.image?.url ?? p.images[0]?.url ?? null,
                unitPrice: l.unitPrice,
                unitCost: l.unitCost,
                quantity: l.quantity,
                discount: l.discount,
                lineTotal: l.lineTotal - l.discount,
              };
            }),
          },
          history: { create: { to: "PENDING", note: `Order placed (${provider.label})` } },
          attribution: {
            create: {
              visitorId: tracking.visitorId,
              utmSource: attr?.utmSource,
              utmMedium: attr?.utmMedium,
              utmCampaign: attr?.utmCampaign,
              utmContent: attr?.utmContent,
              utmTerm: attr?.utmTerm,
              fbclid: attr?.fbclid,
              gclid: attr?.gclid,
              fbp: tracking.fbp,
              fbc: tracking.fbc ?? (attr?.fbclid ? buildFbc(attr.fbclid, new Date(attr.at)) : null),
              landingPage: attr?.landingPage,
              referrer: attr?.referrer,
              channel: attr?.channel ?? "direct",
              firstTouch: (tracking.attribution?.first ?? undefined) as Prisma.InputJsonValue | undefined,
              touchedAt: attr ? new Date(attr.at) : null,
            },
          },
        },
      });

      await tx.order.update({ where: { id: order.id }, data: { metaEventId: purchaseEventId(order.id) } });

      await reserveStock(
        tx,
        order.id,
        totals.lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity, name: itemsById.get(l.variantId)!.variant.product.name })),
      );

      if (totals.coupon) {
        // Atomic usage-limit check (prevents over-redemption under concurrency).
        const ok = await tx.$executeRaw`UPDATE coupons SET "usedCount" = "usedCount" + 1 WHERE id = ${totals.coupon.id} AND ("usageLimit" IS NULL OR "usedCount" < "usageLimit")`;
        if (ok !== 1) throw new AppError("INVALID_COUPON", "This coupon has reached its usage limit.", 422);
        await tx.couponRedemption.create({ data: { couponId: totals.coupon.id, customerId: customer.id, orderId: order.id, amount: totals.discount } });
      }

      await tx.cart.update({ where: { id: cart.id }, data: { status: "CONVERTED", customerId: customer.id } });
      return { order, risk, customer };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 20_000 },
  );

  const { order, risk } = result;
  log.info("order placed", { orderId: order.id, number: order.number, total: order.total, payment: provider.key, risk: risk.level });

  // Side effects outside the transaction; failures here never lose the order.
  void (async () => {
    await notifyAdmins({
      type: "new_order",
      title: `New order #${order.number}`,
      body: `${input.name} · ৳${(order.total / 100).toLocaleString("en-BD")} · ${provider.label}${risk.level !== "LOW" ? ` · ${risk.level} RISK` : ""}`,
      data: { orderId: order.id },
      urgent: risk.level === "HIGH",
    });
    if (result.customer.createdAt.getTime() > Date.now() - 60_000) {
      await notifyAdmins({ type: "new_customer", title: "New customer", body: `${input.name} placed their first order.`, data: { customerId: result.customer.id } });
    }
    await notifyCustomer("order_confirmation", order.id);
    await syncProductStockStatus(cart.items.map((i) => i.variantId));
    await checkLowStock(cart.items.map((i) => i.variantId));
  })().catch((e) => log.error("post-order side effects failed", { error: e, orderId: order.id }));

  // COD is a purchase now; prepaid only after the gateway is verified.
  if (!provider.prepaid) await trackPurchase(order.id);

  const payment = await provider.initiate({
    orderId: order.id,
    orderNumber: order.number,
    amount: order.total,
    currency: "BDT",
    customer: { name: input.name, phone, email: input.email, address: input.address, district: input.district },
    itemSummary: cart.items.map((i) => `${i.variant.product.name} ×${i.quantity}`).join(", "),
    urls: {
      success: `${siteUrl()}/api/payments/${provider.key}/callback?result=success&orderId=${order.id}`,
      fail: `${siteUrl()}/api/payments/${provider.key}/callback?result=fail&orderId=${order.id}`,
      cancel: `${siteUrl()}/api/payments/${provider.key}/callback?result=cancel&orderId=${order.id}`,
      ipn: `${siteUrl()}/api/payments/${provider.key}/ipn`,
    },
  }).catch(async (e) => {
    log.error("payment initiate failed", { error: e, orderId: order.id, provider: provider.key });
    return { kind: "error" as const, message: "We could not start the payment. Your order is saved — you can retry payment or choose Cash on Delivery." };
  });

  // Lets the browser that placed the order view its confirmation page (order ids alone don't grant access).
  (await cookies()).set(LAST_ORDER_COOKIE, order.id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 7 });

  if (payment.kind === "redirect" || payment.kind === "manual") {
    await db.payment.create({ data: { orderId: order.id, provider: provider.key, amount: order.total, status: "INITIATED", providerRef: payment.providerRef } });
  }
  return { orderId: order.id, orderNumber: order.number, total: order.total, payment };
}

async function gatherRiskSignals(
  tx: Tx,
  o: { phone: string; customerId: string; isBlocked: boolean; address: string; ip: string; lines: { quantity: number }[]; total: number },
): Promise<RiskSignals> {
  const since30 = new Date(Date.now() - 30 * 86_400_000);
  const [byStatus, last24h, sameAddress, phoneAddresses, ipOrders, delivered] = await Promise.all([
    tx.order.groupBy({ by: ["status"], where: { shipPhone: o.phone }, _count: true }),
    tx.order.count({ where: { shipPhone: o.phone, createdAt: { gt: new Date(Date.now() - 86_400_000) } } }),
    tx.order.findMany({ where: { shipAddress: { equals: o.address, mode: "insensitive" }, createdAt: { gt: since30 } }, distinct: ["shipPhone"], select: { shipPhone: true } }),
    tx.order.findMany({ where: { shipPhone: o.phone, createdAt: { gt: since30 } }, distinct: ["shipAddress"], select: { shipAddress: true } }),
    tx.order.count({ where: { ip: o.ip, createdAt: { gt: new Date(Date.now() - 3600_000) } } }),
    tx.order.aggregate({ where: { shipPhone: o.phone, status: "DELIVERED" }, _avg: { total: true } }),
  ]);
  const count = (s: OrderStatus) => byStatus.find((b) => b.status === s)?._count ?? 0;
  const previousOrders = byStatus.reduce((a, b) => a + b._count, 0);
  const addresses = new Set(phoneAddresses.map((a) => a.shipAddress.toLowerCase().trim()));
  addresses.add(o.address.toLowerCase().trim());
  const phones = new Set(sameAddress.map((a) => a.shipPhone));
  phones.add(o.phone);
  return {
    previousOrders,
    previousCancelled: count("CANCELLED"),
    previousReturned: count("RETURNED"),
    previousFailedDelivery: count("FAILED_DELIVERY"),
    ordersLast24h: last24h,
    phonesAtSameAddress: phones.size,
    addressesForPhone: addresses.size,
    totalQuantity: o.lines.reduce((s, l) => s + l.quantity, 0),
    maxLineQuantity: Math.max(...o.lines.map((l) => l.quantity)),
    orderTotal: o.total,
    averageOrderValue: delivered._avg.total ? Math.round(delivered._avg.total) : null,
    isBlockedCustomer: o.isBlocked,
    phoneLooksInvalid: phoneLooksSuspicious(o.phone),
    ordersFromIpLastHour: ipOrders,
  };
}

/**
 * Fire Purchase exactly once per order (CAPI + first-party funnel).
 * The atomic `purchaseTrackedAt IS NULL` update is the lock.
 */
export async function trackPurchase(orderId: string) {
  const claimed = await db.order.updateMany({ where: { id: orderId, purchaseTrackedAt: null }, data: { purchaseTrackedAt: new Date() } });
  if (claimed.count !== 1) return;
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true, attribution: true } });
  const eventId = order.metaEventId ?? purchaseEventId(order.id);
  await recordFunnelEvent({ name: "purchase", eventId, orderId: order.id, value: order.total, visitorId: order.attribution?.visitorId ?? undefined });
  await sendMetaEvent({
    eventName: "Purchase",
    eventId,
    orderId: order.id,
    value: order.total,
    currency: order.currency,
    sourceUrl: `${siteUrl()}/checkout/success`,
    items: order.items.map((i) => ({ id: i.productId, name: i.name, price: i.unitPrice, quantity: i.quantity })),
    user: {
      phone: order.shipPhone,
      email: order.shipEmail,
      name: order.shipName,
      city: order.shipDistrict,
      externalId: order.customerId,
      ip: order.ip,
      userAgent: order.userAgent,
      fbp: order.attribution?.fbp,
      fbc: order.attribution?.fbc,
    },
  }).catch((e) => log.error("CAPI purchase failed", { error: e, orderId }));
}

/**
 * Handle a gateway callback / IPN. The callback params only identify the
 * transaction; payment is confirmed exclusively from the provider's
 * server-side verification, then checked against our DB order.
 */
export async function confirmPayment(providerKey: string, params: Record<string, string>, source: "callback" | "ipn") {
  const provider = await getProvider(providerKey);
  if (!provider || !provider.prepaid) throw new AppError("UNKNOWN_PROVIDER", "Unknown payment provider", 400);

  const verified = await provider.verify(params);
  const orderId = verified.orderId || params.orderId || "";
  const order = await db.order.findUnique({ where: { id: orderId }, include: { payments: true } });
  if (!order) throw notFound("Order");

  const externalId = verified.transactionId ?? verified.providerRef ?? `${orderId}:${source}:${verified.status}`;
  try {
    await db.webhookEvent.create({ data: { provider: providerKey, externalId: `${externalId}:${verified.status}`, payload: { source, params, verified: verified.raw } as Prisma.InputJsonValue } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { orderId: order.id, status: order.paymentStatus === "PAID" ? "PAID" : verified.status, duplicate: true };
    }
    throw e;
  }

  if (verified.status !== "SUCCEEDED") {
    await db.payment.updateMany({
      where: { orderId: order.id, provider: providerKey, status: { in: ["INITIATED", "PENDING"] } },
      data: { status: verified.status === "CANCELLED" ? "CANCELLED" : verified.status === "PENDING" ? "PENDING" : "FAILED", rawResponse: verified.raw as Prisma.InputJsonValue },
    });
    if (verified.status === "FAILED") {
      await db.order.update({ where: { id: order.id }, data: { paymentStatus: "FAILED" } });
      await notifyAdmins({ type: "payment_failed", title: `Payment failed #${order.number}`, body: `${provider.label} payment failed for order #${order.number}.`, data: { orderId: order.id } });
    }
    return { orderId: order.id, status: verified.status, duplicate: false };
  }

  const check = checkVerifiedPayment(
    { orderId: order.id, amount: order.total, currency: order.currency, alreadyPaidTxnIds: order.payments.filter((p) => p.status === "SUCCEEDED" && p.transactionId).map((p) => p.transactionId!) },
    verified,
  );
  if (!check.ok) {
    if (check.reason === "ALREADY_PROCESSED") return { orderId: order.id, status: "PAID", duplicate: true };
    log.error("payment verification mismatch", { orderId: order.id, reason: check.reason, provider: providerKey, reported: verified.amount, expected: order.total });
    await notifyAdmins({ type: "payment_failed", title: `Payment check failed #${order.number}`, body: `Verification failed (${check.reason}). Review before shipping.`, data: { orderId: order.id }, urgent: true });
    return { orderId: order.id, status: "FAILED", duplicate: false };
  }

  const payCfg = await getSettings("payment");
  await db.$transaction(async (tx) => {
    const pending = await tx.payment.findFirst({ where: { orderId: order.id, provider: providerKey, status: { in: ["INITIATED", "PENDING", "FAILED"] } }, orderBy: { createdAt: "desc" } });
    const data = {
      status: "SUCCEEDED" as const,
      transactionId: verified.transactionId,
      providerRef: verified.providerRef,
      amount: verified.amount,
      fee: verified.fee ?? gatewayFee(verified.amount, payCfg.fees[providerKey]),
      verifiedAt: new Date(),
      rawResponse: verified.raw as Prisma.InputJsonValue,
    };
    if (pending) await tx.payment.update({ where: { id: pending.id }, data });
    else await tx.payment.create({ data: { orderId: order.id, provider: providerKey, currency: order.currency, ...data } });
    await tx.order.update({ where: { id: order.id }, data: { paymentStatus: "PAID", gatewayFee: data.fee } });
    await tx.orderStatusHistory.create({ data: { orderId: order.id, from: order.status, to: order.status, note: `Payment verified via ${provider.label} (${verified.transactionId})` } });
  });

  await trackPurchase(order.id);
  void notifyCustomer("payment_confirmation", order.id);
  void notifyAdmins({ type: "payment_success", title: `Payment received #${order.number}`, body: `${provider.label}: ৳${(order.total / 100).toLocaleString("en-BD")}`, data: { orderId: order.id } });
  return { orderId: order.id, status: "PAID", duplicate: false };
}

/** Admin: verify a manual wallet TrxID after checking the statement. */
export async function markManualPaymentVerified(orderId: string, transactionId: string, userId: string) {
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
  await db.$transaction([
    db.payment.create({ data: { orderId, provider: order.paymentMethod, amount: order.total, status: "SUCCEEDED", transactionId, verifiedAt: new Date(), rawResponse: { verifiedBy: userId } } }),
    db.order.update({ where: { id: orderId }, data: { paymentStatus: "PAID" } }),
    db.orderStatusHistory.create({ data: { orderId, from: order.status, to: order.status, userId, note: `Manual payment verified (TrxID ${transactionId})` } }),
  ]);
  await trackPurchase(orderId);
  void notifyCustomer("payment_confirmation", orderId);
}

/** Customer submits TrxID for a manual wallet payment. */
export async function submitManualTrxId(orderId: string, phone: string, trxId: string) {
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order || order.shipPhone !== normalizeBDPhone(phone)) throw notFound("Order");
  await db.payment.updateMany({ where: { orderId, status: { in: ["INITIATED", "PENDING"] } }, data: { status: "PENDING", transactionId: trxId.trim().toUpperCase().slice(0, 40) } });
  await notifyAdmins({ type: "manual_payment", title: `Verify payment #${order.number}`, body: `Customer submitted TrxID ${trxId} — verify against the wallet statement.`, data: { orderId }, urgent: true });
}

/**
 * Admin status change with inventory effects, coupon release, notifications,
 * profit snapshot and tracking.
 */
export async function transitionOrder(orderId: string, to: OrderStatus, opts: { userId?: string; note?: string; returnRestock?: boolean } = {}) {
  const order = await db.order.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!order) throw notFound("Order");
  if (order.status === to) return order;
  if (!canTransition(order.status, to)) throw new AppError("INVALID_TRANSITION", `Cannot change status from ${order.status} to ${to}.`, 409);
  const effect = inventoryEffect(order.status, to);
  const lines = order.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity }));

  const updated = await db.$transaction(async (tx) => {
    // Optimistic lock on current status: two admins clicking at once can't double-apply stock effects.
    const res = await tx.order.updateMany({
      where: { id: orderId, status: order.status },
      data: {
        status: to,
        ...(to === "CANCELLED" ? { cancelledAt: new Date() } : {}),
        ...(to === "DELIVERED" ? { deliveredAt: new Date(), ...(order.paymentMethod === "cod" ? { paymentStatus: "PAID" as const } : {}) } : {}),
      },
    });
    if (res.count !== 1) throw new AppError("CONFLICT", "This order was just updated by someone else. Refresh and try again.", 409);
    await tx.orderStatusHistory.create({ data: { orderId, from: order.status, to, note: opts.note, userId: opts.userId } });
    if (effect === "RELEASE") await releaseStock(tx, orderId, lines, opts.userId);
    if (effect === "FULFILL") await fulfillStock(tx, orderId, lines, opts.userId);
    if (effect === "RESTOCK" && opts.returnRestock !== false) await restockReturn(tx, orderId, lines, opts.userId);
    if (to === "DELIVERED") {
      for (const i of order.items) await tx.product.update({ where: { id: i.productId }, data: { soldCount: { increment: i.quantity } } });
      if (order.paymentMethod === "cod") {
        await tx.payment.create({ data: { orderId, provider: "cod", amount: order.total, status: "SUCCEEDED", fee: order.gatewayFee, verifiedAt: new Date(), transactionId: `COD-${order.number}` } });
      }
    }
    if (to === "CANCELLED" && order.couponId) {
      await tx.couponRedemption.deleteMany({ where: { orderId } });
      await tx.$executeRaw`UPDATE coupons SET "usedCount" = GREATEST("usedCount" - 1, 0) WHERE id = ${order.couponId}`;
    }
    return tx.order.findUniqueOrThrow({ where: { id: orderId } });
  });

  await syncProductStockStatus(lines.map((l) => l.variantId));
  if (effect === "FULFILL") await checkLowStock(lines.map((l) => l.variantId));
  if (isFinal(to) || to === "FAILED_DELIVERY") await snapshotOrderProfit(orderId, { restocked: opts.returnRestock !== false });

  if (to === "SHIPPED") void notifyCustomer("order_shipped", orderId);
  if (to === "DELIVERED") void notifyCustomer("order_delivered", orderId);
  if (to === "CANCELLED") void notifyCustomer("order_cancelled", orderId);
  if (to === "RETURNED") void notifyAdmins({ type: "return", title: `Order #${order.number} returned`, body: `Order #${order.number} was returned.`, data: { orderId } });
  if (to === "RETURNED" || (to === "CANCELLED" && order.paymentStatus === "PAID")) {
    const { gaClientId } = await readTrackingCookies().catch(() => ({ gaClientId: null }));
    const ga = await getPublicTrackingConfig();
    if (ga.ga4Id) void sendGa4ServerEvent(gaClientId, [{ name: "refund", params: { transaction_id: order.id, currency: "BDT", value: order.total / 100 } }]);
  }
  return updated;
}

/** Recompute the per-order profit snapshot (used by the profit dashboard). */
export async function snapshotOrderProfit(orderId: string, opts: { restocked?: boolean } = {}) {
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true, shipments: true, attribution: true } });
  const zone = await db.shippingZone.findUnique({ where: { key: order.deliveryMethod } });
  const returnCost = order.status === "RETURNED" || order.status === "FAILED_DELIVERY" ? order.shipments.reduce((s, x) => s + x.returnCharge, 0) || zone?.returnCost || 0 : 0;
  const shipCharge = order.shipments.reduce((s, x) => s + x.deliveryCharge, 0);
  const p = computeOrderProfit({
    status: order.status,
    subtotal: order.subtotal,
    discount: order.discount,
    shippingFee: order.shippingFee,
    deliveryCost: shipCharge || order.deliveryCost,
    gatewayFee: order.gatewayFee,
    returnCost,
    items: order.items.map((i) => ({ unitCost: i.unitCost, quantity: i.quantity, restocked: opts.restocked ?? true })),
    paymentMethod: order.paymentMethod,
  });
  const date = new Date(Date.UTC(order.createdAt.getUTCFullYear(), order.createdAt.getUTCMonth(), order.createdAt.getUTCDate()));
  const data = { date, ...p, campaign: order.attribution?.utmCampaign ?? null };
  await db.profitRecord.upsert({ where: { orderId }, create: { orderId, ...data }, update: data });
}

/** Admin edit of shipping details / notes before shipment. Items & totals are not editable after placement (cancel + re-order instead) to keep payments consistent. */
export async function editOrderDetails(orderId: string, data: { shipName?: string; shipPhone?: string; shipAddress?: string; shipArea?: string; shipDistrict?: string; notes?: string | null }) {
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
  if (["SHIPPED", "DELIVERED", "RETURNED", "CANCELLED"].includes(order.status)) throw new AppError("LOCKED", "Shipped or closed orders cannot be edited.", 409);
  const phone = data.shipPhone ? normalizeBDPhone(data.shipPhone) : undefined;
  if (data.shipPhone && !phone) throw new AppError("INVALID_PHONE", "Invalid phone number", 422);
  return db.order.update({ where: { id: orderId }, data: { ...data, ...(phone ? { shipPhone: phone } : {}) } });
}

export async function refundOrder(orderId: string, amount: number, reason: string, userId: string) {
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { payments: { where: { status: "SUCCEEDED" } } } });
  const paid = order.payments.reduce((s, p) => s + p.amount - p.refundedAmount, 0);
  if (amount <= 0 || amount > paid) throw new AppError("INVALID_AMOUNT", `Refund must be between ৳0.01 and ${(paid / 100).toFixed(2)}.`, 422);
  const payment = order.payments.find((p) => p.amount - p.refundedAmount >= amount);
  if (!payment) throw new AppError("NO_PAYMENT", "No single payment covers this refund amount.", 422);
  const provider = await getProvider(payment.provider);
  let refundRef: string | undefined;
  if (provider?.refund && payment.transactionId && provider.key !== "cod") {
    const r = await provider.refund({ transactionId: payment.transactionId, providerRef: payment.providerRef, amount, reason });
    if (!r.ok) throw new AppError("REFUND_FAILED", "The gateway rejected the refund. Check the gateway dashboard.", 502);
    refundRef = r.refundRef;
  }
  const paidTotal = order.payments.reduce((s, p) => s + p.amount, 0);
  const refundedAfter = order.payments.reduce((s, p) => s + p.refundedAmount, 0) + amount;
  await db.$transaction([
    db.payment.update({ where: { id: payment.id }, data: { refundedAmount: { increment: amount } } }),
    db.order.update({ where: { id: orderId }, data: { paymentStatus: refundedAfter >= paidTotal ? "REFUNDED" : "PARTIALLY_REFUNDED" } }),
    db.orderStatusHistory.create({ data: { orderId, from: order.status, to: order.status, userId, note: `Refunded ৳${(amount / 100).toFixed(2)}${refundRef ? ` (ref ${refundRef})` : " (manual)"}: ${reason}` } }),
  ]);
}

export async function listEnabledPaymentMethods() {
  const providers = await enabledProviders();
  return providers.map((p) => ({ key: p.key, label: p.label, prepaid: p.prepaid }));
}

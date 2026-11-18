import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { AppError, notFound } from "./errors";
import { getCourier } from "./courier/providers";
import { transitionOrder } from "./orders";
import { notifyAdmins } from "./notifications";
import { getSettings } from "./settings";
import { logger } from "./logger";
import { orderStatusForShipment } from "@/core/courier/types";
import { canTransition } from "@/core/order-status";

const log = logger("courier");

export async function createShipment(orderId: string, courierKey: string, userId?: string) {
  const order = await db.order.findUnique({ where: { id: orderId }, include: { items: { include: { variant: { select: { weightGrams: true, product: { select: { weightGrams: true } } } } } } } });
  if (!order) throw notFound("Order");
  if (!["CONFIRMED", "PROCESSING", "PACKED"].includes(order.status)) throw new AppError("INVALID_STATE", "Confirm the order before creating a shipment.", 409);
  const courier = getCourier(courierKey);
  if (!courier) throw new AppError("UNKNOWN_COURIER", "Unknown courier", 400);
  if (!courier.isConfigured) throw new AppError("NOT_CONFIGURED", `${courier.label} is not configured. Add API credentials in .env.`, 400);
  const active = await db.shipment.findFirst({ where: { orderId, status: { notIn: ["FAILED", "CANCELLED"] } } });
  if (active) throw new AppError("EXISTS", "This order already has an active shipment.", 409);

  const shippingCfg = await getSettings("shipping");
  const weight = order.items.reduce((s, i) => s + (i.variant.weightGrams ?? i.variant.product.weightGrams ?? shippingCfg.defaultWeightGrams) * i.quantity, 0);
  const codAmount = order.paymentStatus === "PAID" ? 0 : order.total;

  const res = await courier
    .createShipment({
      orderId,
      orderNumber: order.number,
      recipient: { name: order.shipName, phone: order.shipPhone, address: order.shipAddress, district: order.shipDistrict, area: order.shipArea },
      codAmount,
      weightGrams: weight,
      itemCount: order.items.reduce((s, i) => s + i.quantity, 0),
      itemDescription: order.items.map((i) => `${i.name} x${i.quantity}`).join(", "),
      note: order.notes,
    })
    .catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e), raw: null }));

  const previousFailed = await db.shipment.count({ where: { orderId, courier: courierKey, status: "FAILED" } });
  const shipment = await db.shipment.create({
    data: {
      orderId,
      courier: courierKey,
      trackingId: res.ok ? res.trackingId : null,
      consignmentId: res.ok ? res.consignmentId : null,
      status: res.ok ? (res.status ?? "CREATED") : "FAILED",
      codAmount,
      deliveryCharge: (res.ok && res.deliveryCharge) || order.deliveryCost,
      lastResponse: (res.raw ?? undefined) as Prisma.InputJsonValue | undefined,
      error: res.ok ? null : res.error,
      attempts: previousFailed + 1,
      events: { create: { status: res.ok ? "CREATED" : "FAILED", message: res.ok ? `Created with ${courier.label}` : res.error } },
    },
  });

  if (!res.ok) {
    log.warn("shipment create failed", { orderId, courier: courierKey, error: res.error });
    await notifyAdmins({ type: "courier_failure", title: `Courier error #${order.number}`, body: `${courier.label}: ${res.error}`, data: { orderId }, urgent: false });
    return shipment;
  }
  await db.orderStatusHistory.create({ data: { orderId, from: order.status, to: order.status, userId, note: `Shipment created: ${courier.label} ${res.trackingId}` } });
  if (order.status !== "PACKED" && canTransition(order.status, "PACKED")) await transitionOrder(orderId, "PACKED", { userId, note: "Packed for courier" });
  return shipment;
}

/** Poll courier and move order status (cron + admin "Track" button). */
export async function syncShipment(shipmentId: string, userId?: string) {
  const s = await db.shipment.findUnique({ where: { id: shipmentId }, include: { order: true } });
  if (!s || !s.trackingId) throw notFound("Shipment");
  const courier = getCourier(s.courier);
  if (!courier) throw new AppError("UNKNOWN_COURIER", "Unknown courier", 400);
  const t = await courier.track({ trackingId: s.trackingId, consignmentId: s.consignmentId });
  if (!t.ok || !t.status) {
    await db.shipment.update({ where: { id: s.id }, data: { error: t.error ?? "Tracking failed", lastResponse: (t.raw ?? undefined) as Prisma.InputJsonValue | undefined } });
    return s;
  }
  if (t.status !== s.status) {
    await db.shipment.update({ where: { id: s.id }, data: { status: t.status, error: null, lastResponse: (t.raw ?? undefined) as Prisma.InputJsonValue | undefined, events: { create: { status: t.status, message: t.rawStatus ?? t.message, raw: (t.raw ?? undefined) as Prisma.InputJsonValue | undefined } } } });
    const orderTo = orderStatusForShipment(t.status);
    if (orderTo && orderTo !== s.order.status && canTransition(s.order.status, orderTo)) {
      await transitionOrder(s.orderId, orderTo, { userId, note: `Courier update: ${t.rawStatus ?? t.status}` });
      if (orderTo === "DELIVERED") await notifyAdmins({ type: "courier_delivery", title: `Delivered #${s.order.number}`, body: `${courier.label} delivered order #${s.order.number}.`, data: { orderId: s.orderId } });
      if (orderTo === "FAILED_DELIVERY") await notifyAdmins({ type: "courier_failure", title: `Delivery failed #${s.order.number}`, body: `${courier.label}: ${t.rawStatus}`, data: { orderId: s.orderId }, urgent: true });
    }
  }
  return db.shipment.findUniqueOrThrow({ where: { id: s.id } });
}

export async function syncOpenShipments(limit = 100) {
  const open = await db.shipment.findMany({ where: { status: { in: ["CREATED", "PICKED_UP", "IN_TRANSIT"] }, trackingId: { not: null } }, take: limit, orderBy: { updatedAt: "asc" }, select: { id: true } });
  let synced = 0;
  for (const s of open) {
    try {
      await syncShipment(s.id);
      synced++;
    } catch (e) {
      log.warn("sync failed", { shipmentId: s.id, error: e });
    }
  }
  return { synced, total: open.length };
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { action, AppError, type ActionResult } from "@/server/errors";
import { requireAdmin } from "@/server/auth/admin";
import { transitionOrder, editOrderDetails, refundOrder, markManualPaymentVerified } from "@/server/orders";
import { createShipment, syncShipment } from "@/server/shipments";
import { logActivity } from "@/server/activity";
import { db } from "@/server/db";

type R = Promise<ActionResult<unknown>>;
const STATUSES = ["PENDING", "CONFIRMED", "PROCESSING", "PACKED", "SHIPPED", "DELIVERED", "CANCELLED", "RETURNED", "FAILED_DELIVERY"] as const;

export async function changeStatusAction(_: unknown, fd: FormData): R {
  return action(async () => {
    const admin = await requireAdmin("orders.update");
    const { orderId, status, note, restock } = z.object({ orderId: z.string(), status: z.enum(STATUSES), note: z.string().max(300).optional(), restock: z.string().optional() }).parse(Object.fromEntries(fd));
    const before = await db.order.findUniqueOrThrow({ where: { id: orderId }, select: { status: true } });
    await transitionOrder(orderId, status, { userId: admin.id, note: note || undefined, returnRestock: restock !== "no" });
    await logActivity({ userId: admin.id, action: "order.status_changed", entityType: "order", entityId: orderId, before: { status: before.status }, after: { status } });
    revalidatePath(`/admin/orders/${orderId}`);
  }, "Status updated");
}

export async function bulkStatusAction(_: unknown, fd: FormData): R {
  return action(async () => {
    const admin = await requireAdmin("orders.update");
    const status = z.enum(STATUSES).parse(fd.get("status"));
    const ids = z.array(z.string()).min(1, "Select orders first").max(200).parse(fd.getAll("ids"));
    const errors: string[] = [];
    for (const id of ids) {
      try {
        await transitionOrder(id, status, { userId: admin.id, note: "Bulk update" });
      } catch (e) {
        errors.push(e instanceof Error ? e.message : id);
      }
    }
    await logActivity({ userId: admin.id, action: "order.bulk_status", entityType: "order", after: { ids, status, failed: errors.length } });
    revalidatePath("/admin/orders");
    if (errors.length) throw new AppError("PARTIAL", `${ids.length - errors.length} updated, ${errors.length} skipped (invalid transition)`);
  }, "Orders updated");
}

export async function editOrderAction(_: unknown, fd: FormData): R {
  return action(async () => {
    const admin = await requireAdmin("orders.update");
    const d = z.object({ orderId: z.string(), shipName: z.string().min(2).max(80), shipPhone: z.string().max(20), shipDistrict: z.string().max(40), shipArea: z.string().max(80), shipAddress: z.string().min(5).max(300), notes: z.string().max(500).optional() }).parse(Object.fromEntries(fd));
    const { orderId, ...data } = d;
    await editOrderDetails(orderId, data);
    await logActivity({ userId: admin.id, action: "order.edited", entityType: "order", entityId: orderId, after: data });
    revalidatePath(`/admin/orders/${orderId}`);
  }, "Order updated");
}

export async function createShipmentAction(_: unknown, fd: FormData): R {
  return action(async () => {
    const admin = await requireAdmin("shipping.manage");
    const { orderId, courier } = z.object({ orderId: z.string(), courier: z.string() }).parse(Object.fromEntries(fd));
    const s = await createShipment(orderId, courier, admin.id);
    await logActivity({ userId: admin.id, action: "shipment.created", entityType: "order", entityId: orderId, after: { courier, trackingId: s.trackingId, status: s.status } });
    revalidatePath(`/admin/orders/${orderId}`);
    if (s.status === "FAILED") throw new AppError("COURIER", `Courier error: ${s.error ?? "unknown"}. You can retry.`);
  }, "Shipment created");
}

export async function trackShipmentAction(_: unknown, fd: FormData): R {
  return action(async () => {
    const admin = await requireAdmin("shipping.manage");
    const { shipmentId, orderId } = z.object({ shipmentId: z.string(), orderId: z.string() }).parse(Object.fromEntries(fd));
    await syncShipment(shipmentId, admin.id);
    revalidatePath(`/admin/orders/${orderId}`);
  }, "Tracking refreshed");
}

export async function refundAction(_: unknown, fd: FormData): R {
  return action(async () => {
    const admin = await requireAdmin("orders.refund");
    const { orderId, amount, reason } = z.object({ orderId: z.string(), amount: z.coerce.number().positive(), reason: z.string().min(3).max(200) }).parse(Object.fromEntries(fd));
    await refundOrder(orderId, Math.round(amount * 100), reason, admin.id);
    await logActivity({ userId: admin.id, action: "order.refunded", entityType: "order", entityId: orderId, after: { amount, reason } });
    revalidatePath(`/admin/orders/${orderId}`);
  }, "Refund recorded");
}

export async function verifyManualPaymentAction(_: unknown, fd: FormData): R {
  return action(async () => {
    const admin = await requireAdmin("orders.update");
    const { orderId, trxId } = z.object({ orderId: z.string(), trxId: z.string().min(4).max(40) }).parse(Object.fromEntries(fd));
    await markManualPaymentVerified(orderId, trxId.toUpperCase(), admin.id);
    await logActivity({ userId: admin.id, action: "payment.manual_verified", entityType: "order", entityId: orderId, after: { trxId } });
    revalidatePath(`/admin/orders/${orderId}`);
  }, "Payment marked as verified");
}

export async function addOrderNoteAction(_: unknown, fd: FormData): R {
  return action(async () => {
    const admin = await requireAdmin("orders.view");
    const { orderId, note } = z.object({ orderId: z.string(), note: z.string().min(1).max(500) }).parse(Object.fromEntries(fd));
    const o = await db.order.findUniqueOrThrow({ where: { id: orderId }, select: { status: true } });
    await db.orderStatusHistory.create({ data: { orderId, from: o.status, to: o.status, note, userId: admin.id } });
    revalidatePath(`/admin/orders/${orderId}`);
  }, "Note added");
}

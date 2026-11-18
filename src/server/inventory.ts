import "server-only";
import type { InventoryReason } from "@prisma/client";
import { db, type Tx } from "./db";
import { AppError } from "./errors";
import { notifyAdmins } from "./notifications";

/**
 * All stock mutations go through here so every change is logged
 * (inventory_logs) and uses atomic SQL updates (no read-modify-write races).
 */

async function log(tx: Tx, variantId: string, reason: InventoryReason, stockDelta: number, reservedDelta: number, extra: { orderId?: string; note?: string; userId?: string } = {}) {
  const v = await tx.productVariant.findUniqueOrThrow({ where: { id: variantId }, select: { stock: true, reserved: true } });
  await tx.inventoryLog.create({
    data: { variantId, reason, stockDelta, reservedDelta, stockAfter: v.stock, reservedAfter: v.reserved, ...extra },
  });
  return v;
}

/**
 * Reserve stock for an order. Uses a conditional UPDATE so two customers
 * buying the last unit cannot both succeed.
 */
export async function reserveStock(tx: Tx, orderId: string, lines: { variantId: string; quantity: number; name: string }[]) {
  for (const l of lines) {
    const updated = await tx.$executeRaw`
      UPDATE product_variants SET reserved = reserved + ${l.quantity}, "updatedAt" = now()
      WHERE id = ${l.variantId} AND stock - reserved >= ${l.quantity}`;
    if (updated !== 1) throw new AppError("INSUFFICIENT_STOCK", `Sorry, "${l.name}" just sold out or has fewer units left.`, 409);
    await log(tx, l.variantId, "ORDER_RESERVED", 0, l.quantity, { orderId });
  }
}

export async function releaseStock(tx: Tx, orderId: string, lines: { variantId: string; quantity: number }[], userId?: string) {
  for (const l of lines) {
    await tx.$executeRaw`UPDATE product_variants SET reserved = GREATEST(reserved - ${l.quantity}, 0), "updatedAt" = now() WHERE id = ${l.variantId}`;
    await log(tx, l.variantId, "ORDER_RELEASED", 0, -l.quantity, { orderId, userId });
  }
}

/** Shipped: physically leaves the warehouse. */
export async function fulfillStock(tx: Tx, orderId: string, lines: { variantId: string; quantity: number }[], userId?: string) {
  const touched: string[] = [];
  for (const l of lines) {
    await tx.$executeRaw`
      UPDATE product_variants SET stock = GREATEST(stock - ${l.quantity}, 0), reserved = GREATEST(reserved - ${l.quantity}, 0), "updatedAt" = now()
      WHERE id = ${l.variantId}`;
    await log(tx, l.variantId, "ORDER_FULFILLED", -l.quantity, -l.quantity, { orderId, userId });
    touched.push(l.variantId);
  }
  return touched;
}

export async function restockReturn(tx: Tx, orderId: string, lines: { variantId: string; quantity: number }[], userId?: string) {
  for (const l of lines) {
    await tx.$executeRaw`UPDATE product_variants SET stock = stock + ${l.quantity}, "updatedAt" = now() WHERE id = ${l.variantId}`;
    await log(tx, l.variantId, "RETURN_RESTOCK", l.quantity, 0, { orderId, userId, note: "Returned to stock" });
  }
}

export async function adjustStock(input: { variantId: string; delta?: number; setTo?: number; reason: InventoryReason; note?: string; userId: string }) {
  return db.$transaction(async (tx) => {
    const v = await tx.productVariant.findUniqueOrThrow({ where: { id: input.variantId }, select: { stock: true, reserved: true } });
    const target = input.setTo ?? v.stock + (input.delta ?? 0);
    if (target < 0) throw new AppError("NEGATIVE_STOCK", "Stock cannot be negative.");
    if (target < v.reserved) throw new AppError("BELOW_RESERVED", `${v.reserved} units are reserved by open orders.`);
    const delta = target - v.stock;
    await tx.productVariant.update({ where: { id: input.variantId }, data: { stock: target } });
    await log(tx, input.variantId, input.reason, delta, 0, { note: input.note, userId: input.userId });
    return { before: v.stock, after: target };
  }).then(async (r) => {
    await syncProductStockStatus([input.variantId]);
    await checkLowStock([input.variantId]);
    return r;
  });
}

export async function recordPurchase(input: { variantId: string; quantity: number; unitCost: number; supplierId?: string; invoiceRef?: string; userId: string; updateCost: boolean }) {
  await db.$transaction(async (tx) => {
    await tx.purchaseRecord.create({ data: { variantId: input.variantId, quantity: input.quantity, unitCost: input.unitCost, supplierId: input.supplierId, invoiceRef: input.invoiceRef } });
    const v = await tx.productVariant.findUniqueOrThrow({ where: { id: input.variantId }, include: { product: { select: { costPrice: true } } } });
    // Weighted average cost keeps profit accurate as purchase prices change.
    const oldCost = v.costPrice ?? v.product.costPrice;
    const newCost = input.updateCost && v.stock + input.quantity > 0 ? Math.round((oldCost * Math.max(v.stock, 0) + input.unitCost * input.quantity) / (Math.max(v.stock, 0) + input.quantity)) : oldCost;
    await tx.productVariant.update({ where: { id: input.variantId }, data: { stock: { increment: input.quantity }, costPrice: newCost } });
    await log(tx, input.variantId, "PURCHASE", input.quantity, 0, { userId: input.userId, note: input.invoiceRef ? `Invoice ${input.invoiceRef}` : undefined });
  });
  await syncProductStockStatus([input.variantId]);
}

/** Flip product status ACTIVE ⇄ OUT_OF_STOCK based on variant availability. */
export async function syncProductStockStatus(variantIds: string[]) {
  if (!variantIds.length) return;
  const products = await db.product.findMany({
    where: { variants: { some: { id: { in: variantIds } } }, status: { in: ["ACTIVE", "OUT_OF_STOCK"] } },
    select: { id: true, status: true, variants: { where: { isActive: true }, select: { stock: true, reserved: true } } },
  });
  for (const p of products) {
    const available = p.variants.some((v) => v.stock - v.reserved > 0);
    const next = available ? "ACTIVE" : "OUT_OF_STOCK";
    if (p.status !== next) await db.product.update({ where: { id: p.id }, data: { status: next } });
  }
}

export async function checkLowStock(variantIds: string[]) {
  if (!variantIds.length) return;
  const variants = await db.productVariant.findMany({
    where: { id: { in: variantIds } },
    select: { id: true, title: true, stock: true, reserved: true, product: { select: { id: true, name: true, lowStockThreshold: true } } },
  });
  for (const v of variants) {
    const available = v.stock - v.reserved;
    const label = v.title === "Default" ? v.product.name : `${v.product.name} (${v.title})`;
    if (available <= 0) {
      await notifyAdmins({ type: "out_of_stock", title: "Out of stock", body: `${label} is out of stock.`, data: { productId: v.product.id, variantId: v.id } });
    } else if (available <= v.product.lowStockThreshold) {
      await notifyAdmins({ type: "low_stock", title: "Low stock", body: `${label} has only ${available} units remaining.`, data: { productId: v.product.id, variantId: v.id } });
    }
  }
}

export async function lowStockReport(limit = 50) {
  return db.$queryRaw<{ variantId: string; productId: string; name: string; title: string; sku: string; available: number; threshold: number }[]>`
    SELECT v.id AS "variantId", p.id AS "productId", p.name, v.title, v.sku, (v.stock - v.reserved)::int AS available, p."lowStockThreshold" AS threshold
    FROM product_variants v JOIN products p ON p.id = v."productId"
    WHERE v."isActive" AND p.status IN ('ACTIVE','OUT_OF_STOCK') AND (v.stock - v.reserved) <= p."lowStockThreshold"
    ORDER BY available ASC LIMIT ${limit}`;
}

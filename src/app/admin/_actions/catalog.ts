"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { action, AppError, type ActionResult } from "@/server/errors";
import { requireAdmin } from "@/server/auth/admin";
import { saveProduct, duplicateProduct, deleteProduct, bulkUpdate } from "@/server/products-admin";
import { adjustStock, recordPurchase } from "@/server/inventory";
import { logActivity } from "@/server/activity";
import { db } from "@/server/db";
import { productInputSchema, categorySchema, slugify } from "@/validation";

type R = Promise<ActionResult<unknown>>;

function revalidateCatalog(slug?: string) {
  revalidateTag("products");
  revalidateTag("homepage");
  revalidatePath("/admin/products");
  if (slug) revalidatePath(`/products/${slug}`);
}

export async function saveProductAction(_: unknown, fd: FormData): R {
  let createdId: string | null = null;
  const r = await action(async () => {
    const id = (fd.get("id") as string) || undefined;
    const admin = await requireAdmin(id ? "products.update" : "products.create");
    const input = productInputSchema.parse(JSON.parse(String(fd.get("payload") ?? "{}")));
    const skuClash = await db.productVariant.findFirst({ where: { sku: { in: input.variants.map((v) => v.sku) }, NOT: { productId: id ?? "" } }, select: { sku: true } });
    if (skuClash) throw new AppError("SKU_TAKEN", `Variant SKU ${skuClash.sku} is already used by another product.`);
    const p = await saveProduct(input, admin.id, id);
    revalidateCatalog(p.slug);
    if (!id) createdId = p.id;
  }, "Product saved");
  if (createdId) redirect(`/admin/products/${createdId}?saved=1`);
  return r;
}

export async function duplicateProductAction(_: unknown, fd: FormData): R {
  let newId: string | null = null;
  const r = await action(async () => {
    const admin = await requireAdmin("products.create");
    newId = (await duplicateProduct(String(fd.get("id")), admin.id)).id;
  });
  if (newId) redirect(`/admin/products/${newId}`);
  return r;
}

export async function deleteProductAction(_: unknown, fd: FormData): R {
  let done = false;
  const r = await action(async () => {
    const admin = await requireAdmin("products.delete");
    await deleteProduct(String(fd.get("id")), admin.id);
    revalidateCatalog();
    done = true;
  });
  if (done) redirect("/admin/products");
  return r;
}

export async function bulkProductAction(_: unknown, fd: FormData): R {
  return action(async () => {
    const admin = await requireAdmin("products.import");
    const ids = z.array(z.string()).min(1, "Select products first").parse(fd.getAll("ids"));
    const op = String(fd.get("op"));
    const value = String(fd.get("value") ?? "");
    if (op === "price_percent") await bulkUpdate(ids, { kind: "price_percent", percent: z.coerce.number().parse(value) }, admin.id);
    else if (op === "stock_set") await bulkUpdate(ids, { kind: "stock_set", stock: z.coerce.number().int().min(0).parse(value) }, admin.id);
    else if (op === "category") await bulkUpdate(ids, { kind: "category", categoryId: z.string().min(1).parse(value) }, admin.id);
    else await bulkUpdate(ids, { kind: "status", status: z.enum(["DRAFT", "ACTIVE", "INACTIVE", "ARCHIVED"]).parse(op) }, admin.id);
    revalidateCatalog();
  }, "Products updated");
}

export async function saveCategoryAction(_: unknown, fd: FormData): R {
  return action(async () => {
    const admin = await requireAdmin("categories.manage");
    const id = (fd.get("id") as string) || undefined;
    const raw = Object.fromEntries(fd);
    const c = categorySchema.parse({ ...raw, isActive: raw.isActive === "on", parentId: raw.parentId || null });
    const data = { ...c, slug: c.slug || slugify(c.name) };
    if (id && data.parentId === id) throw new AppError("BAD_PARENT", "A category cannot be its own parent.");
    const saved = id ? await db.category.update({ where: { id }, data }) : await db.category.create({ data });
    await logActivity({ userId: admin.id, action: id ? "category.updated" : "category.created", entityType: "category", entityId: saved.id, after: { name: saved.name } });
    revalidatePath("/admin/categories");
    revalidateTag("homepage");
  }, "Category saved");
}

export async function deleteCategoryAction(_: unknown, fd: FormData): R {
  return action(async () => {
    const admin = await requireAdmin("categories.manage");
    const id = String(fd.get("id"));
    const n = await db.product.count({ where: { OR: [{ categoryId: id }, { subcategoryId: id }] } });
    if (n) throw new AppError("IN_USE", `${n} products use this category. Move them first.`);
    await db.category.delete({ where: { id } });
    await logActivity({ userId: admin.id, action: "category.deleted", entityType: "category", entityId: id });
    revalidatePath("/admin/categories");
  }, "Category deleted");
}

export async function saveBrandAction(_: unknown, fd: FormData): R {
  return action(async () => {
    await requireAdmin("categories.manage");
    const { name, logoUrl } = z.object({ name: z.string().trim().min(1).max(60), logoUrl: z.string().max(500).optional() }).parse(Object.fromEntries(fd));
    await db.brand.upsert({ where: { name }, create: { name, slug: slugify(name), logoUrl: logoUrl || null }, update: { logoUrl: logoUrl || null } });
    revalidatePath("/admin/categories");
  }, "Brand saved");
}

export async function adjustStockAction(_: unknown, fd: FormData): R {
  return action(async () => {
    const admin = await requireAdmin("inventory.adjust");
    const d = z.object({ variantId: z.string(), mode: z.enum(["add", "remove", "set"]), qty: z.coerce.number().int().min(0).max(1_000_000), reason: z.enum(["MANUAL_ADJUSTMENT", "DAMAGED", "RETURN_RESTOCK"]), note: z.string().max(200).optional() }).parse(Object.fromEntries(fd));
    const res = await adjustStock({ variantId: d.variantId, ...(d.mode === "set" ? { setTo: d.qty } : { delta: d.mode === "add" ? d.qty : -d.qty }), reason: d.reason, note: d.note, userId: admin.id });
    await logActivity({ userId: admin.id, action: "inventory.stock_changed", entityType: "variant", entityId: d.variantId, before: { stock: res.before }, after: { stock: res.after, reason: d.reason } });
    revalidatePath("/admin/inventory");
    revalidateTag("products");
  }, "Stock updated");
}

export async function purchaseAction(_: unknown, fd: FormData): R {
  return action(async () => {
    const admin = await requireAdmin("inventory.adjust");
    const d = z.object({ variantId: z.string(), quantity: z.coerce.number().int().min(1), unitCost: z.coerce.number().min(0), supplier: z.string().max(80).optional(), invoiceRef: z.string().max(60).optional(), updateCost: z.string().optional() }).parse(Object.fromEntries(fd));
    let supplierId: string | undefined;
    if (d.supplier) supplierId = (await db.supplier.findFirst({ where: { name: d.supplier } }))?.id ?? (await db.supplier.create({ data: { name: d.supplier } })).id;
    await recordPurchase({ variantId: d.variantId, quantity: d.quantity, unitCost: Math.round(d.unitCost * 100), supplierId, invoiceRef: d.invoiceRef, userId: admin.id, updateCost: d.updateCost === "on" });
    await logActivity({ userId: admin.id, action: "inventory.purchase", entityType: "variant", entityId: d.variantId, after: { quantity: d.quantity, unitCost: d.unitCost } });
    revalidatePath("/admin/inventory");
  }, "Purchase recorded");
}

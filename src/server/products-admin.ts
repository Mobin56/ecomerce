import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { AppError } from "./errors";
import { logActivity, diff } from "./activity";
import { syncProductStockStatus } from "./inventory";
import { slugify, type ProductInput } from "@/validation";
import { parseCsv, toCsv } from "@/lib/csv";

async function uniqueSlug(base: string, excludeId?: string) {
  let slug = slugify(base);
  for (let i = 2; await db.product.findFirst({ where: { slug, ...(excludeId ? { id: { not: excludeId } } : {}) }, select: { id: true } }); i++) slug = `${slugify(base)}-${i}`;
  return slug;
}

/** Create or update a product with images, attributes and variants in one transaction. */
export async function saveProduct(input: ProductInput, userId: string, id?: string) {
  const slug = await uniqueSlug(input.slug || input.name, id);
  const before = id ? await db.product.findUnique({ where: { id }, include: { variants: true } }) : null;
  if (id && !before) throw new AppError("NOT_FOUND", "Product not found", 404);

  const product = await db.$transaction(async (tx) => {
    const data = {
      name: input.name,
      slug,
      sku: input.sku,
      barcode: input.barcode || null,
      shortDescription: input.shortDescription || null,
      description: input.description || null,
      brandId: input.brandId || null,
      categoryId: input.categoryId || null,
      subcategoryId: input.subcategoryId || null,
      tags: input.tags,
      regularPrice: input.regularPrice,
      salePrice: input.salePrice,
      costPrice: input.costPrice,
      lowStockThreshold: input.lowStockThreshold,
      weightGrams: input.weightGrams ?? null,
      lengthCm: input.lengthCm ?? null,
      widthCm: input.widthCm ?? null,
      heightCm: input.heightCm ?? null,
      videoUrl: input.videoUrl || null,
      warranty: input.warranty || null,
      optionNames: input.optionNames,
      status: input.status,
      isFeatured: input.isFeatured,
      seoTitle: input.seoTitle || null,
      seoDescription: input.seoDescription || null,
      seoKeywords: input.seoKeywords,
      publishedAt: input.status === "ACTIVE" ? (before?.publishedAt ?? new Date()) : (before?.publishedAt ?? null),
    };
    const p = id ? await tx.product.update({ where: { id }, data }) : await tx.product.create({ data });

    // Images: replace set, keep order.
    await tx.productImage.deleteMany({ where: { productId: p.id, url: { notIn: input.images.map((i) => i.url) } } });
    const imageIds = new Map<string, string>();
    for (const [position, img] of input.images.entries()) {
      const existing = await tx.productImage.findFirst({ where: { productId: p.id, url: img.url } });
      const saved = existing
        ? await tx.productImage.update({ where: { id: existing.id }, data: { position, alt: img.alt ?? input.name } })
        : await tx.productImage.create({ data: { productId: p.id, url: img.url, alt: img.alt ?? input.name, position } });
      imageIds.set(img.url, saved.id);
    }

    await tx.productAttribute.deleteMany({ where: { productId: p.id } });
    if (input.attributes.length) await tx.productAttribute.createMany({ data: input.attributes.map((a, position) => ({ productId: p.id, ...a, position })) });

    // Variants: update existing by id, create new; deactivate removed ones that have order history, delete others.
    const keepIds = input.variants.map((v) => v.id).filter((x): x is string => Boolean(x));
    const removed = await tx.productVariant.findMany({ where: { productId: p.id, id: { notIn: keepIds } }, select: { id: true, _count: { select: { orderItems: true } }, reserved: true } });
    for (const r of removed) {
      if (r.reserved > 0) throw new AppError("VARIANT_IN_USE", "A removed variant has stock reserved by open orders.", 409);
      if (r._count.orderItems > 0) await tx.productVariant.update({ where: { id: r.id }, data: { isActive: false } });
      else await tx.productVariant.delete({ where: { id: r.id } });
    }
    for (const [position, v] of input.variants.entries()) {
      const vdata = {
        sku: v.sku,
        title: v.title || "Default",
        options: v.options,
        price: v.price,
        salePrice: v.salePrice,
        costPrice: v.costPrice,
        weightGrams: v.weightGrams ?? null,
        imageId: v.imageUrl ? (imageIds.get(v.imageUrl) ?? null) : null,
        isActive: v.isActive,
        isDefault: position === 0,
        position,
      };
      if (v.id) {
        const prev = await tx.productVariant.findUnique({ where: { id: v.id } });
        if (!prev || prev.productId !== p.id) throw new AppError("BAD_VARIANT", "Variant does not belong to product", 400);
        if (v.stock < prev.reserved) throw new AppError("BELOW_RESERVED", `${v.sku}: ${prev.reserved} units are reserved by open orders.`, 409);
        await tx.productVariant.update({ where: { id: v.id }, data: { ...vdata, stock: v.stock } });
        if (v.stock !== prev.stock) {
          await tx.inventoryLog.create({ data: { variantId: v.id, reason: "MANUAL_ADJUSTMENT", stockDelta: v.stock - prev.stock, stockAfter: v.stock, reservedAfter: prev.reserved, userId, note: "Edited in product form" } });
        }
      } else {
        const created = await tx.productVariant.create({ data: { ...vdata, productId: p.id, stock: v.stock } });
        await tx.inventoryLog.create({ data: { variantId: created.id, reason: "INITIAL", stockDelta: v.stock, stockAfter: v.stock, reservedAfter: 0, userId } });
      }
    }
    return p;
  });

  if (before) {
    const d = diff(
      { regularPrice: before.regularPrice, salePrice: before.salePrice, costPrice: before.costPrice, status: before.status, name: before.name },
      { regularPrice: product.regularPrice, salePrice: product.salePrice, costPrice: product.costPrice, status: product.status, name: product.name },
    );
    const priceChanged = "regularPrice" in d.after || "salePrice" in d.after;
    await logActivity({ userId, action: priceChanged ? "product.price_changed" : "product.updated", entityType: "product", entityId: product.id, before: d.before, after: d.after });
  } else {
    await logActivity({ userId, action: "product.created", entityType: "product", entityId: product.id, after: { name: product.name, sku: product.sku } });
  }
  const variantIds = (await db.productVariant.findMany({ where: { productId: product.id }, select: { id: true } })).map((v) => v.id);
  await syncProductStockStatus(variantIds);
  return product;
}

export async function duplicateProduct(id: string, userId: string) {
  const p = await db.product.findUniqueOrThrow({ where: { id }, include: { images: true, variants: true, attributes: true } });
  const suffix = Date.now().toString(36).slice(-4).toUpperCase();
  const copy = await db.product.create({
    data: {
      ...Prisma.validator<Prisma.ProductCreateInput>()({
        name: `${p.name} (Copy)`,
        slug: await uniqueSlug(`${p.slug}-copy`),
        sku: `${p.sku}-${suffix}`,
        shortDescription: p.shortDescription,
        description: p.description,
        tags: p.tags,
        regularPrice: p.regularPrice,
        salePrice: p.salePrice,
        costPrice: p.costPrice,
        lowStockThreshold: p.lowStockThreshold,
        weightGrams: p.weightGrams,
        optionNames: p.optionNames,
        warranty: p.warranty,
        status: "DRAFT",
        seoTitle: p.seoTitle,
        seoDescription: p.seoDescription,
        seoKeywords: p.seoKeywords,
        ...(p.brandId ? { brand: { connect: { id: p.brandId } } } : {}),
        ...(p.categoryId ? { category: { connect: { id: p.categoryId } } } : {}),
      }),
      images: { create: p.images.map((i) => ({ url: i.url, alt: i.alt, position: i.position })) },
      attributes: { create: p.attributes.map((a) => ({ name: a.name, value: a.value, position: a.position })) },
      variants: { create: p.variants.map((v) => ({ sku: `${v.sku}-${suffix}`, title: v.title, options: v.options ?? {}, price: v.price, salePrice: v.salePrice, costPrice: v.costPrice, stock: 0, isDefault: v.isDefault, position: v.position })) },
    },
  });
  await logActivity({ userId, action: "product.duplicated", entityType: "product", entityId: copy.id, before: { sourceId: id } });
  return copy;
}

/** Products with order history are archived, never hard-deleted (keeps reports intact). */
export async function deleteProduct(id: string, userId: string) {
  const p = await db.product.findUniqueOrThrow({ where: { id }, select: { name: true, _count: { select: { orderItems: true } } } });
  if (p._count.orderItems > 0) {
    await db.product.update({ where: { id }, data: { status: "ARCHIVED" } });
    await logActivity({ userId, action: "product.archived", entityType: "product", entityId: id, before: { name: p.name } });
    return "archived" as const;
  }
  await db.product.delete({ where: { id } });
  await logActivity({ userId, action: "product.deleted", entityType: "product", entityId: id, before: { name: p.name } });
  return "deleted" as const;
}

export async function bulkUpdate(ids: string[], op: { kind: "status"; status: ProductInput["status"] } | { kind: "price_percent"; percent: number } | { kind: "stock_set"; stock: number } | { kind: "category"; categoryId: string }, userId: string) {
  if (!ids.length) return 0;
  if (op.kind === "status") await db.product.updateMany({ where: { id: { in: ids } }, data: { status: op.status } });
  if (op.kind === "category") await db.product.updateMany({ where: { id: { in: ids } }, data: { categoryId: op.categoryId } });
  if (op.kind === "price_percent") {
    if (op.percent < -90 || op.percent > 500) throw new AppError("BAD_PERCENT", "Percent must be between -90 and 500.");
    const factor = 1 + op.percent / 100;
    await db.$executeRaw`UPDATE products SET "regularPrice" = ROUND("regularPrice" * ${factor})::int, "salePrice" = CASE WHEN "salePrice" IS NULL THEN NULL ELSE ROUND("salePrice" * ${factor})::int END, "updatedAt" = now() WHERE id = ANY(${ids})`;
    await db.$executeRaw`UPDATE product_variants SET price = CASE WHEN price IS NULL THEN NULL ELSE ROUND(price * ${factor})::int END, "salePrice" = CASE WHEN "salePrice" IS NULL THEN NULL ELSE ROUND("salePrice" * ${factor})::int END WHERE "productId" = ANY(${ids})`;
  }
  if (op.kind === "stock_set") {
    const variants = await db.productVariant.findMany({ where: { productId: { in: ids } }, select: { id: true, stock: true, reserved: true } });
    await db.$transaction(
      variants.flatMap((v) => {
        const target = Math.max(op.stock, v.reserved);
        return [
          db.productVariant.update({ where: { id: v.id }, data: { stock: target } }),
          db.inventoryLog.create({ data: { variantId: v.id, reason: "MANUAL_ADJUSTMENT", stockDelta: target - v.stock, stockAfter: target, reservedAfter: v.reserved, userId, note: "Bulk stock update" } }),
        ];
      }),
    );
    await syncProductStockStatus(variants.map((v) => v.id));
  }
  await logActivity({ userId, action: `product.bulk_${op.kind}`, entityType: "product", after: { ids, op } });
  return ids.length;
}

// ---------------- CSV import / export ----------------

const CSV_COLUMNS = ["product_sku", "name", "slug", "status", "category_slug", "brand", "regular_price", "sale_price", "cost_price", "variant_sku", "variant_title", "option1_name", "option1_value", "option2_name", "option2_value", "variant_price", "variant_stock", "image_urls", "short_description", "tags"] as const;

export async function exportProductsCsv() {
  const products = await db.product.findMany({ where: { status: { not: "ARCHIVED" } }, include: { variants: { orderBy: { position: "asc" } }, category: true, brand: true, images: { orderBy: { position: "asc" } } }, orderBy: { createdAt: "asc" } });
  const rows = products.flatMap((p) =>
    p.variants.map((v) => {
      const opts = Object.entries((v.options as Record<string, string>) ?? {});
      return {
        product_sku: p.sku, name: p.name, slug: p.slug, status: p.status, category_slug: p.category?.slug ?? "", brand: p.brand?.name ?? "",
        regular_price: (p.regularPrice / 100).toString(), sale_price: p.salePrice ? (p.salePrice / 100).toString() : "", cost_price: ((v.costPrice ?? p.costPrice) / 100).toString(),
        variant_sku: v.sku, variant_title: v.title, option1_name: opts[0]?.[0] ?? "", option1_value: opts[0]?.[1] ?? "", option2_name: opts[1]?.[0] ?? "", option2_value: opts[1]?.[1] ?? "",
        variant_price: v.price ? (v.price / 100).toString() : "", variant_stock: String(v.stock), image_urls: p.images.map((i) => i.url).join("|"), short_description: p.shortDescription ?? "", tags: p.tags.join("|"),
      };
    }),
  );
  return toCsv([...CSV_COLUMNS], rows);
}

/** Upsert by product_sku / variant_sku. Rows of the same product_sku are grouped into variants. Returns per-row errors. */
export async function importProductsCsv(text: string, userId: string) {
  const rows = parseCsv(text);
  if (rows.length > 5000) throw new AppError("TOO_MANY_ROWS", "Max 5000 rows per import.");
  const missing = ["product_sku", "name", "regular_price"].filter((c) => !(c in (rows[0] ?? {})));
  if (missing.length) throw new AppError("BAD_CSV", `Missing columns: ${missing.join(", ")}`);
  const groups = new Map<string, Record<string, string>[]>();
  rows.forEach((r) => groups.set(r.product_sku!, [...(groups.get(r.product_sku!) ?? []), r]));
  const errors: { sku: string; error: string }[] = [];
  let created = 0;
  let updated = 0;
  const categories = new Map((await db.category.findMany({ select: { id: true, slug: true } })).map((c) => [c.slug, c.id]));
  for (const [sku, group] of groups) {
    try {
      const first = group[0]!;
      const toP = (v: string | undefined) => (v && v.trim() !== "" ? Math.round(Number.parseFloat(v) * 100) : null);
      const regular = toP(first.regular_price);
      if (regular === null || Number.isNaN(regular)) throw new Error("regular_price is required");
      let brandId: string | null = null;
      if (first.brand) brandId = (await db.brand.upsert({ where: { name: first.brand }, create: { name: first.brand, slug: slugify(first.brand) }, update: {} })).id;
      const existing = await db.product.findUnique({ where: { sku }, include: { variants: true } });
      const optionNames = [first.option1_name, first.option2_name].filter((x): x is string => Boolean(x));
      const variants = group.map((r, i) => {
        const options: Record<string, string> = {};
        if (r.option1_name && r.option1_value) options[r.option1_name] = r.option1_value;
        if (r.option2_name && r.option2_value) options[r.option2_name] = r.option2_value;
        const vsku = r.variant_sku || (group.length === 1 ? `${sku}-DEFAULT` : `${sku}-${i + 1}`);
        return { id: existing?.variants.find((v) => v.sku === vsku)?.id, sku: vsku, title: r.variant_title || Object.values(options).join(" / ") || "Default", options, price: toP(r.variant_price), salePrice: null, costPrice: toP(r.cost_price), stock: Number.parseInt(r.variant_stock || "0", 10) || 0, weightGrams: null, imageUrl: null, isActive: true };
      });
      await saveProduct(
        {
          name: first.name!, slug: first.slug || "", sku, barcode: null, shortDescription: first.short_description || null, description: existing?.description ?? null,
          brandId, categoryId: first.category_slug ? (categories.get(first.category_slug) ?? null) : (existing?.categoryId ?? null), subcategoryId: existing?.subcategoryId ?? null,
          tags: first.tags ? first.tags.split("|").map((t) => t.trim()).filter(Boolean) : [], regularPrice: regular, salePrice: toP(first.sale_price), costPrice: toP(first.cost_price) ?? 0,
          lowStockThreshold: existing?.lowStockThreshold ?? 5, weightGrams: existing?.weightGrams ?? null, optionNames,
          status: (["DRAFT", "ACTIVE", "INACTIVE", "ARCHIVED"].includes(first.status ?? "") ? first.status : "DRAFT") as ProductInput["status"],
          isFeatured: existing?.isFeatured ?? false, seoTitle: existing?.seoTitle ?? null, seoDescription: existing?.seoDescription ?? null, seoKeywords: existing?.seoKeywords ?? [],
          images: (first.image_urls ?? "").split("|").map((u) => u.trim()).filter((u) => /^https:\/\//.test(u)).map((url) => ({ url, alt: first.name })),
          attributes: [], variants, videoUrl: null, warranty: existing?.warranty ?? null, lengthCm: null, widthCm: null, heightCm: null,
        },
        userId,
        existing?.id,
      );
      if (existing) updated++;
      else created++;
    } catch (e) {
      errors.push({ sku, error: e instanceof AppError || e instanceof Error ? e.message : "Unknown error" });
    }
  }
  await logActivity({ userId, action: "product.csv_import", entityType: "product", after: { created, updated, errors: errors.length } });
  return { created, updated, errors };
}

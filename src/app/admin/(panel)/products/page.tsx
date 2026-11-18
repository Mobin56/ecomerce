import Image from "next/image";
import Link from "next/link";
import type { Prisma, ProductStatus } from "@prisma/client";
import { requireAdminPage } from "@/server/auth/admin";
import { db } from "@/server/db";
import { PageHeader, Card, Table, Pager, inputCls } from "@/components/admin/ui";
import { ActionForm, SubmitButton } from "@/components/admin/action-form";
import { Badge } from "@/components/ui/misc";
import { formatMoney } from "@/core/money";
import { can } from "@/core/rbac";
import { bulkProductAction } from "../../_actions/catalog";

type SP = { q?: string; status?: string; category?: string; page?: string };

export default async function ProductsAdmin({ searchParams }: { searchParams: Promise<SP> }) {
  const admin = await requireAdminPage("products.view");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const where: Prisma.ProductWhereInput = {};
  if (sp.status) where.status = sp.status as ProductStatus;
  else where.status = { not: "ARCHIVED" };
  if (sp.category) where.categoryId = sp.category;
  if (sp.q) where.OR = [{ name: { contains: sp.q, mode: "insensitive" } }, { sku: { contains: sp.q, mode: "insensitive" } }, { variants: { some: { sku: { contains: sp.q, mode: "insensitive" } } } }];
  const [total, products, categories] = await Promise.all([
    db.product.count({ where }),
    db.product.findMany({ where, orderBy: { updatedAt: "desc" }, skip: (page - 1) * 30, take: 30, include: { category: { select: { name: true } }, images: { take: 1, orderBy: { position: "asc" } }, variants: { select: { stock: true, reserved: true } } } }),
    db.category.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const qs = (p: number) => `/admin/products?${new URLSearchParams({ ...sp, page: String(p) } as Record<string, string>)}`;
  return (
    <>
      <PageHeader
        title="Products"
        description={`${total} products`}
        actions={
          <>
            {can(admin, "products.import") && <a href="/api/admin/products/export" className="inline-flex h-9 items-center rounded-full border border-line bg-card px-4 text-sm font-semibold">Export CSV</a>}
            {can(admin, "products.import") && <Link href="/admin/products/import" className="inline-flex h-9 items-center rounded-full border border-line bg-card px-4 text-sm font-semibold">Import CSV</Link>}
            {can(admin, "products.create") && <Link href="/admin/products/new" className="inline-flex h-9 items-center rounded-full bg-ink px-4 text-sm font-semibold text-white">Add product</Link>}
          </>
        }
      />
      <form className="mb-4 grid gap-2 sm:grid-cols-[1fr_180px_200px_auto]">
        <input name="q" defaultValue={sp.q} placeholder="Search name or SKU" className={inputCls} />
        <select name="status" defaultValue={sp.status ?? ""} className={inputCls}><option value="">All (not archived)</option>{["DRAFT", "ACTIVE", "INACTIVE", "OUT_OF_STOCK", "ARCHIVED"].map((s) => <option key={s}>{s}</option>)}</select>
        <select name="category" defaultValue={sp.category ?? ""} className={inputCls}><option value="">All categories</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <button className="h-10 rounded-lg bg-ink px-4 text-sm font-semibold text-white">Filter</button>
      </form>
      <Card padded={false}>
        <ActionForm action={bulkProductAction} confirm="Apply bulk change to selected products?">
          {can(admin, "products.import") && (
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5 text-xs">
              <span className="text-muted">Bulk:</span>
              <select name="op" className="h-8 rounded-lg border border-line px-2" aria-label="Bulk operation">
                <option value="ACTIVE">Set Active</option><option value="DRAFT">Set Draft</option><option value="INACTIVE">Set Inactive</option><option value="ARCHIVED">Archive</option>
                <option value="price_percent">Change price by %</option><option value="stock_set">Set stock for all variants</option><option value="category">Move to category (id)</option>
              </select>
              <input name="value" placeholder="value (e.g. -10)" className="h-8 w-32 rounded-lg border border-line px-2" aria-label="Bulk value" />
              <SubmitButton variant="outline">Apply</SubmitButton>
            </div>
          )}
          <Table head={["", "Product", "SKU", "Category", "Price", "Stock", "Status"]} empty={!products.length}>
            {products.map((p) => {
              const stock = p.variants.reduce((s, v) => s + v.stock - v.reserved, 0);
              return (
                <tr key={p.id} className="hover:bg-paper">
                  <td><input type="checkbox" name="ids" value={p.id} aria-label={`Select ${p.name}`} /></td>
                  <td>
                    <Link href={`/admin/products/${p.id}`} className="flex items-center gap-3">
                      <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-paper">{p.images[0] && <Image src={p.images[0].url} alt="" fill sizes="40px" className="object-cover" />}</span>
                      <span className="font-medium hover:underline">{p.name}</span>
                    </Link>
                  </td>
                  <td className="text-xs text-muted">{p.sku}</td>
                  <td className="text-xs">{p.category?.name ?? "—"}</td>
                  <td className="tabular-nums">{p.salePrice ? <><span className="text-accent">{formatMoney(p.salePrice)}</span> <s className="text-xs text-muted">{formatMoney(p.regularPrice)}</s></> : formatMoney(p.regularPrice)}</td>
                  <td className={stock <= p.lowStockThreshold ? "font-semibold text-danger" : ""}>{stock}<span className="text-xs text-muted"> / {p.variants.length} var.</span></td>
                  <td><Badge tone={p.status === "ACTIVE" ? "success" : p.status === "OUT_OF_STOCK" ? "danger" : "neutral"}>{p.status}</Badge></td>
                </tr>
              );
            })}
          </Table>
        </ActionForm>
        <Pager page={page} pages={Math.ceil(total / 30)} href={qs} />
      </Card>
    </>
  );
}

import Link from "next/link";
import { Prisma } from "@prisma/client";
import { requireAdminPage } from "@/server/auth/admin";
import { db } from "@/server/db";
import { PageHeader, Card, Table, Pager, Stat, inputCls } from "@/components/admin/ui";
import { ActionForm, SubmitButton } from "@/components/admin/action-form";
import { formatMoney } from "@/core/money";
import { can } from "@/core/rbac";
import { formatDateTime } from "@/lib/utils";
import { adjustStockAction, purchaseAction } from "../../_actions/catalog";

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ q?: string; filter?: string; page?: string; variant?: string }> }) {
  const admin = await requireAdminPage("inventory.view");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const where: Prisma.ProductVariantWhereInput = { product: { status: { not: "ARCHIVED" } } };
  if (sp.q) where.OR = [{ sku: { contains: sp.q, mode: "insensitive" } }, { product: { name: { contains: sp.q, mode: "insensitive" } } }];
  let ids: string[] | undefined;
  if (sp.filter === "low" || sp.filter === "out") {
    const cond = sp.filter === "out" ? Prisma.sql`(v.stock - v.reserved) <= 0` : Prisma.sql`(v.stock - v.reserved) <= p."lowStockThreshold"`;
    const rows = await db.$queryRaw<{ id: string }[]>`SELECT v.id FROM product_variants v JOIN products p ON p.id = v."productId" WHERE v."isActive" AND ${cond}`;
    ids = rows.map((r) => r.id);
    where.id = { in: ids };
  }
  const [total, variants, value, logs] = await Promise.all([
    db.productVariant.count({ where }),
    db.productVariant.findMany({ where, orderBy: [{ product: { name: "asc" } }, { position: "asc" }], skip: (page - 1) * 40, take: 40, include: { product: { select: { id: true, name: true, lowStockThreshold: true, costPrice: true } } } }),
    db.$queryRaw<{ units: number; cost: number }[]>`SELECT COALESCE(SUM(v.stock),0)::int AS units, COALESCE(SUM(v.stock * COALESCE(v."costPrice", p."costPrice")),0)::bigint::float AS cost FROM product_variants v JOIN products p ON p.id = v."productId" WHERE v."isActive"`,
    sp.variant ? db.inventoryLog.findMany({ where: { variantId: sp.variant }, orderBy: { createdAt: "desc" }, take: 50, include: { user: { select: { name: true } } } }) : Promise.resolve([]),
  ]);
  const qs = (p: number) => `/admin/inventory?${new URLSearchParams({ ...sp, page: String(p) } as Record<string, string>)}`;
  const canAdjust = can(admin, "inventory.adjust");
  return (
    <>
      <PageHeader title="Inventory" description="Available = stock − reserved by open orders." />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Units in stock" value={value[0]?.units ?? 0} />
        <Stat label="Stock value (cost)" value={formatMoney(value[0]?.cost ?? 0)} />
      </div>
      <form className="mb-4 flex flex-wrap gap-2">
        <input name="q" defaultValue={sp.q} placeholder="Search product or SKU" className={`${inputCls} max-w-xs`} />
        <select name="filter" defaultValue={sp.filter ?? ""} className={`${inputCls} max-w-[180px]`}><option value="">All</option><option value="low">Low stock</option><option value="out">Out of stock</option></select>
        <button className="h-10 rounded-lg bg-ink px-4 text-sm font-semibold text-white">Filter</button>
      </form>
      {logs.length > 0 && (
        <Card title="Stock history" className="mb-4" actions={<Link href="/admin/inventory" className="text-xs underline">Close</Link>}>
          <ul className="space-y-1 text-xs">{logs.map((l) => <li key={l.id}>{formatDateTime(l.createdAt)} · <strong>{l.reason}</strong> · stock {l.stockDelta >= 0 ? "+" : ""}{l.stockDelta} → {l.stockAfter} · reserved {l.reservedDelta >= 0 ? "+" : ""}{l.reservedDelta} → {l.reservedAfter}{l.note ? ` · ${l.note}` : ""}{l.user ? ` · ${l.user.name}` : ""}{l.orderId ? <> · <Link className="underline" href={`/admin/orders/${l.orderId}`}>order</Link></> : null}</li>)}</ul>
        </Card>
      )}
      <Card padded={false}>
        <Table head={["Product / variant", "SKU", "Stock", "Reserved", "Available", "Cost", canAdjust ? "Adjust" : "", ""]} empty={!variants.length}>
          {variants.map((v) => {
            const available = v.stock - v.reserved;
            return (
              <tr key={v.id}>
                <td><Link href={`/admin/products/${v.product.id}`} className="font-medium hover:underline">{v.product.name}</Link>{v.title !== "Default" && <span className="block text-xs text-muted">{v.title}</span>}</td>
                <td className="text-xs">{v.sku}</td>
                <td className="tabular-nums">{v.stock}</td>
                <td className="tabular-nums text-muted">{v.reserved}</td>
                <td className={`font-semibold tabular-nums ${available <= 0 ? "text-danger" : available <= v.product.lowStockThreshold ? "text-warn" : ""}`}>{available}</td>
                <td className="text-xs">{formatMoney(v.costPrice ?? v.product.costPrice)}</td>
                <td>
                  {canAdjust && (
                    <details>
                      <summary className="cursor-pointer text-xs font-semibold">Adjust / purchase</summary>
                      <div className="mt-2 w-72 space-y-3">
                        <ActionForm action={adjustStockAction} className="grid grid-cols-2 gap-1.5">
                          <input type="hidden" name="variantId" value={v.id} />
                          <select name="mode" className={`${inputCls} h-8 text-xs`} aria-label="Mode"><option value="add">Add</option><option value="remove">Remove</option><option value="set">Set to</option></select>
                          <input name="qty" type="number" min={0} required placeholder="Qty" className={`${inputCls} h-8 text-xs`} aria-label="Quantity" />
                          <select name="reason" className={`${inputCls} h-8 text-xs`} aria-label="Reason"><option value="MANUAL_ADJUSTMENT">Correction</option><option value="DAMAGED">Damaged</option><option value="RETURN_RESTOCK">Return restock</option></select>
                          <input name="note" placeholder="Note" className={`${inputCls} h-8 text-xs`} aria-label="Note" />
                          <SubmitButton className="col-span-2">Save adjustment</SubmitButton>
                        </ActionForm>
                        <ActionForm action={purchaseAction} className="grid grid-cols-2 gap-1.5 border-t border-line pt-3">
                          <input type="hidden" name="variantId" value={v.id} />
                          <input name="quantity" type="number" min={1} required placeholder="Qty received" className={`${inputCls} h-8 text-xs`} aria-label="Quantity received" />
                          <input name="unitCost" type="number" step="0.01" min={0} required placeholder="Unit cost ৳" className={`${inputCls} h-8 text-xs`} aria-label="Unit cost" />
                          <input name="supplier" placeholder="Supplier" className={`${inputCls} h-8 text-xs`} aria-label="Supplier" />
                          <input name="invoiceRef" placeholder="Invoice #" className={`${inputCls} h-8 text-xs`} aria-label="Invoice" />
                          <label className="col-span-2 flex items-center gap-1.5 text-xs"><input type="checkbox" name="updateCost" defaultChecked /> Update average cost</label>
                          <SubmitButton className="col-span-2" variant="outline">Record purchase</SubmitButton>
                        </ActionForm>
                      </div>
                    </details>
                  )}
                </td>
                <td><Link href={`/admin/inventory?variant=${v.id}`} className="text-xs underline">History</Link></td>
              </tr>
            );
          })}
        </Table>
        <Pager page={page} pages={Math.ceil(total / 40)} href={qs} />
      </Card>
    </>
  );
}

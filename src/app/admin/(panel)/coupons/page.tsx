import { requireAdminPage } from "@/server/auth/admin";
import { db } from "@/server/db";
import { PageHeader, Card, Table, inputCls, labelCls } from "@/components/admin/ui";
import { ActionForm, SubmitButton } from "@/components/admin/action-form";
import { Badge } from "@/components/ui/misc";
import { formatMoney } from "@/core/money";
import { formatDate } from "@/lib/utils";
import { saveCouponAction, toggleCouponAction } from "../../_actions/marketing";

type C = Awaited<ReturnType<typeof load>>[number];
const load = () => db.coupon.findMany({ orderBy: { createdAt: "desc" }, include: { customers: { select: { phone: true } }, _count: { select: { redemptions: true } } } });
const iso = (d: Date | null) => (d ? new Date(d.getTime() + 6 * 3600_000).toISOString().slice(0, 16) : "");

function CouponForm({ c }: { c?: C }) {
  return (
    <ActionForm action={saveCouponAction} className="grid gap-3 sm:grid-cols-4">
      {c && <input type="hidden" name="id" value={c.id} />}
      <div><label className={labelCls}>Code</label><input name="code" defaultValue={c?.code} required className={`${inputCls} uppercase`} placeholder="EID25" /></div>
      <div><label className={labelCls}>Type</label><select name="type" defaultValue={c?.type ?? "PERCENTAGE"} className={inputCls}><option value="PERCENTAGE">Percentage %</option><option value="FIXED">Fixed ৳</option><option value="FREE_SHIPPING">Free delivery</option></select></div>
      <div><label className={labelCls}>Value (% or ৳)</label><input name="value" type="number" step="0.01" min={0} defaultValue={c ? (c.type === "FIXED" ? c.value / 100 : c.value) : ""} className={inputCls} /></div>
      <div><label className={labelCls}>Max discount ৳</label><input name="maxDiscount" type="number" min={0} defaultValue={c?.maxDiscount ? c.maxDiscount / 100 : ""} className={inputCls} /></div>
      <div><label className={labelCls}>Minimum order ৳</label><input name="minOrder" type="number" min={0} defaultValue={c ? c.minOrder / 100 : 0} className={inputCls} /></div>
      <div><label className={labelCls}>Total usage limit</label><input name="usageLimit" type="number" min={1} defaultValue={c?.usageLimit ?? ""} className={inputCls} /></div>
      <div><label className={labelCls}>Per customer limit</label><input name="perCustomerLimit" type="number" min={1} defaultValue={c ? (c.perCustomerLimit ?? "") : 1} className={inputCls} /></div>
      <div><label className={labelCls}>Description</label><input name="description" defaultValue={c?.description ?? ""} className={inputCls} /></div>
      <div><label className={labelCls}>Starts</label><input name="startsAt" type="datetime-local" defaultValue={iso(c?.startsAt ?? null)} className={inputCls} /></div>
      <div><label className={labelCls}>Expires</label><input name="expiresAt" type="datetime-local" defaultValue={iso(c?.expiresAt ?? null)} className={inputCls} /></div>
      <div className="sm:col-span-2"><label className={labelCls}>Only for customers (phones, comma separated)</label><input name="customerPhones" defaultValue={c?.customers.map((x) => x.phone).join(", ")} className={inputCls} /></div>
      <div className="sm:col-span-2"><label className={labelCls}>Only for product IDs</label><input name="productIds" defaultValue={c?.productIds.join(", ")} className={inputCls} /></div>
      <div className="sm:col-span-2"><label className={labelCls}>Only for category IDs</label><input name="categoryIds" defaultValue={c?.categoryIds.join(", ")} className={inputCls} /></div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="firstOrderOnly" defaultChecked={c?.firstOrderOnly} /> First order only</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isActive" defaultChecked={c?.isActive ?? true} /> Active</label>
      <div className="sm:col-span-4"><SubmitButton>{c ? "Save coupon" : "Create coupon"}</SubmitButton></div>
    </ActionForm>
  );
}

export default async function CouponsPage() {
  await requireAdminPage("coupons.manage");
  const coupons = await load();
  return (
    <>
      <PageHeader title="Coupons" />
      <Card title="New coupon"><CouponForm /></Card>
      <Card padded={false} className="mt-4">
        <Table head={["Code", "Discount", "Rules", "Used", "Valid", "Status", ""]} empty={!coupons.length}>
          {coupons.map((c) => (
            <tr key={c.id}>
              <td className="font-mono font-semibold">{c.code}</td>
              <td>{c.type === "PERCENTAGE" ? `${c.value}%` : c.type === "FIXED" ? formatMoney(c.value) : "Free delivery"}{c.maxDiscount ? <span className="text-xs text-muted"> (max {formatMoney(c.maxDiscount)})</span> : null}</td>
              <td className="text-xs text-muted">{[c.minOrder ? `min ${formatMoney(c.minOrder)}` : null, c.firstOrderOnly ? "first order" : null, c.productIds.length ? `${c.productIds.length} products` : null, c.categoryIds.length ? `${c.categoryIds.length} categories` : null, c.customers.length ? `${c.customers.length} customers` : null].filter(Boolean).join(" · ") || "—"}</td>
              <td>{c.usedCount}{c.usageLimit ? `/${c.usageLimit}` : ""}</td>
              <td className="text-xs">{c.expiresAt ? `until ${formatDate(c.expiresAt)}` : "no expiry"}</td>
              <td><ActionForm action={toggleCouponAction}><input type="hidden" name="id" value={c.id} /><button className="cursor-pointer"><Badge tone={c.isActive ? "success" : "neutral"}>{c.isActive ? "Active" : "Inactive"}</Badge></button></ActionForm></td>
              <td><details><summary className="cursor-pointer text-xs font-semibold">Edit</summary><div className="mt-3 w-[min(900px,80vw)]"><CouponForm c={c} /></div></details></td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}

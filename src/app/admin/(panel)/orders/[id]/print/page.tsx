import { notFound } from "next/navigation";
import { requireAdminPage } from "@/server/auth/admin";
import { db } from "@/server/db";
import { getSettings } from "@/server/settings";
import { formatMoney } from "@/core/money";
import { formatDate } from "@/lib/utils";
import { PrintButton } from "@/components/admin/print-button";

/** Printable invoice / packing slip (A4/A5, also fine on thermal 80mm via browser scaling). */
export default async function PrintPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ type?: string }> }) {
  await requireAdminPage("orders.view");
  const [{ id }, { type = "invoice" }] = await Promise.all([params, searchParams]);
  const [o, store] = await Promise.all([db.order.findUnique({ where: { id }, include: { items: true, shipments: { orderBy: { createdAt: "desc" }, take: 1 } } }), getSettings("store")]);
  if (!o) notFound();
  const packing = type === "packing";
  return (
    <div className="mx-auto max-w-2xl bg-white p-8 text-sm text-black print:p-0">
      <style>{`@media print { aside, header, nav, .no-print { display:none !important } main { padding:0 !important } body { background:#fff } }`}</style>
      <div className="no-print mb-6 flex justify-end"><PrintButton /></div>
      <div className="flex justify-between">
        <div><p className="text-xl font-bold">{store.name}</p><p>{store.address}</p><p>{store.supportPhone}</p></div>
        <div className="text-right"><p className="text-lg font-bold">{packing ? "PACKING SLIP" : "INVOICE"}</p><p>#{o.number}</p><p>{formatDate(o.createdAt)}</p>{o.shipments[0]?.trackingId && <p>{o.shipments[0].courier}: {o.shipments[0].trackingId}</p>}</div>
      </div>
      <div className="mt-6 rounded border p-3">
        <p className="font-semibold">Ship to</p>
        <p>{o.shipName} · {o.shipPhone}</p>
        <p>{o.shipAddress}, {o.shipArea}, {o.shipDistrict}</p>
        {o.notes && <p className="mt-1 italic">Note: {o.notes}</p>}
      </div>
      <table className="mt-6 w-full border-collapse">
        <thead><tr className="border-b text-left"><th className="py-2">Item</th><th>SKU</th><th className="text-right">Qty</th>{!packing && <><th className="text-right">Price</th><th className="text-right">Total</th></>}</tr></thead>
        <tbody>
          {o.items.map((i) => (
            <tr key={i.id} className="border-b"><td className="py-2">{i.name}{i.variantTitle !== "Default" ? ` (${i.variantTitle})` : ""}</td><td>{i.sku}</td><td className="text-right">{i.quantity}</td>{!packing && <><td className="text-right">{formatMoney(i.unitPrice)}</td><td className="text-right">{formatMoney(i.lineTotal)}</td></>}</tr>
          ))}
        </tbody>
      </table>
      {!packing && (
        <dl className="ml-auto mt-4 w-64 space-y-1">
          <div className="flex justify-between"><dt>Subtotal</dt><dd>{formatMoney(o.subtotal)}</dd></div>
          {o.discount > 0 && <div className="flex justify-between"><dt>Discount</dt><dd>−{formatMoney(o.discount)}</dd></div>}
          <div className="flex justify-between"><dt>Delivery</dt><dd>{formatMoney(o.shippingFee)}</dd></div>
          <div className="flex justify-between border-t pt-1 font-bold"><dt>Total</dt><dd>{formatMoney(o.total)}</dd></div>
          <div className="flex justify-between"><dt>{o.paymentStatus === "PAID" ? "Paid" : "Collect (COD)"}</dt><dd className="font-bold">{formatMoney(o.total)}</dd></div>
        </dl>
      )}
      <p className="mt-10 text-center text-xs">Thank you for shopping with {store.name}!</p>
    </div>
  );
}

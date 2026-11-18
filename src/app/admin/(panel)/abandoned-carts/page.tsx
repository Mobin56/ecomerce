import { requireAdminPage } from "@/server/auth/admin";
import { db } from "@/server/db";
import { abandonedCartStats } from "@/server/abandoned-carts";
import { PageHeader, Card, Table, Stat } from "@/components/admin/ui";
import { formatMoney } from "@/core/money";
import { effectivePrice } from "@/core/pricing";
import { maskPhone } from "@/core/phone";
import { pct, formatDateTime } from "@/lib/utils";

export default async function AbandonedCarts() {
  await requireAdminPage("customers.view");
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [stats, carts] = await Promise.all([
    abandonedCartStats(since),
    db.cart.findMany({
      where: { status: { in: ["ABANDONED", "RECOVERED"] }, abandonedAt: { gte: since } },
      orderBy: { lastActivityAt: "desc" },
      take: 100,
      include: { customer: { select: { name: true, phone: true } }, recoveries: true, items: { include: { variant: { include: { product: { select: { name: true, regularPrice: true, salePrice: true } } } } } } },
    }),
  ]);
  return (
    <>
      <PageHeader title="Abandoned carts" description="Last 30 days. Reminders are sent by the abandoned-carts job (see Settings → Abandoned cart)." />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Abandoned" value={stats.abandoned} />
        <Stat label="Recovered" value={stats.recovered} tone="good" />
        <Stat label="Recovery rate" value={pct(stats.recoveryRate)} />
        <Stat label="Open cart value" value={formatMoney(stats.openValue)} />
      </div>
      <Card padded={false}>
        <Table head={["Customer", "Products", "Value", "Last activity", "Reminders", "Status"]} empty={!carts.length}>
          {carts.map((c) => {
            const value = c.items.reduce((s, i) => s + effectivePrice({ productRegular: i.variant.product.regularPrice, productSale: i.variant.product.salePrice, variantPrice: i.variant.price, variantSale: i.variant.salePrice }).price * i.quantity, 0);
            const phone = c.contactPhone ?? c.customer?.phone;
            return (
              <tr key={c.id}>
                <td>{c.contactName ?? c.customer?.name ?? "Guest"}<p className="text-xs text-muted">{phone ? maskPhone(phone) : "no contact"}</p></td>
                <td className="max-w-xs text-xs">{c.items.map((i) => `${i.variant.product.name} ×${i.quantity}`).join(", ")}</td>
                <td className="tabular-nums">{formatMoney(value)}</td>
                <td className="text-xs text-muted">{formatDateTime(c.lastActivityAt)}</td>
                <td className="text-xs">{c.recoveries.filter((r) => r.status === "SENT").length} sent</td>
                <td className="text-xs font-semibold">{c.status}</td>
              </tr>
            );
          })}
        </Table>
      </Card>
    </>
  );
}

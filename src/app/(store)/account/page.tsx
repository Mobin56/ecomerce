import type { Metadata } from "next";
import Link from "next/link";
import { getCustomerSession } from "@/server/auth/session";
import { db } from "@/server/db";
import { AccountAuth, LogoutButton } from "@/components/store/account-auth";
import { formatMoney } from "@/core/money";
import { STATUS_LABELS } from "@/core/order-status";
import { formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/misc";

export const metadata: Metadata = { title: "My account", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const session = await getCustomerSession();
  if (!session) {
    return (
      <div className="container-x max-w-md py-12">
        <h1 className="font-display text-3xl font-semibold">My account</h1>
        <p className="mt-2 text-sm text-muted">No account needed to order — but signing in lets you see all your orders and check out faster.</p>
        <AccountAuth />
      </div>
    );
  }
  const orders = await db.order.findMany({ where: { customerId: session.customer.id }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, number: true, total: true, status: true, createdAt: true, _count: { select: { items: true } } } });
  return (
    <div className="container-x max-w-3xl py-12">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl font-semibold">Hi, {session.customer.name ?? "there"}</h1>
        <LogoutButton />
      </div>
      <p className="mt-1 text-sm text-muted">{session.customer.phone}</p>
      <h2 className="mt-10 text-lg font-semibold">Your orders</h2>
      {orders.length === 0 ? <p className="mt-3 text-sm text-muted">No orders yet. <Link href="/products" className="underline">Start shopping</Link></p> : (
        <ul className="mt-4 divide-y divide-line rounded-[var(--radius-card)] border border-line bg-card">
          {orders.map((o) => (
            <li key={o.id} className="flex items-center justify-between gap-3 p-4 text-sm">
              <div><p className="font-semibold">#{o.number}</p><p className="text-xs text-muted">{formatDate(o.createdAt)} · {o._count.items} items</p></div>
              <Badge tone={o.status === "DELIVERED" ? "success" : o.status === "CANCELLED" || o.status === "RETURNED" ? "danger" : "neutral"}>{STATUS_LABELS[o.status]}</Badge>
              <span className="font-semibold tabular-nums">{formatMoney(o.total)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

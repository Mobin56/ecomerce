import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { requireAdminPage } from "@/server/auth/admin";
import { db } from "@/server/db";
import { PageHeader, Card, Table, Pager, inputCls } from "@/components/admin/ui";
import { formatDateTime } from "@/lib/utils";
import { formatMoney } from "@/core/money";

function show(v: unknown): string {
  if (v === null || v === undefined) return "";
  return Object.entries(v as Record<string, unknown>).map(([k, x]) => `${k}: ${/price|cost|amount/i.test(k) && typeof x === "number" ? formatMoney(x) : typeof x === "object" ? JSON.stringify(x) : String(x)}`).join(", ");
}

export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ q?: string; user?: string; page?: string }> }) {
  await requireAdminPage("activity.view");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const where: Prisma.AdminActivityLogWhereInput = { ...(sp.q ? { action: { contains: sp.q } } : {}), ...(sp.user ? { userId: sp.user } : {}) };
  const [total, logs, users] = await Promise.all([db.adminActivityLog.count({ where }), db.adminActivityLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * 50, take: 50, include: { user: { select: { name: true } } } }), db.user.findMany({ select: { id: true, name: true } })]);
  const href = (entityType: string | null, id: string | null) => (id && entityType === "order" ? `/admin/orders/${id}` : id && entityType === "product" ? `/admin/products/${id}` : id && entityType === "customer" ? `/admin/customers/${id}` : null);
  return (
    <>
      <PageHeader title="Activity log" description="Every admin login, change and customer-data access." />
      <form className="mb-4 flex gap-2"><input name="q" defaultValue={sp.q} placeholder="Action (e.g. price_changed)" className={`${inputCls} max-w-xs`} /><select name="user" defaultValue={sp.user ?? ""} className={`${inputCls} max-w-[200px]`}><option value="">All users</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select><button className="h-10 rounded-lg bg-ink px-4 text-sm font-semibold text-white">Filter</button></form>
      <Card padded={false}>
        <Table head={["Time", "Admin", "Action", "Entity", "Old", "New", "IP"]} empty={!logs.length}>
          {logs.map((l) => {
            const link = href(l.entityType, l.entityId);
            return (
              <tr key={l.id}>
                <td className="whitespace-nowrap text-xs">{formatDateTime(l.createdAt)}</td>
                <td>{l.user?.name ?? "system"}</td>
                <td className="font-mono text-xs">{l.action}</td>
                <td className="text-xs">{link ? <Link href={link} className="underline">{l.entityType}</Link> : l.entityType}</td>
                <td className="max-w-xs text-xs text-muted">{show(l.before)}</td>
                <td className="max-w-xs text-xs">{show(l.after)}</td>
                <td className="text-xs text-muted">{l.ip}</td>
              </tr>
            );
          })}
        </Table>
        <Pager page={page} pages={Math.ceil(total / 50)} href={(p) => `/admin/activity?${new URLSearchParams({ ...sp, page: String(p) } as Record<string, string>)}`} />
      </Card>
    </>
  );
}

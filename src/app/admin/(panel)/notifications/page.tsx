import { requireAdminPage } from "@/server/auth/admin";
import { db } from "@/server/db";
import { PageHeader, Card } from "@/components/admin/ui";
import { ActionForm, SubmitButton } from "@/components/admin/action-form";
import { formatDateTime } from "@/lib/utils";
import { markNotificationsReadAction } from "../../_actions/content";

export default async function NotificationsPage() {
  await requireAdminPage();
  const items = await db.notification.findMany({ where: { audience: "ADMIN" }, orderBy: { createdAt: "desc" }, take: 100 });
  return (
    <>
      <PageHeader title="Notifications" actions={<ActionForm action={markNotificationsReadAction}><SubmitButton variant="outline">Mark all read</SubmitButton></ActionForm>} />
      <Card padded={false}>
        <ul className="divide-y divide-line">
          {items.length === 0 && <li className="p-6 text-sm text-muted">No notifications.</li>}
          {items.map((n) => {
            const orderId = (n.data as { orderId?: string } | null)?.orderId;
            return (
              <li key={n.id} className={`flex gap-3 px-5 py-3 text-sm ${n.readAt ? "" : "bg-accent-soft/40"}`}>
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.readAt ? "bg-transparent" : "bg-accent"}`} />
                <div className="flex-1"><p className="font-semibold">{n.title}</p><p className="text-ink-soft">{n.body}</p>{orderId && <a href={`/admin/orders/${orderId}`} className="text-xs underline">Open order</a>}</div>
                <time className="whitespace-nowrap text-xs text-muted">{formatDateTime(n.createdAt)}</time>
              </li>
            );
          })}
        </ul>
      </Card>
    </>
  );
}

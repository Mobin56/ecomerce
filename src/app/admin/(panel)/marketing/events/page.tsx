import type { TrackingStatus } from "@prisma/client";
import Link from "next/link";
import { requireAdminPage } from "@/server/auth/admin";
import { db } from "@/server/db";
import { PageHeader, Card, Table } from "@/components/admin/ui";
import { ActionForm, SubmitButton } from "@/components/admin/action-form";
import { Badge } from "@/components/ui/misc";
import { formatDateTime } from "@/lib/utils";
import { retryMetaAction } from "../../../_actions/marketing";

export default async function EventLogs({ searchParams }: { searchParams: Promise<{ status?: string; event?: string }> }) {
  await requireAdminPage("marketing.view");
  const sp = await searchParams;
  const logs = await db.metaEventLog.findMany({
    where: { ...(sp.status ? { status: sp.status as TrackingStatus } : {}), ...(sp.event ? { eventName: sp.event } : {}) },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true, eventName: true, eventId: true, status: true, attempts: true, error: true, response: true, createdAt: true, orderId: true },
  });
  return (
    <>
      <PageHeader title="Meta event logs" description="Server-side (CAPI) events. PII is hashed before storage." actions={<ActionForm action={retryMetaAction}><SubmitButton variant="outline">Retry failed</SubmitButton></ActionForm>} />
      <nav className="mb-3 flex flex-wrap gap-1 text-xs">
        {["", "SENT", "FAILED", "SKIPPED", "QUEUED"].map((s) => <Link key={s} href={`/admin/marketing/events?status=${s}`} className={`rounded-full px-3 py-1.5 font-semibold ${(sp.status ?? "") === s ? "bg-ink text-white" : "bg-card"}`}>{s || "All"}</Link>)}
      </nav>
      <Card padded={false}>
        <Table head={["Time", "Event", "Event ID", "Status", "Attempts", "Error / response"]} empty={!logs.length}>
          {logs.map((l) => (
            <tr key={l.id}>
              <td className="whitespace-nowrap text-xs">{formatDateTime(l.createdAt)}</td>
              <td className="font-medium">{l.eventName}{l.orderId && <Link href={`/admin/orders/${l.orderId}`} className="ml-1 text-xs underline">order</Link>}</td>
              <td className="max-w-48 truncate font-mono text-xs">{l.eventId}</td>
              <td><Badge tone={l.status === "SENT" ? "success" : l.status === "FAILED" ? "danger" : "neutral"}>{l.status}</Badge></td>
              <td>{l.attempts}</td>
              <td className="max-w-md text-xs">{l.error ? <span className="text-danger">{l.error}</span> : <code className="text-muted">{JSON.stringify(l.response)?.slice(0, 140)}</code>}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}

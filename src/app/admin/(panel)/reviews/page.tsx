import Link from "next/link";
import type { ReviewStatus } from "@prisma/client";
import { requireAdminPage } from "@/server/auth/admin";
import { db } from "@/server/db";
import { PageHeader, Card } from "@/components/admin/ui";
import { ActionForm, SubmitButton } from "@/components/admin/action-form";
import { Badge, Rating } from "@/components/ui/misc";
import { formatDateTime } from "@/lib/utils";
import { moderateReviewAction } from "../../_actions/content";

export default async function ReviewsAdmin({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireAdminPage("reviews.moderate");
  const { status = "PENDING" } = await searchParams;
  const where = status === "REPORTED" ? { reportCount: { gt: 0 } } : { status: status as ReviewStatus };
  const reviews = await db.review.findMany({ where, orderBy: { createdAt: "desc" }, take: 50, include: { product: { select: { name: true, id: true } }, reports: { take: 3 } } });
  return (
    <>
      <PageHeader title="Reviews" description="Approve, reject and reply. Only approved reviews appear on the store." />
      <nav className="mb-4 flex gap-1">{["PENDING", "APPROVED", "REJECTED", "REPORTED"].map((s) => <Link key={s} href={`/admin/reviews?status=${s}`} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${status === s ? "bg-ink text-white" : "bg-card"}`}>{s}</Link>)}</nav>
      <div className="space-y-3">
        {reviews.length === 0 && <p className="text-sm text-muted">No reviews here.</p>}
        {reviews.map((r) => (
          <Card key={r.id}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2"><Rating value={r.rating} /><strong className="text-sm">{r.authorName}</strong>{r.verifiedPurchase && <Badge tone="success">Verified</Badge>}{r.reportCount > 0 && <Badge tone="danger">{r.reportCount} reports</Badge>}</div>
              <span className="text-xs text-muted">{formatDateTime(r.createdAt)} · <Link href={`/admin/products/${r.product.id}`} className="underline">{r.product.name}</Link></span>
            </div>
            {r.title && <p className="mt-2 font-semibold">{r.title}</p>}
            <p className="mt-1 text-sm">{r.body}</p>
            {r.reports.length > 0 && <ul className="mt-2 text-xs text-danger">{r.reports.map((x) => <li key={x.id}>Report: {x.reason}</li>)}</ul>}
            <ActionForm action={moderateReviewAction} className="mt-3 flex flex-wrap items-end gap-2">
              <input type="hidden" name="id" value={r.id} />
              <input name="reply" defaultValue={r.adminReply ?? ""} placeholder="Public reply (optional)" className="h-9 min-w-64 flex-1 rounded-lg border border-line px-3 text-sm" aria-label="Reply" />
              <select name="status" defaultValue={r.status === "PENDING" ? "APPROVED" : r.status} className="h-9 rounded-lg border border-line px-2 text-sm" aria-label="Status"><option value="APPROVED">Approve</option><option value="REJECTED">Reject</option><option value="PENDING">Pending</option></select>
              <SubmitButton>Save</SubmitButton>
            </ActionForm>
          </Card>
        ))}
      </div>
    </>
  );
}

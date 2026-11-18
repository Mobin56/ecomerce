import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/misc";
import { STATUS_LABELS, type OrderStatus } from "@/core/order-status";

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className, padded = true }: { title?: string; actions?: ReactNode; children: ReactNode; className?: string; padded?: boolean }) {
  return (
    <section className={cn("rounded-[var(--radius-card)] border border-line bg-card", className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          {title && <h2 className="text-sm font-semibold">{title}</h2>}
          {actions}
        </div>
      )}
      <div className={padded ? "p-5" : undefined}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-card p-4">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className={cn("mt-1 text-2xl font-semibold tabular-nums", tone === "good" && "text-success", tone === "bad" && "text-danger")}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </div>
  );
}

export function Table({ head, children, empty }: { head: ReactNode[]; children: ReactNode; empty?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
          <tr>{head.map((h, i) => <th key={i} scope="col" className="whitespace-nowrap px-4 py-3 font-semibold">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-line [&_td]:px-4 [&_td]:py-3">{children}</tbody>
      </table>
      {empty && <p className="px-4 py-10 text-center text-sm text-muted">Nothing here yet.</p>}
    </div>
  );
}

export function Pager({ page, pages, href }: { page: number; pages: number; href: (p: number) => string }) {
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-end gap-2 px-4 py-3 text-sm">
      {page > 1 && <Link href={href(page - 1)} className="rounded-lg border border-line px-3 py-1.5">Prev</Link>}
      <span className="text-muted">{page} / {pages}</span>
      {page < pages && <Link href={href(page + 1)} className="rounded-lg border border-line px-3 py-1.5">Next</Link>}
    </div>
  );
}

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const tone = status === "DELIVERED" ? "success" : ["CANCELLED", "RETURNED", "FAILED_DELIVERY"].includes(status) ? "danger" : status === "PENDING" ? "warn" : "neutral";
  return <Badge tone={tone}>{STATUS_LABELS[status]}</Badge>;
}

export function RiskBadge({ level }: { level: "LOW" | "MEDIUM" | "HIGH" }) {
  return <Badge tone={level === "HIGH" ? "danger" : level === "MEDIUM" ? "warn" : "success"}>{level} RISK</Badge>;
}

export function RangeTabs({ current, base }: { current: string; base: string }) {
  const opts = [["today", "Today"], ["7d", "7 days"], ["30d", "30 days"], ["month", "This month"], ["90d", "90 days"]];
  return (
    <div className="flex flex-wrap gap-1 rounded-full bg-line/50 p-1">
      {opts.map(([k, l]) => (
        <Link key={k} href={`${base}?range=${k}`} aria-current={current === k} className={cn("rounded-full px-3 py-1.5 text-xs font-semibold", current === k ? "bg-card shadow-sm" : "text-muted")}>{l}</Link>
      ))}
    </div>
  );
}

export const inputCls = "h-10 w-full rounded-lg border border-line bg-card px-3 text-sm focus:border-ink focus:outline-none";
export const labelCls = "mb-1 block text-xs font-semibold text-ink-soft";

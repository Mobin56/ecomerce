import type { ReactNode } from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/core/money";

export function Badge({ children, tone = "neutral", className }: { children: ReactNode; tone?: "neutral" | "accent" | "success" | "warn" | "danger" | "ink"; className?: string }) {
  const tones = {
    neutral: "bg-line/60 text-ink-soft",
    accent: "bg-accent-soft text-accent",
    success: "bg-success-soft text-success",
    warn: "bg-warn-soft text-warn",
    danger: "bg-danger-soft text-danger",
    ink: "bg-ink text-white",
  };
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold", tones[tone], className)}>{children}</span>;
}

export function Price({ price, compareAt, size = "md", className }: { price: number; compareAt?: number | null; size?: "sm" | "md" | "lg"; className?: string }) {
  const s = { sm: "text-[15px]", md: "text-base", lg: "text-2xl sm:text-3xl" }[size];
  return (
    <span className={cn("inline-flex items-baseline gap-2", className)}>
      <span className={cn("font-bold tabular-nums", s, compareAt ? "text-accent" : "text-ink")}>{formatMoney(price)}</span>
      {compareAt ? <s className="text-sm tabular-nums text-muted">{formatMoney(compareAt)}</s> : null}
    </span>
  );
}

export function Rating({ value, count, size = 14, className }: { value: number; count?: number; size?: number; className?: string }) {
  const rounded = Math.round(value * 2) / 2;
  return (
    <span className={cn("inline-flex items-center gap-1", className)} aria-label={`Rated ${value.toFixed(1)} out of 5${count !== undefined ? `, ${count} reviews` : ""}`}>
      <span className="flex" aria-hidden>
        {[1, 2, 3, 4, 5].map((i) => (
          <Star key={i} width={size} height={size} className={i <= rounded ? "fill-ink text-ink" : i - 0.5 === rounded ? "fill-ink/50 text-ink" : "fill-line text-line"} />
        ))}
      </span>
      {count !== undefined && <span className="text-xs text-muted">({count})</span>}
    </span>
  );
}

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-[var(--radius-card)] border border-dashed border-line bg-card px-6 py-14 text-center">
      {icon && <div className="text-muted">{icon}</div>}
      <h2 className="text-lg font-semibold">{title}</h2>
      {body && <p className="max-w-sm text-sm text-muted">{body}</p>}
      {action}
    </div>
  );
}

export function SectionHeading({ title, subtitle, action }: { title: string; subtitle?: string | null; action?: ReactNode }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4 sm:mb-7">
      <div>
        <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-muted sm:text-[15px]">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

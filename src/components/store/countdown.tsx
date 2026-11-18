"use client";

import { useEffect, useState } from "react";

export function Countdown({ endsAt }: { endsAt: string }) {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setLeft(Math.max(0, new Date(endsAt).getTime() - Date.now()));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [endsAt]);
  if (left === null) return <span className="inline-block h-8 w-36" aria-hidden />;
  const s = Math.floor(left / 1000);
  const parts = [Math.floor(s / 86400), Math.floor((s % 86400) / 3600), Math.floor((s % 3600) / 60), s % 60];
  const labels = ["d", "h", "m", "s"];
  return (
    <span className="inline-flex gap-1.5 tabular-nums" aria-label="Time left">
      {parts.map((p, i) => (i === 0 && p === 0 ? null : <span key={i} className="rounded-lg bg-ink px-2 py-1 text-sm font-semibold text-white">{String(p).padStart(2, "0")}{labels[i]}</span>))}
    </span>
  );
}

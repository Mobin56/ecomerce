"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { inputCls } from "./ui";

const EXAMPLES = ["Which product sold the most this month?", "Which campaign has the best ROAS?", "What is my net profit this week?", "Which products are low in stock?"];

export function AiAssistant() {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<{ q: string; a: string; mode?: string }[]>([]);
  const [busy, setBusy] = useState(false);
  async function ask(question: string) {
    if (!question.trim()) return;
    setBusy(true);
    setQ("");
    try {
      const r = await fetch("/api/admin/ai/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question }) });
      const j = await r.json();
      setItems((x) => [{ q: question, a: r.ok ? j.answer : j.error?.message ?? "Failed", mode: j.mode }, ...x]);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <form onSubmit={(e) => { e.preventDefault(); void ask(q); }} className="flex gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about sales, profit, campaigns, stock…" className={inputCls} aria-label="Question" />
        <Button type="submit" size="sm" loading={busy}>Ask</Button>
      </form>
      <div className="mt-3 flex flex-wrap gap-2">{EXAMPLES.map((e) => <button key={e} onClick={() => ask(e)} className="rounded-full bg-paper px-3 py-1.5 text-xs hover:bg-line">{e}</button>)}</div>
      <div className="mt-6 space-y-4">
        {items.map((it, i) => (
          <div key={i} className="rounded-xl border border-line p-4">
            <p className="text-sm font-semibold">{it.q}</p>
            <p className="mt-2 whitespace-pre-line text-sm text-ink-soft">{it.a}</p>
            {it.mode && <p className="mt-2 text-[11px] text-muted">{it.mode === "ai" ? "AI with database tools" : "Rule-based (no AI key)"}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

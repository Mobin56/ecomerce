"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function CsvImport() {
  const [res, setRes] = useState<{ created: number; updated: number; errors: { sku: string; error: string }[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="mt-4 space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr(null);
        const r = await fetch("/api/admin/products/import", { method: "POST", body: new FormData(e.currentTarget) });
        const j = await r.json();
        setBusy(false);
        if (!r.ok) setErr(j.error?.message ?? "Import failed");
        else setRes(j);
      }}
    >
      <input type="file" name="file" accept=".csv,text/csv" required className="block text-sm" />
      <Button type="submit" loading={busy} size="sm">Import</Button>
      {err && <p role="alert" className="text-sm text-danger">{err}</p>}
      {res && (
        <div className="rounded-lg bg-paper p-3 text-sm">
          <p><strong>{res.created}</strong> created, <strong>{res.updated}</strong> updated, <strong>{res.errors.length}</strong> errors.</p>
          {res.errors.length > 0 && <ul className="mt-2 list-disc pl-5 text-xs text-danger">{res.errors.slice(0, 50).map((e) => <li key={e.sku}>{e.sku}: {e.error}</li>)}</ul>}
        </div>
      )}
    </form>
  );
}

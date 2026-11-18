"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api-client";

export function ManualPaymentForm({ orderId, phone }: { orderId: string; phone: string }) {
  const [trxId, setTrx] = useState("");
  const [state, setState] = useState<{ loading?: boolean; msg?: string; ok?: boolean }>({});
  if (state.ok) return <p className="mt-3 rounded-lg bg-success-soft p-3 text-sm text-success">{state.msg}</p>;
  return (
    <form
      className="mt-3 flex gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setState({ loading: true });
        try {
          const r = await api<{ message: string }>("/api/payments/manual", { body: { orderId, phone, trxId } });
          setState({ ok: true, msg: r.message });
        } catch (err) {
          setState({ msg: err instanceof ApiError ? err.message : "Try again" });
        }
      }}
    >
      <label htmlFor="trx" className="sr-only">Transaction ID</label>
      <input id="trx" value={trxId} onChange={(e) => setTrx(e.target.value)} placeholder="e.g. 9BG7XK2L1M" required className="h-11 min-w-0 flex-1 rounded-full border border-line px-4 text-sm uppercase" />
      <Button type="submit" loading={state.loading}>Submit</Button>
      {state.msg && <p role="alert" className="text-xs text-danger">{state.msg}</p>}
    </form>
  );
}

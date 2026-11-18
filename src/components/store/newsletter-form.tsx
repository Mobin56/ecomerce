"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";

export function NewsletterForm({ dark }: { dark?: boolean }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<{ ok?: boolean; msg?: string; loading?: boolean }>({});
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setState({ loading: true });
        try {
          const r = await api<{ message: string }>("/api/newsletter", { body: { email } });
          setState({ ok: true, msg: r.message });
          setEmail("");
        } catch (err) {
          setState({ ok: false, msg: err instanceof ApiError ? err.message : "Try again" });
        }
      }}
    >
      <label htmlFor="nl-email" className="text-sm font-medium">Get offers & new arrivals</label>
      <div className="mt-2 flex gap-2">
        <input id="nl-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" className={`h-11 min-w-0 flex-1 rounded-full border px-4 text-sm outline-none focus:border-ink ${dark ? "border-white/20 bg-white/10 text-white placeholder:text-white/60" : "border-line bg-paper"}`} />
        <Button type="submit" loading={state.loading} variant={dark ? "secondary" : "primary"}>Subscribe</Button>
      </div>
      {state.msg && <p role="status" className={`mt-2 text-xs ${state.ok ? "text-success" : "text-danger"}`}>{state.msg}</p>}
    </form>
  );
}

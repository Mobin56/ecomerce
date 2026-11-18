"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { api, ApiError } from "@/lib/api-client";

export function AccountAuth() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [state, setState] = useState<{ loading?: boolean; error?: string; fields?: Record<string, string[] | undefined> }>({});
  return (
    <div className="mt-8">
      <div className="mb-6 grid grid-cols-2 rounded-full bg-line/60 p-1 text-sm font-semibold" role="tablist">
        {(["login", "register"] as const).map((m) => (
          <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)} className={`h-10 rounded-full ${mode === m ? "bg-card shadow-sm" : "text-muted"}`}>{m === "login" ? "Sign in" : "Create account"}</button>
        ))}
      </div>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = Object.fromEntries(new FormData(e.currentTarget));
          setState({ loading: true });
          try {
            await api(`/api/account/${mode}`, { body: f });
            router.refresh();
          } catch (err) {
            setState({ error: err instanceof ApiError ? err.message : "Try again", fields: err instanceof ApiError ? err.fields : undefined });
          }
        }}
      >
        {mode === "register" && <Field label="Name" htmlFor="a-name" error={state.fields?.name?.[0]}><Input id="a-name" name="name" autoComplete="name" required /></Field>}
        <Field label="Mobile number" htmlFor="a-phone" error={state.fields?.phone?.[0]}><Input id="a-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" required /></Field>
        {mode === "register" && <Field label="Email (optional)" htmlFor="a-email"><Input id="a-email" name="email" type="email" autoComplete="email" /></Field>}
        <Field label="Password" htmlFor="a-pass" error={state.fields?.password?.[0]} hint={mode === "register" ? "At least 8 characters" : undefined}><Input id="a-pass" name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={mode === "register" ? 8 : 1} /></Field>
        {state.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
        <Button type="submit" className="w-full" loading={state.loading}>{mode === "login" ? "Sign in" : "Create account"}</Button>
      </form>
    </div>
  );
}

export function LogoutButton() {
  const router = useRouter();
  return <Button variant="outline" size="sm" onClick={async () => { await api("/api/account/logout", { method: "POST" }); router.refresh(); }}>Sign out</Button>;
}

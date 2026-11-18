"use client";

import { useActionState, useEffect, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { ActionResult } from "@/server/errors";
import { useToast } from "@/components/ui/toast";
import { Button, type ButtonProps } from "@/components/ui/button";

/**
 * Wraps a server action in a <form>, shows a toast with the result and
 * field errors. Server actions re-check permissions; nothing is trusted here.
 */
export function ActionForm({ action, children, className, onSuccess, confirm }: { action: (prev: ActionResult<unknown> | null, fd: FormData) => Promise<ActionResult<unknown>>; children: ReactNode; className?: string; onSuccess?: (r: ActionResult<unknown>) => void; confirm?: string }) {
  const [state, formAction] = useActionState(action, null);
  const toast = useToast();
  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      if (state.message) toast(state.message);
      onSuccess?.(state);
    } else toast(state.error, "error");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  return (
    <form action={formAction} className={className} onSubmit={(e) => { if (confirm && !window.confirm(confirm)) e.preventDefault(); }}>
      {children}
      {state && !state.ok && state.fields && (
        <ul role="alert" className="mt-3 space-y-1 rounded-lg bg-danger-soft p-3 text-xs text-danger">
          {Object.entries(state.fields).map(([k, v]) => v?.length ? <li key={k}><strong>{k}</strong>: {v[0]}</li> : null)}
        </ul>
      )}
    </form>
  );
}

export function SubmitButton({ children, ...props }: ButtonProps) {
  const { pending } = useFormStatus();
  return <Button type="submit" size="sm" loading={pending} {...props}>{children}</Button>;
}

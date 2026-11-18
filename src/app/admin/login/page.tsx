import { redirect } from "next/navigation";
import { getAdminSession } from "@/server/auth/session";
import { ActionForm, SubmitButton } from "@/components/admin/action-form";
import { inputCls, labelCls } from "@/components/admin/ui";
import { loginAction } from "../_actions/auth";

export const dynamic = "force-dynamic";

export default async function AdminLogin() {
  const s = await getAdminSession();
  if (s?.twoFactorOk || (s && !s.totpEnabled)) redirect("/admin");
  return (
    <main className="grid min-h-dvh place-items-center bg-paper p-6">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-card p-7 shadow-[var(--shadow-soft)]">
        <h1 className="text-xl font-semibold">Admin sign in</h1>
        <ActionForm action={loginAction} className="mt-6 space-y-4">
          <div><label htmlFor="email" className={labelCls}>Email</label><input id="email" name="email" type="email" autoComplete="username" required className={inputCls} /></div>
          <div><label htmlFor="password" className={labelCls}>Password</label><input id="password" name="password" type="password" autoComplete="current-password" required className={inputCls} /></div>
          <SubmitButton className="w-full" size="md">Sign in</SubmitButton>
        </ActionForm>
      </div>
    </main>
  );
}

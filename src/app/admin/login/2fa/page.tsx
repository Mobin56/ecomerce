import { redirect } from "next/navigation";
import { getAdminSession } from "@/server/auth/session";
import { beginTotpSetup } from "@/server/auth/login";
import { ActionForm, SubmitButton } from "@/components/admin/action-form";
import { inputCls } from "@/components/admin/ui";
import { verify2faAction } from "../../_actions/auth";

export const dynamic = "force-dynamic";

export default async function TwoFactorPage() {
  const s = await getAdminSession();
  if (!s) redirect("/admin/login");
  if (s.twoFactorOk) redirect("/admin");
  const setup = s.totpEnabled ? null : await beginTotpSetup();
  return (
    <main className="grid min-h-dvh place-items-center bg-paper p-6">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-card p-7">
        <h1 className="text-xl font-semibold">Two-factor verification</h1>
        {setup ? (
          <div className="mt-3 space-y-2 text-sm text-ink-soft">
            <p>Add this account to Google Authenticator, Authy or 1Password using the setup key:</p>
            <code className="block break-all rounded-lg bg-paper p-3 text-xs">{setup.secret}</code>
            <p className="text-xs text-muted">Or open this link on your phone: <a className="break-all underline" href={setup.otpauth}>otpauth link</a></p>
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted">Enter the 6-digit code from your authenticator app.</p>
        )}
        <ActionForm action={verify2faAction} className="mt-5 space-y-4">
          <input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required className={`${inputCls} text-center text-lg tracking-[0.4em]`} aria-label="Authentication code" />
          <SubmitButton className="w-full" size="md">Verify</SubmitButton>
        </ActionForm>
      </div>
    </main>
  );
}

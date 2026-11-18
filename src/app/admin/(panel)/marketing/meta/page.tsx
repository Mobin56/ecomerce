import { requireAdminPage } from "@/server/auth/admin";
import { getSettings } from "@/server/settings";
import { maskSecret } from "@/server/crypto";
import { db } from "@/server/db";
import { PageHeader, Card, Stat, inputCls, labelCls } from "@/components/admin/ui";
import { ActionForm, SubmitButton } from "@/components/admin/action-form";
import { saveMetaSettingsAction, testMetaEventAction } from "../../../_actions/marketing";

export default async function MetaTracking() {
  await requireAdminPage("marketing.manage");
  const meta = await getSettings("meta");
  const since = new Date(Date.now() - 86_400_000);
  const stats = await db.metaEventLog.groupBy({ by: ["status"], where: { createdAt: { gte: since } }, _count: true });
  const n = (s: string) => stats.find((x) => x.status === s)?._count ?? 0;
  return (
    <>
      <PageHeader title="Meta tracking" description="Pixel (browser) + Conversions API (server) with shared event IDs for deduplication." />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="CAPI sent (24h)" value={n("SENT")} tone="good" />
        <Stat label="CAPI failed (24h)" value={n("FAILED")} tone={n("FAILED") ? "bad" : undefined} />
        <Stat label="Skipped duplicates (24h)" value={n("SKIPPED")} />
      </div>
      <Card title="Settings">
        <ActionForm action={saveMetaSettingsAction} className="grid max-w-2xl gap-3">
          <div><label className={labelCls} htmlFor="pixelId">Pixel ID</label><input id="pixelId" name="pixelId" defaultValue={meta.pixelId} inputMode="numeric" className={inputCls} /></div>
          <div><label className={labelCls} htmlFor="tok">CAPI access token</label><input id="tok" name="capiAccessToken" type="password" autoComplete="off" placeholder={meta.capiAccessToken ? `Saved (${maskSecret(meta.capiAccessToken)}) — leave blank to keep` : "Paste token from Events Manager"} className={inputCls} /><p className="mt-1 text-xs text-muted">Encrypted at rest. Never sent to the browser.</p></div>
          <div><label className={labelCls} htmlFor="tec">Test event code</label><input id="tec" name="testEventCode" defaultValue={meta.testEventCode} placeholder="TEST12345 (remove in production)" className={inputCls} /></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="pixelEnabled" defaultChecked={meta.pixelEnabled} /> Enable browser Pixel</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="capiEnabled" defaultChecked={meta.capiEnabled} /> Enable Conversions API</label>
          <div><SubmitButton>Save</SubmitButton></div>
        </ActionForm>
        <ActionForm action={testMetaEventAction} className="mt-4 border-t border-line pt-4"><SubmitButton variant="outline">Send test event</SubmitButton></ActionForm>
      </Card>
      <Card title="Events tracked" className="mt-4">
        <p className="text-sm text-ink-soft">PageView, ViewContent, Search, AddToCart, InitiateCheckout, AddPaymentInfo, AddToWishlist (browser + server) and Purchase (server on order/payment verification, browser on the thank-you page — both with <code>event_id = purchase.&lt;orderId&gt;</code>). Each event includes content_ids, value, currency (BDT), quantity and order_id where applicable; customer email/phone/name are SHA-256 hashed.</p>
      </Card>
    </>
  );
}

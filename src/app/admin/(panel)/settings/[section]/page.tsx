import { notFound } from "next/navigation";
import { requireAdminPage } from "@/server/auth/admin";
import { getSettings, SETTINGS_SCHEMAS, SECRET_FIELDS, type SettingsKey } from "@/server/settings";
import { maskSecret } from "@/server/crypto";
import { db } from "@/server/db";
import { allProviders } from "@/server/payments/registry";
import { allCouriers } from "@/server/courier/providers";
import { PageHeader, Card, inputCls, labelCls } from "@/components/admin/ui";
import { ActionForm, SubmitButton } from "@/components/admin/action-form";
import { formatMoney } from "@/core/money";
import { saveSettingsAction, saveZoneAction } from "../../../_actions/system";

const MONEY = new Set(["vipMinSpent", "highValueMinAov"]);
const NULLABLE_MONEY = new Set(["freeShippingThreshold", "codMaxAmount"]);
const label = (k: string) => k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());

export default async function SettingsSection({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!(section in SETTINGS_SCHEMAS)) notFound();
  const key = section as SettingsKey;
  await requireAdminPage(key === "payment" ? "payments.manage" : key === "google" ? "marketing.manage" : "settings.manage");
  const value = (await getSettings(key)) as Record<string, unknown>;
  const secrets = SECRET_FIELDS[key] ?? [];
  const kinds: Record<string, string> = {};
  const fields = Object.entries(value).map(([k, v]) => {
    const kind = NULLABLE_MONEY.has(k) ? "nullable_money" : MONEY.has(k) ? "money" : typeof v === "boolean" ? "boolean" : typeof v === "number" ? "number" : Array.isArray(v) && v.every((x) => typeof x === "string") ? "array" : v !== null && typeof v === "object" ? "json" : "string";
    kinds[k] = kind;
    const name = `f.${k}`;
    let input;
    if (kind === "boolean") input = <label className="flex items-center gap-2 text-sm"><input type="checkbox" name={name} defaultChecked={Boolean(v)} /> {label(k)}</label>;
    else if (kind === "json") input = <textarea id={name} name={name} defaultValue={JSON.stringify(v, null, 2)} className={`${inputCls} h-40 py-2 font-mono text-xs`} />;
    else if (secrets.includes(k)) input = <input id={name} name={name} type="password" autoComplete="off" placeholder={v ? `Saved (${maskSecret(String(v))}) — leave blank to keep` : ""} className={inputCls} />;
    else if (kind === "money" || kind === "nullable_money") input = <input id={name} name={name} type="number" step="0.01" min={0} defaultValue={v === null ? "" : Number(v) / 100} placeholder={kind === "nullable_money" ? "empty = disabled" : undefined} className={inputCls} />;
    else if (kind === "number") input = <input id={name} name={name} type="number" step="any" defaultValue={Number(v)} className={inputCls} />;
    else input = <input id={name} name={name} defaultValue={Array.isArray(v) ? v.join(", ") : String(v ?? "")} className={inputCls} />;
    return (
      <div key={k} className={kind === "json" ? "sm:col-span-2" : undefined}>
        {kind !== "boolean" && <label htmlFor={name} className={labelCls}>{label(k)}{kind === "array" ? " (comma separated)" : kind.includes("money") ? " (৳)" : ""}</label>}
        {input}
      </div>
    );
  });

  const providers = key === "payment" ? await allProviders() : [];
  const couriers = key === "courier" ? allCouriers() : [];
  const zones = key === "shipping" ? await db.shippingZone.findMany({ orderBy: { position: "asc" } }) : [];

  return (
    <>
      <PageHeader title={`${label(key)} settings`} />
      {key === "payment" && <Card title="Gateways" className="mb-4"><ul className="grid gap-1 text-sm sm:grid-cols-2">{providers.map((p) => <li key={p.key}><code>{p.key}</code> — {p.label}: {p.isConfigured ? <span className="text-success">configured</span> : <span className="text-muted">needs credentials / number</span>}</li>)}</ul><p className="mt-2 text-xs text-muted">Add keys to “Enabled” to show them at checkout. Gateway API secrets are set in environment variables.</p></Card>}
      {key === "courier" && <Card title="Couriers" className="mb-4"><ul className="grid gap-1 text-sm sm:grid-cols-2">{couriers.map((c) => <li key={c.key}><code>{c.key}</code> — {c.label}: {c.isConfigured ? <span className="text-success">configured</span> : <span className="text-muted">add API keys in .env</span>}</li>)}</ul></Card>}
      <Card>
        <ActionForm action={saveSettingsAction} className="grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="section" value={key} />
          <input type="hidden" name="__kinds" value={JSON.stringify(kinds)} />
          {fields}
          <div className="sm:col-span-2"><SubmitButton>Save</SubmitButton></div>
        </ActionForm>
      </Card>
      {key === "shipping" && (
        <Card title="Delivery zones" className="mt-4">
          <p className="mb-3 text-xs text-muted">A district listed in a zone uses that zone; others use the zone with no districts (fallback). “Charge” is what the customer pays; “courier cost” is what you pay (for profit).</p>
          <div className="space-y-2">
            {[...zones, undefined].map((z, i) => (
              <ActionForm key={z?.id ?? `new-${i}`} action={saveZoneAction} className="grid gap-2 rounded-lg border border-line p-3 sm:grid-cols-[110px_1fr_2fr_90px_90px_90px_60px_60px_60px_auto_auto]">
                {z && <input type="hidden" name="id" value={z.id} />}
                <input name="key" defaultValue={z?.key} placeholder="key" required className={inputCls} aria-label="Key" />
                <input name="name" defaultValue={z?.name} placeholder="Inside Dhaka" required className={inputCls} aria-label="Name" />
                <input name="districts" defaultValue={z?.districts.join(", ")} placeholder="Dhaka, Gazipur (empty = all others)" className={inputCls} aria-label="Districts" />
                <input name="charge" type="number" step="0.01" defaultValue={z ? z.charge / 100 : ""} placeholder="Charge" className={inputCls} aria-label="Charge" />
                <input name="courierCost" type="number" step="0.01" defaultValue={z ? z.courierCost / 100 : ""} placeholder="Cost" className={inputCls} aria-label="Courier cost" />
                <input name="returnCost" type="number" step="0.01" defaultValue={z ? z.returnCost / 100 : 0} placeholder="Return" className={inputCls} aria-label="Return cost" />
                <input name="minDays" type="number" defaultValue={z?.minDays ?? 1} className={inputCls} aria-label="Min days" />
                <input name="maxDays" type="number" defaultValue={z?.maxDays ?? 3} className={inputCls} aria-label="Max days" />
                <input name="position" type="number" defaultValue={z?.position ?? zones.length} className={inputCls} aria-label="Position" />
                <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="isActive" defaultChecked={z?.isActive ?? true} />On</label>
                <SubmitButton variant={z ? "outline" : "primary"}>{z ? "Save" : "Add"}</SubmitButton>
              </ActionForm>
            ))}
          </div>
          {zones.length > 0 && <p className="mt-3 text-xs text-muted">Current: {zones.map((z) => `${z.name} ${formatMoney(z.charge)}`).join(" · ")}</p>}
        </Card>
      )}
    </>
  );
}

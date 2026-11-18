import { requireAdminPage } from "@/server/auth/admin";
import { db } from "@/server/db";
import { PageHeader, Card, inputCls, labelCls } from "@/components/admin/ui";
import { ActionForm, SubmitButton } from "@/components/admin/action-form";
import { Badge } from "@/components/ui/misc";
import { saveSectionAction, moveSectionAction, deleteSectionAction } from "../../../_actions/content";

const TYPES = ["announcement", "hero", "categories", "flash_sale", "best_sellers", "new_arrivals", "trending", "recommended", "promo", "reviews", "faq", "newsletter"];
const HELP: Record<string, string> = {
  announcement: '{"link": "/products?sort=newest"} — the title is the bar text',
  hero: '{"slides":[{"image":"https://…","mobileImage":"https://…","heading":"…","subheading":"…","ctaLabel":"Shop now","ctaHref":"/products"}]}',
  categories: '{"categoryIds": []}  (empty = all top-level)',
  flash_sale: '{"productIds": [], "endsAt": "2026-12-31T23:59:00+06:00", "limit": 10}  (empty ids = products on sale)',
  best_sellers: '{"productIds": [], "limit": 10}  (empty = auto by sales)',
  new_arrivals: '{"limit": 10}',
  trending: '{"limit": 10}  (auto by views)',
  recommended: '{"productIds": []}  (empty = featured products)',
  promo: '{"image":"https://…","ctaLabel":"Shop","ctaHref":"/category/…"}',
  reviews: "{}",
  faq: '{"group":"general"}',
  newsletter: "{}",
};

export default async function HomepageAdmin() {
  await requireAdminPage("content.manage");
  const sections = await db.homepageSection.findMany({ orderBy: { position: "asc" } });
  const form = (s?: (typeof sections)[number]) => (
    <ActionForm action={saveSectionAction} className="grid gap-2 sm:grid-cols-4">
      {s && <input type="hidden" name="id" value={s.id} />}
      <div><label className={labelCls}>Type</label><select name="type" defaultValue={s?.type ?? "best_sellers"} className={inputCls}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select></div>
      <div><label className={labelCls}>Title</label><input name="title" defaultValue={s?.title ?? ""} className={inputCls} /></div>
      <div><label className={labelCls}>Subtitle</label><input name="subtitle" defaultValue={s?.subtitle ?? ""} className={inputCls} /></div>
      <div><label className={labelCls}>Position</label><input name="position" type="number" defaultValue={s?.position ?? sections.length} className={inputCls} /></div>
      <div className="sm:col-span-4"><label className={labelCls}>Config (JSON) — {HELP[s?.type ?? "best_sellers"]}</label><textarea name="config" defaultValue={JSON.stringify(s?.config ?? {}, null, 2)} className={`${inputCls} h-32 py-2 font-mono text-xs`} /></div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="enabled" defaultChecked={s?.enabled ?? true} /> Enabled</label>
      <div className="sm:col-span-3"><SubmitButton>{s ? "Save section" : "Add section"}</SubmitButton></div>
    </ActionForm>
  );
  return (
    <>
      <PageHeader title="Homepage" description="Enable/disable, reorder and configure every homepage section. Changes are live within a minute." />
      <div className="space-y-2">
        {sections.map((s, i) => (
          <details key={s.id} className="rounded-xl border border-line bg-card">
            <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 text-sm">
              <span className="flex items-center gap-2"><span className="w-6 text-muted">{i + 1}.</span><strong>{s.title || s.type}</strong><Badge>{s.type}</Badge>{!s.enabled && <Badge tone="warn">Hidden</Badge>}</span>
              <span className="flex gap-1">
                <ActionForm action={moveSectionAction}><input type="hidden" name="id" value={s.id} /><input type="hidden" name="dir" value="up" /><button className="rounded px-2 hover:bg-paper" aria-label="Move up" disabled={i === 0}>↑</button></ActionForm>
                <ActionForm action={moveSectionAction}><input type="hidden" name="id" value={s.id} /><input type="hidden" name="dir" value="down" /><button className="rounded px-2 hover:bg-paper" aria-label="Move down" disabled={i === sections.length - 1}>↓</button></ActionForm>
              </span>
            </summary>
            <div className="border-t border-line p-4">
              {form(s)}
              <ActionForm action={deleteSectionAction} confirm="Delete this section?" className="mt-3"><input type="hidden" name="id" value={s.id} /><SubmitButton variant="ghost" className="text-danger">Delete</SubmitButton></ActionForm>
            </div>
          </details>
        ))}
      </div>
      <Card title="Add section" className="mt-4">{form()}</Card>
    </>
  );
}

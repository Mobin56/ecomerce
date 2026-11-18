import { requireAdminPage } from "@/server/auth/admin";
import { campaignAnalytics, rangeFromPreset } from "@/server/analytics";
import { db } from "@/server/db";
import { PageHeader, Card, Table, RangeTabs, inputCls, labelCls } from "@/components/admin/ui";
import { ActionForm, SubmitButton } from "@/components/admin/action-form";
import { formatMoney } from "@/core/money";
import { can } from "@/core/rbac";
import { pct } from "@/lib/utils";
import { saveCampaignAction, saveAdSpendAction } from "../../../_actions/marketing";

export default async function CampaignsPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const admin = await requireAdminPage("marketing.view");
  const { range = "30d" } = await searchParams;
  const [rows, campaigns] = await Promise.all([campaignAnalytics(rangeFromPreset(range)), db.campaign.findMany({ orderBy: { createdAt: "desc" } })]);
  const manage = can(admin, "marketing.manage");
  return (
    <>
      <PageHeader title="Campaign analytics" description="Funnel from first-party events, orders by UTM attribution, profit after ad spend." actions={<RangeTabs current={range} base="/admin/marketing/campaigns" />} />
      <Card padded={false}>
        <Table head={["Campaign", "Visitors", "Product views", "Add to cart", "Checkout", "Orders", "Revenue", "Ad spend", "Cost / order", "Conv. rate", "ROAS", "Profit"]} empty={!rows.length}>
          {rows.map((c) => (
            <tr key={c.utmCampaign}>
              <td><p className="font-medium">{c.name}</p><p className="text-xs text-muted">{c.platform} · utm_campaign={c.utmCampaign}</p></td>
              <td>{c.visitors.toLocaleString()}</td>
              <td>{c.productViews.toLocaleString()}</td>
              <td>{c.addToCart.toLocaleString()}</td>
              <td>{c.checkouts.toLocaleString()}</td>
              <td className="font-semibold">{c.orders}</td>
              <td className="tabular-nums">{formatMoney(c.revenue)}</td>
              <td className="tabular-nums">{formatMoney(c.adSpend)}</td>
              <td className="tabular-nums">{c.costPerOrder !== null ? formatMoney(c.costPerOrder) : "—"}</td>
              <td>{pct(c.conversionRate, 2)}</td>
              <td className="font-semibold">{c.roas !== null ? `${c.roas.toFixed(2)}x` : "—"}</td>
              <td className={`tabular-nums font-semibold ${c.profit < 0 ? "text-danger" : "text-success"}`}>{formatMoney(c.profit)}</td>
            </tr>
          ))}
        </Table>
      </Card>
      {manage && (
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <Card title="Add / update campaign">
            <ActionForm action={saveCampaignAction} className="grid gap-2 sm:grid-cols-2">
              <div><label className={labelCls}>Name</label><input name="name" required className={inputCls} placeholder="Summer Sale" /></div>
              <div><label className={labelCls}>utm_campaign value</label><input name="utmCampaign" required className={inputCls} placeholder="summer_sale" /></div>
              <div><label className={labelCls}>Platform</label><select name="platform" className={inputCls}>{["facebook", "google", "tiktok", "email", "sms", "other"].map((p) => <option key={p}>{p}</option>)}</select></div>
              <div><label className={labelCls}>Budget ৳</label><input name="budget" type="number" min={0} className={inputCls} /></div>
              <div><label className={labelCls}>Start</label><input name="startsAt" type="date" className={inputCls} /></div>
              <div><label className={labelCls}>End</label><input name="endsAt" type="date" className={inputCls} /></div>
              <div className="sm:col-span-2"><SubmitButton>Save campaign</SubmitButton></div>
            </ActionForm>
          </Card>
          <Card title="Record daily ad spend">
            <ActionForm action={saveAdSpendAction} className="grid gap-2 sm:grid-cols-2">
              <div className="sm:col-span-2"><label className={labelCls}>Campaign</label><select name="campaignId" required className={inputCls}>{campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
              <div><label className={labelCls}>Date</label><input name="date" type="date" required className={inputCls} defaultValue={new Date().toISOString().slice(0, 10)} /></div>
              <div><label className={labelCls}>Amount ৳</label><input name="amount" type="number" step="0.01" min={0} required className={inputCls} /></div>
              <div><label className={labelCls}>Impressions</label><input name="impressions" type="number" min={0} className={inputCls} /></div>
              <div><label className={labelCls}>Clicks</label><input name="clicks" type="number" min={0} className={inputCls} /></div>
              <div className="sm:col-span-2"><SubmitButton>Save spend</SubmitButton><p className="mt-2 text-xs text-muted">Tip: use the same utm_campaign in your Meta ad URL parameters, e.g. <code>utm_source=facebook&amp;utm_medium=paid&amp;utm_campaign=summer_sale&amp;utm_content={"{{ad.name}}"}</code></p></div>
            </ActionForm>
          </Card>
        </div>
      )}
    </>
  );
}

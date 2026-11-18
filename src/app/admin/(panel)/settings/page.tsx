import Link from "next/link";
import { requireAdminPage } from "@/server/auth/admin";
import { PageHeader } from "@/components/admin/ui";

const SECTIONS: [string, string, string][] = [
  ["general", "General", "Maintenance mode, timezone"],
  ["store", "Store", "Name, contact, social, policies summary"],
  ["payment", "Payment", "Enabled methods, fees, COD limit, wallet numbers"],
  ["shipping", "Shipping", "Delivery zones, charges, free-delivery threshold"],
  ["courier", "Courier", "Default courier, automation"],
  ["tax", "Tax", "VAT settings"],
  ["meta", "Meta", "Pixel & Conversions API"],
  ["google", "Google", "GA4, GTM, Google Ads"],
  ["seo", "SEO", "Default titles and descriptions"],
  ["email", "Email", "Sender details"],
  ["sms", "SMS", "Sender ID / API key"],
  ["whatsapp", "WhatsApp", "Cloud API"],
  ["notifications", "Notifications", "Admin alerts and customer messages"],
  ["security", "Security", "2FA policy, sessions, lockout"],
  ["risk", "Fraud / risk", "Signal weights, thresholds, auto-reject"],
  ["segments", "Customer segments", "VIP / high-value / inactive rules"],
  ["abandonedCart", "Abandoned cart", "Reminder timing and channels"],
  ["ai", "AI", "AI modules and tone"],
  ["system", "System", "Backups and maintenance info"],
];

export default async function SettingsIndex() {
  await requireAdminPage("settings.manage");
  return (
    <>
      <PageHeader title="Settings" description="Business configuration lives here — nothing is hardcoded." />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.map(([k, t, d]) => (
          <Link key={k} href={k === "meta" ? "/admin/marketing/meta" : `/admin/settings/${k}`} className="rounded-[var(--radius-card)] border border-line bg-card p-4 hover:border-ink">
            <p className="font-semibold">{t}</p>
            <p className="mt-1 text-sm text-muted">{d}</p>
          </Link>
        ))}
      </div>
    </>
  );
}

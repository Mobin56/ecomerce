import { requireAdminPage } from "@/server/auth/admin";
import { getSettings } from "@/server/settings";
import { db } from "@/server/db";
import { ADMIN_NAV, can } from "@/core/rbac";
import { AdminShell } from "@/components/admin/shell";
import { logoutAction } from "../_actions/auth";

export const dynamic = "force-dynamic";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdminPage();
  const [store, unread] = await Promise.all([getSettings("store"), db.notification.count({ where: { audience: "ADMIN", readAt: null } })]);
  const nav = ADMIN_NAV.filter((n) => can(admin, n.permission)).map(({ href, label, group }) => ({ href, label, group }));
  return (
    <AdminShell nav={nav} user={{ name: admin.name, role: admin.roleName }} unread={unread} storeName={store.name} logout={logoutAction}>
      {children}
    </AdminShell>
  );
}

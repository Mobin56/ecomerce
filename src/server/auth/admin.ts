import "server-only";
import { redirect } from "next/navigation";
import { can, type PermissionKey } from "@/core/rbac";
import { getAdminSession, type AdminPrincipal } from "./session";
import { AppError, forbidden, unauthorized } from "../errors";
import { getSettings } from "../settings";

/**
 * Use in admin pages (redirects) — `await requireAdminPage("orders.view")`.
 * Every admin page and server action calls one of these; the layout check
 * alone is not trusted because server actions can be invoked directly.
 */
export async function requireAdminPage(permission?: PermissionKey): Promise<AdminPrincipal> {
  const admin = await getAdminSession();
  if (!admin) redirect("/admin/login");
  if (await needs2fa(admin)) redirect("/admin/login/2fa");
  if (permission && !can(admin, permission)) redirect("/admin/forbidden");
  return admin;
}

/** Use in server actions and API routes — throws AppError. */
export async function requireAdmin(permission?: PermissionKey): Promise<AdminPrincipal> {
  const admin = await getAdminSession();
  if (!admin) throw unauthorized();
  if (await needs2fa(admin)) throw new AppError("2FA_REQUIRED", "Two-factor verification required.", 401);
  if (permission && !can(admin, permission)) throw forbidden();
  return admin;
}

async function needs2fa(admin: AdminPrincipal): Promise<boolean> {
  if (admin.totpEnabled) return !admin.twoFactorOk;
  const sec = await getSettings("security");
  // When 2FA is mandatory but not yet set up, the user is sent to set it up.
  return sec.require2faForAdmins && !admin.twoFactorOk;
}

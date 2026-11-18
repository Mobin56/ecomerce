"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { action, AppError, type ActionResult } from "@/server/errors";
import { requireAdmin } from "@/server/auth/admin";
import { logActivity, diff } from "@/server/activity";
import { db } from "@/server/db";
import { hashPassword } from "@/server/auth/password";
import { saveSettings, SETTINGS_SCHEMAS, SECRET_FIELDS, type SettingsKey } from "@/server/settings";
import { adminUserSchema } from "@/validation";
import { ALL_PERMISSIONS } from "@/core/rbac";

type R = Promise<ActionResult<unknown>>;

export async function saveUserAction(_: unknown, fd: FormData): R {
  return action(async () => {
    const admin = await requireAdmin("users.manage");
    const id = (fd.get("id") as string) || undefined;
    const raw = Object.fromEntries(fd);
    const u = adminUserSchema.parse({ ...raw, isActive: raw.isActive === "on" });
    const role = await db.role.findUniqueOrThrow({ where: { id: u.roleId } });
    if (role.key === "SUPER_ADMIN" && admin.roleKey !== "SUPER_ADMIN") throw new AppError("FORBIDDEN", "Only a Super Admin can assign Super Admin.");
    if (id === admin.id && !u.isActive) throw new AppError("SELF", "You cannot deactivate yourself.");
    if (!id && !u.password) throw new AppError("PASSWORD", "Set a password (min 10 characters) for new users.");
    const data = { name: u.name, email: u.email, roleId: u.roleId, isActive: u.isActive, ...(u.password ? { passwordHash: await hashPassword(u.password) } : {}) };
    const saved = id ? await db.user.update({ where: { id }, data }) : await db.user.create({ data: data as typeof data & { passwordHash: string } });
    if (id && (!u.isActive || u.password)) await db.session.deleteMany({ where: { userId: id } }); // force re-login
    await logActivity({ userId: admin.id, action: id ? "user.updated" : "user.created", entityType: "user", entityId: saved.id, after: { email: saved.email, role: role.key, isActive: saved.isActive, passwordChanged: Boolean(u.password) } });
    revalidatePath("/admin/users");
  }, "User saved");
}

export async function saveRolePermissionsAction(_: unknown, fd: FormData): R {
  return action(async () => {
    const admin = await requireAdmin("users.manage");
    const roleId = z.string().parse(fd.get("roleId"));
    const role = await db.role.findUniqueOrThrow({ where: { id: roleId }, include: { permissions: { include: { permission: true } } } });
    if (role.key === "SUPER_ADMIN") throw new AppError("LOCKED", "Super Admin always has every permission.");
    const keys = fd.getAll("perm").map(String).filter((k) => (ALL_PERMISSIONS as string[]).includes(k));
    const perms = await db.permission.findMany({ where: { key: { in: keys } } });
    await db.$transaction([db.rolePermission.deleteMany({ where: { roleId } }), db.rolePermission.createMany({ data: perms.map((p) => ({ roleId, permissionId: p.id })) })]);
    await logActivity({ userId: admin.id, action: "role.permissions_changed", entityType: "role", entityId: roleId, before: { permissions: role.permissions.map((p) => p.permission.key) }, after: { permissions: keys } });
    revalidatePath("/admin/users");
  }, "Permissions updated");
}

/** Generic settings form: fields arrive as `f.<name>`; booleans as checkboxes, arrays as comma lists, numbers as numbers, JSON fields as text. */
export async function saveSettingsAction(_: unknown, fd: FormData): R {
  return action(async () => {
    const section = z.enum(Object.keys(SETTINGS_SCHEMAS) as [SettingsKey, ...SettingsKey[]]).parse(fd.get("section"));
    const admin = await requireAdmin(section === "payment" ? "payments.manage" : section === "meta" || section === "google" ? "marketing.manage" : "settings.manage");
    const kinds = JSON.parse(String(fd.get("__kinds") ?? "{}")) as Record<string, "boolean" | "number" | "money" | "array" | "json" | "string" | "nullable_money">;
    const value: Record<string, unknown> = {};
    for (const [k, kind] of Object.entries(kinds)) {
      const v = fd.get(`f.${k}`);
      if (kind === "boolean") value[k] = v === "on";
      else if (kind === "number") value[k] = Number(v);
      else if (kind === "money") value[k] = Math.round(Number(v) * 100);
      else if (kind === "nullable_money") value[k] = v === "" || v === null ? null : Math.round(Number(v) * 100);
      else if (kind === "array") value[k] = String(v ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      else if (kind === "json") {
        try {
          value[k] = JSON.parse(String(v ?? "null"));
        } catch {
          throw new AppError("BAD_JSON", `${k} must be valid JSON`);
        }
      } else value[k] = String(v ?? "");
    }
    const { before, after } = await saveSettings(section, value);
    const secrets = SECRET_FIELDS[section] ?? [];
    const strip = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, secrets.includes(k) ? (v ? "••••" : "") : v]));
    const d = diff(strip(before as Record<string, unknown>), strip(after as Record<string, unknown>));
    await logActivity({ userId: admin.id, action: "settings.changed", entityType: "settings", entityId: section, before: d.before, after: d.after });
    revalidatePath("/", "layout");
  }, "Settings saved");
}

export async function saveZoneAction(_: unknown, fd: FormData): R {
  return action(async () => {
    const admin = await requireAdmin("settings.manage");
    const d = z.object({ id: z.string().optional(), key: z.string().regex(/^[a-z0-9_]+$/), name: z.string().min(2), districts: z.string(), charge: z.coerce.number().min(0), courierCost: z.coerce.number().min(0), returnCost: z.coerce.number().min(0), minDays: z.coerce.number().int().min(0), maxDays: z.coerce.number().int().min(0), position: z.coerce.number().int() }).parse(Object.fromEntries(fd));
    const data = { key: d.key, name: d.name, districts: d.districts.split(",").map((s) => s.trim()).filter(Boolean), charge: Math.round(d.charge * 100), courierCost: Math.round(d.courierCost * 100), returnCost: Math.round(d.returnCost * 100), minDays: d.minDays, maxDays: Math.max(d.minDays, d.maxDays), position: d.position, isActive: fd.get("isActive") === "on" };
    if (d.id) await db.shippingZone.update({ where: { id: d.id }, data });
    else await db.shippingZone.create({ data });
    await logActivity({ userId: admin.id, action: "settings.shipping_zone", entityType: "shipping_zone", after: data });
    revalidatePath("/admin/settings/shipping");
  }, "Zone saved");
}

export async function blockCustomerAction(_: unknown, fd: FormData): R {
  return action(async () => {
    const admin = await requireAdmin("customers.update");
    const id = String(fd.get("id"));
    const c = await db.customer.findUniqueOrThrow({ where: { id } });
    await db.customer.update({ where: { id }, data: { isBlocked: !c.isBlocked, notes: (fd.get("notes") as string) ?? c.notes } });
    await logActivity({ userId: admin.id, action: c.isBlocked ? "customer.unblocked" : "customer.blocked", entityType: "customer", entityId: id });
    revalidatePath(`/admin/customers/${id}`);
  }, "Customer updated");
}

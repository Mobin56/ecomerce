import { requireAdminPage } from "@/server/auth/admin";
import { db } from "@/server/db";
import { PageHeader, Card, Table, inputCls, labelCls } from "@/components/admin/ui";
import { ActionForm, SubmitButton } from "@/components/admin/action-form";
import { Badge } from "@/components/ui/misc";
import { PERMISSIONS, type PermissionKey } from "@/core/rbac";
import { formatDateTime } from "@/lib/utils";
import { saveUserAction, saveRolePermissionsAction } from "../../_actions/system";

export default async function UsersPage() {
  await requireAdminPage("users.manage");
  const [users, roles] = await Promise.all([db.user.findMany({ orderBy: { createdAt: "asc" }, include: { role: true } }), db.role.findMany({ orderBy: { name: "asc" }, include: { permissions: { include: { permission: true } } } })]);
  const groups = [...new Set(Object.values(PERMISSIONS).map((p) => p.group))];
  const userForm = (u?: (typeof users)[number]) => (
    <ActionForm action={saveUserAction} className="grid gap-2 sm:grid-cols-5">
      {u && <input type="hidden" name="id" value={u.id} />}
      <div><label className={labelCls}>Name</label><input name="name" defaultValue={u?.name} required className={inputCls} /></div>
      <div><label className={labelCls}>Email</label><input name="email" type="email" defaultValue={u?.email} required className={inputCls} /></div>
      <div><label className={labelCls}>Role</label><select name="roleId" defaultValue={u?.roleId} className={inputCls}>{roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></div>
      <div><label className={labelCls}>{u ? "New password (optional)" : "Password"}</label><input name="password" type="password" minLength={10} autoComplete="new-password" className={inputCls} /></div>
      <div className="flex items-end gap-3"><label className="flex items-center gap-1.5 pb-2 text-sm"><input type="checkbox" name="isActive" defaultChecked={u?.isActive ?? true} /> Active</label><SubmitButton>{u ? "Save" : "Add"}</SubmitButton></div>
    </ActionForm>
  );
  return (
    <>
      <PageHeader title="Admin users & roles" />
      <Card title="Add admin user">{userForm()}</Card>
      <Card padded={false} className="mt-4">
        <Table head={["User", "Role", "2FA", "Last login", "Status", ""]}>
          {users.map((u) => (
            <tr key={u.id}>
              <td>{u.name}<p className="text-xs text-muted">{u.email}</p></td>
              <td>{u.role.name}</td>
              <td>{u.totpEnabled ? <Badge tone="success">On</Badge> : <Badge>Off</Badge>}</td>
              <td className="text-xs text-muted">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "never"}</td>
              <td>{u.isActive ? <Badge tone="success">Active</Badge> : <Badge tone="danger">Disabled</Badge>}</td>
              <td><details><summary className="cursor-pointer text-xs font-semibold">Edit</summary><div className="mt-2 w-[min(900px,80vw)]">{userForm(u)}</div></details></td>
            </tr>
          ))}
        </Table>
      </Card>
      <h2 className="mb-3 mt-8 text-lg font-semibold">Role permissions</h2>
      <div className="space-y-2">
        {roles.map((r) => {
          const has = new Set(r.permissions.map((p) => p.permission.key));
          return (
            <details key={r.id} className="rounded-xl border border-line bg-card">
              <summary className="cursor-pointer px-4 py-3 text-sm"><strong>{r.name}</strong> <span className="text-muted">· {r.key === "SUPER_ADMIN" ? "all permissions" : `${has.size} permissions`}</span></summary>
              <ActionForm action={saveRolePermissionsAction} className="border-t border-line p-4">
                <input type="hidden" name="roleId" value={r.id} />
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {groups.map((g) => (
                    <fieldset key={g}><legend className="mb-1 text-xs font-semibold uppercase text-muted">{g}</legend>
                      {(Object.entries(PERMISSIONS) as [PermissionKey, { group: string; label: string }][]).filter(([, p]) => p.group === g).map(([k, p]) => (
                        <label key={k} className="flex items-center gap-2 py-0.5 text-sm"><input type="checkbox" name="perm" value={k} defaultChecked={r.key === "SUPER_ADMIN" || has.has(k)} disabled={r.key === "SUPER_ADMIN"} />{p.label}</label>
                      ))}
                    </fieldset>
                  ))}
                </div>
                {r.key !== "SUPER_ADMIN" && <SubmitButton className="mt-4">Save permissions</SubmitButton>}
              </ActionForm>
            </details>
          );
        })}
      </div>
    </>
  );
}

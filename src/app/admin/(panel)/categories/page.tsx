import { requireAdminPage } from "@/server/auth/admin";
import { db } from "@/server/db";
import { PageHeader, Card, inputCls, labelCls } from "@/components/admin/ui";
import { ActionForm, SubmitButton } from "@/components/admin/action-form";
import { saveCategoryAction, deleteCategoryAction, saveBrandAction } from "../../_actions/catalog";

export default async function CategoriesPage() {
  await requireAdminPage("categories.manage");
  const [cats, brands] = await Promise.all([
    db.category.findMany({ orderBy: [{ parentId: "asc" }, { position: "asc" }], include: { _count: { select: { products: true } } } }),
    db.brand.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { products: true } } } }),
  ]);
  const parents = cats.filter((c) => !c.parentId);
  const form = (c?: (typeof cats)[number]) => (
    <ActionForm action={saveCategoryAction} className="grid gap-2 sm:grid-cols-6">
      {c && <input type="hidden" name="id" value={c.id} />}
      <div className="sm:col-span-2"><label className={labelCls}>Name</label><input name="name" defaultValue={c?.name} required className={inputCls} /></div>
      <div><label className={labelCls}>Slug</label><input name="slug" defaultValue={c?.slug} className={inputCls} /></div>
      <div><label className={labelCls}>Parent</label><select name="parentId" defaultValue={c?.parentId ?? ""} className={inputCls}><option value="">— top level —</option>{parents.filter((p) => p.id !== c?.id).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
      <div><label className={labelCls}>Position</label><input name="position" type="number" defaultValue={c?.position ?? 0} className={inputCls} /></div>
      <div><label className={labelCls}>Image URL</label><input name="imageUrl" defaultValue={c?.imageUrl ?? ""} className={inputCls} /></div>
      <div className="sm:col-span-3"><label className={labelCls}>SEO title</label><input name="seoTitle" defaultValue={c?.seoTitle ?? ""} className={inputCls} /></div>
      <div className="sm:col-span-3"><label className={labelCls}>SEO description</label><input name="seoDescription" defaultValue={c?.seoDescription ?? ""} className={inputCls} /></div>
      <div className="sm:col-span-5"><label className={labelCls}>Description</label><input name="description" defaultValue={c?.description ?? ""} className={inputCls} /></div>
      <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" name="isActive" defaultChecked={c?.isActive ?? true} /> Active</label>
      <div className="sm:col-span-6"><SubmitButton>{c ? "Save" : "Add category"}</SubmitButton></div>
    </ActionForm>
  );
  return (
    <>
      <PageHeader title="Categories & brands" />
      <Card title="New category">{form()}</Card>
      <div className="mt-4 space-y-2">
        {cats.map((c) => (
          <details key={c.id} className={`rounded-xl border border-line bg-card ${c.parentId ? "ml-6" : ""}`}>
            <summary className="flex cursor-pointer items-center justify-between px-4 py-3 text-sm"><span><strong>{c.name}</strong> <span className="text-muted">/{c.slug} · {c._count.products} products{!c.isActive && " · hidden"}</span></span><span className="text-xs text-muted">Edit</span></summary>
            <div className="border-t border-line p-4">
              {form(c)}
              <ActionForm action={deleteCategoryAction} confirm={`Delete ${c.name}?`} className="mt-3"><input type="hidden" name="id" value={c.id} /><SubmitButton variant="ghost" className="text-danger">Delete category</SubmitButton></ActionForm>
            </div>
          </details>
        ))}
      </div>
      <Card title="Brands" className="mt-6">
        <ActionForm action={saveBrandAction} className="mb-4 flex gap-2"><input name="name" placeholder="Brand name" required className={inputCls} /><input name="logoUrl" placeholder="Logo URL (optional)" className={inputCls} /><SubmitButton>Save</SubmitButton></ActionForm>
        <ul className="flex flex-wrap gap-2 text-sm">{brands.map((b) => <li key={b.id} className="rounded-full bg-paper px-3 py-1">{b.name} <span className="text-muted">({b._count.products})</span></li>)}</ul>
      </Card>
    </>
  );
}

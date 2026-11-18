import { requireAdminPage } from "@/server/auth/admin";
import { db } from "@/server/db";
import { PageHeader, Card, inputCls, labelCls } from "@/components/admin/ui";
import { ActionForm, SubmitButton } from "@/components/admin/action-form";
import { savePageAction, saveFaqAction, saveBlogPostAction } from "../../../_actions/content";

export default async function PagesAdmin() {
  await requireAdminPage("content.manage");
  const [pages, faqs, posts] = await Promise.all([db.page.findMany({ orderBy: { slug: "asc" } }), db.faq.findMany({ orderBy: [{ group: "asc" }, { position: "asc" }] }), db.blogPost.findMany({ orderBy: { createdAt: "desc" }, take: 30 })]);
  const pageForm = (p?: (typeof pages)[number]) => (
    <ActionForm action={savePageAction} className="grid gap-2 sm:grid-cols-2">
      {p && <input type="hidden" name="id" value={p.id} />}
      <div><label className={labelCls}>Slug</label><input name="slug" defaultValue={p?.slug} required className={inputCls} placeholder="return-policy" /></div>
      <div><label className={labelCls}>Title</label><input name="title" defaultValue={p?.title} required className={inputCls} /></div>
      <div className="sm:col-span-2"><label className={labelCls}>Content (HTML: p, h2, h3, ul, li, a, strong)</label><textarea name="content" defaultValue={p?.content} className={`${inputCls} h-56 py-2 font-mono text-xs`} /></div>
      <div><label className={labelCls}>SEO title</label><input name="seoTitle" defaultValue={p?.seoTitle ?? ""} className={inputCls} /></div>
      <div><label className={labelCls}>SEO description</label><input name="seoDescription" defaultValue={p?.seoDescription ?? ""} className={inputCls} /></div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isPublished" defaultChecked={p?.isPublished ?? true} /> Published</label>
      <div><SubmitButton>Save page</SubmitButton></div>
    </ActionForm>
  );
  return (
    <>
      <PageHeader title="Pages, FAQ & blog" description="About, Contact, Privacy, Terms, Return & Shipping policies — all editable." />
      <div className="space-y-2">
        {pages.map((p) => (
          <details key={p.id} className="rounded-xl border border-line bg-card"><summary className="cursor-pointer px-4 py-3 text-sm"><strong>{p.title}</strong> <span className="text-muted">/pages/{p.slug}{!p.isPublished && " · draft"}</span></summary><div className="border-t border-line p-4">{pageForm(p)}</div></details>
        ))}
      </div>
      <Card title="New page" className="mt-4">{pageForm()}</Card>
      <Card title="FAQ" className="mt-6">
        <div className="space-y-2">
          {[...faqs, undefined].map((f, i) => (
            <ActionForm key={f?.id ?? `new-${i}`} action={saveFaqAction} className="grid gap-2 rounded-lg border border-line p-3 sm:grid-cols-[1fr_2fr_100px_70px_auto_auto]">
              {f && <input type="hidden" name="id" value={f.id} />}
              <input name="question" defaultValue={f?.question} placeholder="Question" required className={inputCls} aria-label="Question" />
              <input name="answer" defaultValue={f?.answer} placeholder="Answer" required className={inputCls} aria-label="Answer" />
              <input name="group" defaultValue={f?.group ?? "general"} className={inputCls} aria-label="Group" />
              <input name="position" type="number" defaultValue={f?.position ?? faqs.length} className={inputCls} aria-label="Position" />
              <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="isActive" defaultChecked={f?.isActive ?? true} />Active</label>
              <SubmitButton variant={f ? "outline" : "primary"}>{f ? "Save" : "Add"}</SubmitButton>
            </ActionForm>
          ))}
        </div>
      </Card>
      <Card title="Blog / journal" className="mt-6">
        {[...posts, undefined].map((p, i) => (
          <details key={p?.id ?? `new-${i}`} className="mb-2 rounded-lg border border-line" open={!p && posts.length === 0}>
            <summary className="cursor-pointer px-3 py-2 text-sm">{p ? <><strong>{p.title}</strong> <span className="text-muted">{p.publishedAt ? "published" : "draft"}</span></> : <strong>+ New post</strong>}</summary>
            <ActionForm action={saveBlogPostAction} className="grid gap-2 border-t border-line p-3 sm:grid-cols-2">
              {p && <input type="hidden" name="id" value={p.id} />}
              <input name="title" defaultValue={p?.title} placeholder="Title" required className={inputCls} aria-label="Title" />
              <input name="slug" defaultValue={p?.slug} placeholder="slug" required className={inputCls} aria-label="Slug" />
              <input name="coverUrl" defaultValue={p?.coverUrl ?? ""} placeholder="Cover image URL" className={inputCls} aria-label="Cover" />
              <input name="excerpt" defaultValue={p?.excerpt ?? ""} placeholder="Excerpt" className={inputCls} aria-label="Excerpt" />
              <textarea name="content" defaultValue={p?.content} className={`${inputCls} h-40 py-2 font-mono text-xs sm:col-span-2`} aria-label="Content" />
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="publish" defaultChecked={Boolean(p?.publishedAt)} /> Published</label>
              <SubmitButton>Save post</SubmitButton>
            </ActionForm>
          </details>
        ))}
      </Card>
    </>
  );
}

"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Sparkles, Trash2, Upload, X } from "lucide-react";
import { ActionForm, SubmitButton } from "./action-form";
import { inputCls, labelCls } from "./ui";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import type { ActionResult } from "@/server/errors";

type Opt = { id: string; name: string };
type Variant = { id?: string; sku: string; title: string; options: Record<string, string>; price: string; salePrice: string; costPrice: string; stock: string; weightGrams: string; imageUrl: string; isActive: boolean };
export type ProductFormValue = {
  id?: string;
  name: string; slug: string; sku: string; barcode: string; shortDescription: string; description: string;
  brandId: string; categoryId: string; subcategoryId: string; tags: string;
  regularPrice: string; salePrice: string; costPrice: string; lowStockThreshold: string;
  weightGrams: string; lengthCm: string; widthCm: string; heightCm: string; videoUrl: string; warranty: string;
  status: string; isFeatured: boolean; seoTitle: string; seoDescription: string; seoKeywords: string;
  images: { url: string; alt: string }[];
  attributes: { name: string; value: string }[];
  optionNames: string[];
  optionValues: Record<string, string>;
  variants: Variant[];
};

export function emptyProduct(): ProductFormValue {
  return {
    name: "", slug: "", sku: "", barcode: "", shortDescription: "", description: "", brandId: "", categoryId: "", subcategoryId: "", tags: "",
    regularPrice: "", salePrice: "", costPrice: "", lowStockThreshold: "5", weightGrams: "", lengthCm: "", widthCm: "", heightCm: "", videoUrl: "", warranty: "",
    status: "DRAFT", isFeatured: false, seoTitle: "", seoDescription: "", seoKeywords: "", images: [], attributes: [], optionNames: [], optionValues: {},
    variants: [{ sku: "", title: "Default", options: {}, price: "", salePrice: "", costPrice: "", stock: "0", weightGrams: "", imageUrl: "", isActive: true }],
  };
}

const num = (s: string) => (s.trim() === "" ? null : Number(s));

export function ProductForm({ initial, categories, brands, action, aiEnabled }: { initial: ProductFormValue; categories: (Opt & { parentId: string | null })[]; brands: Opt[]; action: (p: ActionResult<unknown> | null, fd: FormData) => Promise<ActionResult<unknown>>; aiEnabled: boolean }) {
  const [v, setV] = useState(initial);
  const [uploading, setUploading] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const toast = useToast();
  const set = <K extends keyof ProductFormValue>(k: K, val: ProductFormValue[K]) => setV((p) => ({ ...p, [k]: val }));
  const field = (k: keyof ProductFormValue) => ({ value: String(v[k] ?? ""), onChange: (e: { target: { value: string } }) => set(k, e.target.value as never) });

  const payload = useMemo(() => JSON.stringify({
    name: v.name, slug: v.slug, sku: v.sku, barcode: v.barcode || null, shortDescription: v.shortDescription || null, description: v.description || null,
    brandId: v.brandId || null, categoryId: v.categoryId || null, subcategoryId: v.subcategoryId || null,
    tags: v.tags.split(",").map((t) => t.trim()).filter(Boolean),
    regularPrice: v.regularPrice, salePrice: v.salePrice, costPrice: v.costPrice || 0, lowStockThreshold: v.lowStockThreshold,
    weightGrams: v.weightGrams, lengthCm: num(v.lengthCm), widthCm: num(v.widthCm), heightCm: num(v.heightCm), videoUrl: v.videoUrl || null, warranty: v.warranty || null,
    optionNames: v.optionNames, status: v.status, isFeatured: v.isFeatured, seoTitle: v.seoTitle || null, seoDescription: v.seoDescription || null,
    seoKeywords: v.seoKeywords.split(",").map((t) => t.trim()).filter(Boolean),
    images: v.images, attributes: v.attributes.filter((a) => a.name && a.value),
    variants: v.variants.map((x) => ({ id: x.id, sku: x.sku || `${v.sku}-${Object.values(x.options).join("-") || "DEFAULT"}`.toUpperCase().replace(/\s+/g, ""), title: x.title, options: x.options, price: x.price, salePrice: x.salePrice, costPrice: x.costPrice, stock: x.stock || 0, weightGrams: x.weightGrams, imageUrl: x.imageUrl || null, isActive: x.isActive })),
  }), [v]);

  /** Cartesian product of option values → variants, preserving existing rows (stock/prices). */
  function generateVariants() {
    const names = v.optionNames.filter(Boolean);
    const lists = names.map((n) => (v.optionValues[n] ?? "").split(",").map((s) => s.trim()).filter(Boolean));
    if (!names.length || lists.some((l) => !l.length)) return toast("Add values for every option first", "error");
    let combos: Record<string, string>[] = [{}];
    names.forEach((n, i) => (combos = combos.flatMap((c) => lists[i]!.map((val) => ({ ...c, [n]: val })))));
    if (combos.length > 200) return toast("Too many combinations (max 200)", "error");
    const existing = new Map(v.variants.map((x) => [JSON.stringify(x.options), x]));
    set("variants", combos.map((options) => existing.get(JSON.stringify(options)) ?? { sku: `${v.sku}-${Object.values(options).join("-")}`.toUpperCase().replace(/\s+/g, ""), title: Object.values(options).join(" / "), options, price: "", salePrice: "", costPrice: "", stock: "0", weightGrams: "", imageUrl: "", isActive: true }));
  }

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const r = await fetch("/api/admin/upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contentType: file.type, size: file.size, folder: "products" }) });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error?.message ?? "Upload failed");
        const put = await fetch(j.uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
        if (!put.ok) throw new Error("Upload to storage failed");
        setV((p) => ({ ...p, images: [...p.images, { url: j.publicUrl, alt: p.name }] }));
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "Upload failed", "error");
    } finally {
      setUploading(false);
    }
  }

  async function aiWrite() {
    if (!v.name) return toast("Enter a product name first", "error");
    setAiBusy(true);
    try {
      const r = await fetch("/api/admin/ai/product-writer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: v.name, info: [v.shortDescription, v.description.replace(/<[^>]+>/g, " "), ...v.attributes.map((a) => `${a.name}: ${a.value}`)].filter(Boolean).join("\n") || v.name, category: categories.find((c) => c.id === v.categoryId)?.name }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error?.message ?? "AI failed");
      setV((p) => ({ ...p, shortDescription: j.shortDescription, description: j.description, seoTitle: j.seoTitle, seoDescription: j.metaDescription }));
      await navigator.clipboard?.writeText(j.socialCaption).catch(() => undefined);
      toast("Draft generated — review before saving. Social caption copied.");
    } catch (e) {
      toast(e instanceof Error ? e.message : "AI failed", "error");
    } finally {
      setAiBusy(false);
    }
  }

  const parents = categories.filter((c) => !c.parentId);
  const subs = categories.filter((c) => c.parentId === v.categoryId);
  const updVariant = (i: number, patch: Partial<Variant>) => set("variants", v.variants.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <ActionForm action={action} className="grid gap-4 xl:grid-cols-[1fr_340px]">
      <input type="hidden" name="payload" value={payload} />
      {v.id && <input type="hidden" name="id" value={v.id} />}
      <div className="space-y-4">
        <Section title="Basics" actions={aiEnabled && <Button type="button" size="sm" variant="outline" loading={aiBusy} onClick={aiWrite}><Sparkles size={14} /> AI write</Button>}>
          <div className="grid gap-3 sm:grid-cols-2">
            <L label="Name" id="name"><input id="name" required className={inputCls} {...field("name")} /></L>
            <L label="Slug (auto if empty)" id="slug"><input id="slug" className={inputCls} {...field("slug")} placeholder="premium-cotton-t-shirt" /></L>
            <L label="Product SKU" id="sku"><input id="sku" required className={inputCls} {...field("sku")} /></L>
            <L label="Barcode" id="barcode"><input id="barcode" className={inputCls} {...field("barcode")} /></L>
          </div>
          <L label="Short description" id="sd"><textarea id="sd" className={`${inputCls} h-16 py-2`} {...field("shortDescription")} maxLength={500} /></L>
          <L label="Full description (HTML: p, ul, li, strong, h3)" id="desc"><textarea id="desc" className={`${inputCls} h-48 py-2 font-mono text-xs`} {...field("description")} /></L>
        </Section>

        <Section title="Images & video">
          <div className="flex flex-wrap gap-3">
            {v.images.map((img, i) => (
              <div key={img.url} className="group relative h-24 w-24 overflow-hidden rounded-lg border border-line bg-paper">
                <Image src={img.url} alt="" fill sizes="96px" className="object-cover" />
                {i === 0 && <span className="absolute left-1 top-1 rounded bg-ink px-1 text-[10px] text-white">Main</span>}
                <div className="absolute inset-x-0 bottom-0 flex justify-between bg-ink/60 p-1 opacity-0 group-hover:opacity-100">
                  <button type="button" onClick={() => i > 0 && set("images", v.images.map((x, j) => (j === i - 1 ? v.images[i]! : j === i ? v.images[i - 1]! : x)))} aria-label="Move left" className="text-white"><ArrowUp size={14} className="-rotate-90" /></button>
                  <button type="button" onClick={() => set("images", v.images.filter((_, j) => j !== i))} aria-label="Remove image" className="text-white"><X size={14} /></button>
                  <button type="button" onClick={() => i < v.images.length - 1 && set("images", v.images.map((x, j) => (j === i + 1 ? v.images[i]! : j === i ? v.images[i + 1]! : x)))} aria-label="Move right" className="text-white"><ArrowDown size={14} className="-rotate-90" /></button>
                </div>
              </div>
            ))}
            <label className="grid h-24 w-24 cursor-pointer place-items-center rounded-lg border border-dashed border-line text-xs text-muted hover:border-ink">
              {uploading ? "Uploading…" : <span className="flex flex-col items-center gap-1"><Upload size={16} />Upload</span>}
              <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple className="sr-only" onChange={(e) => upload(e.target.files)} />
            </label>
          </div>
          <div className="mt-3 flex gap-2">
            <input id="imgurl" placeholder="…or paste an https:// image URL" className={inputCls} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); const t = e.currentTarget; if (/^https:\/\//.test(t.value)) { set("images", [...v.images, { url: t.value, alt: v.name }]); t.value = ""; } } }} />
          </div>
          <L label="Video URL (mp4, loaded only when tapped)" id="video"><input id="video" className={inputCls} {...field("videoUrl")} /></L>
        </Section>

        <Section title="Variants">
          <div className="space-y-2">
            {v.optionNames.map((n, i) => (
              <div key={i} className="grid grid-cols-[140px_1fr_auto] gap-2">
                <input aria-label="Option name" placeholder="Size" value={n} className={inputCls} onChange={(e) => { const names = [...v.optionNames]; const old = names[i]!; names[i] = e.target.value; const vals = { ...v.optionValues, [e.target.value]: v.optionValues[old] ?? "" }; set("optionNames", names); set("optionValues", vals); }} />
                <input aria-label="Option values" placeholder="S, M, L, XL" value={v.optionValues[n] ?? ""} className={inputCls} onChange={(e) => set("optionValues", { ...v.optionValues, [n]: e.target.value })} />
                <button type="button" aria-label="Remove option" onClick={() => set("optionNames", v.optionNames.filter((_, j) => j !== i))} className="px-2 text-muted"><Trash2 size={16} /></button>
              </div>
            ))}
            <div className="flex gap-2">
              {v.optionNames.length < 3 && <Button type="button" variant="outline" size="sm" onClick={() => set("optionNames", [...v.optionNames, v.optionNames.length === 0 ? "Size" : v.optionNames.length === 1 ? "Color" : "Material"])}>Add option</Button>}
              {v.optionNames.length > 0 && <Button type="button" size="sm" onClick={generateVariants}>Generate variants</Button>}
            </div>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[820px] text-xs">
              <thead className="text-left text-muted"><tr><th className="p-1">Variant</th><th className="p-1">SKU</th><th className="p-1">Price ৳</th><th className="p-1">Sale ৳</th><th className="p-1">Cost ৳</th><th className="p-1">Stock</th><th className="p-1">Weight g</th><th className="p-1">Image</th><th className="p-1">Active</th></tr></thead>
              <tbody>
                {v.variants.map((x, i) => (
                  <tr key={x.id ?? JSON.stringify(x.options)} className="border-t border-line">
                    <td className="p-1 font-medium">{x.title}</td>
                    <td className="p-1"><input aria-label="Variant SKU" className={`${inputCls} h-8`} value={x.sku} onChange={(e) => updVariant(i, { sku: e.target.value })} /></td>
                    <td className="p-1"><input aria-label="Variant price" type="number" step="0.01" placeholder="base" className={`${inputCls} h-8 w-24`} value={x.price} onChange={(e) => updVariant(i, { price: e.target.value })} /></td>
                    <td className="p-1"><input aria-label="Variant sale price" type="number" step="0.01" placeholder="base" className={`${inputCls} h-8 w-24`} value={x.salePrice} onChange={(e) => updVariant(i, { salePrice: e.target.value })} /></td>
                    <td className="p-1"><input aria-label="Variant cost" type="number" step="0.01" placeholder="base" className={`${inputCls} h-8 w-24`} value={x.costPrice} onChange={(e) => updVariant(i, { costPrice: e.target.value })} /></td>
                    <td className="p-1"><input aria-label="Variant stock" type="number" min={0} className={`${inputCls} h-8 w-20`} value={x.stock} onChange={(e) => updVariant(i, { stock: e.target.value })} /></td>
                    <td className="p-1"><input aria-label="Variant weight" type="number" min={0} className={`${inputCls} h-8 w-20`} value={x.weightGrams} onChange={(e) => updVariant(i, { weightGrams: e.target.value })} /></td>
                    <td className="p-1"><select aria-label="Variant image" className={`${inputCls} h-8 w-28`} value={x.imageUrl} onChange={(e) => updVariant(i, { imageUrl: e.target.value })}><option value="">—</option>{v.images.map((im, k) => <option key={im.url} value={im.url}>Image {k + 1}</option>)}</select></td>
                    <td className="p-1 text-center"><input aria-label="Variant active" type="checkbox" checked={x.isActive} onChange={(e) => updVariant(i, { isActive: e.target.checked })} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-muted">Leave variant price/cost empty to use the product&apos;s base price. Each combination has its own stock.</p>
          </div>
        </Section>

        <Section title="Specifications">
          {v.attributes.map((a, i) => (
            <div key={i} className="mb-2 grid grid-cols-[1fr_2fr_auto] gap-2">
              <input aria-label="Attribute name" placeholder="Material" className={inputCls} value={a.name} onChange={(e) => set("attributes", v.attributes.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              <input aria-label="Attribute value" placeholder="100% cotton" className={inputCls} value={a.value} onChange={(e) => set("attributes", v.attributes.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
              <button type="button" aria-label="Remove" onClick={() => set("attributes", v.attributes.filter((_, j) => j !== i))} className="px-2 text-muted"><Trash2 size={16} /></button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => set("attributes", [...v.attributes, { name: "", value: "" }])}>Add specification</Button>
        </Section>

        <Section title="SEO">
          <L label={`SEO title (${v.seoTitle.length}/70)`} id="st"><input id="st" className={inputCls} maxLength={70} {...field("seoTitle")} /></L>
          <L label={`Meta description (${v.seoDescription.length}/170)`} id="sdesc"><textarea id="sdesc" className={`${inputCls} h-16 py-2`} maxLength={170} {...field("seoDescription")} /></L>
          <L label="Keywords (comma separated)" id="kw"><input id="kw" className={inputCls} {...field("seoKeywords")} /></L>
        </Section>
      </div>

      <div className="space-y-4">
        <Section title="Publish">
          <L label="Status" id="status"><select id="status" className={inputCls} {...field("status")}>{["DRAFT", "ACTIVE", "INACTIVE", "OUT_OF_STOCK", "ARCHIVED"].map((s) => <option key={s}>{s}</option>)}</select></L>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.isFeatured} onChange={(e) => set("isFeatured", e.target.checked)} /> Featured (Recommended)</label>
          <SubmitButton className="w-full" size="md">Save product</SubmitButton>
        </Section>
        <Section title="Pricing (৳)">
          <L label="Regular price" id="rp"><input id="rp" type="number" step="0.01" min={0} required className={inputCls} {...field("regularPrice")} /></L>
          <L label="Sale price" id="sp"><input id="sp" type="number" step="0.01" min={0} className={inputCls} {...field("salePrice")} /></L>
          <L label="Cost price (for profit)" id="cp"><input id="cp" type="number" step="0.01" min={0} className={inputCls} {...field("costPrice")} /></L>
          {v.regularPrice && v.costPrice && <p className="text-xs text-muted">Margin at {v.salePrice ? "sale" : "regular"} price: {Math.round(((Number(v.salePrice || v.regularPrice) - Number(v.costPrice)) / Number(v.salePrice || v.regularPrice)) * 100)}%</p>}
        </Section>
        <Section title="Organisation">
          <L label="Category" id="cat"><select id="cat" className={inputCls} value={v.categoryId} onChange={(e) => setV((p) => ({ ...p, categoryId: e.target.value, subcategoryId: "" }))}><option value="">—</option>{parents.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></L>
          <L label="Subcategory" id="sub"><select id="sub" className={inputCls} {...field("subcategoryId")}><option value="">—</option>{subs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></L>
          <L label="Brand" id="brand"><select id="brand" className={inputCls} {...field("brandId")}><option value="">—</option>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></L>
          <L label="Tags (comma separated)" id="tags"><input id="tags" className={inputCls} {...field("tags")} /></L>
        </Section>
        <Section title="Inventory & shipping">
          <L label="Low stock alert at" id="lst"><input id="lst" type="number" min={0} className={inputCls} {...field("lowStockThreshold")} /></L>
          <L label="Weight (g)" id="w"><input id="w" type="number" min={0} className={inputCls} {...field("weightGrams")} /></L>
          <div className="grid grid-cols-3 gap-2">
            <L label="L cm" id="l"><input id="l" type="number" min={0} className={inputCls} {...field("lengthCm")} /></L>
            <L label="W cm" id="wi"><input id="wi" type="number" min={0} className={inputCls} {...field("widthCm")} /></L>
            <L label="H cm" id="h"><input id="h" type="number" min={0} className={inputCls} {...field("heightCm")} /></L>
          </div>
          <L label="Warranty" id="war"><input id="war" className={inputCls} {...field("warranty")} placeholder="e.g. 6 months brand warranty" /></L>
        </Section>
      </div>
    </ActionForm>
  );
}

function Section({ title, children, actions }: { title: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-[var(--radius-card)] border border-line bg-card p-5">
      <div className="flex items-center justify-between"><h2 className="text-sm font-semibold">{title}</h2>{actions}</div>
      {children}
    </section>
  );
}

function L({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return <div><label htmlFor={id} className={labelCls}>{label}</label>{children}</div>;
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/server/auth/admin";
import { db } from "@/server/db";
import { getSettings } from "@/server/settings";
import { aiConfigured } from "@/server/ai/provider";
import { PageHeader } from "@/components/admin/ui";
import { ActionForm, SubmitButton } from "@/components/admin/action-form";
import { ProductForm, type ProductFormValue } from "@/components/admin/product-form";
import { can } from "@/core/rbac";
import { saveProductAction, duplicateProductAction, deleteProductAction } from "../../../_actions/catalog";

const t = (p: number | null | undefined) => (p === null || p === undefined ? "" : String(p / 100));

export default async function EditProduct({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminPage("products.view");
  const { id } = await params;
  const [p, categories, brands, ai] = await Promise.all([
    db.product.findUnique({ where: { id }, include: { images: { orderBy: { position: "asc" } }, variants: { orderBy: { position: "asc" }, include: { image: true } }, attributes: { orderBy: { position: "asc" } } } }),
    db.category.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, parentId: true } }),
    db.brand.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    getSettings("ai"),
  ]);
  if (!p) notFound();
  const optionValues: Record<string, string> = {};
  for (const n of p.optionNames) optionValues[n] = [...new Set(p.variants.map((v) => (v.options as Record<string, string>)[n]).filter(Boolean))].join(", ");
  const initial: ProductFormValue = {
    id: p.id, name: p.name, slug: p.slug, sku: p.sku, barcode: p.barcode ?? "", shortDescription: p.shortDescription ?? "", description: p.description ?? "",
    brandId: p.brandId ?? "", categoryId: p.categoryId ?? "", subcategoryId: p.subcategoryId ?? "", tags: p.tags.join(", "),
    regularPrice: t(p.regularPrice), salePrice: t(p.salePrice), costPrice: t(p.costPrice), lowStockThreshold: String(p.lowStockThreshold),
    weightGrams: p.weightGrams?.toString() ?? "", lengthCm: p.lengthCm?.toString() ?? "", widthCm: p.widthCm?.toString() ?? "", heightCm: p.heightCm?.toString() ?? "",
    videoUrl: p.videoUrl ?? "", warranty: p.warranty ?? "", status: p.status, isFeatured: p.isFeatured, seoTitle: p.seoTitle ?? "", seoDescription: p.seoDescription ?? "", seoKeywords: p.seoKeywords.join(", "),
    images: p.images.map((i) => ({ url: i.url, alt: i.alt ?? "" })), attributes: p.attributes.map((a) => ({ name: a.name, value: a.value })),
    optionNames: p.optionNames, optionValues,
    variants: p.variants.map((v) => ({ id: v.id, sku: v.sku, title: v.title, options: v.options as Record<string, string>, price: t(v.price), salePrice: t(v.salePrice), costPrice: t(v.costPrice), stock: String(v.stock), weightGrams: v.weightGrams?.toString() ?? "", imageUrl: v.image?.url ?? "", isActive: v.isActive })),
  };
  return (
    <>
      <PageHeader
        title={p.name}
        description={`${p.status} · ${p.variants.length} variants · ${p.soldCount} sold · ${p.viewCount} views`}
        actions={
          <>
            <Link href={`/products/${p.slug}`} target="_blank" className="inline-flex h-9 items-center rounded-full border border-line bg-card px-4 text-sm font-semibold">View ↗</Link>
            {can(admin, "products.create") && <ActionForm action={duplicateProductAction}><input type="hidden" name="id" value={p.id} /><SubmitButton variant="outline">Duplicate</SubmitButton></ActionForm>}
            {can(admin, "products.delete") && <ActionForm action={deleteProductAction} confirm="Delete this product? Products with orders are archived instead."><input type="hidden" name="id" value={p.id} /><SubmitButton variant="danger">Delete</SubmitButton></ActionForm>}
          </>
        }
      />
      <ProductForm initial={initial} categories={categories} brands={brands} action={saveProductAction} aiEnabled={ai.productWriter && aiConfigured()} />
    </>
  );
}

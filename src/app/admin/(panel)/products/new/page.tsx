import { requireAdminPage } from "@/server/auth/admin";
import { db } from "@/server/db";
import { getSettings } from "@/server/settings";
import { aiConfigured } from "@/server/ai/provider";
import { PageHeader } from "@/components/admin/ui";
import { ProductForm, emptyProduct } from "@/components/admin/product-form";
import { saveProductAction } from "../../../_actions/catalog";

export default async function NewProduct() {
  await requireAdminPage("products.create");
  const [categories, brands, ai] = await Promise.all([db.category.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, parentId: true } }), db.brand.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }), getSettings("ai")]);
  return (
    <>
      <PageHeader title="Add product" />
      <ProductForm initial={emptyProduct()} categories={categories} brands={brands} action={saveProductAction} aiEnabled={ai.productWriter && aiConfigured()} />
    </>
  );
}

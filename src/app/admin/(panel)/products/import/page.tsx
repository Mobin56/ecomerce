import { requireAdminPage } from "@/server/auth/admin";
import { PageHeader, Card } from "@/components/admin/ui";
import { CsvImport } from "@/components/admin/csv-import";

export default async function ImportPage() {
  await requireAdminPage("products.import");
  return (
    <>
      <PageHeader title="Import products" description="Upsert products from CSV. Rows with the same product_sku become variants." />
      <Card>
        <p className="text-sm text-ink-soft">Columns: <code className="text-xs">product_sku, name, slug, status, category_slug, brand, regular_price, sale_price, cost_price, variant_sku, variant_title, option1_name, option1_value, option2_name, option2_value, variant_price, variant_stock, image_urls (| separated), short_description, tags (| separated)</code>. Prices in Taka. Tip: export first to get a template.</p>
        <CsvImport />
      </Card>
    </>
  );
}

import { handle } from "@/server/errors";
import { requireAdmin } from "@/server/auth/admin";
import { exportProductsCsv } from "@/server/products-admin";
import { logActivity } from "@/server/activity";

export const GET = handle(async () => {
  const admin = await requireAdmin("products.import");
  const csv = await exportProductsCsv();
  await logActivity({ userId: admin.id, action: "product.csv_export" });
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="products-${new Date().toISOString().slice(0, 10)}.csv"` } });
});

import { NextResponse } from "next/server";
import { handle, AppError } from "@/server/errors";
import { requireAdmin } from "@/server/auth/admin";
import { importProductsCsv } from "@/server/products-admin";

export const maxDuration = 300;

export const POST = handle(async (req: Request) => {
  const admin = await requireAdmin("products.import");
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new AppError("NO_FILE", "Choose a CSV file.");
  if (file.size > 5 * 1024 * 1024) throw new AppError("TOO_LARGE", "CSV must be under 5MB.");
  return NextResponse.json(await importProductsCsv(await file.text(), admin.id));
});

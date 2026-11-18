import { NextResponse } from "next/server";
import { z } from "zod";
import { handle } from "@/server/errors";
import { requireAdmin } from "@/server/auth/admin";
import { presignUpload } from "@/server/storage";

const schema = z.object({ contentType: z.string().max(40), size: z.number().int().positive(), folder: z.enum(["products", "reviews", "banners", "categories"]) });

export const POST = handle(async (req: Request) => {
  await requireAdmin("products.update");
  return NextResponse.json(await presignUpload(schema.parse(await req.json())));
});

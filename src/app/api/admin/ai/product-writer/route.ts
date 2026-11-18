import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, AppError } from "@/server/errors";
import { requireAdmin } from "@/server/auth/admin";
import { generateProductCopy } from "@/server/ai/writer-and-support";
import { rateLimit } from "@/server/rate-limit";

export const maxDuration = 120;

export const POST = handle(async (req: Request) => {
  const admin = await requireAdmin("ai.use");
  const rl = await rateLimit(`ai:${admin.id}`, 30, 3600);
  if (!rl.ok) throw new AppError("RATE_LIMITED", "AI limit reached. Try again later.", 429);
  const b = z.object({ name: z.string().trim().min(2).max(200), info: z.string().trim().min(5).max(3000), category: z.string().max(100).optional() }).parse(await req.json());
  return NextResponse.json(await generateProductCopy(b));
});

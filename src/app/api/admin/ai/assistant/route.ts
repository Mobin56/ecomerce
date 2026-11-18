import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, AppError } from "@/server/errors";
import { requireAdmin } from "@/server/auth/admin";
import { askBusinessAssistant } from "@/server/ai/business-assistant";
import { rateLimit } from "@/server/rate-limit";
import { getSettings } from "@/server/settings";

export const maxDuration = 120;

export const POST = handle(async (req: Request) => {
  const admin = await requireAdmin("ai.use");
  if (!(await getSettings("ai")).businessAssistant) throw new AppError("DISABLED", "Business assistant is disabled in settings.", 403);
  const rl = await rateLimit(`ai:${admin.id}`, 30, 3600);
  if (!rl.ok) throw new AppError("RATE_LIMITED", "AI limit reached. Try again later.", 429);
  const { question } = z.object({ question: z.string().trim().min(3).max(1000) }).parse(await req.json());
  return NextResponse.json(await askBusinessAssistant(question));
});

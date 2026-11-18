import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, AppError } from "@/server/errors";
import { supportReply } from "@/server/ai/writer-and-support";
import { rateLimit, clientIp } from "@/server/rate-limit";
import { getSettings } from "@/server/settings";

const schema = z.object({ message: z.string().trim().min(1).max(800), orderNumber: z.string().max(20).optional(), phone: z.string().max(20).optional() });

export const POST = handle(async (req: Request) => {
  const ai = await getSettings("ai");
  if (!ai.supportChatbot) throw new AppError("DISABLED", "Chat is not available.", 404);
  const rl = await rateLimit(`chat:${await clientIp()}`, 20, 600);
  if (!rl.ok) throw new AppError("RATE_LIMITED", "You're sending messages too quickly.", 429);
  const b = schema.parse(await req.json());
  return NextResponse.json(await supportReply(b.message, { orderNumber: b.orderNumber, phone: b.phone }));
});

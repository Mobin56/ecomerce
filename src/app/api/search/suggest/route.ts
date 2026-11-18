import { NextResponse } from "next/server";
import { handle } from "@/server/errors";
import { suggest } from "@/server/catalog";
import { rateLimit, clientIp } from "@/server/rate-limit";

export const GET = handle(async (req: Request) => {
  const rl = await rateLimit(`suggest:${await clientIp()}`, 120, 60);
  if (!rl.ok) return NextResponse.json({ products: [], categories: [], brands: [], correction: null }, { status: 429 });
  const q = (new URL(req.url).searchParams.get("q") ?? "").slice(0, 80);
  return NextResponse.json(await suggest(q), { headers: { "Cache-Control": "public, max-age=30, s-maxage=60" } });
});

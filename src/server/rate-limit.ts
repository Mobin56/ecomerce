import "server-only";
import Redis from "ioredis";
import { headers } from "next/headers";

/**
 * Fixed-window rate limiter. Uses Redis when REDIS_URL is set (required for
 * multi-instance deployments); falls back to in-memory for single instance/dev.
 */

let redis: Redis | null | undefined;
function getRedis(): Redis | null {
  if (redis !== undefined) return redis;
  if (!process.env.REDIS_URL) return (redis = null);
  const client = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1, enableOfflineQueue: false, retryStrategy: (n) => (n > 3 ? null : 2000) });
  // If Redis is unreachable, log once and fall back to the in-memory limiter.
  client.once("error", (e) => console.warn(`[redis] unavailable (${e.message}); using in-memory rate limiting`));
  client.on("error", () => undefined);
  client.on("end", () => {
    redis = null;
  });
  redis = client;
  return redis;
}
export { getRedis };

const memory = new Map<string, { count: number; resetAt: number }>();

export async function rateLimit(key: string, limit: number, windowSec: number): Promise<{ ok: boolean; remaining: number; retryAfter: number }> {
  const r = getRedis();
  const bucket = `rl:${key}:${Math.floor(Date.now() / (windowSec * 1000))}`;
  if (r && r.status === "ready") {
    try {
      const count = await r.incr(bucket);
      if (count === 1) await r.expire(bucket, windowSec);
      return { ok: count <= limit, remaining: Math.max(limit - count, 0), retryAfter: windowSec };
    } catch {
      // Redis down: fail open for availability, memory limiter still applies below.
    }
  }
  const now = Date.now();
  const cur = memory.get(bucket);
  if (!cur || cur.resetAt < now) {
    memory.set(bucket, { count: 1, resetAt: now + windowSec * 1000 });
    if (memory.size > 10_000) for (const [k, v] of memory) if (v.resetAt < now) memory.delete(k);
    return { ok: true, remaining: limit - 1, retryAfter: windowSec };
  }
  cur.count++;
  return { ok: cur.count <= limit, remaining: Math.max(limit - cur.count, 0), retryAfter: Math.ceil((cur.resetAt - now) / 1000) };
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("cf-connecting-ip") ?? h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0] ?? "0.0.0.0").trim();
}

export async function clientInfo() {
  const h = await headers();
  const ua = h.get("user-agent") ?? "";
  const deviceType = /iPad|Tablet/i.test(ua) ? "tablet" : /Mobi|Android|iPhone/i.test(ua) ? "mobile" : "desktop";
  return { ip: await clientIp(), userAgent: ua.slice(0, 500), deviceType };
}

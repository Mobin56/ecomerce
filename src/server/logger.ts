import "server-only";

/**
 * Structured JSON logger. Redacts secrets/PII keys so tokens, passwords and
 * card data never reach logs. Ship stdout to your log platform (Vercel,
 * Better Stack, Loki, CloudWatch...).
 */

type Level = "debug" | "info" | "warn" | "error";
const REDACT = /pass(word)?|secret|token|authorization|api[-_]?key|cookie|card|cvv|pin|otp|totp|access_token|id_token/i;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || typeof value !== "object") return value;
  if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack?.split("\n").slice(0, 6).join("\n") };
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) out[k] = REDACT.test(k) ? "[REDACTED]" : redact(v, depth + 1);
  return out;
}

function write(level: Level, scope: string, message: string, data?: Record<string, unknown>) {
  if (level === "debug" && process.env.NODE_ENV === "production") return;
  const line = JSON.stringify({ ts: new Date().toISOString(), level, scope, message, ...(data ? (redact(data) as object) : {}) });
  if (level === "error" || level === "warn") console.error(line);
  else process.stdout.write(`${line}\n`);
}

export function logger(scope: string) {
  return {
    debug: (m: string, d?: Record<string, unknown>) => write("debug", scope, m, d),
    info: (m: string, d?: Record<string, unknown>) => write("info", scope, m, d),
    warn: (m: string, d?: Record<string, unknown>) => write("warn", scope, m, d),
    error: (m: string, d?: Record<string, unknown>) => write("error", scope, m, d),
  };
}

export const _redactForTests = redact;

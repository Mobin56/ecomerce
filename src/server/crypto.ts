import "server-only";
import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "./env";

/** AES-256-GCM for secrets stored in the DB (CAPI token, gateway keys, TOTP secrets). */
function key(): Buffer {
  const k = Buffer.from(env().APP_ENCRYPTION_KEY, "base64");
  if (k.length !== 32) throw new Error("APP_ENCRYPTION_KEY must decode to 32 bytes");
  return k;
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `v1:${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${enc.toString("base64")}`;
}

export function decryptSecret(payload: string): string {
  const [v, iv, tag, data] = payload.split(":");
  if (v !== "v1" || !iv || !tag || !data) throw new Error("Malformed secret");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** Session tokens are stored hashed so a DB leak does not leak live sessions. */
export function hashToken(token: string): string {
  return createHmac("sha256", env().SESSION_SECRET).update(token).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** Mask secrets for display in admin forms: "EAAG••••••••3fZ" */
export function maskSecret(v: string | null | undefined): string {
  if (!v) return "";
  return v.length <= 8 ? "••••••••" : `${v.slice(0, 4)}••••••••${v.slice(-3)}`;
}

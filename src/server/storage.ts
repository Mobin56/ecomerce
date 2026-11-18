import "server-only";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "./env";
import { randomToken } from "./crypto";
import { AppError } from "./errors";

/** S3-compatible storage (AWS S3, Cloudflare R2, DO Spaces, MinIO). Browser uploads directly via presigned PUT. */
let client: S3Client | null = null;
function s3() {
  const e = env();
  if (!e.STORAGE_BUCKET || !e.STORAGE_ACCESS_KEY_ID || !e.STORAGE_SECRET_ACCESS_KEY) {
    throw new AppError("STORAGE_NOT_CONFIGURED", "Image storage is not configured. Set STORAGE_* variables in .env.", 503);
  }
  client ??= new S3Client({
    region: e.STORAGE_REGION,
    endpoint: e.STORAGE_ENDPOINT || undefined,
    forcePathStyle: Boolean(e.STORAGE_ENDPOINT),
    credentials: { accessKeyId: e.STORAGE_ACCESS_KEY_ID, secretAccessKey: e.STORAGE_SECRET_ACCESS_KEY },
  });
  return client;
}

const ALLOWED = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif", "video/mp4": "mp4" } as const;
const MAX_BYTES = { image: 8 * 1024 * 1024, video: 60 * 1024 * 1024 };

export async function presignUpload(input: { contentType: string; size: number; folder: "products" | "reviews" | "banners" | "categories" }) {
  const ext = ALLOWED[input.contentType as keyof typeof ALLOWED];
  if (!ext) throw new AppError("BAD_TYPE", "Only JPG, PNG, WebP, AVIF images or MP4 video are allowed.", 422);
  const limit = input.contentType.startsWith("video/") ? MAX_BYTES.video : MAX_BYTES.image;
  if (input.size > limit) throw new AppError("TOO_LARGE", `File too large (max ${limit / 1024 / 1024}MB).`, 422);
  const key = `${input.folder}/${new Date().toISOString().slice(0, 7)}/${randomToken(12)}.${ext}`;
  const e = env();
  const url = await getSignedUrl(s3(), new PutObjectCommand({ Bucket: e.STORAGE_BUCKET, Key: key, ContentType: input.contentType, ContentLength: input.size, CacheControl: "public, max-age=31536000, immutable" }), { expiresIn: 300 });
  return { uploadUrl: url, publicUrl: `${(e.STORAGE_PUBLIC_BASE_URL ?? "").replace(/\/$/, "")}/${key}`, key };
}

export async function deleteObject(publicUrl: string) {
  const e = env();
  const base = (e.STORAGE_PUBLIC_BASE_URL ?? "").replace(/\/$/, "");
  if (!base || !publicUrl.startsWith(base)) return;
  await s3().send(new DeleteObjectCommand({ Bucket: e.STORAGE_BUCKET, Key: publicUrl.slice(base.length + 1) }));
}

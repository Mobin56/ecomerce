import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { logger } from "./logger";

/** Errors whose message is safe to show to customers. */
export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what = "Resource") => new AppError("NOT_FOUND", `${what} not found`, 404);
export const forbidden = () => new AppError("FORBIDDEN", "You do not have permission to do this.", 403);
export const unauthorized = () => new AppError("UNAUTHORIZED", "Please sign in.", 401);

const log = logger("api");

/** Wrap route handlers: validation → 422, AppError → its status, anything else → 500 without stack. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export function errorResponse(e: unknown): Response {
  if (e instanceof ZodError) {
    return NextResponse.json({ error: { code: "VALIDATION", message: "Please check the highlighted fields.", fields: e.flatten().fieldErrors } }, { status: 422 });
  }
  if (e instanceof AppError) {
    return NextResponse.json({ error: { code: e.code, message: e.message, details: e.details } }, { status: e.status });
  }
  log.error("Unhandled API error", { error: e });
  return NextResponse.json({ error: { code: "INTERNAL", message: "Something went wrong. Please try again." } }, { status: 500 });
}

/** Result type for server actions (never throw raw errors to the client). */
export type ActionResult<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: string; fields?: Record<string, string[] | undefined> };

export async function action<T>(fn: () => Promise<T>, successMessage?: string): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data, message: successMessage };
  } catch (e) {
    if (e instanceof ZodError) return { ok: false, error: "Please check the highlighted fields.", fields: e.flatten().fieldErrors };
    if (e instanceof AppError) return { ok: false, error: e.message };
    // Next.js redirect()/notFound() throw special errors that must propagate.
    if (e && typeof e === "object" && "digest" in e && typeof (e as { digest: unknown }).digest === "string" && (e as { digest: string }).digest.startsWith("NEXT_")) throw e;
    log.error("Unhandled action error", { error: e });
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

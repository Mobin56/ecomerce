"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { action, type ActionResult } from "@/server/errors";
import { adminLogin, adminLogout, verifyAdmin2fa } from "@/server/auth/login";

export async function loginAction(_: ActionResult<unknown> | null, fd: FormData): Promise<ActionResult<unknown>> {
  let next = "/admin";
  const r = await action(async () => {
    const { email, password } = z.object({ email: z.string().email(), password: z.string().min(1).max(200) }).parse(Object.fromEntries(fd));
    const res = await adminLogin(email, password);
    if (res.needs2fa) next = "/admin/login/2fa";
  });
  if (r.ok) redirect(next);
  return r;
}

export async function verify2faAction(_: ActionResult<unknown> | null, fd: FormData): Promise<ActionResult<unknown>> {
  const r = await action(async () => {
    const { code } = z.object({ code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code") }).parse(Object.fromEntries(fd));
    await verifyAdmin2fa(code);
  });
  if (r.ok) redirect("/admin");
  return r;
}

export async function logoutAction() {
  await adminLogout();
  redirect("/admin/login");
}

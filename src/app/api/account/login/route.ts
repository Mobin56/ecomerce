import { NextResponse } from "next/server";
import { handle } from "@/server/errors";
import { customerLoginSchema } from "@/validation";
import { loginCustomer } from "@/server/auth/customer";

export const POST = handle(async (req: Request) => {
  const b = customerLoginSchema.parse(await req.json());
  const c = await loginCustomer(b.phone, b.password);
  return NextResponse.json({ ok: true, name: c.name });
});

import { NextResponse } from "next/server";
import { handle } from "@/server/errors";
import { customerRegisterSchema } from "@/validation";
import { registerCustomer } from "@/server/auth/customer";

export const POST = handle(async (req: Request) => {
  const b = customerRegisterSchema.parse(await req.json());
  const c = await registerCustomer({ ...b, email: b.email || undefined });
  return NextResponse.json({ ok: true, name: c.name }, { status: 201 });
});

import { NextResponse } from "next/server";
import { logoutCustomer } from "@/server/auth/customer";

export async function POST() {
  await logoutCustomer();
  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { handle } from "@/server/errors";
import { placeOrder } from "@/server/orders";
import { checkoutSchema } from "@/validation";

export const dynamic = "force-dynamic";

/** Only identity/address/payment-method come from the client. Totals are computed server-side. */
export const POST = handle(async (req: Request) => {
  const input = checkoutSchema.parse(await req.json());
  const result = await placeOrder({ ...input, email: input.email || null, notes: input.notes || null });
  return NextResponse.json(result, { status: 201 });
});

import { NextResponse } from "next/server";
import { handle } from "@/server/errors";
import { db } from "@/server/db";
import { getCartRecord } from "@/server/cart";
import { checkoutContactSchema } from "@/validation";
import { normalizeBDPhone } from "@/core/phone";

/** Saves checkout contact details as they are typed (debounced) so abandoned carts can be recovered. */
export const POST = handle(async (req: Request) => {
  const body = checkoutContactSchema.parse(await req.json());
  const cart = await getCartRecord();
  if (cart) {
    const phone = body.phone ? normalizeBDPhone(body.phone) : null;
    await db.cart.update({ where: { id: cart.id }, data: { ...(phone ? { contactPhone: phone } : {}), ...(body.email && /\S+@\S+\.\S+/.test(body.email) ? { contactEmail: body.email } : {}), ...(body.name ? { contactName: body.name } : {}), lastActivityAt: new Date() } });
  }
  return NextResponse.json({ ok: true });
});

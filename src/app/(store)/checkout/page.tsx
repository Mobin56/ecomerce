import type { Metadata } from "next";
import { listEnabledPaymentMethods } from "@/server/orders";
import { getCustomerSession } from "@/server/auth/session";
import { db } from "@/server/db";
import { DISTRICTS } from "@/core/locations";
import { CheckoutForm } from "@/components/store/checkout-form";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  const [methods, session] = await Promise.all([listEnabledPaymentMethods(), getCustomerSession()]);
  const address = session ? await db.address.findFirst({ where: { customerId: session.customer.id }, orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }] }) : null;
  return (
    <div className="container-x pb-16 pt-6">
      <h1 className="mb-6 font-display text-3xl font-semibold">Checkout</h1>
      <CheckoutForm
        methods={methods}
        districts={DISTRICTS}
        defaults={{
          name: address?.name ?? session?.customer.name ?? "",
          phone: address?.phone ?? session?.customer.phone ?? "",
          email: session?.customer.email ?? "",
          district: address?.district ?? "Dhaka",
          area: address?.area ?? "",
          address: address?.line1 ?? "",
        }}
      />
    </div>
  );
}

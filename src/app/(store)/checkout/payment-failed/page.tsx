import type { Metadata } from "next";
import Link from "next/link";
import { XCircle } from "lucide-react";

export const metadata: Metadata = { title: "Payment not completed", robots: { index: false } };

export default async function PaymentFailed({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const { reason } = await searchParams;
  return (
    <div className="container-x max-w-xl py-20 text-center">
      <XCircle size={52} className="mx-auto text-danger" aria-hidden />
      <h1 className="mt-4 font-display text-3xl font-semibold">{reason === "cancel" ? "Payment cancelled" : "Payment didn't go through"}</h1>
      <p className="mt-3 text-muted">No money was taken. Your order is saved — our team will contact you, or you can try again with another method.</p>
      <div className="mt-8 flex justify-center gap-3">
        <Link href="/checkout" className="inline-flex h-11 items-center rounded-full bg-ink px-6 font-semibold text-white">Try again</Link>
        <Link href="/pages/contact" className="inline-flex h-11 items-center rounded-full border border-line px-6 font-semibold">Contact us</Link>
      </div>
    </div>
  );
}

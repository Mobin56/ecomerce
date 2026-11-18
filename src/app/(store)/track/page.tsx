import type { Metadata } from "next";
import { TrackOrderForm } from "@/components/store/track-form";

export const metadata: Metadata = { title: "Track your order", alternates: { canonical: "/track" } };

export default function TrackPage() {
  return (
    <div className="container-x max-w-xl py-12">
      <h1 className="font-display text-3xl font-semibold">Track your order</h1>
      <p className="mt-2 text-muted">Enter your order number and the phone number you used.</p>
      <TrackOrderForm />
    </div>
  );
}

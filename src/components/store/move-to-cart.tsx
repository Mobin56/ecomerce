"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ApiError } from "@/lib/api-client";
import { useCart } from "./cart-context";
import { useToast } from "@/components/ui/toast";

export function MoveToCartButton({ productId }: { productId: string }) {
  const [busy, setBusy] = useState(false);
  const { refresh, setOpen } = useCart();
  const toast = useToast();
  const router = useRouter();
  return (
    <button
      disabled={busy}
      className="mt-2 h-9 w-full rounded-full border border-ink text-sm font-semibold hover:bg-ink hover:text-white disabled:opacity-50"
      onClick={async () => {
        setBusy(true);
        try {
          await api("/api/wishlist/move", { body: { productId } });
          await refresh();
          setOpen(true);
          router.refresh();
        } catch (e) {
          toast(e instanceof ApiError ? e.message : "Could not move to cart", "error");
        } finally {
          setBusy(false);
        }
      }}
    >
      Move to cart
    </button>
  );
}

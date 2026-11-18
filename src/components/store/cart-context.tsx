"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { CartView } from "@/server/cart";
import { api, ApiError } from "@/lib/api-client";
import { useToast } from "@/components/ui/toast";
import { track, trackGa } from "./tracking";

interface CartCtx {
  cart: CartView | null;
  loading: boolean;
  open: boolean;
  setOpen: (v: boolean) => void;
  add: (variantId: string, quantity: number, meta: { productId: string; name: string; price: number; category?: string | null; variant?: string | null }, opts?: { openDrawer?: boolean }) => Promise<boolean>;
  update: (variantId: string, quantity: number, newVariantId?: string) => Promise<void>;
  applyCoupon: (code: string | null) => Promise<string | null>;
  refresh: (district?: string) => Promise<void>;
  count: number;
}

const Ctx = createContext<CartCtx | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<CartView | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const toast = useToast();

  const refresh = useCallback(async (district?: string) => {
    const data = await api<CartView>(`/api/cart${district ? `?district=${encodeURIComponent(district)}` : ""}`).catch(() => null);
    if (data) setCart(data);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const add: CartCtx["add"] = useCallback(
    async (variantId, quantity, meta, opts) => {
      setLoading(true);
      try {
        const data = await api<CartView>("/api/cart", { body: { variantId, quantity } });
        setCart(data);
        track("AddToCart", { productId: meta.productId, value: meta.price * quantity, items: [{ id: meta.productId, name: meta.name, price: meta.price, quantity, category: meta.category ?? undefined, variant: meta.variant ?? undefined }] });
        if (opts?.openDrawer !== false) setOpen(true);
        return true;
      } catch (e) {
        toast(e instanceof ApiError ? e.message : "Could not add to cart", "error");
        return false;
      } finally {
        setLoading(false);
      }
    },
    [toast],
  );

  const update: CartCtx["update"] = useCallback(
    async (variantId, quantity, newVariantId) => {
      const prev = cart;
      const item = cart?.items.find((i) => i.variantId === variantId);
      // Optimistic quantity update for instant feedback.
      if (cart && !newVariantId) setCart({ ...cart, items: quantity === 0 ? cart.items.filter((i) => i.variantId !== variantId) : cart.items.map((i) => (i.variantId === variantId ? { ...i, quantity, lineTotal: i.unitPrice * quantity } : i)) });
      try {
        setCart(await api<CartView>("/api/cart", { method: "PATCH", body: { variantId, quantity, newVariantId } }));
        if (quantity === 0 && item) trackGa("remove_from_cart", { value: item.lineTotal, items: [{ id: item.productId, name: item.name, price: item.unitPrice, quantity: item.quantity }] });
      } catch (e) {
        setCart(prev);
        toast(e instanceof ApiError ? e.message : "Could not update cart", "error");
      }
    },
    [cart, toast],
  );

  const applyCoupon: CartCtx["applyCoupon"] = useCallback(async (code) => {
    try {
      setCart(await api<CartView>("/api/cart/coupon", { body: { code } }));
      return null;
    } catch (e) {
      await refresh();
      return e instanceof ApiError ? e.message : "Invalid coupon";
    }
  }, [refresh]);

  const value = useMemo(
    () => ({ cart, loading, open, setOpen, add, update, applyCoupon, refresh, count: cart?.items.reduce((s, i) => s + i.quantity, 0) ?? 0 }),
    [cart, loading, open, add, update, applyCoupon, refresh],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCart() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCart must be used inside CartProvider");
  return c;
}

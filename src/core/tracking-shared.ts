/** Tracking helpers safe for both browser and server (no Node APIs). */

export type MetaEventName =
  | "PageView"
  | "ViewContent"
  | "Search"
  | "AddToCart"
  | "InitiateCheckout"
  | "AddPaymentInfo"
  | "Purchase"
  | "AddToWishlist";

export function purchaseEventId(orderId: string): string {
  return `purchase.${orderId}`;
}

/** Random id for browser-originated events; the same id is posted to /api/track for CAPI. */
export function newEventId(prefix: string): string {
  return `${prefix}.${globalThis.crypto.randomUUID()}`;
}

export interface TrackItem {
  id: string; // product id (content_id)
  name: string;
  price: number; // poisha
  quantity: number;
  category?: string;
  variant?: string;
  brand?: string;
}

/** GA4 items[] (values in currency units). */
export function toGa4Items(items: TrackItem[]) {
  return items.map((i, index) => ({
    item_id: i.id,
    item_name: i.name,
    price: i.price / 100,
    quantity: i.quantity,
    index,
    ...(i.category ? { item_category: i.category } : {}),
    ...(i.variant ? { item_variant: i.variant } : {}),
    ...(i.brand ? { item_brand: i.brand } : {}),
  }));
}

/** Browser Pixel event names → GA4 event names, for a single client tracking call. */
export const META_TO_GA4: Partial<Record<MetaEventName, string>> = {
  ViewContent: "view_item",
  AddToCart: "add_to_cart",
  InitiateCheckout: "begin_checkout",
  AddPaymentInfo: "add_payment_info",
  Purchase: "purchase",
  Search: "search",
  AddToWishlist: "add_to_wishlist",
};

/** Our first-party funnel names (marketing_events). */
export const META_TO_FUNNEL: Partial<Record<MetaEventName, string>> = {
  PageView: "page_view",
  ViewContent: "view_item",
  AddToCart: "add_to_cart",
  InitiateCheckout: "begin_checkout",
  AddPaymentInfo: "add_payment_info",
  Purchase: "purchase",
  Search: "search",
  AddToWishlist: "add_to_wishlist",
};

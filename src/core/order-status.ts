/**
 * Order state machine + the inventory effect of each transition.
 *
 * Stock model per variant:  available = stock − reserved
 *  - order placed          → reserved += qty
 *  - shipped (fulfilled)   → stock −= qty, reserved −= qty
 *  - cancelled before ship → reserved −= qty
 *  - returned / failed delivery after ship → stock += qty (restock)
 */

export type OrderStatus =
  | "PENDING"
  | "CONFIRMED"
  | "PROCESSING"
  | "PACKED"
  | "SHIPPED"
  | "DELIVERED"
  | "CANCELLED"
  | "RETURNED"
  | "FAILED_DELIVERY";

export const ORDER_FLOW: OrderStatus[] = ["PENDING", "CONFIRMED", "PROCESSING", "PACKED", "SHIPPED", "DELIVERED"];

const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PROCESSING", "PACKED", "SHIPPED", "CANCELLED"],
  PROCESSING: ["PACKED", "SHIPPED", "CANCELLED"],
  PACKED: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["DELIVERED", "RETURNED", "FAILED_DELIVERY"],
  DELIVERED: ["RETURNED"],
  FAILED_DELIVERY: ["SHIPPED", "RETURNED"],
  CANCELLED: [],
  RETURNED: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function nextStatuses(from: OrderStatus): OrderStatus[] {
  return TRANSITIONS[from];
}

const SHIPPED_STATES: OrderStatus[] = ["SHIPPED", "DELIVERED", "FAILED_DELIVERY", "RETURNED"];

export function isShipped(s: OrderStatus): boolean {
  return SHIPPED_STATES.includes(s);
}

export type InventoryEffect = "NONE" | "FULFILL" | "RELEASE" | "RESTOCK";

/** What happens to stock when an order moves from → to. */
export function inventoryEffect(from: OrderStatus, to: OrderStatus): InventoryEffect {
  if (!canTransition(from, to)) throw new Error(`Invalid transition ${from} → ${to}`);
  if (to === "CANCELLED") return "RELEASE";
  if (to === "SHIPPED" && !isShipped(from)) return "FULFILL";
  // A failed delivery re-shipped: stock was already deducted.
  if (to === "RETURNED") return "RESTOCK";
  return "NONE";
}

export const STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: "Pending",
  CONFIRMED: "Confirmed",
  PROCESSING: "Processing",
  PACKED: "Packed",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  RETURNED: "Returned",
  FAILED_DELIVERY: "Failed delivery",
};

/** Final states for profit snapshots. */
export function isFinal(s: OrderStatus): boolean {
  return s === "DELIVERED" || s === "RETURNED" || s === "CANCELLED";
}

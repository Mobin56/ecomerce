/**
 * Courier adapter contract. Pathao, Steadfast, RedX, Paperfly, eCourier...
 * each implement this and are registered in src/server/courier/registry.ts.
 */

export interface ShipmentRequest {
  orderId: string;
  orderNumber: number;
  recipient: { name: string; phone: string; address: string; district: string; area: string };
  codAmount: number; // poisha; 0 for prepaid
  weightGrams: number;
  itemCount: number;
  itemDescription: string;
  note?: string | null;
}

export type NormalizedShipmentStatus =
  | "CREATED"
  | "PICKED_UP"
  | "IN_TRANSIT"
  | "DELIVERED"
  | "RETURNED"
  | "FAILED"
  | "CANCELLED";

export interface CreateShipmentResult {
  ok: boolean;
  trackingId?: string;
  consignmentId?: string;
  deliveryCharge?: number; // poisha
  status?: NormalizedShipmentStatus;
  error?: string;
  raw: unknown;
}

export interface TrackResult {
  ok: boolean;
  status?: NormalizedShipmentStatus;
  rawStatus?: string;
  message?: string;
  error?: string;
  raw: unknown;
}

export interface CourierProvider {
  readonly key: string;
  readonly label: string;
  readonly isConfigured: boolean;
  createShipment(req: ShipmentRequest): Promise<CreateShipmentResult>;
  track(ref: { trackingId: string; consignmentId?: string | null }): Promise<TrackResult>;
  cancel?(ref: { trackingId: string; consignmentId?: string | null }): Promise<{ ok: boolean; raw: unknown }>;
}

/** Map courier-specific status strings to our normalised status. */
export function mapCourierStatus(courier: string, raw: string): NormalizedShipmentStatus {
  const s = raw.toLowerCase().replace(/[\s-]+/g, "_");
  const table: Record<string, Record<string, NormalizedShipmentStatus>> = {
    steadfast: {
      in_review: "CREATED",
      pending: "IN_TRANSIT",
      hold: "IN_TRANSIT",
      delivered: "DELIVERED",
      partial_delivered: "DELIVERED",
      delivered_approval_pending: "DELIVERED",
      partial_delivered_approval_pending: "DELIVERED",
      cancelled: "RETURNED",
      cancelled_approval_pending: "RETURNED",
      unknown: "IN_TRANSIT",
    },
    pathao: {
      pending: "CREATED",
      pickup_requested: "CREATED",
      assigned_for_pickup: "CREATED",
      picked: "PICKED_UP",
      at_the_sorting_hub: "IN_TRANSIT",
      in_transit: "IN_TRANSIT",
      received_at_last_mile_hub: "IN_TRANSIT",
      assigned_for_delivery: "IN_TRANSIT",
      delivered: "DELIVERED",
      partial_delivery: "DELIVERED",
      delivery_failed: "FAILED",
      on_hold: "IN_TRANSIT",
      return: "RETURNED",
      returned: "RETURNED",
      pickup_cancelled: "CANCELLED",
      exchange: "DELIVERED",
    },
    redx: {
      "ready-for-delivery": "CREATED",
      ready_for_delivery: "CREATED",
      "pickup-pending": "CREATED",
      pickup_pending: "CREATED",
      delivery_in_progress: "IN_TRANSIT",
      delivered: "DELIVERED",
      agent_hold: "IN_TRANSIT",
      agent_returning: "RETURNED",
      returned: "RETURNED",
      agent_area_change: "IN_TRANSIT",
    },
  };
  const hit = table[courier]?.[s];
  if (hit) return hit;
  if (s.includes("deliver") && !s.includes("fail")) return "DELIVERED";
  if (s.includes("return")) return "RETURNED";
  if (s.includes("fail")) return "FAILED";
  if (s.includes("cancel")) return "CANCELLED";
  if (s.includes("pick")) return "PICKED_UP";
  return "IN_TRANSIT";
}

/** Shipment status → the order status it implies (or null to leave order as is). */
export function orderStatusForShipment(s: NormalizedShipmentStatus): "SHIPPED" | "DELIVERED" | "RETURNED" | "FAILED_DELIVERY" | null {
  switch (s) {
    case "PICKED_UP":
    case "IN_TRANSIT":
      return "SHIPPED";
    case "DELIVERED":
      return "DELIVERED";
    case "RETURNED":
      return "RETURNED";
    case "FAILED":
      return "FAILED_DELIVERY";
    default:
      return null;
  }
}

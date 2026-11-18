/** Customer segmentation from aggregated order stats. A customer can be in several segments. */

export type Segment = "NEW" | "RETURNING" | "VIP" | "HIGH_VALUE" | "INACTIVE" | "HIGH_CANCELLATION_RISK";

export interface CustomerStats {
  totalOrders: number;
  deliveredOrders: number;
  cancelledOrders: number;
  returnedOrders: number;
  totalSpent: number; // delivered revenue, poisha
  lastOrderAt: Date | null;
}

export interface SegmentConfig {
  vipMinSpent: number;
  vipMinOrders: number;
  highValueMinAov: number;
  inactiveDays: number;
  riskCancelRate: number;
}

export const DEFAULT_SEGMENT_CONFIG: SegmentConfig = {
  vipMinSpent: 50_000_00, // ৳50,000
  vipMinOrders: 5,
  highValueMinAov: 5_000_00, // ৳5,000
  inactiveDays: 90,
  riskCancelRate: 0.4,
};

export function segmentCustomer(s: CustomerStats, now = new Date(), cfg = DEFAULT_SEGMENT_CONFIG): Segment[] {
  const out: Segment[] = [];
  if (s.totalOrders <= 1) out.push("NEW");
  if (s.deliveredOrders >= 2) out.push("RETURNING");
  if (s.totalSpent >= cfg.vipMinSpent || s.deliveredOrders >= cfg.vipMinOrders) out.push("VIP");
  const aov = s.deliveredOrders > 0 ? s.totalSpent / s.deliveredOrders : 0;
  if (aov >= cfg.highValueMinAov) out.push("HIGH_VALUE");
  if (s.lastOrderAt && now.getTime() - s.lastOrderAt.getTime() > cfg.inactiveDays * 86_400_000) out.push("INACTIVE");
  const bad = s.cancelledOrders + s.returnedOrders;
  if (s.totalOrders >= 2 && bad / s.totalOrders >= cfg.riskCancelRate) out.push("HIGH_CANCELLATION_RISK");
  return out;
}

export const SEGMENT_LABELS: Record<Segment, string> = {
  NEW: "New",
  RETURNING: "Returning",
  VIP: "VIP",
  HIGH_VALUE: "High value",
  INACTIVE: "Inactive",
  HIGH_CANCELLATION_RISK: "High cancellation risk",
};

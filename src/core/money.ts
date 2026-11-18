/**
 * Money helpers. All amounts are integers in the smallest unit (poisha).
 * 1 Taka = 100 poisha. Never do arithmetic on floats for money.
 */

export const CURRENCY = "BDT";

export function toPoisha(taka: number): number {
  if (!Number.isFinite(taka)) throw new Error("Invalid amount");
  return Math.round(taka * 100);
}

export function toTaka(poisha: number): number {
  return poisha / 100;
}

/** Percentage of an amount, rounded half-up to the nearest poisha. */
export function percentOf(amount: number, percent: number): number {
  return Math.round((amount * percent) / 100);
}

const formatter = new Intl.NumberFormat("en-BD", { maximumFractionDigits: 2, minimumFractionDigits: 0 });

/** ৳1,350 — shows decimals only when there are poisha. */
export function formatMoney(poisha: number): string {
  const sign = poisha < 0 ? "-" : "";
  return `${sign}৳${formatter.format(Math.abs(poisha) / 100)}`;
}

/**
 * Split `total` across `weights` proportionally so the parts always add up
 * exactly to `total` (largest-remainder method). Used to allocate an order
 * discount to its lines for per-product profit.
 */
export function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0 || total === 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sum);
  const floored = raw.map(Math.floor);
  let remainder = total - floored.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac);
  for (const { i } of order) {
    if (remainder <= 0) break;
    floored[i] = (floored[i] ?? 0) + 1;
    remainder--;
  }
  return floored;
}

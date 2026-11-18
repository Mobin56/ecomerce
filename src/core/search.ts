/** Search helpers: query normalisation + typo tolerant suggestions. */

export function normalizeQuery(q: string): string {
  return q
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

export function tokenize(q: string): string[] {
  return normalizeQuery(q).split(" ").filter((t) => t.length > 0);
}

/** Damerau-free Levenshtein with early exit. */
export function levenshtein(a: string, b: string, max = 3): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const v = Math.min((prev[j] ?? 0) + 1, (cur[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length] ?? max + 1;
}

/** "Did you mean" from a vocabulary (product names, categories, brands). */
export function suggestCorrection(query: string, vocabulary: string[]): string | null {
  const tokens = tokenize(query);
  if (!tokens.length) return null;
  const words = new Set<string>();
  for (const v of vocabulary) for (const w of tokenize(v)) if (w.length > 2) words.add(w);
  let changed = false;
  const corrected = tokens.map((t) => {
    if (t.length < 3 || words.has(t)) return t;
    const tolerance = t.length <= 4 ? 1 : 2;
    let best: string | null = null;
    let bestD = tolerance + 1;
    for (const w of words) {
      const d = levenshtein(t, w, tolerance);
      if (d < bestD) {
        best = w;
        bestD = d;
      }
    }
    if (best) {
      changed = true;
      return best;
    }
    return t;
  });
  return changed ? corrected.join(" ") : null;
}

export const SORT_OPTIONS = {
  relevance: "Relevance",
  newest: "Newest",
  price_asc: "Price: low to high",
  price_desc: "Price: high to low",
  best_selling: "Best selling",
  rating: "Top rated",
} as const;
export type SortKey = keyof typeof SORT_OPTIONS;

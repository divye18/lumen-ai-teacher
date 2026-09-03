/**
 * Deterministic helpers for concept keys and light text shaping. Pure.
 */

/** Turn arbitrary text into a valid concept key: `^[a-z0-9-]{1,80}$`. */
export function slugifyConceptKey(input: string, fallback = "concept"): string {
  const slug = input
    .toLowerCase()
    // Anything that is not an ASCII letter/digit becomes a separator; this also
    // collapses accented characters rather than transliterating them.
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
  return slug.length > 0 ? slug : fallback;
}

export function titleCase(input: string): string {
  return input
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((w) => (w.length === 0 ? w : w[0].toUpperCase() + w.slice(1)))
    .join(" ")
    .slice(0, 200);
}

export function clampInt(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

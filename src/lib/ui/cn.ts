export type ClassValue =
  string | number | null | false | undefined | ClassValue[];

/**
 * Minimal class-name joiner. No `tailwind-merge` — components are written so
 * later classes in the same call win by ordering, and callers pass overrides
 * last. Keeps the dependency surface small.
 */
export function cn(...values: ClassValue[]): string {
  const out: string[] = [];
  for (const value of values) {
    if (!value) continue;
    if (Array.isArray(value)) {
      const nested = cn(...value);
      if (nested) out.push(nested);
    } else {
      out.push(String(value));
    }
  }
  return out.join(" ");
}

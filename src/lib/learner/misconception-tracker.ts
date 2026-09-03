import type { MisconceptionCandidate } from "@/lib/teaching/contracts";

/**
 * Misconception taxonomy + deduplication.
 *
 * The LLM proposes misconception *candidates* per answer. This pure module
 * decides whether a candidate is the same wrong mental model we have already
 * seen (strengthen it) or a new one (create it). Repeated evidence strengthens
 * a classification and escalates its severity.
 */

export const MISCONCEPTION_CREATE_MIN_CONFIDENCE = 0.5;
export const REPEATED_DETECTION_COUNT = 2;
const MATCH_THRESHOLD = 0.42;

export interface ExistingMisconception {
  id: string;
  category: string;
  description: string;
  confidence: number;
  status: string;
  /** How many times this misconception has been detected so far. */
  detections: number;
}

export function normalizeCategory(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function tokens(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 2),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  return inter / (a.size + b.size - inter);
}

export interface MisconceptionMatch {
  existing: ExistingMisconception;
  similarity: number;
}

export function matchMisconception(
  candidate: { category: string; description: string },
  existing: ExistingMisconception[],
): MisconceptionMatch | null {
  const candCat = normalizeCategory(candidate.category);
  const candTokens = tokens(`${candidate.category} ${candidate.description}`);

  let best: MisconceptionMatch | null = null;
  for (const e of existing) {
    let similarity = 0;
    if (normalizeCategory(e.category) === candCat && candCat.length > 0) {
      similarity = 1;
    } else {
      similarity = jaccard(
        candTokens,
        tokens(`${e.category} ${e.description}`),
      );
    }
    if (
      similarity >= MATCH_THRESHOLD &&
      (!best || similarity > best.similarity)
    ) {
      best = { existing: e, similarity };
    }
  }
  return best;
}

export interface MisconceptionCreatePlan {
  category: string;
  description: string;
  confidence: number;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}

export interface MisconceptionStrengthenPlan {
  id: string;
  newConfidence: number;
  newDetections: number;
  escalateSeverity: boolean;
}

export interface MisconceptionUpdatePlan {
  creates: MisconceptionCreatePlan[];
  strengthens: MisconceptionStrengthenPlan[];
  /** The same misconception has now been seen >= REPEATED_DETECTION_COUNT times. */
  hasRepeated: boolean;
}

export function planMisconceptionUpdates(params: {
  candidates: MisconceptionCandidate[];
  existing: ExistingMisconception[];
  minConfidence?: number;
}): MisconceptionUpdatePlan {
  const minConfidence =
    params.minConfidence ?? MISCONCEPTION_CREATE_MIN_CONFIDENCE;
  const creates: MisconceptionCreatePlan[] = [];
  const strengthens: MisconceptionStrengthenPlan[] = [];
  const matchedIds = new Set<string>();
  let hasRepeated = false;

  for (const candidate of params.candidates) {
    const match = matchMisconception(candidate, params.existing);
    if (match && !matchedIds.has(match.existing.id)) {
      matchedIds.add(match.existing.id);
      const newDetections = match.existing.detections + 1;
      const newConfidence = clamp01(
        Math.max(match.existing.confidence, candidate.confidence) + 0.12,
      );
      if (newDetections >= REPEATED_DETECTION_COUNT) hasRepeated = true;
      strengthens.push({
        id: match.existing.id,
        newConfidence,
        newDetections,
        escalateSeverity: newDetections >= REPEATED_DETECTION_COUNT,
      });
    } else if (!match && candidate.confidence >= minConfidence) {
      creates.push({
        category: candidate.category,
        description: candidate.description,
        confidence: clamp01(candidate.confidence),
        severity: candidate.confidence >= 0.8 ? "HIGH" : "MEDIUM",
      });
    }
  }

  // Any already-repeated misconception that resurfaced also counts.
  for (const e of params.existing) {
    if (matchedIds.has(e.id) && e.detections + 1 >= REPEATED_DETECTION_COUNT) {
      hasRepeated = true;
    }
  }

  return { creates, strengthens, hasRepeated };
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

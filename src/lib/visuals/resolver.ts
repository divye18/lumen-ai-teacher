import type { VisualDirective } from "@/types/visuals";

import { VISUAL_CATALOGUE, type VisualVariants } from "./catalogue";
import { coerceVisualDirective } from "./validate";

/**
 * DETERMINISTIC VISUAL RESOLVER.
 *
 *   concept + teaching action + strategy + learner state  ->  VisualDirective
 *
 * The teaching engine decides WHEN a visual helps and how hard the learner is
 * finding the concept; this maps that to a concrete, pre-validated directive.
 * Never runs a model. Always returns a schema-valid directive (worst case a
 * TEXT caption), so a lesson never stalls waiting for a picture.
 */

export type LearnerVisualSignal =
  "struggling" | "steady" | "strong" | "misconception";

export interface ResolveVisualInput {
  conceptKey: string;
  title: string;
  summary: string;
  /** Teaching action that produced this content (EXPLAIN, RETEACH, RECAP…). */
  action: string;
  /** Teaching strategy in effect. */
  strategy: string;
  learnerSignal: LearnerVisualSignal;
}

export interface ResolvedVisual {
  directive: VisualDirective;
  /** Where the directive came from — for the "visible intelligence" panel. */
  source: "catalogue" | "heuristic" | "text";
  /** Catalogue entry id or heuristic kind. */
  basis: string;
  /** One learner-safe sentence on why this representation was chosen. */
  rationale: string;
}

const COMPARE_HINTS = [
  " vs ",
  " versus ",
  "compare",
  "comparison",
  "difference between",
  "differ",
];
const PROCESS_HINTS = [
  "how ",
  "process",
  "lifecycle",
  "life cycle",
  "steps",
  "pipeline",
  "workflow",
  "sequence",
  "algorithm",
];
const FORMULA_HINTS = [
  "formula",
  "equation",
  "calculate",
  "= ",
  "ratio",
  "rate",
];

function pickVariant(
  variants: VisualVariants,
  signal: LearnerVisualSignal,
  strategy: string,
): { directive: VisualDirective; note: string } {
  const visualLeaning = strategy === "visual-first";
  if (signal === "misconception" && variants.alternate) {
    return {
      directive: variants.alternate,
      note: "showing this a different way after a repeated mix-up",
    };
  }
  if (signal === "struggling") {
    return {
      directive: variants.simple ?? variants.standard,
      note: "a stripped-down version while this is still forming",
    };
  }
  if (signal === "strong" && variants.advanced) {
    return {
      directive: variants.advanced,
      note: "the fuller picture since you're comfortable here",
    };
  }
  if (visualLeaning && variants.advanced) {
    return { directive: variants.advanced, note: "a richer visual" };
  }
  return { directive: variants.standard, note: "the standard visual" };
}

function sentences(text: string, max: number): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 3)
    .slice(0, max);
}

function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "step"
  );
}

function heuristicDirective(input: ResolveVisualInput): {
  directive: VisualDirective;
  basis: string;
} {
  const haystack = `${input.title} ${input.summary}`.toLowerCase();
  const parts = sentences(input.summary, 6);

  if (COMPARE_HINTS.some((h) => haystack.includes(h))) {
    const [a, b] = input.title.split(/\s+vs\.?\s+|\s+versus\s+/i);
    return {
      basis: "comparison",
      directive: {
        mode: "COMPARISON",
        caption: input.summary.slice(0, 300),
        comparison: {
          title: input.title.slice(0, 200),
          left: {
            title: (a ?? "One side").trim().slice(0, 120) || "One side",
            points: parts.slice(0, 3).length
              ? parts.slice(0, 3)
              : ["See the explanation"],
          },
          right: {
            title: (b ?? "The other side").trim().slice(0, 120) || "The other",
            points: parts.slice(3, 6).length
              ? parts.slice(3, 6)
              : ["See the explanation"],
          },
          rows: [],
        },
      },
    };
  }

  if (
    FORMULA_HINTS.some((h) => haystack.includes(h)) &&
    haystack.includes("=")
  ) {
    const expr = (input.summary.match(/[^.]*=[^.]*/) ?? [input.title])[0]
      .trim()
      .slice(0, 400);
    return {
      basis: "formula",
      directive: {
        mode: "FORMULA",
        caption: input.title.slice(0, 300),
        formula: { expression: expr, terms: [], example: [] },
      },
    };
  }

  if (PROCESS_HINTS.some((h) => haystack.includes(h)) && parts.length >= 2) {
    return {
      basis: "process-flow",
      directive: {
        mode: "DIAGRAM",
        caption: input.title.slice(0, 300),
        diagram: {
          layout: "flow",
          nodes: parts.map((p, i) => ({ key: `s${i}-${slug(p)}`, text: p })),
          edges: parts.slice(1).map((_, i) => ({
            from: `s${i}-${slug(parts[i])}`,
            to: `s${i + 1}-${slug(parts[i + 1])}`,
          })),
        },
      },
    };
  }

  if (parts.length >= 2) {
    return {
      basis: "concept-map",
      directive: {
        mode: "CONCEPT_MAP",
        caption: input.title.slice(0, 300),
        conceptMap: {
          root: input.title.slice(0, 120),
          branches: parts.slice(0, 5).map((p) => ({
            label: p.length > 118 ? `${p.slice(0, 117)}…` : p,
            children: [],
          })),
        },
      },
    };
  }

  return {
    basis: "text",
    directive: { mode: "TEXT", caption: input.summary.slice(0, 2000) },
  };
}

export function resolveVisual(input: ResolveVisualInput): ResolvedVisual {
  const haystack =
    `${input.conceptKey} ${input.title} ${input.summary}`.toLowerCase();

  const entry = VISUAL_CATALOGUE.find((e) =>
    e.match.some((m) => haystack.includes(m)),
  );

  if (entry) {
    const { directive, note } = pickVariant(
      entry.variants,
      input.learnerSignal,
      input.strategy,
    );
    return {
      directive: coerceVisualDirective(directive, input.summary.slice(0, 2000)),
      source: "catalogue",
      basis: entry.id,
      rationale: `Visualising ${input.title} — ${note}.`,
    };
  }

  const h = heuristicDirective(input);
  return {
    directive: coerceVisualDirective(h.directive, input.summary.slice(0, 2000)),
    source: h.basis === "text" ? "text" : "heuristic",
    basis: h.basis,
    rationale:
      h.basis === "text"
        ? "No visual would add much here — keeping it in words."
        : `Built a ${h.basis.replace(/-/g, " ")} from the explanation.`,
  };
}

/** Map live learner state to the visual signal the resolver expects. */
export function visualSignalFromState(input: {
  masteryPoints: number;
  lastClassification: string | null;
  repeatedMisconception: boolean;
  incorrectStreak: number;
  /** Prior attempts on this concept — a fresh concept is not "struggling". */
  attempts?: number;
}): LearnerVisualSignal {
  if (input.repeatedMisconception) return "misconception";
  if (input.incorrectStreak >= 1 || input.lastClassification === "INCORRECT") {
    return "struggling";
  }
  if (input.masteryPoints >= 71) return "strong";
  // Low mastery only reads as "struggling" once the learner has actually tried.
  if ((input.attempts ?? 0) > 0 && input.masteryPoints < 35)
    return "struggling";
  return "steady";
}

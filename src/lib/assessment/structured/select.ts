import type { QuestionKind } from "@/lib/db/enums";

import { ASSESSMENT_BANK } from "./bank";
import type { StructuredQuestion } from "./contracts";
import { structuredQuestionSchema } from "./contracts";
import { generateStructuredFromTemplate } from "./template";

/**
 * STRUCTURED QUESTION SELECTION.
 *
 * Deterministic. Picks the best structured question for a concept + the
 * learner's live state, preferring the authored bank and falling back to the
 * grounded template generator. Returns `null` when no safe structured question
 * is available — the orchestrator then uses the free-form path.
 */

const KIND_ORDER: QuestionKind[] = [
  "CONCEPTUAL",
  "APPLICATION",
  "SCENARIO",
  "PROBLEM_SOLVING",
];

export interface PickStructuredInput {
  conceptKey: string;
  title: string;
  summary: string;
  /** Target question kind from the difficulty ladder. */
  targetKind: QuestionKind;
  difficulty: number;
  masteryPoints: number;
  /** True when the learner just answered incorrectly / is struggling. */
  struggling: boolean;
  /** Prompts already used this session (avoid repeats). */
  usedPrompts: string[];
  /**
   * Adaptive teacher memory: a structured format the learner has been
   * measurably weaker on. When set, a candidate in that format is preferred
   * (deterministic, after kind + misconception ranking) so the weak spot gets
   * deliberate practice rather than being avoided.
   */
  preferFormat?: string | null;
  /** Graph structure for the template generator. */
  graph?: {
    prerequisiteTitles: string[];
    dependentTitles: string[];
    otherConceptTitles: string[];
  };
}

export interface PickedStructuredQuestion {
  question: StructuredQuestion;
  origin: "bank" | "template";
}

function kindDistance(a: QuestionKind, b: QuestionKind): number {
  return Math.abs(KIND_ORDER.indexOf(a) - KIND_ORDER.indexOf(b));
}

function hasMisconceptionDistractor(q: StructuredQuestion): boolean {
  switch (q.format) {
    case "MCQ":
    case "MULTI_SELECT":
      return q.data.options.some((o) => o.misconception);
    case "TRUE_FALSE":
      return Boolean(q.data.misconception);
    case "CLASSIFY":
      return q.data.items.some((i) => i.misconception);
    case "MATCH_RELATIONSHIP":
      return Boolean(q.data.misconceptionByLeft);
    default:
      return false;
  }
}

export function pickStructuredQuestion(
  input: PickStructuredInput,
): PickedStructuredQuestion | null {
  const haystack =
    `${input.conceptKey} ${input.title} ${input.summary}`.toLowerCase();
  const used = new Set(input.usedPrompts.map((p) => p.trim()));

  const entry = ASSESSMENT_BANK.find((e) =>
    e.match.some((m) => haystack.includes(m)),
  );

  if (entry) {
    const candidates = entry.questions
      .filter((q) => !used.has(q.prompt.trim()))
      .filter((q) => structuredQuestionSchema.safeParse(q).success);

    if (candidates.length > 0) {
      // Rank: prefer matching kind, then a misconception-targeting question
      // when the learner is struggling / low mastery, then closest difficulty,
      // then a stable tiebreak on the prompt.
      const wantMisconception = input.struggling || input.masteryPoints < 55;
      const ranked = [...candidates].sort((a, b) => {
        const kd =
          kindDistance(a.kind, input.targetKind) -
          kindDistance(b.kind, input.targetKind);
        if (kd !== 0) return kd;
        if (wantMisconception) {
          const md =
            Number(hasMisconceptionDistractor(b)) -
            Number(hasMisconceptionDistractor(a));
          if (md !== 0) return md;
        }
        if (input.preferFormat) {
          const fd =
            Number(b.format === input.preferFormat) -
            Number(a.format === input.preferFormat);
          if (fd !== 0) return fd;
        }
        const dd =
          Math.abs(a.difficulty - input.difficulty) -
          Math.abs(b.difficulty - input.difficulty);
        if (dd !== 0) return dd;
        return a.prompt < b.prompt ? -1 : 1;
      });
      return { question: ranked[0], origin: "bank" };
    }
  }

  // Bank exhausted or no entry — try the grounded template generator.
  if (input.graph) {
    const generated = generateStructuredFromTemplate({
      title: input.title,
      kind: input.targetKind,
      difficulty: input.difficulty,
      prerequisiteTitles: input.graph.prerequisiteTitles,
      dependentTitles: input.graph.dependentTitles,
      otherConceptTitles: input.graph.otherConceptTitles,
    });
    if (generated && !used.has(generated.prompt.trim())) {
      return { question: generated, origin: "template" };
    }
  }

  return null;
}

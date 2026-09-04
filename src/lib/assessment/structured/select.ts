import type { QuestionKind } from "@/lib/db/enums";
import { misconceptionCategoriesInQuestion } from "@/lib/learner/misconception-resolution";

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
  /**
   * 9.2 targeted verification: the normalized category of an unresolved
   * (ACTIVE/IMPROVING) misconception the learner has already received
   * remediation for. When set, a bank candidate that tests this exact
   * misconception (via a distractor mapped to it) outranks ordinary
   * kind/format/difficulty-only ranking — deliberately verifying whether the
   * misconception is actually gone rather than just asking another question.
   * Never forces a bad-fit question: when no candidate tests it, ranking
   * falls through unchanged to the ordinary criteria below.
   */
  verifyMisconceptionCategory?: string | null;
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

/** Whether a candidate's distractor(s) test exactly this misconception category. */
function targetsVerificationCategory(
  q: StructuredQuestion,
  category: string,
): boolean {
  return misconceptionCategoriesInQuestion(q).includes(category);
}

export interface RankStructuredCandidatesInput {
  targetKind: QuestionKind;
  difficulty: number;
  /** True when the learner just answered incorrectly / is struggling. */
  wantMisconception: boolean;
  preferFormat?: string | null;
  /** See `PickStructuredInput.verifyMisconceptionCategory`. */
  verifyMisconceptionCategory?: string | null;
}

/**
 * Pure ranking of already-filtered structured question candidates. Extracted
 * from `pickStructuredQuestion` so both the bank-lookup path and tests can
 * exercise it directly, independent of what happens to be authored in the
 * bank right now.
 *
 * Priority: (1) verification targeting — a candidate that tests the tracked
 * misconception outranks everything else, when requested; (2) matching
 * question kind; (3) a general misconception-targeting question when the
 * learner is struggling; (4) the learner's format weak spot; (5) closest
 * difficulty; (6) a stable tiebreak on the prompt.
 */
export function rankStructuredCandidates(
  candidates: StructuredQuestion[],
  opts: RankStructuredCandidatesInput,
): StructuredQuestion[] {
  const verifyCategory = opts.verifyMisconceptionCategory ?? null;
  return [...candidates].sort((a, b) => {
    if (verifyCategory) {
      const vd =
        Number(targetsVerificationCategory(b, verifyCategory)) -
        Number(targetsVerificationCategory(a, verifyCategory));
      if (vd !== 0) return vd;
    }
    const kd =
      kindDistance(a.kind, opts.targetKind) -
      kindDistance(b.kind, opts.targetKind);
    if (kd !== 0) return kd;
    if (opts.wantMisconception) {
      const md =
        Number(hasMisconceptionDistractor(b)) -
        Number(hasMisconceptionDistractor(a));
      if (md !== 0) return md;
    }
    if (opts.preferFormat) {
      const fd =
        Number(b.format === opts.preferFormat) -
        Number(a.format === opts.preferFormat);
      if (fd !== 0) return fd;
    }
    const dd =
      Math.abs(a.difficulty - opts.difficulty) -
      Math.abs(b.difficulty - opts.difficulty);
    if (dd !== 0) return dd;
    return a.prompt < b.prompt ? -1 : 1;
  });
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
      const wantMisconception = input.struggling || input.masteryPoints < 55;
      const ranked = rankStructuredCandidates(candidates, {
        targetKind: input.targetKind,
        difficulty: input.difficulty,
        wantMisconception,
        preferFormat: input.preferFormat,
        verifyMisconceptionCategory: input.verifyMisconceptionCategory,
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

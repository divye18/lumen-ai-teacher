import type { QuestionKind } from "@/lib/db/enums";

import type { StructuredQuestion } from "./contracts";

/**
 * DETERMINISTIC TEMPLATE GENERATOR.
 *
 * Builds a structured question for a concept that has no authored bank entry —
 * using ONLY facts that are already persisted (the concept's real prerequisite
 * / dependent relationships in the knowledge graph). It never invents a fact.
 * When there isn't enough grounded structure to build a safe question it
 * returns `null`, and the orchestrator falls back to a free-form question.
 */

export interface TemplateInput {
  title: string;
  kind: QuestionKind;
  difficulty: number;
  /** Real prerequisite concept titles from the graph. */
  prerequisiteTitles: string[];
  /** Real dependent concept titles from the graph. */
  dependentTitles: string[];
  /** Other concept titles in the same lesson/graph — used as distractors. */
  otherConceptTitles: string[];
}

function slugId(prefix: string, i: number): string {
  return `${prefix}${i}`;
}

/** Deterministic pick: sort, take the first. */
function firstSorted(items: string[]): string | null {
  const sorted = [
    ...new Set(items.map((s) => s.trim()).filter(Boolean)),
  ].sort();
  return sorted[0] ?? null;
}

function distractors(
  pool: string[],
  exclude: Set<string>,
  n: number,
): string[] {
  return [...new Set(pool.map((s) => s.trim()).filter(Boolean))]
    .filter((t) => !exclude.has(t))
    .sort()
    .slice(0, n);
}

export function generateStructuredFromTemplate(
  input: TemplateInput,
): StructuredQuestion | null {
  const clampedDifficulty = Math.min(
    5,
    Math.max(1, Math.round(input.difficulty)),
  );

  // Template 1 — prerequisite MCQ (grounded in real graph edges).
  const prereq = firstSorted(input.prerequisiteTitles);
  if (prereq) {
    const wrong = distractors(
      input.otherConceptTitles,
      new Set([prereq, input.title, ...input.prerequisiteTitles]),
      3,
    );
    if (wrong.length >= 2) {
      const options = [prereq, ...wrong.slice(0, 3)]
        .map((text, i) => ({ id: slugId("o", i), text }))
        .sort((a, b) => (a.text < b.text ? -1 : 1));
      const correctId = options.find((o) => o.text === prereq)!.id;
      return {
        format: "MCQ",
        kind: input.kind,
        difficulty: clampedDifficulty,
        prompt: `Which of these do you need to understand *before* ${input.title}?`,
        data: { options, correctId },
      };
    }
  }

  // Template 2 — dependent MCQ (grounded in real graph edges).
  const dependent = firstSorted(input.dependentTitles);
  if (dependent) {
    const wrong = distractors(
      input.otherConceptTitles,
      new Set([dependent, input.title, ...input.dependentTitles]),
      3,
    );
    if (wrong.length >= 2) {
      const options = [dependent, ...wrong.slice(0, 3)]
        .map((text, i) => ({ id: slugId("d", i), text }))
        .sort((a, b) => (a.text < b.text ? -1 : 1));
      const correctId = options.find((o) => o.text === dependent)!.id;
      return {
        format: "MCQ",
        kind: input.kind,
        difficulty: clampedDifficulty,
        prompt: `${input.title} is a building block for which of these concepts?`,
        data: { options, correctId },
      };
    }
  }

  // Not enough grounded structure — do not invent a question.
  return null;
}

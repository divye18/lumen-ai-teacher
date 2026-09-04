import type {
  ClientTeachingQuestion,
  InteractionRow,
  TeachingAnswerRow,
} from "@/lib/db/repositories";

import type { ConceptOutcome } from "./session-report";

/**
 * THE LEARNING STORY.
 *
 * A short, ordered narrative of what happened this session — built purely from
 * persisted evidence (answers, question kinds/difficulty, teaching-decision
 * interactions, mastery outcomes). Every sentence is backed by a real signal;
 * nothing is invented, and it never surfaces chain-of-thought.
 */

interface StoryInput {
  outcomes: ConceptOutcome[];
  answers: TeachingAnswerRow[];
  questions: ClientTeachingQuestion[];
  interactions: InteractionRow[];
  /** The same misconception was seen twice or more. */
  repeatedMisconception: boolean;
}

const KIND_TERM: Record<string, string> = {
  CONCEPTUAL: "the definition",
  APPLICATION: "applying it",
  SCENARIO: "real scenarios",
  PROBLEM_SOLVING: "working problems",
};

const REPRESENTATION_TERM: Record<string, string> = {
  EXAMPLE: "a worked example",
  ANALOGY: "an analogy",
  VISUALIZE: "a visual",
  SIMPLIFY: "a simpler explanation",
  RETEACH: "a fresh explanation",
};

function rateByKind(
  answers: TeachingAnswerRow[],
  kindOf: (id: string) => string | undefined,
): Map<string, { total: number; correct: number }> {
  const by = new Map<string, { total: number; correct: number }>();
  for (const a of answers) {
    const k = kindOf(a.question_id);
    if (!k) continue;
    const b = by.get(k) ?? { total: 0, correct: 0 };
    b.total += 1;
    if (a.classification === "CORRECT") b.correct += 1;
    by.set(k, b);
  }
  return by;
}

export function buildLearningStory(input: StoryInput): string[] {
  const { outcomes, answers, questions } = input;
  const story: string[] = [];
  if (answers.length === 0) return story;

  const kindOf = new Map(questions.map((q) => [q.id, q.question_kind]));
  const conceptOf = new Map(questions.map((q) => [q.id, q.concept_key]));
  const difficultyOf = new Map(questions.map((q) => [q.id, q.difficulty]));
  const titleOf = new Map(outcomes.map((o) => [o.key, o.title]));
  const kind = (id: string) => kindOf.get(id);
  const rates = rateByKind(answers, kind);

  const ordered = [...answers].sort((a, b) =>
    a.created_at < b.created_at ? -1 : 1,
  );

  // 1. What's solid — the concept that ended strongest.
  const strongest = [...outcomes]
    .filter((o) => o.masteryAfter >= 55)
    .sort((a, b) => b.masteryAfter - a.masteryAfter)[0];
  if (strongest) {
    story.push(
      `Your understanding of ${strongest.title} is ${
        strongest.masteryAfter >= 71 ? "strong" : "coming together"
      }.`,
    );
  }

  // 2. Where it was harder — recall solid but transfer weak.
  const conceptual = rates.get("CONCEPTUAL");
  const applied = rates.get("APPLICATION");
  const scenario = rates.get("SCENARIO") ?? rates.get("PROBLEM_SOLVING");
  const weakTransfer = [applied, scenario].find(
    (r) => r && r.total > 0 && r.correct / r.total < 0.5,
  );
  if (
    conceptual &&
    conceptual.total > 0 &&
    conceptual.correct / conceptual.total >= 0.6 &&
    weakTransfer
  ) {
    const term =
      applied && applied.total > 0 && applied.correct / applied.total < 0.5
        ? KIND_TERM.APPLICATION
        : KIND_TERM.SCENARIO;
    story.push(`You were solid on the idea but less sure when ${term}.`);
  }

  // 3. A representation change that landed — a teaching turn (example / analogy
  //    / reteach) for a concept, followed by a better answer on it.
  const teachingTurns = input.interactions
    .filter((i) => i.role === "TEACHER" || i.role === "SYSTEM")
    .map((i) => ({
      at: Date.parse(i.created_at),
      action: String(
        (i.metadata as Record<string, unknown> | null)?.action ?? "",
      ),
      conceptKey: String(
        (i.metadata as Record<string, unknown> | null)?.conceptKey ?? "",
      ),
    }))
    .filter((t) => REPRESENTATION_TERM[t.action]);

  for (const turn of teachingTurns) {
    const nextAnswer = ordered.find(
      (a) =>
        Date.parse(a.created_at) > turn.at &&
        conceptOf.get(a.question_id) === turn.conceptKey,
    );
    if (nextAnswer && nextAnswer.classification === "CORRECT") {
      const title = titleOf.get(turn.conceptKey) ?? turn.conceptKey;
      story.push(
        `${capitalize(REPRESENTATION_TERM[turn.action])} for ${title} led to a correct answer next.`,
      );
      break;
    }
  }

  // 4. Difficulty adaptation — a later question on a recovering concept was
  //    harder than the earlier one.
  for (const o of outcomes) {
    if (o.delta <= 0) continue;
    const conceptAnswers = ordered.filter(
      (a) => conceptOf.get(a.question_id) === o.key,
    );
    if (conceptAnswers.length < 2) continue;
    const firstDiff = difficultyOf.get(conceptAnswers[0].question_id) ?? 3;
    const lastDiff =
      difficultyOf.get(conceptAnswers[conceptAnswers.length - 1].question_id) ??
      3;
    const struggledEarly = conceptAnswers[0].classification !== "CORRECT";
    if (lastDiff > firstDiff && struggledEarly) {
      story.push(
        `After your answers on ${o.title} improved, Lumen raised the difficulty.`,
      );
      break;
    }
  }

  // 5. Misconception handling.
  if (input.repeatedMisconception) {
    story.push(
      "The same misconception came back, so Lumen switched to a different explanation before checking again.",
    );
  }

  return story.slice(0, 5);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

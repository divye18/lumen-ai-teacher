import type {
  ClientTeachingQuestion,
  InteractionRow,
  TeachingAnswerRow,
} from "@/lib/db/repositories";
import { TEACHING_STYLES, type TeachingStyle } from "@/lib/db/enums";

/**
 * ADAPTIVE STRATEGY MEMORY.
 *
 * A small, deterministic, auditable signal: for each teaching strategy, how
 * often did the learner's NEXT answer improve after it was used? No model, no
 * ranking system — just "strategy → observed outcome" over real evidence.
 *
 * The teaching engine may use `preferredStrategy` as ONE input when choosing a
 * remediation approach; it never overrides the deterministic policy.
 */

export interface StrategyOutcome {
  strategy: TeachingStyle;
  /** Times a teaching turn used this strategy and was followed by an answer. */
  exposures: number;
  /** Of those, how many were followed by a CORRECT / PARTIALLY_CORRECT answer. */
  improvements: number;
  /** improvements / exposures, or null when there is no evidence. */
  successRate: number | null;
}

export interface StrategyMemory {
  outcomes: StrategyOutcome[];
  /** The strategy with the strongest positive evidence, or null. */
  preferredStrategy: TeachingStyle | null;
  /** Total answers that could be attributed to a strategy. */
  evidenceCount: number;
}

const TEACHING_INTERACTION_TYPES = new Set([
  "EXPLANATION",
  "RETEACH",
  "RECAP",
  "VISUAL",
  "HINT",
]);
const MIN_EXPOSURES = 2;
const MIN_MARGIN = 0.2;

function asStrategy(value: unknown): TeachingStyle | null {
  return typeof value === "string" &&
    (TEACHING_STYLES as readonly string[]).includes(value)
    ? (value as TeachingStyle)
    : null;
}

export function buildStrategyMemory(input: {
  interactions: InteractionRow[];
  answers: TeachingAnswerRow[];
  questions: ClientTeachingQuestion[];
}): StrategyMemory {
  const conceptByQuestion = new Map(
    input.questions.map((q) => [q.id, q.concept_key]),
  );

  // Teaching turns with a known strategy, oldest first, per concept.
  const turns = input.interactions
    .filter(
      (i) =>
        i.role === "TEACHER" &&
        TEACHING_INTERACTION_TYPES.has(i.interaction_type),
    )
    .map((i) => {
      const meta = (i.metadata as Record<string, unknown> | null) ?? {};
      return {
        at: Date.parse(i.created_at),
        strategy: asStrategy(meta.strategy),
        conceptKey:
          typeof meta.conceptKey === "string" ? meta.conceptKey : null,
      };
    })
    .filter((t) => t.strategy && Number.isFinite(t.at))
    .sort((a, b) => a.at - b.at);

  const tally = new Map<
    TeachingStyle,
    { exposures: number; improvements: number }
  >();
  let evidenceCount = 0;

  for (const answer of input.answers) {
    const answeredAt = Date.parse(answer.created_at);
    if (!Number.isFinite(answeredAt)) continue;
    const conceptKey = conceptByQuestion.get(answer.question_id) ?? null;

    // Most recent teaching turn before this answer, same concept when known.
    let matched: (typeof turns)[number] | null = null;
    for (const turn of turns) {
      if (turn.at > answeredAt) break;
      if (conceptKey && turn.conceptKey && turn.conceptKey !== conceptKey) {
        continue;
      }
      matched = turn;
    }
    if (!matched?.strategy) continue;

    evidenceCount += 1;
    const bucket = tally.get(matched.strategy) ?? {
      exposures: 0,
      improvements: 0,
    };
    bucket.exposures += 1;
    if (
      answer.classification === "CORRECT" ||
      answer.classification === "PARTIALLY_CORRECT"
    ) {
      bucket.improvements += 1;
    }
    tally.set(matched.strategy, bucket);
  }

  const outcomes: StrategyOutcome[] = [...tally.entries()]
    .map(([strategy, b]) => ({
      strategy,
      exposures: b.exposures,
      improvements: b.improvements,
      successRate: b.exposures > 0 ? b.improvements / b.exposures : null,
    }))
    .sort((a, b) => (b.successRate ?? 0) - (a.successRate ?? 0));

  // Confident preference: enough exposures, clearly ahead of the next best.
  let preferredStrategy: TeachingStyle | null = null;
  const eligible = outcomes.filter(
    (o) => o.exposures >= MIN_EXPOSURES && o.successRate !== null,
  );
  if (eligible.length > 0) {
    const top = eligible[0];
    const runnerUp = eligible[1];
    if (
      (top.successRate ?? 0) >= 0.6 &&
      (!runnerUp ||
        (top.successRate ?? 0) - (runnerUp.successRate ?? 0) >= MIN_MARGIN)
    ) {
      preferredStrategy = top.strategy;
    }
  }

  return { outcomes, preferredStrategy, evidenceCount };
}

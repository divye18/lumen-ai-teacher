import type {
  ClientTeachingQuestion,
  TeachingAnswerRow,
} from "@/lib/db/repositories";
import type { StrategyMemory } from "@/lib/learner";

import type { ConceptNode } from "./overview";
import type { KnowledgeGraphView } from "@/lib/graph";

/**
 * "HOW LUMEN SEES YOUR LEARNING".
 *
 * Every observation is backed by real evidence and only appears when the data
 * actually supports it. No psychological profiling, no unsupported claims. Pure
 * function — deterministic for a given evidence set.
 */

export interface Observation {
  id: string;
  /** Learner-facing statement. */
  text: string;
  /** Short, concrete evidence line ("18 answers · recall 82% vs applied 44%"). */
  evidence: string;
}

const STRATEGY_LABEL: Record<string, string> = {
  formal: "precise definitions",
  conversational: "plain-language explanations",
  "example-first": "worked examples",
  "analogy-first": "analogies",
  "visual-first": "mental models",
  socratic: "guided questioning",
};

function rate(
  answers: TeachingAnswerRow[],
  questionKind: (id: string) => string | undefined,
  kinds: string[],
): { total: number; correct: number } {
  let total = 0;
  let correct = 0;
  for (const a of answers) {
    const k = questionKind(a.question_id);
    if (!k || !kinds.includes(k)) continue;
    total += 1;
    if (a.classification === "CORRECT") correct += 1;
  }
  return { total, correct };
}

export function buildObservations(input: {
  answers: TeachingAnswerRow[];
  questions: ClientTeachingQuestion[];
  concepts: ConceptNode[];
  strategyMemory: StrategyMemory;
  graph?: Pick<KnowledgeGraphView, "nodes" | "edges"> | null;
}): Observation[] {
  const out: Observation[] = [];
  const kindOf = new Map(input.questions.map((q) => [q.id, q.question_kind]));
  const kind = (id: string) => kindOf.get(id);

  // 1. Recall vs application.
  const recall = rate(input.answers, kind, ["CONCEPTUAL"]);
  const applied = rate(input.answers, kind, [
    "APPLICATION",
    "SCENARIO",
    "PROBLEM_SOLVING",
  ]);
  if (recall.total >= 3 && applied.total >= 3) {
    const r = recall.correct / recall.total;
    const a = applied.correct / applied.total;
    if (r - a >= 0.25) {
      out.push({
        id: "recall-over-application",
        text: "Your recall is stronger than your application right now.",
        evidence: `Definitions ${Math.round(r * 100)}% vs applied ${Math.round(a * 100)}% over ${recall.total + applied.total} answers.`,
      });
    } else if (a - r >= 0.25) {
      out.push({
        id: "application-over-recall",
        text: "You reason well with problems even when the formal definition is still forming.",
        evidence: `Applied ${Math.round(a * 100)}% vs definitions ${Math.round(r * 100)}% over ${recall.total + applied.total} answers.`,
      });
    }
  }

  // 2. Strategy that helps.
  if (input.strategyMemory.preferredStrategy) {
    const s = input.strategyMemory.preferredStrategy;
    const outcome = input.strategyMemory.outcomes.find((o) => o.strategy === s);
    out.push({
      id: "preferred-strategy",
      text: `You tend to improve after ${STRATEGY_LABEL[s] ?? s}.`,
      evidence: outcome
        ? `${outcome.improvements}/${outcome.exposures} answers improved after this approach.`
        : "Consistent gains after this approach.",
    });
  }

  // 3. Foundational concepts secured (graph-aware).
  if (input.graph && input.graph.edges.length > 0) {
    const prereqSourceIds = new Set(
      input.graph.edges
        .filter((e) => e.type === "PREREQUISITE")
        .map((e) => e.source),
    );
    const secured = input.graph.nodes.filter(
      (n) => prereqSourceIds.has(n.id) && n.assessed && n.masteryPoints >= 60,
    );
    if (secured.length >= 2) {
      out.push({
        id: "foundations-secured",
        text: `You've secured ${secured.length} foundational concepts that later material builds on.`,
        evidence: secured
          .slice(0, 3)
          .map((n) => n.title)
          .join(", "),
      });
    }
  }

  // 4. Answering speed.
  const times = input.answers
    .map((a) => a.response_time_ms)
    .filter((t): t is number => typeof t === "number" && t > 0);
  if (times.length >= 5) {
    const avg = times.reduce((s, t) => s + t, 0) / times.length / 1000;
    if (avg < 14) {
      out.push({
        id: "answers-fast",
        text: "You answer fast — slowing down on the harder questions could lift your accuracy.",
        evidence: `Average response time ${Math.round(avg)}s across ${times.length} answers.`,
      });
    }
  }

  // 5. Recurring misconception.
  const recurring = input.concepts
    .filter((c) => c.misconceptionCount > 0)
    .sort((a, b) => b.misconceptionCount - a.misconceptionCount)[0];
  if (recurring && recurring.misconceptionCount >= 1 && out.length < 4) {
    out.push({
      id: "recurring-misconception",
      text: `A misconception around ${recurring.title} keeps resurfacing.`,
      evidence: `${recurring.misconceptionCount} active misconception${recurring.misconceptionCount === 1 ? "" : "s"} on this concept.`,
    });
  }

  return out.slice(0, 4);
}

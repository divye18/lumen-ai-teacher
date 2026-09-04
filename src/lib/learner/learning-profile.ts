import type {
  ClientTeachingQuestion,
  InteractionRow,
  MisconceptionRow,
  TeachingAnswerRow,
} from "@/lib/db/repositories";
import type { TeachingStyle } from "@/lib/db/enums";

import type { StrategyMemory } from "./strategy-memory";

/**
 * ADAPTIVE TEACHER MEMORY — the derived learning profile.
 *
 * A deterministic, auditable read of HOW a learner learns, derived only from
 * evidence that is already persisted (answers, questions, teaching turns,
 * mastery, misconceptions). No model. No psychological labels, no personality
 * types — every signal is a statement about observed learning behaviour, gated
 * on real evidence, and carries its own evidence record.
 *
 * The profile is DESCRIPTIVE. Turning it into teaching changes is the job of
 * `personalizeTeaching` (personalization-policy.ts); the deterministic policy
 * stays authoritative.
 */

export type LearningSignalKind =
  /** Recovers faster after a worked example / analogy than after abstract explanation. */
  | "example-recovery"
  /** Improves after a visual reframing of the idea. */
  | "visual-reframe-effective"
  /** Recall (definitions) clearly ahead of application right now. */
  | "recall-ahead-of-application"
  /** Application/scenario reasoning ahead of formal recall. */
  | "application-ahead-of-recall"
  /** One question format is a persistent weak spot versus another. */
  | "format-specific-weakness"
  /** Reliably recovers on the next check after a simplification / reteach. */
  | "simplification-recovery"
  /** A specific misconception family keeps resurfacing. */
  | "recurring-misconception"
  /** Recent performance trend (improving / dipping). */
  | "learning-momentum"
  /** How consistent recent performance is (steady vs volatile). */
  | "performance-consistency";

/** Internal evidence for one signal. Rich internally; only `summary` is exposed. */
export interface SignalEvidence {
  /** Observations the signal is built on. */
  evidenceCount: number;
  /** 0..1 — how strongly the evidence supports the signal. */
  confidence: number;
  /** ISO timestamp of the most recent supporting observation. */
  lastObservedAt: string | null;
  /** Answer / interaction ids behind the signal. INTERNAL — never surfaced. */
  supportingInteractions: string[];
}

export interface LearningSignal {
  kind: LearningSignalKind;
  /** Structured, machine-readable specifics (rates, formats, strategy, …). */
  detail: Record<string, string | number | boolean | null>;
  /** One concise learner-facing sentence. Observable behaviour only. */
  summary: string;
  evidence: SignalEvidence;
}

export interface LearningProfile {
  signals: LearningSignal[];
  /** Total answers that could be attributed to any signal — the fallback gate. */
  sampleSize: number;
  computedAt: string;
  /** Concept title the learner is strongest on (>= 2 assessed concepts). */
  strongestConceptFamily: string | null;
  /** Concept title the learner is weakest on. */
  weakestConceptFamily: string | null;
}

/** Lean concept shape the profile needs — a subset of `ConceptNode`. */
export interface ProfileConcept {
  conceptKey: string;
  title: string;
  masteryPoints: number;
  attempts: number;
  misconceptionCount: number;
}

export interface LearningProfileInput {
  /** A user's answers across ALL sessions, any order. */
  answers: TeachingAnswerRow[];
  /** A user's questions across ALL sessions (client-safe). */
  questions: ClientTeachingQuestion[];
  /** A user's teaching-turn interactions across sessions. */
  interactions: InteractionRow[];
  /** Per-concept mastery / misconception roll-up. */
  concepts: ProfileConcept[];
  /** Active misconceptions across sessions. */
  misconceptions: MisconceptionRow[];
  /** The existing deterministic strategy -> outcome memory. */
  strategyMemory: StrategyMemory;
  nowISO?: string;
}

// ── thresholds (named, mirrors the conservatism of strategy-memory.ts) ──────
const MIN_KIND_SAMPLES = 3;
const MIN_FORMAT_SAMPLES = 3;
const RATE_GAP = 0.25;
const STRATEGY_MIN_EXPOSURES = 2;
const STRATEGY_MIN_RATE = 0.6;
const STRATEGY_EDGE = 0.15;
const MIN_SIMPLIFY_RECOVERIES = 2;
const MISCONCEPTION_RECURRENCE = 2;
const MOMENTUM_MIN_ANSWERS = 6;
const MOMENTUM_GAP = 0.2;
const CONSISTENCY_MIN_ANSWERS = 8;

const RECALL_KINDS = new Set(["CONCEPTUAL"]);
const APPLIED_KINDS = new Set(["APPLICATION", "SCENARIO", "PROBLEM_SOLVING"]);
const TEACHING_INTERACTION_TYPES = new Set([
  "EXPLANATION",
  "RETEACH",
  "RECAP",
  "VISUAL",
  "HINT",
]);
const SIMPLIFYING_ACTIONS = new Set([
  "SIMPLIFY",
  "RETEACH",
  "DECREASE_DIFFICULTY",
]);

const FORMAT_LABEL: Record<string, string> = {
  MCQ: "multiple-choice questions",
  MULTI_SELECT: "select-all questions",
  TRUE_FALSE: "true / false questions",
  ORDER_STEPS: "put-the-steps-in-order questions",
  CLASSIFY: "sort-into-groups questions",
  MATCH_RELATIONSHIP: "match-the-pairs questions",
  FREE_FORM: "written-answer questions",
};

const STRATEGY_LABEL: Record<string, string> = {
  formal: "precise definitions",
  conversational: "plain-language explanations",
  "example-first": "worked examples",
  "analogy-first": "analogies",
  "visual-first": "visual models",
  socratic: "guided questioning",
};

function ts(row: { created_at: string }): number {
  return Date.parse(row.created_at);
}

function isPositive(c: string | null): boolean {
  return c === "CORRECT" || c === "PARTIALLY_CORRECT";
}

/** Bounded confidence from sample size and effect size. */
function confidenceFrom(sampleSize: number, effect: number): number {
  const bySample = Math.min(1, sampleSize / 8);
  const byEffect = Math.min(1, Math.max(0, effect) / 0.4);
  return (
    Math.round(Math.min(0.95, 0.35 + 0.4 * bySample + 0.25 * byEffect) * 100) /
    100
  );
}

/**
 * Derive the learning profile. Pure and deterministic: the same evidence set
 * always yields byte-identical output.
 */
export function deriveLearningProfile(
  input: LearningProfileInput,
): LearningProfile {
  const computedAt = input.nowISO ?? new Date().toISOString();
  const signals: LearningSignal[] = [];

  const answers = [...input.answers].sort((a, b) => ts(a) - ts(b));
  const questionById = new Map(input.questions.map((q) => [q.id, q]));
  const kindOf = (qid: string) => questionById.get(qid)?.question_kind ?? null;
  const formatOf = (qid: string) =>
    questionById.get(qid)?.question_format ?? null;
  const conceptOf = (qid: string) => questionById.get(qid)?.concept_key ?? null;

  const attributable = answers.filter((a) => questionById.has(a.question_id));
  const sampleSize = attributable.length;

  // ── 1. recall vs application ─────────────────────────────────────────────
  {
    let rTotal = 0;
    let rOk = 0;
    let aTotal = 0;
    let aOk = 0;
    let lastAt: string | null = null;
    const ids: string[] = [];
    for (const ans of attributable) {
      const k = kindOf(ans.question_id);
      if (!k) continue;
      if (RECALL_KINDS.has(k)) {
        rTotal += 1;
        if (ans.classification === "CORRECT") rOk += 1;
        ids.push(ans.id);
        lastAt = ans.created_at;
      } else if (APPLIED_KINDS.has(k)) {
        aTotal += 1;
        if (ans.classification === "CORRECT") aOk += 1;
        ids.push(ans.id);
        lastAt = ans.created_at;
      }
    }
    if (rTotal >= MIN_KIND_SAMPLES && aTotal >= MIN_KIND_SAMPLES) {
      const r = rOk / rTotal;
      const a = aOk / aTotal;
      if (r - a >= RATE_GAP) {
        signals.push({
          kind: "recall-ahead-of-application",
          detail: {
            recallRate: round2(r),
            applicationRate: round2(a),
            recallSamples: rTotal,
            applicationSamples: aTotal,
          },
          summary:
            "You're stronger recalling definitions than applying them to new situations right now.",
          evidence: {
            evidenceCount: rTotal + aTotal,
            confidence: confidenceFrom(rTotal + aTotal, r - a),
            lastObservedAt: lastAt,
            supportingInteractions: ids,
          },
        });
      } else if (a - r >= RATE_GAP) {
        signals.push({
          kind: "application-ahead-of-recall",
          detail: {
            recallRate: round2(r),
            applicationRate: round2(a),
            recallSamples: rTotal,
            applicationSamples: aTotal,
          },
          summary:
            "You reason well through applied problems even while the formal definition is still settling.",
          evidence: {
            evidenceCount: rTotal + aTotal,
            confidence: confidenceFrom(rTotal + aTotal, a - r),
            lastObservedAt: lastAt,
            supportingInteractions: ids,
          },
        });
      }
    }
  }

  // ── 2. format-specific weakness ─────────────────────────────────────────
  {
    const byFormat = new Map<
      string,
      { total: number; ok: number; lastAt: string | null; ids: string[] }
    >();
    for (const ans of attributable) {
      const f = formatOf(ans.question_id);
      if (!f || f === "FREE_FORM") continue;
      const b = byFormat.get(f) ?? {
        total: 0,
        ok: 0,
        lastAt: null,
        ids: [],
      };
      b.total += 1;
      if (ans.classification === "CORRECT") b.ok += 1;
      b.lastAt = ans.created_at;
      b.ids.push(ans.id);
      byFormat.set(f, b);
    }
    const rated = [...byFormat.entries()]
      .filter(([, b]) => b.total >= MIN_FORMAT_SAMPLES)
      .map(([format, b]) => ({ format, rate: b.ok / b.total, ...b }))
      .sort((x, y) => x.rate - y.rate);
    if (rated.length >= 2) {
      const weak = rated[0];
      const strong = rated[rated.length - 1];
      if (strong.rate - weak.rate >= RATE_GAP && weak.rate < 0.5) {
        signals.push({
          kind: "format-specific-weakness",
          detail: {
            weakFormat: weak.format,
            weakRate: round2(weak.rate),
            strongFormat: strong.format,
            strongRate: round2(strong.rate),
          },
          summary: `You do well on ${
            FORMAT_LABEL[strong.format] ?? "some question types"
          } but ${
            FORMAT_LABEL[weak.format] ?? "another type"
          } trip you up more often.`,
          evidence: {
            evidenceCount: weak.total + strong.total,
            confidence: confidenceFrom(
              weak.total + strong.total,
              strong.rate - weak.rate,
            ),
            lastObservedAt: weak.lastAt,
            supportingInteractions: [...weak.ids, ...strong.ids],
          },
        });
      }
    }
  }

  // ── 3. strategy that helps: example / analogy, then visual ──────────────
  {
    const outcomes = input.strategyMemory.outcomes;
    const overall =
      outcomes.length > 0
        ? outcomes.reduce((s, o) => s + (o.successRate ?? 0) * o.exposures, 0) /
          Math.max(
            1,
            outcomes.reduce((s, o) => s + o.exposures, 0),
          )
        : 0;
    const pick = (
      strategies: TeachingStyle[],
    ): (typeof outcomes)[number] | null => {
      const eligible = outcomes
        .filter(
          (o) =>
            strategies.includes(o.strategy) &&
            o.exposures >= STRATEGY_MIN_EXPOSURES &&
            o.successRate !== null &&
            o.successRate >= STRATEGY_MIN_RATE &&
            o.successRate - overall >= STRATEGY_EDGE,
        )
        .sort((a, b) => (b.successRate ?? 0) - (a.successRate ?? 0));
      return eligible[0] ?? null;
    };
    const example = pick(["example-first", "analogy-first"]);
    if (example) {
      signals.push({
        kind: "example-recovery",
        detail: {
          strategy: example.strategy,
          successRate: round2(example.successRate ?? 0),
          exposures: example.exposures,
        },
        summary: `You tend to bounce back on the next check after ${
          STRATEGY_LABEL[example.strategy] ?? "a worked example"
        }.`,
        evidence: {
          evidenceCount: example.exposures,
          confidence: confidenceFrom(
            example.exposures * 2,
            (example.successRate ?? 0) - overall,
          ),
          lastObservedAt: null,
          supportingInteractions: [],
        },
      });
    }
    const visual = pick(["visual-first"]);
    if (visual) {
      signals.push({
        kind: "visual-reframe-effective",
        detail: {
          strategy: visual.strategy,
          successRate: round2(visual.successRate ?? 0),
          exposures: visual.exposures,
        },
        summary:
          "You often do better on the next check after the idea is shown as a visual model.",
        evidence: {
          evidenceCount: visual.exposures,
          confidence: confidenceFrom(
            visual.exposures * 2,
            (visual.successRate ?? 0) - overall,
          ),
          lastObservedAt: null,
          supportingInteractions: [],
        },
      });
    }
  }

  // ── 4. simplification recovery ─────────────────────────────────────────
  {
    const teachingTurns = [...input.interactions]
      .filter(
        (i) =>
          i.role === "TEACHER" &&
          TEACHING_INTERACTION_TYPES.has(i.interaction_type),
      )
      .map((i) => {
        const meta = (i.metadata as Record<string, unknown> | null) ?? {};
        return {
          at: ts(i),
          conceptKey:
            typeof meta.conceptKey === "string" ? meta.conceptKey : null,
          action: typeof meta.action === "string" ? meta.action : null,
          id: i.id,
        };
      })
      .filter((t) => Number.isFinite(t.at))
      .sort((a, b) => a.at - b.at);

    const byConcept = new Map<string, TeachingAnswerRow[]>();
    for (const ans of attributable) {
      const ck = conceptOf(ans.question_id);
      if (!ck) continue;
      const list = byConcept.get(ck) ?? [];
      list.push(ans);
      byConcept.set(ck, list);
    }

    let recoveries = 0;
    let lastAt: string | null = null;
    const ids: string[] = [];
    for (const [ck, list] of byConcept) {
      const ordered = list.sort((a, b) => ts(a) - ts(b));
      for (let i = 0; i < ordered.length - 1; i += 1) {
        if (ordered[i].classification !== "INCORRECT") continue;
        const next = ordered[i + 1];
        if (!isPositive(next.classification)) continue;
        const between = teachingTurns.some(
          (t) =>
            (t.conceptKey === ck || t.conceptKey === null) &&
            t.action !== null &&
            SIMPLIFYING_ACTIONS.has(t.action) &&
            t.at > ts(ordered[i]) &&
            t.at < ts(next),
        );
        if (between) {
          recoveries += 1;
          lastAt = next.created_at;
          ids.push(ordered[i].id, next.id);
        }
      }
    }
    if (recoveries >= MIN_SIMPLIFY_RECOVERIES) {
      signals.push({
        kind: "simplification-recovery",
        detail: { recoveries },
        summary:
          "When Lumen simplifies or reteaches after a wrong answer, your next answer is usually right.",
        evidence: {
          evidenceCount: recoveries,
          confidence: confidenceFrom(recoveries * 2, recoveries / 4),
          lastObservedAt: lastAt,
          supportingInteractions: ids,
        },
      });
    }
  }

  // ── 5. recurring misconception ─────────────────────────────────────────
  {
    const recurring = input.misconceptions
      .filter((m) => m.status !== "RESOLVED")
      .map((m) => {
        const detections =
          Number(
            (m.metadata as Record<string, unknown> | null)?.detections ?? 0,
          ) || (Array.isArray(m.evidence) ? m.evidence.length : 0);
        return { m, detections };
      })
      .filter((x) => x.detections >= MISCONCEPTION_RECURRENCE)
      .sort((a, b) => b.detections - a.detections)[0];
    if (recurring) {
      signals.push({
        kind: "recurring-misconception",
        detail: {
          category: recurring.m.category,
          detections: recurring.detections,
        },
        summary: `One specific mix-up keeps coming back — Lumen is tracking it and will keep targeting it.`,
        evidence: {
          evidenceCount: recurring.detections,
          confidence: Math.min(0.95, recurring.m.confidence),
          lastObservedAt: recurring.m.last_detected_at ?? null,
          supportingInteractions: [recurring.m.id],
        },
      });
    }
  }

  // ── 6. learning momentum ──────────────────────────────────────────────
  {
    const recent = attributable.slice(-10);
    if (recent.length >= MOMENTUM_MIN_ANSWERS) {
      const half = Math.floor(recent.length / 2);
      const earlier = recent.slice(0, half);
      const later = recent.slice(half);
      const rate = (xs: TeachingAnswerRow[]) =>
        xs.filter((x) => isPositive(x.classification)).length / xs.length;
      const delta = rate(later) - rate(earlier);
      if (Math.abs(delta) >= MOMENTUM_GAP) {
        signals.push({
          kind: "learning-momentum",
          detail: {
            direction: delta > 0 ? "improving" : "dipping",
            earlierRate: round2(rate(earlier)),
            laterRate: round2(rate(later)),
          },
          summary:
            delta > 0
              ? "Your recent answers are trending upward."
              : "Your last few answers have slipped a little — a slower pass will help.",
          evidence: {
            evidenceCount: recent.length,
            confidence: confidenceFrom(recent.length, Math.abs(delta)),
            lastObservedAt: recent[recent.length - 1].created_at,
            supportingInteractions: recent.map((x) => x.id),
          },
        });
      }
    }
  }

  // ── 7. performance consistency ────────────────────────────────────────
  {
    const scores = attributable
      .slice(-12)
      .map((a) => a.correctness_score)
      .filter((s): s is number => typeof s === "number");
    if (scores.length >= CONSISTENCY_MIN_ANSWERS) {
      const mean = scores.reduce((s, x) => s + x, 0) / scores.length;
      const variance =
        scores.reduce((s, x) => s + (x - mean) ** 2, 0) / scores.length;
      const sd = Math.sqrt(variance);
      if (sd <= 0.18 || sd >= 0.4) {
        signals.push({
          kind: "performance-consistency",
          detail: { stdDev: round2(sd), samples: scores.length },
          summary:
            sd <= 0.18
              ? "Your answers have been steady and predictable lately."
              : "Your recent answers swing between strong and shaky — Lumen will check more often before moving on.",
          evidence: {
            evidenceCount: scores.length,
            confidence: confidenceFrom(scores.length, Math.abs(sd - 0.29)),
            lastObservedAt:
              attributable[attributable.length - 1]?.created_at ?? null,
            supportingInteractions: [],
          },
        });
      }
    }
  }

  // ── concept families ─────────────────────────────────────────────────
  const assessed = input.concepts
    .filter((c) => c.attempts > 0)
    .sort((a, b) => b.masteryPoints - a.masteryPoints);
  const strongestConceptFamily =
    assessed.length >= 2 ? assessed[0].title : null;
  const weakestConceptFamily =
    assessed.length >= 2 ? assessed[assessed.length - 1].title : null;

  return {
    signals,
    sampleSize,
    computedAt,
    strongestConceptFamily,
    weakestConceptFamily,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

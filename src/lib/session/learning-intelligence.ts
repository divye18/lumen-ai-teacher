import type {
  ClientTeachingQuestion,
  InteractionRow,
  MisconceptionRow,
  TeachingAnswerRow,
} from "@/lib/db/repositories";
import type { KnowledgeGraphView } from "@/lib/graph";

/**
 * REAL-TIME LEARNING INTELLIGENCE (Milestone 7.4).
 *
 * A pure, deterministic interpretation of the learner state that ALREADY
 * exists (mastery, confidence, the persisted answer / question / interaction
 * sequence, misconceptions, the learner profile, the knowledge graph). It
 * DESCRIBES what is happening in the learner's learning right now — it does not
 * decide the next action. The existing teaching policy stays authoritative.
 *
 *   evidence → deriveLearningIntelligence → { signals, readiness, velocity, … }
 *   (before, after) → deriveLearningEvent → at most one meaningful event
 *
 * No psychological inference. No fabricated metrics. No LLM. No chain-of-thought
 * — every string here is a concise learner-facing summary.
 */

export type Trend = "rising" | "steady" | "falling" | "unknown";
export type RecoveryVelocity =
  "QUICK" | "RECOVERING" | "SLOW" | "PERSISTENT" | null;
export type ConceptReadiness =
  "NOT_READY" | "DEVELOPING" | "READY" | "MASTERED";
export type MisconceptionRisk = "none" | "low" | "elevated" | "high";
export type ConceptStability = "volatile" | "settling" | "stable" | "unknown";
export type Momentum = "accelerating" | "steady" | "slowing" | "unknown";
export type DifficultyFit = "too-easy" | "on-target" | "too-hard" | "unknown";
export type Intervention =
  | "none"
  | "simplify"
  | "reframe"
  | "worked-example"
  | "reduce-difficulty"
  | "misconception-remediation"
  | "advance"
  | "reinforce";

export type LearningEventKind =
  | "RECOVERY_DETECTED"
  | "PATTERN_CONFIRMED"
  | "DIFFICULTY_MISMATCH"
  | "READY_TO_ADVANCE"
  | "MASTERY_STABILIZED";

export interface LearningIntelligence {
  concept: { key: string; title: string };
  masteryPoints: number;
  masteryDirection: Trend;
  confidenceDirection: Trend;
  /** Correct-rate over the last ≤5 answers on this concept, or null. */
  recentAccuracy: number | null;
  recoveryVelocity: RecoveryVelocity;
  misconceptionRisk: MisconceptionRisk;
  conceptStability: ConceptStability;
  momentum: Momentum;
  difficultyFit: DifficultyFit;
  /** A structured format the learner is measurably weaker on (from the profile). */
  formatWeakness: string | null;
  readiness: ConceptReadiness;
  /** One learner-facing sentence explaining the readiness state. */
  readinessRationale: string;
  /** Deterministic advisory only — the teaching policy still decides the action. */
  recommendedIntervention: Intervention;
  readyToAdvance: boolean;
  /** A real downstream concept from the persisted graph, when one exists. */
  nextConcept: { title: string } | null;
  /** Whether there is enough evidence to assert anything. */
  hasEvidence: boolean;
  /** Answers on this concept the read is built on. INTERNAL / audit. */
  evidenceCount: number;
}

export interface LearningEvent {
  kind: LearningEventKind;
  /** Short label, e.g. "Recovery detected". */
  headline: string;
  /** One learner-facing sentence. Never internal reasoning. */
  summary: string;
  concept: { key: string; title: string };
  masteryFrom: number;
  masteryTo: number;
  /** What Lumen suggests doing next, learner-facing, or null. */
  next: string | null;
  /** Stable key for de-duplication across a session / report. */
  signature: string;
}

export interface LearningIntelligenceInput {
  concept: { key: string; title: string };
  masteryPoints: number;
  previousMasteryPoints: number | null;
  /** 0..1 */
  confidence: number;
  /** 0..1 */
  previousConfidence: number | null;
  currentAction: string | null;
  /** Answers on THIS concept (any order). */
  answers: TeachingAnswerRow[];
  /** Questions for THIS concept (any order). */
  questions: ClientTeachingQuestion[];
  /** Session interactions (teaching turns + decisions). */
  interactions: InteractionRow[];
  /** Active (non-resolved) misconceptions on this concept. */
  misconceptions: MisconceptionRow[];
  /** From the learner profile / personalization policy. */
  formatWeakness?: string | null;
  graph?: KnowledgeGraphView | null;
}

// ── thresholds ─────────────────────────────────────────────────────────────
const MIN_EVIDENCE = 2;
const RECENT_WINDOW = 5;
const TREND_DELTA = 4; // mastery points
const CONF_TREND_DELTA = 0.06;
const READY_MASTERY = 62;
const MASTERED_MASTERY = 80;
const APPLIED_KINDS = new Set(["APPLICATION", "SCENARIO", "PROBLEM_SOLVING"]);
const INTERVENTION_ACTIONS = new Set([
  "SIMPLIFY",
  "RETEACH",
  "DECREASE_DIFFICULTY",
  "VISUALIZE",
  "ANALOGY",
  "EXAMPLE",
  "HINT",
]);

/** Whether a teaching action counts as an intervention / adaptation. */
export function isInterventionAction(
  action: string | null | undefined,
): boolean {
  return typeof action === "string" && INTERVENTION_ACTIONS.has(action);
}

/** Highest repeated-detection count among active misconceptions. */
export function repeatedMisconceptionCount(
  misconceptions: MisconceptionRow[],
): number {
  return misconceptions
    .filter((m) => m.status !== "RESOLVED")
    .reduce((max, m) => Math.max(max, detectionsOf(m)), 0);
}

function ts(r: { created_at: string }): number {
  return Date.parse(r.created_at);
}
function positive(c: string | null): boolean {
  return c === "CORRECT" || c === "PARTIALLY_CORRECT";
}
function detectionsOf(m: MisconceptionRow): number {
  return (
    Number((m.metadata as Record<string, unknown> | null)?.detections ?? 0) ||
    (Array.isArray(m.evidence) ? m.evidence.length : 0)
  );
}
function trend(after: number, before: number | null, delta: number): Trend {
  if (before === null) return "unknown";
  if (after - before >= delta) return "rising";
  if (before - after >= delta) return "falling";
  return "steady";
}

/** Ordered teaching interventions for a concept, from the interaction log. */
function interventionTimes(
  interactions: InteractionRow[],
  conceptKey: string,
): number[] {
  return interactions
    .filter((i) => {
      if (i.role !== "TEACHER" && i.role !== "SYSTEM") return false;
      const meta = (i.metadata as Record<string, unknown> | null) ?? {};
      if (meta.conceptKey !== conceptKey) return false;
      return (
        typeof meta.action === "string" && INTERVENTION_ACTIONS.has(meta.action)
      );
    })
    .map((i) => ts(i))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
}

/**
 * RECOVERY VELOCITY — from the real answer + intervention sequence.
 *
 * Looks at the most recent run that started with an INCORRECT answer: how many
 * answers (turn distance) and interventions it took to get back to a
 * correct / partially-correct answer. Never invents timings.
 */
export function deriveRecoveryVelocity(input: {
  answers: TeachingAnswerRow[];
  interactions: InteractionRow[];
  conceptKey: string;
}): RecoveryVelocity {
  const ordered = [...input.answers].sort((a, b) => ts(a) - ts(b));
  if (ordered.length < MIN_EVIDENCE) return null;

  // Index of the last INCORRECT that begins the current run.
  let firstWrong = -1;
  for (let i = ordered.length - 1; i >= 0; i -= 1) {
    if (ordered[i].classification === "INCORRECT") firstWrong = i;
    else if (firstWrong !== -1) break;
  }
  if (firstWrong === -1) return null;

  const wrongAt = ts(ordered[firstWrong]);
  const interventions = interventionTimes(
    input.interactions,
    input.conceptKey,
  ).filter((t) => t >= wrongAt);

  // Find the first recovery after that wrong answer.
  let recoveredIdx = -1;
  for (let i = firstWrong + 1; i < ordered.length; i += 1) {
    if (positive(ordered[i].classification)) {
      recoveredIdx = i;
      break;
    }
  }

  const wrongStreak =
    (recoveredIdx === -1 ? ordered.length : recoveredIdx) - firstWrong;

  if (recoveredIdx === -1) {
    // Still not recovered.
    if (interventions.length >= 2 || wrongStreak >= 3) return "PERSISTENT";
    return interventions.length >= 1 ? "SLOW" : null;
  }

  const distance = recoveredIdx - firstWrong; // answers taken to recover
  if (distance <= 1 && interventions.length >= 1) return "QUICK";
  if (distance <= 2) return "RECOVERING";
  if (distance <= 3) return "RECOVERING";
  return "SLOW";
}

/**
 * CONCEPT READINESS — not a mastery-band alias. Requires applied evidence,
 * misconception clearance, and recent stability on top of the mastery number.
 */
export function deriveConceptReadiness(input: {
  masteryPoints: number;
  confidence: number;
  answers: TeachingAnswerRow[];
  questions: ClientTeachingQuestion[];
  misconceptions: MisconceptionRow[];
  masteryDirection: Trend;
}): { readiness: ConceptReadiness; rationale: string } {
  const kindById = new Map(input.questions.map((q) => [q.id, q.question_kind]));
  const ordered = [...input.answers].sort((a, b) => ts(a) - ts(b));
  const recent = ordered.slice(-RECENT_WINDOW);

  if (ordered.length < MIN_EVIDENCE) {
    return {
      readiness: "NOT_READY",
      rationale: "Not enough answers yet to judge how solid this concept is.",
    };
  }

  const repeatedMisconception = input.misconceptions.some(
    (m) => m.status !== "RESOLVED" && detectionsOf(m) >= 2,
  );
  const anyActiveMisconception = input.misconceptions.some(
    (m) => m.status !== "RESOLVED",
  );
  const appliedCorrect = ordered.some(
    (a) =>
      a.classification === "CORRECT" &&
      APPLIED_KINDS.has(kindById.get(a.question_id) ?? ""),
  );
  const lastTwoClean = recent
    .slice(-2)
    .every((a) => a.classification !== "INCORRECT");
  const recentAllCorrect =
    recent.length >= 2 && recent.every((a) => a.classification === "CORRECT");

  if (repeatedMisconception || input.masteryPoints < 45) {
    return {
      readiness: "NOT_READY",
      rationale: repeatedMisconception
        ? "A specific mix-up is still active — Lumen wants to clear it first."
        : "Mastery is still low — this concept needs more time.",
    };
  }

  if (
    input.masteryPoints >= MASTERED_MASTERY &&
    appliedCorrect &&
    recentAllCorrect &&
    !anyActiveMisconception &&
    input.masteryDirection !== "falling"
  ) {
    return {
      readiness: "MASTERED",
      rationale:
        "Consistently strong, including on applied questions — this concept is solid.",
    };
  }

  if (
    input.masteryPoints >= READY_MASTERY &&
    appliedCorrect &&
    lastTwoClean &&
    input.confidence >= 0.5 &&
    !repeatedMisconception
  ) {
    return {
      readiness: "READY",
      rationale:
        "You've applied this correctly and your recent answers are holding — ready to build on it.",
    };
  }

  return {
    readiness: "DEVELOPING",
    rationale: appliedCorrect
      ? "Coming along — a bit more consistency and this is ready."
      : "Recall is forming — the next step is applying it to a new situation.",
  };
}

/** A real downstream concept via a persisted PREREQUISITE edge, or null. */
export function deriveNextConcept(
  graph: KnowledgeGraphView | null | undefined,
  conceptKey: string,
): { title: string } | null {
  if (!graph) return null;
  const node = graph.nodes.find((n) => n.conceptKey === conceptKey);
  if (!node) return null;
  const titleById = new Map(graph.nodes.map((n) => [n.id, n.title]));
  const edge = graph.edges
    .filter((e) => e.type === "PREREQUISITE" && e.source === node.id)
    .sort((a, b) => b.confidence - a.confidence)[0];
  if (!edge) return null;
  const title = titleById.get(edge.target);
  return title ? { title } : null;
}

function recentAccuracyOf(answers: TeachingAnswerRow[]): number | null {
  const ordered = [...answers]
    .sort((a, b) => ts(a) - ts(b))
    .slice(-RECENT_WINDOW);
  if (ordered.length < MIN_EVIDENCE) return null;
  const ok = ordered.filter((a) => positive(a.classification)).length;
  return Math.round((ok / ordered.length) * 100) / 100;
}

function stabilityOf(answers: TeachingAnswerRow[]): ConceptStability {
  const scores = [...answers]
    .sort((a, b) => ts(a) - ts(b))
    .slice(-RECENT_WINDOW)
    .map((a) => a.correctness_score)
    .filter((s): s is number => typeof s === "number");
  if (scores.length < 3) return "unknown";
  const mean = scores.reduce((s, x) => s + x, 0) / scores.length;
  const sd = Math.sqrt(
    scores.reduce((s, x) => s + (x - mean) ** 2, 0) / scores.length,
  );
  if (sd >= 0.34) return "volatile";
  if (sd >= 0.18) return "settling";
  return "stable";
}

function momentumOf(
  answers: TeachingAnswerRow[],
  masteryDirection: Trend,
): Momentum {
  const ordered = [...answers].sort((a, b) => ts(a) - ts(b));
  if (ordered.length < 3) return "unknown";
  const half = Math.floor(ordered.length / 2);
  const rate = (xs: TeachingAnswerRow[]) =>
    xs.filter((x) => positive(x.classification)).length /
    Math.max(1, xs.length);
  const delta = rate(ordered.slice(half)) - rate(ordered.slice(0, half));
  if (delta >= 0.2 || masteryDirection === "rising") return "accelerating";
  if (delta <= -0.2 || masteryDirection === "falling") return "slowing";
  return "steady";
}

function difficultyFitOf(input: {
  answers: TeachingAnswerRow[];
  questions: ClientTeachingQuestion[];
  masteryPoints: number;
  recentAccuracy: number | null;
}): DifficultyFit {
  const ordered = [...input.answers].sort((a, b) => ts(a) - ts(b));
  if (ordered.length < MIN_EVIDENCE || input.recentAccuracy === null) {
    return "unknown";
  }
  const lastTwoWrong = ordered
    .slice(-2)
    .every((a) => a.classification === "INCORRECT");
  if (input.recentAccuracy <= 0.34 || lastTwoWrong) return "too-hard";
  if (input.recentAccuracy >= 0.99 && input.masteryPoints >= 70) {
    return "too-easy";
  }
  return "on-target";
}

function misconceptionRiskOf(
  misconceptions: MisconceptionRow[],
): MisconceptionRisk {
  const active = misconceptions.filter((m) => m.status !== "RESOLVED");
  if (active.length === 0) return "none";
  const repeated = active.filter((m) => detectionsOf(m) >= 2);
  const severe = active.some(
    (m) => m.severity === "HIGH" || m.severity === "CRITICAL",
  );
  if ((repeated.length >= 1 && severe) || repeated.length >= 2) return "high";
  if (repeated.length >= 1 || active.length >= 2) return "elevated";
  return "low";
}

function interventionFor(input: {
  readiness: ConceptReadiness;
  misconceptionRisk: MisconceptionRisk;
  difficultyFit: DifficultyFit;
  conceptStability: ConceptStability;
  recoveryVelocity: RecoveryVelocity;
  lastClassification: string | null;
  hadInterventionThisConcept: boolean;
}): Intervention {
  if (
    input.misconceptionRisk === "high" ||
    input.misconceptionRisk === "elevated"
  ) {
    return "misconception-remediation";
  }
  if (
    input.difficultyFit === "too-hard" &&
    (input.recoveryVelocity === "SLOW" ||
      input.recoveryVelocity === "PERSISTENT")
  ) {
    return "reduce-difficulty";
  }
  if (input.readiness === "READY" || input.readiness === "MASTERED") {
    return "advance";
  }
  if (input.lastClassification === "INCORRECT") {
    return input.hadInterventionThisConcept ? "reframe" : "simplify";
  }
  if (input.conceptStability === "volatile") return "reframe";
  if (input.difficultyFit === "too-easy") return "advance";
  return input.readiness === "DEVELOPING" ? "reinforce" : "none";
}

export function deriveLearningIntelligence(
  input: LearningIntelligenceInput,
): LearningIntelligence {
  const answers = [...input.answers].sort((a, b) => ts(a) - ts(b));
  const evidenceCount = answers.length;
  const hasEvidence = evidenceCount >= MIN_EVIDENCE;

  const masteryDirection = trend(
    input.masteryPoints,
    input.previousMasteryPoints,
    TREND_DELTA,
  );
  const confidenceDirection = trend(
    input.confidence,
    input.previousConfidence,
    CONF_TREND_DELTA,
  );
  const recentAccuracy = recentAccuracyOf(answers);
  const recoveryVelocity = deriveRecoveryVelocity({
    answers,
    interactions: input.interactions,
    conceptKey: input.concept.key,
  });
  const misconceptionRisk = misconceptionRiskOf(input.misconceptions);
  const conceptStability = stabilityOf(answers);
  const momentum = momentumOf(answers, masteryDirection);
  const difficultyFit = difficultyFitOf({
    answers,
    questions: input.questions,
    masteryPoints: input.masteryPoints,
    recentAccuracy,
  });
  const { readiness, rationale } = deriveConceptReadiness({
    masteryPoints: input.masteryPoints,
    confidence: input.confidence,
    answers,
    questions: input.questions,
    misconceptions: input.misconceptions,
    masteryDirection,
  });
  const lastClassification =
    answers.length > 0 ? answers[answers.length - 1].classification : null;
  const hadInterventionThisConcept =
    interventionTimes(input.interactions, input.concept.key).length > 0;

  const recommendedIntervention = interventionFor({
    readiness,
    misconceptionRisk,
    difficultyFit,
    conceptStability,
    recoveryVelocity,
    lastClassification,
    hadInterventionThisConcept,
  });

  const readyToAdvance = readiness === "READY" || readiness === "MASTERED";

  return {
    concept: input.concept,
    masteryPoints: Math.round(input.masteryPoints),
    masteryDirection,
    confidenceDirection,
    recentAccuracy,
    recoveryVelocity,
    misconceptionRisk,
    conceptStability,
    momentum,
    difficultyFit,
    formatWeakness: input.formatWeakness ?? null,
    readiness,
    readinessRationale: rationale,
    recommendedIntervention,
    readyToAdvance,
    nextConcept: readyToAdvance
      ? deriveNextConcept(input.graph, input.concept.key)
      : null,
    hasEvidence,
    evidenceCount,
  };
}

// ── meaningful learning events ─────────────────────────────────────────────

export interface EventSnapshot {
  intelligence: LearningIntelligence;
  /** Repeated-misconception detection count on this concept. */
  repeatedMisconceptionCount: number;
  /** An intervention happened on this concept between `before` and `after`. */
  interventionSinceBefore: boolean;
  lastClassification: string | null;
}

const EVENT_HEADLINE: Record<LearningEventKind, string> = {
  RECOVERY_DETECTED: "Recovery detected",
  PATTERN_CONFIRMED: "Pattern confirmed",
  DIFFICULTY_MISMATCH: "This is taking more effort than expected",
  READY_TO_ADVANCE: "Ready to move on",
  MASTERY_STABILIZED: "Concept locked in",
};

/**
 * Compare two snapshots and emit AT MOST ONE meaningful educational event.
 * Numerical drift alone never produces an event.
 */
export function deriveLearningEvent(
  before: EventSnapshot,
  after: EventSnapshot,
): LearningEvent | null {
  const a = after.intelligence;
  const b = before.intelligence;
  const concept = a.concept;
  const base = {
    concept,
    masteryFrom: b.masteryPoints,
    masteryTo: a.masteryPoints,
  };

  // 1. PATTERN_CONFIRMED — a recurring misconception reached real evidence.
  if (
    after.repeatedMisconceptionCount >= 2 &&
    before.repeatedMisconceptionCount < 2
  ) {
    return {
      kind: "PATTERN_CONFIRMED",
      headline: EVENT_HEADLINE.PATTERN_CONFIRMED,
      summary:
        "The same misunderstanding has come up more than once — Lumen is switching approach to target it.",
      next: "Work through it a different way.",
      signature: `pattern:${concept.key}`,
      ...base,
    };
  }

  // 2. DIFFICULTY_MISMATCH — repeated unsuccessful attempts despite help.
  if (
    a.difficultyFit === "too-hard" &&
    (a.recoveryVelocity === "SLOW" || a.recoveryVelocity === "PERSISTENT") &&
    before.interventionSinceBefore === false &&
    after.interventionSinceBefore
  ) {
    return {
      kind: "DIFFICULTY_MISMATCH",
      headline: EVENT_HEADLINE.DIFFICULTY_MISMATCH,
      summary:
        "This is proving harder than expected — Lumen is reducing the load and slowing down.",
      next: "Take it one smaller piece at a time.",
      signature: `difficulty:${concept.key}`,
      ...base,
    };
  }

  // 3. RECOVERY_DETECTED — wrong → intervention → right.
  if (
    (a.recoveryVelocity === "QUICK" || a.recoveryVelocity === "RECOVERING") &&
    after.interventionSinceBefore &&
    positiveClass(after.lastClassification) &&
    !positiveClass(before.lastClassification) &&
    a.masteryPoints >= b.masteryPoints
  ) {
    return {
      kind: "RECOVERY_DETECTED",
      headline: EVENT_HEADLINE.RECOVERY_DETECTED,
      summary:
        "You corrected the same idea after the explanation was adjusted — that's the part that was missing.",
      next: a.nextConcept
        ? `Apply it, then connect it to ${a.nextConcept.title}.`
        : "Apply it in a new situation.",
      signature: `recovery:${concept.key}:${a.masteryPoints}`,
      ...base,
    };
  }

  // 4. MASTERY_STABILIZED — concept became consistently strong.
  if (a.readiness === "MASTERED" && b.readiness !== "MASTERED") {
    return {
      kind: "MASTERY_STABILIZED",
      headline: EVENT_HEADLINE.MASTERY_STABILIZED,
      summary:
        "Consistently strong now, including on applied questions — this concept is solid.",
      next: a.nextConcept
        ? `Build on it with ${a.nextConcept.title}.`
        : "Build on it with the next concept.",
      signature: `stable:${concept.key}`,
      ...base,
    };
  }

  // 5. READY_TO_ADVANCE — stable understanding + application.
  if (a.readiness === "READY" && b.readiness !== "READY") {
    return {
      kind: "READY_TO_ADVANCE",
      headline: EVENT_HEADLINE.READY_TO_ADVANCE,
      summary: a.readinessRationale,
      next: a.nextConcept
        ? `You're ready to connect this to ${a.nextConcept.title}.`
        : "Ready for the next concept.",
      signature: `ready:${concept.key}`,
      ...base,
    };
  }

  return null;
}

function positiveClass(c: string | null): boolean {
  return c === "CORRECT" || c === "PARTIALLY_CORRECT";
}

/** A concise learner-facing line for the Teacher Presence to say on an event. */
export function eventPresenceLine(kind: LearningEventKind): string {
  switch (kind) {
    case "RECOVERY_DETECTED":
      return "That clicked. Let's see if it holds in a new situation.";
    case "PATTERN_CONFIRMED":
      return "I've seen the same pattern again. Let's approach it differently.";
    case "READY_TO_ADVANCE":
      return "You've stabilized this idea. Let's build on it.";
    case "MASTERY_STABILIZED":
      return "This one's solid now. Let's build on it.";
    case "DIFFICULTY_MISMATCH":
      return "This is taking more effort than expected. I'll reduce the load.";
  }
}

/**
 * Walk a whole session's persisted answer sequence and collect its meaningful
 * events, de-duplicated by signature. The session report calls this so it
 * consumes the SAME event vocabulary as the live Teaching Room — it never
 * invents a second set of insights.
 */
export function deriveSessionEvents(input: {
  concepts: {
    key: string;
    title: string;
    masteryStart: number;
    masteryEnd: number;
  }[];
  answers: TeachingAnswerRow[];
  questions: ClientTeachingQuestion[];
  interactions: InteractionRow[];
  graph?: KnowledgeGraphView | null;
}): LearningEvent[] {
  const kindById = new Map(input.questions.map((q) => [q.id, q.question_kind]));
  const conceptOf = new Map(input.questions.map((q) => [q.id, q.concept_key]));
  const seen = new Set<string>();
  const out: LearningEvent[] = [];

  for (const concept of input.concepts) {
    const answers = input.answers
      .filter((a) => conceptOf.get(a.question_id) === concept.key)
      .sort((a, b) => ts(a) - ts(b));
    if (answers.length < MIN_EVIDENCE) continue;

    const interventions = interventionTimes(input.interactions, concept.key);
    const hadInterventionBetween = (t0: number, t1: number) =>
      interventions.some((t) => t > t0 && t <= t1);

    const base = {
      concept: { key: concept.key, title: concept.title },
      masteryFrom: Math.round(concept.masteryStart),
      masteryTo: Math.round(concept.masteryEnd),
    };
    const next = deriveNextConcept(input.graph, concept.key);
    const push = (ev: LearningEvent) => {
      if (!seen.has(ev.signature)) {
        seen.add(ev.signature);
        out.push(ev);
      }
    };

    // RECOVERY_DETECTED — wrong, then (with help in between) right.
    for (let i = 1; i < answers.length; i += 1) {
      if (
        answers[i - 1].classification === "INCORRECT" &&
        positive(answers[i].classification) &&
        hadInterventionBetween(ts(answers[i - 1]), ts(answers[i]))
      ) {
        push({
          kind: "RECOVERY_DETECTED",
          headline: EVENT_HEADLINE.RECOVERY_DETECTED,
          summary:
            "You corrected the same idea after the explanation was adjusted.",
          next: next
            ? `Apply it, then connect it to ${next.title}.`
            : "Apply it in a new situation.",
          signature: `recovery:${concept.key}`,
          ...base,
        });
        break;
      }
    }

    // PATTERN_CONFIRMED — a misconception category recurred across answers.
    const categoryCounts = new Map<string, number>();
    for (const a of answers) {
      const cands = (a.evaluation as { misconceptionCandidates?: unknown[] })
        ?.misconceptionCandidates;
      if (!Array.isArray(cands)) continue;
      for (const c of cands) {
        const cat =
          c && typeof c === "object" && "category" in c
            ? String((c as { category: unknown }).category)
            : null;
        if (cat) categoryCounts.set(cat, (categoryCounts.get(cat) ?? 0) + 1);
      }
    }
    if ([...categoryCounts.values()].some((n) => n >= 2)) {
      push({
        kind: "PATTERN_CONFIRMED",
        headline: EVENT_HEADLINE.PATTERN_CONFIRMED,
        summary:
          "The same misunderstanding came up more than once — Lumen switched approach to target it.",
        next: "Keep an eye on this one next time.",
        signature: `pattern:${concept.key}`,
        ...base,
      });
    }

    // DIFFICULTY_MISMATCH — two+ consecutive misses despite help, no recovery.
    for (let i = 1; i < answers.length; i += 1) {
      if (
        answers[i - 1].classification === "INCORRECT" &&
        answers[i].classification === "INCORRECT" &&
        hadInterventionBetween(ts(answers[i - 1]), ts(answers[i]))
      ) {
        push({
          kind: "DIFFICULTY_MISMATCH",
          headline: EVENT_HEADLINE.DIFFICULTY_MISMATCH,
          summary:
            "This concept took more effort than expected — Lumen reduced the load.",
          next: "Revisit it with a shorter, more concrete pass.",
          signature: `difficulty:${concept.key}`,
          ...base,
        });
        break;
      }
    }

    // READY_TO_ADVANCE / MASTERY_STABILIZED — end-of-session concept state.
    const recent = answers.slice(-RECENT_WINDOW);
    const appliedCorrect = answers.some(
      (a) =>
        a.classification === "CORRECT" &&
        APPLIED_KINDS.has(kindById.get(a.question_id) ?? ""),
    );
    const lastTwoClean = recent
      .slice(-2)
      .every((a) => a.classification !== "INCORRECT");
    const recentAllCorrect =
      recent.length >= 2 && recent.every((a) => a.classification === "CORRECT");
    if (
      concept.masteryEnd >= MASTERED_MASTERY &&
      appliedCorrect &&
      recentAllCorrect
    ) {
      push({
        kind: "MASTERY_STABILIZED",
        headline: EVENT_HEADLINE.MASTERY_STABILIZED,
        summary: "Consistently strong, including on applied questions.",
        next: next ? `Build on it with ${next.title}.` : null,
        signature: `stable:${concept.key}`,
        ...base,
      });
    } else if (
      concept.masteryEnd >= READY_MASTERY &&
      appliedCorrect &&
      lastTwoClean
    ) {
      push({
        kind: "READY_TO_ADVANCE",
        headline: EVENT_HEADLINE.READY_TO_ADVANCE,
        summary:
          "You applied this correctly and your recent answers held steady.",
        next: next
          ? `You're ready to connect this to ${next.title}.`
          : "Ready for the next concept.",
        signature: `ready:${concept.key}`,
        ...base,
      });
    }
  }

  // Priority-ish ordering for display: struggle signals first, then progress.
  const rank: Record<LearningEventKind, number> = {
    PATTERN_CONFIRMED: 0,
    DIFFICULTY_MISMATCH: 1,
    RECOVERY_DETECTED: 2,
    MASTERY_STABILIZED: 3,
    READY_TO_ADVANCE: 4,
  };
  return out.sort((a, b) => rank[a.kind] - rank[b.kind]);
}

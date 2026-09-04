import type { DiagnosticPendingView } from "./diagnostic-flow";
import type { TeachingCitation } from "./citations";
import type { VisualDirective } from "@/types/visuals";
import type { ClientStructuredQuestion } from "@/lib/assessment/structured";
import type { QuestionFormat } from "@/lib/db/enums";
import type {
  DifficultyDirection,
  QuestionKind,
  TeachingAction,
  TeachingStyle,
} from "@/lib/teaching/contracts";
import type { NextStepExplanation } from "@/lib/teaching/why-next";
import type { MisconceptionDetailView } from "@/lib/teaching/misconception-view";

/**
 * Clean DTOs returned by the teaching orchestrator. No raw DB rows, no
 * `expected_reasoning`, no chain-of-thought — only what a UI needs.
 */

export interface LessonConceptView {
  key: string;
  title: string;
  summary: string;
  position: number;
  difficulty: number;
  importance: number;
  isPrerequisite: boolean;
  status: string;
}

export interface LessonView {
  lessonId: string;
  title: string;
  topic: string;
  objective: string;
  language: string;
  estimatedMinutes: number | null;
  teachingStyle: string | null;
  sourceGrounded: boolean;
  planSource: string;
  assessmentStrategy: string;
  concepts: LessonConceptView[];
  citations: TeachingCitation[];
}

export interface SessionProgress {
  conceptIndex: number;
  conceptCount: number;
  conceptsCompleted: number;
  currentConceptKey: string | null;
  timeElapsedMinutes: number;
  timeRemainingMinutes: number | null;
}

export interface MasterySnapshotEntry {
  conceptKey: string;
  masteryPoints: number;
  masteryBand: string;
  confidence: number;
  status: string;
}

export interface SessionView {
  sessionId: string;
  lessonId: string;
  status: string;
  language: string;
  currentAction: string | null;
  progress: SessionProgress;
  mastery: MasterySnapshotEntry[];
  /**
   * A short diagnostic pre-assessment the learner must answer before the
   * normal teaching loop starts. `null` when no diagnostic is pending — a
   * returning learner with lesson-relevant mastery evidence, or one who
   * already completed it. See `session/diagnostic-flow.ts`.
   */
  diagnostic: DiagnosticPendingView | null;
}

export interface DiagnosticCompletionView {
  sessionId: string;
  strongConceptKeys: string[];
  developingConceptKeys: string[];
  weakConceptKeys: string[];
  /** True when this call found an already-COMPLETED diagnostic (idempotent replay). */
  alreadyCompleted: boolean;
}

/** The sanitised teaching decision surfaced to the UI. */
export interface DecisionView {
  action: TeachingAction;
  strategy: TeachingStyle;
  difficultyDirection: DifficultyDirection;
  targetConceptKey: string;
  reason: string;
  nextAction: TeachingAction | null;
  source: "ai" | "policy" | "ai+policy";
  /** "Visible intelligence" — concise, never chain-of-thought. */
  adaptationNarrative: string[];
  overrides: string[];
  /**
   * Learner-facing "why is Lumen doing this next?" — a deterministic
   * explanation built from the resolved action + policy facts. `null` on
   * decisions where a next-step rationale doesn't apply (e.g. the very first
   * step, or a bare decision recorded for history).
   */
  whyThisNext: NextStepExplanation | null;
  /**
   * Adaptive teacher memory: one learner-facing sentence when a cross-session
   * learning signal changed how Lumen approached this step
   * ("Starting with an example because that has helped you recover faster
   * before."). `null` when no personalization applied.
   */
  personalizationNote: string | null;
}

export interface QuestionView {
  questionId: string;
  kind: QuestionKind;
  difficulty: number;
  prompt: string;
  conceptKey: string;
  groundedInSource: boolean;
  /** FREE_FORM = a text answer; otherwise a structured interaction. */
  format: QuestionFormat;
  /**
   * The client-safe structured question (options / items / buckets, no answer
   * key). Present iff `format !== "FREE_FORM"`.
   */
  structured: ClientStructuredQuestion | null;
}

export interface TeachingContentView {
  title: string;
  body: string;
  conceptKey: string;
  groundedInSource: boolean;
  /**
   * A validated visual directive to show alongside the text, chosen
   * deterministically from the concept + the learner's live state. `null` when
   * a picture would not add anything.
   */
  visual: VisualDirective | null;
  /** One learner-safe sentence on why this representation was chosen. */
  visualRationale: string | null;
  /**
   * The educational intent of the representation — `concrete` | `reframe` |
   * `reinforce` | `connect` | `systemView`. Lets the UI label the visual by
   * what it's *for* ("Simpler view", "System view") rather than its raw mode.
   */
  visualIntent: string | null;
}

/**
 * REAL-TIME LEARNING INTELLIGENCE (7.4) — the client-safe read of what is
 * happening in the learner's learning right now. Descriptive only; the teaching
 * policy still owns the action. No internal reasoning, no taxonomy ids.
 */
export interface LearningIntelligenceView {
  conceptKey: string;
  conceptTitle: string;
  masteryPoints: number;
  masteryDirection: "rising" | "steady" | "falling" | "unknown";
  confidenceDirection: "rising" | "steady" | "falling" | "unknown";
  recentAccuracy: number | null;
  recoveryVelocity: "QUICK" | "RECOVERING" | "SLOW" | "PERSISTENT" | null;
  misconceptionRisk: "none" | "low" | "elevated" | "high";
  conceptStability: "volatile" | "settling" | "stable" | "unknown";
  momentum: "accelerating" | "steady" | "slowing" | "unknown";
  difficultyFit: "too-easy" | "on-target" | "too-hard" | "unknown";
  readiness: "NOT_READY" | "DEVELOPING" | "READY" | "MASTERED";
  readinessRationale: string;
  readyToAdvance: boolean;
  nextConceptTitle: string | null;
  hasEvidence: boolean;
}

/** One meaningful educational change, surfaced to the learner. */
export interface LearningEventView {
  kind:
    | "RECOVERY_DETECTED"
    | "PATTERN_CONFIRMED"
    | "DIFFICULTY_MISMATCH"
    | "READY_TO_ADVANCE"
    | "MASTERY_STABILIZED"
    | "MISCONCEPTION_IMPROVING"
    | "MISCONCEPTION_CLEARED";
  headline: string;
  summary: string;
  conceptTitle: string;
  masteryFrom: number;
  masteryTo: number;
  next: string | null;
  /** Presence line for the teacher orb to react with. */
  presenceLine: string;
}

/** The very compact live status in the Teaching Room header. */
export interface LiveStatusView {
  conceptTitle: string;
  masteryPoints: number;
  /** RECOVERING / DEVELOPING / READY / … — the current teaching-relevant state. */
  state: string;
  /** ↑ / → / ↓ */
  momentum: "up" | "flat" | "down";
  /** The kind of the next check, when known (e.g. "APPLICATION"). */
  nextKind: string | null;
}

export interface TeachingStepView {
  sessionId: string;
  decision: DecisionView;
  content: TeachingContentView | null;
  question: QuestionView | null;
  citations: TeachingCitation[];
  progress: SessionProgress;
  sessionStatus: string;
  /** 7.4 — descriptive read of the current learning state. */
  intelligence: LearningIntelligenceView | null;
  liveStatus: LiveStatusView | null;
}

export interface EvaluationView {
  classification: string;
  correctnessScore: number;
  confidence: number;
  reasoningQuality: string;
  missingConcepts: string[];
  feedback: string;
  /** How the answer was graded. */
  source: "ai" | "structured" | "fallback";
  /**
   * Learner-facing misconception surfaced by this answer (never the internal
   * taxonomy id). `null` when none / the answer was correct.
   */
  misconceptionInsight: { label: string; explanation: string } | null;
  /**
   * The full misconception picture for the "Lumen noticed a pattern" reveal —
   * built from the persisted `misconceptions` row (first seen, recurrence
   * count, severity, status) plus what Lumen is doing about it. `null` when
   * this answer surfaced no misconception.
   */
  misconception: MisconceptionDetailView | null;
  /** Per-item breakdown for a structured answer (for the result UI). */
  breakdown: {
    summary: string;
    items?: { id: string; text: string; correct: boolean; expected?: string }[];
    correctAnswerText?: string;
  } | null;
}

export type { MisconceptionDetailView };

export interface LearnerUpdateView {
  conceptKey: string;
  masteryBefore: number;
  masteryAfter: number;
  masteryBand: string;
  confidenceBefore: number;
  confidenceAfter: number;
  reason: string;
  newMisconceptions: number;
  reinforcedMisconceptions: number;
  repeatedMisconception: boolean;
}

/**
 * The representation Lumen will use on the next teaching step, computed at
 * answer time so the adaptive moment can say "here's how the picture changes".
 * Deterministic; never invents content.
 */
export interface NextRepresentationView {
  /** VisualMode of the incoming teaching visual. */
  mode: string;
  /** Readable mode name, e.g. "3D model", "Step-by-step diagram". */
  modeLabel: string;
  /** What the representation is *for*, e.g. "Simpler view", "System view". */
  intentLabel: string;
  /** Learner-facing educational reason for this representation. */
  rationale: string;
}

export interface InteractionResultView {
  sessionId: string;
  evaluation: EvaluationView;
  learnerUpdate: LearnerUpdateView;
  nextDecision: DecisionView;
  /** How Lumen will show this concept next (null when the next step has no visual). */
  nextRepresentation: NextRepresentationView | null;
  progress: SessionProgress;
  sessionStatus: string;
  /** 7.4 — descriptive read of the learning state after this answer. */
  intelligence: LearningIntelligenceView | null;
  /** 7.4 — a meaningful educational change, when one occurred. */
  learningEvent: LearningEventView | null;
  liveStatus: LiveStatusView | null;
}

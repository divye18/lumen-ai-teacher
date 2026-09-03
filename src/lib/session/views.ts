import type { TeachingCitation } from "./citations";
import type {
  DifficultyDirection,
  QuestionKind,
  TeachingAction,
  TeachingStyle,
} from "@/lib/teaching/contracts";

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
}

export interface QuestionView {
  questionId: string;
  kind: QuestionKind;
  difficulty: number;
  prompt: string;
  conceptKey: string;
  groundedInSource: boolean;
}

export interface TeachingContentView {
  title: string;
  body: string;
  conceptKey: string;
  groundedInSource: boolean;
}

export interface TeachingStepView {
  sessionId: string;
  decision: DecisionView;
  content: TeachingContentView | null;
  question: QuestionView | null;
  citations: TeachingCitation[];
  progress: SessionProgress;
  sessionStatus: string;
}

export interface EvaluationView {
  classification: string;
  correctnessScore: number;
  confidence: number;
  reasoningQuality: string;
  missingConcepts: string[];
  feedback: string;
}

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

export interface InteractionResultView {
  sessionId: string;
  evaluation: EvaluationView;
  learnerUpdate: LearnerUpdateView;
  nextDecision: DecisionView;
  progress: SessionProgress;
  sessionStatus: string;
}

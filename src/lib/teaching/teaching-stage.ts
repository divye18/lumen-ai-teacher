import type { TeacherPresenceState } from "@/lib/teacher/presence";

/**
 * TEACHING STAGE — one coherent read of "what is Lumen doing right now".
 *
 * The Teaching Room drives several surfaces at once — the teacher presence orb,
 * a status line, the progressive reveal of content, and whether the learner can
 * move on. Without a single source of truth those drift apart and the room
 * feels like a form. This pure function derives all of it from the room's real
 * state (phase + resolved action + reveal progress + which post-answer beat is
 * showing), so the orb and the content are never out of sync.
 *
 * It owns NO teaching logic and NO learner-state maths — it only names the
 * moment.
 */

export type TeachingStage =
  | "preparing"
  | "explaining"
  | "ready-to-check"
  | "checking"
  | "reading"
  | "evaluating"
  | "updating"
  | "adapting"
  | "conversing"
  | "recap"
  | "complete"
  | "error";

export interface TeachingStageInput {
  phase:
    | "loading"
    | "teaching"
    | "question"
    | "result"
    | "transition"
    | "complete"
    | "error";
  /** An API request is in flight. */
  busy: boolean;
  /** Resolved teaching action for the step on screen. */
  action: string | null;
  /** Every teaching-content paragraph has been revealed. */
  revealComplete: boolean;
  /** Post-answer beat: 0 = evaluation, 1 = learner-model update, 2 = adaptation. */
  resultBeat: number;
  /** Classification of the answer being shown, if any. */
  classification: string | null;
  /** True the very first time the room loads (before any content). */
  firstLoad: boolean;
  /** Voice controller state, when voice is active. */
  voiceState?: "IDLE" | "LISTENING" | "PROCESSING" | "SPEAKING" | "ERROR";
  /** The learner asked a question and Lumen is answering it (side channel). */
  conversationBusy?: boolean;
}

export interface TeachingStageView {
  stage: TeachingStage;
  presence: TeacherPresenceState;
  /** One short, learner-facing line — never chain-of-thought. */
  statusLine: string;
  /** Whether a "continue" affordance should be offered now. */
  canAdvance: boolean;
}

const STAGE_META: Record<
  TeachingStage,
  { presence: TeacherPresenceState; statusLine: string; canAdvance: boolean }
> = {
  preparing: {
    presence: "THINKING",
    statusLine: "Lumen is preparing your lesson",
    canAdvance: false,
  },
  explaining: {
    presence: "TEACHING",
    statusLine: "Lumen is explaining",
    canAdvance: false,
  },
  "ready-to-check": {
    presence: "TEACHING",
    statusLine: "Take a moment — continue when you're ready",
    canAdvance: true,
  },
  checking: {
    presence: "CHECKING",
    statusLine: "Your turn — Lumen is checking your understanding",
    canAdvance: false,
  },
  reading: {
    presence: "CHECKING",
    statusLine: "Lumen is reading your answer",
    canAdvance: false,
  },
  evaluating: {
    presence: "ADAPTING",
    statusLine: "Lumen is looking at what your answer shows",
    canAdvance: false,
  },
  updating: {
    presence: "ADAPTING",
    statusLine: "Lumen is updating what it knows about you",
    canAdvance: false,
  },
  adapting: {
    presence: "ADAPTING",
    statusLine: "Lumen is changing how it teaches next",
    canAdvance: true,
  },
  conversing: {
    presence: "THINKING",
    statusLine: "Lumen is thinking about your question",
    canAdvance: false,
  },
  recap: {
    presence: "RECAP",
    statusLine: "Lumen is pulling the ideas together",
    canAdvance: false,
  },
  complete: {
    presence: "CELEBRATING",
    statusLine: "Lesson complete",
    canAdvance: true,
  },
  error: {
    presence: "IDLE",
    statusLine: "That step didn't load",
    canAdvance: false,
  },
};

export function deriveTeachingStage(
  input: TeachingStageInput,
): TeachingStageView {
  const stage = resolveStage(input);
  const meta = STAGE_META[stage];

  // Voice overrides the presence (but not the stage) when it is live.
  let presence = meta.presence;
  if (input.voiceState === "LISTENING") presence = "LISTENING";
  else if (input.voiceState === "SPEAKING") presence = "TEACHING";
  else if (input.voiceState === "PROCESSING") presence = "THINKING";

  // A correct answer celebrates through the evaluation + update beats.
  if (
    (stage === "evaluating" || stage === "updating") &&
    input.classification === "CORRECT" &&
    !input.voiceState
  ) {
    presence = "CELEBRATING";
  }

  const statusLine =
    stage === "preparing" && !input.firstLoad
      ? "Lumen is deciding what comes next"
      : meta.statusLine;

  return { stage, presence, statusLine, canAdvance: meta.canAdvance };
}

function resolveStage(input: TeachingStageInput): TeachingStage {
  if (input.phase === "error") return "error";
  if (input.phase === "complete") return "complete";

  // A learner question in flight takes over the presence during teaching /
  // questioning — but never during the post-answer sequence.
  if (
    input.conversationBusy &&
    (input.phase === "teaching" || input.phase === "question")
  ) {
    return "conversing";
  }

  if (input.phase === "loading") return "preparing";

  if (input.phase === "teaching") {
    if (input.action === "RECAP") return "recap";
    return input.revealComplete ? "ready-to-check" : "explaining";
  }

  if (input.phase === "question") {
    return input.busy ? "reading" : "checking";
  }

  if (input.phase === "result" || input.phase === "transition") {
    if (input.resultBeat <= 0) return "evaluating";
    if (input.resultBeat === 1) return "updating";
    return "adapting";
  }

  return "preparing";
}

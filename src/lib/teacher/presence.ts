/**
 * TEACHER PRESENCE — state only, no teaching logic.
 *
 * `TeacherPresence` (the component) is a pure rendering layer. This module maps
 * the Teaching Room's real state (phase + resolved teaching action + voice
 * state + last result) to one of a small set of presence states. It never
 * decides what to teach — it only names what the room is already doing.
 */

export const TEACHER_PRESENCE_STATES = [
  "LISTENING",
  "THINKING",
  "TEACHING",
  "CHECKING",
  "ADAPTING",
  "CELEBRATING",
  "RECAP",
  "IDLE",
] as const;
export type TeacherPresenceState = (typeof TEACHER_PRESENCE_STATES)[number];

export interface PresenceContext {
  /** Teaching Room phase. */
  phase:
    | "loading"
    | "teaching"
    | "question"
    | "result"
    | "transition"
    | "complete"
    | "error";
  /** The resolved teaching action for the current step, when known. */
  decisionAction?: string | null;
  /** Voice controller state, when voice is active. */
  voiceState?: "IDLE" | "LISTENING" | "PROCESSING" | "SPEAKING" | "ERROR";
  /** Classification of the most recent answer, if any. */
  lastClassification?: string | null;
  /** True while a spoken caption is still being voiced. */
  speaking?: boolean;
}

export function presenceForContext(ctx: PresenceContext): TeacherPresenceState {
  // Voice, when live, is the most concrete signal of what the teacher is doing.
  if (ctx.voiceState === "LISTENING") return "LISTENING";
  if (ctx.voiceState === "SPEAKING" || ctx.speaking) return "TEACHING";
  if (ctx.voiceState === "PROCESSING") return "THINKING";

  if (ctx.decisionAction === "RECAP" && ctx.phase !== "result") return "RECAP";

  switch (ctx.phase) {
    case "loading":
      return "THINKING";
    case "transition":
      return "ADAPTING";
    case "teaching":
      return "TEACHING";
    case "question":
      return "CHECKING";
    case "result":
      if (ctx.lastClassification === "CORRECT") return "CELEBRATING";
      // Any non-correct answer means Lumen is now adjusting what comes next.
      return "ADAPTING";
    case "complete":
      return "CELEBRATING";
    case "error":
      return "IDLE";
    default:
      return "IDLE";
  }
}

export interface PresenceVisual {
  /** CSS colour token for the core. */
  color: string;
  /** Human label for the status pill. */
  label: string;
  /** Base motion speed multiplier (0 = still). */
  energy: number;
}

export function presenceVisual(state: TeacherPresenceState): PresenceVisual {
  switch (state) {
    case "LISTENING":
      return {
        color: "var(--color-signal-advancing)",
        label: "Listening",
        energy: 0.8,
      };
    case "TEACHING":
      return { color: "var(--color-accent)", label: "Teaching", energy: 1 };
    case "THINKING":
      return {
        color: "var(--color-signal-revisiting)",
        label: "Thinking",
        energy: 0.5,
      };
    case "CHECKING":
      return {
        color: "var(--color-signal-challenging)",
        label: "Checking",
        energy: 0.7,
      };
    case "ADAPTING":
      return {
        color: "var(--color-signal-reinforcing)",
        label: "Adapting",
        energy: 0.9,
      };
    case "CELEBRATING":
      return {
        color: "var(--color-positive)",
        label: "Nice work",
        energy: 1.2,
      };
    case "RECAP":
      return {
        color: "var(--color-signal-revisiting)",
        label: "Recap",
        energy: 0.4,
      };
    default:
      return { color: "var(--color-ink-faint)", label: "Ready", energy: 0.25 };
  }
}

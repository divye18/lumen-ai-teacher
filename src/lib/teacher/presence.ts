/**
 * TEACHER PRESENCE — state only, no teaching logic.
 *
 * `TeacherPresence` (the component) is a pure rendering layer. This module maps
 * the Teaching Room's real state (phase + voice state + last result) to one of
 * a small set of presence states. It never decides what to teach.
 */

export const TEACHER_PRESENCE_STATES = [
  "IDLE",
  "THINKING",
  "SPEAKING",
  "LISTENING",
  "CELEBRATING",
  "ENCOURAGING",
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
  /** Voice controller state, when voice is active. */
  voiceState?: "IDLE" | "LISTENING" | "PROCESSING" | "SPEAKING" | "ERROR";
  /** Classification of the most recent answer, if any. */
  lastClassification?: string | null;
  /** True while a spoken caption is still being voiced. */
  speaking?: boolean;
}

export function presenceForContext(ctx: PresenceContext): TeacherPresenceState {
  if (ctx.voiceState === "LISTENING") return "LISTENING";
  if (ctx.voiceState === "SPEAKING" || ctx.speaking) return "SPEAKING";
  if (ctx.voiceState === "PROCESSING") return "THINKING";

  switch (ctx.phase) {
    case "loading":
    case "transition":
      return "THINKING";
    case "teaching":
      return "SPEAKING";
    case "question":
      return "LISTENING";
    case "result":
      if (ctx.lastClassification === "CORRECT") return "CELEBRATING";
      if (
        ctx.lastClassification === "INCORRECT" ||
        ctx.lastClassification === "UNCERTAIN"
      ) {
        return "ENCOURAGING";
      }
      return "IDLE";
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
    case "SPEAKING":
      return { color: "var(--color-accent)", label: "Teaching", energy: 1 };
    case "THINKING":
      return {
        color: "var(--color-signal-revisiting)",
        label: "Thinking",
        energy: 0.5,
      };
    case "CELEBRATING":
      return {
        color: "var(--color-positive)",
        label: "Nice work",
        energy: 1.2,
      };
    case "ENCOURAGING":
      return {
        color: "var(--color-signal-reinforcing)",
        label: "With you",
        energy: 0.6,
      };
    default:
      return { color: "var(--color-ink-faint)", label: "Ready", energy: 0.25 };
  }
}

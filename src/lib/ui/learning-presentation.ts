import { MASTERY_BANDS, masteryBand } from "@/lib/teaching/mastery";
import type { DecisionView, QuestionView } from "@/lib/session/views";

/**
 * Pure presentation helpers shared by client and server components. They only
 * translate real backend values (mastery points, `DecisionView`, question
 * kind) into display vocabulary — never invent numbers, never surface CoT.
 */

export type BandId = (typeof MASTERY_BANDS)[number]["id"];

export interface BandPresentation {
  id: BandId;
  label: string;
  /** CSS custom-property token, e.g. "var(--color-band-strong)". */
  color: string;
  /** 0–1 position of the band's midpoint on the scale. */
  anchor: number;
}

const BAND_COLOR: Record<BandId, string> = {
  "not-understood": "var(--color-band-unknown)",
  emerging: "var(--color-band-emerging)",
  developing: "var(--color-band-developing)",
  proficient: "var(--color-band-proficient)",
  strong: "var(--color-band-strong)",
};

export function bandPresentation(points: number): BandPresentation {
  const id = masteryBand(points);
  const band = MASTERY_BANDS.find((b) => b.id === id) ?? MASTERY_BANDS[0];
  return {
    id,
    label: band.label,
    color: BAND_COLOR[id],
    anchor: (band.min + band.max) / 2 / 100,
  };
}

export type SignalId =
  "advancing" | "reinforcing" | "revisiting" | "remediating" | "challenging";

export interface LearningSignalPresentation {
  id: SignalId;
  label: string;
  color: string;
  /** One-line, learner-safe summary of what Lumen is doing and why. */
  summary: string;
}

const SIGNAL_LABEL: Record<SignalId, string> = {
  advancing: "Advancing",
  reinforcing: "Reinforcing",
  revisiting: "Revisiting",
  remediating: "Remediating",
  challenging: "Challenging",
};

const SIGNAL_COLOR: Record<SignalId, string> = {
  advancing: "var(--color-signal-advancing)",
  reinforcing: "var(--color-signal-reinforcing)",
  revisiting: "var(--color-signal-revisiting)",
  remediating: "var(--color-signal-remediating)",
  challenging: "var(--color-signal-challenging)",
};

const REMEDIATION_ACTIONS = new Set([
  "RETEACH",
  "SIMPLIFY",
  "HINT",
  "DECREASE_DIFFICULTY",
]);
const ADVANCE_ACTIONS = new Set(["MOVE_FORWARD", "INCREASE_DIFFICULTY"]);

export function signalForDecision(
  decision: Pick<DecisionView, "action" | "difficultyDirection">,
  question?: Pick<QuestionView, "kind"> | null,
): LearningSignalPresentation {
  let id: SignalId;

  if (REMEDIATION_ACTIONS.has(decision.action)) {
    id = "remediating";
  } else if (decision.action === "RECAP") {
    id = "revisiting";
  } else if (ADVANCE_ACTIONS.has(decision.action)) {
    id = "advancing";
  } else if (
    (question &&
      (question.kind === "SCENARIO" || question.kind === "PROBLEM_SOLVING")) ||
    (decision.action === "ASSESS" && decision.difficultyDirection === "HARDER")
  ) {
    id = "challenging";
  } else {
    id = "reinforcing";
  }

  return {
    id,
    label: SIGNAL_LABEL[id],
    color: SIGNAL_COLOR[id],
    summary: firstNarrative(decision) ?? SIGNAL_DEFAULT_SUMMARY[id],
  };
}

const SIGNAL_DEFAULT_SUMMARY: Record<SignalId, string> = {
  advancing: "You're ready to move ahead.",
  reinforcing: "Building a solid grasp of this concept.",
  revisiting: "A quick pass over what you've covered.",
  remediating: "Approaching this a different way.",
  challenging: "Time for a harder application.",
};

function firstNarrative(
  decision: Pick<DecisionView, "action"> & { adaptationNarrative?: string[] },
): string | null {
  const line = decision.adaptationNarrative?.[0];
  return line && line.length > 0 ? line : null;
}

/** Human label for a teaching action (for chips / timelines). */
export function actionLabel(action: string): string {
  return action
    .toLowerCase()
    .split("_")
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(" ");
}

export function questionKindLabel(kind: string): string {
  switch (kind) {
    case "CONCEPTUAL":
      return "Definition";
    case "APPLICATION":
      return "Application";
    case "SCENARIO":
      return "Scenario";
    case "PROBLEM_SOLVING":
      return "Problem solving";
    default:
      return actionLabel(kind);
  }
}

export type ClassificationTone =
  "correct" | "partial" | "incorrect" | "uncertain";

export function classificationPresentation(classification: string): {
  label: string;
  tone: ClassificationTone;
} {
  switch (classification) {
    case "CORRECT":
      return { label: "Correct", tone: "correct" };
    case "PARTIALLY_CORRECT":
      return { label: "Partially correct", tone: "partial" };
    case "INCORRECT":
      return { label: "Needs work", tone: "incorrect" };
    default:
      return { label: "Uncertain", tone: "uncertain" };
  }
}

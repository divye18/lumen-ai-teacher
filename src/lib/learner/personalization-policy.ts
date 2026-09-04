import type { QuestionFormat, TeachingStyle } from "@/lib/db/enums";

import type {
  LearningProfile,
  LearningSignal,
  LearningSignalKind,
} from "./learning-profile";

/**
 * ADAPTIVE TEACHER MEMORY — personalization policy.
 *
 * Turns the descriptive {@link LearningProfile} into a small set of concrete,
 * deterministic, explainable teaching adjustments. Pure function.
 *
 * Rules of engagement:
 *   - The deterministic teaching policy stays authoritative. These adjustments
 *     only bias *tie-break* decisions the base policy leaves open (which visual
 *     framing, which question format, whether to open a concept with an
 *     example).
 *   - Never fabricates: an empty / low-evidence profile yields the baseline
 *     (all adjustments off, `note` null).
 *   - Never exposes internal reasoning — `note` is one learner-facing sentence.
 */

export interface PersonalizationAdjustments {
  /** Open a brand-new concept with a worked example instead of an abstract explanation. */
  preferConcreteExample: boolean;
  /** Bias for `deriveVisualIntent` when the base rule is neutral. */
  visualBias: "concrete" | "reframe" | "connect" | null;
  /** Structured-assessment format to deliberately target (a known weak spot). */
  targetFormatWeakness: QuestionFormat | null;
  /** Preferred strategy when the policy chooses to reteach. */
  preferredRemediation: TeachingStyle | null;
  /** Seed application-style questions instead of definition recall. */
  shiftTowardApplication: boolean;
  /** One concise learner-facing sentence for the active adjustment, or null. */
  note: string | null;
  /** Signal kinds that drove the adjustments. INTERNAL / audit only. */
  basedOn: LearningSignalKind[];
}

export const BASELINE_ADJUSTMENTS: PersonalizationAdjustments = {
  preferConcreteExample: false,
  visualBias: null,
  targetFormatWeakness: null,
  preferredRemediation: null,
  shiftTowardApplication: false,
  note: null,
  basedOn: [],
};

/** Minimum evidence before a profile is allowed to change teaching at all. */
export const MIN_SAMPLE_TO_PERSONALIZE = 4;
/** Minimum per-signal confidence before that signal is allowed to act. */
export const MIN_SIGNAL_CONFIDENCE = 0.5;

/** `note` priority — the first active adjustment in this order wins the sentence. */
const NOTE_PRIORITY: LearningSignalKind[] = [
  "example-recovery",
  "simplification-recovery",
  "format-specific-weakness",
  "recall-ahead-of-application",
  "visual-reframe-effective",
  "learning-momentum",
  "recurring-misconception",
];

const FORMAT_VALUES = new Set<QuestionFormat>([
  "MCQ",
  "MULTI_SELECT",
  "TRUE_FALSE",
  "ORDER_STEPS",
  "CLASSIFY",
  "MATCH_RELATIONSHIP",
]);

export function personalizeTeaching(
  profile: LearningProfile,
): PersonalizationAdjustments {
  if (profile.sampleSize < MIN_SAMPLE_TO_PERSONALIZE) {
    return { ...BASELINE_ADJUSTMENTS };
  }

  const active = new Map<LearningSignalKind, LearningSignal>();
  for (const s of profile.signals) {
    if (s.evidence.confidence >= MIN_SIGNAL_CONFIDENCE) active.set(s.kind, s);
  }
  if (active.size === 0) return { ...BASELINE_ADJUSTMENTS };

  const out: PersonalizationAdjustments = {
    ...BASELINE_ADJUSTMENTS,
    basedOn: [...active.keys()],
  };
  const notes = new Map<LearningSignalKind, string>();

  if (active.has("example-recovery")) {
    out.preferConcreteExample = true;
    out.visualBias = "concrete";
    out.preferredRemediation = strategyFromDetail(
      active.get("example-recovery")!,
    );
    notes.set(
      "example-recovery",
      "Starting with a concrete example — that has helped you recover faster before.",
    );
  }

  if (active.has("simplification-recovery")) {
    out.preferredRemediation ??= "conversational";
    if (!out.visualBias) out.visualBias = "concrete";
    notes.set(
      "simplification-recovery",
      "Keeping the first pass simple — a simplified re-explanation has worked well for you.",
    );
  }

  if (active.has("visual-reframe-effective") && !out.visualBias) {
    out.visualBias = "reframe";
    notes.set(
      "visual-reframe-effective",
      "Leaning on a visual model here — those have tended to land for you.",
    );
  }

  if (active.has("format-specific-weakness")) {
    const weak = active.get("format-specific-weakness")!.detail.weakFormat;
    if (typeof weak === "string" && FORMAT_VALUES.has(weak as QuestionFormat)) {
      out.targetFormatWeakness = weak as QuestionFormat;
      notes.set(
        "format-specific-weakness",
        "Bringing back a question style you've found harder, so we can shore it up.",
      );
    }
  }

  if (active.has("recall-ahead-of-application")) {
    out.shiftTowardApplication = true;
    if (!out.visualBias) out.visualBias = "connect";
    notes.set(
      "recall-ahead-of-application",
      "Leaning on applied questions — you know the definitions; the practice is in using them.",
    );
  }

  if (active.has("learning-momentum")) {
    const dir = active.get("learning-momentum")!.detail.direction;
    if (dir === "dipping") {
      out.preferConcreteExample = true;
      if (!out.visualBias) out.visualBias = "concrete";
    }
    notes.set(
      "learning-momentum",
      dir === "dipping"
        ? "Slowing the pace a little after a couple of shaky answers."
        : "Keeping the momentum going — your recent answers are trending up.",
    );
  }

  if (active.has("recurring-misconception")) {
    notes.set(
      "recurring-misconception",
      "Still targeting a mix-up that has come back more than once.",
    );
  }

  for (const kind of NOTE_PRIORITY) {
    if (notes.has(kind)) {
      out.note = notes.get(kind)!;
      break;
    }
  }

  return out;
}

function strategyFromDetail(signal: LearningSignal): TeachingStyle | null {
  const s = signal.detail.strategy;
  return s === "example-first" || s === "analogy-first" ? s : "example-first";
}

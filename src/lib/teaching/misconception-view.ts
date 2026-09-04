/**
 * Turns a persisted misconception (+ the structured grader's learner-facing
 * insight, when present) into the "Lumen noticed a pattern" reveal.
 *
 * Pure and deterministic. Never exposes the internal taxonomy id
 * (`category`) — only a readable phrase and one plain-language sentence.
 */

export interface MisconceptionDetailView {
  /** Short learner-facing phrase — never the internal taxonomy id. */
  label: string;
  /** One learner-safe sentence describing the wrong mental model. */
  explanation: string;
  firstDetectedAtISO: string;
  /** How many answers have now shown this misconception. */
  detectionCount: number;
  severity: string;
  /** ACTIVE | IMPROVING | RESOLVED. */
  status: string;
  /** True when this misconception existed before the current answer. */
  isRecurrence: boolean;
  /** Learner-facing statement of what Lumen is doing about it. */
  remediation: string;
}

export interface MisconceptionSource {
  category: string;
  description: string;
  severity: string;
  status: string;
  firstDetectedAtISO: string;
  detectionCount: number;
  /** True when the row already existed before the current answer. */
  isRecurrence: boolean;
  /** The structured grader's learner-facing label/explanation, when it produced one. */
  insight?: { label: string; explanation: string } | null;
}

/** "confuses-cache-with-storage" → "Cache vs. storage". */
function labelFromCategory(category: string): string {
  const words = category
    .replace(/^(confuses|thinks|assumes|believes|misses)[-_]?/i, "")
    .split(/[-_\s]+/)
    .filter(Boolean);
  if (words.length === 0) return "A recurring mix-up";
  const phrase = words.join(" ");
  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}

/** First sentence of the description, trimmed to something a learner reads once. */
function shortExplanation(description: string): string {
  const firstSentence =
    description.split(/(?<=[.!?])\s/)[0]?.trim() ?? description;
  const clipped =
    firstSentence.length > 180
      ? `${firstSentence.slice(0, 177).trimEnd()}…`
      : firstSentence;
  return /[.!?]$/.test(clipped) ? clipped : `${clipped}.`;
}

function remediationFor(source: MisconceptionSource): string {
  if (source.status === "RESOLVED") {
    return "You've since answered past this — Lumen is keeping an eye on it.";
  }
  if (source.detectionCount >= 2) {
    return "Lumen has seen this pattern before — it's re-teaching the idea a different way, then checking again.";
  }
  return "Lumen will address this before moving on.";
}

export function buildMisconceptionDetail(
  source: MisconceptionSource,
): MisconceptionDetailView {
  const label =
    source.insight?.label?.trim() || labelFromCategory(source.category);
  const explanation =
    source.insight?.explanation?.trim() || shortExplanation(source.description);
  return {
    label,
    explanation,
    firstDetectedAtISO: source.firstDetectedAtISO,
    detectionCount: Math.max(1, source.detectionCount),
    severity: source.severity,
    status: source.status,
    isRecurrence: source.isRecurrence,
    remediation: remediationFor(source),
  };
}

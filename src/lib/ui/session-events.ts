import type { DecisionView, InteractionResultView } from "@/lib/session/views";
import { actionLabel } from "./learning-presentation";

/**
 * Derives the Teaching Room session timeline from REAL events only — the
 * decision history and answer results already in the client. Never fabricates
 * an event. Pure.
 */

export type SessionEventKind =
  | "concept"
  | "strategy"
  | "misconception"
  | "correct"
  | "reteach"
  | "mastery"
  | "example"
  | "difficulty";

export interface SessionEvent {
  id: string;
  kind: SessionEventKind;
  label: string;
  detail?: string;
  /** minutes:seconds from session start, when known. */
  at?: string;
}

export interface SessionEventInput {
  decisions: DecisionView[];
  results: InteractionResultView[];
  /** conceptKey -> title */
  conceptTitles: Record<string, string>;
  startedAtMs: number | null;
}

const STRATEGY_PHRASE: Record<string, string> = {
  formal: "precise definitions",
  conversational: "a plain-language explanation",
  "example-first": "a worked example",
  "analogy-first": "an analogy",
  "visual-first": "a mental model",
  socratic: "guided questioning",
};

function strategyPhrase(strategy: string): string {
  return (
    STRATEGY_PHRASE[strategy] ?? `a ${strategy.replace(/-/g, " ")} approach`
  );
}

function stamp(startedAtMs: number | null): string | undefined {
  if (!startedAtMs) return undefined;
  const secs = Math.max(0, Math.round((Date.now() - startedAtMs) / 1000));
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function buildSessionEvents(input: SessionEventInput): SessionEvent[] {
  const events: SessionEvent[] = [];
  let lastConcept: string | null = null;
  let lastStrategy: string | null = null;
  let resultCursor = 0;

  input.decisions.forEach((d, i) => {
    const conceptKey = d.targetConceptKey;
    const title = input.conceptTitles[conceptKey] ?? conceptKey;

    if (conceptKey && conceptKey !== lastConcept) {
      lastConcept = conceptKey;
      events.push({
        id: `concept-${i}-${conceptKey}`,
        kind: "concept",
        label: title,
        detail: "Started this concept",
        at: stamp(input.startedAtMs),
      });
    }

    if (d.source !== "policy" || i === 0) {
      // strategy change from the reconciled decision
    }
    if (lastStrategy && d.strategy !== lastStrategy && d.action === "RETEACH") {
      events.push({
        id: `strategy-${i}`,
        kind: "strategy",
        label: `Switched to ${strategyPhrase(d.strategy)}`,
        detail: d.whyThisNext?.reason ?? d.adaptationNarrative[0],
      });
    }
    lastStrategy = d.strategy;

    if (d.action === "RETEACH") {
      events.push({
        id: `reteach-${i}`,
        kind: "reteach",
        label: "Re-taught with a different representation",
        detail: d.whyThisNext?.reason ?? d.reason,
      });
    }

    if (d.action === "EXAMPLE") {
      events.push({
        id: `example-${i}`,
        kind: "example",
        label: "Worked example",
        detail: d.whyThisNext?.headline ?? `${title}`,
      });
    }

    if (d.action === "INCREASE_DIFFICULTY") {
      events.push({
        id: `harder-${i}`,
        kind: "difficulty",
        label: "Difficulty increased",
        detail:
          d.whyThisNext?.reason ??
          "Mastery is high enough for a harder question.",
      });
    }

    // Attribute the next result to this decision when the counts line up.
    if (
      (d.action === "ASK" || d.action === "ASSESS") &&
      resultCursor < input.results.length
    ) {
      const r = input.results[resultCursor];
      resultCursor += 1;
      const c = r.evaluation.classification;
      if (c === "CORRECT") {
        events.push({
          id: `correct-${i}`,
          kind: "correct",
          label: "Correct answer",
          detail: `${title} · mastery ${r.learnerUpdate.masteryBefore} → ${r.learnerUpdate.masteryAfter}`,
          at: stamp(input.startedAtMs),
        });
      } else if (r.learnerUpdate.newMisconceptions > 0) {
        events.push({
          id: `miscon-${i}`,
          kind: "misconception",
          label: "Misconception detected",
          detail: `${title} · Lumen will address it before moving on`,
          at: stamp(input.startedAtMs),
        });
      } else if (c === "INCORRECT" || c === "PARTIALLY_CORRECT") {
        events.push({
          id: `attempt-${i}`,
          kind: "mastery",
          label: c === "INCORRECT" ? "Answer needs work" : "Partly there",
          detail: `${title} · ${actionLabel(r.nextDecision.action)} next`,
          at: stamp(input.startedAtMs),
        });
      }
    }
  });

  return events.slice(-12);
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { StructuredAnswer } from "@/lib/assessment/structured";
import type { DiagnosticQuestionItemView } from "@/lib/session/diagnostic-flow";
import type { DiagnosticSummaryView } from "@/lib/session/diagnostic-summary";

import { DiagnosticSummaryPanel } from "./diagnostic-summary-panel";
import { StructuredQuestion } from "./structured/structured-question";

/**
 * DIAGNOSTIC GATE — shown before the Teaching Room whenever `SessionView`
 * has a pending diagnostic (`items.length > 0`) or an un-acknowledged
 * completed one (`initialSummary`, from a reload right after completion —
 * see `session/diagnostic-summary.ts`'s `resolveDiagnosticSummaryPhase`).
 *
 * Reuses the existing `StructuredQuestion` renderer for every question
 * format — no new question UI — and `DiagnosticSummaryPanel` for the
 * completion screen. "Continue to Teaching Room" acknowledges via the same
 * `/api/teaching/diagnostic` endpoint (an empty answer batch is a no-op
 * acknowledgment once the diagnostic is COMPLETED) then refreshes, which
 * naturally renders the normal Teaching Room since the server no longer
 * reports a pending diagnostic or summary.
 */

export function DiagnosticGate({
  sessionId,
  items,
  initialSummary,
}: {
  sessionId: string;
  items: DiagnosticQuestionItemView[];
  initialSummary?: DiagnosticSummaryView | null;
}) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [continuing, setContinuing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<DiagnosticSummaryView | null>(
    initialSummary ?? null,
  );
  const [answeredSoFar, setAnsweredSoFar] = useState<
    { conceptKey: string; answer: StructuredAnswer }[]
  >([]);

  const current = items[index];

  async function handleAnswer(answer: StructuredAnswer) {
    const nextAnswers = [
      ...answeredSoFar,
      { conceptKey: current.conceptKey, answer },
    ];
    setAnsweredSoFar(nextAnswers);

    if (index + 1 < items.length) {
      setIndex(index + 1);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/teaching/diagnostic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, answers: nextAnswers }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(
          json?.error?.message ?? "The diagnostic couldn't be graded.",
        );
      }
      setSummary(json.summary as DiagnosticSummaryView);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleContinue() {
    setContinuing(true);
    try {
      // Acknowledges the completed diagnostic (clears it from the session
      // view) so it doesn't reappear; an empty batch is a safe no-op once
      // status is already COMPLETED — see submitDiagnostic in orchestrator.ts.
      await fetch("/api/teaching/diagnostic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, answers: [] }),
      });
    } catch {
      // Best-effort — refresh regardless so the learner isn't stuck.
    } finally {
      router.refresh();
    }
  }

  if (summary) {
    return (
      <div className="mx-auto max-w-xl px-6 py-16">
        <DiagnosticSummaryPanel
          summary={summary}
          onContinue={handleContinue}
          continuing={continuing}
        />
      </div>
    );
  }

  if (!current) return null;

  return (
    <div className="mx-auto max-w-xl px-6 py-16">
      <p className="text-[13px] font-semibold tracking-wide text-[var(--color-accent)] uppercase">
        Quick check — question {index + 1} of {items.length}
      </p>
      <h1 className="mt-2 text-xl font-semibold text-[var(--color-ink)]">
        {current.conceptTitle}
      </h1>
      <p className="mt-1 text-[13px] text-[var(--color-ink-faint)]">
        A few questions so Lumen knows where to start teaching.
      </p>
      {error ? (
        <p className="mt-3 text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
      <div className="mt-6">
        <StructuredQuestion
          question={current.structured}
          submitting={submitting}
          onSubmit={handleAnswer}
        />
      </div>
    </div>
  );
}

"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import type { StructuredAnswer } from "@/lib/assessment/structured";
import type { DiagnosticQuestionItemView } from "@/lib/session/diagnostic-flow";
import type { DiagnosticSummaryView } from "@/lib/session/diagnostic-summary";

import { DiagnosticSummaryPanel } from "./diagnostic-summary-panel";
import { StructuredQuestion } from "./structured/structured-question";

type DiagnosticAnswer = { conceptKey: string; answer: StructuredAnswer };

/**
 * DIAGNOSTIC GATE — shown before the Teaching Room whenever `SessionView`
 * has a pending diagnostic (`items.length > 0`) or an un-acknowledged
 * completed one (`initialSummary`, from a reload right after completion —
 * see `session/diagnostic-summary.ts`'s `resolveDiagnosticPhase`).
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
  const [answeredSoFar, setAnsweredSoFar] = useState<DiagnosticAnswer[]>([]);
  // The exact batch a failed submission attempted — so "Retry" resends the
  // SAME answers rather than re-asking the last question (which would
  // append a second, duplicate entry to the batch).
  const [pendingAnswers, setPendingAnswers] = useState<
    DiagnosticAnswer[] | null
  >(null);

  // Synchronous re-entry guard: React state updates are batched, so a fast
  // double-click/double-tap can fire `handleAnswer` twice for the SAME
  // question before its button actually re-renders as disabled. This ref
  // remembers which question's conceptKey we've already started answering —
  // read/written only inside the event handler, never during render — so a
  // duplicate call for that same question is a no-op. Advancing to the next
  // question naturally clears the guard (its conceptKey differs).
  const processingKeyRef = useRef<string | null>(null);

  const current = items[index];

  async function submitBatch(answers: DiagnosticAnswer[]) {
    setPendingAnswers(answers);
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/teaching/diagnostic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, answers }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(
          json?.error?.message ?? "The diagnostic couldn't be graded.",
        );
      }
      setPendingAnswers(null);
      setSummary(json.summary as DiagnosticSummaryView);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAnswer(answer: StructuredAnswer) {
    if (processingKeyRef.current === current.conceptKey) return;
    processingKeyRef.current = current.conceptKey;

    const nextAnswers = [
      ...answeredSoFar,
      { conceptKey: current.conceptKey, answer },
    ];
    setAnsweredSoFar(nextAnswers);

    if (index + 1 < items.length) {
      setIndex(index + 1);
      return;
    }

    await submitBatch(nextAnswers);
  }

  function handleRetry() {
    if (pendingAnswers) void submitBatch(pendingAnswers);
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

  // A failed final submission — the answer was already recorded locally, so
  // retrying resends the same batch instead of re-showing the last question.
  if (error && pendingAnswers) {
    return (
      <div className="mx-auto max-w-xl px-6 py-16 text-center">
        <p className="text-[13px] font-semibold tracking-wide text-[var(--color-accent)] uppercase">
          Quick check
        </p>
        <h1 className="mt-3 text-xl font-semibold text-[var(--color-ink)]">
          Couldn&apos;t grade the diagnostic
        </h1>
        <p
          className="mt-2 text-[13px] text-[var(--color-ink-muted)]"
          role="alert"
        >
          {error}
        </p>
        <Button
          className="mt-6"
          size="lg"
          loading={submitting}
          onClick={handleRetry}
        >
          Retry
        </Button>
      </div>
    );
  }

  if (!current) {
    return (
      <div className="mx-auto max-w-xl px-6 py-16 text-center">
        <p className="text-[14px] text-[var(--color-ink-muted)]">
          Nothing to check right now.
        </p>
        <Button className="mt-6" size="lg" onClick={() => router.refresh()}>
          Continue
        </Button>
      </div>
    );
  }

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

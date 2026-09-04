"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import type { StructuredAnswer } from "@/lib/assessment/structured";
import type { DiagnosticQuestionItemView } from "@/lib/session/diagnostic-flow";

import { StructuredQuestion } from "./structured/structured-question";

/**
 * DIAGNOSTIC GATE — a short pre-assessment shown before the Teaching Room,
 * only when `SessionView.diagnostic` is non-null (see
 * `session/diagnostic-flow.ts`'s `resolveDiagnosticPhase`). Reuses the
 * existing `StructuredQuestion` renderer for every format — no new question
 * UI. On completion it refreshes the page, which re-fetches the session and
 * naturally renders the normal Teaching Room, since the diagnostic is now
 * COMPLETED server-side.
 */

interface DiagnosticSummary {
  strongConceptKeys: string[];
  developingConceptKeys: string[];
  weakConceptKeys: string[];
}

export function DiagnosticGate({
  sessionId,
  items,
}: {
  sessionId: string;
  items: DiagnosticQuestionItemView[];
}) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<DiagnosticSummary | null>(null);
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
      setSummary({
        strongConceptKeys: json.strongConceptKeys,
        developingConceptKeys: json.developingConceptKeys,
        weakConceptKeys: json.weakConceptKeys,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  if (summary) {
    const { strongConceptKeys, developingConceptKeys, weakConceptKeys } =
      summary;
    return (
      <div className="mx-auto max-w-xl px-6 py-16 text-center">
        <p className="text-[13px] font-semibold tracking-wide text-[var(--color-accent)] uppercase">
          Quick check complete
        </p>
        <h1 className="mt-3 text-2xl font-semibold text-[var(--color-ink)]">
          Here&apos;s where you&apos;re starting from
        </h1>
        <p className="mt-4 text-[14px] leading-relaxed text-[var(--color-ink-muted)]">
          {strongConceptKeys.length > 0
            ? `Already solid on ${strongConceptKeys.length} concept${strongConceptKeys.length === 1 ? "" : "s"}. `
            : ""}
          {developingConceptKeys.length > 0
            ? `Getting there on ${developingConceptKeys.length}. `
            : ""}
          {weakConceptKeys.length > 0
            ? `We'll start with ${weakConceptKeys.length} you haven't seen yet.`
            : ""}
          {strongConceptKeys.length === 0 &&
          developingConceptKeys.length === 0 &&
          weakConceptKeys.length === 0
            ? "Lumen will teach from the beginning."
            : ""}
        </p>
        <Button className="mt-8" size="lg" onClick={() => router.refresh()}>
          Enter Teaching Room
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

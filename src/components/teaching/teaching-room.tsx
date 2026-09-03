"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";

import { AdaptiveTransition } from "@/components/learning/adaptive-transition";
import { EvaluationResult } from "@/components/teaching/evaluation-result";
import {
  LearnerStatePanel,
  type LearnerStateSnapshot,
} from "@/components/teaching/learner-state-panel";
import { QuestionPanel } from "@/components/teaching/question-panel";
import { TeachingContent } from "@/components/teaching/teaching-content";
import { Button, LinkButton } from "@/components/ui/button";
import { ErrorState, InlineSpinner } from "@/components/ui/states";
import { LumenWordmark } from "@/components/ui/lumen-mark";
import { ThemeToggle } from "@/components/ui/theme";
import type { TimelineConcept } from "@/components/learning/session-timeline";
import { apiFetch } from "@/lib/ui/api-client";
import { actionLabel } from "@/lib/ui/learning-presentation";
import type {
  InteractionResultView,
  SessionView,
  TeachingStepView,
} from "@/lib/session/views";

type Phase =
  | "loading"
  | "teaching"
  | "question"
  | "result"
  | "transition"
  | "complete"
  | "error";

interface StepResponse {
  ok: true;
  step: TeachingStepView;
}
interface SessionResponse {
  ok: true;
  session: SessionView;
}
interface InteractionResponse {
  ok: true;
  result: InteractionResultView;
}

export function TeachingRoom({
  sessionId,
  initialSession,
  concepts: initialConcepts,
}: {
  sessionId: string;
  initialSession: SessionView;
  concepts: TimelineConcept[];
}) {
  const reduce = useReducedMotion();

  const [phase, setPhase] = useState<Phase>("loading");
  const [step, setStep] = useState<TeachingStepView | null>(null);
  const [result, setResult] = useState<InteractionResultView | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [statusByKey, setStatusByKey] = useState<Record<string, string>>(() =>
    Object.fromEntries(initialConcepts.map((c) => [c.key, c.status])),
  );
  const [currentIndex, setCurrentIndex] = useState(
    initialSession.progress.conceptIndex,
  );
  const [currentConceptKey, setCurrentConceptKey] = useState<string | null>(
    initialSession.progress.currentConceptKey,
  );
  const [decisionHistory, setDecisionHistory] = useState<
    TeachingStepView["decision"][]
  >([]);
  const [snapshot, setSnapshot] = useState<LearnerStateSnapshot>(() =>
    snapshotFromSession(initialSession),
  );
  const [timeRemaining, setTimeRemaining] = useState<number | null>(
    initialSession.progress.timeRemainingMinutes,
  );

  const started = useRef(false);
  const loadStepRef = useRef<() => void>(() => {});
  const [autoAdvanceTick, setAutoAdvanceTick] = useState(0);

  const applySession = useCallback((session: SessionView) => {
    setCurrentIndex(session.progress.conceptIndex);
    setCurrentConceptKey(session.progress.currentConceptKey);
    setTimeRemaining(session.progress.timeRemainingMinutes);
    setStatusByKey((prev) => {
      const next = { ...prev };
      for (const m of session.mastery) next[m.conceptKey] = m.status;
      return next;
    });
    setSnapshot((prevSnap) => {
      const next = snapshotFromSession(session);
      return {
        ...next,
        mode: prevSnap.mode ?? next.mode,
        previousMasteryPoints:
          next.masteryPoints !== prevSnap.masteryPoints
            ? prevSnap.masteryPoints
            : prevSnap.previousMasteryPoints,
      };
    });
  }, []);

  const refreshSession = useCallback(async () => {
    const res = await apiFetch<SessionResponse>("/api/teaching/session", {
      method: "POST",
      body: JSON.stringify({ sessionId }),
    });
    if (res.ok) applySession(res.data.session);
  }, [sessionId, applySession]);

  const loadStep = useCallback(async () => {
    setPhase("loading");
    setBusy(true);
    setErrorMsg(null);
    const res = await apiFetch<StepResponse>("/api/teaching/step", {
      method: "POST",
      body: JSON.stringify({ sessionId }),
    });
    setBusy(false);
    if (!res.ok) {
      setErrorMsg(res.error.message);
      setPhase("error");
      return;
    }
    const s = res.data.step;
    setStep(s);
    setResult(null);
    setDecisionHistory((h) => [...h, s.decision]);
    setSnapshot((prev) => ({ ...prev, mode: s.decision.action }));

    if (s.sessionStatus === "COMPLETED") {
      setPhase("complete");
      return;
    }
    if (s.content) {
      setPhase("teaching");
      return;
    }
    if (s.question) {
      setPhase("question");
      return;
    }
    // MOVE_FORWARD mid-lesson: advance, then schedule another step.
    await refreshSession();
    setPhase("loading");
    setAutoAdvanceTick((t) => t + 1);
  }, [sessionId, refreshSession]);

  useEffect(() => {
    loadStepRef.current = () => void loadStep();
  }, [loadStep]);

  useEffect(() => {
    if (!started.current) {
      started.current = true;
      loadStepRef.current();
    }
  }, []);

  useEffect(() => {
    if (autoAdvanceTick === 0) return;
    const id = window.setTimeout(
      () => loadStepRef.current(),
      reduce ? 200 : 850,
    );
    return () => window.clearTimeout(id);
  }, [autoAdvanceTick, reduce]);

  async function submitAnswer(answer: string, elapsedMs: number) {
    setBusy(true);
    setErrorMsg(null);
    const res = await apiFetch<InteractionResponse>(
      "/api/teaching/interaction",
      {
        method: "POST",
        body: JSON.stringify({
          sessionId,
          questionId: step?.question?.questionId,
          answer,
          responseTimeMs: Math.min(elapsedMs, 3_600_000),
        }),
      },
    );
    setBusy(false);
    if (!res.ok) {
      setErrorMsg(res.error.message);
      return;
    }
    setResult(res.data.result);
    setDecisionHistory((h) => [...h, res.data.result.nextDecision]);
    await refreshSession();
    setPhase("result");
  }

  function beginTransition() {
    if (!result) {
      void loadStep();
      return;
    }
    setPhase("transition");
  }

  const approachTrail = decisionHistory.map((d) => actionLabel(d.action));
  const activeDecision = result
    ? result.nextDecision
    : (step?.decision ?? null);

  const concepts: TimelineConcept[] = initialConcepts.map((c) => ({
    ...c,
    status: statusByKey[c.key] ?? c.status,
  }));
  const currentConceptTitle =
    initialConcepts.find((c) => c.key === currentConceptKey)?.title ?? null;
  const panelSnapshot: LearnerStateSnapshot = {
    ...snapshot,
    currentConceptTitle,
  };

  return (
    <div className="flex min-h-svh flex-col">
      <TeachingTopBar
        timeRemaining={timeRemaining}
        progress={
          concepts.length > 0
            ? `Concept ${Math.min(currentIndex + 1, concepts.length)} of ${concepts.length}`
            : null
        }
      />

      <div className="mx-auto grid w-full max-w-6xl flex-1 gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:py-10">
        <div className="min-w-0">
          <div className="mx-auto max-w-2xl">
            {phase === "loading" ? (
              <div className="flex items-center gap-3 py-20">
                <InlineSpinner label="Lumen is preparing the next step…" />
              </div>
            ) : null}

            {phase === "error" ? (
              <ErrorState
                title="This step didn't load"
                description={errorMsg ?? undefined}
                retry={() => void loadStep()}
              />
            ) : null}

            <motion.div
              key={phase}
              initial={reduce ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduce ? 0 : 0.22 }}
            >
              {phase === "teaching" && step?.content ? (
                <>
                  <ConceptEyebrow
                    title={step.content.title}
                    action={step.decision.action}
                  />
                  <TeachingContent
                    content={step.content}
                    citations={step.citations}
                    onContinue={() => void loadStep()}
                    continuing={busy}
                  />
                </>
              ) : null}

              {phase === "question" && step?.question ? (
                <>
                  <ConceptEyebrow
                    title={step.question.conceptKey}
                    action="ASK"
                    label="Your turn"
                  />
                  <QuestionPanel
                    question={step.question}
                    citations={step.citations}
                    onSubmit={submitAnswer}
                    submitting={busy}
                  />
                  {errorMsg ? (
                    <p
                      role="alert"
                      className="mt-3 text-[12px] text-[var(--color-danger)]"
                    >
                      {errorMsg}
                    </p>
                  ) : null}
                </>
              ) : null}

              {phase === "result" && result ? (
                <EvaluationResult
                  result={result}
                  onContinue={beginTransition}
                  continuing={busy}
                />
              ) : null}

              {phase === "transition" && result ? (
                <>
                  <AdaptiveTransition
                    headline={transitionHeadline(result)}
                    decision={result.nextDecision}
                    onDone={() => void loadStep()}
                  />
                  <div className="mt-4 flex justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void loadStep()}
                    >
                      Skip
                    </Button>
                  </div>
                </>
              ) : null}

              {phase === "complete" ? (
                <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center">
                  <p className="text-[11px] font-semibold tracking-wider text-[var(--color-accent)] uppercase">
                    Lesson complete
                  </p>
                  <h2 className="mt-3 text-xl font-semibold tracking-tight">
                    You&apos;ve worked through every concept
                  </h2>
                  <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-[var(--color-ink-muted)]">
                    Lumen has updated what it knows about you. See the summary
                    of how your understanding moved.
                  </p>
                  <div className="mt-6 flex flex-wrap justify-center gap-3">
                    <LinkButton
                      href={`/studio/session/${sessionId}/complete`}
                      size="lg"
                    >
                      View session summary
                    </LinkButton>
                    <LinkButton href="/studio" variant="secondary" size="lg">
                      Back to studio
                    </LinkButton>
                  </div>
                </div>
              ) : null}
            </motion.div>
          </div>
        </div>

        <aside className="lg:sticky lg:top-20 lg:h-fit">
          <LearnerStatePanel
            snapshot={panelSnapshot}
            decision={activeDecision}
            concepts={concepts}
            currentIndex={currentIndex}
            approachTrail={approachTrail}
          />
        </aside>
      </div>
    </div>
  );
}

function ConceptEyebrow({
  title,
  action,
  label = "Current concept",
}: {
  title: string;
  action: string;
  label?: string;
}) {
  return (
    <div className="mb-4">
      <p className="text-[10px] font-semibold tracking-wider text-[var(--color-ink-faint)] uppercase">
        {label} · {actionLabel(action)}
      </p>
      <p className="mt-1 text-[13px] font-medium text-[var(--color-ink-muted)] capitalize">
        {title.replace(/-/g, " ")}
      </p>
    </div>
  );
}

function TeachingTopBar({
  timeRemaining,
  progress,
}: {
  timeRemaining: number | null;
  progress: string | null;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-[var(--color-border)] bg-[color-mix(in_oklab,var(--color-canvas)_88%,transparent)] backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link href="/studio" aria-label="Exit to studio">
          <LumenWordmark />
        </Link>
        {progress ? (
          <span className="hidden text-[12px] text-[var(--color-ink-muted)] sm:inline">
            {progress}
          </span>
        ) : null}
        <div className="ml-auto flex items-center gap-3">
          {timeRemaining !== null ? (
            <span className="text-[12px] text-[var(--color-ink-muted)] tabular-nums">
              {timeRemaining <= 0 ? "Time's up" : `${timeRemaining} min left`}
            </span>
          ) : null}
          <ThemeToggle />
          <Link
            href="/studio"
            className="text-[12px] font-medium text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
          >
            Exit
          </Link>
        </div>
      </div>
    </header>
  );
}

function snapshotFromSession(session: SessionView): LearnerStateSnapshot {
  const key = session.progress.currentConceptKey;
  const current = session.mastery.find((m) => m.conceptKey === key);
  return {
    masteryPoints: current?.masteryPoints ?? 0,
    previousMasteryPoints: null,
    confidence: current?.confidence ?? 0,
    currentConceptTitle: null,
    mode: session.currentAction,
  };
}

function transitionHeadline(result: InteractionResultView): string {
  const c = result.evaluation.classification;
  if (c === "CORRECT") return "You demonstrated strong understanding.";
  if (c === "PARTIALLY_CORRECT")
    return "You're on the right track, but there's a gap.";
  if (c === "INCORRECT") return "That answer wasn't quite right.";
  return "Lumen needs a clearer signal on this one.";
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";

import { LearningSignalCard } from "@/components/learning/learning-signal-card";
import { LumenLearningSignal } from "@/components/learning/lumen-learning-signal";
import { WhyNextCard } from "@/components/learning/why-next-card";
import { TeachingRoomMap } from "@/components/graph/teaching-room-map";
import { EvaluationResult } from "@/components/teaching/evaluation-result";
import { AskLumen } from "@/components/teaching/ask-lumen";
import {
  LearnerStatePanel,
  type LearnerStateSnapshot,
} from "@/components/teaching/learner-state-panel";
import { QuestionPanel } from "@/components/teaching/question-panel";
import { SessionTimelinePanel } from "@/components/teaching/session-timeline-panel";
import { TeachingContent } from "@/components/teaching/teaching-content";
import { TeacherPresence } from "@/components/teacher/teacher-presence";
import { VisualCanvas } from "@/components/visuals/visual-canvas";
import { VoiceControls } from "@/components/voice/voice-controls";
import { CaptionTrack } from "@/components/voice/caption-track";
import { useVoiceController } from "@/components/voice/use-voice-controller";
import type { VoiceCloudStatus } from "@/lib/voice/types";
import { LinkButton } from "@/components/ui/button";
import { ErrorState, InlineSpinner } from "@/components/ui/states";
import { LumenWordmark } from "@/components/ui/lumen-mark";
import { ThemeToggle } from "@/components/ui/theme";
import type { TimelineConcept } from "@/components/learning/session-timeline";
import type { KnowledgeGraphView } from "@/lib/graph";
import type { VisualDirective } from "@/lib/visuals";
import { apiFetch } from "@/lib/ui/api-client";
import { actionLabel } from "@/lib/ui/learning-presentation";
import { buildSessionEvents } from "@/lib/ui/session-events";
import { deriveTeachingStage } from "@/lib/teaching/teaching-stage";
import {
  visualIntentLabel,
  visualModeLabel,
  type VisualIntent,
} from "@/lib/teaching/visual-adaptation";
import { masteryBand } from "@/lib/teaching/mastery";
import {
  trajectoryFromResults,
  type MasteryTrajectory,
} from "@/lib/studio/mastery-trajectory";
import { MasteryTrajectoryChart } from "@/components/learning/mastery-trajectory";
import type {
  InteractionResultView,
  LiveStatusView,
  SessionView,
  TeachingStepView,
} from "@/lib/session/views";
import { cn } from "@/lib/ui/cn";

type Phase =
  "loading" | "teaching" | "question" | "result" | "complete" | "error";

/** ms between the reveal beats of the post-answer sequence. */
const RESULT_BEAT_MS = [1400, 1700];

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

export type { VoiceCloudStatus };

interface AnswerLogEntry {
  conceptKey: string;
  masteryBefore: number;
  masteryAfter: number;
  reason: string;
  classification: string;
  misconceptionDetected: boolean;
  format: string;
  difficulty: number;
  at: string;
}

function bandIdFor(points: number): string {
  return masteryBand(points);
}

export function TeachingRoom({
  sessionId,
  initialSession,
  concepts: initialConcepts,
  graph = null,
  demo = false,
  voiceCloud = { stt: null, tts: null },
}: {
  sessionId: string;
  initialSession: SessionView;
  concepts: TimelineConcept[];
  graph?: KnowledgeGraphView | null;
  demo?: boolean;
  voiceCloud?: VoiceCloudStatus;
}) {
  const reduce = useReducedMotion();
  const voice = useVoiceController(voiceCloud, initialSession.language);

  const [phase, setPhase] = useState<Phase>("loading");
  const [step, setStep] = useState<TeachingStepView | null>(null);
  const [result, setResult] = useState<InteractionResultView | null>(null);
  const [results, setResults] = useState<InteractionResultView[]>([]);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [voiceAnswer, setVoiceAnswer] = useState<string | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  /** How much of the current explanation has been revealed (drives presence). */
  const [teachingRevealed, setTeachingRevealed] = useState(false);
  /** Which beat of the post-answer sequence is showing (0..2). */
  const [resultBeat, setResultBeat] = useState(0);
  /** The learner asked a question and Lumen is answering it (side channel). */
  const [conversationBusy, setConversationBusy] = useState(false);
  /**
   * The representation from the most recent teaching step. Held through the
   * question + result phases so the change to the next representation is a
   * visible cross-fade rather than an off-screen swap.
   */
  const [heldVisual, setHeldVisual] = useState<{
    directive: VisualDirective;
    intent: string | null;
    rationale: string | null;
    /** "teaching" = from the current step; "conversation" = adapted by a question. */
    from: "teaching" | "conversation";
  } | null>(null);
  const [answerLog, setAnswerLog] = useState<AnswerLogEntry[]>([]);
  const [graphState, setGraphState] = useState<KnowledgeGraphView | null>(
    graph,
  );

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
  const [sessionStartMs] = useState(() => Date.now());
  const spokenForStep = useRef<string>("");

  // Session clock.
  useEffect(() => {
    const id = window.setInterval(
      () => setElapsedSec(Math.floor((Date.now() - sessionStartMs) / 1000)),
      1000,
    );
    return () => window.clearInterval(id);
  }, [sessionStartMs]);

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
    setVoiceAnswer(null);
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
    setResultBeat(0);
    setTeachingRevealed(false);
    setDecisionHistory((h) => [...h, s.decision]);
    setSnapshot((prev) => ({ ...prev, mode: s.decision.action }));

    if (s.sessionStatus === "COMPLETED") {
      setPhase("complete");
      return;
    }
    if (s.content) {
      if (s.content.visual) {
        setHeldVisual({
          directive: s.content.visual,
          intent: s.content.visualIntent,
          rationale: s.content.visualRationale,
          from: "teaching",
        });
      }
      setPhase("teaching");
      return;
    }
    if (s.question) {
      setPhase("question");
      return;
    }
    // A MOVE_FORWARD step has no content/question — drop the old concept's
    // visual so it doesn't linger into the next concept.
    setHeldVisual(null);
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

  // Post-answer sequence: reveal the evaluation, then the learner-model change,
  // then the adaptation — one beat at a time so it reads as one teacher moment.
  // State only changes from the timer callbacks (reduced motion is handled by
  // deriving `effectiveBeat` at render, below).
  useEffect(() => {
    if (phase !== "result" || reduce) return;
    const timers: number[] = [];
    let at = 0;
    RESULT_BEAT_MS.forEach((gap, i) => {
      at += gap;
      timers.push(
        window.setTimeout(() => setResultBeat((b) => Math.max(b, i + 1)), at),
      );
    });
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [phase, reduce, result]);
  const effectiveBeat = reduce ? 2 : resultBeat;

  // Speak teaching content once per step when voice is on.
  useEffect(() => {
    if (!voiceEnabled || phase !== "teaching" || !step?.content) return;
    const sig = `${step.content.conceptKey}:${step.decision.action}:${step.content.body.slice(0, 24)}`;
    if (spokenForStep.current === sig) return;
    spokenForStep.current = sig;
    voice.speak(step.content.body);
  }, [voiceEnabled, phase, step, voice]);

  // Route a completed spoken answer into the question field.
  useEffect(() => {
    voice.onTranscript((text) => setVoiceAnswer(text));
  }, [voice]);

  async function submitAnswer(answer: string, elapsedMs: number) {
    setBusy(true);
    setErrorMsg(null);
    voice.stopSpeaking();
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
    voice.markProcessingDone();
    if (!res.ok) {
      setBusy(false);
      setErrorMsg(res.error.message);
      return;
    }
    const r = res.data.result;
    // Move to the result phase before the non-critical session refresh so the
    // presence never flickers back to "checking" between the two.
    setResult(r);
    setResultBeat(0);
    setPhase("result");
    setBusy(false);
    setResults((prev) => [...prev, r]);
    setDecisionHistory((h) => [...h, r.nextDecision]);
    setAnswerLog((prev) => [
      ...prev,
      {
        conceptKey: r.learnerUpdate.conceptKey,
        masteryBefore: r.learnerUpdate.masteryBefore,
        masteryAfter: r.learnerUpdate.masteryAfter,
        reason: r.learnerUpdate.reason,
        classification: r.evaluation.classification,
        misconceptionDetected: r.learnerUpdate.newMisconceptions > 0,
        format: step?.question?.format ?? "FREE_FORM",
        difficulty: step?.question?.difficulty ?? 3,
        at: new Date().toISOString(),
      },
    ]);
    // Reflect the new mastery in the client graph so the map re-colours live.
    setGraphState((g) => {
      if (!g) return g;
      return {
        ...g,
        nodes: g.nodes.map((n) =>
          n.conceptKey === r.learnerUpdate.conceptKey
            ? {
                ...n,
                masteryPoints: r.learnerUpdate.masteryAfter,
                masteryBand: r.learnerUpdate.masteryBand,
                bandId: bandIdFor(r.learnerUpdate.masteryAfter),
                assessed: true,
              }
            : n,
        ),
      };
    });
    await refreshSession();
    if (voiceEnabled) voice.speak(r.evaluation.feedback);
  }

  function toContinue() {
    voice.stopSpeaking();
    void loadStep();
  }

  const approachTrail = decisionHistory.map((d) => actionLabel(d.action));
  const activeDecision = result
    ? result.nextDecision
    : (step?.decision ?? null);

  const resultConceptKey = result?.learnerUpdate.conceptKey ?? null;
  const currentTrajectory: MasteryTrajectory | null = resultConceptKey
    ? trajectoryFromResults({
        conceptKey: resultConceptKey,
        conceptTitle:
          initialConcepts.find((c) => c.key === resultConceptKey)?.title ??
          resultConceptKey,
        entries: answerLog,
      })
    : null;

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

  const conceptTitles = useMemo(
    () => Object.fromEntries(initialConcepts.map((c) => [c.key, c.title])),
    [initialConcepts],
  );
  const events = useMemo(
    () =>
      buildSessionEvents({
        decisions: decisionHistory,
        results,
        conceptTitles,
        startedAtMs: sessionStartMs,
      }),
    [decisionHistory, results, conceptTitles, sessionStartMs],
  );

  const lastClassification =
    result?.evaluation.classification ??
    results[results.length - 1]?.evaluation.classification ??
    null;

  // One coherent read of "what is Lumen doing right now" — drives the presence
  // orb, the status line, and the loading copy from the same source.
  const teachingStage = deriveTeachingStage({
    phase,
    busy,
    action: activeDecision?.action ?? null,
    revealComplete: teachingRevealed,
    resultBeat: effectiveBeat,
    classification: lastClassification,
    firstLoad: step === null,
    voiceState: voiceEnabled ? voice.state : undefined,
    conversationBusy,
  });
  const presence = teachingStage.presence;

  // The representation stays on screen across teaching → question → result, so
  // the switch to the next representation is a cross-fade the learner watches.
  const activeVisual = heldVisual?.directive ?? null;
  const visualMuted = phase !== "teaching";
  // `heldVisual` is the single source of truth for what's on screen — it holds
  // both the teaching step's visual and any conversationally-adapted one.
  const visualIntentText = heldVisual?.intent ?? null;
  const visualRationaleText = heldVisual?.rationale ?? null;
  const previousRepresentationLabel = heldVisual
    ? visualModeLabel(heldVisual.directive.mode)
    : null;
  const masteryPct = Math.round(panelSnapshot.masteryPoints);

  // 7.4 — the very compact live status + the learning event, from the
  // deterministic learning-intelligence layer.
  const liveStatus =
    phase === "result"
      ? (result?.liveStatus ?? null)
      : (step?.liveStatus ?? null);
  const learningEvent =
    phase === "result" ? (result?.learningEvent ?? null) : null;
  const presenceLine =
    learningEvent && effectiveBeat >= 2
      ? learningEvent.presenceLine
      : teachingStage.statusLine;

  // The "why this next?" explanation for the step currently on screen.
  const stepWhyNext =
    (phase === "teaching" || phase === "question") && step
      ? step.decision.whyThisNext
      : null;
  const previousDecision =
    decisionHistory.length >= 2
      ? decisionHistory[decisionHistory.length - 2]
      : null;
  const mapRelevance =
    activeDecision?.whyThisNext?.reason ??
    (phase === "question" ? "Lumen is checking this concept now." : null);

  return (
    <div className="flex min-h-svh flex-col bg-[var(--color-canvas)]">
      <TeachingTopBar
        conceptLabel={
          concepts.length > 0
            ? `Concept ${Math.min(currentIndex + 1, concepts.length)} / ${concepts.length}`
            : null
        }
        masteryPct={masteryPct}
        elapsedSec={elapsedSec}
        timeRemaining={timeRemaining}
        presenceLabel={presenceStatusLabel(presence, phase)}
        liveStatus={liveStatus}
        voiceEnabled={voiceEnabled}
        voiceSupported={voice.capabilities.anyVoice}
        onToggleVoice={() => {
          if (voiceEnabled) voice.stopSpeaking();
          setVoiceEnabled((v) => !v);
        }}
        demo={demo}
      />

      <div className="mx-auto grid w-full max-w-7xl flex-1 gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[220px_minmax(0,1fr)_300px] lg:py-8">
        {/* Presence rail */}
        <aside className="flex flex-col gap-4 lg:sticky lg:top-20 lg:h-fit">
          <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <TeacherPresence state={presence} level={voice.level} />
            <p
              className="mt-3 text-center text-[11px] leading-snug text-[var(--color-ink-muted)]"
              aria-live="polite"
            >
              {presenceLine}
            </p>
          </div>
          {voiceEnabled && voice.capabilities.anyVoice ? (
            <p className="px-1 text-[11px] leading-snug text-[var(--color-ink-faint)]">
              {voice.activeProvider.tts === "cloud" && voiceCloud.tts
                ? `Voice: ${voiceCloud.tts}`
                : voice.activeProvider.tts === "browser"
                  ? "Voice: your browser"
                  : "Voice output unavailable — captions only"}
            </p>
          ) : null}
        </aside>

        {/* Centre: visual canvas + teaching panel */}
        <main className="min-w-0 space-y-5">
          {activeVisual &&
          (phase === "teaching" ||
            phase === "question" ||
            phase === "result") ? (
            <div className="space-y-1.5">
              <VisualCanvas
                directive={activeVisual}
                intentLabel={
                  visualIntentText
                    ? visualIntentLabel(visualIntentText as VisualIntent)
                    : null
                }
                muted={visualMuted}
              />
              {(phase === "teaching" || heldVisual?.from === "conversation") &&
              visualRationaleText ? (
                <p className="px-1 text-[11px] leading-snug text-[var(--color-accent)]">
                  {visualRationaleText}
                </p>
              ) : null}
            </div>
          ) : null}

          {voiceEnabled && voice.caption && phase !== "question" ? (
            <CaptionTrack
              text={voice.caption}
              spokenChars={voice.spokenChars}
            />
          ) : null}

          <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 sm:p-6">
            {phase === "loading" ? (
              <div className="flex items-center gap-3 py-16">
                <InlineSpinner label={`${teachingStage.statusLine}…`} />
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
              {stepWhyNext ? (
                <WhyNextCard
                  explanation={stepWhyNext}
                  personalizationNote={
                    (phase === "teaching" || phase === "question") && step
                      ? step.decision.personalizationNote
                      : null
                  }
                  className="mb-4"
                />
              ) : null}

              {phase === "teaching" && step?.content ? (
                <>
                  <ConceptEyebrow
                    title={step.content.title}
                    action={step.decision.action}
                  />
                  <TeachingContent
                    key={`${step.content.conceptKey}:${step.decision.action}:${step.content.title}`}
                    content={step.content}
                    citations={step.citations}
                    onContinue={toContinue}
                    continuing={busy}
                    onRevealChange={setTeachingRevealed}
                    hideVisual
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
                    voiceTranscript={voiceEnabled ? voiceAnswer : null}
                    voiceSlot={
                      voiceEnabled && voice.capabilities.recognition ? (
                        <VoiceControls
                          state={voice.state}
                          level={voice.level}
                          canListen={
                            voice.state === "IDLE" || voice.state === "ERROR"
                          }
                          error={voice.error}
                          onStart={voice.startListening}
                          onStop={voice.stopListening}
                          onRecover={voice.recover}
                          hint="Speak your answer — it drops into the box for you to check."
                        />
                      ) : voiceEnabled ? (
                        <p className="text-[11px] text-[var(--color-ink-faint)]">
                          Voice input isn&apos;t available in this browser —
                          type your answer.
                        </p>
                      ) : null
                    }
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
                <>
                  {voiceEnabled && voice.caption ? (
                    <div className="mb-4">
                      <CaptionTrack
                        text={voice.caption}
                        spokenChars={voice.spokenChars}
                      />
                    </div>
                  ) : null}
                  <EvaluationResult
                    result={result}
                    onContinue={toContinue}
                    onSkip={() => setResultBeat(2)}
                    continuing={busy}
                    beat={effectiveBeat}
                    previousStrategy={previousDecision?.strategy ?? null}
                    previousAction={previousDecision?.action ?? null}
                    previousRepresentationLabel={previousRepresentationLabel}
                    headline={transitionHeadline(result)}
                  />
                  {learningEvent && effectiveBeat >= 1 ? (
                    <LumenLearningSignal
                      event={learningEvent}
                      className="mt-5"
                    />
                  ) : null}
                  {effectiveBeat >= 1 &&
                  currentTrajectory &&
                  currentTrajectory.points.length >= 2 ? (
                    <div className="mt-5">
                      <MasteryTrajectoryChart trajectory={currentTrajectory} />
                    </div>
                  ) : null}
                </>
              ) : null}

              {phase === "complete" ? (
                <div className="py-4 text-center">
                  <p className="text-[11px] font-semibold tracking-wider text-[var(--color-accent)] uppercase">
                    Lesson complete
                  </p>
                  <h2 className="mt-3 text-xl font-semibold tracking-tight">
                    You&apos;ve worked through every concept
                  </h2>
                  <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-[var(--color-ink-muted)]">
                    Lumen has updated what it knows about you. See how your
                    understanding moved.
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

          {(phase === "teaching" || phase === "question") &&
          currentConceptKey ? (
            <AskLumen
              sessionId={sessionId}
              conceptTitle={currentConceptTitle ?? currentConceptKey}
              onBusyChange={setConversationBusy}
              onVisual={(r) => {
                if (r.visual) {
                  setHeldVisual({
                    directive: r.visual,
                    intent: r.visualIntent,
                    rationale: r.visualRationale,
                    from: "conversation",
                  });
                }
              }}
            />
          ) : null}
        </main>

        {/* Right rail: learning signal + timeline + live map */}
        <aside className="flex flex-col gap-4 lg:sticky lg:top-20 lg:max-h-[calc(100svh-6rem)] lg:overflow-y-auto lg:pb-4">
          {phase === "result" && result ? (
            <LearningSignalCard result={result} />
          ) : null}
          <LearnerStatePanel
            snapshot={panelSnapshot}
            decision={activeDecision}
            concepts={concepts}
            currentIndex={currentIndex}
            approachTrail={approachTrail}
            graph={graphState}
            currentConceptKey={currentConceptKey}
          />
          {graphState ? (
            <TeachingRoomMap
              graph={graphState}
              currentConceptKey={currentConceptKey}
              relevanceNote={mapRelevance}
            />
          ) : null}
          <SessionTimelinePanel events={events} />
        </aside>
      </div>
    </div>
  );
}

const PRESENCE_STATUS_LABEL: Record<string, string> = {
  LISTENING: "Listening",
  THINKING: "Thinking",
  TEACHING: "Teaching",
  CHECKING: "Checking",
  ADAPTING: "Adapting",
  CELEBRATING: "Nice work",
  RECAP: "Recap",
  IDLE: "Ready",
};

function presenceStatusLabel(presence: string, phase: Phase): string {
  if (phase === "complete") return "Done";
  return PRESENCE_STATUS_LABEL[presence] ?? "Ready";
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
  conceptLabel,
  masteryPct,
  elapsedSec,
  timeRemaining,
  presenceLabel,
  liveStatus,
  voiceEnabled,
  voiceSupported,
  onToggleVoice,
  demo,
}: {
  conceptLabel: string | null;
  masteryPct: number;
  elapsedSec: number;
  timeRemaining: number | null;
  presenceLabel: string;
  liveStatus: LiveStatusView | null;
  voiceEnabled: boolean;
  voiceSupported: boolean;
  onToggleVoice: () => void;
  demo: boolean;
}) {
  const mm = Math.floor(elapsedSec / 60);
  const ss = elapsedSec % 60;
  return (
    <header className="sticky top-0 z-30 border-b border-[var(--color-border)] bg-[color-mix(in_oklab,var(--color-canvas)_88%,transparent)] backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6">
        <Link href="/studio" aria-label="Exit to studio">
          <LumenWordmark />
        </Link>
        {demo ? (
          <span className="rounded-full border border-[var(--color-accent)] bg-[var(--color-accent-soft)] px-2 py-0.5 text-[10px] font-semibold tracking-wide text-[var(--color-accent)] uppercase">
            Demo
          </span>
        ) : null}
        {conceptLabel ? (
          <span className="hidden text-[12px] text-[var(--color-ink-muted)] sm:inline">
            {conceptLabel}
          </span>
        ) : null}

        {liveStatus && liveStatus.state !== "FORMING" ? (
          <span className="hidden items-center gap-1.5 text-[11px] text-[var(--color-ink-faint)] lg:flex">
            <span className="h-1 w-1 rounded-full bg-[var(--color-accent)]" />
            <span className="font-medium text-[var(--color-ink-muted)]">
              {liveStatus.state}
            </span>
            <span aria-hidden>
              {liveStatus.momentum === "up"
                ? "↑"
                : liveStatus.momentum === "down"
                  ? "↓"
                  : "→"}
            </span>
            {liveStatus.nextKind ? (
              <span className="text-[var(--color-ink-faint)]">
                · next {liveStatus.nextKind.toLowerCase()}
              </span>
            ) : null}
          </span>
        ) : null}

        <div className="ml-auto flex items-center gap-3">
          <div className="hidden items-center gap-2 md:flex">
            <span className="text-[10px] font-medium tracking-wide text-[var(--color-ink-faint)] uppercase">
              Mastery
            </span>
            <span
              className="h-1.5 w-20 overflow-hidden rounded-full bg-[var(--color-subtle)]"
              role="progressbar"
              aria-valuenow={masteryPct}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <span
                className="block h-full rounded-full bg-[var(--color-accent)] transition-[width] duration-500"
                style={{ width: `${masteryPct}%` }}
              />
            </span>
            <span className="text-[11px] text-[var(--color-ink-muted)] tabular-nums">
              {masteryPct}%
            </span>
          </div>

          <span className="text-[11px] text-[var(--color-ink-muted)] tabular-nums">
            {mm}:{String(ss).padStart(2, "0")}
            {timeRemaining !== null && timeRemaining <= 0 ? (
              <span className="ml-1 text-[var(--color-warning)]">· up</span>
            ) : null}
          </span>

          <span className="hidden items-center gap-1.5 text-[11px] text-[var(--color-ink-muted)] sm:inline-flex">
            <span className="size-1.5 rounded-full bg-[var(--color-accent)]" />
            {presenceLabel}
          </span>

          <button
            type="button"
            onClick={onToggleVoice}
            disabled={!voiceSupported}
            aria-pressed={voiceEnabled}
            className={cn(
              "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
              voiceEnabled
                ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                : demo && voiceSupported
                  ? "animate-pulse border-[var(--color-accent)] text-[var(--color-accent)]"
                  : "border-[var(--color-border-strong)] text-[var(--color-ink-muted)] disabled:opacity-40",
            )}
          >
            {voiceEnabled
              ? "Voice on"
              : voiceSupported
                ? demo
                  ? "Turn on voice"
                  : "Voice off"
                : "No voice"}
          </button>

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

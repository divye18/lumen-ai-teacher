"use client";

import { MasteryMeter } from "@/components/ui/mastery-meter";
import { LearningSignal } from "@/components/learning/learning-signal";
import {
  SessionTimeline,
  type TimelineConcept,
} from "@/components/learning/session-timeline";
import type { DecisionView } from "@/lib/session/views";
import {
  actionLabel,
  signalForDecision,
  type LearningSignalPresentation,
} from "@/lib/ui/learning-presentation";

export interface LearnerStateSnapshot {
  masteryPoints: number;
  previousMasteryPoints: number | null;
  confidence: number; // 0–1
  currentConceptTitle: string | null;
  mode: string | null;
}

export function LearnerStatePanel({
  snapshot,
  decision,
  concepts,
  currentIndex,
  approachTrail,
}: {
  snapshot: LearnerStateSnapshot;
  decision: DecisionView | null;
  concepts: TimelineConcept[];
  currentIndex: number;
  approachTrail: string[];
}) {
  const signal: LearningSignalPresentation | null = decision
    ? signalForDecision(decision)
    : null;

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <p className="text-[10px] font-semibold tracking-wider text-[var(--color-ink-faint)] uppercase">
          Learning state
        </p>
        {snapshot.currentConceptTitle ? (
          <p className="mt-2 text-[13px] font-medium text-[var(--color-ink)]">
            {snapshot.currentConceptTitle}
          </p>
        ) : null}

        <div className="mt-3">
          <MasteryMeter
            value={snapshot.masteryPoints}
            previous={snapshot.previousMasteryPoints}
            size="sm"
          />
        </div>

        <dl className="mt-3 space-y-1.5 text-[12px]">
          <div className="flex justify-between">
            <dt className="text-[var(--color-ink-faint)]">Confidence</dt>
            <dd className="font-medium tabular-nums">
              {Math.round(snapshot.confidence * 100)}%
            </dd>
          </div>
          {snapshot.mode ? (
            <div className="flex justify-between">
              <dt className="text-[var(--color-ink-faint)]">Current mode</dt>
              <dd className="font-medium">{actionLabel(snapshot.mode)}</dd>
            </div>
          ) : null}
        </dl>
      </div>

      {signal ? <LearningSignal signal={signal} /> : null}

      {concepts.length > 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <SessionTimeline
            concepts={concepts}
            currentIndex={currentIndex}
            approachTrail={approachTrail}
          />
        </div>
      ) : null}
    </div>
  );
}

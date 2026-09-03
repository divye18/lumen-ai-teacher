import { Panel } from "@/components/ui/surface";
import { MasteryMeter } from "@/components/ui/mastery-meter";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import type { ActiveSessionView } from "@/lib/studio/overview";
import { actionLabel } from "@/lib/ui/learning-presentation";

export function ContinueLearning({ session }: { session: ActiveSessionView }) {
  const progressPct =
    session.conceptCount > 0
      ? Math.round((session.conceptsCompleted / session.conceptCount) * 100)
      : 0;

  return (
    <Panel className="overflow-hidden">
      <div className="flex flex-col gap-6 p-5 sm:flex-row sm:items-stretch sm:p-6">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="accent" dot>
              In progress
            </Badge>
            {session.sourceGrounded ? <Badge>From your material</Badge> : null}
          </div>
          <h2 className="mt-3 text-xl font-semibold tracking-tight">
            {session.currentConceptTitle ?? session.lessonTitle}
          </h2>
          <p className="mt-1 text-[13px] text-[var(--color-ink-muted)]">
            {session.lessonTitle}
            {session.topic && session.topic !== session.lessonTitle
              ? ` · ${session.topic}`
              : ""}
          </p>

          <dl className="mt-5 grid max-w-md grid-cols-2 gap-x-8 gap-y-4">
            <Stat
              label="Concept"
              value={`${Math.min(session.conceptIndex + 1, session.conceptCount)} of ${session.conceptCount}`}
            />
            <Stat label="Lesson progress" value={`${progressPct}%`} />
            <Stat
              label="Current mode"
              value={
                session.currentAction
                  ? actionLabel(session.currentAction)
                  : "Getting started"
              }
            />
            <Stat
              label="Time left"
              value={
                session.timeRemainingMinutes === null
                  ? "Untimed"
                  : `~${session.timeRemainingMinutes} min`
              }
            />
          </dl>
        </div>

        <div className="flex w-full flex-col justify-between gap-5 border-t border-[var(--color-border)] pt-5 sm:w-56 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-6">
          <div>
            <p className="mb-2 text-[11px] font-medium tracking-wide text-[var(--color-ink-faint)] uppercase">
              Concept mastery
            </p>
            <MasteryMeter value={session.masteryPoints} size="md" />
          </div>
          <LinkButton href={`/learn/${session.sessionId}`} size="lg">
            Resume lesson
          </LinkButton>
        </div>
      </div>
    </Panel>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-medium tracking-wide text-[var(--color-ink-faint)] uppercase">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm font-medium text-[var(--color-ink)]">
        {value}
      </dd>
    </div>
  );
}

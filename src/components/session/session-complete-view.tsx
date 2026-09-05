"use client";

import { motion, useReducedMotion } from "framer-motion";

import { Panel } from "@/components/ui/surface";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { MasteryMeter } from "@/components/ui/mastery-meter";
import { LumenMark } from "@/components/ui/lumen-mark";
import { KnowledgeGraphPanel } from "@/components/graph/knowledge-graph-panel";
import { MasteryTrajectoryChart } from "@/components/learning/mastery-trajectory";
import type { SessionReport } from "@/lib/studio/session-report";
import type { MasterySummaryConcept } from "@/lib/studio/mastery-summary";
import { cn } from "@/lib/ui/cn";

/** One "Strong" / "Developing" / "Needs work" row — renders nothing when empty. */
function MasteryGroup({
  label,
  tone,
  concepts,
}: {
  label: string;
  tone: "positive" | "warning";
  concepts: MasterySummaryConcept[];
}) {
  if (concepts.length === 0) return null;
  return (
    <div>
      <p className="text-[11px] font-medium text-[var(--color-ink-faint)]">
        {label}
      </p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {concepts.map((c) => (
          <Badge key={c.key} tone={tone}>
            {c.title}
          </Badge>
        ))}
      </div>
    </div>
  );
}

export function SessionCompleteView({ report }: { report: SessionReport }) {
  const reduce = useReducedMotion();

  const stats = [
    { label: "Concepts strengthened", value: report.conceptsStrengthened },
    {
      label: "Avg mastery movement",
      value:
        report.averageMasteryMovement > 0
          ? `+${report.averageMasteryMovement}`
          : String(report.averageMasteryMovement),
    },
    { label: "Questions answered", value: report.questionsAnswered },
    {
      label: "Misconceptions found",
      value: report.misconceptionsIdentified,
    },
  ];

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <motion.header
        initial={reduce ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center gap-2 text-[var(--color-accent)]">
          <LumenMark className="size-4" />
          <span className="text-[11px] font-semibold tracking-wide uppercase">
            Session complete
          </span>
        </div>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">
          {report.lessonTitle}
        </h1>
        <p className="mt-1 text-[13px] text-[var(--color-ink-muted)]">
          {report.durationMinutes ? `${report.durationMinutes} min · ` : ""}
          {report.correct} correct · {report.partial} partial ·{" "}
          {report.incorrect} needs work
        </p>
      </motion.header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s, i) => (
          <motion.div
            key={s.label}
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: reduce ? 0 : 0.1 + i * 0.06 }}
            className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
          >
            <p className="text-2xl font-semibold tracking-tight tabular-nums">
              {s.value}
            </p>
            <p className="mt-1 text-[11px] leading-tight text-[var(--color-ink-faint)]">
              {s.label}
            </p>
          </motion.div>
        ))}
      </div>

      {report.masterySummary.strong.length > 0 ||
      report.masterySummary.developing.length > 0 ||
      report.masterySummary.needsWork.length > 0 ? (
        <Panel inset>
          <p className="text-[11px] font-medium tracking-wide text-[var(--color-ink-faint)] uppercase">
            Where you stand
          </p>
          <div className="mt-4 flex flex-col gap-4">
            <MasteryGroup
              label="Strong"
              tone="positive"
              concepts={report.masterySummary.strong}
            />
            <MasteryGroup
              label="Developing"
              tone="warning"
              concepts={report.masterySummary.developing}
            />
            <MasteryGroup
              label="Needs work"
              tone="warning"
              concepts={report.masterySummary.needsWork}
            />
          </div>
        </Panel>
      ) : null}

      {report.outcomes.length > 0 ? (
        <Panel inset>
          <p className="text-[11px] font-medium tracking-wide text-[var(--color-ink-faint)] uppercase">
            How each concept moved
          </p>
          <ul className="mt-4 flex flex-col gap-4">
            {report.outcomes.map((o) => (
              <li key={o.key}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[13px] font-medium text-[var(--color-ink)]">
                    {o.title}
                  </span>
                  <span
                    className={cn(
                      "text-[12px] font-medium tabular-nums",
                      o.delta > 0 && "text-[var(--color-positive)]",
                      o.delta < 0 && "text-[var(--color-warning)]",
                      o.delta === 0 && "text-[var(--color-ink-faint)]",
                    )}
                  >
                    {o.masteryBefore} → {o.masteryAfter}
                    {o.delta !== 0
                      ? ` (${o.delta > 0 ? "+" : ""}${o.delta})`
                      : ""}
                  </span>
                </div>
                <div className="mt-1.5">
                  <MasteryMeter
                    value={o.masteryAfter}
                    previous={o.masteryBefore}
                    size="sm"
                    showLabel={false}
                  />
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {report.trajectories.length > 0 ? (
        <Panel inset>
          <p className="text-[11px] font-medium tracking-wide text-[var(--color-ink-faint)] uppercase">
            How your understanding moved
          </p>
          <p className="mt-1 text-[12px] text-[var(--color-ink-muted)]">
            Every point is a real answer. Tap one to see why the number changed.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {report.trajectories.map((t) => (
              <div key={t.conceptKey}>
                <p className="mb-1.5 text-[12px] font-medium text-[var(--color-ink)]">
                  {t.conceptTitle}
                </p>
                <MasteryTrajectoryChart trajectory={t} />
              </div>
            ))}
          </div>
        </Panel>
      ) : null}

      <Panel inset>
        <p className="text-[11px] font-medium tracking-wide text-[var(--color-ink-faint)] uppercase">
          What changed
        </p>
        <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 text-[13px] sm:grid-cols-3">
          <p>
            <span className="font-semibold tabular-nums">
              {report.masteryGained > 0 ? `+${report.masteryGained}` : "0"}
            </span>{" "}
            <span className="text-[var(--color-ink-muted)]">
              mastery points
            </span>
          </p>
          <p>
            <span className="font-semibold tabular-nums">
              {report.conceptsReinforced}
            </span>{" "}
            <span className="text-[var(--color-ink-muted)]">
              concept{report.conceptsReinforced === 1 ? "" : "s"} reinforced
            </span>
          </p>
          <p>
            <span className="text-[var(--color-ink-muted)]">
              misconceptions
            </span>{" "}
            <span className="font-semibold tabular-nums">
              {report.misconceptionsIdentified}
            </span>
            {report.misconceptionsRepeated > 0 ? (
              <span className="text-[var(--color-warning)]">
                {" "}
                ({report.misconceptionsRepeated} repeated)
              </span>
            ) : null}
          </p>
        </div>
      </Panel>

      {report.learningStory.length > 0 ? (
        <Panel inset>
          <div className="flex items-center gap-2">
            <LumenMark className="size-4 text-[var(--color-accent)]" />
            <p className="text-[11px] font-medium tracking-wide text-[var(--color-ink-faint)] uppercase">
              The learning story
            </p>
          </div>
          <ol className="mt-4 flex flex-col">
            {report.learningStory.map((line, i) => (
              <motion.li
                key={line}
                initial={reduce ? false : { opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: reduce ? 0 : 0.1 + i * 0.08 }}
                className="flex gap-3 pb-3 last:pb-0"
              >
                <div className="flex flex-col items-center pt-1">
                  <span className="size-1.5 rounded-full bg-[var(--color-accent)]" />
                  {i < report.learningStory.length - 1 ? (
                    <span className="my-1 w-px flex-1 bg-[var(--color-border)]" />
                  ) : null}
                </div>
                <p className="text-[13px] leading-relaxed text-[var(--color-ink)]">
                  {line}
                </p>
              </motion.li>
            ))}
          </ol>
        </Panel>
      ) : null}

      {report.learningEvents.length > 0 ? (
        <Panel inset>
          <div className="flex items-center gap-2">
            <LumenMark className="size-4 text-[var(--color-accent)]" />
            <p className="text-[11px] font-medium tracking-wide text-[var(--color-ink-faint)] uppercase">
              Learning signals this session
            </p>
          </div>
          <ul className="mt-4 flex flex-col gap-3">
            {report.learningEvents.map((e) => (
              <li key={e.kind + e.conceptTitle} className="flex gap-2.5">
                <span
                  aria-hidden
                  className={
                    e.kind === "READY_TO_ADVANCE"
                      ? "mt-0.5 text-[var(--color-accent)]"
                      : e.kind === "PATTERN_CONFIRMED" ||
                          e.kind === "DIFFICULTY_MISMATCH"
                        ? "mt-0.5 text-[var(--color-ink-faint)]"
                        : "mt-0.5 text-[var(--color-positive)]"
                  }
                >
                  {e.kind === "READY_TO_ADVANCE" ? "→" : "✓"}
                </span>
                <div className="min-w-0">
                  <p className="text-[13px] leading-relaxed text-[var(--color-ink)]">
                    <span className="font-medium">{e.conceptTitle}</span> —{" "}
                    {e.summary}
                  </p>
                  {e.next ? (
                    <p className="mt-0.5 text-[11px] text-[var(--color-ink-faint)]">
                      {e.next}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {report.graph.nodes.length > 1 ? (
        <KnowledgeGraphPanel
          graph={report.graph}
          title="This lesson's knowledge map"
        />
      ) : null}

      <Panel inset>
        <div className="flex items-center gap-2">
          <LumenMark className="size-4 text-[var(--color-accent)]" />
          <p className="text-[11px] font-medium tracking-wide text-[var(--color-ink-faint)] uppercase">
            {report.learningPattern.length > 0
              ? "Learning pattern"
              : "What Lumen learned about you"}
          </p>
        </div>
        {report.learningPattern.length > 0 ? (
          <ul className="mt-4 flex flex-col gap-3">
            {report.learningPattern.map((o) => (
              <li key={o.id} className="text-[13px] leading-relaxed">
                <p className="text-[var(--color-ink)]">{o.text}</p>
                <p className="mt-0.5 text-[11px] text-[var(--color-ink-faint)]">
                  {o.evidence}
                </p>
              </li>
            ))}
          </ul>
        ) : null}
        {report.personalizationInsight ? (
          <p className="mt-4 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[12px] leading-snug text-[var(--color-accent)]">
            {report.personalizationInsight} Lumen carries this into your next
            session.
          </p>
        ) : null}
        <ul className="mt-4 flex flex-col gap-2.5">
          {report.insights.map((line, i) => (
            <motion.li
              key={line}
              initial={reduce ? false : { opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: reduce ? 0 : 0.15 + i * 0.1 }}
              className="flex gap-2.5 text-[13px] leading-relaxed text-[var(--color-ink)]"
            >
              <span className="mt-2 size-1 shrink-0 rounded-full bg-[var(--color-accent)]" />
              {line}
            </motion.li>
          ))}
        </ul>
      </Panel>

      <div className="rounded-[var(--radius-lg)] border border-[color-mix(in_oklab,var(--color-accent)_25%,var(--color-border))] bg-[color-mix(in_oklab,var(--color-accent-soft)_55%,var(--color-surface))] p-5">
        <div className="flex items-center gap-2">
          <Badge tone="accent" dot>
            Next best move
          </Badge>
        </div>
        <h2 className="mt-3 text-[15px] font-semibold tracking-tight">
          {report.nextBestMove?.title ?? report.recommendation.title}
        </h2>
        <p className="mt-1 text-[13px] leading-relaxed text-[var(--color-ink-muted)]">
          {report.nextBestMove?.reason ?? report.recommendation.reason}
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <LinkButton
            href={report.nextBestMove?.href ?? report.recommendation.href}
            size="lg"
          >
            {report.nextBestMove
              ? "Plan this next"
              : report.recommendation.ctaLabel}
          </LinkButton>
          <LinkButton href="/studio" variant="secondary" size="lg">
            Back to studio
          </LinkButton>
        </div>
      </div>
    </div>
  );
}

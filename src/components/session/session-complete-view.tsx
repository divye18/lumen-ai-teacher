"use client";

import { motion, useReducedMotion } from "framer-motion";

import { Panel } from "@/components/ui/surface";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { MasteryMeter } from "@/components/ui/mastery-meter";
import { LumenMark } from "@/components/ui/lumen-mark";
import type { SessionReport } from "@/lib/studio/session-report";
import { cn } from "@/lib/ui/cn";

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

      <Panel inset>
        <div className="flex items-center gap-2">
          <LumenMark className="size-4 text-[var(--color-accent)]" />
          <p className="text-[11px] font-medium tracking-wide text-[var(--color-ink-faint)] uppercase">
            What Lumen learned about you
          </p>
        </div>
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
            Recommended next step
          </Badge>
        </div>
        <h2 className="mt-3 text-[15px] font-semibold tracking-tight">
          {report.recommendation.title}
        </h2>
        <p className="mt-1 text-[13px] leading-relaxed text-[var(--color-ink-muted)]">
          {report.recommendation.reason}
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <LinkButton href={report.recommendation.href} size="lg">
            {report.recommendation.ctaLabel}
          </LinkButton>
          <LinkButton href="/studio" variant="secondary" size="lg">
            Back to studio
          </LinkButton>
        </div>
      </div>
    </div>
  );
}

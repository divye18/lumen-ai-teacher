"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

import type { MasteryTrajectory } from "@/lib/studio/mastery-trajectory";
import { cn } from "@/lib/ui/cn";

/**
 * A concept's real mastery trajectory — one dot per persisted answer, the line
 * tracing how understanding moved. Each dot expands to show why it moved:
 * "+12 · correct application question · MCQ, difficulty 3".
 */

const FORMAT_LABEL: Record<string, string> = {
  FREE_FORM: "explanation",
  MCQ: "multiple choice",
  MULTI_SELECT: "multi-select",
  TRUE_FALSE: "true / false",
  ORDER_STEPS: "ordering",
  CLASSIFY: "classification",
  MATCH_RELATIONSHIP: "matching",
};

const CLASSIFICATION_LABEL: Record<string, string> = {
  CORRECT: "correct",
  PARTIALLY_CORRECT: "partly correct",
  INCORRECT: "incorrect",
  UNCERTAIN: "recorded",
};

export function MasteryTrajectoryChart({
  trajectory,
  className,
}: {
  trajectory: MasteryTrajectory;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const [active, setActive] = useState<number | null>(null);

  const pts = trajectory.points;
  if (pts.length === 0) {
    return (
      <div
        className={cn(
          "rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4",
          className,
        )}
      >
        <p className="text-[10px] font-semibold tracking-wider text-[var(--color-ink-faint)] uppercase">
          Mastery trajectory
        </p>
        <p className="mt-2 text-[12px] text-[var(--color-ink-faint)]">
          No answers yet for this concept.
        </p>
      </div>
    );
  }

  const W = 320;
  const H = 90;
  const PAD = 10;
  // one node for the starting point + one per answer
  const nodes = [
    { x: 0, y: trajectory.start, label: "start" },
    ...pts.map((p, i) => ({ x: i + 1, y: p.masteryAfter, label: `${i + 1}` })),
  ];
  const maxX = Math.max(1, nodes.length - 1);
  const sx = (x: number) => PAD + (x / maxX) * (W - 2 * PAD);
  const sy = (y: number) => H - PAD - (y / 100) * (H - 2 * PAD);

  const path = nodes.map((n) => `${sx(n.x)},${sy(n.y)}`).join(" ");
  const activePoint = active !== null ? pts[active] : null;

  return (
    <div
      className={cn(
        "rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4",
        className,
      )}
    >
      <div className="flex items-baseline justify-between">
        <p className="text-[10px] font-semibold tracking-wider text-[var(--color-ink-faint)] uppercase">
          Mastery trajectory
        </p>
        <p className="text-[12px] text-[var(--color-ink-muted)] tabular-nums">
          {trajectory.start}
          <span className="mx-1 text-[var(--color-ink-faint)]">→</span>
          <span className="font-semibold text-[var(--color-ink)]">
            {trajectory.current}
          </span>
        </p>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-2 w-full"
        role="img"
        aria-label={`Mastery moved from ${trajectory.start} to ${
          trajectory.current
        } over ${pts.length} answer${pts.length === 1 ? "" : "s"}`}
      >
        {[0, 50, 100].map((g) => (
          <line
            key={g}
            x1={PAD}
            x2={W - PAD}
            y1={sy(g)}
            y2={sy(g)}
            stroke="var(--color-border)"
            strokeWidth="1"
            strokeDasharray={g === 50 ? "3 4" : undefined}
          />
        ))}
        <motion.polyline
          points={path}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={reduce ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: reduce ? 0 : 0.7, ease: "easeOut" }}
        />
        {nodes.map((n, i) => {
          if (i === 0) {
            return (
              <circle
                key="start"
                cx={sx(n.x)}
                cy={sy(n.y)}
                r="2.5"
                fill="var(--color-ink-faint)"
              />
            );
          }
          const p = pts[i - 1];
          const colour =
            p.delta > 0
              ? "var(--color-positive)"
              : p.delta < 0
                ? "var(--color-warning)"
                : "var(--color-ink-faint)";
          return (
            <g key={i}>
              {p.misconceptionDetected ? (
                <circle
                  cx={sx(n.x)}
                  cy={sy(n.y)}
                  r="6"
                  fill="none"
                  stroke="var(--color-warning)"
                  strokeWidth="1"
                  strokeDasharray="2 2"
                />
              ) : null}
              <circle
                cx={sx(n.x)}
                cy={sy(n.y)}
                r={active === i - 1 ? 4.5 : 3.5}
                fill={colour}
                stroke="var(--color-surface)"
                strokeWidth="1.5"
                className="cursor-pointer"
                onClick={() => setActive(active === i - 1 ? null : i - 1)}
                role="button"
                aria-label={`Answer ${i}: ${p.delta > 0 ? "+" : ""}${
                  p.delta
                } mastery, ${CLASSIFICATION_LABEL[p.classification] ?? p.classification}`}
              />
            </g>
          );
        })}
      </svg>

      <div className="mt-2 min-h-[34px]">
        {activePoint ? (
          <motion.p
            key={active}
            initial={reduce ? false : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-[12px] leading-snug"
          >
            <span
              className={cn(
                "font-semibold tabular-nums",
                activePoint.delta > 0 && "text-[var(--color-positive)]",
                activePoint.delta < 0 && "text-[var(--color-warning)]",
                activePoint.delta === 0 && "text-[var(--color-ink-faint)]",
              )}
            >
              {activePoint.delta > 0 ? "+" : ""}
              {activePoint.delta}
            </span>{" "}
            <span className="text-[var(--color-ink-muted)]">
              {CLASSIFICATION_LABEL[activePoint.classification] ??
                activePoint.classification}{" "}
              {FORMAT_LABEL[activePoint.format] ?? "answer"} · difficulty{" "}
              {activePoint.difficulty}
              {activePoint.misconceptionDetected
                ? " · misconception detected"
                : ""}
            </span>
          </motion.p>
        ) : (
          <p className="text-[11px] text-[var(--color-ink-faint)]">
            {pts.length} answer{pts.length === 1 ? "" : "s"} · tap a point to
            see why mastery moved
          </p>
        )}
      </div>
    </div>
  );
}

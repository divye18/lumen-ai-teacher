"use client";

import { useEffect, useRef, useState } from "react";
import { animate, useReducedMotion } from "framer-motion";

import { progressFillTransition } from "@/lib/ui/motion";
import { cn } from "@/lib/ui/cn";

/**
 * CURRICULUM PROGRESS visual primitive (Milestone 19.1 — foundation only,
 * not wired into any page yet).
 *
 * Deliberately shaped DIFFERENTLY from `MasteryMeter`: a segmented/stepped
 * bar (one segment per topic) in the `learning` accent, rather than
 * `MasteryMeter`'s single continuous band-colored gradient fill. This is a
 * hard product requirement (see the 18.3c/e audits and the 19.0/19.1
 * briefs): curriculum progress ("how much have I gone through") and
 * mastery ("how well do I understand it") must never look like the same
 * metric. Never derives from or writes to mastery data — it only ever
 * renders whatever `completed`/`total` it's given.
 */
export function CurriculumProgressBar({
  completed,
  total,
  showLabel = true,
  size = "md",
  className,
}: {
  completed: number;
  total: number;
  showLabel?: boolean;
  size?: "sm" | "md";
  className?: string;
}) {
  const reduce = useReducedMotion();
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const [animatedPct, setAnimatedPct] = useState(pct);
  const fromRef = useRef(pct);

  useEffect(() => {
    if (reduce) return;
    const controls = animate(fromRef.current, pct, {
      ...progressFillTransition,
      onUpdate: (v) => setAnimatedPct(v),
      onComplete: () => {
        fromRef.current = pct;
      },
    });
    return () => {
      fromRef.current = pct;
      controls.stop();
    };
  }, [pct, reduce]);

  const display = reduce ? pct : animatedPct;
  const segmentHeight = size === "sm" ? "h-1.5" : "h-2";
  const segmentCount = Math.max(total, 1);

  return (
    <div className={cn("w-full", className)}>
      {showLabel ? (
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="text-[12px] font-medium tracking-tight text-[var(--color-learning)]">
            Curriculum progress
          </span>
          <span className="text-[12px] font-semibold text-[var(--color-ink)] tabular-nums">
            {completed}
            <span className="text-[var(--color-ink-faint)]"> / {total}</span>
          </span>
        </div>
      ) : null}

      <div
        className="flex gap-1"
        role="meter"
        aria-valuenow={Math.round(display)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Curriculum progress: ${completed} of ${total} topics completed`}
      >
        {Array.from({ length: segmentCount }).map((_, i) => {
          const segmentThreshold = ((i + 1) / segmentCount) * 100;
          const filled = display >= segmentThreshold - 0.5;
          return (
            <span
              key={i}
              aria-hidden
              className={cn(
                "flex-1 rounded-full transition-colors",
                segmentHeight,
                filled
                  ? "bg-[var(--color-learning)]"
                  : "bg-[var(--color-subtle)]",
              )}
            />
          );
        })}
      </div>
    </div>
  );
}

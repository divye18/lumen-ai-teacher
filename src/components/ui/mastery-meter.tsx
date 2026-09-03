"use client";

import { useEffect, useRef, useState } from "react";
import { animate, useReducedMotion } from "framer-motion";

import { cn } from "@/lib/ui/cn";
import { MASTERY_BANDS } from "@/lib/teaching/mastery";
import { bandPresentation } from "@/lib/ui/learning-presentation";

interface MasteryMeterProps {
  /** 0–100 product mastery. */
  value: number;
  /** Show the previous value as a faded ghost marker (delta context). */
  previous?: number | null;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  className?: string;
}

const BAND_TOKENS = [
  "var(--color-band-unknown)",
  "var(--color-band-emerging)",
  "var(--color-band-developing)",
  "var(--color-band-proficient)",
  "var(--color-band-strong)",
];

const SIZE = {
  sm: { track: "h-1", text: "text-[11px]", num: "text-sm" },
  md: { track: "h-1.5", text: "text-[12px]", num: "text-lg" },
  lg: { track: "h-2", text: "text-[13px]", num: "text-2xl" },
};

function clamp(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

export function MasteryMeter({
  value,
  previous,
  size = "md",
  showLabel = true,
  className,
}: MasteryMeterProps) {
  const target = clamp(value);
  const reduce = useReducedMotion();
  const [animated, setAnimated] = useState(target);
  const fromRef = useRef(target);

  useEffect(() => {
    if (reduce) return;
    const controls = animate(fromRef.current, target, {
      duration: 0.9,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setAnimated(v),
      onComplete: () => {
        fromRef.current = target;
      },
    });
    return () => {
      fromRef.current = target;
      controls.stop();
    };
  }, [target, reduce]);

  const display = reduce ? target : animated;
  const band = bandPresentation(target);
  const sz = SIZE[size];
  const bandIndex = MASTERY_BANDS.findIndex((b) => b.id === band.id);

  return (
    <div className={cn("w-full", className)}>
      {showLabel ? (
        <div className="mb-1.5 flex items-baseline justify-between">
          <span
            className={cn("font-medium tracking-tight", sz.text)}
            style={{ color: band.color }}
          >
            {band.label}
          </span>
          <span className={cn("font-semibold tabular-nums", sz.num)}>
            {Math.round(display)}
            <span className="ml-0.5 text-[0.6em] font-normal text-[var(--color-ink-faint)]">
              /100
            </span>
          </span>
        </div>
      ) : null}

      <div
        className={cn(
          "relative w-full overflow-hidden rounded-full bg-[var(--color-subtle)]",
          sz.track,
        )}
        role="meter"
        aria-valuenow={Math.round(target)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Mastery ${Math.round(target)} of 100 — ${band.label}`}
      >
        {MASTERY_BANDS.slice(1).map((b) => (
          <span
            key={b.id}
            className="absolute top-0 h-full w-px bg-[var(--color-canvas)]"
            style={{ left: `${b.min}%` }}
            aria-hidden
          />
        ))}
        <div
          className="h-full rounded-full"
          style={{
            width: `${clamp(display)}%`,
            backgroundColor: BAND_TOKENS[bandIndex] ?? BAND_TOKENS[0],
          }}
        />
        {typeof previous === "number" && Math.abs(previous - target) >= 1 ? (
          <span
            className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[var(--color-canvas)] bg-[var(--color-ink-faint)]"
            style={{ left: `${clamp(previous)}%` }}
            aria-hidden
          />
        ) : null}
      </div>
    </div>
  );
}

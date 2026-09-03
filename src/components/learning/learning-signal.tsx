"use client";

import { motion, useReducedMotion } from "framer-motion";

import type { LearningSignalPresentation } from "@/lib/ui/learning-presentation";
import { cn } from "@/lib/ui/cn";

/**
 * "Lumen's signal" — a concise, learner-safe statement of what Lumen is doing
 * and why. Driven by the real `DecisionView` (see `signalForDecision`). Never
 * chain-of-thought.
 */
export function LearningSignal({
  signal,
  className,
}: {
  signal: LearningSignalPresentation;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      key={signal.id + signal.summary}
      initial={reduce ? false : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={cn("rounded-[var(--radius-md)] border p-3", className)}
      style={{
        borderColor: `color-mix(in oklab, ${signal.color} 30%, var(--color-border))`,
        backgroundColor: `color-mix(in oklab, ${signal.color} 7%, transparent)`,
      }}
    >
      <div
        className="flex items-center gap-1.5 text-[10px] font-semibold tracking-wider uppercase"
        style={{ color: signal.color }}
      >
        <SignalGlyph color={signal.color} pulse={!reduce} />
        {signal.label}
      </div>
      <p className="mt-1.5 text-[13px] leading-snug text-[var(--color-ink)]">
        {signal.summary}
      </p>
    </motion.div>
  );
}

function SignalGlyph({ color, pulse }: { color: string; pulse: boolean }) {
  return (
    <span className="relative grid size-2.5 place-items-center">
      {pulse ? (
        <motion.span
          className="absolute inset-0 rounded-full"
          style={{ backgroundColor: color }}
          animate={{ scale: [1, 2], opacity: [0.5, 0] }}
          transition={{ duration: 1.8, repeat: Infinity }}
        />
      ) : null}
      <span
        className="size-1.5 rounded-full"
        style={{ backgroundColor: color }}
      />
    </span>
  );
}

"use client";

import { motion, useReducedMotion } from "framer-motion";

import { cn } from "@/lib/ui/cn";

export interface TimelineConcept {
  key: string;
  title: string;
  status: string;
  position: number;
}

/**
 * The learning journey. Concept spine reflects real `lesson_concepts.status`;
 * the current position is obvious. `approachTrail` shows the last few teaching
 * actions so a strategy switch is visible (e.g. Application → Remediation →
 * Guided example → Application).
 */
export function SessionTimeline({
  concepts,
  currentIndex,
  approachTrail = [],
}: {
  concepts: TimelineConcept[];
  currentIndex: number;
  approachTrail?: string[];
}) {
  const reduce = useReducedMotion();

  return (
    <div>
      <p className="text-[10px] font-semibold tracking-wider text-[var(--color-ink-faint)] uppercase">
        Journey
      </p>
      <ol className="mt-3 flex flex-col">
        {concepts.map((c, i) => {
          const done = c.status === "COMPLETED";
          const current = i === currentIndex && !done;
          const state = done ? "done" : current ? "current" : "pending";
          return (
            <li key={c.key} className="flex gap-2.5">
              <div className="flex flex-col items-center">
                <span
                  className={cn(
                    "grid size-4 shrink-0 place-items-center rounded-full border text-[8px]",
                    state === "done" &&
                      "border-[var(--color-accent)] bg-[var(--color-accent)] text-white",
                    state === "current" && "border-[var(--color-accent)]",
                    state === "pending" &&
                      "border-[var(--color-border-strong)]",
                  )}
                >
                  {state === "done" ? (
                    <svg viewBox="0 0 10 10" className="size-2.5">
                      <path
                        d="M2 5l2 2 4-4.5"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        fill="none"
                      />
                    </svg>
                  ) : state === "current" ? (
                    <motion.span
                      className="size-1.5 rounded-full bg-[var(--color-accent)]"
                      animate={
                        reduce
                          ? {}
                          : { scale: [1, 1.4, 1], opacity: [1, 0.5, 1] }
                      }
                      transition={{ duration: 1.6, repeat: Infinity }}
                    />
                  ) : null}
                </span>
                {i < concepts.length - 1 ? (
                  <span
                    className={cn(
                      "my-0.5 w-px flex-1",
                      done
                        ? "bg-[var(--color-accent)]"
                        : "bg-[var(--color-border)]",
                    )}
                  />
                ) : null}
              </div>
              <span
                className={cn(
                  "pb-3 text-[12px] leading-tight",
                  state === "pending"
                    ? "text-[var(--color-ink-faint)]"
                    : "text-[var(--color-ink)]",
                  state === "current" && "font-medium",
                )}
              >
                {c.title}
              </span>
            </li>
          );
        })}
      </ol>

      {approachTrail.length > 0 ? (
        <div className="mt-3 border-t border-[var(--color-border)] pt-3">
          <p className="text-[10px] font-semibold tracking-wider text-[var(--color-ink-faint)] uppercase">
            Approach
          </p>
          <div className="mt-2 flex flex-col gap-1">
            {approachTrail.slice(-4).map((step, i, arr) => (
              <div
                key={`${step}-${i}`}
                className={cn(
                  "flex items-center gap-1.5 text-[11px]",
                  i === arr.length - 1
                    ? "font-medium text-[var(--color-ink)]"
                    : "text-[var(--color-ink-faint)]",
                )}
              >
                <span className="text-[var(--color-ink-faint)]">
                  {i === 0 ? "•" : "↓"}
                </span>
                {step}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

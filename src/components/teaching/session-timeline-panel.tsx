"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import type { SessionEvent } from "@/lib/ui/session-events";
import { cn } from "@/lib/ui/cn";

const GLYPH: Record<SessionEvent["kind"], { mark: string; tone: string }> = {
  concept: { mark: "→", tone: "var(--color-ink-muted)" },
  strategy: { mark: "↻", tone: "var(--color-accent)" },
  reteach: { mark: "↻", tone: "var(--color-accent)" },
  misconception: { mark: "!", tone: "var(--color-warning)" },
  correct: { mark: "✓", tone: "var(--color-positive)" },
  mastery: { mark: "•", tone: "var(--color-ink-muted)" },
  example: { mark: "✎", tone: "var(--color-accent)" },
  difficulty: { mark: "▲", tone: "var(--color-signal-challenging)" },
};

/**
 * The session timeline — built only from real decision + answer events.
 */
export function SessionTimelinePanel({ events }: { events: SessionEvent[] }) {
  const reduce = useReducedMotion();
  if (events.length === 0) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <p className="text-[10px] font-semibold tracking-wider text-[var(--color-ink-faint)] uppercase">
          Session timeline
        </p>
        <p className="mt-2 text-[12px] text-[var(--color-ink-faint)]">
          Events appear here as the lesson unfolds.
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <p className="text-[10px] font-semibold tracking-wider text-[var(--color-ink-faint)] uppercase">
        Session timeline
      </p>
      <ol className="mt-3 flex flex-col">
        <AnimatePresence initial={false}>
          {events.map((e, i) => {
            const g = GLYPH[e.kind];
            return (
              <motion.li
                key={e.id}
                initial={reduce ? false : { opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                className="flex gap-2.5"
              >
                <div className="flex flex-col items-center">
                  <span
                    className="grid size-4 shrink-0 place-items-center rounded-full border text-[9px] font-bold"
                    style={{ borderColor: g.tone, color: g.tone }}
                  >
                    {g.mark}
                  </span>
                  {i < events.length - 1 ? (
                    <span className="my-0.5 w-px flex-1 bg-[var(--color-border)]" />
                  ) : null}
                </div>
                <div className="pb-2.5">
                  <p
                    className={cn(
                      "text-[12px] leading-tight",
                      i === events.length - 1
                        ? "font-medium text-[var(--color-ink)]"
                        : "text-[var(--color-ink-muted)]",
                    )}
                  >
                    {e.at ? (
                      <span className="mr-1.5 text-[10px] text-[var(--color-ink-faint)] tabular-nums">
                        {e.at}
                      </span>
                    ) : null}
                    {e.label}
                  </p>
                  {e.detail ? (
                    <p className="mt-0.5 text-[11px] leading-snug text-[var(--color-ink-faint)]">
                      {e.detail}
                    </p>
                  ) : null}
                </div>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ol>
    </div>
  );
}

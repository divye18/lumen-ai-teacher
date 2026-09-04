"use client";

import { useEffect, useMemo, useState } from "react";

import {
  revealScheduleMs,
  type RevealOptions,
} from "@/lib/teaching/reveal-schedule";

export interface StagedReveal {
  /** How many steps are visible right now. */
  revealed: number;
  /** Every step is visible. */
  done: boolean;
  /** Jump straight to the end (learner chose not to wait). */
  revealAll: () => void;
}

/**
 * Reveals `count` steps one at a time on a teacher-paced cadence
 * (`revealScheduleMs`). Respects reduced motion / `enabled: false` by showing
 * everything at once.
 *
 * State only ever changes from timer callbacks or the `revealAll` handler —
 * never synchronously inside the effect — so the component that owns the
 * content should remount (a changing React `key`) when the content changes.
 */
export function useStagedReveal(
  count: number,
  opts: RevealOptions & { enabled?: boolean } = {},
): StagedReveal {
  const enabled = opts.enabled ?? true;
  const { firstMs, stepMs, maxStepMs } = opts;

  const schedule = useMemo(
    () => revealScheduleMs(count, { firstMs, stepMs, maxStepMs }),
    [count, firstMs, stepMs, maxStepMs],
  );

  const [revealed, setRevealed] = useState(() => (enabled ? 0 : count));

  useEffect(() => {
    if (!enabled || count === 0) return;
    const timers = schedule.map((delay, i) =>
      window.setTimeout(() => setRevealed((r) => Math.max(r, i + 1)), delay),
    );
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [schedule, enabled, count]);

  const shown = enabled ? Math.min(revealed, count) : count;
  return {
    revealed: shown,
    done: shown >= count,
    revealAll: () => setRevealed(count),
  };
}

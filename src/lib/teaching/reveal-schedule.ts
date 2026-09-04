/**
 * Progressive-reveal timing.
 *
 * `revealScheduleMs(count)` returns the delay (ms from mount) at which each of
 * `count` steps should appear, so a teacher-paced explanation unfolds instead
 * of dropping in as a wall of text. Pure — the React hook that consumes it
 * (`useStagedReveal`) only turns these delays into timers.
 *
 * A generous first step, then a steady cadence, with an upper bound so a long
 * explanation never feels slow.
 */

export interface RevealOptions {
  /** Delay before the first step appears. */
  firstMs?: number;
  /** Base gap between steps. */
  stepMs?: number;
  /** Never wait longer than this for any single step. */
  maxStepMs?: number;
}

export function revealScheduleMs(
  count: number,
  opts: RevealOptions = {},
): number[] {
  const first = Math.max(0, opts.firstMs ?? 220);
  const step = Math.max(0, opts.stepMs ?? 1100);
  // An absolute ceiling on any single gap — the cap always wins.
  const maxStep = Math.max(0, opts.maxStepMs ?? 1400);

  const out: number[] = [];
  let t = first;
  for (let i = 0; i < Math.max(0, Math.floor(count)); i += 1) {
    out.push(i === 0 ? first : Math.round(t));
    // Slightly compress the cadence as the explanation gets longer.
    const gap = Math.min(maxStep, step * (i < 2 ? 1 : 0.82));
    t += gap;
  }
  return out;
}

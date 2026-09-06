/**
 * Milestone 19.1 — reusable Framer Motion presets for the Lumen visual
 * system. Pure data (variant objects / timing constants) — no component
 * behavior, no new dependency, no page wired up to these yet. 19.2+ screens
 * should import from here instead of hand-rolling new transition timings,
 * so entrance/hover/press motion stays consistent across the product.
 *
 * Every consumer must still gate on `useReducedMotion()` itself (these
 * presets don't do it for you) — pass `initial={reduce ? false : preset.initial}`
 * exactly like the existing `CurriculumNodeGrid`/`LessonPlanView` call sites
 * already do.
 */

/** Micro-interaction duration band (hover, press, small state changes). */
export const MICRO_DURATION = 0.15;

/** A card/row entering the page — the pattern already used by
 * `CurriculumNodeGrid` and `LessonPlanView`, centralized here. */
export const cardEntrance = (index = 0) => ({
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.25, delay: index * 0.03 },
});

/** A single, larger element (a panel, a hero) settling into place. */
export const panelEntrance = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.3 },
};

/** Curriculum-progress fill animating toward its target percentage —
 * intentionally the same easing family as `MasteryMeter`'s existing
 * `animate()` call, so the two progress systems move with a consistent
 * feel even though they represent different things (see `MasteryMeter`
 * for mastery; curriculum progress is a separate, non-mastery signal). */
export const progressFillTransition = {
  duration: 0.9,
  ease: [0.16, 1, 0.3, 1] as const,
};

/** A drill-down step transition (Class -> Subject -> Chapter -> Topic) —
 * for 19.2+ to apply between curriculum levels so the levels read as one
 * continuous space instead of separate page loads. */
export const drillDownTransition = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.18 },
};

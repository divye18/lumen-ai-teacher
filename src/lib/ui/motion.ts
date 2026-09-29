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

/* ─────────────────────────────────────────────────────────────────────
   Milestone 20 — expanded motion language. Still pure data: every preset
   below is a plain object/function, no component behavior baked in. Every
   consumer must still gate on `useReducedMotion()` itself, exactly like the
   existing presets above (`initial={reduce ? false : preset.initial}`).

   Timing bands (per the 20 brief):
     150–200ms  micro-interactions (hover, press, small state changes)
     200–350ms  normal UI transitions (card/section entrances)
     350–500ms  hero/section-level entrances
   ───────────────────────────────────────────────────────────────────── */

/** A whole page/screen settling in — the outermost entrance, once per
 * navigation. Slightly slower than `panelEntrance` since it's the first
 * thing a learner sees. */
export const pageEntrance = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] as const },
};

/** A major section within an already-entered page (e.g. "Your progress",
 * "Browse Curriculum") — lighter than `pageEntrance`, heavier than a card. */
export const sectionEntrance = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] as const },
};

/** Wrap a grid/list with this; each child uses `staggerItem`. Framer Motion
 * propagates `staggerChildren` to `motion` children via context, so the
 * parent needs no per-item index math (replaces the `cardEntrance(index)`
 * manual-delay pattern for NEW grids — existing call sites are untouched). */
export const staggerContainer = {
  initial: "hidden",
  animate: "visible",
  variants: {
    hidden: {},
    visible: { transition: { staggerChildren: 0.04, delayChildren: 0.02 } },
  },
};

export const staggerItem = {
  variants: {
    hidden: { opacity: 0, y: 8 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] as const },
    },
  },
};

/** Hover lift for an interactive/elevated surface. Spring, not ease — this
 * is physical feedback, not an entrance. */
export const cardHover = {
  y: -2,
  transition: { type: "spring" as const, stiffness: 400, damping: 32 },
};

/** Press feedback for a card-shaped interactive surface (mirrors `Button`'s
 * existing `active:scale-[0.98]` CSS, as a Framer variant for elements that
 * need `whileTap` rather than a CSS pseudo-class). */
export const cardPress = { scale: 0.985 };

/** Button press — slightly tighter than `cardPress` since buttons are
 * smaller, more frequent targets. */
export const buttonPress = { scale: 0.97 };

/** A modal/dialog entrance — center-anchored, quick. */
export const modalEntrance = {
  initial: { opacity: 0, y: 8, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: 4, scale: 0.99 },
  transition: { duration: 0.2, ease: [0.16, 1, 0.3, 1] as const },
};

/** A bottom/side sheet entrance — edge-anchored, distinct from a modal. */
export const sheetEntrance = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 16 },
  transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] as const },
};

/** An empty state settling in — slightly slower/softer than a normal card,
 * since it's often the only thing on screen. */
export const emptyStateEntrance = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] as const },
};

/** A restrained "this just got marked complete" reveal — a small settle,
 * never confetti/bounce. Pair with `Badge tone="positive"` or the
 * achievement token; the motion itself stays understated. */
export const completionReveal = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1 },
  transition: { type: "spring" as const, stiffness: 300, damping: 26 },
};

/** Selecting a learning mode (Explain/Visualize/Practice/...) — a quick,
 * confident scale-settle so the choice feels registered immediately. */
export const modeSelect = {
  whileTap: { scale: 0.96 },
  transition: { type: "spring" as const, stiffness: 500, damping: 30 },
};

/** A small number (e.g. a stat) animating from its previous value to a new
 * one. Same easing family as `progressFillTransition` so numeric and bar
 * progress feel like one system. Mirrors `CurriculumProgressBar`'s existing
 * `animate()` usage rather than introducing a different animation approach. */
export const countUpTransition = {
  duration: 0.6,
  ease: [0.16, 1, 0.3, 1] as const,
};

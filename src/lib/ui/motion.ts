/**
 * Reusable Framer Motion presets for the Lumen visual system.
 * Pure data (variant objects / timing constants).
 * Every consumer must gate on `useReducedMotion()`.
 */

export const MICRO_DURATION = 0.15;

export const cardEntrance = (index = 0) => ({
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: {
    duration: 0.2,
    delay: index * 0.03,
    ease: [0.16, 1, 0.3, 1] as const,
  },
});

export const panelEntrance = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] as const },
};

export const progressFillTransition = {
  duration: 0.6,
  ease: [0.16, 1, 0.3, 1] as const,
};

export const drillDownTransition = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.15 },
};

export const pageEntrance = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] as const },
};

export const sectionEntrance = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] as const },
};

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
      transition: { duration: 0.2, ease: [0.16, 1, 0.3, 1] as const },
    },
  },
};

export const cardHover = {
  y: -2,
  transition: { type: "spring" as const, stiffness: 400, damping: 32 },
};

export const cardPress = { scale: 0.985 };
export const buttonPress = { scale: 0.97 };

export const modalEntrance = {
  initial: { opacity: 0, y: 8, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: 4, scale: 0.99 },
  transition: { duration: 0.2, ease: [0.16, 1, 0.3, 1] as const },
};

export const sheetEntrance = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 16 },
  transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] as const },
};

export const emptyStateEntrance = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] as const },
};

export const completionReveal = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1 },
  transition: { type: "spring" as const, stiffness: 400, damping: 32 },
};

export const modeSelect = {
  whileTap: { scale: 0.96 },
  transition: { type: "spring" as const, stiffness: 500, damping: 30 },
};

export const countUpTransition = {
  duration: 0.4,
  ease: [0.16, 1, 0.3, 1] as const,
};

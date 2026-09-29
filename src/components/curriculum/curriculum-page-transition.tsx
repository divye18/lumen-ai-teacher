"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";

import { pageEntrance } from "@/lib/ui/motion";

/**
 * Wraps a curriculum page's content in the `pageEntrance` preset, so
 * Class -> Subject -> Chapter -> Topic reads as one continuous journey
 * rather than four separate page loads. A plain entrance (no `exit` — that
 * needs `AnimatePresence`, which would require converting the
 * server-rendered page tree into a client layout; out of scope for this
 * milestone). Server-rendered children pass through untouched — this
 * component only wraps them.
 */
export function CurriculumPageTransition({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : pageEntrance.initial}
      animate={pageEntrance.animate}
      transition={pageEntrance.transition}
    >
      {children}
    </motion.div>
  );
}

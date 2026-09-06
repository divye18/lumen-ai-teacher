"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";

import { drillDownTransition } from "@/lib/ui/motion";

/**
 * Wraps a curriculum page's content in the 19.1 `drillDownTransition`
 * preset, so Class -> Subject -> Chapter -> Topic reads as one continuous
 * space rather than four separate page loads. A plain fade (no `exit` —
 * that needs `AnimatePresence`, which would require converting the
 * server-rendered page tree into a client layout; out of scope for this
 * milestone's "smallest coherent implementation"). Server-rendered children
 * pass through untouched — this component only wraps them.
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
      initial={reduce ? false : drillDownTransition.initial}
      animate={drillDownTransition.animate}
      transition={drillDownTransition.transition}
    >
      {children}
    </motion.div>
  );
}

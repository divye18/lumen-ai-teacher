"use client";

import { motion, useReducedMotion } from "framer-motion";

import { panelEntrance } from "@/lib/ui/motion";
import Link from "next/link";

export function BrowseCurriculumCard() {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : panelEntrance.initial}
      animate={panelEntrance.animate}
      transition={panelEntrance.transition}
    >
      <div className="group relative mt-2 flex w-full flex-col border-t border-[var(--color-border)] pt-6">
        <div className="flex items-baseline gap-4">
          <span className="text-[length:var(--text-meta)] font-medium text-[var(--color-ink-faint)]">
            01
          </span>
          <div className="flex-1">
            <p className="text-[length:var(--text-title)] font-medium text-[var(--color-ink)] transition-colors group-hover:text-[var(--color-learning)]">
              Browse Curriculum
            </p>
            <p className="mt-1 max-w-sm text-[length:var(--text-body)] text-[var(--color-ink-muted)]">
              Explore the full syllabus hierarchy and pick your next topic.
            </p>
          </div>
          <div className="shrink-0">
            <span className="text-[length:var(--text-meta)] font-medium text-[var(--color-learning)] opacity-0 transition-opacity group-hover:opacity-100">
              Explore ➔
            </span>
          </div>
        </div>
        <Link href="/learn/c" className="absolute inset-0 z-10">
          <span className="sr-only">Browse curriculum</span>
        </Link>
      </div>
    </motion.div>
  );
}

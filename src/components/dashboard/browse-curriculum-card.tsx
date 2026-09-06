"use client";

import { motion, useReducedMotion } from "framer-motion";

import { LinkButton } from "@/components/ui/button";
import { Panel } from "@/components/ui/surface";
import { panelEntrance } from "@/lib/ui/motion";

/**
 * Home's "Browse Curriculum" entry (Milestone 19.3). No data query needed —
 * `/learn/c` already resolves the real Class/Subject/Chapter/Topic
 * hierarchy itself; this is just a static, always-correct entry point.
 */
export function BrowseCurriculumCard() {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : panelEntrance.initial}
      animate={panelEntrance.animate}
      transition={panelEntrance.transition}
    >
      <Panel inset>
        <p className="text-[15px] font-medium text-[var(--color-ink)]">
          Browse curriculum
        </p>
        <p className="mt-1 text-[13px] text-[var(--color-ink-muted)]">
          Explore Class → Subject → Chapter → Topic and choose what to learn
          next.
        </p>
        <LinkButton href="/learn/c" variant="secondary" className="mt-4">
          Browse curriculum
        </LinkButton>
      </Panel>
    </motion.div>
  );
}

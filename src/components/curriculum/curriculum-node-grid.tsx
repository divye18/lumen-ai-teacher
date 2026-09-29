"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";

import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/surface";
import { cardEntrance, cardHover } from "@/lib/ui/motion";
import { cn } from "@/lib/ui/cn";

export interface CurriculumNodeCardData {
  id: string;
  title: string;
  /** Where this card navigates. Omit for a non-interactive, terminal card
   * (the Topic level in 18.1 — no destination exists yet). */
  href?: string;
  subtitle?: string;
  badge?: string;
}

/**
 * Responsive grid of curriculum-node cards (Class/Subject levels — Chapter
 * cards moved to the dedicated `ChapterCard` in 19.2, since chapters need a
 * genuinely different shape: a progress bar + a next-topic CTA rather than
 * a plain navigation link). Built on the 19.1 `Panel` primitive — no new
 * design system. Content is always caller-supplied real node data; nothing
 * here is hardcoded.
 */
export function CurriculumNodeGrid({
  items,
}: {
  items: CurriculumNodeCardData[];
}) {
  const reduce = useReducedMotion();

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item, index) => {
        const content = (
          <>
            <p className="text-[length:var(--text-subtitle)] font-semibold tracking-tight text-[var(--color-ink)]">
              {item.title}
            </p>
            {item.subtitle ? (
              <p className="mt-1 text-[length:var(--text-meta)] text-[var(--color-ink-muted)]">
                {item.subtitle}
              </p>
            ) : null}
            {item.badge ? (
              <Badge className="mt-3" tone="neutral">
                {item.badge}
              </Badge>
            ) : null}
          </>
        );

        const panelClasses = cn(
          "h-full p-5 transition-[border-color,box-shadow] duration-200",
          item.href && "hover:border-[var(--color-accent)]",
        );
        const entrance = cardEntrance(index);

        return (
          <motion.div
            key={item.id}
            initial={reduce ? false : entrance.initial}
            animate={entrance.animate}
            transition={entrance.transition}
            whileHover={reduce || !item.href ? undefined : cardHover}
          >
            {item.href ? (
              <Link href={item.href} className="block h-full">
                <Panel variant="elevated" className={panelClasses}>
                  {content}
                </Panel>
              </Link>
            ) : (
              <Panel variant="quiet" className={panelClasses}>
                {content}
              </Panel>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}

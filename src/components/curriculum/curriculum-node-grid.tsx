"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";

import { Badge } from "@/components/ui/badge";
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
 * Responsive grid of curriculum-node cards (Class/Subject/Chapter/Topic).
 * Built entirely from existing tokens (`Panel`-equivalent surface classes,
 * `Badge`, the app's CSS variables) — no new design system. Content is
 * always caller-supplied real node data; nothing here is hardcoded.
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
            <p className="text-[14px] font-medium text-[var(--color-ink)]">
              {item.title}
            </p>
            {item.subtitle ? (
              <p className="mt-1 text-[12px] text-[var(--color-ink-muted)]">
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

        const cardClasses = cn(
          "block h-full rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 transition-colors",
          item.href
            ? "hover:border-[var(--color-accent)] hover:bg-[var(--color-accent-soft)]"
            : "",
        );

        return (
          <motion.div
            key={item.id}
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: reduce ? 0 : index * 0.03 }}
          >
            {item.href ? (
              <Link href={item.href} className={cardClasses}>
                {content}
              </Link>
            ) : (
              <div className={cardClasses}>{content}</div>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}

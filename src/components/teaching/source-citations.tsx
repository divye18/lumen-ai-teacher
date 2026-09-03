"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import type { TeachingCitation } from "@/lib/session/citations";
import { cn } from "@/lib/ui/cn";

/**
 * Compact source indicator. A clean citation representation — never raw
 * retrieval metadata. Expands to show the cited passage.
 */
export function SourceCitations({
  citations,
  compact = false,
}: {
  citations: TeachingCitation[];
  compact?: boolean;
}) {
  const reduce = useReducedMotion();
  const [openId, setOpenId] = useState<string | null>(null);

  if (citations.length === 0) return null;

  const primary = citations[0];
  const extra = citations.length - 1;

  return (
    <div
      className={cn(
        "rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-canvas)]",
        compact ? "text-[12px]" : "text-[13px]",
      )}
    >
      <button
        type="button"
        onClick={() =>
          setOpenId(openId === primary.chunkId ? null : primary.chunkId)
        }
        aria-expanded={openId === primary.chunkId}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <BookIcon />
        <span className="min-w-0 flex-1 truncate">
          <span className="font-medium text-[var(--color-ink)]">
            {primary.documentName}
          </span>
          {primary.pageNumber ? (
            <span className="text-[var(--color-ink-muted)]">
              {" "}
              · Page {primary.pageNumber}
            </span>
          ) : null}
          {extra > 0 ? (
            <span className="text-[var(--color-ink-faint)]">
              {" "}
              +{extra} more
            </span>
          ) : null}
        </span>
        <ChevronIcon open={openId === primary.chunkId} />
      </button>

      <AnimatePresence initial={false}>
        {openId ? (
          <motion.div
            initial={reduce ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-t border-[var(--color-border)]"
          >
            <ul className="flex flex-col divide-y divide-[var(--color-border)]">
              {citations.map((c) => (
                <li key={c.chunkId} className="px-3 py-2.5">
                  <p className="text-[11px] font-medium text-[var(--color-ink-muted)]">
                    {c.documentName}
                    {c.pageNumber ? ` · Page ${c.pageNumber}` : ""}
                    {c.sectionTitle ? ` · ${c.sectionTitle}` : ""}
                  </p>
                  <p className="mt-1 text-[12px] leading-relaxed text-[var(--color-ink-muted)] italic">
                    “{c.snippet}”
                  </p>
                </li>
              ))}
            </ul>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function BookIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="size-3.5 shrink-0 text-[var(--color-accent)]"
      fill="none"
      aria-hidden
    >
      <path
        d="M2 3.5A1.5 1.5 0 0 1 3.5 2H8v11H3.5A1.5 1.5 0 0 0 2 14.5v-11ZM14 3.5A1.5 1.5 0 0 0 12.5 2H8v11h4.5a1.5 1.5 0 0 1 1.5 1.5v-11Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={cn(
        "size-3.5 shrink-0 text-[var(--color-ink-faint)] transition-transform",
        open && "rotate-90",
      )}
      aria-hidden
    >
      <path
        d="M6 4l4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

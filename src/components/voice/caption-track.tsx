"use client";

import { motion, useReducedMotion } from "framer-motion";

/**
 * Synchronized captions for spoken teaching. `spokenChars` is how much of
 * `text` has been voiced so far — already-spoken words are solid, the rest is
 * dimmed. Always available: with no TTS it just shows the full caption.
 */
export function CaptionTrack({
  text,
  spokenChars,
}: {
  text: string;
  spokenChars: number;
}) {
  const reduce = useReducedMotion();
  if (!text) return null;
  const spoken = text.slice(0, Math.max(0, spokenChars));
  const rest = text.slice(Math.max(0, spokenChars));

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[color-mix(in_oklab,var(--color-canvas)_70%,var(--color-surface))] px-4 py-3"
    >
      <p className="text-[10px] font-semibold tracking-wider text-[var(--color-ink-faint)] uppercase">
        Caption
      </p>
      <p className="mt-1 text-[14px] leading-relaxed">
        <span className="text-[var(--color-ink)]">{spoken}</span>
        <span className="text-[var(--color-ink-faint)]">{rest}</span>
      </p>
    </motion.div>
  );
}

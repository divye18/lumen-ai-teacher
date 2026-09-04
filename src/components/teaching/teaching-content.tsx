"use client";

import { useEffect } from "react";
import { motion, useReducedMotion } from "framer-motion";

import { SourceCitations } from "@/components/teaching/source-citations";
import { VisualCanvas } from "@/components/visuals/visual-canvas";
import { Button } from "@/components/ui/button";
import { useStagedReveal } from "@/components/teaching/use-staged-reveal";
import type { TeachingContentView } from "@/lib/session/views";
import type { TeachingCitation } from "@/lib/session/citations";
import { cn } from "@/lib/ui/cn";

export function TeachingContent({
  content,
  citations,
  onContinue,
  continuing,
  hideVisual,
  /** Notifies the room how far the reveal has progressed (drives presence). */
  onRevealChange,
}: {
  content: TeachingContentView;
  citations: TeachingCitation[];
  onContinue: () => void;
  continuing: boolean;
  /** The room renders the visual in the canvas column on wide screens. */
  hideVisual?: boolean;
  onRevealChange?: (done: boolean) => void;
}) {
  const reduce = useReducedMotion();
  const paragraphs = content.body.split(/\n{2,}/).filter(Boolean);

  const reveal = useStagedReveal(paragraphs.length, {
    enabled: !reduce,
    firstMs: 260,
    stepMs: 1150,
  });

  const revealDone = reduce ? true : reveal.done;

  // Tell the room when the explanation has fully landed (drives presence).
  useEffect(() => {
    onRevealChange?.(revealDone);
  }, [revealDone, onRevealChange]);

  const visible = reduce ? paragraphs : paragraphs.slice(0, reveal.revealed);

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      <h2 className="text-lg font-semibold tracking-tight">{content.title}</h2>

      <div
        className={cn(
          "mt-4 space-y-4 text-[15px] leading-relaxed text-[var(--color-ink)]",
          !reduce && !reveal.done && "cursor-pointer",
        )}
        onClick={() => {
          if (!reduce && !reveal.done) reveal.revealAll();
        }}
      >
        {visible.map((p, i) => (
          <motion.p
            key={i}
            initial={reduce ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          >
            {p}
          </motion.p>
        ))}

        {!reduce && !reveal.done ? (
          <span
            className="inline-flex items-center gap-1 text-[var(--color-ink-faint)]"
            aria-hidden
          >
            {[0, 1, 2].map((d) => (
              <motion.span
                key={d}
                className="size-1.5 rounded-full bg-current"
                animate={{ opacity: [0.25, 1, 0.25] }}
                transition={{
                  duration: 1.1,
                  repeat: Infinity,
                  delay: d * 0.16,
                }}
              />
            ))}
          </span>
        ) : null}
      </div>

      {!reduce && !reveal.done ? (
        <button
          type="button"
          onClick={reveal.revealAll}
          className="mt-3 text-[11px] font-medium text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
        >
          Show the rest
        </button>
      ) : null}

      {!hideVisual && content.visual ? (
        <div className="mt-5">
          <VisualCanvas directive={content.visual} />
        </div>
      ) : null}

      {content.groundedInSource && citations.length > 0 && revealDone ? (
        <div className="mt-5">
          <SourceCitations citations={citations} />
        </div>
      ) : null}

      <div className="mt-8 flex justify-end">
        <Button
          onClick={onContinue}
          loading={continuing}
          disabled={!revealDone}
          size="lg"
        >
          Continue
        </Button>
      </div>
    </motion.div>
  );
}

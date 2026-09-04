"use client";

import { motion, useReducedMotion } from "framer-motion";

import { SourceCitations } from "@/components/teaching/source-citations";
import { VisualCanvas } from "@/components/visuals/visual-canvas";
import { Button } from "@/components/ui/button";
import type { TeachingContentView } from "@/lib/session/views";
import type { TeachingCitation } from "@/lib/session/citations";

export function TeachingContent({
  content,
  citations,
  onContinue,
  continuing,
  hideVisual,
}: {
  content: TeachingContentView;
  citations: TeachingCitation[];
  onContinue: () => void;
  continuing: boolean;
  /** The room renders the visual in the canvas column on wide screens. */
  hideVisual?: boolean;
}) {
  const reduce = useReducedMotion();
  const paragraphs = content.body.split(/\n{2,}/).filter(Boolean);

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      <h2 className="text-lg font-semibold tracking-tight">{content.title}</h2>
      <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-[var(--color-ink)]">
        {paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>

      {!hideVisual && content.visual ? (
        <div className="mt-5">
          <VisualCanvas directive={content.visual} />
        </div>
      ) : null}

      {content.groundedInSource && citations.length > 0 ? (
        <div className="mt-5">
          <SourceCitations citations={citations} />
        </div>
      ) : null}

      <div className="mt-8 flex justify-end">
        <Button onClick={onContinue} loading={continuing} size="lg">
          Continue
        </Button>
      </div>
    </motion.div>
  );
}

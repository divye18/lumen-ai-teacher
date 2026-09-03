"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

import { SourceCitations } from "@/components/teaching/source-citations";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { QuestionView } from "@/lib/session/views";
import type { TeachingCitation } from "@/lib/session/citations";
import { questionKindLabel } from "@/lib/ui/learning-presentation";

export function QuestionPanel({
  question,
  citations,
  onSubmit,
  submitting,
}: {
  question: QuestionView;
  citations: TeachingCitation[];
  onSubmit: (answer: string, elapsedMs: number) => void;
  submitting: boolean;
}) {
  const reduce = useReducedMotion();
  const [answer, setAnswer] = useState("");
  const shownAt = useRef(0);

  useEffect(() => {
    shownAt.current = Date.now();
  }, []);

  const elapsed = () =>
    shownAt.current ? Math.max(0, Date.now() - shownAt.current) : 0;
  const canSubmit = answer.trim().length >= 2 && !submitting;

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      <div className="flex items-center gap-2">
        <Badge tone="accent">{questionKindLabel(question.kind)}</Badge>
        <span className="text-[11px] text-[var(--color-ink-faint)]">
          Answer in your own words
        </span>
      </div>

      <p className="mt-4 text-[16px] leading-relaxed font-medium text-[var(--color-ink)]">
        {question.prompt}
      </p>

      {question.groundedInSource && citations.length > 0 ? (
        <div className="mt-4">
          <SourceCitations citations={citations} compact />
        </div>
      ) : null}

      <form
        className="mt-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) onSubmit(answer.trim(), elapsed());
        }}
      >
        <label htmlFor="answer" className="sr-only">
          Your answer
        </label>
        <textarea
          id="answer"
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          rows={6}
          autoFocus
          disabled={submitting}
          placeholder="Explain your thinking…"
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && canSubmit) {
              onSubmit(answer.trim(), elapsed());
            }
          }}
          className="w-full resize-y rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-4 text-[15px] leading-relaxed text-[var(--color-ink)] placeholder:text-[var(--color-ink-faint)] focus-visible:border-[var(--color-accent)] focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--color-accent)_30%,transparent)] focus-visible:outline-none disabled:opacity-60"
        />
        <div className="mt-3 flex items-center justify-between">
          <span className="text-[11px] text-[var(--color-ink-faint)]">
            {answer.trim().length} characters · ⌘↵ to submit
          </span>
          <Button
            type="submit"
            disabled={!canSubmit}
            loading={submitting}
            size="lg"
          >
            Submit answer
          </Button>
        </div>
      </form>
    </motion.div>
  );
}

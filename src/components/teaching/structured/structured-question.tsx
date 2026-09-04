"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

import { Button } from "@/components/ui/button";
import type {
  ClientStructuredQuestion,
  StructuredAnswer,
} from "@/lib/assessment/structured";

import { McqQuestion } from "./mcq-question";
import { MultiSelectQuestion } from "./multi-select-question";
import { TrueFalseQuestion } from "./true-false-question";
import { OrderStepsQuestion } from "./order-steps-question";
import { ClassifyQuestion } from "./classify-question";
import { MatchRelationshipQuestion } from "./match-relationship-question";

/**
 * Format-specific structured-question interface. Owns the local draft answer,
 * a "review before submitting" confirm step for the multi-part formats, and the
 * lock-on-submit state. The answer is sent as JSON in the existing `answer`
 * string; the server re-validates it against `structuredAnswerSchema`.
 */

export interface StructuredQuestionHandle {
  /** null until the learner has a complete, submittable answer. */
  answer: StructuredAnswer | null;
  /** A one-line summary of the current selection for the confirm step. */
  summary: string;
}

const FORMAT_LABEL: Record<ClientStructuredQuestion["format"], string> = {
  MCQ: "Choose one",
  MULTI_SELECT: "Choose all that apply",
  TRUE_FALSE: "True or false",
  ORDER_STEPS: "Put in order",
  CLASSIFY: "Sort each item",
  MATCH_RELATIONSHIP: "Match the pairs",
};

export function StructuredQuestion({
  question,
  onSubmit,
  submitting,
}: {
  question: ClientStructuredQuestion;
  onSubmit: (answer: StructuredAnswer, elapsedMs: number) => void;
  submitting: boolean;
}) {
  const reduce = useReducedMotion();
  const [draft, setDraft] = useState<StructuredQuestionHandle>({
    answer: null,
    summary: "",
  });
  const [shownAt] = useState(() => Date.now());

  const canSubmit = draft.answer !== null && !submitting;

  function submit() {
    if (draft.answer) onSubmit(draft.answer, Date.now() - shownAt);
  }

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="flex items-center gap-2">
        <span className="rounded-full border border-[var(--color-accent)] bg-[var(--color-accent-soft)] px-2 py-0.5 text-[10px] font-semibold tracking-wide text-[var(--color-accent)] uppercase">
          {FORMAT_LABEL[question.format]}
        </span>
      </div>

      {question.context ? (
        <p className="mt-3 text-[12px] leading-relaxed text-[var(--color-ink-muted)]">
          {question.context}
        </p>
      ) : null}

      <p className="mt-3 text-[16px] leading-relaxed font-medium text-[var(--color-ink)]">
        {question.prompt}
      </p>

      <div className="mt-5">
        {question.format === "MCQ" && question.mcq ? (
          <McqQuestion data={question.mcq} onChange={setDraft} />
        ) : null}
        {question.format === "MULTI_SELECT" && question.multiSelect ? (
          <MultiSelectQuestion
            data={question.multiSelect}
            onChange={setDraft}
          />
        ) : null}
        {question.format === "TRUE_FALSE" && question.trueFalse ? (
          <TrueFalseQuestion data={question.trueFalse} onChange={setDraft} />
        ) : null}
        {question.format === "ORDER_STEPS" && question.orderSteps ? (
          <OrderStepsQuestion data={question.orderSteps} onChange={setDraft} />
        ) : null}
        {question.format === "CLASSIFY" && question.classify ? (
          <ClassifyQuestion data={question.classify} onChange={setDraft} />
        ) : null}
        {question.format === "MATCH_RELATIONSHIP" &&
        question.matchRelationship ? (
          <MatchRelationshipQuestion
            data={question.matchRelationship}
            onChange={setDraft}
          />
        ) : null}
      </div>

      <div className="mt-6 flex items-center justify-between gap-3">
        <span className="text-[11px] text-[var(--color-ink-faint)]">
          {draft.summary || "Make your selection to continue."}
        </span>
        <Button
          onClick={submit}
          disabled={!canSubmit}
          loading={submitting}
          size="lg"
        >
          Submit answer
        </Button>
      </div>
    </motion.div>
  );
}

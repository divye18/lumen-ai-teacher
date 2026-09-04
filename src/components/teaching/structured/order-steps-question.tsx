"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

import type { ClientStructuredQuestion } from "@/lib/assessment/structured";

import type { StructuredQuestionHandle } from "./structured-question";

type OrderData = NonNullable<ClientStructuredQuestion["orderSteps"]>;

/**
 * Accessible reorder: each row has up/down controls (works with keyboard and
 * touch, no drag required). Submittable once the learner has touched it.
 */
export function OrderStepsQuestion({
  data,
  onChange,
}: {
  data: OrderData;
  onChange: (h: StructuredQuestionHandle) => void;
}) {
  const reduce = useReducedMotion();
  const [order, setOrder] = useState(() => data.items.map((i) => i.id));
  const [touched, setTouched] = useState(false);

  // Any order is a complete answer — seed it so the learner can submit.
  useEffect(() => {
    onChange({
      answer: { format: "ORDER_STEPS", order: data.items.map((i) => i.id) },
      summary: "Arrange the steps, then submit.",
    });
  }, [data.items, onChange]);

  const textOf = (id: string) =>
    data.items.find((i) => i.id === id)?.text ?? id;

  function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= order.length) return;
    const next = [...order];
    [next[index], next[target]] = [next[target], next[index]];
    setOrder(next);
    setTouched(true);
    onChange({
      answer: { format: "ORDER_STEPS", order: next },
      summary: "Order updated — submit when ready.",
    });
  }

  return (
    <ol className="flex flex-col gap-2">
      {order.map((id, index) => (
        <motion.li
          key={id}
          layout={!reduce}
          transition={{ duration: 0.2 }}
          className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2.5"
        >
          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[var(--color-subtle)] text-[11px] font-semibold tabular-nums">
            {index + 1}
          </span>
          <span className="flex-1 text-[13px] leading-snug text-[var(--color-ink)]">
            {textOf(id)}
          </span>
          <span className="flex shrink-0 flex-col">
            <button
              type="button"
              onClick={() => move(index, -1)}
              disabled={index === 0}
              aria-label={`Move "${textOf(id)}" up`}
              className="grid size-6 place-items-center text-[var(--color-ink-faint)] hover:text-[var(--color-ink)] disabled:opacity-30"
            >
              <svg viewBox="0 0 12 12" className="size-3" aria-hidden>
                <path d="M6 3l4 5H2z" fill="currentColor" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => move(index, 1)}
              disabled={index === order.length - 1}
              aria-label={`Move "${textOf(id)}" down`}
              className="grid size-6 place-items-center text-[var(--color-ink-faint)] hover:text-[var(--color-ink)] disabled:opacity-30"
            >
              <svg viewBox="0 0 12 12" className="size-3" aria-hidden>
                <path d="M6 9L2 4h8z" fill="currentColor" />
              </svg>
            </button>
          </span>
        </motion.li>
      ))}
      {!touched ? (
        <p className="mt-1 text-[11px] text-[var(--color-ink-faint)]">
          Use the arrows to reorder, then submit.
        </p>
      ) : null}
    </ol>
  );
}

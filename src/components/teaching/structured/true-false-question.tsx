"use client";

import { useState } from "react";

import type { ClientStructuredQuestion } from "@/lib/assessment/structured";
import { cn } from "@/lib/ui/cn";

import type { StructuredQuestionHandle } from "./structured-question";

type TfData = NonNullable<ClientStructuredQuestion["trueFalse"]>;

/** Clear binary decision. */
export function TrueFalseQuestion({
  data,
  onChange,
}: {
  data: TfData;
  onChange: (h: StructuredQuestionHandle) => void;
}) {
  const [value, setValue] = useState<boolean | null>(null);

  function pick(v: boolean) {
    setValue(v);
    onChange({
      answer: { format: "TRUE_FALSE", value: v },
      summary: v ? "Answered: True" : "Answered: False",
    });
  }

  return (
    <div>
      <blockquote className="rounded-[var(--radius-md)] border-l-2 border-[var(--color-border-strong)] bg-[var(--color-subtle)] px-4 py-3 text-[14px] leading-relaxed text-[var(--color-ink)]">
        {data.statement}
      </blockquote>
      <div
        role="radiogroup"
        aria-label="True or false"
        className="mt-4 grid grid-cols-2 gap-3"
      >
        {[true, false].map((v) => {
          const active = value === v;
          return (
            <button
              key={String(v)}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => pick(v)}
              className={cn(
                "rounded-[var(--radius-md)] border px-4 py-4 text-[15px] font-medium transition-colors",
                active
                  ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                  : "border-[var(--color-border-strong)] text-[var(--color-ink-muted)] hover:border-[var(--color-accent)] hover:bg-[var(--color-subtle)]",
              )}
            >
              {v ? "True" : "False"}
            </button>
          );
        })}
      </div>
    </div>
  );
}

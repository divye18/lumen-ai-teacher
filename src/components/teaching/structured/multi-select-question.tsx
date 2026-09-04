"use client";

import { useState } from "react";

import type { ClientStructuredQuestion } from "@/lib/assessment/structured";
import { cn } from "@/lib/ui/cn";

import type { StructuredQuestionHandle } from "./structured-question";

type MultiData = NonNullable<ClientStructuredQuestion["multiSelect"]>;

/** Multi-selection cards. Any non-empty selection is submittable. */
export function MultiSelectQuestion({
  data,
  onChange,
}: {
  data: MultiData;
  onChange: (h: StructuredQuestionHandle) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
    onChange({
      answer:
        next.size > 0
          ? { format: "MULTI_SELECT", selectedIds: [...next] }
          : null,
      summary:
        next.size === 0 ? "Select all that apply." : `${next.size} selected`,
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {data.options.map((option) => {
        const active = selected.has(option.id);
        return (
          <button
            key={option.id}
            type="button"
            role="checkbox"
            aria-checked={active}
            onClick={() => toggle(option.id)}
            className={cn(
              "flex items-start gap-3 rounded-[var(--radius-md)] border px-4 py-3 text-left transition-colors",
              active
                ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]"
                : "border-[var(--color-border-strong)] hover:border-[var(--color-accent)] hover:bg-[var(--color-subtle)]",
            )}
          >
            <span
              className={cn(
                "mt-0.5 grid size-4 shrink-0 place-items-center rounded-[5px] border-2",
                active
                  ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-white"
                  : "border-[var(--color-border-strong)]",
              )}
            >
              {active ? (
                <svg viewBox="0 0 10 10" className="size-2.5" aria-hidden>
                  <path
                    d="M1.5 5l2 2 5-5.5"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                </svg>
              ) : null}
            </span>
            <span className="text-[14px] leading-snug text-[var(--color-ink)]">
              {option.text}
            </span>
          </button>
        );
      })}
      <p className="mt-1 text-[11px] text-[var(--color-ink-faint)]">
        There {data.minSelections === 1 ? "is" : "are"} {data.minSelections}{" "}
        correct option{data.minSelections === 1 ? "" : "s"}.
      </p>
    </div>
  );
}

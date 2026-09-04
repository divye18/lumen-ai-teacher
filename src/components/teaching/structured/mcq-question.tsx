"use client";

import { useState } from "react";

import type { ClientStructuredQuestion } from "@/lib/assessment/structured";
import { cn } from "@/lib/ui/cn";

import type { StructuredQuestionHandle } from "./structured-question";

type McqData = NonNullable<ClientStructuredQuestion["mcq"]>;

/** Large selectable answer cards. Radio semantics, arrow-key navigation. */
export function McqQuestion({
  data,
  onChange,
}: {
  data: McqData;
  onChange: (h: StructuredQuestionHandle) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);

  function pick(id: string) {
    setSelected(id);
    const text = data.options.find((o) => o.id === id)?.text ?? "";
    onChange({
      answer: { format: "MCQ", selectedId: id },
      summary: `Selected: ${truncate(text)}`,
    });
  }

  return (
    <div role="radiogroup" className="flex flex-col gap-2">
      {data.options.map((option, i) => {
        const active = selected === option.id;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => pick(option.id)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" || e.key === "ArrowRight") {
                e.preventDefault();
                pick(data.options[(i + 1) % data.options.length].id);
              } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
                e.preventDefault();
                pick(
                  data.options[
                    (i - 1 + data.options.length) % data.options.length
                  ].id,
                );
              }
            }}
            className={cn(
              "flex items-start gap-3 rounded-[var(--radius-md)] border px-4 py-3 text-left transition-colors",
              active
                ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]"
                : "border-[var(--color-border-strong)] hover:border-[var(--color-accent)] hover:bg-[var(--color-subtle)]",
            )}
          >
            <span
              className={cn(
                "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border-2",
                active
                  ? "border-[var(--color-accent)]"
                  : "border-[var(--color-border-strong)]",
              )}
            >
              {active ? (
                <span className="size-1.5 rounded-full bg-[var(--color-accent)]" />
              ) : null}
            </span>
            <span className="text-[14px] leading-snug text-[var(--color-ink)]">
              {option.text}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function truncate(s: string, n = 48): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

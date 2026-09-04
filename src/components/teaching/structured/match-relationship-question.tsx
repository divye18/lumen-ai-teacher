"use client";

import { useState } from "react";

import type { ClientStructuredQuestion } from "@/lib/assessment/structured";
import { cn } from "@/lib/ui/cn";

import type { StructuredQuestionHandle } from "./structured-question";

type MatchData = NonNullable<ClientStructuredQuestion["matchRelationship"]>;

/**
 * Each left item chooses a right item from a segmented control. Complete (and
 * submittable) only when every left item has a match.
 */
export function MatchRelationshipQuestion({
  data,
  onChange,
}: {
  data: MatchData;
  onChange: (h: StructuredQuestionHandle) => void;
}) {
  const [pairs, setPairs] = useState<Record<string, string>>({});

  function match(leftId: string, rightId: string) {
    const next = { ...pairs, [leftId]: rightId };
    setPairs(next);
    const done = Object.keys(next).length;
    const complete = done === data.left.length;
    onChange({
      answer: complete
        ? {
            format: "MATCH_RELATIONSHIP",
            pairs: Object.entries(next).map(([leftId2, rightId2]) => ({
              leftId: leftId2,
              rightId: rightId2,
            })),
          }
        : null,
      summary: complete
        ? "All matched — submit when ready."
        : `${done} of ${data.left.length} matched`,
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {data.left.map((left) => (
        <div
          key={left.id}
          className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
        >
          <p className="text-[13px] leading-snug font-medium text-[var(--color-ink)]">
            {left.text}
          </p>
          <div
            role="radiogroup"
            aria-label={`Match for: ${left.text}`}
            className="mt-2 flex flex-wrap gap-1.5"
          >
            {data.right.map((right) => {
              const active = pairs[left.id] === right.id;
              return (
                <button
                  key={right.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => match(left.id, right.id)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-[12px] font-medium transition-colors",
                    active
                      ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                      : "border-[var(--color-border-strong)] text-[var(--color-ink-muted)] hover:border-[var(--color-accent)]",
                  )}
                >
                  {right.text}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

"use client";

import { useState } from "react";

import type { ClientStructuredQuestion } from "@/lib/assessment/structured";
import { cn } from "@/lib/ui/cn";

import type { StructuredQuestionHandle } from "./structured-question";

type ClassifyData = NonNullable<ClientStructuredQuestion["classify"]>;

/**
 * Each item gets a segmented control of buckets — accessible, no drag needed.
 * Complete (and submittable) only when every item has a bucket.
 */
export function ClassifyQuestion({
  data,
  onChange,
}: {
  data: ClassifyData;
  onChange: (h: StructuredQuestionHandle) => void;
}) {
  const [assignments, setAssignments] = useState<Record<string, string>>({});

  function assign(itemId: string, bucketId: string) {
    const next = { ...assignments, [itemId]: bucketId };
    setAssignments(next);
    const placed = Object.keys(next).length;
    const complete = placed === data.items.length;
    onChange({
      answer: complete ? { format: "CLASSIFY", assignments: next } : null,
      summary: complete
        ? "All items sorted — submit when ready."
        : `${placed} of ${data.items.length} sorted`,
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {data.items.map((item) => (
        <div
          key={item.id}
          className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
        >
          <p className="text-[13px] leading-snug text-[var(--color-ink)]">
            {item.text}
          </p>
          <div
            role="radiogroup"
            aria-label={`Bucket for: ${item.text}`}
            className="mt-2 flex flex-wrap gap-1.5"
          >
            {data.buckets.map((bucket) => {
              const active = assignments[item.id] === bucket.id;
              return (
                <button
                  key={bucket.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => assign(item.id, bucket.id)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-[12px] font-medium transition-colors",
                    active
                      ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                      : "border-[var(--color-border-strong)] text-[var(--color-ink-muted)] hover:border-[var(--color-accent)]",
                  )}
                >
                  {bucket.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import { Panel, SectionHeading } from "@/components/ui/surface";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import type { MisconceptionInsight } from "@/lib/studio/overview";

const SEVERITY_TONE: Record<string, "neutral" | "warning" | "danger"> = {
  LOW: "neutral",
  MEDIUM: "warning",
  HIGH: "danger",
  CRITICAL: "danger",
};

export function MisconceptionRadar({
  misconceptions,
}: {
  misconceptions: MisconceptionInsight[];
}) {
  const reduce = useReducedMotion();
  const [openId, setOpenId] = useState<string | null>(null);

  if (misconceptions.length === 0) {
    return (
      <Panel inset>
        <SectionHeading title="Misconception radar" />
        <EmptyState
          className="mt-4"
          title="No recurring misconceptions detected yet"
          description="As you answer questions, Lumen watches for wrong mental models. If one keeps coming back, it shows up here with a plan to fix it."
        />
      </Panel>
    );
  }

  const needAttention = misconceptions.filter((m) => m.detections >= 2).length;

  return (
    <Panel inset>
      <SectionHeading
        title="Misconception radar"
        hint={
          needAttention > 0
            ? `${needAttention} concept${needAttention === 1 ? "" : "s"} need attention`
            : `${misconceptions.length} being watched`
        }
      />

      <ul className="mt-4 flex flex-col divide-y divide-[var(--color-border)]">
        {misconceptions.map((m) => {
          const open = openId === m.id;
          return (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => setOpenId(open ? null : m.id)}
                aria-expanded={open}
                className="flex w-full items-center gap-3 py-3 text-left"
              >
                <span
                  className="mt-0.5 size-2 shrink-0 rounded-full"
                  style={{
                    backgroundColor:
                      m.detections >= 2
                        ? "var(--color-warning)"
                        : "var(--color-ink-faint)",
                  }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-[var(--color-ink)]">
                    {m.conceptTitle}
                  </span>
                  <span className="block truncate text-[12px] text-[var(--color-ink-muted)]">
                    {m.category.replace(/-/g, " ")}
                  </span>
                </span>
                {m.detections >= 2 ? (
                  <Badge tone={SEVERITY_TONE[m.severity] ?? "warning"}>
                    seen {m.detections}×
                  </Badge>
                ) : null}
                <svg
                  viewBox="0 0 16 16"
                  className={`size-3.5 shrink-0 text-[var(--color-ink-faint)] transition-transform ${open ? "rotate-90" : ""}`}
                  aria-hidden
                >
                  <path
                    d="M6 4l4 4-4 4"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                </svg>
              </button>

              <AnimatePresence initial={false}>
                {open ? (
                  <motion.div
                    initial={reduce ? false : { height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="pb-4 pl-5">
                      <p className="text-[11px] font-medium tracking-wide text-[var(--color-ink-faint)] uppercase">
                        What Lumen noticed
                      </p>
                      <p className="mt-1 text-[13px] leading-relaxed text-[var(--color-ink)]">
                        {m.whatLumenNoticed}
                      </p>
                      <p className="mt-3 text-[11px] font-medium tracking-wide text-[var(--color-ink-faint)] uppercase">
                        How Lumen will respond
                      </p>
                      <p className="mt-1 text-[13px] leading-relaxed text-[var(--color-ink-muted)]">
                        {m.detections >= 2
                          ? "This has come back more than once, so Lumen will re-teach the concept with a different strategy and step the difficulty down before testing again."
                          : "Lumen is keeping an eye on this. If it recurs, the lesson will switch approach automatically."}
                      </p>
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

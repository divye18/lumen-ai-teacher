"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import { Panel, SectionHeading } from "@/components/ui/surface";
import { MasteryMeter } from "@/components/ui/mastery-meter";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import type { ConceptNode } from "@/lib/studio/overview";
import { cn } from "@/lib/ui/cn";

const LANES: { id: string; label: string; token: string }[] = [
  {
    id: "not-understood",
    label: "Needs attention",
    token: "var(--color-band-unknown)",
  },
  { id: "emerging", label: "Emerging", token: "var(--color-band-emerging)" },
  {
    id: "developing",
    label: "Developing",
    token: "var(--color-band-developing)",
  },
  { id: "proficient", label: "Strong", token: "var(--color-band-proficient)" },
  { id: "strong", label: "Mastered", token: "var(--color-band-strong)" },
];

export function KnowledgeMap({ concepts }: { concepts: ConceptNode[] }) {
  const reduce = useReducedMotion();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const byLane = useMemo(() => {
    const map = new Map<string, ConceptNode[]>();
    for (const lane of LANES) map.set(lane.id, []);
    for (const c of concepts) {
      const laneId = c.assessed ? c.bandId : "not-understood";
      (map.get(laneId) ?? map.get("not-understood"))!.push(c);
    }
    return map;
  }, [concepts]);

  const selected = concepts.find((c) => c.conceptKey === selectedKey) ?? null;
  const unassessed = concepts.filter((c) => !c.assessed).length;

  if (concepts.length === 0) {
    return (
      <Panel inset>
        <SectionHeading
          title="Knowledge map"
          hint="Every concept Lumen is tracking, by mastery"
        />
        <EmptyState
          className="mt-5"
          title="No concepts yet"
          description="Create a lesson and Lumen will map each concept as you learn — you'll see mastery move here in real time."
        />
      </Panel>
    );
  }

  return (
    <Panel inset>
      <SectionHeading
        title="Knowledge map"
        hint={`${concepts.length} concept${concepts.length === 1 ? "" : "s"} · ${unassessed} not assessed`}
      />

      <div className="mt-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {LANES.map((lane) => {
          const items = byLane.get(lane.id) ?? [];
          return (
            <div key={lane.id} className="min-w-0">
              <div className="mb-2 flex items-center gap-1.5">
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: lane.token }}
                  aria-hidden
                />
                <span className="text-[11px] font-medium tracking-wide text-[var(--color-ink-faint)] uppercase">
                  {lane.label}
                </span>
                <span className="ml-auto text-[11px] text-[var(--color-ink-faint)] tabular-nums">
                  {items.length}
                </span>
              </div>
              <div className="flex flex-col gap-1.5">
                {items.length === 0 ? (
                  <div className="rounded-[var(--radius-sm)] border border-dashed border-[var(--color-border)] px-2.5 py-3 text-center text-[11px] text-[var(--color-ink-faint)]">
                    —
                  </div>
                ) : (
                  items.map((c) => (
                    <motion.button
                      key={c.conceptKey}
                      type="button"
                      onClick={() => setSelectedKey(c.conceptKey)}
                      layout={!reduce}
                      className={cn(
                        "group rounded-[var(--radius-sm)] border px-2.5 py-2 text-left transition-colors",
                        selectedKey === c.conceptKey
                          ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]"
                          : "border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-border-strong)]",
                      )}
                      aria-pressed={selectedKey === c.conceptKey}
                    >
                      <span className="line-clamp-2 text-[12px] font-medium text-[var(--color-ink)]">
                        {c.title}
                      </span>
                      <span className="mt-1 flex items-center gap-1.5">
                        <span
                          className="h-1 flex-1 rounded-full bg-[var(--color-subtle)]"
                          aria-hidden
                        >
                          <span
                            className="block h-full rounded-full"
                            style={{
                              width: `${c.assessed ? c.masteryPoints : 4}%`,
                              backgroundColor: lane.token,
                            }}
                          />
                        </span>
                        <span className="text-[10px] text-[var(--color-ink-faint)] tabular-nums">
                          {c.assessed ? c.masteryPoints : "–"}
                        </span>
                      </span>
                      {c.misconceptionCount > 0 ? (
                        <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-medium text-[var(--color-warning)]">
                          <span className="size-1 rounded-full bg-current" />
                          {c.misconceptionCount} misconception
                          {c.misconceptionCount === 1 ? "" : "s"}
                        </span>
                      ) : null}
                    </motion.button>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      <AnimatePresence initial={false}>
        {selected ? (
          <motion.div
            key={selected.conceptKey}
            initial={reduce ? false : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <ConceptDetail
              concept={selected}
              onClose={() => setSelectedKey(null)}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </Panel>
  );
}

function nextActionFor(c: ConceptNode): string {
  if (c.misconceptionCount > 0) {
    return "Lumen will re-teach this with a different approach before moving on.";
  }
  if (!c.assessed)
    return "Not assessed yet — start the lesson to gauge where you stand.";
  if (c.masteryPoints >= 86)
    return "Mastered. Ready to build on this or move to harder applications.";
  if (c.masteryPoints >= 71)
    return "Strong grasp — Lumen will raise the difficulty next.";
  if (c.masteryPoints >= 51)
    return "Developing — a few more application questions should solidify it.";
  if (c.masteryPoints >= 31)
    return "Emerging — Lumen will explain again and check with a guided question.";
  return "Needs attention — Lumen will re-teach from the ground up.";
}

function ConceptDetail({
  concept,
  onClose,
}: {
  concept: ConceptNode;
  onClose: () => void;
}) {
  return (
    <div className="mt-5 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-canvas)] p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold tracking-tight">
            {concept.title}
          </h3>
          <p className="mt-0.5 text-[12px] text-[var(--color-ink-muted)]">
            {concept.lessonTitle}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close concept detail"
          className="-mt-1 -mr-1 grid size-7 place-items-center rounded-[var(--radius-sm)] text-[var(--color-ink-faint)] hover:bg-[var(--color-subtle)]"
        >
          <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden>
            <path
              d="M3 3l10 10M13 3L3 13"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-1.5 text-[11px] font-medium tracking-wide text-[var(--color-ink-faint)] uppercase">
            Mastery
          </p>
          <MasteryMeter
            value={concept.assessed ? concept.masteryPoints : 0}
            size="sm"
          />
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
          <div>
            <dt className="text-[var(--color-ink-faint)]">Confidence</dt>
            <dd className="font-medium">
              {concept.assessed ? `${concept.confidence}%` : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--color-ink-faint)]">Attempts</dt>
            <dd className="font-medium">{concept.attempts}</dd>
          </div>
          <div>
            <dt className="text-[var(--color-ink-faint)]">Misconceptions</dt>
            <dd className="font-medium">
              {concept.misconceptionCount > 0 ? (
                <Badge tone="warning">{concept.misconceptionCount}</Badge>
              ) : (
                "None"
              )}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--color-ink-faint)]">Status</dt>
            <dd className="font-medium capitalize">
              {concept.status.toLowerCase()}
            </dd>
          </div>
        </dl>
      </div>

      <div className="mt-4 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
        <p className="text-[11px] font-medium tracking-wide text-[var(--color-ink-faint)] uppercase">
          Recommended next
        </p>
        <p className="mt-1 text-[13px] leading-relaxed text-[var(--color-ink)]">
          {nextActionFor(concept)}
        </p>
      </div>

      <div className="mt-4">
        <LinkButton
          href={`/studio/plan?topic=${encodeURIComponent(concept.title)}`}
          variant="secondary"
          size="sm"
        >
          Focus a lesson on this
        </LinkButton>
      </div>
    </div>
  );
}

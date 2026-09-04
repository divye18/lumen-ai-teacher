"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import { KnowledgeGraph } from "./knowledge-graph";
import { ConceptInspector } from "./concept-inspector";
import type { KnowledgeGraphView } from "@/lib/graph";
import { cn } from "@/lib/ui/cn";

/**
 * The knowledge graph as a live learning map inside the Teaching Room.
 *
 * Node colour + rings come straight from the current `KnowledgeGraphView`
 * (mastery band, misconception ring, "current concept" pulse), so it re-paints
 * as the learner state changes after each answer. Clicking a concept opens the
 * real inspector; the header answers "why is Lumen here right now?".
 */
export function TeachingRoomMap({
  graph,
  currentConceptKey,
  relevanceNote,
  className,
}: {
  graph: KnowledgeGraphView;
  currentConceptKey: string | null;
  /** One learner-facing line on why the current concept is active. */
  relevanceNote?: string | null;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (graph.nodes.length < 2) return null;

  const current =
    graph.nodes.find((n) => n.conceptKey === currentConceptKey) ?? null;
  const selected =
    graph.nodes.find((n) => n.id === selectedId) ?? current ?? null;

  const assessed = graph.nodes.filter((n) => n.assessed).length;
  const withMisconception = graph.nodes.filter(
    (n) => n.misconceptionCount > 0,
  ).length;

  return (
    <div
      className={cn(
        "rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)]",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 p-4 text-left"
      >
        <div className="min-w-0">
          <p className="text-[10px] font-semibold tracking-wider text-[var(--color-ink-faint)] uppercase">
            Learning map
          </p>
          <p className="mt-1 truncate text-[12px] text-[var(--color-ink-muted)]">
            {graph.nodes.length} concepts · {assessed} assessed
            {withMisconception > 0 ? ` · ${withMisconception} to watch` : ""}
          </p>
        </div>
        <svg
          viewBox="0 0 16 16"
          className={cn(
            "size-4 shrink-0 text-[var(--color-ink-faint)] transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        >
          <path
            d="M4 6l4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
      </button>

      {current && relevanceNote ? (
        <p className="border-t border-[var(--color-border)] px-4 py-2.5 text-[11px] leading-snug text-[var(--color-accent)]">
          {relevanceNote}
        </p>
      ) : null}

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            initial={reduce ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-[var(--color-border)]"
          >
            <div className="p-3">
              <KnowledgeGraph
                graph={graph}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
              {selected ? (
                <div className="mt-3">
                  <ConceptInspector
                    node={selected}
                    graph={graph}
                    onSelectConcept={setSelectedId}
                    onClose={() => setSelectedId(null)}
                  />
                </div>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

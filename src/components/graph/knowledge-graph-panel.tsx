"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import { Panel, SectionHeading } from "@/components/ui/surface";
import { EmptyState } from "@/components/ui/states";
import type { KnowledgeGraphView } from "@/lib/graph";

import { ConceptInspector } from "./concept-inspector";
import { ConceptPathway } from "./concept-pathway";
import { KnowledgeGraph } from "./knowledge-graph";
import { LearningPath } from "./learning-path";

/**
 * The knowledge map: an interactive graph on desktop, a prerequisite-ordered
 * list on mobile, with a shared concept inspector and learning-path view.
 * Every value comes from the live `KnowledgeGraphView`.
 */
export function KnowledgeGraphPanel({
  graph,
  title = "Knowledge map",
}: {
  graph: KnowledgeGraphView;
  title?: string;
}) {
  const reduce = useReducedMotion();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = graph.nodes.find((n) => n.id === selectedId) ?? null;

  const hint =
    graph.nodes.length > 0
      ? `${graph.stats.nodeCount} concept${graph.stats.nodeCount === 1 ? "" : "s"} · ${graph.stats.edgeCount} link${graph.stats.edgeCount === 1 ? "" : "s"}${
          graph.stats.misconceptionCount > 0
            ? ` · ${graph.stats.misconceptionCount} misconception${graph.stats.misconceptionCount === 1 ? "" : "s"}`
            : ""
        }`
      : undefined;

  if (graph.nodes.length === 0) {
    return (
      <Panel inset>
        <SectionHeading
          title={title}
          hint="The subject and your understanding of it, as one map"
        />
        <EmptyState
          className="mt-5"
          title="No concepts yet"
          description="Create a lesson and Lumen maps every concept, how they relate, and where you stand — updated as you learn."
        />
      </Panel>
    );
  }

  return (
    <Panel inset>
      <SectionHeading
        title={title}
        hint={hint}
        action={
          graph.stats.averageMastery !== null ? (
            <span className="text-[12px] text-[var(--color-ink-muted)] tabular-nums">
              avg mastery {graph.stats.averageMastery}
            </span>
          ) : undefined
        }
      />

      <div className="mt-5 hidden md:block">
        <KnowledgeGraph
          graph={graph}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      </div>
      <div className="mt-5 md:hidden">
        <ConceptPathway
          graph={graph}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      </div>

      <AnimatePresence initial={false}>
        {selected ? (
          <motion.div
            key={selected.id}
            initial={reduce ? false : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="mt-4 space-y-3">
              <ConceptInspector
                node={selected}
                graph={graph}
                onSelectConcept={setSelectedId}
                onClose={() => setSelectedId(null)}
              />
              <LearningPath
                node={selected}
                graph={graph}
                onSelectConcept={setSelectedId}
              />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </Panel>
  );
}

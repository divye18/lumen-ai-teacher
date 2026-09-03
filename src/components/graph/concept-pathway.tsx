"use client";

import { useMemo } from "react";

import type { KnowledgeGraphNode, KnowledgeGraphView } from "@/lib/graph";
import { cn } from "@/lib/ui/cn";

import { BAND_TOKEN } from "./concept-inspector";

/**
 * Mobile-first concept list. The full graph is a desktop experience; on small
 * screens the same data is a prerequisite-ordered, tappable list.
 */
export function ConceptPathway({
  graph,
  selectedId,
  onSelect,
}: {
  graph: KnowledgeGraphView;
  selectedId: string | null;
  onSelect: (nodeId: string | null) => void;
}) {
  const layers = useMemo(() => {
    const byDepth = new Map<number, KnowledgeGraphNode[]>();
    for (const n of graph.nodes) {
      const list = byDepth.get(n.depth) ?? [];
      list.push(n);
      byDepth.set(n.depth, list);
    }
    return [...byDepth.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([depth, nodes]) => ({
        depth,
        nodes: nodes.sort((a, b) => b.importance - a.importance),
      }));
  }, [graph.nodes]);

  if (graph.nodes.length === 0) return null;

  return (
    <ol className="space-y-4">
      {layers.map((layer, i) => (
        <li key={layer.depth}>
          <p className="mb-1.5 text-[10px] font-semibold tracking-wider text-[var(--color-ink-faint)] uppercase">
            {i === 0
              ? "Foundations"
              : i === layers.length - 1
                ? "Builds on everything above"
                : `Layer ${i + 1}`}
          </p>
          <div className="flex flex-col gap-1.5">
            {layer.nodes.map((n) => {
              const band = BAND_TOKEN[n.bandId] ?? "var(--color-band-unknown)";
              const active = n.id === selectedId;
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => onSelect(active ? null : n.id)}
                  aria-pressed={active}
                  className={cn(
                    "flex items-center gap-3 rounded-[var(--radius-sm)] border px-3 py-2 text-left",
                    active
                      ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]"
                      : "border-[var(--color-border)] bg-[var(--color-surface)]",
                  )}
                >
                  <span
                    className="grid size-8 shrink-0 place-items-center rounded-full text-[11px] font-semibold"
                    style={{
                      backgroundColor: n.assessed
                        ? `color-mix(in oklab, ${band} 22%, var(--color-canvas))`
                        : "var(--color-canvas)",
                      border: `1.5px solid ${band}`,
                      color: "var(--color-ink)",
                    }}
                  >
                    {n.assessed ? n.masteryPoints : "–"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-[var(--color-ink)]">
                      {n.title}
                      {n.isCurrent ? (
                        <span className="ml-1.5 text-[10px] font-semibold text-[var(--color-accent)]">
                          NOW
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 flex items-center gap-2 text-[11px] text-[var(--color-ink-faint)]">
                      <span>{n.masteryBand}</span>
                      {n.misconceptionCount > 0 ? (
                        <span className="inline-flex items-center gap-1 text-[var(--color-warning)]">
                          <span className="size-1 rounded-full bg-current" />
                          {n.misconceptionCount}
                        </span>
                      ) : null}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </li>
      ))}
    </ol>
  );
}

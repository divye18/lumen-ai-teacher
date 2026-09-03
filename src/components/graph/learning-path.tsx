"use client";

import type { KnowledgeGraphNode, KnowledgeGraphView } from "@/lib/graph";

import { BAND_TOKEN } from "./concept-inspector";

/**
 * The prerequisite path leading to a selected concept, plus a safe, plain
 * explanation of why Lumen would reinforce along it. Never chain-of-thought.
 */
export function LearningPath({
  node,
  graph,
  onSelectConcept,
}: {
  node: KnowledgeGraphNode;
  graph: KnowledgeGraphView;
  onSelectConcept?: (id: string) => void;
}) {
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));

  // Walk prerequisites backwards from the selected node (longest weak-first path).
  const incoming = new Map<string, string[]>();
  for (const e of graph.edges) {
    if (e.type !== "PREREQUISITE") continue;
    incoming.set(e.target, [...(incoming.get(e.target) ?? []), e.source]);
  }

  const chain: KnowledgeGraphNode[] = [];
  const seen = new Set<string>();
  let cursor: string | null = node.id;
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    const here = nodeById.get(cursor);
    if (here) chain.unshift(here);
    const parents = (incoming.get(cursor) ?? [])
      .map((id) => nodeById.get(id))
      .filter((n): n is KnowledgeGraphNode => Boolean(n))
      .sort((a, b) => a.masteryPoints - b.masteryPoints);
    cursor = parents[0]?.id ?? null;
  }

  const unlocks = graph.edges
    .filter((e) => e.type === "PREREQUISITE" && e.source === node.id)
    .map((e) => nodeById.get(e.target))
    .filter((n): n is KnowledgeGraphNode => Boolean(n));

  if (chain.length <= 1 && unlocks.length === 0) return null;

  const weakLink = chain.find(
    (n) => n.id !== node.id && n.assessed && n.masteryPoints < 55,
  );

  const explanation = weakLink
    ? `${weakLink.title} is still shaky (${weakLink.masteryPoints}/100) and ${node.title} builds on it — Lumen reinforces the earlier step first.`
    : unlocks.length > 0
      ? `${unlocks.map((u) => u.title).join(" and ")} build directly on ${node.title}, so Lumen makes sure it is solid before moving on.`
      : `${node.title} sits on top of ${chain[chain.length - 2]?.title ?? "earlier concepts"}.`;

  const full = [...chain, ...unlocks.filter((u) => u.id !== node.id)];

  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <p className="text-[10px] font-semibold tracking-wider text-[var(--color-ink-faint)] uppercase">
        Learning path
      </p>
      <ol className="mt-3 flex flex-wrap items-center gap-x-1 gap-y-2">
        {full.map((n, i) => {
          const band = BAND_TOKEN[n.bandId] ?? "var(--color-band-unknown)";
          const isTarget = n.id === node.id;
          return (
            <li key={n.id} className="flex items-center gap-1">
              {i > 0 ? (
                <span className="text-[var(--color-ink-faint)]">→</span>
              ) : null}
              <button
                type="button"
                onClick={
                  onSelectConcept ? () => onSelectConcept(n.id) : undefined
                }
                className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px]"
                style={{
                  borderColor: isTarget ? "var(--color-accent)" : band,
                  backgroundColor: isTarget
                    ? "var(--color-accent-soft)"
                    : "var(--color-canvas)",
                }}
              >
                <span
                  className="size-1.5 rounded-full"
                  style={{ backgroundColor: band }}
                />
                {n.title}
              </button>
            </li>
          );
        })}
      </ol>
      <p className="mt-3 text-[12px] leading-relaxed text-[var(--color-ink-muted)]">
        {explanation}
      </p>
    </div>
  );
}

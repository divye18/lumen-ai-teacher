"use client";

import type { KnowledgeGraphView } from "@/lib/graph";
import { cn } from "@/lib/ui/cn";

import { BAND_TOKEN } from "./concept-inspector";

/**
 * Compact prerequisite context for the Teaching Room:
 *   prerequisite ✓ → current ● → next ○
 * Plus a one-line note when Lumen is reinforcing this concept because later
 * material depends on it. Renders nothing without graph structure.
 */
export function LessonPathStrip({
  graph,
  currentConceptKey,
  reinforcing,
}: {
  graph: Pick<KnowledgeGraphView, "nodes" | "edges">;
  currentConceptKey: string | null;
  reinforcing?: boolean;
}) {
  const current = currentConceptKey
    ? (graph.nodes.find((n) => n.conceptKey === currentConceptKey) ?? null)
    : null;
  if (!current || graph.edges.length === 0) return null;

  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const prereqs = graph.edges
    .filter((e) => e.type === "PREREQUISITE" && e.target === current.id)
    .map((e) => nodeById.get(e.source))
    .filter((n): n is (typeof graph.nodes)[number] => Boolean(n))
    .sort((a, b) => b.importance - a.importance);
  const unlocks = graph.edges
    .filter((e) => e.type === "PREREQUISITE" && e.source === current.id)
    .map((e) => nodeById.get(e.target))
    .filter((n): n is (typeof graph.nodes)[number] => Boolean(n))
    .sort((a, b) => b.importance - a.importance);

  if (prereqs.length === 0 && unlocks.length === 0) return null;

  const rows: {
    role: string;
    title: string;
    marker: "done" | "current" | "pending" | "warn";
    band: string;
  }[] = [];
  const topPrereq = prereqs[0];
  if (topPrereq) {
    rows.push({
      role: "Prerequisite",
      title: topPrereq.title,
      marker:
        topPrereq.assessed && topPrereq.masteryPoints >= 60
          ? "done"
          : topPrereq.assessed
            ? "warn"
            : "pending",
      band: BAND_TOKEN[topPrereq.bandId] ?? "var(--color-band-unknown)",
    });
  }
  rows.push({
    role: "Current concept",
    title: current.title,
    marker: "current",
    band: BAND_TOKEN[current.bandId] ?? "var(--color-band-unknown)",
  });
  if (unlocks[0]) {
    rows.push({
      role: "Next concept",
      title: unlocks[0].title,
      marker: "pending",
      band: BAND_TOKEN[unlocks[0].bandId] ?? "var(--color-band-unknown)",
    });
  }

  return (
    <div className="border-t border-[var(--color-border)] pt-3">
      <p className="text-[10px] font-semibold tracking-wider text-[var(--color-ink-faint)] uppercase">
        Learning path
      </p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {rows.map((r) => (
          <li key={r.role} className="flex items-center gap-2 text-[11px]">
            <Marker kind={r.marker} band={r.band} />
            <span
              className={cn(
                r.marker === "current"
                  ? "font-medium text-[var(--color-ink)]"
                  : "text-[var(--color-ink-muted)]",
              )}
            >
              {r.title}
            </span>
            <span className="ml-auto text-[var(--color-ink-faint)]">
              {r.role}
            </span>
          </li>
        ))}
      </ul>
      {reinforcing && unlocks.length > 0 ? (
        <p className="mt-2 text-[11px] leading-relaxed text-[var(--color-accent)]">
          Lumen is reinforcing this concept — {unlocks[0].title} builds directly
          on it.
        </p>
      ) : null}
    </div>
  );
}

function Marker({
  kind,
  band,
}: {
  kind: "done" | "current" | "pending" | "warn";
  band: string;
}) {
  if (kind === "done") {
    return (
      <span
        className="grid size-3.5 place-items-center rounded-full text-white"
        style={{ backgroundColor: "var(--color-positive)" }}
        aria-hidden
      >
        <svg viewBox="0 0 10 10" className="size-2">
          <path
            d="M2 5l2 2 4-4.5"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
      </span>
    );
  }
  if (kind === "warn") {
    return (
      <span
        className="size-3.5 rounded-full border-2"
        style={{ borderColor: "var(--color-warning)" }}
        aria-hidden
      />
    );
  }
  if (kind === "current") {
    return (
      <span
        className="grid size-3.5 place-items-center rounded-full border-2"
        style={{ borderColor: "var(--color-accent)" }}
        aria-hidden
      >
        <span className="size-1.5 rounded-full bg-[var(--color-accent)]" />
      </span>
    );
  }
  return (
    <span
      className="size-3.5 rounded-full border-2 border-[var(--color-border-strong)]"
      style={{ borderColor: band }}
      aria-hidden
    />
  );
}

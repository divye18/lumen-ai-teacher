"use client";

import { MasteryMeter } from "@/components/ui/mastery-meter";
import { LinkButton } from "@/components/ui/button";
import type { KnowledgeGraphNode, KnowledgeGraphView } from "@/lib/graph";
import { cn } from "@/lib/ui/cn";

const BAND_TOKEN: Record<string, string> = {
  "not-understood": "var(--color-band-unknown)",
  emerging: "var(--color-band-emerging)",
  developing: "var(--color-band-developing)",
  proficient: "var(--color-band-proficient)",
  strong: "var(--color-band-strong)",
};

function recommendedAction(node: KnowledgeGraphNode): string {
  if (node.misconceptionCount > 0) {
    return "Work through a concrete example, then re-check with an application question.";
  }
  if (!node.assessed)
    return "Not assessed yet — start a lesson to gauge where you stand.";
  if (node.masteryPoints >= 86) return "Mastered. Ready to build on this.";
  if (node.masteryPoints >= 71)
    return "Strong — a harder application question will confirm it.";
  if (node.masteryPoints >= 51)
    return "Developing — a couple more application questions should solidify it.";
  if (node.masteryPoints >= 31)
    return "Emerging — Lumen will explain again and check with a guided question.";
  return "Needs attention — Lumen will re-teach this from the ground up.";
}

/**
 * The concept detail panel. Everything shown is real data from the graph node.
 * Used by both the desktop graph and the mobile pathway.
 */
export function ConceptInspector({
  node,
  graph,
  onSelectConcept,
  onClose,
}: {
  node: KnowledgeGraphNode;
  graph: KnowledgeGraphView;
  onSelectConcept?: (nodeId: string) => void;
  onClose?: () => void;
}) {
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const prerequisites = graph.edges
    .filter((e) => e.type === "PREREQUISITE" && e.target === node.id)
    .map((e) => nodeById.get(e.source))
    .filter((n): n is KnowledgeGraphNode => Boolean(n));
  const unlocks = graph.edges
    .filter((e) => e.type === "PREREQUISITE" && e.source === node.id)
    .map((e) => nodeById.get(e.target))
    .filter((n): n is KnowledgeGraphNode => Boolean(n));
  const related = graph.edges
    .filter(
      (e) =>
        (e.type === "RELATED" || e.type === "CONTRASTS_WITH") &&
        (e.source === node.id || e.target === node.id),
    )
    .map((e) => nodeById.get(e.source === node.id ? e.target : e.source))
    .filter((n): n is KnowledgeGraphNode => Boolean(n));

  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-canvas)] p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold tracking-wider text-[var(--color-ink-faint)] uppercase">
            Concept
          </p>
          <h3 className="mt-1 text-[15px] font-semibold tracking-tight">
            {node.title}
          </h3>
          {node.description ? (
            <p className="mt-1 text-[12px] leading-relaxed text-[var(--color-ink-muted)]">
              {node.description}
            </p>
          ) : null}
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close concept detail"
            className="-mt-1 -mr-1 grid size-7 shrink-0 place-items-center rounded-[var(--radius-sm)] text-[var(--color-ink-faint)] hover:bg-[var(--color-subtle)]"
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
        ) : null}
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-1.5 text-[10px] font-medium tracking-wide text-[var(--color-ink-faint)] uppercase">
            Mastery
          </p>
          <MasteryMeter
            value={node.assessed ? node.masteryPoints : 0}
            size="sm"
          />
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
          <div>
            <dt className="text-[var(--color-ink-faint)]">Confidence</dt>
            <dd className="font-medium">
              {node.assessed ? `${node.confidence}%` : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--color-ink-faint)]">Status</dt>
            <dd className="font-medium">
              <span
                className="inline-flex items-center gap-1"
                style={{ color: BAND_TOKEN[node.bandId] }}
              >
                <span className="size-1.5 rounded-full bg-current" />
                {node.masteryBand}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-[var(--color-ink-faint)]">Attempts</dt>
            <dd className="font-medium">{node.attempts}</dd>
          </div>
          <div>
            <dt className="text-[var(--color-ink-faint)]">Importance</dt>
            <dd className="font-medium">
              {Math.round(node.importance * 100)}%
            </dd>
          </div>
        </dl>
      </div>

      {node.misconceptions.length > 0 ? (
        <div className="mt-4 rounded-[var(--radius-sm)] border border-[color-mix(in_oklab,var(--color-warning)_30%,transparent)] bg-[color-mix(in_oklab,var(--color-warning)_7%,transparent)] p-3">
          <p className="text-[10px] font-semibold tracking-wider text-[var(--color-warning)] uppercase">
            Misconception detected
          </p>
          {node.misconceptions.slice(0, 2).map((m) => (
            <div key={m.id} className="mt-1.5 text-[12px]">
              <p className="text-[var(--color-ink)]">{m.description}</p>
              <p className="mt-0.5 text-[11px] text-[var(--color-ink-faint)]">
                {m.category} · seen {m.detections}×
              </p>
            </div>
          ))}
          <p className="mt-2 text-[11px] text-[var(--color-ink-muted)]">
            Recommended response: worked example + application question.
          </p>
        </div>
      ) : null}

      {(prerequisites.length > 0 ||
        unlocks.length > 0 ||
        related.length > 0) && (
        <div className="mt-4 space-y-2 text-[12px]">
          {prerequisites.length > 0 ? (
            <ChipRow
              label="Prerequisites"
              nodes={prerequisites}
              onSelect={onSelectConcept}
            />
          ) : null}
          {unlocks.length > 0 ? (
            <ChipRow
              label="Unlocks"
              nodes={unlocks}
              onSelect={onSelectConcept}
            />
          ) : null}
          {related.length > 0 ? (
            <ChipRow
              label="Related"
              nodes={related}
              onSelect={onSelectConcept}
            />
          ) : null}
        </div>
      )}

      {node.sourceDocumentTitle ? (
        <div className="mt-4 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
          <p className="text-[10px] font-medium tracking-wide text-[var(--color-ink-faint)] uppercase">
            Source
          </p>
          <p className="mt-1 text-[12px] text-[var(--color-ink)]">
            {node.sourceDocumentTitle}
            {node.sourcePages.length > 0
              ? ` · ${node.sourcePages.length === 1 ? "Page" : "Pages"} ${formatPages(node.sourcePages)}`
              : ""}
          </p>
        </div>
      ) : null}

      <div className="mt-4 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
        <p className="text-[10px] font-medium tracking-wide text-[var(--color-ink-faint)] uppercase">
          Recommended action
        </p>
        <p className="mt-1 text-[13px] leading-relaxed text-[var(--color-ink)]">
          {recommendedAction(node)}
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {node.lessonId ? (
          <LinkButton
            href={`/studio/plan/${node.lessonId}`}
            variant="secondary"
            size="sm"
          >
            Open lesson
          </LinkButton>
        ) : null}
        <LinkButton
          href={`/studio/plan?topic=${encodeURIComponent(node.title)}`}
          variant="ghost"
          size="sm"
        >
          Focus a lesson on this
        </LinkButton>
      </div>
    </div>
  );
}

function ChipRow({
  label,
  nodes,
  onSelect,
}: {
  label: string;
  nodes: KnowledgeGraphNode[];
  onSelect?: (nodeId: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] font-medium tracking-wide text-[var(--color-ink-faint)] uppercase">
        {label}
      </span>
      {nodes.map((n) => (
        <button
          key={n.id}
          type="button"
          onClick={onSelect ? () => onSelect(n.id) : undefined}
          className={cn(
            "rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-0.5 text-[11px]",
            onSelect && "hover:border-[var(--color-border-strong)]",
          )}
        >
          {n.title}
          {n.assessed ? (
            <span className="ml-1 text-[var(--color-ink-faint)] tabular-nums">
              {n.masteryPoints}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

function formatPages(pages: number[]): string {
  if (pages.length === 0) return "";
  const sorted = [...pages].sort((a, b) => a - b);
  const ranges: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (let i = 1; i <= sorted.length; i += 1) {
    if (i < sorted.length && sorted[i] === prev + 1) {
      prev = sorted[i];
      continue;
    }
    ranges.push(start === prev ? `${start}` : `${start}–${prev}`);
    if (i < sorted.length) {
      start = sorted[i];
      prev = sorted[i];
    }
  }
  return ranges.join(", ");
}

export { BAND_TOKEN, formatPages };

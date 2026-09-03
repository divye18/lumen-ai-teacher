"use client";

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { useReducedMotion } from "framer-motion";

import type { KnowledgeGraphView } from "@/lib/graph";
import { cn } from "@/lib/ui/cn";

import { BAND_TOKEN } from "./concept-inspector";

/**
 * Deterministic layered knowledge-graph renderer. Pure SVG, no physics: node
 * positions come from `layoutGraph` on the server, so the same graph always
 * draws the same way. Readability first — dense graphs progressively drop the
 * non-structural edges and distant labels.
 */

const VIEW_W = 1000;
const VIEW_H = 620;
const PAD_X = 90;
const PAD_Y = 60;
const MIN_R = 13;
const MAX_R = 30;

interface Placed {
  id: string;
  cx: number;
  cy: number;
  r: number;
}

export function KnowledgeGraph({
  graph,
  selectedId,
  onSelect,
  className,
}: {
  graph: KnowledgeGraphView;
  selectedId: string | null;
  onSelect: (nodeId: string | null) => void;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const [view, setView] = useState({ k: 1, x: 0, y: 0 });
  const [hoverEdge, setHoverEdge] = useState<string | null>(null);
  const dragState = useRef<{
    startX: number;
    startY: number;
    ox: number;
    oy: number;
    moved: boolean;
  } | null>(null);

  const placed = useMemo(() => {
    const map = new Map<string, Placed>();
    const maxImportance = Math.max(
      0.001,
      ...graph.nodes.map((n) => n.importance),
    );
    for (const n of graph.nodes) {
      map.set(n.id, {
        id: n.id,
        cx: PAD_X + n.x * (VIEW_W - 2 * PAD_X),
        cy: PAD_Y + n.y * (VIEW_H - 2 * PAD_Y),
        r: MIN_R + (MAX_R - MIN_R) * Math.sqrt(n.importance / maxImportance),
      });
    }
    return map;
  }, [graph.nodes]);

  const dense = graph.nodes.length > 16;
  const veryDense = graph.nodes.length > 28;

  const neighbours = useMemo(() => {
    if (!selectedId) return new Set<string>();
    const set = new Set<string>([selectedId]);
    for (const e of graph.edges) {
      if (e.source === selectedId) set.add(e.target);
      if (e.target === selectedId) set.add(e.source);
    }
    return set;
  }, [selectedId, graph.edges]);

  const visibleEdges = graph.edges.filter((e) => {
    if (!dense || !e.ordering) {
      // non-ordering edges hidden in dense graphs unless they touch selection
      if (dense && !e.ordering) {
        return selectedId
          ? e.source === selectedId || e.target === selectedId
          : false;
      }
      return true;
    }
    return true;
  });

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragState.current = {
      startX: e.clientX,
      startY: e.clientY,
      ox: view.x,
      oy: view.y,
      moved: false,
    };
  };
  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const d = dragState.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
    setView((v) => ({ ...v, x: d.ox + dx, y: d.oy + dy }));
  };
  const onPointerUp = () => {
    dragState.current = null;
  };
  const onWheel = useCallback((e: ReactWheelEvent<SVGSVGElement>) => {
    setView((v) => {
      const k = Math.min(
        2.4,
        Math.max(0.55, v.k * (e.deltaY < 0 ? 1.12 : 0.9)),
      );
      return { ...v, k };
    });
  }, []);

  function handleNodeClick(id: string) {
    if (dragState.current?.moved) return;
    onSelect(id === selectedId ? null : id);
  }

  if (graph.nodes.length === 0) return null;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-canvas)]",
        className,
      )}
    >
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="h-[420px] w-full touch-none select-none sm:h-[520px]"
        role="img"
        aria-label={`Knowledge graph: ${graph.nodes.length} concepts, ${graph.edges.length} relationships`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onWheel={onWheel}
      >
        <defs>
          <marker
            id="lumen-arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M0 0L10 5L0 10z" fill="var(--color-border-strong)" />
          </marker>
        </defs>

        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          {visibleEdges.map((edge) => {
            const s = placed.get(edge.source);
            const t = placed.get(edge.target);
            if (!s || !t) return null;
            const dim =
              selectedId != null &&
              !(edge.source === selectedId || edge.target === selectedId);
            const angle = Math.atan2(t.cy - s.cy, t.cx - s.cx);
            const x1 = s.cx + Math.cos(angle) * s.r;
            const y1 = s.cy + Math.sin(angle) * s.r;
            const x2 = t.cx - Math.cos(angle) * (t.r + (edge.ordering ? 6 : 0));
            const y2 = t.cy - Math.sin(angle) * (t.r + (edge.ordering ? 6 : 0));
            return (
              <g
                key={edge.id}
                onMouseEnter={() => setHoverEdge(edge.id)}
                onMouseLeave={() => setHoverEdge(null)}
              >
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={
                    dim ? "var(--color-border)" : "var(--color-border-strong)"
                  }
                  strokeWidth={edge.ordering ? 1.6 : 1.1}
                  strokeDasharray={edge.ordering ? undefined : "4 4"}
                  markerEnd={edge.ordering ? "url(#lumen-arrow)" : undefined}
                  opacity={dim ? 0.4 : 1}
                />
                {hoverEdge === edge.id && !veryDense ? (
                  <text
                    x={(x1 + x2) / 2}
                    y={(y1 + y2) / 2 - 4}
                    textAnchor="middle"
                    className="fill-[var(--color-ink-muted)] text-[9px]"
                  >
                    {edge.label}
                  </text>
                ) : null}
              </g>
            );
          })}

          {graph.nodes.map((n) => {
            const p = placed.get(n.id)!;
            const isSelected = n.id === selectedId;
            const dimmed =
              selectedId != null && !neighbours.has(n.id) && !isSelected;
            const band = BAND_TOKEN[n.bandId] ?? "var(--color-band-unknown)";
            const showLabel =
              !veryDense ||
              isSelected ||
              neighbours.has(n.id) ||
              n.importance >= 0.55 ||
              n.isCurrent;
            return (
              <g
                key={n.id}
                transform={`translate(${p.cx} ${p.cy})`}
                className="cursor-pointer"
                opacity={dimmed ? 0.35 : 1}
                onClick={() => handleNodeClick(n.id)}
                role="button"
                aria-pressed={isSelected}
                aria-label={`${n.title}, ${n.assessed ? `mastery ${n.masteryPoints} of 100` : "not assessed"}`}
              >
                {n.isCurrent ? (
                  <circle
                    r={p.r + 7}
                    fill="none"
                    stroke="var(--color-accent)"
                    strokeWidth={1.5}
                    opacity={0.7}
                  >
                    {!reduce ? (
                      <animate
                        attributeName="r"
                        values={`${p.r + 5};${p.r + 11};${p.r + 5}`}
                        dur="2.4s"
                        repeatCount="indefinite"
                      />
                    ) : null}
                  </circle>
                ) : null}
                {n.misconceptionCount > 0 ? (
                  <circle
                    r={p.r + 4}
                    fill="none"
                    stroke="var(--color-warning)"
                    strokeWidth={1.5}
                    strokeDasharray="3 3"
                  />
                ) : null}
                <circle
                  r={p.r}
                  fill={
                    n.assessed
                      ? `color-mix(in oklab, ${band} 22%, var(--color-surface))`
                      : "var(--color-surface)"
                  }
                  stroke={isSelected ? "var(--color-accent)" : band}
                  strokeWidth={isSelected ? 3 : 1.75}
                />
                {n.assessed ? (
                  <text
                    textAnchor="middle"
                    dominantBaseline="central"
                    className="fill-[var(--color-ink)] text-[10px] font-semibold"
                  >
                    {n.masteryPoints}
                  </text>
                ) : null}
                {showLabel ? (
                  <text
                    y={p.r + 13}
                    textAnchor="middle"
                    className={cn(
                      "text-[10px]",
                      isSelected || n.isCurrent
                        ? "fill-[var(--color-ink)] font-medium"
                        : "fill-[var(--color-ink-muted)]",
                    )}
                  >
                    {n.title.length > 22 ? `${n.title.slice(0, 21)}…` : n.title}
                  </text>
                ) : null}
              </g>
            );
          })}
        </g>
      </svg>

      <div className="pointer-events-none absolute right-3 bottom-3 flex flex-wrap justify-end gap-2 text-[10px] text-[var(--color-ink-faint)]">
        {(
          [
            ["not-understood", "Needs work"],
            ["developing", "Developing"],
            ["strong", "Mastered"],
          ] as const
        ).map(([id, label]) => (
          <span key={id} className="inline-flex items-center gap-1">
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: BAND_TOKEN[id] }}
            />
            {label}
          </span>
        ))}
      </div>

      <div className="pointer-events-none absolute top-3 left-3 text-[10px] text-[var(--color-ink-faint)]">
        Scroll to zoom · drag to pan
      </div>

      {view.k !== 1 || view.x !== 0 || view.y !== 0 ? (
        <button
          type="button"
          onClick={() => setView({ k: 1, x: 0, y: 0 })}
          className="absolute top-2.5 right-2.5 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[11px] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
        >
          Reset view
        </button>
      ) : null}
    </div>
  );
}

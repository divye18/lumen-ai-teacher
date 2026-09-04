"use client";

import { motion, useReducedMotion } from "framer-motion";

import type { VisualDirective } from "@/lib/visuals";
import { cn } from "@/lib/ui/cn";

/**
 * 2D visual-directive renderers. Each takes an already-validated slice of a
 * `VisualDirective` — no parsing, no model output. Restrained, typographic,
 * with just enough motion to draw the eye to what the teacher is explaining.
 */

const cardIn = (reduce: boolean | null, i = 0) => ({
  initial: reduce ? false : { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { delay: reduce ? 0 : 0.05 + i * 0.06, duration: 0.3 },
});

export function TextVisual({ caption }: { caption: string }) {
  return (
    <p className="text-[14px] leading-relaxed text-[var(--color-ink)]">
      {caption}
    </p>
  );
}

export function ComparisonVisual({
  data,
}: {
  data: Extract<VisualDirective, { mode: "COMPARISON" }>["comparison"];
}) {
  const reduce = useReducedMotion();
  return (
    <div>
      <p className="text-[13px] font-semibold tracking-tight text-[var(--color-ink)]">
        {data.title}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        {[data.left, data.right].map((col, ci) => (
          <motion.div
            key={col.title}
            {...cardIn(reduce, ci)}
            className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
          >
            <p className="text-[11px] font-semibold tracking-wide text-[var(--color-accent)] uppercase">
              {col.title}
            </p>
            <ul className="mt-2 flex flex-col gap-1.5">
              {col.points.map((p, i) => (
                <li
                  key={p}
                  className="flex gap-2 text-[12px] leading-snug text-[var(--color-ink-muted)]"
                >
                  <span className="mt-1.5 size-1 shrink-0 rounded-full bg-[var(--color-ink-faint)]" />
                  {data.rows[i] ? (
                    <span>
                      <span className="text-[var(--color-ink-faint)]">
                        {data.rows[i]}:{" "}
                      </span>
                      {p}
                    </span>
                  ) : (
                    p
                  )}
                </li>
              ))}
            </ul>
          </motion.div>
        ))}
      </div>
      {data.highlight ? (
        <p className="mt-3 text-[12px] text-[var(--color-ink-muted)]">
          The dimension that matters most here:{" "}
          <span className="font-medium text-[var(--color-ink)]">
            {data.highlight}
          </span>
          .
        </p>
      ) : null}
    </div>
  );
}

export function FormulaVisual({
  data,
}: {
  data: Extract<VisualDirective, { mode: "FORMULA" }>["formula"];
}) {
  return (
    <div>
      <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-canvas)] px-4 py-5 text-center">
        <p className="font-mono text-[15px] tracking-tight text-[var(--color-ink)] sm:text-[17px]">
          {data.expression}
        </p>
      </div>
      {data.terms.length > 0 ? (
        <dl className="mt-3 grid gap-x-4 gap-y-1.5 text-[12px] sm:grid-cols-2">
          {data.terms.map((t) => (
            <div key={t.symbol} className="flex gap-2">
              <dt className="shrink-0 font-mono font-medium text-[var(--color-accent)]">
                {t.symbol}
              </dt>
              <dd className="text-[var(--color-ink-muted)]">{t.meaning}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {data.example.length > 0 ? (
        <div className="mt-3 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
          <p className="text-[10px] font-semibold tracking-wide text-[var(--color-ink-faint)] uppercase">
            Worked example
          </p>
          <ul className="mt-1.5 flex flex-col gap-1 font-mono text-[12px] text-[var(--color-ink-muted)]">
            {data.example.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function TimelineVisual({
  data,
}: {
  data: Extract<VisualDirective, { mode: "TIMELINE" }>["timeline"];
}) {
  const reduce = useReducedMotion();
  return (
    <div>
      {data.title ? (
        <p className="text-[13px] font-semibold tracking-tight text-[var(--color-ink)]">
          {data.title}
        </p>
      ) : null}
      <ol className="mt-3 flex flex-col">
        {data.events.map((e, i) => (
          <motion.li
            key={e.label + i}
            {...cardIn(reduce, i)}
            className="flex gap-3"
          >
            <div className="flex flex-col items-center">
              <span className="grid size-5 shrink-0 place-items-center rounded-full border border-[var(--color-accent)] text-[10px] font-semibold text-[var(--color-accent)] tabular-nums">
                {i + 1}
              </span>
              {i < data.events.length - 1 ? (
                <span className="my-1 w-px flex-1 bg-[var(--color-border)]" />
              ) : null}
            </div>
            <div className="pb-3">
              <p className="text-[13px] font-medium text-[var(--color-ink)]">
                {e.label}
              </p>
              {e.detail ? (
                <p className="mt-0.5 text-[12px] leading-snug text-[var(--color-ink-muted)]">
                  {e.detail}
                </p>
              ) : null}
            </div>
          </motion.li>
        ))}
      </ol>
    </div>
  );
}

export function DiagramVisual({
  data,
}: {
  data: Extract<VisualDirective, { mode: "DIAGRAM" }>["diagram"];
}) {
  const reduce = useReducedMotion();
  const outgoing = new Map<string, string[]>();
  for (const e of data.edges) {
    outgoing.set(e.from, [...(outgoing.get(e.from) ?? []), e.to]);
  }
  return (
    <div className="flex flex-col gap-2">
      {data.nodes.map((n, i) => {
        const next = data.nodes[i + 1];
        const linked = next && outgoing.get(n.key)?.includes(next.key);
        const edge = data.edges.find(
          (e) => e.from === n.key && e.to === next?.key,
        );
        return (
          <div key={n.key}>
            <motion.div
              {...cardIn(reduce, i)}
              className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-[13px] leading-snug text-[var(--color-ink)]"
            >
              {n.text}
            </motion.div>
            {linked ? (
              <div className="flex items-center gap-2 py-1 pl-3 text-[var(--color-ink-faint)]">
                <svg viewBox="0 0 12 16" className="h-3.5 w-3" aria-hidden>
                  <path
                    d="M6 1v11m0 0-3-3m3 3 3-3"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                </svg>
                {edge?.text ? (
                  <span className="text-[11px]">{edge.text}</span>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function ConceptMapVisual({
  data,
}: {
  data: Extract<VisualDirective, { mode: "CONCEPT_MAP" }>["conceptMap"];
}) {
  const reduce = useReducedMotion();
  return (
    <div>
      <div className="inline-flex rounded-full border border-[var(--color-accent)] bg-[var(--color-accent-soft)] px-3 py-1 text-[12px] font-semibold text-[var(--color-accent)]">
        {data.root}
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {data.branches.map((b, i) => (
          <motion.div
            key={b.label + i}
            {...cardIn(reduce, i)}
            className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
          >
            <p className="text-[12px] font-medium text-[var(--color-ink)]">
              {b.relation ? (
                <span className="text-[var(--color-ink-faint)]">
                  {b.relation} ·{" "}
                </span>
              ) : null}
              {b.label}
            </p>
            {b.children.length > 0 ? (
              <ul className="mt-1.5 flex flex-wrap gap-1">
                {b.children.map((c) => (
                  <li
                    key={c}
                    className="rounded-full border border-[var(--color-border)] bg-[var(--color-canvas)] px-2 py-0.5 text-[11px] text-[var(--color-ink-muted)]"
                  >
                    {c}
                  </li>
                ))}
              </ul>
            ) : null}
          </motion.div>
        ))}
      </div>
    </div>
  );
}

export function ChartVisual({
  data,
}: {
  data: Extract<VisualDirective, { mode: "CHART" }>["chart"];
}) {
  const all = data.series.flatMap((s) => s.points);
  const xs = all.map((p) => p.x);
  const ys = all.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(0, ...ys);
  const maxY = Math.max(...ys);
  const W = 320;
  const H = 160;
  const sx = (x: number) =>
    maxX === minX ? W / 2 : ((x - minX) / (maxX - minX)) * W;
  const sy = (y: number) =>
    maxY === minY ? H / 2 : H - ((y - minY) / (maxY - minY)) * H;
  return (
    <div>
      {data.title ? (
        <p className="text-[13px] font-semibold text-[var(--color-ink)]">
          {data.title}
        </p>
      ) : null}
      <svg
        viewBox={`-8 -8 ${W + 16} ${H + 24}`}
        className="mt-2 w-full"
        role="img"
        aria-label={data.title ?? "chart"}
      >
        {data.series.map((s, i) => (
          <polyline
            key={s.name}
            points={s.points.map((p) => `${sx(p.x)},${sy(p.y)}`).join(" ")}
            fill="none"
            stroke={i === 0 ? "var(--color-accent)" : "var(--color-ink-faint)"}
            strokeWidth="1.75"
          />
        ))}
      </svg>
    </div>
  );
}

export function CodeVisual({
  data,
}: {
  data: Extract<
    VisualDirective,
    { mode: "CODE_VISUALIZATION" }
  >["codeVisualization"];
}) {
  const highlight = new Set(data.highlightLines);
  return (
    <pre className="overflow-x-auto rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-canvas)] p-3 text-[12px] leading-relaxed">
      <code>
        {data.code.split("\n").map((line, i) => (
          <div
            key={i}
            className={cn(
              "px-1",
              highlight.has(i + 1) &&
                "bg-[var(--color-accent-soft)] text-[var(--color-ink)]",
            )}
          >
            <span className="mr-3 inline-block w-6 text-right text-[var(--color-ink-faint)] select-none">
              {i + 1}
            </span>
            {line || " "}
          </div>
        ))}
      </code>
    </pre>
  );
}

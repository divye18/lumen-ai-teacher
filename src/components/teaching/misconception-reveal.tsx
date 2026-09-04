"use client";

import { motion, useReducedMotion } from "framer-motion";

import type { MisconceptionDetailView } from "@/lib/session/views";
import { cn } from "@/lib/ui/cn";

/**
 * "LUMEN NOTICED A PATTERN" — the misconception reveal.
 *
 * Every value is real: the learner-facing label + explanation, when it was
 * first seen, how many times it's recurred, its severity and status, and what
 * Lumen is doing about it. The internal taxonomy id is never shown. When the
 * misconception is recurring, the RETEACH → RECHECK response is made explicit.
 */
export function MisconceptionReveal({
  misconception,
  className,
}: {
  misconception: MisconceptionDetailView;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const m = misconception;
  const recurring = m.detectionCount >= 2 || m.isRecurrence;

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={cn(
        "rounded-[var(--radius-md)] border p-4",
        "border-[color-mix(in_oklab,var(--color-warning)_35%,transparent)] bg-[color-mix(in_oklab,var(--color-warning)_7%,transparent)]",
        className,
      )}
    >
      <div className="flex items-center gap-1.5 text-[10px] font-semibold tracking-wider text-[var(--color-warning)] uppercase">
        <PatternGlyph pulse={!reduce} />
        {recurring
          ? "Lumen has seen this pattern before"
          : "Lumen noticed a pattern"}
      </div>

      <p className="mt-2 text-[13px] font-medium text-[var(--color-ink)]">
        {m.label}
      </p>
      <p className="mt-1 text-[12px] leading-relaxed text-[var(--color-ink-muted)]">
        {m.explanation}
      </p>

      <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
        <Fact label="First noticed" value={relativeDay(m.firstDetectedAtISO)} />
        <Fact
          label="Seen"
          value={
            m.detectionCount === 1
              ? "once"
              : m.detectionCount === 2
                ? "twice"
                : `${m.detectionCount}×`
          }
        />
        <Fact label="Severity" value={titleCase(m.severity)} />
        <Fact label="Status" value={statusLabel(m.status)} />
      </dl>

      <div className="mt-3 border-t border-[color-mix(in_oklab,var(--color-warning)_25%,transparent)] pt-2.5">
        <p className="text-[11px] leading-snug text-[var(--color-ink)]">
          {m.remediation}
        </p>
        {recurring ? (
          <div className="mt-2 flex items-center gap-2">
            {["Re-teach", "Re-check"].map((step, i) => (
              <motion.span
                key={step}
                initial={reduce ? false : { opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: reduce ? 0 : 0.15 + i * 0.2 }}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
                  i === 0
                    ? "border-[var(--color-warning)] text-[var(--color-warning)]"
                    : "border-[var(--color-border-strong)] text-[var(--color-ink-muted)]",
                )}
              >
                {i > 0 ? <span aria-hidden>→</span> : null}
                {step}
              </motion.span>
            ))}
          </div>
        ) : null}
      </div>
    </motion.div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-1">
      <dt className="text-[var(--color-ink-faint)]">{label}</dt>
      <dd className="font-medium text-[var(--color-ink)]">{value}</dd>
    </div>
  );
}

function PatternGlyph({ pulse }: { pulse: boolean }) {
  return (
    <span className="relative grid size-2.5 place-items-center">
      {pulse ? (
        <motion.span
          className="absolute inset-0 rounded-full bg-[var(--color-warning)]"
          animate={{ scale: [1, 2], opacity: [0.5, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
      ) : null}
      <span className="size-1.5 rounded-full bg-[var(--color-warning)]" />
    </span>
  );
}

function relativeDay(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "this session";
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return "this session";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return `${Math.floor(days / 7)} week${days < 14 ? "" : "s"} ago`;
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function statusLabel(status: string): string {
  switch (status.toUpperCase()) {
    case "RESOLVED":
      return "Resolved";
    case "ADDRESSED":
      return "Being addressed";
    default:
      return "Active";
  }
}

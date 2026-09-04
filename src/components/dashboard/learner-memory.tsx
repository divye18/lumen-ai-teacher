import { Panel, SectionHeading } from "@/components/ui/surface";
import type { LearnerMemoryView } from "@/lib/studio/overview";
import { LumenMark } from "@/components/ui/lumen-mark";

/**
 * "WHAT LUMEN HAS LEARNED" — the adaptive teacher memory, learner-facing.
 *
 * A compact, evidence-backed read of how this learner learns, plus one line on
 * how it currently shapes teaching. Deterministically derived; renders nothing
 * without enough evidence. Not a wall of analytics — at most three signals.
 */
export function LearnerMemory({
  memory,
  intelligenceInsight = null,
}: {
  memory: LearnerMemoryView | null;
  /** 7.4 — one compact real-time-intelligence trajectory line. */
  intelligenceInsight?: string | null;
}) {
  const hasSignals = Boolean(memory && memory.signals.length > 0);
  if (!hasSignals && !intelligenceInsight) return null;

  if (!memory || !hasSignals) {
    return (
      <Panel inset>
        <SectionHeading title="What Lumen has learned about how you learn" />
        <p className="mt-4 text-[13px] leading-relaxed text-[var(--color-ink)]">
          {intelligenceInsight}
        </p>
      </Panel>
    );
  }

  return (
    <Panel inset>
      <SectionHeading
        title="What Lumen has learned about how you learn"
        hint={`From your last ${memory.computedFrom} answers — carried across sessions`}
      />
      {intelligenceInsight ? (
        <p className="mt-4 text-[13px] leading-relaxed font-medium text-[var(--color-ink)]">
          {intelligenceInsight}
        </p>
      ) : null}
      <ul className="mt-5 space-y-3">
        {memory.signals.map((s) => (
          <li key={s.text} className="flex gap-3">
            <span className="mt-0.5 text-[var(--color-accent)]">
              <LumenMark className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-[13px] leading-relaxed text-[var(--color-ink)]">
                {s.text}
              </p>
              <p className="mt-0.5 text-[11px] text-[var(--color-ink-faint)]">
                {s.evidence}
              </p>
            </div>
          </li>
        ))}
      </ul>
      {memory.personalizationNote ? (
        <p className="mt-4 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[12px] leading-snug text-[var(--color-accent)]">
          {memory.personalizationNote}
        </p>
      ) : null}
    </Panel>
  );
}

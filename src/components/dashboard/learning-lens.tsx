import { Panel, SectionHeading } from "@/components/ui/surface";
import type { Observation } from "@/lib/studio/observations";
import { LumenMark } from "@/components/ui/lumen-mark";

/**
 * "HOW LUMEN SEES YOUR LEARNING" — only evidence-backed observations, each with
 * a concrete evidence line. Renders nothing when there is not enough data.
 */
export function LearningLens({
  observations,
}: {
  observations: Observation[];
}) {
  if (observations.length === 0) return null;

  return (
    <Panel inset>
      <SectionHeading
        title="How Lumen sees your learning"
        hint="Patterns Lumen has evidence for — nothing invented"
      />
      <ul className="mt-5 space-y-3">
        {observations.map((o) => (
          <li key={o.id} className="flex gap-3">
            <span className="mt-0.5 text-[var(--color-accent)]">
              <LumenMark className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-[13px] leading-relaxed text-[var(--color-ink)]">
                {o.text}
              </p>
              <p className="mt-0.5 text-[11px] text-[var(--color-ink-faint)]">
                {o.evidence}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

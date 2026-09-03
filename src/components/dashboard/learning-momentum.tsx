import { Panel, SectionHeading } from "@/components/ui/surface";
import { EmptyState } from "@/components/ui/states";
import type { MomentumView } from "@/lib/studio/momentum";

export function LearningMomentum({ momentum }: { momentum: MomentumView }) {
  if (!momentum.hasActivity) {
    return (
      <Panel inset>
        <SectionHeading title="Learning momentum" />
        <EmptyState
          className="mt-4"
          title="Nothing to chart yet"
          description="Answer a few questions in a lesson and your last 7 days of progress will appear here — accuracy, remediation, concepts touched."
        />
      </Panel>
    );
  }

  const max = Math.max(1, ...momentum.daily.map((d) => d.answered));
  const trendCopy =
    momentum.trend === "up"
      ? "Accuracy trending up"
      : momentum.trend === "down"
        ? "Accuracy dipped recently"
        : momentum.trend === "flat"
          ? "Holding steady"
          : null;

  return (
    <Panel inset>
      <SectionHeading title="Learning momentum" hint="Last 7 days" />

      <div className="mt-5 grid grid-cols-3 gap-4">
        <Metric
          label="Answered"
          value={String(momentum.answered7d)}
          sub={
            momentum.accuracy7d !== null
              ? `${Math.round(momentum.accuracy7d * 100)}% correct`
              : undefined
          }
        />
        <Metric
          label="Remediations"
          value={String(momentum.remediations7d)}
          sub="strategy switches"
        />
        <Metric
          label="Sessions"
          value={String(momentum.sessions7d)}
          sub={`${momentum.conceptsAssessed} concepts tracked`}
        />
      </div>

      <div className="mt-6" aria-hidden>
        <div className="flex h-16 items-end gap-1.5">
          {momentum.daily.map((d) => {
            const h = (d.answered / max) * 100;
            const correctH = d.answered > 0 ? (d.correct / d.answered) * h : 0;
            return (
              <div
                key={d.date}
                className="relative flex-1 rounded-t-[3px] bg-[var(--color-subtle)]"
                style={{ height: `${Math.max(h, d.answered > 0 ? 8 : 3)}%` }}
                title={`${d.date}: ${d.correct}/${d.answered} correct`}
              >
                <div
                  className="absolute inset-x-0 bottom-0 rounded-t-[3px] bg-[var(--color-accent)]"
                  style={{ height: `${correctH}%` }}
                />
              </div>
            );
          })}
        </div>
        <div className="mt-1.5 flex justify-between text-[10px] text-[var(--color-ink-faint)]">
          <span>{formatDay(momentum.daily[0]?.date)}</span>
          <span>Today</span>
        </div>
      </div>

      {trendCopy ? (
        <p className="mt-4 text-[12px] text-[var(--color-ink-muted)]">
          {trendCopy}
        </p>
      ) : null}
    </Panel>
  );
}

function Metric({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div>
      <p className="text-[11px] font-medium tracking-wide text-[var(--color-ink-faint)] uppercase">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">
        {value}
      </p>
      {sub ? (
        <p className="mt-0.5 text-[11px] text-[var(--color-ink-muted)]">
          {sub}
        </p>
      ) : null}
    </div>
  );
}

function formatDay(iso?: string): string {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(undefined, { weekday: "short" });
}

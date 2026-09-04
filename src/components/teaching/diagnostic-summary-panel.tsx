import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LumenMark } from "@/components/ui/lumen-mark";
import { Panel, SectionHeading } from "@/components/ui/surface";
import type { StoredDiagnosticConceptRef } from "@/lib/session/diagnostic-flow";
import type { DiagnosticSummaryView } from "@/lib/session/diagnostic-summary";

/**
 * DIAGNOSTIC INTELLIGENCE SUMMARY — evidence-backed, shown once after a
 * diagnostic completes and before Teaching Room. Reuses the existing
 * `Panel`/`SectionHeading`/`Badge`/`LumenMark`/`Button` visual language (the
 * same primitives `LearningLens`/`MisconceptionRadar`/`RecommendedAction`
 * already use) — no new design system, no Studio/Teaching Room redesign.
 */

function ConceptGroup({
  label,
  tone,
  concepts,
}: {
  label: string;
  tone: "positive" | "warning";
  concepts: StoredDiagnosticConceptRef[];
}) {
  if (concepts.length === 0) return null;
  return (
    <div className="mt-4 first:mt-0">
      <p className="text-[11px] font-medium tracking-wide text-[var(--color-ink-faint)] uppercase">
        {label}
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {concepts.map((c) => (
          <Badge key={c.conceptKey} tone={tone}>
            {c.conceptTitle}
          </Badge>
        ))}
      </div>
    </div>
  );
}

export function DiagnosticSummaryPanel({
  summary,
  onContinue,
  continuing,
}: {
  summary: DiagnosticSummaryView;
  onContinue: () => void;
  continuing: boolean;
}) {
  const hasAnyConcepts =
    summary.strong.length > 0 ||
    summary.developing.length > 0 ||
    summary.weak.length > 0;

  return (
    <Panel inset>
      <div className="flex items-center gap-2 text-[var(--color-accent)]">
        <LumenMark className="size-4" />
        <span className="text-[11px] font-semibold tracking-wide uppercase">
          Diagnostic summary
        </span>
      </div>
      <h1 className="mt-3 text-xl font-semibold text-[var(--color-ink)]">
        Here&apos;s what I learned about you
      </h1>

      {hasAnyConcepts ? (
        <div className="mt-5">
          <ConceptGroup
            label="Strong"
            tone="positive"
            concepts={summary.strong}
          />
          <ConceptGroup
            label="Developing"
            tone="warning"
            concepts={summary.developing}
          />
          <ConceptGroup
            label="Needs more attention"
            tone="warning"
            concepts={summary.weak}
          />
        </div>
      ) : null}

      {summary.mostImportantGap ? (
        <div className="mt-5">
          <SectionHeading title="Key prerequisite" />
          <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--color-ink-muted)]">
            {summary.mostImportantGap.reason}
          </p>
        </div>
      ) : null}

      <div className="mt-5">
        <SectionHeading title="How I'll adapt" />
        <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--color-ink-muted)]">
          {summary.adaptationNote}
        </p>
      </div>

      <Button
        className="mt-6"
        size="lg"
        loading={continuing}
        onClick={onContinue}
      >
        Continue to Teaching Room
      </Button>
    </Panel>
  );
}

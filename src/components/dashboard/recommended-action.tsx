import { LinkButton } from "@/components/ui/button";
import { LumenMark } from "@/components/ui/lumen-mark";
import type { RecommendationView } from "@/lib/studio/recommendation";

export function RecommendedAction({
  recommendation,
}: {
  recommendation: RecommendationView;
}) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[color-mix(in_oklab,var(--color-accent)_25%,var(--color-border))] bg-[color-mix(in_oklab,var(--color-accent-soft)_60%,var(--color-surface))] p-5 sm:p-6">
      <div className="flex items-center gap-2 text-[var(--color-accent)]">
        <LumenMark className="size-4" />
        <span className="text-[11px] font-semibold tracking-wide uppercase">
          Recommended next
        </span>
      </div>
      <h2 className="mt-3 text-lg font-semibold tracking-tight text-[var(--color-ink)]">
        {recommendation.title}
      </h2>
      <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-[var(--color-ink-muted)]">
        {recommendation.reason}
      </p>
      <div className="mt-5">
        <LinkButton href={recommendation.href} size="lg">
          {recommendation.ctaLabel}
        </LinkButton>
      </div>
    </div>
  );
}

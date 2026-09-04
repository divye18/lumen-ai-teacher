import { LinkButton } from "@/components/ui/button";
import { LumenMark } from "@/components/ui/lumen-mark";

/**
 * Entry point to the multimodal Teaching Room demo — a curated, deterministic
 * lesson that runs with zero external providers.
 */
export function DemoCard() {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[color-mix(in_oklab,var(--color-accent)_22%,var(--color-border))] bg-[color-mix(in_oklab,var(--color-accent-soft)_45%,var(--color-surface))] p-5">
      <div className="flex items-center gap-2 text-[var(--color-accent)]">
        <LumenMark className="size-4" />
        <span className="text-[11px] font-semibold tracking-wide uppercase">
          Multimodal teaching room
        </span>
      </div>
      <h2 className="mt-2.5 text-[15px] font-semibold tracking-tight">
        See Lumen teach “How CPU cache memory works”
      </h2>
      <p className="mt-1 text-[13px] leading-relaxed text-[var(--color-ink-muted)]">
        Teacher presence, spoken explanation with captions, a 3D memory
        hierarchy you can step through, and the lesson adapting to your answers
        — all running without any external AI service.
      </p>
      <div className="mt-4">
        <LinkButton href="/studio/demo" size="lg">
          Start the demo
        </LinkButton>
      </div>
    </div>
  );
}

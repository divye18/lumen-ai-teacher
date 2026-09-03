import { LinkButton } from "@/components/ui/button";
import { LumenMark } from "@/components/ui/lumen-mark";

const STEPS = [
  {
    n: "01",
    title: "Add your material",
    body: "Upload lecture notes or a chapter. Lumen reads it page by page and builds a grounded knowledge base.",
  },
  {
    n: "02",
    title: "Get a personalised path",
    body: "Lumen breaks the topic into a concept chain — prerequisites first, then application, then scenarios.",
  },
  {
    n: "03",
    title: "Learn while Lumen adapts",
    body: "It teaches, asks, watches how you answer, updates what it knows about you, and changes the next step.",
  },
];

export function EmptyStudio({ name }: { name: string | null }) {
  return (
    <div className="mx-auto max-w-2xl py-8">
      <div className="flex items-center gap-2 text-[var(--color-accent)]">
        <LumenMark className="size-5" />
        <span className="text-[12px] font-semibold tracking-wide uppercase">
          Your learning studio is ready
        </span>
      </div>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">
        {name ? `Welcome, ${name.split(" ")[0]}.` : "Welcome to Lumen."}
      </h1>
      <p className="mt-2 max-w-lg text-[14px] leading-relaxed text-[var(--color-ink-muted)]">
        Lumen isn&apos;t a chatbot. It builds a model of what you understand and
        teaches against it — changing how it explains, what it asks, and when to
        go back a step.
      </p>

      <ol className="mt-8 flex flex-col gap-px overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)]">
        {STEPS.map((s) => (
          <li key={s.n} className="flex gap-4 bg-[var(--color-surface)] p-5">
            <span className="font-mono text-[12px] text-[var(--color-ink-faint)]">
              {s.n}
            </span>
            <div>
              <p className="text-[14px] font-medium text-[var(--color-ink)]">
                {s.title}
              </p>
              <p className="mt-1 text-[13px] leading-relaxed text-[var(--color-ink-muted)]">
                {s.body}
              </p>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-8 flex flex-wrap gap-3">
        <LinkButton href="/studio/knowledge" size="lg">
          Add your first material
        </LinkButton>
        <LinkButton href="/studio/plan" variant="secondary" size="lg">
          Or start from a topic
        </LinkButton>
      </div>
    </div>
  );
}

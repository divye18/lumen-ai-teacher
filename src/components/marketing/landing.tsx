import Link from "next/link";

import { LinkButton } from "@/components/ui/button";
import { LumenMark, LumenWordmark } from "@/components/ui/lumen-mark";
import { ThemeToggle } from "@/components/ui/theme";

const LAYERS = [
  {
    n: "01",
    title: "Your knowledge",
    body: "Upload your notes or a chapter. Lumen extracts every page and builds a grounded, searchable knowledge base — it teaches from your material, with citations, not a generic textbook.",
  },
  {
    n: "02",
    title: "A model of you",
    body: "As you answer, Lumen tracks mastery, confidence and the specific misconceptions behind your mistakes — a persistent picture of what you actually understand.",
  },
  {
    n: "03",
    title: "A teacher that adapts",
    body: "The next explanation, the next question, when to go back a step, when to push harder — every decision changes based on what you just did. Not a script. A tutor.",
  },
];

const ADAPT_EXAMPLE = [
  { label: "You answer a scenario question", tone: "neutral" },
  { label: "Reasoning is sound but a step is missing", tone: "neutral" },
  { label: "Confidence holds, mastery +6", tone: "positive" },
  { label: "Lumen asks a harder application", tone: "accent" },
];

export function Landing({ signedIn }: { signedIn: boolean }) {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-5 sm:px-8">
        <LumenWordmark />
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {signedIn ? (
            <LinkButton href="/studio" size="sm">
              Open studio
            </LinkButton>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-[var(--radius-sm)] px-3 py-1.5 text-[13px] font-medium text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
              >
                Sign in
              </Link>
              <LinkButton href="/signup" size="sm">
                Get started
              </LinkButton>
            </>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-5 sm:px-8">
        <section className="pt-16 pb-16 sm:pt-24">
          <p className="flex items-center gap-2 text-[12px] font-medium tracking-wide text-[var(--color-accent)] uppercase">
            <LumenMark className="size-4" />
            Adaptive AI teaching
          </p>
          <h1 className="mt-5 max-w-2xl text-4xl leading-[1.08] font-semibold tracking-tight sm:text-5xl">
            Don&apos;t just get the answer.{" "}
            <span className="text-[var(--color-ink-muted)]">
              Understand it.
            </span>
          </h1>
          <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-[var(--color-ink-muted)]">
            Most AI learning tools optimise the response. Lumen optimises the
            learning process — it builds a model of what you know and teaches
            against it, changing how it explains and what it asks until the
            concept lands.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <LinkButton href={signedIn ? "/studio" : "/signup"} size="lg">
              {signedIn ? "Open your studio" : "Start learning"}
            </LinkButton>
            {!signedIn ? (
              <LinkButton href="/login" variant="secondary" size="lg">
                I have an account
              </LinkButton>
            ) : null}
          </div>
        </section>

        <section className="border-t border-[var(--color-border)] py-16">
          <h2 className="text-[13px] font-semibold tracking-wide text-[var(--color-ink-faint)] uppercase">
            Three layers, working together
          </h2>
          <div className="mt-8 grid gap-px overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] sm:grid-cols-3">
            {LAYERS.map((l) => (
              <div key={l.n} className="bg-[var(--color-surface)] p-6">
                <span className="font-mono text-[12px] text-[var(--color-ink-faint)]">
                  {l.n}
                </span>
                <h3 className="mt-3 text-[15px] font-semibold tracking-tight">
                  {l.title}
                </h3>
                <p className="mt-2 text-[13px] leading-relaxed text-[var(--color-ink-muted)]">
                  {l.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t border-[var(--color-border)] py-16">
          <h2 className="text-[13px] font-semibold tracking-wide text-[var(--color-ink-faint)] uppercase">
            The lesson changes because of you
          </h2>
          <div className="mt-8 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
            <ol className="flex flex-col gap-3">
              {ADAPT_EXAMPLE.map((s, i) => (
                <li key={s.label} className="flex items-center gap-3">
                  <span
                    className="grid size-5 shrink-0 place-items-center rounded-full border text-[10px] font-medium tabular-nums"
                    style={{
                      borderColor:
                        s.tone === "accent"
                          ? "var(--color-accent)"
                          : s.tone === "positive"
                            ? "var(--color-positive)"
                            : "var(--color-border-strong)",
                      color:
                        s.tone === "accent"
                          ? "var(--color-accent)"
                          : s.tone === "positive"
                            ? "var(--color-positive)"
                            : "var(--color-ink-faint)",
                    }}
                  >
                    {i + 1}
                  </span>
                  <span
                    className="text-[13px]"
                    style={{
                      color:
                        s.tone === "neutral"
                          ? "var(--color-ink-muted)"
                          : "var(--color-ink)",
                      fontWeight: s.tone === "accent" ? 500 : 400,
                    }}
                  >
                    {s.label}
                  </span>
                </li>
              ))}
            </ol>
            <p className="mt-5 border-t border-[var(--color-border)] pt-4 text-[12px] text-[var(--color-ink-faint)]">
              Every teaching decision is shown as a plain-language signal —
              never the model&apos;s hidden reasoning.
            </p>
          </div>
        </section>
      </main>

      <footer className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-border)] pt-6 text-[12px] text-[var(--color-ink-faint)]">
          <LumenWordmark size="sm" />
          <span>
            Built on grounded RAG, a persistent learner model, and an adaptive
            teaching engine.
          </span>
        </div>
      </footer>
    </div>
  );
}

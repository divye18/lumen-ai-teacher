import Link from "next/link";
import { LinkButton } from "@/components/ui/button";
import { LumenWordmark } from "@/components/ui/lumen-mark";
import { LumenCore } from "@/components/brand/lumen-core";

const LAYERS = [
  {
    n: "01",
    title: "Grounding",
    body: "Lumen builds a strict knowledge base from your specific material. It teaches from your textbook, not the internet.",
  },
  {
    n: "02",
    title: "Learner Model",
    body: "As you answer, Lumen maps your actual cognitive state, tracking confidence and specific recurring misconceptions.",
  },
  {
    n: "03",
    title: "Adaptive Pedagogy",
    body: "The engine changes its teaching strategy dynamically based on what you just did. Not a static script. A tutor.",
  },
];

export function Landing({ signedIn }: { signedIn: boolean }) {
  // Force dark cinematic canvas for the landing page
  return (
    <div className="dark relative flex min-h-svh flex-col bg-[var(--color-canvas)] text-[var(--color-ink)] selection:bg-[var(--color-ink-muted)] selection:text-[var(--color-canvas)]">
      {/* Background Spatial Element */}
      <div className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center overflow-hidden opacity-40">
        <div className="translate-x-[20%] translate-y-[-10%] scale-[1.5]">
          <LumenCore size="hero" intensity="subtle" />
        </div>
      </div>

      <header className="relative z-10 mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-8 sm:px-12">
        <LumenWordmark />
        <div className="flex items-center gap-6">
          {signedIn ? (
            <LinkButton
              href="/studio"
              size="sm"
              variant="secondary"
              className="border-transparent bg-white/5 text-white hover:bg-white/10"
            >
              Open Studio
            </LinkButton>
          ) : (
            <>
              <Link
                href="/login"
                className="font-mono text-[11px] font-medium tracking-[0.05em] text-[var(--color-ink-muted)] uppercase transition-colors hover:text-[var(--color-ink)]"
              >
                Sign In
              </Link>
              <LinkButton
                href="/signup"
                size="sm"
                variant="secondary"
                className="border-transparent bg-white/5 text-white hover:bg-white/10"
              >
                Get Started
              </LinkButton>
            </>
          )}
        </div>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-7xl flex-1 flex-col px-6 sm:px-12">
        <section className="flex flex-col justify-center pt-24 pb-32 sm:pt-32">
          <p className="mb-6 font-mono text-[11px] font-semibold tracking-[0.1em] text-[var(--color-ink-muted)] uppercase">
            Digital Learning Observatory
          </p>
          <h1 className="font-editorial max-w-4xl text-5xl leading-[1.05] font-medium tracking-tight text-[var(--color-ink)] sm:text-6xl md:text-7xl">
            Don&apos;t just get the answer. <br className="hidden sm:block" />
            <span className="text-[var(--color-ink-muted)]">
              Understand it.
            </span>
          </h1>
          <p className="mt-8 max-w-xl text-[16px] leading-relaxed text-[var(--color-ink-muted)]">
            Lumen observes your learning behavior and changes how it teaches. An
            adaptive intelligence built to resolve misconceptions and guarantee
            mastery.
          </p>
          <div className="mt-12 flex flex-wrap gap-4">
            <LinkButton
              href={signedIn ? "/studio" : "/signup"}
              size="lg"
              variant="secondary"
              className="border-transparent bg-white text-[var(--color-canvas)] hover:bg-white/90"
            >
              {signedIn ? "Open Studio" : "Begin Learning"}
            </LinkButton>
          </div>
        </section>

        <section className="mt-auto border-t border-[var(--color-border)]/20 py-16">
          <div className="grid gap-12 sm:grid-cols-3">
            {LAYERS.map((l) => (
              <div key={l.n} className="flex flex-col">
                <span className="font-mono text-[11px] text-[var(--color-ink-faint)]">
                  {l.n}
                </span>
                <h3 className="font-editorial mt-4 text-[20px] font-medium tracking-tight text-[var(--color-ink)]">
                  {l.title}
                </h3>
                <p className="mt-3 text-[14px] leading-relaxed text-[var(--color-ink-muted)]">
                  {l.body}
                </p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="relative z-10 mx-auto w-full max-w-7xl px-6 py-8 sm:px-12">
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[var(--color-border)]/20 pt-8 font-mono text-[11px] tracking-wide text-[var(--color-ink-faint)] uppercase">
          <LumenWordmark size="sm" />
          <nav className="flex gap-8">
            <Link
              href="/privacy"
              className="transition-colors hover:text-[var(--color-ink)]"
            >
              Privacy
            </Link>
            <Link
              href="/terms"
              className="transition-colors hover:text-[var(--color-ink)]"
            >
              Terms
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

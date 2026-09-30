"use client";

import Link from "next/link";
import { useRef } from "react";
import {
  motion,
  useScroll,
  useTransform,
  useReducedMotion,
  type MotionValue,
} from "framer-motion";

import { LinkButton } from "@/components/ui/button";
import { LumenWordmark } from "@/components/ui/lumen-mark";
import { LumenCore } from "@/components/brand/lumen-core";

const ADAPTIVE_LOOP = [
  "UNDERSTAND",
  "TEACH",
  "CHECK",
  "DETECT",
  "RETEACH",
  "MASTER",
];

const MODES = ["EXPLAIN", "VISUALIZE", "3D", "VOICE", "PRACTICE"];

export function Landing({ signedIn }: { signedIn: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"],
  });

  // Core background transforms based on scroll
  const coreY = useTransform(
    scrollYProgress,
    [0, 0.2, 0.4, 0.6, 0.8, 1],
    ["-10%", "5%", "20%", "0%", "-5%", "-10%"],
  );

  const coreX = useTransform(
    scrollYProgress,
    [0, 0.2, 0.4, 0.6, 0.8, 1],
    ["20%", "0%", "-20%", "10%", "-10%", "0%"],
  );

  const coreScale = useTransform(
    scrollYProgress,
    [0, 0.2, 0.4, 0.6, 0.8, 1],
    [1.5, 1.2, 1, 1.3, 1, 1.2],
  );

  const coreOpacity = useTransform(
    scrollYProgress,
    [0, 0.2, 0.4, 0.6, 0.8, 0.9, 1],
    [0.4, 0.5, 0.6, 0.7, 0.6, 0.3, 0.8],
  );

  return (
    <div
      ref={containerRef}
      className="dark relative flex flex-col overflow-clip bg-[var(--color-canvas)] text-[var(--color-ink)] selection:bg-[var(--color-ink-muted)] selection:text-[var(--color-canvas)]"
    >
      {/* Background Core */}
      <div className="pointer-events-none fixed inset-0 z-0 flex items-center justify-center overflow-hidden">
        <motion.div
          style={
            reduce
              ? { opacity: 0.4, scale: 1.2 }
              : { y: coreY, x: coreX, scale: coreScale, opacity: coreOpacity }
          }
          className="flex h-[80vw] max-h-[800px] w-[80vw] max-w-[800px] items-center justify-center"
        >
          <LumenCore size="hero" intensity="subtle" />
        </motion.div>
      </div>

      <header className="pointer-events-none fixed top-0 right-0 left-0 z-50 mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-8 mix-blend-difference sm:px-12">
        <div className="pointer-events-auto">
          <LumenWordmark />
        </div>
        <div className="pointer-events-auto flex items-center gap-6">
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

      <main className="relative z-10 w-full">
        {/* 01 - ARRIVAL */}
        <section className="mx-auto flex min-h-svh max-w-7xl flex-col justify-center px-6 sm:px-12">
          <p className="mb-6 font-mono text-[11px] font-semibold tracking-[0.1em] text-[var(--color-ink-muted)] uppercase">
            Digital Learning Observatory
          </p>
          <h1 className="font-editorial max-w-4xl text-5xl leading-[1.05] font-medium tracking-tight text-[var(--color-ink)] sm:text-6xl md:text-8xl">
            LEARN
            <br />
            WITH
            <br />
            INTELLIGENCE.
          </h1>
        </section>

        {/* 02 - THE PROBLEM */}
        <section className="mx-auto flex min-h-svh max-w-7xl flex-col justify-center px-6 sm:px-12">
          <h2 className="font-editorial max-w-3xl text-4xl leading-[1.1] font-medium tracking-tight text-[var(--color-ink-muted)] sm:text-5xl md:text-6xl">
            Most learning systems
            <br />
            <span className="text-[var(--color-ink)]">
              treat every learner
              <br />
              the same.
            </span>
          </h2>
        </section>

        {/* 03 - THE LUMEN IDEA */}
        <section className="mx-auto flex min-h-svh max-w-7xl flex-col items-end justify-center px-6 text-right sm:px-12">
          <h2 className="font-editorial max-w-3xl text-4xl leading-[1.1] font-medium tracking-tight text-[var(--color-ink-muted)] sm:text-5xl md:text-6xl">
            Lumen observes
            <br />
            <span className="text-[var(--color-ink)]">understanding,</span>
            <br />
            not just answers.
          </h2>
        </section>

        {/* 04 - ADAPTIVE LOOP */}
        <section className="relative mx-auto flex min-h-[150vh] max-w-7xl flex-col px-6 sm:px-12">
          <div className="sticky top-0 flex h-svh flex-col justify-center">
            <div className="flex flex-col gap-4">
              {ADAPTIVE_LOOP.map((word, i) => (
                <AdaptiveWord
                  key={word}
                  word={word}
                  index={i}
                  total={ADAPTIVE_LOOP.length}
                  scrollYProgress={scrollYProgress}
                />
              ))}
            </div>
          </div>
        </section>

        {/* 05 - MISCONCEPTION */}
        <section className="mx-auto flex min-h-svh max-w-7xl flex-col items-center justify-center px-6 text-center sm:px-12">
          <h2 className="font-editorial max-w-4xl text-3xl leading-[1.15] font-medium tracking-tight text-[var(--color-ink-muted)] sm:text-5xl md:text-6xl">
            A wrong answer
            <br />
            is not the end of the lesson.
          </h2>
          <p className="font-editorial mt-8 text-3xl text-[var(--color-ink)] sm:text-5xl md:text-6xl">
            It is information.
          </p>

          <div className="mt-16 flex flex-wrap items-center justify-center gap-4 font-mono text-[13px] font-medium tracking-[0.1em] text-[var(--color-learning)] uppercase sm:gap-8 sm:text-[15px]">
            <span>MISCONCEPTION</span>
            <span className="text-[var(--color-ink-faint)]">→</span>
            <span>RETEACH</span>
            <span className="text-[var(--color-ink-faint)]">→</span>
            <span>VERIFY</span>
          </div>
        </section>

        {/* 06 - MULTIMODAL LEARNING */}
        <section className="mx-auto flex min-h-svh max-w-7xl flex-col justify-center px-6 sm:px-12">
          <p className="mb-12 font-mono text-[11px] font-semibold tracking-[0.1em] text-[var(--color-ink-muted)] uppercase">
            Multimodal Intelligence
          </p>
          <div className="flex flex-col gap-6">
            {MODES.map((mode, i) => (
              <MultimodalWord
                key={mode}
                word={mode}
                index={i}
                total={MODES.length}
                scrollYProgress={scrollYProgress}
              />
            ))}
          </div>
        </section>

        {/* 07 - ENTER THE LEARNING ENVIRONMENT */}
        <section className="mx-auto flex min-h-svh max-w-7xl flex-col items-center justify-center px-6 text-center sm:px-12">
          <h2 className="font-editorial mb-12 text-5xl font-medium tracking-tight text-[var(--color-ink)] sm:text-7xl">
            Begin.
          </h2>
          <LinkButton
            href={signedIn ? "/studio" : "/signup"}
            size="lg"
            variant="secondary"
            className="rounded-none border-transparent bg-white px-12 py-6 text-[15px] text-[var(--color-canvas)] hover:bg-white/90 sm:text-[16px]"
          >
            {signedIn ? "Open Studio" : "Enter Learning Environment"}
          </LinkButton>
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

function AdaptiveWord({
  word,
  index,
  total,
  scrollYProgress,
}: {
  word: string;
  index: number;
  total: number;
  scrollYProgress: MotionValue<number>;
}) {
  const reduce = useReducedMotion();
  // Map scroll progress to highlight this specific word
  // Adaptive loop section spans approx scroll progress 0.4 to 0.6
  const start = 0.4 + (index / total) * 0.2;
  const end = start + (1 / total) * 0.2;

  const opacity = useTransform(
    scrollYProgress,
    [start - 0.05, start, end, end + 0.05],
    [0.2, 1, 1, 0.2],
  );

  const x = useTransform(
    scrollYProgress,
    [start - 0.05, start, end, end + 0.05],
    ["-2%", "0%", "0%", "2%"],
  );

  return (
    <motion.h3
      style={reduce ? { opacity: 1, x: 0 } : { opacity, x }}
      className="font-editorial text-5xl font-medium tracking-tight text-[var(--color-ink)] sm:text-7xl md:text-8xl"
    >
      {word}
    </motion.h3>
  );
}

function MultimodalWord({
  word,
  index,
  total,
  scrollYProgress,
}: {
  word: string;
  index: number;
  total: number;
  scrollYProgress: MotionValue<number>;
}) {
  const reduce = useReducedMotion();
  // Multimodal section spans approx 0.75 to 0.9
  const start = 0.75 + (index / total) * 0.15;
  const end = start + (1 / total) * 0.15;

  const opacity = useTransform(
    scrollYProgress,
    [start - 0.05, start, end, end + 0.05],
    [0.2, 1, 1, 0.2],
  );

  return (
    <motion.h3
      style={reduce ? { opacity: 1 } : { opacity }}
      className="font-editorial text-4xl font-medium tracking-tight text-[var(--color-ink)] sm:text-6xl md:text-7xl"
    >
      {word}
    </motion.h3>
  );
}

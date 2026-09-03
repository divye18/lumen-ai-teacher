"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

/**
 * Honest ingestion stages. `phase` is driven by the real request lifecycle:
 *  - "uploading"  → the browser is sending bytes
 *  - "processing" → the server is extracting / chunking / embedding / persisting
 *  - "done" / "error" → the response has arrived
 * We advance through descriptive sub-steps on a timer BUT never past the last
 * one until the server actually responds — nothing claims completion early.
 */

export type IngestPhase = "uploading" | "processing" | "done" | "error";

const STEPS = [
  "Reading the document",
  "Understanding its structure",
  "Building your knowledge base",
  "Preparing semantic retrieval",
  "Designing your first lesson",
] as const;

export function IngestStages({ phase }: { phase: IngestPhase }) {
  const reduce = useReducedMotion();
  const [walked, setWalked] = useState(0);

  useEffect(() => {
    if (phase !== "processing") return;
    // Walk forward, but hold on the second-to-last step until the server responds.
    const id = setInterval(() => {
      setWalked((i) => Math.min(i + 1, STEPS.length - 2));
    }, 2600);
    return () => clearInterval(id);
  }, [phase]);

  const active = phase === "done" ? STEPS.length - 1 : walked;

  return (
    <ol className="flex flex-col gap-3">
      {STEPS.map((step, i) => {
        const state =
          phase === "done" || i < active
            ? "done"
            : i === active
              ? "active"
              : "pending";
        return (
          <li key={step} className="flex items-center gap-3">
            <span
              className="grid size-5 shrink-0 place-items-center rounded-full border"
              style={{
                borderColor:
                  state === "pending"
                    ? "var(--color-border-strong)"
                    : "var(--color-accent)",
                backgroundColor:
                  state === "done" ? "var(--color-accent)" : "transparent",
              }}
              aria-hidden
            >
              {state === "done" ? (
                <svg viewBox="0 0 12 12" className="size-3 text-white">
                  <path
                    d="M2.5 6.5l2.5 2.5 4.5-5"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                </svg>
              ) : state === "active" ? (
                <motion.span
                  className="size-1.5 rounded-full bg-[var(--color-accent)]"
                  animate={
                    reduce ? {} : { scale: [1, 1.5, 1], opacity: [1, 0.4, 1] }
                  }
                  transition={{ duration: 1.4, repeat: Infinity }}
                />
              ) : null}
            </span>
            <span
              className="text-[13px]"
              style={{
                color:
                  state === "pending"
                    ? "var(--color-ink-faint)"
                    : "var(--color-ink)",
                fontWeight: state === "active" ? 500 : 400,
              }}
            >
              {step}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

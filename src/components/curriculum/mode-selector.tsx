"use client";

import { motion, useReducedMotion } from "framer-motion";

import {
  cardHover,
  modeSelect,
  staggerContainer,
  staggerItem,
} from "@/lib/ui/motion";
import { cn } from "@/lib/ui/cn";

/**
 * LEARNING-MODE SELECTOR — one reusable architecture, semantic accent per
 * mode (Milestone 20 Phase 2+). This is a RENDERING/START PREFERENCE, never
 * a replacement teaching engine: selecting a mode only changes which of
 * these seven labels is highlighted client-side. It does not send a mode
 * parameter to any API — the existing `/api/lessons` -> `/api/teaching/session`
 * flow (`CurriculumTopicList`) is completely unchanged by this component.
 *
 * `available: false` modes (currently Table, Video) render as genuinely
 * inert "Coming soon" cards — focusable, correctly labeled, never clickable,
 * never implying functionality that doesn't exist.
 */
export type LearningModeId =
  "explain" | "visualize" | "threeD" | "voice" | "practice" | "table" | "video";

export interface LearningModeDef {
  id: LearningModeId;
  label: string;
  description: string;
  /** A CSS color value (may itself be a `color-mix(...)` expression built
   * from existing design tokens) — never a new bare hex, per the
   * "semantic identity, not a rainbow" brief. */
  accent: string;
  available: boolean;
  /**
   * A fixed PRODUCT DEFAULT, not a Teacher Brain / AI recommendation — there
   * is no backend signal for "best mode for this learner." Exactly one mode
   * carries this flag; it renders a plain "Recommended" badge, never
   * personalized language ("Lumen suggests...") that would misrepresent
   * where the choice comes from.
   */
  recommended?: boolean;
}

export const LEARNING_MODES: LearningModeDef[] = [
  {
    id: "explain",
    label: "Explain",
    description: "Lumen teaches and checks your understanding.",
    accent: "var(--color-accent)",
    available: true,
    recommended: true,
  },
  {
    id: "visualize",
    label: "Visualize",
    description: "See the concept as a diagram.",
    accent: "var(--color-learning)",
    available: true,
  },
  {
    id: "threeD",
    label: "3D",
    description: "Explore an interactive 3D scene.",
    accent: "color-mix(in oklab, var(--color-accent) 100%, black 18%)",
    available: true,
  },
  {
    id: "voice",
    label: "Voice",
    description: "Talk it through out loud.",
    accent:
      "color-mix(in oklab, var(--color-achievement) 55%, var(--color-learning) 45%)",
    available: true,
  },
  {
    id: "practice",
    label: "Practice",
    description: "Answer questions to test yourself.",
    accent: "var(--color-practice)",
    available: true,
  },
  {
    id: "table",
    label: "Table",
    description: "A structured reference view.",
    accent: "var(--color-ink-muted)",
    available: false,
  },
  {
    id: "video",
    label: "Video",
    description: "A short video walkthrough.",
    accent: "var(--color-ink-faint)",
    available: false,
  },
];

export function ModeSelector({
  selected,
  onSelect,
  className,
}: {
  selected: LearningModeId;
  onSelect: (mode: LearningModeId) => void;
  className?: string;
}) {
  const reduce = useReducedMotion();

  return (
    <motion.div
      initial={reduce ? "visible" : "hidden"}
      animate="visible"
      variants={staggerContainer.variants}
      role="radiogroup"
      aria-label="Learning mode"
      className={cn(
        "grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-7",
        className,
      )}
    >
      {LEARNING_MODES.map((mode) => {
        const isSelected = mode.available && mode.id === selected;
        return (
          <motion.button
            key={mode.id}
            type="button"
            role="radio"
            aria-checked={isSelected}
            aria-disabled={!mode.available || undefined}
            disabled={!mode.available}
            onClick={() => mode.available && onSelect(mode.id)}
            variants={staggerItem.variants}
            whileHover={!reduce && mode.available ? cardHover : undefined}
            whileTap={
              !reduce && mode.available ? modeSelect.whileTap : undefined
            }
            transition={modeSelect.transition}
            className={cn(
              "relative flex flex-col items-start gap-1 rounded-[var(--radius-md)] border p-2.5 text-left transition-colors",
              mode.available
                ? "cursor-pointer border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-border-strong)]"
                : "cursor-not-allowed border-dashed border-[var(--color-border)] bg-transparent",
              isSelected && "shadow-[var(--shadow-sm)]",
            )}
            style={
              isSelected
                ? {
                    borderColor: mode.accent,
                    backgroundColor: `color-mix(in oklab, ${mode.accent} 8%, var(--color-surface))`,
                  }
                : undefined
            }
          >
            <span className="flex w-full items-center gap-1.5">
              <span
                aria-hidden
                className={cn(
                  "size-2 rounded-full",
                  !mode.available && "opacity-40",
                )}
                style={{
                  backgroundColor: mode.available
                    ? mode.accent
                    : "var(--color-ink-faint)",
                }}
              />
              <span
                className={cn(
                  "text-[length:var(--text-body)] font-semibold",
                  mode.available
                    ? "text-[var(--color-ink)]"
                    : "text-[var(--color-ink-faint)]",
                )}
              >
                {mode.label}
              </span>
            </span>
            {mode.recommended && mode.available ? (
              <span className="text-[length:var(--text-label)] font-medium tracking-tight text-[var(--color-accent)]">
                Recommended
              </span>
            ) : !mode.available ? (
              <span className="text-[length:var(--text-label)] font-medium tracking-tight text-[var(--color-ink-faint)]">
                Coming soon
              </span>
            ) : null}
          </motion.button>
        );
      })}
    </motion.div>
  );
}

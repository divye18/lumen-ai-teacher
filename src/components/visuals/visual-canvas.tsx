"use client";

import { useCallback, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import type { VisualDirective } from "@/lib/visuals";
import { SceneView } from "@/components/scene/scene-view";
import { cn } from "@/lib/ui/cn";

import {
  ChartVisual,
  CodeVisual,
  ComparisonVisual,
  ConceptMapVisual,
  DiagramVisual,
  FormulaVisual,
  TextVisual,
  TimelineVisual,
} from "./renderers";

const MODE_LABEL: Record<string, string> = {
  TEXT: "Explanation",
  DIAGRAM: "Flow",
  COMPARISON: "Comparison",
  FORMULA: "Formula",
  TIMELINE: "Timeline",
  CONCEPT_MAP: "Concept map",
  CHART: "Chart",
  CODE_VISUALIZATION: "Code",
  THREE_D: "3D model",
  ANIMATION: "Animation",
  INTERACTIVE_SIMULATION: "Simulation",
};

/**
 * The Visual Learning Canvas. Dispatches a validated `VisualDirective` to its
 * renderer. THREE_D degrades to its own TEXT caption if the scene can't be
 * built; every other unknown mode already arrived as TEXT via the resolver.
 */
export function VisualCanvas({
  directive,
  className,
}: {
  directive: VisualDirective;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const [threeDFailed, setThreeDFailed] = useState(false);
  const handleUnavailable = useCallback(() => setThreeDFailed(true), []);

  const effectiveMode =
    directive.mode === "THREE_D" && threeDFailed ? "TEXT" : directive.mode;

  let body: React.ReactNode;
  switch (directive.mode) {
    case "COMPARISON":
      body = <ComparisonVisual data={directive.comparison} />;
      break;
    case "FORMULA":
      body = <FormulaVisual data={directive.formula} />;
      break;
    case "TIMELINE":
      body = <TimelineVisual data={directive.timeline} />;
      break;
    case "CONCEPT_MAP":
      body = <ConceptMapVisual data={directive.conceptMap} />;
      break;
    case "DIAGRAM":
      body = <DiagramVisual data={directive.diagram} />;
      break;
    case "CHART":
      body = <ChartVisual data={directive.chart} />;
      break;
    case "CODE_VISUALIZATION":
      body = <CodeVisual data={directive.codeVisualization} />;
      break;
    case "THREE_D":
      body = threeDFailed ? (
        <TextVisual caption={directive.caption ?? "See the explanation."} />
      ) : (
        <SceneView directive={directive} onUnavailable={handleUnavailable} />
      );
      break;
    case "ANIMATION":
    case "INTERACTIVE_SIMULATION":
      body = <TextVisual caption={directive.caption ?? ""} />;
      break;
    default:
      body = <TextVisual caption={directive.caption} />;
  }

  const caption = directive.mode !== "TEXT" ? directive.caption : undefined;

  return (
    <div
      className={cn(
        "rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 sm:p-5",
        className,
      )}
    >
      <div className="mb-3 flex items-center gap-2">
        <span className="rounded-full border border-[var(--color-border)] px-2 py-0.5 text-[10px] font-semibold tracking-wide text-[var(--color-ink-faint)] uppercase">
          {MODE_LABEL[effectiveMode] ?? "Visual"}
        </span>
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={`${directive.mode}-${caption ?? ""}`}
          initial={reduce ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
          transition={{ duration: 0.25 }}
        >
          {body}
          {caption ? (
            <p className="mt-3 border-t border-[var(--color-border)] pt-3 text-[12px] leading-relaxed text-[var(--color-ink-muted)]">
              {caption}
            </p>
          ) : null}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

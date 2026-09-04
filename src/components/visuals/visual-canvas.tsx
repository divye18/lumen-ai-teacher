"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
 *
 * `intentLabel` names what the representation is *for* ("Simpler view", "System
 * view"); when the directive changes, the canvas cross-fades between the two so
 * the learner watches the representation transform rather than seeing a reload.
 * `muted` recedes the canvas while the learner's attention belongs elsewhere
 * (during a question or the answer breakdown).
 */
export function VisualCanvas({
  directive,
  intentLabel,
  muted = false,
  className,
}: {
  directive: VisualDirective;
  intentLabel?: string | null;
  muted?: boolean;
  className?: string;
}) {
  const reduce = useReducedMotion();

  // Track the specific 3D scene that failed, so a *different* directive (or a
  // switch away from 3D) automatically gets a fresh shot without an effect.
  const sceneId = directive.mode === "THREE_D" ? directive.threeD.scene : null;
  const [failedScene, setFailedScene] = useState<string | null>(null);
  const threeDFailed = directive.mode === "THREE_D" && failedScene === sceneId;
  const handleUnavailable = useCallback(() => {
    if (sceneId) setFailedScene(sceneId);
  }, [sceneId]);

  // Flash a "representation changed" note for a moment after the mode changes.
  const prevMode = useRef(directive.mode);
  const [justChanged, setJustChanged] = useState(false);
  useEffect(() => {
    if (prevMode.current === directive.mode || reduce) return;
    prevMode.current = directive.mode;
    const raf = window.requestAnimationFrame(() => setJustChanged(true));
    const id = window.setTimeout(() => setJustChanged(false), 3200);
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(id);
    };
  }, [directive.mode, reduce]);

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
  const chipLabel =
    intentLabel && !muted
      ? intentLabel
      : (MODE_LABEL[effectiveMode] ?? "Visual");

  return (
    <div
      className={cn(
        "rounded-[var(--radius-lg)] border bg-[var(--color-surface)] transition-[opacity,padding] duration-300",
        muted
          ? "border-[var(--color-border)]/60 p-3 opacity-70 sm:p-3.5"
          : "border-[var(--color-border)] p-4 sm:p-5",
        className,
      )}
    >
      <div className="mb-3 flex items-center gap-2">
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase transition-colors",
            justChanged
              ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
              : "border-[var(--color-border)] text-[var(--color-ink-faint)]",
          )}
        >
          {chipLabel}
        </span>
        {justChanged ? (
          <motion.span
            initial={reduce ? false : { opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            className="text-[10px] font-medium text-[var(--color-accent)]"
          >
            representation changed
          </motion.span>
        ) : muted ? (
          <span className="text-[10px] text-[var(--color-ink-faint)]">
            for reference
          </span>
        ) : null}
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={`${directive.mode}-${caption ?? ""}`}
          initial={reduce ? false : { opacity: 0, scale: 0.985, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.99, y: -8 }}
          transition={{ duration: reduce ? 0 : 0.34, ease: [0.16, 1, 0.3, 1] }}
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

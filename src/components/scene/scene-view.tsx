"use client";

import dynamic from "next/dynamic";
import {
  Component,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useReducedMotion } from "framer-motion";

import { resolveScene, type SceneState } from "@/lib/scene";
import type { VisualDirective } from "@/lib/visuals";
import { cn } from "@/lib/ui/cn";

import { SceneFallback } from "./scene-fallback";

const SceneCanvas = dynamic(() => import("./scene-canvas"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full place-items-center text-[12px] text-[var(--color-ink-faint)]">
      Preparing the 3D view…
    </div>
  ),
});

function webglAvailable(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return Boolean(
      window.WebGLRenderingContext &&
      (canvas.getContext("webgl") || canvas.getContext("experimental-webgl")),
    );
  } catch {
    return false;
  }
}

class SceneErrorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * Renders a `THREE_D` directive: resolve → SceneState → 3D canvas, with a 2D
 * fallback for no-WebGL / canvas errors / unknown scenes. Step controls walk
 * the learner through the scene in sync with the teacher's narration.
 */
export function SceneView({
  directive,
  onUnavailable,
  className,
}: {
  directive: Extract<VisualDirective, { mode: "THREE_D" }>;
  /** Called once if the scene can't be resolved — caller shows TEXT instead. */
  onUnavailable?: () => void;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const resolved = useMemo(
    () => resolveScene(directive.threeD),
    [directive.threeD],
  );
  const [step, setStep] = useState(directive.threeD.step ?? 0);
  const [selected, setSelected] = useState<string | null>(null);
  const webgl = useSyncExternalStore(
    useCallback(() => () => {}, []),
    () => webglAvailable(),
    () => false,
  );
  const use3D = webgl && !reduce;

  useEffect(() => {
    if (!resolved.ok) onUnavailable?.();
  }, [resolved.ok, onUnavailable]);

  if (!resolved.ok) return null;

  const base = resolved.value;
  // Re-resolve at the chosen step so highlights follow the walkthrough.
  const stepped = resolveScene({
    ...directive.threeD,
    step,
    highlight:
      step === (directive.threeD.step ?? 0) ? directive.threeD.highlight : [],
  });
  const scene: SceneState = stepped.ok ? stepped.value : base;
  const activeStep = scene.steps[step];
  const selectedObject = scene.objects.find((o) => o.key === selected) ?? null;

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="relative h-[280px] overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[#0b0f1a] sm:h-[340px]">
        {use3D ? (
          <SceneErrorBoundary
            fallback={
              <div className="h-full overflow-y-auto p-3">
                <SceneFallback
                  scene={scene}
                  selectedKey={selected}
                  onSelect={(k) => setSelected(k || null)}
                />
              </div>
            }
          >
            <SceneCanvas
              scene={scene}
              selectedKey={selected}
              onHover={() => {}}
              onSelect={(k) => setSelected(k || null)}
            />
          </SceneErrorBoundary>
        ) : (
          <div className="h-full overflow-y-auto p-3">
            <SceneFallback
              scene={scene}
              selectedKey={selected}
              onSelect={(k) => setSelected(k || null)}
            />
          </div>
        )}
        <span className="pointer-events-none absolute top-2 left-3 text-[10px] font-medium text-white/50">
          {scene.title}
        </span>
      </div>

      {activeStep ? (
        <p className="text-[13px] leading-relaxed text-[var(--color-ink)]">
          <span className="font-medium">{activeStep.label}.</span>{" "}
          {activeStep.caption}
        </p>
      ) : null}

      {selectedObject?.detail ? (
        <p className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] p-2.5 text-[12px] text-[var(--color-ink-muted)]">
          <span className="font-medium text-[var(--color-ink)]">
            {selectedObject.label}:
          </span>{" "}
          {selectedObject.detail}
        </p>
      ) : null}

      {scene.steps.length > 1 ? (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-2 py-1 text-[11px] text-[var(--color-ink-muted)] disabled:opacity-40"
          >
            Back
          </button>
          <div className="flex flex-1 gap-1">
            {scene.steps.map((_, i) => (
              <span
                key={i}
                className="h-1 flex-1 rounded-full"
                style={{
                  background:
                    i <= step ? "var(--color-accent)" : "var(--color-border)",
                }}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() =>
              setStep((s) => Math.min(scene.steps.length - 1, s + 1))
            }
            disabled={step === scene.steps.length - 1}
            className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-2 py-1 text-[11px] text-[var(--color-ink-muted)] disabled:opacity-40"
          >
            Next
          </button>
        </div>
      ) : null}
    </div>
  );
}

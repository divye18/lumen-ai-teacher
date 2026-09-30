"use client";

import dynamic from "next/dynamic";
import {
  Component,
  useCallback,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useReducedMotion } from "framer-motion";

import { cn } from "@/lib/ui/cn";
import { LumenMark } from "@/components/ui/lumen-mark";

const LumenCoreCanvas = dynamic(() => import("./lumen-core-canvas"), {
  ssr: false,
  loading: () => <FallbackView />,
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

class CoreErrorBoundary extends Component<
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

function FallbackView() {
  return (
    <div className="flex h-full w-full items-center justify-center text-[var(--color-ink-faint)]">
      <LumenMark className="size-12 opacity-20" />
    </div>
  );
}

export type LumenCoreSize = "hero" | "medium" | "small";
export type LumenCoreIntensity = "subtle" | "focus";

const SIZE_STYLES: Record<LumenCoreSize, string> = {
  hero: "w-[240px] h-[240px] sm:w-[320px] sm:h-[320px] lg:w-[400px] lg:h-[400px]",
  medium: "w-[160px] h-[160px] sm:w-[200px] sm:h-[200px]",
  small: "w-[80px] h-[80px]",
};

export function LumenCore({
  size = "hero",
  intensity = "subtle",
  interactive = false,
  className,
}: {
  size?: LumenCoreSize;
  intensity?: LumenCoreIntensity;
  interactive?: boolean;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const webgl = useSyncExternalStore(
    useCallback(() => () => {}, []),
    () => webglAvailable(),
    () => false,
  );

  return (
    <div
      className={cn("relative shrink-0", SIZE_STYLES[size], className)}
      aria-hidden="true"
    >
      {webgl ? (
        <CoreErrorBoundary fallback={<FallbackView />}>
          <LumenCoreCanvas
            intensity={intensity}
            interactive={interactive}
            reduceMotion={!!reduce}
          />
        </CoreErrorBoundary>
      ) : (
        <FallbackView />
      )}
    </div>
  );
}

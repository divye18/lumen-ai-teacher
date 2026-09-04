"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";

/**
 * Audio activity visual. A ring of bars whose height follows the live `level`
 * (real mic RMS while listening, synthetic wobble while speaking). Communicates
 * "listening" vs "speaking" without text. Canvas-based, no dependency.
 */
export function AudioWaveform({
  level,
  active,
  mode,
  className,
}: {
  level: number;
  active: boolean;
  mode: "listening" | "speaking" | "idle";
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduce = useReducedMotion();
  const stateRef = useRef({ level, active, mode });

  useEffect(() => {
    stateRef.current = { level, active, mode };
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const BARS = 40;
    const phases = Array.from(
      { length: BARS },
      () => Math.random() * Math.PI * 2,
    );
    let raf = 0;
    let t = 0;

    const accent =
      getComputedStyle(document.documentElement)
        .getPropertyValue("--color-accent")
        .trim() || "#6366f1";
    const advancing =
      getComputedStyle(document.documentElement)
        .getPropertyValue("--color-signal-advancing")
        .trim() || "#22c55e";

    const draw = () => {
      const { level: lvl, active: isActive, mode: m } = stateRef.current;
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      t += reduce ? 0 : 0.05;

      const colour = m === "listening" ? advancing : accent;
      const baseline = isActive ? lvl : 0.04;

      for (let i = 0; i < BARS; i += 1) {
        const centre = Math.abs(i - BARS / 2) / (BARS / 2);
        const envelope = 1 - centre * 0.7;
        const wobble = reduce
          ? 0
          : 0.35 * Math.sin(t * 2 + phases[i]) +
            0.2 * Math.sin(t * 5 + i * 0.6);
        const amp = Math.max(
          0.03,
          Math.min(1, baseline * envelope * (1 + wobble)),
        );
        const barH = amp * h * 0.9;
        const x = (i / BARS) * w + w / BARS / 2;
        ctx.fillStyle = colour;
        ctx.globalAlpha = isActive ? 0.9 : 0.3;
        const bw = Math.max(1.5, w / BARS - 2);
        ctx.beginPath();
        ctx.roundRect(x - bw / 2, (h - barH) / 2, bw, barH, bw / 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [reduce]);

  return (
    <canvas
      ref={canvasRef}
      width={320}
      height={44}
      className={className}
      aria-hidden
    />
  );
}

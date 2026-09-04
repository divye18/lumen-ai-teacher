"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";

import { computeWaveformBarAmplitudes } from "@/lib/ui/waveform";

const BARS = 40;

/**
 * Audio activity visual. A ring of bars whose height follows the live `level`
 * (real mic RMS while listening, synthetic wobble while speaking). Communicates
 * "listening" vs "speaking" without text. Canvas-based, no dependency.
 *
 * Reduced motion: still a clear, live indicator of listening/speaking — just
 * never an animated wobble, and never a perpetual same-frame redraw loop. The
 * canvas is repainted once per meaningful state change instead of every frame.
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
  // Lazy `useState` initializer — the officially-sanctioned way to run a
  // one-time impure computation (random per-bar phase offsets) without doing
  // it on every render; the setter is never called, this is pure storage.
  const [phases] = useState<number[]>(() =>
    Array.from({ length: BARS }, () => Math.random() * Math.PI * 2),
  );

  useEffect(() => {
    stateRef.current = { level, active, mode };
  });

  function paint(t: number) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { level: lvl, active: isActive, mode: m } = stateRef.current;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const accent =
      getComputedStyle(document.documentElement)
        .getPropertyValue("--color-accent")
        .trim() || "#6366f1";
    const advancing =
      getComputedStyle(document.documentElement)
        .getPropertyValue("--color-signal-advancing")
        .trim() || "#22c55e";
    const colour = m === "listening" ? advancing : accent;

    const amps = computeWaveformBarAmplitudes({
      level: lvl,
      active: isActive,
      reduce: Boolean(reduce),
      barCount: BARS,
      phases,
      t,
    });

    for (let i = 0; i < BARS; i += 1) {
      const barH = amps[i] * h * 0.9;
      const x = (i / BARS) * w + w / BARS / 2;
      ctx.fillStyle = colour;
      ctx.globalAlpha = isActive ? 0.9 : 0.3;
      const bw = Math.max(1.5, w / BARS - 2);
      ctx.beginPath();
      ctx.roundRect(x - bw / 2, (h - barH) / 2, bw, barH, bw / 2);
      ctx.fill();
    }
  }

  // The continuous animation loop — skipped entirely under reduced motion, so
  // an idle/active waveform never burns a frame it isn't allowed to animate.
  useEffect(() => {
    if (reduce) return;
    let raf = 0;
    let t = 0;
    const draw = () => {
      t += 0.05;
      paint(t);
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduce]);

  // Reduced motion: still repaint on every real state change (listening
  // starts/stops, level moves) — a clear, static indicator, just never a
  // repeating same-frame loop.
  useEffect(() => {
    if (!reduce) return;
    paint(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduce, level, active, mode]);

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

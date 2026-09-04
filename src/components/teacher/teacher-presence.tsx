"use client";

import { useId } from "react";
import { motion, useReducedMotion } from "framer-motion";

import {
  presenceVisual,
  type TeacherPresenceState,
} from "@/lib/teacher/presence";
import { cn } from "@/lib/ui/cn";

/**
 * TEACHER PRESENCE — a designed fallback teacher. No avatar provider required.
 *
 * A luminous aperture: a gradient core, concentric rings that breathe with the
 * teacher's state, and a live outer ring that reacts to audio level while
 * listening or speaking. It renders state only — all intelligence lives in the
 * teaching engine.
 */
export function TeacherPresence({
  state,
  level = 0,
  className,
}: {
  state: TeacherPresenceState;
  /** Live audio level 0..1 (mic input while listening, output while speaking). */
  level?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const id = useId().replace(/:/g, "");
  const visual = presenceVisual(state);
  const lvl = Math.min(1, Math.max(0, level));
  const reactive = state === "LISTENING" || state === "TEACHING";

  const coreScale = reduce
    ? 1
    : 1 + (reactive ? lvl * 0.14 : 0) + (state === "CELEBRATING" ? 0.05 : 0);

  return (
    <div className={cn("flex flex-col items-center gap-3", className)}>
      <div className="relative grid place-items-center">
        <svg
          viewBox="0 0 200 200"
          className="size-40 sm:size-48"
          role="img"
          aria-label={`Teacher is ${visual.label.toLowerCase()}`}
        >
          <defs>
            <radialGradient id={`core-${id}`} cx="50%" cy="42%" r="60%">
              <stop
                offset="0%"
                stopColor="color-mix(in oklab, white 55%, transparent)"
              />
              <stop offset="45%" stopColor={visual.color} />
              <stop
                offset="100%"
                stopColor="color-mix(in oklab, var(--color-canvas) 55%, transparent)"
              />
            </radialGradient>
            <filter id={`soft-${id}`}>
              <feGaussianBlur stdDeviation="3" />
            </filter>
          </defs>

          {/* Outer breathing halo */}
          <motion.circle
            cx="100"
            cy="100"
            r="86"
            fill="none"
            stroke={visual.color}
            strokeWidth="1"
            opacity={0.2}
            animate={
              reduce
                ? { scale: 1 }
                : {
                    scale: [1, 1 + 0.03 * visual.energy, 1],
                    opacity: [0.12, 0.24, 0.12],
                  }
            }
            transition={{
              duration: 4 / Math.max(0.3, visual.energy),
              repeat: Infinity,
              ease: "easeInOut",
            }}
            style={{ transformOrigin: "100px 100px" }}
          />

          {/* Live reactive ring */}
          <circle
            cx="100"
            cy="100"
            r={62 + (reactive ? lvl * 18 : 0)}
            fill="none"
            stroke={visual.color}
            strokeWidth={reactive ? 2 + lvl * 3 : 1.5}
            opacity={reactive ? 0.35 + lvl * 0.4 : 0.22}
            strokeDasharray={
              state === "LISTENING"
                ? "2 6"
                : state === "THINKING"
                  ? "10 8"
                  : undefined
            }
          >
            {!reduce && state === "THINKING" ? (
              <animateTransform
                attributeName="transform"
                type="rotate"
                from="0 100 100"
                to="360 100 100"
                dur="6s"
                repeatCount="indefinite"
              />
            ) : null}
          </circle>

          {/* Mid ring */}
          <motion.circle
            cx="100"
            cy="100"
            r="46"
            fill="none"
            stroke={visual.color}
            strokeWidth="1.25"
            opacity={0.4}
            animate={
              reduce ? {} : { rotate: state === "TEACHING" ? [0, 360] : 0 }
            }
            transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
            style={{ transformOrigin: "100px 100px" }}
          />

          {/* Core */}
          <motion.circle
            cx="100"
            cy="100"
            r="34"
            fill={`url(#core-${id})`}
            filter={`url(#soft-${id})`}
            animate={{ scale: coreScale }}
            transition={{ type: "spring", stiffness: 200, damping: 18 }}
            style={{ transformOrigin: "100px 100px" }}
          />
          <circle
            cx="100"
            cy="100"
            r="34"
            fill="none"
            stroke="color-mix(in oklab, white 30%, transparent)"
            strokeWidth="1"
          />

          {/* One-shot ripple whenever the teacher's state changes — a beat that
              signals "Lumen just shifted what it's doing", not a loop. */}
          {!reduce ? (
            <motion.circle
              key={state}
              cx="100"
              cy="100"
              r="34"
              fill="none"
              stroke={visual.color}
              strokeWidth="1.5"
              initial={{ scale: 1, opacity: 0.55 }}
              animate={{ scale: 2.6, opacity: 0 }}
              transition={{ duration: 0.9, ease: "easeOut" }}
              style={{ transformOrigin: "100px 100px" }}
            />
          ) : null}

          {/* Speaking pulse dots */}
          {state === "TEACHING" && !reduce
            ? [0, 1, 2].map((i) => (
                <motion.circle
                  key={i}
                  cx={100}
                  cy={100}
                  r="34"
                  fill="none"
                  stroke={visual.color}
                  strokeWidth="1.5"
                  initial={{ scale: 1, opacity: 0.5 }}
                  animate={{ scale: 2.4, opacity: 0 }}
                  transition={{
                    duration: 2.4,
                    repeat: Infinity,
                    delay: i * 0.8,
                    ease: "easeOut",
                  }}
                  style={{ transformOrigin: "100px 100px" }}
                />
              ))
            : null}
        </svg>
      </div>

      <div
        className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium"
        style={{
          borderColor: `color-mix(in oklab, ${visual.color} 35%, var(--color-border))`,
          color: visual.color,
        }}
      >
        <span
          className="size-1.5 rounded-full"
          style={{ backgroundColor: visual.color }}
        />
        {visual.label}
      </div>
    </div>
  );
}

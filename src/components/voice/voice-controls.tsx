"use client";

import { cn } from "@/lib/ui/cn";
import type { VoiceState } from "@/lib/voice/controller";

import { AudioWaveform } from "./audio-waveform";

/**
 * Mic control + live voice status. Always visible when voice is enabled; when
 * recognition is unavailable it clearly says so and the learner types instead.
 */
export function VoiceControls({
  state,
  level,
  canListen,
  error,
  onStart,
  onStop,
  onRecover,
  hint,
}: {
  state: VoiceState;
  level: number;
  canListen: boolean;
  error: string | null;
  onStart: () => void;
  onStop: () => void;
  onRecover: () => void;
  hint?: string;
}) {
  const listening = state === "LISTENING";
  const speaking = state === "SPEAKING";
  const processing = state === "PROCESSING";

  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            if (state === "ERROR") onRecover();
            else if (listening) onStop();
            else onStart();
          }}
          disabled={!canListen && state !== "ERROR"}
          aria-pressed={listening}
          aria-label={
            listening ? "Stop recording" : "Start recording your answer"
          }
          className={cn(
            "grid size-11 shrink-0 place-items-center rounded-full border transition-colors",
            listening
              ? "border-[var(--color-signal-advancing)] bg-[color-mix(in_oklab,var(--color-signal-advancing)_15%,transparent)] text-[var(--color-signal-advancing)]"
              : "border-[var(--color-border-strong)] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] disabled:opacity-40",
          )}
        >
          {listening ? (
            <span className="size-3 rounded-[3px] bg-current" />
          ) : (
            <svg viewBox="0 0 16 16" className="size-4" aria-hidden>
              <path
                d="M8 1a2.5 2.5 0 0 0-2.5 2.5v4a2.5 2.5 0 0 0 5 0v-4A2.5 2.5 0 0 0 8 1Z"
                fill="currentColor"
              />
              <path
                d="M3.5 7.5a4.5 4.5 0 0 0 9 0M8 12v3"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                fill="none"
              />
            </svg>
          )}
        </button>

        <div className="min-w-0 flex-1">
          <AudioWaveform
            level={level}
            active={listening || speaking}
            mode={listening ? "listening" : speaking ? "speaking" : "idle"}
            className="h-9 w-full"
          />
        </div>

        <span className="shrink-0 text-[11px] font-medium text-[var(--color-ink-muted)] tabular-nums">
          {state === "ERROR"
            ? "Tap to retry"
            : listening
              ? "Listening…"
              : processing
                ? "Thinking…"
                : speaking
                  ? "Speaking"
                  : canListen
                    ? "Tap to speak"
                    : "Voice input off"}
        </span>
      </div>

      {error ? (
        <p role="alert" className="mt-2 text-[11px] text-[var(--color-danger)]">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-2 text-[11px] text-[var(--color-ink-faint)]">{hint}</p>
      ) : null}
    </div>
  );
}

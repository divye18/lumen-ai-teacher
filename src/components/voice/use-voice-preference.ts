"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Persistent voice preference — a per-browser UI preference, exactly like
 * `useTheme` (`@/components/ui/theme`), which this deliberately mirrors:
 * `useSyncExternalStore` over `localStorage`, a safe `false` server snapshot,
 * and a `storage`/custom-event subscription so other components (and other
 * tabs) stay in sync. Not scoped per-learner/account — same as theme.
 *
 * Never a hard dependency: any storage failure (private browsing, disabled
 * storage) degrades to session-only `false` rather than throwing.
 */

export const VOICE_PREFERENCE_KEY = "lumen-voice-enabled";
const EVENT = "lumen-voice-enabled-change";

function subscribe(cb: () => void): () => void {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

/**
 * The read side of the contract, exported standalone so it's directly
 * testable without rendering anything (matches `browser-speech.ts` /
 * `capabilities.ts`'s established pattern for `window`/storage-dependent
 * logic in this project's no-component-test-infra convention).
 *
 * `"true"` -> true. Anything else — missing key, any other value, or a
 * storage read failure (private browsing, disabled storage) — -> false.
 */
export function getVoicePreference(): boolean {
  try {
    return localStorage.getItem(VOICE_PREFERENCE_KEY) === "true";
  } catch {
    return false;
  }
}

/** SSR-safe; matches `voiceEnabled`'s pre-8.6 default for first-time visitors. */
function getServerSnapshot(): boolean {
  return false;
}

export type VoicePreferenceSetter = (
  next: boolean | ((prev: boolean) => boolean),
) => void;

/**
 * The write side, exported standalone for the same reason. Always resolves a
 * functional updater against the CURRENT stored value (never a stale one),
 * and never throws even when storage is unavailable.
 */
export function setVoicePreference(
  next: boolean | ((prev: boolean) => boolean),
): void {
  const resolved =
    typeof next === "function" ? next(getVoicePreference()) : next;
  try {
    localStorage.setItem(VOICE_PREFERENCE_KEY, resolved ? "true" : "false");
  } catch {
    /* private mode / storage blocked — session only, never crashes */
  }
  window.dispatchEvent(new Event(EVENT));
}

/**
 * `[value, setValue]` — the same ergonomics as `useState(false)`, INCLUDING
 * the functional-updater form (`setVoiceEnabled((v) => !v)`), so
 * `TeachingRoom` needs only a minimal substitution — no call site changes.
 */
export function useVoicePreference(): [boolean, VoicePreferenceSetter] {
  const voiceEnabled = useSyncExternalStore(
    subscribe,
    getVoicePreference,
    getServerSnapshot,
  );

  const setVoiceEnabled = useCallback<VoicePreferenceSetter>((next) => {
    setVoicePreference(next);
  }, []);

  return [voiceEnabled, setVoiceEnabled];
}

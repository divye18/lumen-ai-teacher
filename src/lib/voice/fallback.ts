import type {
  Recognizer,
  RecognizerHandlers,
  Synthesizer,
  SynthesizerHandlers,
} from "./controller";

/**
 * PROVIDER FALLBACK — cloud, with a transparent drop to browser.
 *
 * `VoiceController` only ever sees ONE `Recognizer` / `Synthesizer`. These
 * wrappers let that one adapter be "cloud, falling back to browser" without
 * the controller (or the Teaching Room) knowing a fallback happened —
 * exactly the "TTS/STT failure hierarchy" this milestone asks for, built as
 * composition rather than a second controller or a UI-level branch.
 *
 * Deterministic: a primary failure BEFORE any real progress falls back
 * exactly once; a failure mid-stream (after partial results / mid-utterance)
 * is reported as-is rather than silently restarting, so the learner never
 * sees a garbled retry.
 */

export function withSynthesizerFallback(
  primary: Synthesizer,
  fallback: Synthesizer | null,
  onFallback?: () => void,
): Synthesizer {
  if (!fallback) return primary;
  return {
    supportsStreaming: () => primary.supportsStreaming(),
    speak(text: string, handlers: SynthesizerHandlers) {
      let progressed = false;
      primary.speak(text, {
        onProgress: (spokenChars) => {
          progressed = true;
          handlers.onProgress?.(spokenChars);
        },
        onEnd: handlers.onEnd,
        onError: (message) => {
          if (progressed) {
            // Already partway through — don't restart from zero mid-sentence.
            handlers.onError(message);
            return;
          }
          onFallback?.();
          fallback.speak(text, handlers);
        },
      });
    },
    cancel() {
      primary.cancel();
      fallback.cancel();
    },
  };
}

export function withRecognizerFallback(
  primary: Recognizer,
  fallback: Recognizer | null,
  onFallback?: () => void,
): Recognizer {
  if (!fallback) return primary;
  let usingFallback = false;
  let active: Recognizer = primary;
  return {
    supportsStreaming: () =>
      (usingFallback ? fallback : primary).supportsStreaming(),
    start(handlers: RecognizerHandlers) {
      let progressed = false;
      const relay: RecognizerHandlers = {
        onPartial: (text) => {
          progressed = true;
          handlers.onPartial?.(text);
        },
        onFinal: (text) => {
          progressed = true;
          handlers.onFinal(text);
        },
        onError: (message) => {
          if (progressed || usingFallback) {
            handlers.onError(message);
            return;
          }
          usingFallback = true;
          active = fallback;
          onFallback?.();
          fallback.start(handlers);
        },
        onEnd: handlers.onEnd,
      };
      usingFallback = false;
      active = primary;
      primary.start(relay);
    },
    stop() {
      active.stop();
    },
  };
}

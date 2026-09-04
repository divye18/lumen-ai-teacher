/**
 * VOICE CONTROLLER — a strict state machine for the spoken teaching loop.
 *
 *   IDLE → LISTENING → PROCESSING → SPEAKING → IDLE
 *
 * Impossible transitions are rejected (and logged as a no-op), so the UI can
 * never get wedged. The controller owns no browser APIs: it drives injected
 * `Recognizer` / `Synthesizer` adapters, which keeps it unit-testable and lets
 * the browser, a cloud provider, or a deterministic fake all plug in.
 */

export type VoiceState =
  "IDLE" | "LISTENING" | "PROCESSING" | "SPEAKING" | "ERROR";

const TRANSITIONS: Record<VoiceState, readonly VoiceState[]> = {
  IDLE: ["LISTENING", "SPEAKING", "ERROR"],
  LISTENING: ["PROCESSING", "IDLE", "ERROR"],
  PROCESSING: ["SPEAKING", "IDLE", "ERROR"],
  SPEAKING: ["IDLE", "LISTENING", "ERROR"],
  ERROR: ["IDLE"],
};

export interface RecognizerHandlers {
  onPartial?: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (message: string) => void;
  onEnd: () => void;
}

export interface Recognizer {
  supportsStreaming(): boolean;
  start(handlers: RecognizerHandlers): void;
  stop(): void;
}

export interface SynthesizerHandlers {
  /** Called as speech progresses; `spokenChars` is a prefix length of `text`. */
  onProgress?: (spokenChars: number) => void;
  onEnd: () => void;
  onError: (message: string) => void;
}

export interface Synthesizer {
  supportsStreaming(): boolean;
  speak(text: string, handlers: SynthesizerHandlers): void;
  cancel(): void;
}

export interface VoiceControllerEvents {
  onStateChange?: (state: VoiceState, previous: VoiceState) => void;
  /** A completed learner utterance, ready to submit to the teaching API. */
  onTranscript?: (text: string) => void;
  /** Live partial transcript while listening. */
  onPartialTranscript?: (text: string) => void;
  /** Caption for the current spoken sentence + how much has been voiced. */
  onCaption?: (payload: { text: string; spokenChars: number }) => void;
  onError?: (message: string) => void;
}

export interface VoiceControllerDeps {
  recognizer: Recognizer | null;
  synthesizer: Synthesizer | null;
  events?: VoiceControllerEvents;
}

export class VoiceController {
  private state: VoiceState = "IDLE";
  private readonly recognizer: Recognizer | null;
  private readonly synthesizer: Synthesizer | null;
  private readonly events: VoiceControllerEvents;
  private lastError: string | null = null;
  private speakingText = "";
  private utteranceHandler: ((text: string) => void) | null = null;

  constructor(deps: VoiceControllerDeps) {
    this.recognizer = deps.recognizer;
    this.synthesizer = deps.synthesizer;
    this.events = deps.events ?? {};
  }

  /** Register a handler for each completed spoken utterance. */
  setUtteranceHandler(handler: ((text: string) => void) | null): void {
    this.utteranceHandler = handler;
  }

  getState(): VoiceState {
    return this.state;
  }
  getLastError(): string | null {
    return this.lastError;
  }
  canListen(): boolean {
    return this.recognizer !== null && this.canTransition("LISTENING");
  }
  canSpeak(): boolean {
    return this.synthesizer !== null;
  }
  canTransition(to: VoiceState): boolean {
    return TRANSITIONS[this.state].includes(to);
  }

  private transition(to: VoiceState): boolean {
    if (to === this.state) return true;
    if (!this.canTransition(to)) return false;
    const previous = this.state;
    this.state = to;
    this.events.onStateChange?.(to, previous);
    return true;
  }

  startListening(): boolean {
    if (!this.recognizer) {
      this.fail("Speech recognition is not available.");
      return false;
    }
    if (!this.transition("LISTENING")) return false;
    this.recognizer.start({
      onPartial: (text) => {
        if (this.state === "LISTENING") this.events.onPartialTranscript?.(text);
      },
      onFinal: (text) => {
        this.finishListening(text);
      },
      onError: (message) => this.fail(message),
      onEnd: () => {
        // Recognizer stopped on its own (silence) without a final result.
        if (this.state === "LISTENING") this.transition("IDLE");
      },
    });
    return true;
  }

  /** Ask the recognizer to stop; the final transcript arrives via `onFinal`. */
  stopListening(): void {
    if (this.state !== "LISTENING") return;
    this.recognizer?.stop();
  }

  private finishListening(text: string): void {
    const clean = text.trim();
    if (this.state !== "LISTENING") return;
    if (clean.length === 0) {
      // Empty transcript — never pretend we heard something.
      this.transition("IDLE");
      this.events.onError?.(
        "Didn't catch that — try again or type your answer.",
      );
      return;
    }
    this.transition("PROCESSING");
    this.events.onTranscript?.(clean);
    this.utteranceHandler?.(clean);
  }

  /** Caller moves out of PROCESSING once the teaching API has responded. */
  speak(text: string): boolean {
    const clean = text.trim();
    if (clean.length === 0) {
      this.transition("IDLE");
      return false;
    }
    if (!this.transition("SPEAKING")) return false;
    this.speakingText = clean;

    if (!this.synthesizer) {
      // No TTS: emit the full caption immediately, then settle.
      this.events.onCaption?.({ text: clean, spokenChars: clean.length });
      this.transition("IDLE");
      return true;
    }

    this.events.onCaption?.({ text: clean, spokenChars: 0 });
    this.synthesizer.speak(clean, {
      onProgress: (spokenChars) => {
        if (this.state === "SPEAKING") {
          this.events.onCaption?.({
            text: this.speakingText,
            spokenChars: Math.min(spokenChars, this.speakingText.length),
          });
        }
      },
      onEnd: () => {
        if (this.state === "SPEAKING") {
          this.events.onCaption?.({
            text: this.speakingText,
            spokenChars: this.speakingText.length,
          });
          this.transition("IDLE");
        }
      },
      onError: (message) => this.fail(message),
    });
    return true;
  }

  stopSpeaking(): void {
    if (this.state !== "SPEAKING") return;
    this.synthesizer?.cancel();
    this.transition("IDLE");
  }

  /** Abandon whatever is in progress and return to IDLE. */
  abort(): void {
    this.recognizer?.stop();
    this.synthesizer?.cancel();
    if (this.state === "ERROR") this.transition("IDLE");
    else if (this.state !== "IDLE") this.transition("IDLE");
  }

  private fail(message: string): void {
    this.lastError = message;
    this.recognizer?.stop();
    this.synthesizer?.cancel();
    this.transition("ERROR");
    this.events.onError?.(message);
  }

  recover(): void {
    if (this.state === "ERROR") {
      this.lastError = null;
      this.transition("IDLE");
    }
  }
}

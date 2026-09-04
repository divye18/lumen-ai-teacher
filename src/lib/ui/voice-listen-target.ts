/**
 * VOICE TRANSCRIPT ROUTING.
 *
 * `VoiceController` supports exactly one registered transcript handler, and
 * the Teaching Room owns it (see `use-voice-controller.ts::onTranscript` /
 * `setUtteranceHandler` — a single nullable slot, not a list). Two surfaces
 * can now start listening — the question panel and Ask Lumen — but only one
 * mic session is ever active at a time, so the Teaching Room tracks WHICH
 * surface started it and dispatches the one completed transcript there when
 * it arrives. This is that dispatch decision, pure so it's verifiable
 * without React or the controller.
 */
export type VoiceListenTarget = "question" | "askLumen" | null;

export interface VoiceListenTargetHandlers {
  question: (transcript: string) => void;
  askLumen: (transcript: string) => void;
}

/**
 * Route a completed utterance to whichever surface is currently listening.
 * `target: null` (nothing claimed this recording, or it was already cleared
 * by an error/cancel) safely ignores the transcript — it never guesses.
 */
export function routeVoiceTranscript(
  target: VoiceListenTarget,
  transcript: string,
  handlers: VoiceListenTargetHandlers,
): void {
  if (target === "question") {
    handlers.question(transcript);
  } else if (target === "askLumen") {
    handlers.askLumen(transcript);
  }
}

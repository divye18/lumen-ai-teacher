import { z } from "zod";

/**
 * Request validation for the voice API routes. Text length matches the
 * existing teaching-content cap (`TeachingContent.body` is `max(4000)` in
 * `@/lib/teaching/contracts`) — voice only ever speaks already-approved
 * teaching text, so it can never legitimately exceed that.
 */
export const MAX_SPEAK_CHARS = 4000;

export const speakRequestSchema = z.object({
  text: z.string().min(1).max(MAX_SPEAK_CHARS),
  /** Optional provider-known voice id override. */
  voice: z.string().min(1).max(100).optional(),
});
export type SpeakRequest = z.infer<typeof speakRequestSchema>;

/** A learner utterance is short by nature; this is a generous ceiling. */
export const MAX_TRANSCRIBE_AUDIO_BYTES = 8_000_000; // ~8 MB

/** Audio containers the browser's `MediaRecorder` can plausibly produce. */
export const ACCEPTED_AUDIO_MIME_TYPES = [
  "audio/webm",
  "audio/ogg",
  "audio/wav",
  "audio/mp4",
  "audio/mpeg",
];

export function isAcceptedAudioMimeType(mimeType: string): boolean {
  const base = mimeType.split(";")[0]?.trim().toLowerCase();
  return ACCEPTED_AUDIO_MIME_TYPES.includes(base);
}

import type { Result } from "@/lib/result";

/**
 * PROVIDER ABSTRACTIONS — speech-to-text and text-to-speech.
 * Vendor implementations are added in a later phase.
 */

export interface TranscribeOptions {
  /** Raw audio bytes. */
  audio: ArrayBuffer;
  mimeType: string;
  /** BCP-47 hint for the expected spoken language. */
  language?: string;
  signal?: AbortSignal;
}

export interface TranscribeResult {
  text: string;
  language: string;
  /** Provider confidence, 0–1, when available. */
  confidence?: number;
}

export interface SpeechToTextProvider {
  readonly id: string;
  transcribe(options: TranscribeOptions): Promise<Result<TranscribeResult>>;
}

export interface SynthesizeOptions {
  text: string;
  /** Provider-known voice id. */
  voice?: string;
  language?: string;
  /** Playback rate multiplier. */
  rate?: number;
  signal?: AbortSignal;
}

export interface SynthesizeResult {
  audio: ArrayBuffer;
  mimeType: string;
  /** Duration in milliseconds, when known. */
  durationMs?: number;
}

export interface TextToSpeechProvider {
  readonly id: string;
  synthesize(options: SynthesizeOptions): Promise<Result<SynthesizeResult>>;
}

/**
 * Which cloud voice providers are actually configured server-side — never
 * more than a provider id, never a key. `null` means "no cloud provider
 * configured for this channel"; the client falls back to browser voice.
 */
export interface VoiceCloudStatus {
  stt: string | null;
  tts: string | null;
}

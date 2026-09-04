import "server-only";

import { serverConfig } from "@/config/server";
import { ProviderNotConfiguredError } from "@/lib/errors";

import { createDeepgramSpeechToText } from "./deepgram-stt";
import { createElevenLabsTextToSpeech } from "./elevenlabs-tts";
import type { SpeechToTextProvider, TextToSpeechProvider } from "./types";

export type * from "./types";

/**
 * SERVER voice registry + config-driven selection.
 *
 * Cloud providers are optional. When a key is missing the getter returns null
 * and the browser Web Speech API (client) carries the spoken experience. No
 * voice provider is ever a hard dependency for the Teaching Room.
 */

let sttProvider: SpeechToTextProvider | null = null;
let ttsProvider: TextToSpeechProvider | null = null;

export function registerSpeechToTextProvider(
  provider: SpeechToTextProvider,
): void {
  sttProvider = provider;
}

export function registerTextToSpeechProvider(
  provider: TextToSpeechProvider,
): void {
  ttsProvider = provider;
}

export function getSpeechToTextProvider(): SpeechToTextProvider {
  if (!sttProvider) throw new ProviderNotConfiguredError("speech-to-text");
  return sttProvider;
}

export function getTextToSpeechProvider(): TextToSpeechProvider {
  if (!ttsProvider) throw new ProviderNotConfiguredError("text-to-speech");
  return ttsProvider;
}

/** Build the configured cloud STT provider, if a key is present. */
export function getConfiguredSpeechToText(): SpeechToTextProvider | null {
  const { provider, apiKey } = serverConfig.voice.speechToText;
  if (!apiKey) return null;
  if (provider === undefined || provider === "deepgram") {
    return createDeepgramSpeechToText({ apiKey });
  }
  return null;
}

/** Build the configured cloud TTS provider, if a key is present. */
export function getConfiguredTextToSpeech(): TextToSpeechProvider | null {
  const { provider, apiKey } = serverConfig.voice.textToSpeech;
  if (!apiKey) return null;
  if (provider === undefined || provider === "elevenlabs") {
    return createElevenLabsTextToSpeech({ apiKey });
  }
  return null;
}

export interface VoiceProviderStatus {
  cloudStt: string | null;
  cloudTts: string | null;
}

/** For the Teaching Room provider badge. Never returns keys. */
export function voiceProviderStatus(): VoiceProviderStatus {
  const stt = getConfiguredSpeechToText();
  const tts = getConfiguredTextToSpeech();
  return {
    cloudStt: stt ? stt.id.split(":")[0] : null,
    cloudTts: tts ? tts.id.split(":")[0] : null,
  };
}

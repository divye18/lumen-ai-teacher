import "server-only";

import { ProviderNotConfiguredError } from "@/lib/errors";

import type { SpeechToTextProvider, TextToSpeechProvider } from "./types";

export type * from "./types";

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

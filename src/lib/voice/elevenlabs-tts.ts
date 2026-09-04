import { LumenError } from "@/lib/errors";
import { err, ok, type Result } from "@/lib/result";

import type {
  SynthesizeOptions,
  SynthesizeResult,
  TextToSpeechProvider,
} from "./types";

/**
 * ElevenLabs-compatible TTS provider. Raw REST (`fetch`) only. Returns audio
 * bytes; the client plays them and drives captions from playback time. Every
 * failure is recoverable — the caller falls back to browser `speechSynthesis`
 * or silent captions.
 */
export interface ElevenLabsTtsConfig {
  apiKey: string;
  /** e.g. "https://api.elevenlabs.io/v1". */
  baseUrl?: string;
  voiceId?: string;
  modelId?: string;
  fetchImpl?: typeof fetch;
}

const MAX_CHARS = 2_500;

export function createElevenLabsTextToSpeech(
  config: ElevenLabsTtsConfig,
): TextToSpeechProvider {
  const doFetch = config.fetchImpl ?? fetch;
  const base = config.baseUrl ?? "https://api.elevenlabs.io/v1";
  const voiceId = config.voiceId ?? "21m00Tcm4TlvDq8ikWAM";

  return {
    id: `elevenlabs:${config.modelId ?? "eleven_turbo_v2"}`,
    async synthesize(
      options: SynthesizeOptions,
    ): Promise<Result<SynthesizeResult>> {
      const text = options.text.slice(0, MAX_CHARS);
      let response: Response;
      try {
        response = await doFetch(
          `${base}/text-to-speech/${options.voice ?? voiceId}`,
          {
            method: "POST",
            headers: {
              "xi-api-key": config.apiKey,
              "Content-Type": "application/json",
              Accept: "audio/mpeg",
            },
            body: JSON.stringify({
              text,
              model_id: config.modelId ?? "eleven_turbo_v2",
            }),
            signal: options.signal,
          },
        );
      } catch (cause) {
        return err(
          new LumenError("PROVIDER_ERROR", "ElevenLabs request failed.", {
            recoverable: true,
            cause,
          }),
        );
      }
      if (!response.ok) {
        return err(
          new LumenError(
            "PROVIDER_ERROR",
            `ElevenLabs returned ${response.status}.`,
            { recoverable: true },
          ),
        );
      }
      const audio = await response.arrayBuffer();
      return ok({ audio, mimeType: "audio/mpeg" });
    },
  };
}

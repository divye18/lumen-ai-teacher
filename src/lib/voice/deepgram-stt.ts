import { LumenError } from "@/lib/errors";
import { err, ok, type Result } from "@/lib/result";

import type {
  SpeechToTextProvider,
  TranscribeOptions,
  TranscribeResult,
} from "./types";

/**
 * Deepgram-compatible STT provider. Raw REST (`fetch`) — no vendor SDK, so
 * nothing leaks past `SpeechToTextProvider`. Every failure is a recoverable
 * `LumenError`; the caller falls back to browser recognition or text input.
 */
export interface DeepgramSttConfig {
  apiKey: string;
  /** e.g. "https://api.deepgram.com/v1/listen". */
  baseUrl?: string;
  model?: string;
  fetchImpl?: typeof fetch;
}

export function createDeepgramSpeechToText(
  config: DeepgramSttConfig,
): SpeechToTextProvider {
  const doFetch = config.fetchImpl ?? fetch;
  const url = new URL(config.baseUrl ?? "https://api.deepgram.com/v1/listen");
  url.searchParams.set("model", config.model ?? "nova-2");
  url.searchParams.set("smart_format", "true");

  return {
    id: `deepgram:${config.model ?? "nova-2"}`,
    async transcribe(
      options: TranscribeOptions,
    ): Promise<Result<TranscribeResult>> {
      if (options.language) url.searchParams.set("language", options.language);
      let response: Response;
      try {
        response = await doFetch(url.toString(), {
          method: "POST",
          headers: {
            Authorization: `Token ${config.apiKey}`,
            "Content-Type": options.mimeType || "audio/webm",
          },
          body: options.audio,
          signal: options.signal,
        });
      } catch (cause) {
        return err(
          new LumenError("PROVIDER_ERROR", "Deepgram request failed.", {
            recoverable: true,
            cause,
          }),
        );
      }
      if (!response.ok) {
        return err(
          new LumenError(
            "PROVIDER_ERROR",
            `Deepgram returned ${response.status}.`,
            { recoverable: true },
          ),
        );
      }
      const body = (await response.json().catch(() => null)) as {
        results?: {
          channels?: {
            alternatives?: { transcript?: string; confidence?: number }[];
          }[];
        };
      } | null;
      const alt = body?.results?.channels?.[0]?.alternatives?.[0];
      const text = alt?.transcript?.trim() ?? "";
      if (text.length === 0) {
        return err(
          new LumenError("PROVIDER_ERROR", "Empty transcript.", {
            recoverable: true,
          }),
        );
      }
      return ok({
        text,
        language: options.language ?? "en",
        confidence: alt?.confidence,
      });
    },
  };
}

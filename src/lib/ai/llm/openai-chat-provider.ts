import { err, ok, type Result } from "@/lib/result";

import { AiGenerationError } from "@/lib/errors";
import type {
  LLMGenerateOptions,
  LLMGenerateResult,
  LLMProvider,
} from "../types";

/**
 * LLM provider for the OpenAI `/chat/completions` REST API (and compatible
 * gateways). `fetch` only — no vendor SDK — so nothing leaks past
 * {@link LLMProvider}.
 */

export interface OpenAIChatConfig {
  apiKey: string;
  model: string;
  /** API root, e.g. "https://api.openai.com/v1". */
  baseUrl: string;
  /** Default temperature when the caller does not pass one. */
  temperature?: number;
  /**
   * Ask the provider for a JSON object. Most OpenAI models support this;
   * some gateways do not — the structured helper still recovers via parsing.
   */
  jsonMode?: boolean;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

interface ChatCompletionResponse {
  choices?: {
    message?: { content?: string | null };
    finish_reason?: string | null;
  }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  model?: string;
  error?: { message?: string };
}

function mapFinishReason(
  reason: string | null | undefined,
): LLMGenerateResult["finishReason"] {
  switch (reason) {
    case "stop":
      return "stop";
    case "length":
      return "length";
    case "content_filter":
      return "content-filter";
    default:
      return "other";
  }
}

export function createOpenAIChatProvider(
  config: OpenAIChatConfig,
): LLMProvider {
  const doFetch = config.fetchImpl ?? fetch;
  const endpoint = `${config.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const timeoutMs = config.timeoutMs ?? 45_000;
  const jsonMode = config.jsonMode ?? true;

  return {
    id: `openai-chat:${config.model}`,

    async generate(
      options: LLMGenerateOptions,
    ): Promise<Result<LLMGenerateResult>> {
      const model = options.model ?? config.model;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      if (options.signal) {
        options.signal.addEventListener("abort", () => controller.abort(), {
          once: true,
        });
      }

      let response: Response;
      try {
        response = await doFetch(endpoint, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: options.messages,
            temperature: options.temperature ?? config.temperature ?? 0.2,
            ...(options.maxOutputTokens
              ? { max_tokens: options.maxOutputTokens }
              : {}),
            ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
          }),
          signal: controller.signal,
        });
      } catch (cause) {
        return err(
          new AiGenerationError(
            `request to ${endpoint} failed: ${
              cause instanceof Error ? cause.message : "network error"
            }`,
            { cause },
          ),
        );
      } finally {
        clearTimeout(timer);
      }

      let body: ChatCompletionResponse;
      try {
        body = (await response.json()) as ChatCompletionResponse;
      } catch (cause) {
        return err(
          new AiGenerationError("response was not valid JSON", { cause }),
        );
      }

      if (!response.ok) {
        return err(
          new AiGenerationError(
            `provider returned HTTP ${response.status}${
              body.error?.message ? `: ${body.error.message}` : ""
            }`,
          ),
        );
      }

      const choice = body.choices?.[0];
      const text = choice?.message?.content ?? "";
      if (text.trim().length === 0) {
        return err(new AiGenerationError("provider returned empty content"));
      }

      return ok({
        text,
        model: body.model ?? model,
        finishReason: mapFinishReason(choice?.finish_reason),
        usage: body.usage
          ? {
              inputTokens: body.usage.prompt_tokens ?? 0,
              outputTokens: body.usage.completion_tokens ?? 0,
            }
          : undefined,
      });
    },
  };
}

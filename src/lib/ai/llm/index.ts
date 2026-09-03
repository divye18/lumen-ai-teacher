import "server-only";

import { serverConfig } from "@/config/server";
import { LumenError } from "@/lib/errors";
import { err, ok, type Result } from "@/lib/result";

import { registerLLMProvider } from "../registry";
import type { LLMProvider } from "../types";
import { createOpenAIChatProvider } from "./openai-chat-provider";

export { createOpenAIChatProvider } from "./openai-chat-provider";
export type { OpenAIChatConfig } from "./openai-chat-provider";

/**
 * Build the chat LLM provider from server configuration.
 *
 * `LLM_PROVIDER` selects the implementation (only `openai` / OpenAI-compatible
 * is implemented). `LLM_API_KEY` is required. Returns a recoverable error
 * rather than throwing so the teaching engine can fall back to its
 * deterministic policy.
 */
export function getLLMProviderFromConfig(): Result<LLMProvider> {
  const { provider, apiKey, model, baseUrl, temperature } = serverConfig.ai.llm;

  if (provider !== "openai") {
    return err(
      new LumenError(
        "PROVIDER_NOT_CONFIGURED",
        `LLM provider "${provider}" is not implemented. Set LLM_PROVIDER=openai.`,
        { recoverable: true },
      ),
    );
  }

  if (!apiKey) {
    return err(
      new LumenError(
        "CONFIG_MISSING",
        "LLM_API_KEY is not set; the language model is unavailable.",
        { recoverable: true },
      ),
    );
  }

  return ok(createOpenAIChatProvider({ apiKey, model, baseUrl, temperature }));
}

export function registerConfiguredLLMProvider(): Result<LLMProvider> {
  const built = getLLMProviderFromConfig();
  if (built.ok) registerLLMProvider(built.value);
  return built;
}

import "server-only";

import { serverConfig } from "@/config/server";
import { LumenError } from "@/lib/errors";
import { err, ok, type Result } from "@/lib/result";

import { registerEmbeddingProvider } from "../registry";
import type { EmbeddingProvider } from "../types";
import { createOpenAIEmbeddingProvider } from "./openai-embedding-provider";

export { createOpenAIEmbeddingProvider } from "./openai-embedding-provider";
export type { OpenAIEmbeddingConfig } from "./openai-embedding-provider";

/**
 * Build the embedding provider from server configuration.
 *
 * `EMBEDDING_PROVIDER` selects the implementation (only `openai` /
 * OpenAI-compatible is implemented this phase). `EMBEDDING_API_KEY` is
 * required. Returns a recoverable error rather than throwing so callers can
 * degrade gracefully.
 */
export function getEmbeddingProviderFromConfig(): Result<EmbeddingProvider> {
  const { provider, apiKey, model, baseUrl, dimensions } =
    serverConfig.ai.embedding;

  if (provider !== "openai") {
    return err(
      new LumenError(
        "PROVIDER_NOT_CONFIGURED",
        `Embedding provider "${provider}" is not implemented. Set EMBEDDING_PROVIDER=openai.`,
        { recoverable: true },
      ),
    );
  }

  if (!apiKey) {
    return err(
      new LumenError(
        "CONFIG_MISSING",
        "EMBEDDING_API_KEY is not set; the embedding provider is unavailable.",
        { recoverable: true },
      ),
    );
  }

  return ok(
    createOpenAIEmbeddingProvider({ apiKey, model, baseUrl, dimensions }),
  );
}

/** Register the configured provider into the shared AI registry (idempotent-ish). */
export function registerConfiguredEmbeddingProvider(): Result<EmbeddingProvider> {
  const built = getEmbeddingProviderFromConfig();
  if (built.ok) registerEmbeddingProvider(built.value);
  return built;
}

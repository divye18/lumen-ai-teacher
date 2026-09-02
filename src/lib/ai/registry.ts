import "server-only";

import { ProviderNotConfiguredError } from "@/lib/errors";

import type { EmbeddingProvider, LLMProvider } from "./types";

/**
 * Provider registry.
 *
 * Phase 2+ code calls `getLLMProvider()` / `getEmbeddingProvider()` and never
 * imports a vendor SDK directly. Implementations register themselves once, at
 * server startup, with `registerLLMProvider()` / `registerEmbeddingProvider()`.
 *
 * During the foundation phase nothing is registered, so the getters throw a
 * recoverable {@link ProviderNotConfiguredError}.
 */

let llmProvider: LLMProvider | null = null;
let embeddingProvider: EmbeddingProvider | null = null;

export function registerLLMProvider(provider: LLMProvider): void {
  llmProvider = provider;
}

export function registerEmbeddingProvider(provider: EmbeddingProvider): void {
  embeddingProvider = provider;
}

export function getLLMProvider(): LLMProvider {
  if (!llmProvider) {
    throw new ProviderNotConfiguredError("llm");
  }
  return llmProvider;
}

export function getEmbeddingProvider(): EmbeddingProvider {
  if (!embeddingProvider) {
    throw new ProviderNotConfiguredError("embedding");
  }
  return embeddingProvider;
}

export function isLLMConfigured(): boolean {
  return llmProvider !== null;
}

export function isEmbeddingConfigured(): boolean {
  return embeddingProvider !== null;
}

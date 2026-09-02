import type { Result } from "@/lib/result";

/**
 * PROVIDER ABSTRACTIONS — LLM + embeddings.
 *
 * The rest of the application depends on these interfaces, never on a vendor
 * SDK. Concrete implementations are added in a later phase and registered via
 * `@/lib/ai/registry`.
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMGenerateOptions {
  messages: ChatMessage[];
  /** Model id override; defaults to the provider's configured model. */
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
  /** Cooperative cancellation. */
  signal?: AbortSignal;
}

export interface LLMGenerateResult {
  text: string;
  model: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
  finishReason: "stop" | "length" | "content-filter" | "other";
}

/**
 * A text-generation provider. Implementations must not leak vendor types
 * across this boundary.
 */
export interface LLMProvider {
  readonly id: string;
  generate(options: LLMGenerateOptions): Promise<Result<LLMGenerateResult>>;
}

export interface EmbedOptions {
  input: string[];
  model?: string;
  signal?: AbortSignal;
}

export interface EmbedResult {
  /** One vector per input, in order. */
  vectors: number[][];
  model: string;
  dimensions: number;
}

export interface EmbeddingProvider {
  readonly id: string;
  embed(options: EmbedOptions): Promise<Result<EmbedResult>>;
}

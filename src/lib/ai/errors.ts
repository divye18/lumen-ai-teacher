import { LumenError } from "@/lib/errors";

/**
 * An embedding provider failed (network, HTTP error, malformed response,
 * dimension mismatch). Recoverable — callers may retry or degrade.
 */
export class EmbeddingProviderError extends LumenError {
  constructor(message: string, options: { cause?: unknown } = {}) {
    super("EMBEDDING_ERROR", message, {
      recoverable: true,
      cause: options.cause,
    });
    this.name = "EmbeddingProviderError";
  }
}

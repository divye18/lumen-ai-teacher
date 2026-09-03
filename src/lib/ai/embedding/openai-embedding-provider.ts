import { err, ok, type Result } from "@/lib/result";

import { EmbeddingProviderError } from "../errors";
import type { EmbeddingProvider, EmbedOptions, EmbedResult } from "../types";

/**
 * Embedding provider for the OpenAI `/embeddings` REST API (and compatible
 * gateways). Implemented with `fetch` only — no vendor SDK — so nothing leaks
 * past the {@link EmbeddingProvider} interface.
 */

export interface OpenAIEmbeddingConfig {
  apiKey: string;
  /** e.g. "text-embedding-3-small". */
  model: string;
  /** API root, e.g. "https://api.openai.com/v1". */
  baseUrl: string;
  /** Output vector size. Must equal the DB `vector(N)` dimension. */
  dimensions: number;
  /** Injectable for tests; defaults to global `fetch`. */
  fetchImpl?: typeof fetch;
  /** Per-request timeout in ms. */
  timeoutMs?: number;
}

interface OpenAIEmbeddingResponse {
  data?: { embedding?: number[]; index?: number }[];
  model?: string;
  error?: { message?: string };
}

export function createOpenAIEmbeddingProvider(
  config: OpenAIEmbeddingConfig,
): EmbeddingProvider {
  const doFetch = config.fetchImpl ?? fetch;
  const endpoint = `${config.baseUrl.replace(/\/$/, "")}/embeddings`;
  const timeoutMs = config.timeoutMs ?? 30_000;

  return {
    id: `openai:${config.model}`,

    async embed(options: EmbedOptions): Promise<Result<EmbedResult>> {
      if (options.input.length === 0) {
        return ok({
          vectors: [],
          model: options.model ?? config.model,
          dimensions: config.dimensions,
        });
      }

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
            input: options.input,
            dimensions: config.dimensions,
            encoding_format: "float",
          }),
          signal: controller.signal,
        });
      } catch (cause) {
        return err(
          new EmbeddingProviderError(
            `request to ${endpoint} failed: ${
              cause instanceof Error ? cause.message : "network error"
            }`,
            { cause },
          ),
        );
      } finally {
        clearTimeout(timer);
      }

      let body: OpenAIEmbeddingResponse;
      try {
        body = (await response.json()) as OpenAIEmbeddingResponse;
      } catch (cause) {
        return err(
          new EmbeddingProviderError("response was not valid JSON", { cause }),
        );
      }

      if (!response.ok) {
        return err(
          new EmbeddingProviderError(
            `provider returned HTTP ${response.status}${
              body.error?.message ? `: ${body.error.message}` : ""
            }`,
          ),
        );
      }

      const rows = body.data;
      if (!Array.isArray(rows) || rows.length !== options.input.length) {
        return err(
          new EmbeddingProviderError(
            `expected ${options.input.length} embeddings, received ${
              Array.isArray(rows) ? rows.length : "none"
            }`,
          ),
        );
      }

      const ordered = [...rows].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
      const vectors: number[][] = [];
      for (const row of ordered) {
        const vector = row.embedding;
        if (!Array.isArray(vector) || vector.length !== config.dimensions) {
          return err(
            new EmbeddingProviderError(
              `embedding dimension mismatch: expected ${config.dimensions}, got ${
                Array.isArray(vector) ? vector.length : "non-array"
              }`,
            ),
          );
        }
        vectors.push(vector);
      }

      return ok({
        vectors,
        model: body.model ?? model,
        dimensions: config.dimensions,
      });
    },
  };
}

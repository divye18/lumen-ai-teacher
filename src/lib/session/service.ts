import "server-only";

import { getEmbeddingProviderFromConfig } from "@/lib/ai/embedding";
import { getLLMProviderFromConfig } from "@/lib/ai/llm";
import type { LLMProvider } from "@/lib/ai/types";
import type { LumenServerClient } from "@/lib/db/server";
import { createSupabaseRetriever, type Retriever } from "@/lib/rag";

import {
  createTeachingOrchestrator,
  type TeachingOrchestrator,
} from "./orchestrator";

export interface TeachingRuntime {
  orchestrator: TeachingOrchestrator;
  llm: LLMProvider | null;
  retriever: Retriever | null;
  /** True when a language model is configured (engine runs AI-assisted). */
  llmConfigured: boolean;
  /** True when retrieval is available (lessons can be source-grounded). */
  retrievalConfigured: boolean;
}

/**
 * Assemble the teaching runtime for one request. Missing AI/retrieval config
 * degrades gracefully: the engine falls back to deterministic policy and
 * lessons are planned from general knowledge.
 */
export function buildTeachingRuntime(
  db: LumenServerClient,
  userId: string,
): TeachingRuntime {
  const llmResult = getLLMProviderFromConfig();
  const llm = llmResult.ok ? llmResult.value : null;

  let retriever: Retriever | null = null;
  const embeddingsResult = getEmbeddingProviderFromConfig();
  if (embeddingsResult.ok) {
    retriever = createSupabaseRetriever({
      db,
      embeddings: embeddingsResult.value,
      userId,
    });
  }

  return {
    orchestrator: createTeachingOrchestrator({ db, llm, retriever, userId }),
    llm,
    retriever,
    llmConfigured: llm !== null,
    retrievalConfigured: retriever !== null,
  };
}

export { createLessonForUser } from "@/lib/lesson/service";

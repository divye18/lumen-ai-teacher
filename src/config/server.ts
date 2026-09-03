import "server-only";

import { z } from "zod";

import { publicConfig } from "./public";

/**
 * SERVER-ONLY configuration.
 *
 * This module imports `server-only`, so any attempt to include it in a client
 * bundle is a build error. Secrets live here and must never be re-exported to
 * client components.
 *
 * Provider credentials are intentionally optional during the foundation phase.
 * Concrete provider implementations (added later) are responsible for asserting
 * that the values they need are present.
 */
const serverEnvSchema = z.object({
  APP_ENV: z
    .enum(["development", "preview", "production"])
    .default("development"),

  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),

  LLM_PROVIDER: z.string().min(1).default("openai"),
  LLM_API_KEY: z.string().min(1).optional(),
  LLM_MODEL: z.string().min(1).default("gpt-4o-mini"),
  LLM_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
  LLM_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.2),

  EMBEDDING_PROVIDER: z.string().min(1).default("openai"),
  EMBEDDING_API_KEY: z.string().min(1).optional(),
  EMBEDDING_MODEL: z.string().min(1).default("text-embedding-3-small"),
  EMBEDDING_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
  EMBEDDING_DIMENSIONS: z.coerce.number().int().positive().default(1536),

  // RAG ingestion tuning. Chunk sizes are in characters.
  RAG_MAX_PDF_BYTES: z.coerce.number().int().positive().default(15_000_000),
  RAG_CHUNK_SIZE: z.coerce.number().int().positive().default(1000),
  RAG_CHUNK_OVERLAP: z.coerce.number().int().min(0).default(150),
  RAG_MIN_CHUNK_SIZE: z.coerce.number().int().positive().default(120),

  SPEECH_TO_TEXT_PROVIDER: z.string().min(1).optional(),
  SPEECH_TO_TEXT_API_KEY: z.string().min(1).optional(),
  TEXT_TO_SPEECH_PROVIDER: z.string().min(1).optional(),
  TEXT_TO_SPEECH_API_KEY: z.string().min(1).optional(),
  AVATAR_PROVIDER: z.string().min(1).optional(),
  AVATAR_API_KEY: z.string().min(1).optional(),
});

const parsed = serverEnvSchema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(
    `Invalid server environment configuration:\n${parsed.error.toString()}`,
  );
}

const env = parsed.data;

export const serverConfig = {
  appEnv: env.APP_ENV,
  isProduction: env.APP_ENV === "production",

  /** Public values are also readable on the server for convenience. */
  public: publicConfig,

  supabase: {
    url: publicConfig.supabase.url,
    anonKey: publicConfig.supabase.anonKey,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
  },

  ai: {
    llm: {
      provider: env.LLM_PROVIDER,
      apiKey: env.LLM_API_KEY,
      model: env.LLM_MODEL,
      baseUrl: env.LLM_BASE_URL,
      temperature: env.LLM_TEMPERATURE,
    },
    embedding: {
      provider: env.EMBEDDING_PROVIDER,
      apiKey: env.EMBEDDING_API_KEY,
      model: env.EMBEDDING_MODEL,
      baseUrl: env.EMBEDDING_BASE_URL,
      dimensions: env.EMBEDDING_DIMENSIONS,
    },
  },

  rag: {
    maxPdfBytes: env.RAG_MAX_PDF_BYTES,
    chunkSize: env.RAG_CHUNK_SIZE,
    chunkOverlap: env.RAG_CHUNK_OVERLAP,
    minChunkSize: env.RAG_MIN_CHUNK_SIZE,
  },

  voice: {
    speechToText: {
      provider: env.SPEECH_TO_TEXT_PROVIDER,
      apiKey: env.SPEECH_TO_TEXT_API_KEY,
    },
    textToSpeech: {
      provider: env.TEXT_TO_SPEECH_PROVIDER,
      apiKey: env.TEXT_TO_SPEECH_API_KEY,
    },
  },

  avatar: {
    provider: env.AVATAR_PROVIDER,
    apiKey: env.AVATAR_API_KEY,
  },
} as const;

export type ServerConfig = typeof serverConfig;

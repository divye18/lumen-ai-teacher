/**
 * INTEGRATION — full ingest → retrieve loop against a real Supabase project
 * and a real embedding provider. Not part of `npm test`.
 *
 *   LUMEN_TEST_SUPABASE_URL=...            (project URL)
 *   LUMEN_TEST_SUPABASE_ANON_KEY=...       (anon/public key)
 *   LUMEN_TEST_SERVICE_ROLE_KEY=...        (service role key)
 *   LUMEN_TEST_EMBEDDING_API_KEY=...       (OpenAI-compatible key)
 *   npm run test:integration
 *
 * Every test self-skips if any of those are missing. Nothing is mocked.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createOpenAIEmbeddingProvider } from "@/lib/ai/embedding";
import type { Database } from "@/lib/db/types";

import { ingestPdf } from "./ingest";
import { createSupabaseRetriever } from "./retriever";

const url = process.env.LUMEN_TEST_SUPABASE_URL;
const anonKey = process.env.LUMEN_TEST_SUPABASE_ANON_KEY;
const serviceKey = process.env.LUMEN_TEST_SERVICE_ROLE_KEY;
const embeddingKey = process.env.LUMEN_TEST_EMBEDDING_API_KEY;

const ready = Boolean(url && anonKey && serviceKey && embeddingKey);

const SAMPLE_PDF = new Uint8Array(
  readFileSync(new URL("./__fixtures__/sample.pdf", import.meta.url)),
);

const embeddings = ready
  ? createOpenAIEmbeddingProvider({
      apiKey: embeddingKey as string,
      model: "text-embedding-3-small",
      baseUrl: "https://api.openai.com/v1",
      dimensions: 1536,
    })
  : null;

describe.skipIf(!ready)("RAG ingest + retrieve (integration)", () => {
  let admin: ReturnType<typeof createClient<Database>>;
  const suffix = randomUUID().slice(0, 8);
  const userA = {
    email: `lumen-a-${suffix}@example.test`,
    password: randomUUID(),
    id: "",
  };
  const userB = {
    email: `lumen-b-${suffix}@example.test`,
    password: randomUUID(),
    id: "",
  };
  let clientA: ReturnType<typeof createClient<Database>>;
  let clientB: ReturnType<typeof createClient<Database>>;

  beforeAll(async () => {
    admin = createClient<Database>(url as string, serviceKey as string);
    for (const u of [userA, userB]) {
      const created = await admin.auth.admin.createUser({
        email: u.email,
        password: u.password,
        email_confirm: true,
      });
      if (created.error) throw created.error;
      u.id = created.data.user.id;
    }

    clientA = createClient<Database>(url as string, anonKey as string);
    clientB = createClient<Database>(url as string, anonKey as string);
    for (const [client, u] of [
      [clientA, userA],
      [clientB, userB],
    ] as const) {
      const signIn = await client.auth.signInWithPassword({
        email: u.email,
        password: u.password,
      });
      if (signIn.error) throw signIn.error;
    }
  }, 30_000);

  afterAll(async () => {
    for (const u of [userA, userB]) {
      if (u.id) await admin.auth.admin.deleteUser(u.id);
    }
  });

  it("ingests a PDF and retrieves citeable chunks for the owner", async () => {
    const ingest = await ingestPdf({
      db: clientA,
      embeddings: embeddings!,
      embeddingDimensions: 1536,
      userId: userA.id,
      fileName: "memory-notes.pdf",
      mimeType: "application/pdf",
      bytes: SAMPLE_PDF,
      maxBytes: 15_000_000,
    });
    expect(ingest.ok).toBe(true);
    if (!ingest.ok) return;
    expect(ingest.value.chunkCount).toBeGreaterThan(0);

    const retriever = createSupabaseRetriever({
      db: clientA,
      embeddings: embeddings!,
      userId: userA.id,
    });
    const result = await retriever.retrieve({
      userId: userA.id,
      text: "is cache faster than main RAM?",
      topK: 3,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.length).toBeGreaterThan(0);

    const top = result.value[0];
    expect(top.score).toBeGreaterThan(0);
    expect(top.score).toBeLessThanOrEqual(1);
    expect(top.citation.documentName).toBe("memory-notes");
    expect(top.citation.pageNumber).toBe(1);
    expect(top.citation.chunkId).toMatch(/[0-9a-f-]{36}/);
  }, 60_000);

  it("never returns another user's chunks", async () => {
    const retriever = createSupabaseRetriever({
      db: clientB,
      embeddings: embeddings!,
      userId: userB.id,
    });
    const result = await retriever.retrieve({
      userId: userB.id,
      text: "is cache faster than main RAM?",
      topK: 5,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(0);
  }, 30_000);
});

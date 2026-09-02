/**
 * INTEGRATION tests — run against a real Supabase Postgres instance.
 *
 * These are NOT part of the default `npm test` run (vitest excludes
 * `*.integration.test.ts`). Run them explicitly once a local stack is up:
 *
 *   npx supabase start
 *   npx supabase db reset            # applies migrations + seed
 *   LUMEN_TEST_SUPABASE_URL=http://127.0.0.1:54321 \
 *   LUMEN_TEST_SERVICE_ROLE_KEY=<local service_role key> \
 *   npm run test:integration
 *
 * Without those env vars every test below is skipped — nothing is faked.
 */
import { createClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

import type { Database } from "../types";
import { createMasteryStore } from "./mastery-store";
import { createLearnerProfileStore } from "./learner-profile-store";

const url = process.env.LUMEN_TEST_SUPABASE_URL;
const key = process.env.LUMEN_TEST_SERVICE_ROLE_KEY;
const SEED_USER = "00000000-0000-0000-0000-000000000001";
const SEED_CONCEPT_CPU = "c0000000-0000-0000-0000-000000000001";

describe.skipIf(!url || !key)("repositories (integration)", () => {
  let db: ReturnType<typeof createClient<Database>>;

  beforeAll(() => {
    db = createClient<Database>(url as string, key as string);
  });

  it("reads seeded learner profile", async () => {
    const store = createLearnerProfileStore(db);
    const res = await store.get(SEED_USER);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.preferred_language).toBe("en");
  });

  it("enforces the mastery score bound at the database", async () => {
    const store = createMasteryStore(db);
    // Bypass the Zod guard to prove the DB CHECK also rejects it.
    const raw = await db
      .from("concept_mastery")
      .update({ mastery_score: 5 })
      .eq("user_id", SEED_USER)
      .eq("concept_id", SEED_CONCEPT_CPU);
    expect(raw.error).not.toBeNull();

    const guarded = await store.upsert({
      userId: SEED_USER,
      conceptId: SEED_CONCEPT_CPU,
      masteryScore: 5,
    });
    expect(guarded.ok).toBe(false);
  });

  it("keeps one mastery row per (user, concept)", async () => {
    const store = createMasteryStore(db);
    await store.upsert({
      userId: SEED_USER,
      conceptId: SEED_CONCEPT_CPU,
      masteryScore: 0.91,
    });
    const all = await store.listForUser(SEED_USER);
    expect(all.ok).toBe(true);
    if (all.ok) {
      const cpu = all.value.filter((r) => r.concept_id === SEED_CONCEPT_CPU);
      expect(cpu).toHaveLength(1);
    }
  });
});

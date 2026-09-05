/**
 * INTEGRATION — diagnostic completion concurrency, against a real Supabase
 * project. Not part of `npm test`.
 *
 *   LUMEN_TEST_SUPABASE_URL=...
 *   LUMEN_TEST_SUPABASE_ANON_KEY=...
 *   LUMEN_TEST_SERVICE_ROLE_KEY=...
 *   npm run test:integration
 *
 * Proves the server-side invariant the CAS guard in
 * `submitDiagnostic`/`AssessmentStore.complete` protects — not just that a
 * button visually disables:
 *
 *   1. Two concurrent submissions of the SAME final diagnostic answer batch
 *      (the double-click / double-tap race) result in exactly ONE actual
 *      grading + mastery write. `concept_mastery.attempt_count` ends at 1,
 *      never 2, and exactly one of the two responses reports
 *      `alreadyCompleted: false`.
 *   2. A sequential retry of the same batch after the diagnostic is already
 *      complete is a pure, idempotent replay — no re-grading, no second
 *      mastery write, no change to the stored summary.
 *
 * Uses the curated demo lesson (memory hierarchy / cache / etc.) so every
 * question resolves through the deterministic authored bank — no LLM
 * required, matching how the diagnostic engine is designed to run.
 * Self-skips when DB creds are missing.
 */
import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "@/lib/db/types";
import { createMasteryStore } from "@/lib/db/repositories";
import { ensureDemoSession } from "@/lib/demo";
import type { ClientStructuredQuestion } from "@/lib/assessment/structured";
import type { DiagnosticQuestionItemView } from "./diagnostic-flow";

import { createTeachingOrchestrator } from "./orchestrator";

const url = process.env.LUMEN_TEST_SUPABASE_URL;
const anonKey = process.env.LUMEN_TEST_SUPABASE_ANON_KEY;
const serviceKey = process.env.LUMEN_TEST_SERVICE_ROLE_KEY;

const ready = Boolean(url && anonKey && serviceKey);

/** Any structurally valid answer — correctness is irrelevant to these tests. */
function anyValidAnswer(q: ClientStructuredQuestion) {
  switch (q.format) {
    case "MCQ":
      return { format: "MCQ" as const, selectedId: q.mcq!.options[0].id };
    case "MULTI_SELECT":
      return {
        format: "MULTI_SELECT" as const,
        selectedIds: [q.multiSelect!.options[0].id],
      };
    case "TRUE_FALSE":
      return { format: "TRUE_FALSE" as const, value: true };
    case "ORDER_STEPS":
      return {
        format: "ORDER_STEPS" as const,
        order: q.orderSteps!.items.map((i) => i.id),
      };
    case "CLASSIFY": {
      const bucketId = q.classify!.buckets[0].id;
      const assignments: Record<string, string> = {};
      for (const item of q.classify!.items) assignments[item.id] = bucketId;
      return { format: "CLASSIFY" as const, assignments };
    }
    case "MATCH_RELATIONSHIP": {
      const rightId = q.matchRelationship!.right[0].id;
      return {
        format: "MATCH_RELATIONSHIP" as const,
        pairs: q.matchRelationship!.left.map((l) => ({
          leftId: l.id,
          rightId,
        })),
      };
    }
  }
}

function answersFor(items: DiagnosticQuestionItemView[]) {
  return items.map((item) => ({
    conceptKey: item.conceptKey,
    answer: anyValidAnswer(item.structured),
  }));
}

describe.skipIf(!ready)(
  "diagnostic completion concurrency (integration)",
  () => {
    let admin: ReturnType<typeof createClient<Database>>;
    let client: ReturnType<typeof createClient<Database>>;
    const user = {
      email: `lumen-diag-${randomUUID().slice(0, 8)}@example.test`,
      password: randomUUID(),
      id: "",
    };

    beforeAll(async () => {
      admin = createClient<Database>(url as string, serviceKey as string);
      const created = await admin.auth.admin.createUser({
        email: user.email,
        password: user.password,
        email_confirm: true,
      });
      if (created.error) throw created.error;
      user.id = created.data.user.id;

      client = createClient<Database>(url as string, anonKey as string);
      const signIn = await client.auth.signInWithPassword({
        email: user.email,
        password: user.password,
      });
      if (signIn.error) throw signIn.error;
    }, 30_000);

    afterAll(async () => {
      // Cascades: profile -> lessons/concepts/sessions/mastery/assessments.
      if (user.id) await admin.auth.admin.deleteUser(user.id);
    });

    it("a concurrent double-submit of the final question completes exactly once", async () => {
      const demo = await ensureDemoSession(client, user.id);
      expect(demo.ok).toBe(true);
      if (!demo.ok) return;

      const orchestrator = createTeachingOrchestrator({
        db: client,
        llm: null,
        retriever: null,
        userId: user.id,
      });

      // A fresh learner + this lesson's concepts -> the diagnostic triggers.
      const started = await orchestrator.startOrResume({
        lessonId: demo.value.lessonId,
      });
      expect(started.ok).toBe(true);
      if (!started.ok) return;
      expect(started.value.diagnostic).not.toBeNull();
      const items = started.value.diagnostic!.items;
      expect(items.length).toBeGreaterThan(0);

      const sessionId = started.value.sessionId;
      const answers = answersFor(items);

      // The race: two callers submit the SAME final answer batch at once.
      const [a, b] = await Promise.all([
        orchestrator.submitDiagnostic({ sessionId, answers }),
        orchestrator.submitDiagnostic({ sessionId, answers }),
      ]);
      expect(a.ok).toBe(true);
      expect(b.ok).toBe(true);
      if (!a.ok || !b.ok) return;

      // Exactly one request actually performed the grading/write; the other
      // lost the CAS claim and replayed the winner's already-completed state.
      const completions = [a.value, b.value].filter((r) => !r.alreadyCompleted);
      expect(completions).toHaveLength(1);
      const replays = [a.value, b.value].filter((r) => r.alreadyCompleted);
      expect(replays).toHaveLength(1);
      // Both responses describe the SAME outcome regardless of which won.
      expect(a.value.summary).toEqual(b.value.summary);

      // The real invariant: mastery was written exactly once, not twice.
      const conceptKey = items[0].conceptKey;
      const conceptsRes = await import("@/lib/db/repositories").then((m) =>
        m.createLessonStore(client).listConcepts(demo.value.lessonId),
      );
      expect(conceptsRes.ok).toBe(true);
      if (!conceptsRes.ok) return;
      const conceptId = conceptsRes.value.find(
        (c) => c.concept_key === conceptKey,
      )?.concept_id;
      expect(conceptId).toBeTruthy();
      if (!conceptId) return;

      const mastery = createMasteryStore(client);
      const masteryRow = await mastery.get(user.id, conceptId);
      expect(masteryRow.ok).toBe(true);
      if (masteryRow.ok) {
        expect(masteryRow.value.attempt_count).toBe(1);
      }
    }, 60_000);

    it("retrying the same batch after completion is a pure idempotent replay", async () => {
      // The first test's user now has lesson-scoped mastery, so
      // needsDiagnostic would no longer trigger for them — sign up a second
      // ephemeral learner scoped to just this test.
      const second = {
        email: `lumen-diag-retry-${randomUUID().slice(0, 8)}@example.test`,
        password: randomUUID(),
        id: "",
      };
      const created = await admin.auth.admin.createUser({
        email: second.email,
        password: second.password,
        email_confirm: true,
      });
      expect(created.error).toBeNull();
      second.id = created.data.user!.id;
      try {
        const secondClient = createClient<Database>(
          url as string,
          anonKey as string,
        );
        const signIn = await secondClient.auth.signInWithPassword({
          email: second.email,
          password: second.password,
        });
        expect(signIn.error).toBeNull();

        const demo2 = await ensureDemoSession(secondClient, second.id);
        expect(demo2.ok).toBe(true);
        if (!demo2.ok) return;

        const secondOrchestrator = createTeachingOrchestrator({
          db: secondClient,
          llm: null,
          retriever: null,
          userId: second.id,
        });

        const started = await secondOrchestrator.startOrResume({
          lessonId: demo2.value.lessonId,
        });
        expect(started.ok).toBe(true);
        if (!started.ok) return;
        const items = started.value.diagnostic!.items;
        const sessionId = started.value.sessionId;
        const answers = answersFor(items);

        const first = await secondOrchestrator.submitDiagnostic({
          sessionId,
          answers,
        });
        expect(first.ok).toBe(true);
        if (!first.ok) return;
        expect(first.value.alreadyCompleted).toBe(false);

        // Retry: the exact same batch, submitted again after completion.
        const retry = await secondOrchestrator.submitDiagnostic({
          sessionId,
          answers,
        });
        expect(retry.ok).toBe(true);
        if (!retry.ok) return;
        expect(retry.value.alreadyCompleted).toBe(true);
        expect(retry.value.summary).toEqual(first.value.summary);

        // No second write: attempt_count is still exactly 1.
        const conceptsRes = await import("@/lib/db/repositories").then((m) =>
          m.createLessonStore(secondClient).listConcepts(demo2.value.lessonId),
        );
        expect(conceptsRes.ok).toBe(true);
        if (!conceptsRes.ok) return;
        const conceptId = conceptsRes.value.find(
          (c) => c.concept_key === items[0].conceptKey,
        )?.concept_id;
        if (conceptId) {
          const mastery = createMasteryStore(secondClient);
          const masteryRow = await mastery.get(second.id, conceptId);
          if (masteryRow.ok) expect(masteryRow.value.attempt_count).toBe(1);
        }
      } finally {
        if (second.id) await admin.auth.admin.deleteUser(second.id);
      }
    }, 60_000);
  },
);

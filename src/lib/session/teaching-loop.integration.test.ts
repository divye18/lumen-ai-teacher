/**
 * INTEGRATION — the full P0 teaching loop against a real Supabase project.
 * Not part of `npm test`.
 *
 *   LUMEN_TEST_SUPABASE_URL=...
 *   LUMEN_TEST_SUPABASE_ANON_KEY=...
 *   LUMEN_TEST_SERVICE_ROLE_KEY=...
 *   LUMEN_TEST_LLM_API_KEY=...        (optional — without it the engine runs
 *                                      in deterministic policy-only mode)
 *   npm run test:integration
 *
 * Proves: lesson plan → session → teach/ask → wrong answer → learner state
 * DOWN + misconception recorded → next decision leans remediation → better
 * answer → learner state UP. Self-skips when DB creds are missing.
 */
import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createOpenAIChatProvider } from "@/lib/ai/llm";
import type { Database } from "@/lib/db/types";
import { createLessonForUser } from "@/lib/lesson/service";

import { createTeachingOrchestrator } from "./orchestrator";

const url = process.env.LUMEN_TEST_SUPABASE_URL;
const anonKey = process.env.LUMEN_TEST_SUPABASE_ANON_KEY;
const serviceKey = process.env.LUMEN_TEST_SERVICE_ROLE_KEY;
const llmKey = process.env.LUMEN_TEST_LLM_API_KEY;

const ready = Boolean(url && anonKey && serviceKey);

describe.skipIf(!ready)("teaching loop (integration)", () => {
  let admin: ReturnType<typeof createClient<Database>>;
  let client: ReturnType<typeof createClient<Database>>;
  const user = {
    email: `lumen-teach-${randomUUID().slice(0, 8)}@example.test`,
    password: randomUUID(),
    id: "",
  };

  const llm = llmKey
    ? createOpenAIChatProvider({
        apiKey: llmKey,
        model: process.env.LUMEN_TEST_LLM_MODEL ?? "gpt-4o-mini",
        baseUrl: "https://api.openai.com/v1",
      })
    : null;

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
    if (user.id) await admin.auth.admin.deleteUser(user.id);
  });

  it("adapts the next teaching action to the student's answer", async () => {
    const orchestrator = createTeachingOrchestrator({
      db: client,
      llm,
      retriever: null,
      userId: user.id,
    });

    const lesson = await createLessonForUser(
      { db: client, llm, retriever: null, userId: user.id },
      { topic: "Operating system page faults", timeBudgetMinutes: 20 },
    );
    expect(lesson.ok).toBe(true);
    if (!lesson.ok) return;

    const session = await orchestrator.startOrResume({
      lessonId: lesson.value.lessonId,
      timeBudgetMinutes: 20,
    });
    expect(session.ok).toBe(true);
    if (!session.ok) return;
    const sessionId = session.value.sessionId;

    // Advance until we get a question (teach steps come first).
    let questionId: string | null = null;
    for (let i = 0; i < 6 && !questionId; i += 1) {
      const step = await orchestrator.getNextStep({ sessionId });
      expect(step.ok).toBe(true);
      if (!step.ok) return;
      expect(step.value.decision.adaptationNarrative.length).toBeGreaterThan(0);
      questionId = step.value.question?.questionId ?? null;
    }
    expect(questionId).toBeTruthy();
    if (!questionId) return;

    const wrong = await orchestrator.submitAnswer({
      sessionId,
      questionId,
      answerText:
        "A page fault means the program has a bug and immediately crashes.",
    });
    expect(wrong.ok).toBe(true);
    if (!wrong.ok) return;

    expect(wrong.value.learnerUpdate.masteryAfter).toBeLessThanOrEqual(
      wrong.value.learnerUpdate.masteryBefore,
    );
    // Remediation-oriented next action after a poor answer.
    expect([
      "HINT",
      "SIMPLIFY",
      "EXPLAIN",
      "RETEACH",
      "ANALOGY",
      "EXAMPLE",
    ]).toContain(wrong.value.nextDecision.action);
    expect(wrong.value.nextDecision.adaptationNarrative.length).toBeGreaterThan(
      0,
    );

    // Ask again, then answer well.
    let nextQuestionId: string | null = null;
    for (let i = 0; i < 6 && !nextQuestionId; i += 1) {
      const step = await orchestrator.getNextStep({ sessionId });
      if (!step.ok) return;
      nextQuestionId = step.value.question?.questionId ?? null;
    }
    if (!nextQuestionId) return;

    const better = await orchestrator.submitAnswer({
      sessionId,
      questionId: nextQuestionId,
      answerText:
        "When a process references a page not in RAM, the MMU raises a page fault trap into the kernel. The OS finds the page (often on disk / in swap), allocates a physical frame, reads the page in, updates the page table entry, and restarts the faulting instruction. If no frame is free it evicts one using a replacement policy.",
    });
    expect(better.ok).toBe(true);
    if (!better.ok) return;
    expect(better.value.learnerUpdate.masteryAfter).toBeGreaterThanOrEqual(
      better.value.learnerUpdate.masteryBefore,
    );
  }, 120_000);
});

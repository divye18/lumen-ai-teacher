/**
 * INTEGRATION — the ASSESSMENT_LLM_ENABLED gate, against a real Supabase
 * project. Not part of `npm test`.
 *
 *   LUMEN_TEST_SUPABASE_URL=...
 *   LUMEN_TEST_SUPABASE_ANON_KEY=...
 *   LUMEN_TEST_SERVICE_ROLE_KEY=...
 *   npm run test:integration
 *
 * Regression coverage for the assessment/explanation separation: an LLM
 * provider being CONFIGURED must never, by itself, switch question
 * generation/grading/misconception detection away from the deterministic
 * structured path. Only `assessmentLlmEnabled: true` may do that.
 *
 * Uses a MOCK `LLMProvider` (never a real OpenAI call) that returns
 * schema-valid canned JSON per capability, so the assertions below prove
 * real behavior (which code path ran, what got persisted) rather than
 * depending on live model output. `createTeachingOrchestrator` is exercised
 * directly (bypassing `buildTeachingRuntime`) so `assessmentLlmEnabled` can
 * be set explicitly per test, independent of environment variables.
 *
 * Self-skips when DB creds are missing.
 */
import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

import type { Database } from "@/lib/db/types";
import {
  createInteractionStore,
  createMisconceptionStore,
  createTeachingQaStore,
} from "@/lib/db/repositories";
import { ensureDemoSession } from "@/lib/demo";
import { ok } from "@/lib/result";
import type { LLMProvider } from "@/lib/ai/types";
import {
  structuredQuestionFromRow,
  type StructuredAnswer,
  type StructuredQuestion,
} from "@/lib/assessment/structured";

import { createTeachingOrchestrator } from "./orchestrator";

const url = process.env.LUMEN_TEST_SUPABASE_URL;
const anonKey = process.env.LUMEN_TEST_SUPABASE_ANON_KEY;
const serviceKey = process.env.LUMEN_TEST_SERVICE_ROLE_KEY;

const ready = Boolean(url && anonKey && serviceKey);

/**
 * A mock `LLMProvider` that never calls a real model. It returns
 * schema-valid canned JSON, keyed off which prompt builder's distinctive
 * system-prompt marker is present, so every capability (question
 * generation, answer evaluation, engine decision, teaching content) can
 * genuinely succeed via this mock without a live API call. `calls` records
 * every invocation's marker for assertions.
 */
function createMockLLMProvider(): { provider: LLMProvider; calls: string[] } {
  const calls: string[] = [];
  const provider: LLMProvider = {
    id: "mock-llm-provider",
    async generate(options) {
      const system =
        options.messages.find((m) => m.role === "system")?.content ?? "";
      if (system.includes("Question Generator")) {
        calls.push("question-generator");
        return ok({
          text: JSON.stringify({
            kind: "CONCEPTUAL",
            difficulty: 2,
            prompt: "Mock AI-generated question: explain this concept.",
            expectedReasoning:
              "A strong answer names the mechanism and why it matters.",
            groundedInSource: false,
          }),
          model: "mock",
          finishReason: "stop",
        });
      }
      if (system.includes("Answer Evaluator")) {
        calls.push("answer-evaluator");
        return ok({
          text: JSON.stringify({
            classification: "CORRECT",
            correctnessScore: 1,
            confidence: 0.9,
            reasoningQuality: "sound",
            missingConcepts: [],
            misconceptionCandidates: [],
            feedback: "Nice work — that's correct.",
            rationale: "mock evaluator",
          }),
          model: "mock",
          finishReason: "stop",
        });
      }
      if (system.includes("Teaching Engine")) {
        calls.push("teaching-engine");
        return ok({
          text: JSON.stringify({
            action: "EXPLAIN",
            strategy: "formal",
            difficultyDirection: "SAME",
            targetConceptKey: "mock-concept",
            reason: "Mock engine reason.",
            nextAction: "ASK",
          }),
          model: "mock",
          finishReason: "stop",
        });
      }
      // Teaching-content (explanation) prompt — the remaining capability.
      calls.push("teaching-content");
      return ok({
        text: JSON.stringify({
          title: "Mock AI Explanation",
          body: "This is a mock AI-generated explanation, long enough to pass validation, proving the explanation surface calls the LLM independently of assessment.",
          groundedInSource: false,
        }),
        model: "mock",
        finishReason: "stop",
      });
    },
  };
  return { provider, calls };
}

/** Any structurally valid answer — used only to clear the diagnostic gate. */
function anyValidAnswer(structured: {
  format: string;
  mcq?: { options: { id: string }[] };
  multiSelect?: { options: { id: string }[] };
  trueFalse?: unknown;
  orderSteps?: { items: { id: string }[] };
  classify?: { buckets: { id: string }[]; items: { id: string }[] };
  matchRelationship?: { left: { id: string }[]; right: { id: string }[] };
}) {
  switch (structured.format) {
    case "MCQ":
      return {
        format: "MCQ" as const,
        selectedId: structured.mcq!.options[0].id,
      };
    case "MULTI_SELECT":
      return {
        format: "MULTI_SELECT" as const,
        selectedIds: [structured.multiSelect!.options[0].id],
      };
    case "TRUE_FALSE":
      return { format: "TRUE_FALSE" as const, value: true };
    case "ORDER_STEPS":
      return {
        format: "ORDER_STEPS" as const,
        order: structured.orderSteps!.items.map((i) => i.id),
      };
    case "CLASSIFY": {
      const bucketId = structured.classify!.buckets[0].id;
      const assignments: Record<string, string> = {};
      for (const item of structured.classify!.items) {
        assignments[item.id] = bucketId;
      }
      return { format: "CLASSIFY" as const, assignments };
    }
    case "MATCH_RELATIONSHIP": {
      const rightId = structured.matchRelationship!.right[0].id;
      return {
        format: "MATCH_RELATIONSHIP" as const,
        pairs: structured.matchRelationship!.left.map((l) => ({
          leftId: l.id,
          rightId,
        })),
      };
    }
    default:
      throw new Error(`unhandled format: ${structured.format}`);
  }
}

/** The genuinely correct answer, from the SERVER-side answer key. */
function correctAnswerFor(q: StructuredQuestion): StructuredAnswer {
  switch (q.format) {
    case "MCQ":
      return { format: "MCQ", selectedId: q.data.correctId };
    case "MULTI_SELECT":
      return { format: "MULTI_SELECT", selectedIds: [...q.data.correctIds] };
    case "TRUE_FALSE":
      return { format: "TRUE_FALSE", value: q.data.answer };
    case "ORDER_STEPS":
      return { format: "ORDER_STEPS", order: [...q.data.correctOrder] };
    case "CLASSIFY": {
      const assignments: Record<string, string> = {};
      for (const item of q.data.items)
        assignments[item.id] = item.correctBucketId;
      return { format: "CLASSIFY", assignments };
    }
    case "MATCH_RELATIONSHIP":
      return {
        format: "MATCH_RELATIONSHIP",
        pairs: q.data.correctPairs.map((p) => ({ ...p })),
      };
  }
}

function wrongAnswerFor(q: StructuredQuestion): StructuredAnswer {
  switch (q.format) {
    case "MCQ": {
      const wrong =
        q.data.options.find(
          (o) => o.id !== q.data.correctId && o.misconception,
        ) ?? q.data.options.find((o) => o.id !== q.data.correctId)!;
      return { format: "MCQ", selectedId: wrong.id };
    }
    case "MULTI_SELECT": {
      const wrong = q.data.options.find(
        (o) => !q.data.correctIds.includes(o.id),
      );
      return { format: "MULTI_SELECT", selectedIds: wrong ? [wrong.id] : [] };
    }
    case "TRUE_FALSE":
      return { format: "TRUE_FALSE", value: !q.data.answer };
    case "ORDER_STEPS":
      return {
        format: "ORDER_STEPS",
        order: [...q.data.correctOrder].reverse(),
      };
    case "CLASSIFY": {
      const buckets = q.data.buckets.map((b) => b.id);
      const assignments: Record<string, string> = {};
      for (const item of q.data.items) {
        const wrongBucket =
          buckets.find((b) => b !== item.correctBucketId) ??
          item.correctBucketId;
        assignments[item.id] = wrongBucket;
      }
      return { format: "CLASSIFY", assignments };
    }
    case "MATCH_RELATIONSHIP": {
      const rights = q.data.right.map((r) => r.id);
      return {
        format: "MATCH_RELATIONSHIP",
        pairs: q.data.correctPairs.map((p) => ({
          leftId: p.leftId,
          rightId: rights.find((r) => r !== p.rightId) ?? p.rightId,
        })),
      };
    }
  }
}

describe.skipIf(!ready)("assessment/explanation LLM gate (integration)", () => {
  let admin: ReturnType<typeof createClient<Database>>;

  beforeAll(() => {
    admin = createClient<Database>(url as string, serviceKey as string);
  });

  async function newUser(label: string) {
    const email = `lumen-gate-${label}-${randomUUID().slice(0, 8)}@example.test`;
    const password = randomUUID();
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    expect(created.error).toBeNull();
    const id = created.data.user!.id;
    const client = createClient<Database>(url as string, anonKey as string);
    const signIn = await client.auth.signInWithPassword({ email, password });
    expect(signIn.error).toBeNull();
    return { id, client };
  }

  async function startedSessionWithClearedDiagnostic(
    orchestrator: ReturnType<typeof createTeachingOrchestrator>,
    client: ReturnType<typeof createClient<Database>>,
    userId: string,
  ) {
    const demo = await ensureDemoSession(client, userId);
    expect(demo.ok).toBe(true);
    if (!demo.ok) throw new Error("demo session setup failed");
    const started = await orchestrator.startOrResume({
      lessonId: demo.value.lessonId,
    });
    expect(started.ok).toBe(true);
    if (!started.ok) throw new Error("startOrResume failed");
    const sessionId = started.value.sessionId;
    if (started.value.diagnostic) {
      const answers = started.value.diagnostic.items.map((item) => ({
        conceptKey: item.conceptKey,
        answer: anyValidAnswer(item.structured),
      }));
      const submitted = await orchestrator.submitDiagnostic({
        sessionId,
        answers,
      });
      expect(submitted.ok).toBe(true);
      await orchestrator.submitDiagnostic({ sessionId, answers: [] });
    }
    return sessionId;
  }

  it("TEST 1-3: LLM configured + assessmentLlmEnabled=false -> structured question, deterministic grading, structured-metadata misconception", async () => {
    const { id: userId, client } = await newUser("off");
    try {
      const { provider: llm, calls } = createMockLLMProvider();
      const orchestrator = createTeachingOrchestrator({
        db: client,
        llm,
        retriever: null,
        userId,
        assessmentLlmEnabled: false,
      });
      const sessionId = await startedSessionWithClearedDiagnostic(
        orchestrator,
        client,
        userId,
      );

      const qa = createTeachingQaStore(client);
      const misconceptions = createMisconceptionStore(client);

      let firstQuestionId: string | null = null;
      let firstQuestion: StructuredQuestion | null = null;
      for (let i = 0; i < 10 && !firstQuestionId; i += 1) {
        const step = await orchestrator.getNextStep({ sessionId });
        expect(step.ok).toBe(true);
        if (!step.ok) return;
        if (step.value.question) {
          // TEST 1: the served question is structured, never FREE_FORM —
          // proves `pickStructuredQuestion` was used, not `generateQuestion`.
          expect(step.value.question.format).not.toBe("FREE_FORM");
          firstQuestionId = step.value.question.questionId;
          const row = await qa.getQuestion(firstQuestionId);
          expect(row.ok).toBe(true);
          if (row.ok) firstQuestion = structuredQuestionFromRow(row.value);
        }
      }
      expect(firstQuestionId).not.toBeNull();
      expect(firstQuestion).not.toBeNull();
      if (!firstQuestionId || !firstQuestion) return;

      // TEST 2: submit a deliberately wrong, misconception-mapped answer.
      // The structured-question branch in `submitAnswer` never calls
      // `evaluateAnswer` — grading is `gradeStructuredAnswer` (deterministic).
      const result = await orchestrator.submitAnswer({
        sessionId,
        questionId: firstQuestionId,
        answerText: JSON.stringify(wrongAnswerFor(firstQuestion)),
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.evaluation.classification).not.toBe("CORRECT");

      // The mock LLM must never have been asked to generate a question or
      // grade an answer — only (if anything) the teaching-engine/content
      // capabilities, which remain independently available.
      expect(calls).not.toContain("question-generator");
      expect(calls).not.toContain("answer-evaluator");

      // TEST 3: if this distractor mapped to a known misconception, it was
      // detected via the structured question's own distractor metadata
      // (deterministic), not an LLM-inferred candidate.
      if (result.value.learnerUpdate.newMisconceptions > 0) {
        const questionRow = await client
          .from("teaching_questions")
          .select("concept_id")
          .eq("id", firstQuestionId)
          .maybeSingle();
        const conceptId = questionRow.data?.concept_id;
        expect(conceptId).toBeTruthy();
        if (conceptId) {
          const rows = await misconceptions.listForConcept(userId, conceptId);
          expect(rows.ok).toBe(true);
          if (rows.ok) {
            expect(rows.value.some((r) => r.status === "ACTIVE")).toBe(true);
          }
        }
      }
    } finally {
      await admin.auth.admin.deleteUser(userId);
    }
  }, 90_000);

  it("TEST 4: LLM configured + assessmentLlmEnabled=true -> LLM-generated question/grading path is used", async () => {
    const { id: userId, client } = await newUser("on");
    try {
      const { provider: llm, calls } = createMockLLMProvider();
      const orchestrator = createTeachingOrchestrator({
        db: client,
        llm,
        retriever: null,
        userId,
        assessmentLlmEnabled: true,
      });
      const sessionId = await startedSessionWithClearedDiagnostic(
        orchestrator,
        client,
        userId,
      );

      const qa = createTeachingQaStore(client);
      let questionId: string | null = null;
      for (let i = 0; i < 10 && !questionId; i += 1) {
        const step = await orchestrator.getNextStep({ sessionId });
        expect(step.ok).toBe(true);
        if (!step.ok) return;
        if (step.value.question) {
          questionId = step.value.question.questionId;
          expect(step.value.question.format).toBe("FREE_FORM");
        }
      }
      expect(questionId).not.toBeNull();
      if (!questionId) return;

      const row = await qa.getQuestion(questionId);
      expect(row.ok).toBe(true);
      if (row.ok) {
        const meta = row.value.metadata as Record<string, unknown> | null;
        // Proves the LLM path genuinely ran (not the deterministic
        // fallback template) — this is the existing, still-available
        // opt-in capability the milestone requires we NOT remove.
        expect(meta?.generatorSource).toBe("ai");
      }
      expect(calls).toContain("question-generator");

      const answerResult = await orchestrator.submitAnswer({
        sessionId,
        questionId,
        answerText: "A reasonably complete free-form answer for grading.",
      });
      expect(answerResult.ok).toBe(true);
      expect(calls).toContain("answer-evaluator");
    } finally {
      await admin.auth.admin.deleteUser(userId);
    }
  }, 90_000);

  it("TEST 5: no LLM provider + assessmentLlmEnabled=false -> deterministic golden path still works", async () => {
    const { id: userId, client } = await newUser("none");
    try {
      const orchestrator = createTeachingOrchestrator({
        db: client,
        llm: null,
        retriever: null,
        userId,
        assessmentLlmEnabled: false,
      });
      const sessionId = await startedSessionWithClearedDiagnostic(
        orchestrator,
        client,
        userId,
      );
      const step = await orchestrator.getNextStep({ sessionId });
      expect(step.ok).toBe(true);
      if (step.ok) {
        expect(
          step.value.question !== null || step.value.content !== null,
        ).toBe(true);
        if (step.value.question) {
          expect(step.value.question.format).not.toBe("FREE_FORM");
        }
      }
    } finally {
      await admin.auth.admin.deleteUser(userId);
    }
  }, 90_000);

  it("TEST 6: LLM configured + assessmentLlmEnabled=false -> structured-bank exhaustion guard still advances the concept safely", async () => {
    const { id: userId, client } = await newUser("exhaust");
    try {
      const { provider: llm } = createMockLLMProvider();
      const orchestrator = createTeachingOrchestrator({
        db: client,
        llm,
        retriever: null,
        userId,
        assessmentLlmEnabled: false,
      });
      const sessionId = await startedSessionWithClearedDiagnostic(
        orchestrator,
        client,
        userId,
      );

      // Answer correctly enough times to either exhaust the structured
      // bank/template for the first concept (triggering the exhaustion
      // guard's advance) or reach a non-question teaching step — either
      // way, the loop must never produce a FREE_FORM question while
      // assessmentLlmEnabled is false, and must never error out.
      let sawFreeForm = false;
      for (let i = 0; i < 15; i += 1) {
        const step = await orchestrator.getNextStep({ sessionId });
        expect(step.ok).toBe(true);
        if (!step.ok) return;
        if (step.value.sessionStatus === "COMPLETED") break;
        if (step.value.question) {
          if (step.value.question.format === "FREE_FORM") {
            sawFreeForm = true;
            break;
          }
          const qa = createTeachingQaStore(client);
          const row = await qa.getQuestion(step.value.question.questionId);
          if (!row.ok) break;
          const parsed = structuredQuestionFromRow(row.value);
          if (!parsed) break;
          const answer = await orchestrator.submitAnswer({
            sessionId,
            questionId: step.value.question.questionId,
            answerText: JSON.stringify(correctAnswerFor(parsed)),
          });
          expect(answer.ok).toBe(true);
        }
      }
      expect(sawFreeForm).toBe(false);
    } finally {
      await admin.auth.admin.deleteUser(userId);
    }
  }, 90_000);

  it("TEST 8: LLM configured + assessmentLlmEnabled=false -> teaching-content/engine explanation capability remains available", async () => {
    const { id: userId, client } = await newUser("explain");
    try {
      const { provider: llm, calls } = createMockLLMProvider();
      const orchestrator = createTeachingOrchestrator({
        db: client,
        llm,
        retriever: null,
        userId,
        assessmentLlmEnabled: false,
      });
      const sessionId = await startedSessionWithClearedDiagnostic(
        orchestrator,
        client,
        userId,
      );

      // A fresh lesson's first turn is a teaching (EXPLAIN) turn, not a
      // question, for a learner with no evidence yet — exercises
      // `engine.decide` and `generateTeachingContent`, both of which are
      // explanation-surface capabilities independent of the assessment
      // flag.
      const step = await orchestrator.getNextStep({ sessionId });
      expect(step.ok).toBe(true);
      expect(calls).toContain("teaching-engine");

      if (step.ok && step.value.content) {
        // The teaching-content interaction's `contentSource` metadata
        // proves the AI explanation path genuinely ran (not the
        // deterministic template fallback), independent of assessment.
        const interactions = createInteractionStore(client);
        const rows = await interactions.listForSession(sessionId, {
          limit: 20,
        });
        expect(rows.ok).toBe(true);
        if (rows.ok) {
          const contentRow = rows.value.find(
            (r) =>
              r.role === "TEACHER" &&
              (r.metadata as Record<string, unknown> | null)?.contentSource ===
                "ai",
          );
          expect(contentRow).toBeDefined();
        }
      }
    } finally {
      await admin.auth.admin.deleteUser(userId);
    }
  }, 90_000);
});

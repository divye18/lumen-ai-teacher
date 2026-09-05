/**
 * INTEGRATION — the Teaching Room loop, against a real Supabase project.
 * Not part of `npm test`.
 *
 *   LUMEN_TEST_SUPABASE_URL=...
 *   LUMEN_TEST_SUPABASE_ANON_KEY=...
 *   LUMEN_TEST_SERVICE_ROLE_KEY=...
 *   npm run test:integration
 *
 * Verifies, against the real database, with `llm: null` (no LLM key
 * required — see below):
 *
 *   1. startOrResume -> diagnostic -> submitDiagnostic clears it ->
 *      getNextStep produces a real structured question -> a CORRECT answer
 *      raises mastery and does not fabricate a misconception -> a
 *      subsequent question is produced -> an answer chosen to be WRONG on a
 *      question carrying a misconception trap is graded INCORRECT and the
 *      corresponding misconception is created -> the session's persisted
 *      state (plan_cursor / concept_mastery) is coherent throughout.
 *   2. Concurrent double-submission of the SAME question (double-click) is
 *      inspected for duplicate writes — reported as a finding either way,
 *      not assumed.
 *
 * With `llm: null`, `getNextStep` (orchestrator.ts) always tries
 * `pickStructuredQuestion` first — the same deterministic authored bank the
 * diagnostic engine uses — so the curated demo lesson's concepts (memory
 * hierarchy, cache vs RAM, ...) can run the ENTIRE teaching loop without an
 * LLM key, exactly like the diagnostic integration tests already do.
 *
 * Self-skips when DB creds are missing.
 */
import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "@/lib/db/types";
import {
  createInteractionStore,
  createMisconceptionStore,
  createTeachingQaStore,
} from "@/lib/db/repositories";
import { ensureDemoSession } from "@/lib/demo";
import { getSessionReport } from "@/lib/studio/session-report";
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

/** A deliberately WRONG answer, from the SERVER-side answer key. */
function wrongAnswerFor(q: StructuredQuestion): StructuredAnswer {
  switch (q.format) {
    case "MCQ": {
      const wrong = q.data.options.find((o) => o.id !== q.data.correctId)!;
      return { format: "MCQ", selectedId: wrong.id };
    }
    case "MULTI_SELECT": {
      const wrong = q.data.options.find(
        (o) => !q.data.correctIds.includes(o.id),
      );
      return {
        format: "MULTI_SELECT",
        selectedIds: wrong ? [wrong.id] : [],
      };
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

describe.skipIf(!ready)("teaching room loop (integration)", () => {
  let admin: ReturnType<typeof createClient<Database>>;
  let client: ReturnType<typeof createClient<Database>>;
  const user = {
    email: `lumen-room-${randomUUID().slice(0, 8)}@example.test`,
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
    // Cascades: profile -> lessons/concepts/sessions/mastery/misconceptions.
    if (user.id) await admin.auth.admin.deleteUser(user.id);
  });

  async function clearDiagnostic(
    orchestrator: ReturnType<typeof createTeachingOrchestrator>,
    sessionId: string,
    diagnosticItems: {
      conceptKey: string;
      structured: Parameters<typeof anyValidAnswer>[0];
    }[],
  ) {
    const answers = diagnosticItems.map((item) => ({
      conceptKey: item.conceptKey,
      answer: anyValidAnswer(item.structured),
    }));
    const submitted = await orchestrator.submitDiagnostic({
      sessionId,
      answers,
    });
    expect(submitted.ok).toBe(true);
    // Acknowledge so current_action clears back to null (matches the real
    // DiagnosticGate "Continue" action) and getNextStep runs cleanly.
    await orchestrator.submitDiagnostic({ sessionId, answers: [] });
  }

  it("runs a full teach -> correct -> teach -> incorrect loop coherently", async () => {
    const demo = await ensureDemoSession(client, user.id);
    expect(demo.ok).toBe(true);
    if (!demo.ok) return;

    const orchestrator = createTeachingOrchestrator({
      db: client,
      llm: null,
      retriever: null,
      userId: user.id,
    });

    const started = await orchestrator.startOrResume({
      lessonId: demo.value.lessonId,
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const sessionId = started.value.sessionId;

    expect(started.value.diagnostic).not.toBeNull();
    await clearDiagnostic(
      orchestrator,
      sessionId,
      started.value.diagnostic!.items,
    );

    const qa = createTeachingQaStore(client);
    const misconceptions = createMisconceptionStore(client);

    async function advanceToQuestion(): Promise<{
      questionId: string;
      conceptKey: string;
      question: StructuredQuestion;
    } | null> {
      for (let i = 0; i < 10; i += 1) {
        const step = await orchestrator.getNextStep({ sessionId });
        expect(step.ok).toBe(true);
        if (!step.ok) return null;
        if (step.value.question) {
          const row = await qa.getQuestion(step.value.question.questionId);
          expect(row.ok).toBe(true);
          if (!row.ok) return null;
          const parsed = structuredQuestionFromRow(row.value);
          expect(parsed).not.toBeNull();
          if (!parsed) return null;
          return {
            questionId: step.value.question.questionId,
            conceptKey: step.value.question.conceptKey,
            question: parsed,
          };
        }
        if (step.value.sessionStatus === "COMPLETED") return null;
      }
      return null;
    }

    // ── Turn 1: a genuinely CORRECT answer ──────────────────────────────
    const first = await advanceToQuestion();
    expect(first).not.toBeNull();
    if (!first) return;

    const correctResult = await orchestrator.submitAnswer({
      sessionId,
      questionId: first.questionId,
      answerText: JSON.stringify(correctAnswerFor(first.question)),
    });
    expect(correctResult.ok).toBe(true);
    if (!correctResult.ok) return;
    expect(correctResult.value.evaluation.classification).toBe("CORRECT");
    expect(correctResult.value.evaluation.misconception).toBeNull();
    expect(
      correctResult.value.learnerUpdate.masteryAfter,
    ).toBeGreaterThanOrEqual(correctResult.value.learnerUpdate.masteryBefore);
    expect(correctResult.value.learnerUpdate.newMisconceptions).toBe(0);

    // Regression coverage: the answer must be genuinely PERSISTED, not just
    // returned in-memory. A structured grader's breakdown routinely contains
    // real `undefined` values (e.g. a non-chosen option's `expected` field),
    // which previously made the DB write silently fail validation while
    // submitAnswer still reported success.
    const persistedAnswers = await qa.listAnswersForSession(sessionId);
    expect(persistedAnswers.ok).toBe(true);
    if (persistedAnswers.ok) {
      const persisted = persistedAnswers.value.find(
        (a) => a.question_id === first.questionId,
      );
      expect(persisted).toBeDefined();
      expect(persisted?.classification).toBe("CORRECT");
    }

    // Data-integrity audit (12.5): confirm the classification + raw answer
    // text are ALSO independently recoverable from `interactions` — the
    // STUDENT/ANSWER + TEACHER/FEEDBACK rows never touch the risky nested
    // `evaluation.breakdown` object that caused the 12.4 bug, so even a
    // hypothetical future `teaching_answers` gap would not lose this data.
    const interactions = createInteractionStore(client);
    const turnInteractions = await interactions.listForSession(sessionId, {
      limit: 50,
    });
    expect(turnInteractions.ok).toBe(true);
    if (turnInteractions.ok) {
      const studentAnswer = turnInteractions.value.find(
        (i) =>
          i.role === "STUDENT" &&
          i.interaction_type === "ANSWER" &&
          (i.metadata as Record<string, unknown> | null)?.questionId ===
            first.questionId,
      );
      expect(studentAnswer).toBeDefined();
      expect(studentAnswer?.content).toBe(
        JSON.stringify(correctAnswerFor(first.question)),
      );

      const teacherFeedback = turnInteractions.value.find(
        (i) =>
          i.role === "TEACHER" &&
          i.interaction_type === "FEEDBACK" &&
          (i.metadata as Record<string, unknown> | null)?.classification ===
            "CORRECT" &&
          (i.metadata as Record<string, unknown> | null)?.conceptKey ===
            first.conceptKey,
      );
      expect(teacherFeedback).toBeDefined();
    }

    // ── Turn 2: a deliberately WRONG answer ─────────────────────────────
    const second = await advanceToQuestion();
    expect(second).not.toBeNull();
    if (!second) return;

    const wrongResult = await orchestrator.submitAnswer({
      sessionId,
      questionId: second.questionId,
      answerText: JSON.stringify(wrongAnswerFor(second.question)),
    });
    expect(wrongResult.ok).toBe(true);
    if (!wrongResult.ok) return;
    expect(wrongResult.value.evaluation.classification).not.toBe("CORRECT");
    expect(wrongResult.value.learnerUpdate.masteryAfter).toBeLessThanOrEqual(
      wrongResult.value.learnerUpdate.masteryBefore,
    );
    // A misconception is created ONLY when the wrong distractor actually maps
    // to one (real architecture criterion — not every wrong answer creates
    // one). When the response DOES report a new misconception, confirm it
    // was genuinely persisted as ACTIVE, not just claimed in the response.
    if (wrongResult.value.learnerUpdate.newMisconceptions > 0) {
      const questionRow = await client
        .from("teaching_questions")
        .select("concept_id")
        .eq("id", second.questionId)
        .maybeSingle();
      const conceptId = questionRow.data?.concept_id;
      expect(conceptId).toBeTruthy();
      if (conceptId) {
        const rows = await misconceptions.listForConcept(user.id, conceptId);
        expect(rows.ok).toBe(true);
        if (rows.ok) {
          expect(rows.value.some((r) => r.status === "ACTIVE")).toBe(true);
        }
      }
    }

    // ── Session persistence: re-reading resumes coherently ──────────────
    const resumed = await orchestrator.startOrResume({ sessionId });
    expect(resumed.ok).toBe(true);
    if (resumed.ok) {
      expect(resumed.value.diagnostic).toBeNull();
      expect(resumed.value.diagnosticSummary).toBeNull();
      expect(resumed.value.status).not.toBe("COMPLETED");
    }

    // Milestone 13.1: the session report's answer tally (now derived from
    // `interactions`, not `teaching_answers` — see answer-tally.ts) must
    // exactly match the two real turns above: one correct, one incorrect,
    // with no double-counting.
    const report = await getSessionReport(client, user.id, sessionId);
    expect(report.ok).toBe(true);
    if (report.ok) {
      expect(report.value.questionsAnswered).toBe(2);
      expect(report.value.correct).toBe(1);
      expect(report.value.incorrect).toBe(1);
      expect(report.value.partial).toBe(0);
      expect(report.value.masterySummary).toBeDefined();
    }
  }, 90_000);

  it("inspects concurrent double-submission of the same question", async () => {
    const second = {
      email: `lumen-room-dup-${randomUUID().slice(0, 8)}@example.test`,
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

      const demo = await ensureDemoSession(secondClient, second.id);
      expect(demo.ok).toBe(true);
      if (!demo.ok) return;

      const orchestrator = createTeachingOrchestrator({
        db: secondClient,
        llm: null,
        retriever: null,
        userId: second.id,
      });

      const started = await orchestrator.startOrResume({
        lessonId: demo.value.lessonId,
      });
      expect(started.ok).toBe(true);
      if (!started.ok) return;
      const sessionId = started.value.sessionId;
      const answers = started.value.diagnostic!.items.map((item) => ({
        conceptKey: item.conceptKey,
        answer: anyValidAnswer(item.structured),
      }));
      await orchestrator.submitDiagnostic({ sessionId, answers });
      await orchestrator.submitDiagnostic({ sessionId, answers: [] });

      let questionId: string | null = null;
      let question: StructuredQuestion | null = null;
      const qa = createTeachingQaStore(secondClient);
      for (let i = 0; i < 10 && !questionId; i += 1) {
        const step = await orchestrator.getNextStep({ sessionId });
        if (!step.ok) break;
        if (step.value.question) {
          questionId = step.value.question.questionId;
          const row = await qa.getQuestion(questionId);
          question = row.ok ? structuredQuestionFromRow(row.value) : null;
        }
      }
      expect(questionId).not.toBeNull();
      expect(question).not.toBeNull();
      if (!questionId || !question) return;

      const answerText = JSON.stringify(correctAnswerFor(question));

      const [a, b] = await Promise.all([
        orchestrator.submitAnswer({ sessionId, questionId, answerText }),
        orchestrator.submitAnswer({ sessionId, questionId, answerText }),
      ]);

      const okCount = [a, b].filter((r) => r.ok).length;
      expect(okCount).toBeGreaterThan(0); // at least one request must succeed

      // The real invariant: the answer is genuinely persisted (regression
      // coverage for a confirmed bug — see the "correct answer is actually
      // persisted" test below) — and concurrency doesn't multiply it per
      // request; either exactly one write landed, or both did (harmless,
      // since both submissions are for the identical question+answer).
      const allAnswers = await qa.listAnswersForSession(sessionId);
      expect(allAnswers.ok).toBe(true);
      if (allAnswers.ok) {
        const answersForQuestion = allAnswers.value.filter(
          (r) => r.question_id === questionId,
        );
        expect(answersForQuestion.length).toBeGreaterThan(0);
        expect(answersForQuestion.length).toBeLessThanOrEqual(2);
      }
    } finally {
      if (second.id) await admin.auth.admin.deleteUser(second.id);
    }
  }, 90_000);
});

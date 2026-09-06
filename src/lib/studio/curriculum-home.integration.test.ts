/**
 * INTEGRATION — Home/Studio curriculum composition (Milestone 19.3),
 * against a real Supabase project. Not part of `npm test`.
 *
 *   LUMEN_TEST_SUPABASE_URL=...
 *   LUMEN_TEST_SUPABASE_ANON_KEY=...
 *   LUMEN_TEST_SERVICE_ROLE_KEY=...
 *   npm run test:integration
 *
 * Uses the REAL production/pilot global NCERT source (read-only, exactly
 * like `ncert-browser.integration.test.ts` already does) — never creates or
 * mutates curriculum data. Only one ephemeral user is created, and only
 * that user's own lessons/sessions are written; deleting the user in
 * `afterAll` cascades and removes them. Nothing is left behind.
 */
import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createLessonStore, createSessionStore } from "@/lib/db/repositories";
import type { Database } from "@/lib/db/types";

import { getCurriculumHome } from "./curriculum-home";

const url = process.env.LUMEN_TEST_SUPABASE_URL;
const anonKey = process.env.LUMEN_TEST_SUPABASE_ANON_KEY;
const serviceKey = process.env.LUMEN_TEST_SERVICE_ROLE_KEY;

const ready = Boolean(url && anonKey && serviceKey);

describe.skipIf(!ready)("getCurriculumHome (integration)", () => {
  let admin: ReturnType<typeof createClient<Database>>;
  const testId = randomUUID().slice(0, 8);
  const user = {
    email: `lumen-curriculum-home-${testId}@example.test`,
    password: randomUUID(),
    id: "",
    client: null as unknown as ReturnType<typeof createClient<Database>>,
  };
  const createdLessonIds: string[] = [];
  const createdSessionIds: string[] = [];

  beforeAll(async () => {
    admin = createClient<Database>(url as string, serviceKey as string);
    const created = await admin.auth.admin.createUser({
      email: user.email,
      password: user.password,
      email_confirm: true,
    });
    if (created.error) throw created.error;
    user.id = created.data.user.id;

    user.client = createClient<Database>(url as string, anonKey as string);
    const signIn = await user.client.auth.signInWithPassword({
      email: user.email,
      password: user.password,
    });
    if (signIn.error) throw signIn.error;
  }, 30_000);

  afterAll(async () => {
    if (createdSessionIds.length > 0) {
      await admin
        .from("learning_sessions")
        .delete()
        .in("id", createdSessionIds);
    }
    if (createdLessonIds.length > 0) {
      await admin.from("lessons").delete().in("id", createdLessonIds);
    }
    if (user.id) await admin.auth.admin.deleteUser(user.id);
  });

  it("1. a brand-new learner has no continue-learning session but real (zero) chapter progress", async () => {
    const home = await getCurriculumHome(user.client, user.id);
    expect(home.continueLearning).toBeNull();
    expect(home.chapterProgress).not.toBeNull();
    expect(home.chapterProgress?.completedTopics).toBe(0);
    expect(home.chapterProgress?.totalTopics).toBeGreaterThan(0);
    expect(home.nextTopic).not.toBeNull();
  }, 30_000);

  it("2. an active curriculum session becomes the continue-learning result", async () => {
    // First resolve which topic getCurriculumHome would recommend, to keep
    // this test data-driven rather than assuming a specific topic title.
    const before = await getCurriculumHome(user.client, user.id);
    const targetNodeId = before.nextTopic?.nodeId;
    expect(targetNodeId).toBeDefined();

    const lessons = createLessonStore(admin);
    const lesson = await lessons.create({
      userId: user.id,
      title: "Test lesson",
      topic: "Test lesson",
      objective: "N/A",
      language: "en",
      sourceGrounded: false,
      planSource: "fallback",
      status: "DRAFT",
      plan: {},
      citations: [],
      curriculumNodeId: targetNodeId as string,
    });
    if (!lesson.ok) throw lesson.error;
    createdLessonIds.push(lesson.value.id);

    const sessions = createSessionStore(admin);
    const session = await sessions.create({
      userId: user.id,
      language: "en",
      status: "ACTIVE",
    });
    if (!session.ok) throw session.error;
    createdSessionIds.push(session.value.id);
    const withLesson = await sessions.updateTeaching({
      id: session.value.id,
      lessonId: lesson.value.id,
    });
    if (!withLesson.ok) throw withLesson.error;

    const home = await getCurriculumHome(user.client, user.id);
    expect(home.continueLearning?.sessionId).toBe(session.value.id);
    expect(home.continueLearning?.curriculumNodeId).toBe(targetNodeId);
    expect(home.continueLearning?.chapterTitle).toBeTruthy();
    expect(home.chapterProgress?.completedTopics).toBe(0);
  }, 30_000);

  it("3. completing that session removes it from continue-learning but progress reflects the completion", async () => {
    const lessonId = createdLessonIds[0];
    await admin
      .from("lessons")
      .update({ status: "COMPLETED" })
      .eq("id", lessonId);
    await admin
      .from("learning_sessions")
      .update({ status: "COMPLETED" })
      .eq("id", createdSessionIds[0]);

    const home = await getCurriculumHome(user.client, user.id);
    expect(home.continueLearning).toBeNull();
    expect(home.chapterProgress?.completedTopics).toBe(1);
  }, 30_000);
});

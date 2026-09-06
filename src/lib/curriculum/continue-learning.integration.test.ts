/**
 * INTEGRATION — curriculum Continue Learning read model (Milestone 18.3f),
 * against a real Supabase project. Not part of `npm test`.
 *
 *   LUMEN_TEST_SUPABASE_URL=...
 *   LUMEN_TEST_SUPABASE_ANON_KEY=...
 *   LUMEN_TEST_SERVICE_ROLE_KEY=...
 *   npm run test:integration
 *
 * Fully isolated: ephemeral users, ephemeral global curriculum sources (one
 * "current version" plus one "other version" for the isolation test), all
 * cleaned up in `afterAll`. The real production NCERT pilot is never
 * touched. `learning_sessions.updated_at` is trigger-managed (always set to
 * real `now()` on UPDATE, never client-settable) — ordering between
 * sessions is made deterministic with small explicit delays between the
 * sequential updates that must land in a specific order, rather than
 * relying on ambient timing.
 */
import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createCurriculumStore,
  createLessonStore,
  createSessionStore,
} from "@/lib/db/repositories";
import type { Database } from "@/lib/db/types";

import { getCurriculumContinueLearning } from "./continue-learning";

const url = process.env.LUMEN_TEST_SUPABASE_URL;
const anonKey = process.env.LUMEN_TEST_SUPABASE_ANON_KEY;
const serviceKey = process.env.LUMEN_TEST_SERVICE_ROLE_KEY;

const ready = Boolean(url && anonKey && serviceKey);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe.skipIf(!ready)("getCurriculumContinueLearning (integration)", () => {
  let admin: ReturnType<typeof createClient<Database>>;
  const testId = randomUUID().slice(0, 8);

  const userA = {
    email: `lumen-continue-a-${testId}@example.test`,
    password: randomUUID(),
    id: "",
    client: null as unknown as ReturnType<typeof createClient<Database>>,
  };
  const userB = {
    email: `lumen-continue-b-${testId}@example.test`,
    password: randomUUID(),
    id: "",
    client: null as unknown as ReturnType<typeof createClient<Database>>,
  };

  let sourceId = "";
  let otherSourceId = "";
  const topicIds: Record<string, string> = {};
  let otherTopicId = "";
  const createdLessonIds: string[] = [];
  const createdSessionIds: string[] = [];

  beforeAll(async () => {
    admin = createClient<Database>(url as string, serviceKey as string);

    for (const user of [userA, userB]) {
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
    }

    const curriculum = createCurriculumStore(admin);

    const source = await curriculum.createSource({
      kind: "NCERT",
      title: `Test continue-learning source ${testId}`,
      status: "READY",
      version: `test-${testId}`,
    });
    if (!source.ok) throw source.error;
    sourceId = source.value.id;

    const chapter = await curriculum.createNode({
      curriculumSourceId: sourceId,
      nodeType: "CHAPTER",
      title: "Test Chapter",
      normalizedTitle: "test chapter",
      position: 0,
      status: "ACTIVE",
    });
    if (!chapter.ok) throw chapter.error;

    for (const title of ["Topic A", "Topic B"]) {
      const node = await curriculum.createNode({
        curriculumSourceId: sourceId,
        parentId: chapter.value.id,
        nodeType: "TOPIC",
        title,
        normalizedTitle: title.toLowerCase(),
        position: title === "Topic A" ? 0 : 1,
        status: "ACTIVE",
      });
      if (!node.ok) throw node.error;
      topicIds[title] = node.value.id;
    }

    const archived = await curriculum.createNode({
      curriculumSourceId: sourceId,
      parentId: chapter.value.id,
      nodeType: "TOPIC",
      title: "Archived Topic",
      normalizedTitle: "archived topic",
      position: 2,
      status: "ARCHIVED",
    });
    if (!archived.ok) throw archived.error;
    topicIds["Archived Topic"] = archived.value.id;

    // Another source/version with an identically-titled chapter+topic.
    const otherSource = await curriculum.createSource({
      kind: "NCERT",
      title: `Test other-version source ${testId}`,
      status: "READY",
      version: `test-other-${testId}`,
    });
    if (!otherSource.ok) throw otherSource.error;
    otherSourceId = otherSource.value.id;

    const otherChapter = await curriculum.createNode({
      curriculumSourceId: otherSourceId,
      nodeType: "CHAPTER",
      title: "Test Chapter",
      normalizedTitle: "test chapter",
      position: 0,
      status: "ACTIVE",
    });
    if (!otherChapter.ok) throw otherChapter.error;

    const otherTopic = await curriculum.createNode({
      curriculumSourceId: otherSourceId,
      parentId: otherChapter.value.id,
      nodeType: "TOPIC",
      title: "Topic A",
      normalizedTitle: "topic a",
      position: 0,
      status: "ACTIVE",
    });
    if (!otherTopic.ok) throw otherTopic.error;
    otherTopicId = otherTopic.value.id;
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
    if (sourceId) {
      await admin.from("curriculum_sources").delete().eq("id", sourceId);
    }
    if (otherSourceId) {
      await admin.from("curriculum_sources").delete().eq("id", otherSourceId);
    }
    if (userA.id) await admin.auth.admin.deleteUser(userA.id);
    if (userB.id) await admin.auth.admin.deleteUser(userB.id);
  });

  /** Creates a lesson (curriculum-linked unless nodeId is null) plus a
   * session pointed at it, as admin (bypassing RLS for test setup), in the
   * given final status. Returns the session id. */
  async function makeSession(
    userId: string,
    nodeId: string | null,
    status: "ACTIVE" | "COMPLETED",
  ): Promise<string> {
    const lessons = createLessonStore(admin);
    const lesson = await lessons.create({
      userId,
      title: "Test lesson",
      topic: "Test lesson",
      objective: "N/A",
      language: "en",
      sourceGrounded: false,
      planSource: "fallback",
      status: "DRAFT",
      plan: {},
      citations: [],
      curriculumNodeId: nodeId,
    });
    if (!lesson.ok) throw lesson.error;
    createdLessonIds.push(lesson.value.id);

    const sessions = createSessionStore(admin);
    const session = await sessions.create({
      userId,
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

    if (status === "COMPLETED") {
      const completed = await sessions.update({
        id: session.value.id,
        status: "COMPLETED",
      });
      if (!completed.ok) throw completed.error;
    }
    return session.value.id;
  }

  it("1. no curriculum-linked sessions -> null", async () => {
    const store = createCurriculumStore(userA.client);
    const lessons = createLessonStore(userA.client);
    const sessions = createSessionStore(userA.client);

    const result = await getCurriculumContinueLearning(
      store,
      lessons,
      sessions,
      userA.id,
      sourceId,
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeNull();
  }, 30_000);

  it("5. a curriculum session is returned even with a more recent unrelated free-text session", async () => {
    // Unrelated free-text lesson/session (no curriculum_node_id) — created
    // and updated AFTER the curriculum one below, but must never win.
    const curriculumSessionId = await makeSession(
      userA.id,
      topicIds["Topic A"],
      "ACTIVE",
    );
    await sleep(50);
    await makeSession(userA.id, null, "ACTIVE"); // free-text, more recent

    const store = createCurriculumStore(userA.client);
    const lessons = createLessonStore(userA.client);
    const sessions = createSessionStore(userA.client);
    const result = await getCurriculumContinueLearning(
      store,
      lessons,
      sessions,
      userA.id,
      sourceId,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value?.sessionId).toBe(curriculumSessionId);
    expect(result.value?.curriculumNodeId).toBe(topicIds["Topic A"]);
    expect(result.value?.topicTitle).toBe("Topic A");
  }, 30_000);

  it("3-4. a newer curriculum session on a different topic wins over the older one", async () => {
    await sleep(50);
    const newerSessionId = await makeSession(
      userA.id,
      topicIds["Topic B"],
      "ACTIVE",
    );

    const store = createCurriculumStore(userA.client);
    const lessons = createLessonStore(userA.client);
    const sessions = createSessionStore(userA.client);
    const result = await getCurriculumContinueLearning(
      store,
      lessons,
      sessions,
      userA.id,
      sourceId,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value?.sessionId).toBe(newerSessionId);
    expect(result.value?.curriculumNodeId).toBe(topicIds["Topic B"]);
  }, 30_000);

  it("9. a completed session more recent than an active one does not win — the active one is still returned", async () => {
    await sleep(50);
    // Complete Topic A's session (older) — should NOT become the winner
    // even though its own updated_at just bumped to "now" via this update.
    const topicASession = await admin
      .from("lessons")
      .select("id")
      .eq("curriculum_node_id", topicIds["Topic A"])
      .eq("user_id", userA.id)
      .single();
    const sessionForTopicA = await admin
      .from("learning_sessions")
      .select("id")
      .eq("lesson_id", topicASession.data!.id)
      .single();
    const sessions = createSessionStore(admin);
    await sessions.update({
      id: sessionForTopicA.data!.id,
      status: "COMPLETED",
    });

    const store = createCurriculumStore(userA.client);
    const lessons = createLessonStore(userA.client);
    const userSessions = createSessionStore(userA.client);
    const result = await getCurriculumContinueLearning(
      store,
      lessons,
      userSessions,
      userA.id,
      sourceId,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Topic B's session is still ACTIVE and is the only non-completed
    // curriculum session — it wins regardless of Topic A's fresher
    // updated_at, because Topic A's session is now COMPLETED.
    expect(result.value?.curriculumNodeId).toBe(topicIds["Topic B"]);
  }, 30_000);

  it("6. user isolation: userB has no continuation candidate", async () => {
    const store = createCurriculumStore(userB.client);
    const lessons = createLessonStore(userB.client);
    const sessions = createSessionStore(userB.client);
    const result = await getCurriculumContinueLearning(
      store,
      lessons,
      sessions,
      userB.id,
      sourceId,
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeNull();
  }, 30_000);

  it("7. source/version isolation: another source's session for the same user does not contaminate this source's result", async () => {
    await makeSession(userA.id, otherTopicId, "ACTIVE");

    const store = createCurriculumStore(userA.client);
    const lessons = createLessonStore(userA.client);
    const sessions = createSessionStore(userA.client);
    const result = await getCurriculumContinueLearning(
      store,
      lessons,
      sessions,
      userA.id,
      sourceId,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Still Topic B under THIS source, never the other source's node.
    expect(result.value?.curriculumNodeId).toBe(topicIds["Topic B"]);
    expect(result.value?.curriculumNodeId).not.toBe(otherTopicId);
  }, 30_000);

  it("8. an archived topic's session is never a continuation candidate", async () => {
    await sleep(50);
    await makeSession(userA.id, topicIds["Archived Topic"], "ACTIVE");

    const store = createCurriculumStore(userA.client);
    const lessons = createLessonStore(userA.client);
    const sessions = createSessionStore(userA.client);
    const result = await getCurriculumContinueLearning(
      store,
      lessons,
      sessions,
      userA.id,
      sourceId,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Despite being the MOST recently updated session, the archived
    // topic's session is excluded — Topic B remains the candidate.
    expect(result.value?.curriculumNodeId).toBe(topicIds["Topic B"]);
  }, 30_000);

  it("10. multiple lessons for the same topic: the most recent one's session wins", async () => {
    await sleep(50);
    const secondTopicBSession = await makeSession(
      userA.id,
      topicIds["Topic B"],
      "ACTIVE",
    );

    const store = createCurriculumStore(userA.client);
    const lessons = createLessonStore(userA.client);
    const sessions = createSessionStore(userA.client);
    const result = await getCurriculumContinueLearning(
      store,
      lessons,
      sessions,
      userA.id,
      sourceId,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value?.sessionId).toBe(secondTopicBSession);
    expect(result.value?.curriculumNodeId).toBe(topicIds["Topic B"]);
  }, 30_000);
});

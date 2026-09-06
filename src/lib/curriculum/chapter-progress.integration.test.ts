/**
 * INTEGRATION — chapter curriculum progress read model (Milestone 18.3e),
 * against a real Supabase project. Not part of `npm test`.
 *
 *   LUMEN_TEST_SUPABASE_URL=...
 *   LUMEN_TEST_SUPABASE_ANON_KEY=...
 *   LUMEN_TEST_SERVICE_ROLE_KEY=...
 *   npm run test:integration
 *
 * Fully isolated: ephemeral users, ephemeral global curriculum sources (one
 * "current version" with the chapter under test, one "other version" with
 * an identically-titled chapter for the isolation test), all cleaned up in
 * `afterAll`. The real production NCERT pilot is never touched.
 */
import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createCurriculumStore,
  createLessonStore,
} from "@/lib/db/repositories";
import type { Database } from "@/lib/db/types";

import { getChapterProgressForUser } from "./chapter-progress";

const url = process.env.LUMEN_TEST_SUPABASE_URL;
const anonKey = process.env.LUMEN_TEST_SUPABASE_ANON_KEY;
const serviceKey = process.env.LUMEN_TEST_SERVICE_ROLE_KEY;

const ready = Boolean(url && anonKey && serviceKey);

describe.skipIf(!ready)("getChapterProgressForUser (integration)", () => {
  let admin: ReturnType<typeof createClient<Database>>;
  const testId = randomUUID().slice(0, 8);

  const userA = {
    email: `lumen-chapter-progress-a-${testId}@example.test`,
    password: randomUUID(),
    id: "",
    client: null as unknown as ReturnType<typeof createClient<Database>>,
  };
  const userB = {
    email: `lumen-chapter-progress-b-${testId}@example.test`,
    password: randomUUID(),
    id: "",
    client: null as unknown as ReturnType<typeof createClient<Database>>,
  };

  let sourceId = "";
  let chapterId = "";
  const topicIds: string[] = []; // 6 topics, position order
  let archivedTopicId = "";
  let otherSourceId = "";
  let otherChapterId = "";
  const createdLessonIds: string[] = [];

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
      title: `Test chapter-progress source ${testId}`,
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
    chapterId = chapter.value.id;

    // 1. a real chapter with six current-shape TOPIC nodes.
    for (let i = 0; i < 6; i++) {
      const node = await curriculum.createNode({
        curriculumSourceId: sourceId,
        parentId: chapterId,
        nodeType: "TOPIC",
        title: `Topic ${i}`,
        normalizedTitle: `topic ${i}`,
        position: i,
        status: "ACTIVE",
      });
      if (!node.ok) throw node.error;
      topicIds.push(node.value.id);
    }

    // 7. an archived topic under the same chapter — must not count.
    const archived = await curriculum.createNode({
      curriculumSourceId: sourceId,
      parentId: chapterId,
      nodeType: "TOPIC",
      title: "Archived Topic",
      normalizedTitle: "archived topic",
      position: 6,
      status: "ARCHIVED",
    });
    if (!archived.ok) throw archived.error;
    archivedTopicId = archived.value.id;

    // 8. another source/version with an identically-structured chapter.
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
    otherChapterId = otherChapter.value.id;

    const otherTopic = await curriculum.createNode({
      curriculumSourceId: otherSourceId,
      parentId: otherChapterId,
      nodeType: "TOPIC",
      title: "Topic 0",
      normalizedTitle: "topic 0",
      position: 0,
      status: "ACTIVE",
    });
    if (!otherTopic.ok) throw otherTopic.error;

    // userA completes the OTHER source's "Topic 0" — must not leak into
    // this source's chapter progress.
    await makeLessonAsAdmin(otherTopic.value.id, "COMPLETED");
  }, 30_000);

  afterAll(async () => {
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

  async function makeLessonAsAdmin(nodeId: string, status: string) {
    const lessons = createLessonStore(admin);
    const created = await lessons.create({
      userId: userA.id,
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
    if (!created.ok) throw created.error;
    createdLessonIds.push(created.value.id);
    if (status !== "DRAFT") {
      const updated = await lessons.update({
        id: created.value.id,
        status: status as never,
      });
      if (!updated.ok) throw updated.error;
    }
    return created.value.id;
  }

  it("2. no lessons -> 0/6, 0%, next topic is the first topic", async () => {
    const store = createCurriculumStore(userA.client);
    const lessons = createLessonStore(userA.client);

    const result = await getChapterProgressForUser(
      store,
      lessons,
      userA.id,
      sourceId,
      chapterId,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.progress).toEqual({
      chapterNodeId: chapterId,
      totalTopics: 6,
      completedTopics: 0,
      progressPercent: 0,
    });
    expect(result.value.nextTopic?.nodeId).toBe(topicIds[0]);
  }, 30_000);

  it("3-4. completing topics increases the count and percent correctly", async () => {
    await makeLessonAsAdmin(topicIds[0], "COMPLETED");

    const store = createCurriculumStore(userA.client);
    const lessons = createLessonStore(userA.client);
    const after1 = await getChapterProgressForUser(
      store,
      lessons,
      userA.id,
      sourceId,
      chapterId,
    );
    expect(after1.ok).toBe(true);
    if (after1.ok) {
      expect(after1.value.progress.completedTopics).toBe(1);
      expect(after1.value.progress.progressPercent).toBe(17);
      expect(after1.value.nextTopic?.nodeId).toBe(topicIds[1]);
    }

    await makeLessonAsAdmin(topicIds[1], "COMPLETED");
    const after2 = await getChapterProgressForUser(
      store,
      lessons,
      userA.id,
      sourceId,
      chapterId,
    );
    expect(after2.ok).toBe(true);
    if (after2.ok) {
      expect(after2.value.progress.completedTopics).toBe(2);
      expect(after2.value.progress.progressPercent).toBe(33);
      expect(after2.value.nextTopic?.nodeId).toBe(topicIds[2]);
    }
  }, 30_000);

  it("5. a later ACTIVE lesson on an already-completed topic keeps it COMPLETED and next topic unaffected", async () => {
    await makeLessonAsAdmin(topicIds[0], "ACTIVE"); // second lesson, topic 0

    const store = createCurriculumStore(userA.client);
    const lessons = createLessonStore(userA.client);
    const result = await getChapterProgressForUser(
      store,
      lessons,
      userA.id,
      sourceId,
      chapterId,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.progress.completedTopics).toBe(2); // still 0 and 1
    expect(result.value.nextTopic?.nodeId).toBe(topicIds[2]);
  }, 30_000);

  it("6. all six completed -> 6/6, 100%, next topic null", async () => {
    for (const nodeId of topicIds.slice(2)) {
      await makeLessonAsAdmin(nodeId, "COMPLETED");
    }

    const store = createCurriculumStore(userA.client);
    const lessons = createLessonStore(userA.client);
    const result = await getChapterProgressForUser(
      store,
      lessons,
      userA.id,
      sourceId,
      chapterId,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.progress).toEqual({
      chapterNodeId: chapterId,
      totalTopics: 6,
      completedTopics: 6,
      progressPercent: 100,
    });
    expect(result.value.nextTopic).toBeNull();
  }, 30_000);

  it("7. archived topic does not increase totalTopics", async () => {
    const store = createCurriculumStore(userA.client);
    const lessons = createLessonStore(userA.client);
    const result = await getChapterProgressForUser(
      store,
      lessons,
      userA.id,
      sourceId,
      chapterId,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.progress.totalTopics).toBe(6);
    expect([result.value.nextTopic?.nodeId].includes(archivedTopicId)).toBe(
      false,
    );
  }, 30_000);

  it("8. another source/version's identically-titled chapter/topic does not contaminate this result", async () => {
    const store = createCurriculumStore(userA.client);
    const lessons = createLessonStore(userA.client);
    const result = await getChapterProgressForUser(
      store,
      lessons,
      userA.id,
      sourceId,
      chapterId,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // This source's chapter is now 6/6 completed (from the prior test) —
    // the OTHER source's separately-completed "Topic 0" must not be
    // double-counted or change this result at all.
    expect(result.value.progress.completedTopics).toBe(6);
    expect(result.value.progress.totalTopics).toBe(6);
  }, 30_000);

  it("9. user isolation: userB has 0/6 completed for the same chapter", async () => {
    const store = createCurriculumStore(userB.client);
    const lessons = createLessonStore(userB.client);
    const result = await getChapterProgressForUser(
      store,
      lessons,
      userB.id,
      sourceId,
      chapterId,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.progress.completedTopics).toBe(0);
    expect(result.value.nextTopic?.nodeId).toBe(topicIds[0]);
  }, 30_000);

  it("10. topic position determines next-topic selection, verified against the other source's chapter", async () => {
    const store = createCurriculumStore(userA.client);
    const lessons = createLessonStore(userA.client);
    const result = await getChapterProgressForUser(
      store,
      lessons,
      userA.id,
      otherSourceId,
      otherChapterId,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // userA completed "Topic 0" under the OTHER source earlier — its single
    // topic (position 0) is now fully done.
    expect(result.value.progress).toEqual({
      chapterNodeId: otherChapterId,
      totalTopics: 1,
      completedTopics: 1,
      progressPercent: 100,
    });
    expect(result.value.nextTopic).toBeNull();
  }, 30_000);
});

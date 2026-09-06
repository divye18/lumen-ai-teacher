/**
 * INTEGRATION — learner curriculum topic progress read model (Milestone
 * 18.3d), against a real Supabase project. Not part of `npm test`.
 *
 *   LUMEN_TEST_SUPABASE_URL=...
 *   LUMEN_TEST_SUPABASE_ANON_KEY=...
 *   LUMEN_TEST_SERVICE_ROLE_KEY=...
 *   npm run test:integration
 *
 * Fully isolated: two ephemeral users, two ephemeral global curriculum
 * sources (one "current version", one "another version" for the
 * source-isolation test), and every lesson created for this test are
 * cleaned up in `afterAll` (deleting the users cascades their lessons via
 * the existing `lessons.user_id ... on delete cascade`; the sources are
 * deleted directly, cascading their nodes). Nothing is left behind, and the
 * real production NCERT pilot is never touched.
 */
import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createCurriculumStore,
  createLessonStore,
} from "@/lib/db/repositories";
import type { Database } from "@/lib/db/types";

import { getTopicProgressForUser } from "./topic-progress";

const url = process.env.LUMEN_TEST_SUPABASE_URL;
const anonKey = process.env.LUMEN_TEST_SUPABASE_ANON_KEY;
const serviceKey = process.env.LUMEN_TEST_SERVICE_ROLE_KEY;

const ready = Boolean(url && anonKey && serviceKey);

describe.skipIf(!ready)("getTopicProgressForUser (integration)", () => {
  let admin: ReturnType<typeof createClient<Database>>;
  const testId = randomUUID().slice(0, 8);

  const userA = {
    email: `lumen-topic-progress-a-${testId}@example.test`,
    password: randomUUID(),
    id: "",
    client: null as unknown as ReturnType<typeof createClient<Database>>,
  };
  const userB = {
    email: `lumen-topic-progress-b-${testId}@example.test`,
    password: randomUUID(),
    id: "",
    client: null as unknown as ReturnType<typeof createClient<Database>>,
  };

  let sourceId = "";
  let otherSourceId = "";
  let otherTopicNodeId = "";
  const topicIds: Record<string, string> = {};
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
      title: `Test progress source ${testId}`,
      status: "READY",
      version: `test-${testId}`,
    });
    if (!source.ok) throw source.error;
    sourceId = source.value.id;

    // Four topics: not-started, in-progress, completed, and one that will
    // get an ACTIVE lesson AFTER an already-COMPLETED one (stickiness test).
    const titles = [
      "Not Started Topic",
      "In Progress Topic",
      "Completed Topic",
      "Sticky Topic",
      "Archived Topic",
    ];
    for (let i = 0; i < titles.length; i++) {
      const node = await curriculum.createNode({
        curriculumSourceId: sourceId,
        nodeType: "TOPIC",
        title: titles[i],
        normalizedTitle: titles[i].toLowerCase(),
        position: i,
        status: titles[i] === "Archived Topic" ? "ARCHIVED" : "ACTIVE",
      });
      if (!node.ok) throw node.error;
      topicIds[titles[i]] = node.value.id;
    }

    // A second, independent global source with an identically-titled topic —
    // proves progress never leaks across curriculum sources/versions.
    const otherSource = await curriculum.createSource({
      kind: "NCERT",
      title: `Test other-version source ${testId}`,
      status: "READY",
      version: `test-other-${testId}`,
    });
    if (!otherSource.ok) throw otherSource.error;
    otherSourceId = otherSource.value.id;

    const otherNode = await curriculum.createNode({
      curriculumSourceId: otherSourceId,
      nodeType: "TOPIC",
      title: "Completed Topic",
      normalizedTitle: "completed topic",
      position: 0,
      status: "ACTIVE",
    });
    if (!otherNode.ok) throw otherNode.error;
    otherTopicNodeId = otherNode.value.id;

    const lessons = createLessonStore(admin);

    async function makeLesson(nodeId: string, status: string) {
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

    // In Progress Topic: one ACTIVE lesson.
    await makeLesson(topicIds["In Progress Topic"], "ACTIVE");

    // Completed Topic: one COMPLETED lesson.
    await makeLesson(topicIds["Completed Topic"], "COMPLETED");

    // Sticky Topic: an OLDER completed lesson, then a NEWER active one —
    // aggregate must remain COMPLETED.
    await makeLesson(topicIds["Sticky Topic"], "COMPLETED");
    await makeLesson(topicIds["Sticky Topic"], "ACTIVE");

    // Same "Completed Topic" title under the OTHER source, for userA, with
    // its own COMPLETED lesson — must not leak into the first source's result.
    const otherLessons = await admin
      .from("lessons")
      .insert({
        user_id: userA.id,
        title: "Other-source lesson",
        topic: "Other-source lesson",
        objective: "N/A",
        source_grounded: false,
        plan_source: "fallback",
        status: "COMPLETED",
        plan: {},
        citations: [],
        curriculum_node_id: otherNode.value.id,
      })
      .select("id")
      .single();
    if (otherLessons.error) throw otherLessons.error;
    createdLessonIds.push(otherLessons.data.id);
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

  it("1-5, 8-10. returns correct status per topic, excludes archived, includes untouched, preserves order", async () => {
    const store = createCurriculumStore(userA.client);
    const lessons = createLessonStore(userA.client);

    const result = await getTopicProgressForUser(
      store,
      lessons,
      userA.id,
      sourceId,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // 8. Archived Topic excluded — only 4 of the 5 created topics appear.
    expect(result.value).toHaveLength(4);

    // 10. Ordering follows position (0..3 as created).
    const byTitle = new Map(
      Object.entries(topicIds).map(([title, id]) => [id, title]),
    );
    expect(result.value.map((r) => byTitle.get(r.nodeId))).toEqual([
      "Not Started Topic",
      "In Progress Topic",
      "Completed Topic",
      "Sticky Topic",
    ]);

    const byNode = new Map(result.value.map((r) => [r.nodeId, r.status]));
    // 1. Untouched topic -> NOT_STARTED (also covers "9. all topics returned").
    expect(byNode.get(topicIds["Not Started Topic"])).toBe("NOT_STARTED");
    // 2. Active lesson -> IN_PROGRESS.
    expect(byNode.get(topicIds["In Progress Topic"])).toBe("IN_PROGRESS");
    // 3-4. Completed lesson -> COMPLETED.
    expect(byNode.get(topicIds["Completed Topic"])).toBe("COMPLETED");
    // 5. Completed + later active -> still COMPLETED (sticky).
    expect(byNode.get(topicIds["Sticky Topic"])).toBe("COMPLETED");
  }, 30_000);

  it("6. user isolation: userB sees only NOT_STARTED for topics only userA has lessons for", async () => {
    const store = createCurriculumStore(userB.client);
    const lessons = createLessonStore(userB.client);

    const result = await getTopicProgressForUser(
      store,
      lessons,
      userB.id,
      sourceId,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.every((r) => r.status === "NOT_STARTED")).toBe(true);
  }, 30_000);

  it("7. source/version isolation: the other source's identically-titled completed topic does not leak in", async () => {
    const store = createCurriculumStore(userA.client);
    const lessons = createLessonStore(userA.client);

    const result = await getTopicProgressForUser(
      store,
      lessons,
      userA.id,
      sourceId,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // "Completed Topic" under THIS source is correctly COMPLETED (userA's
    // own lesson there) — but that must come from this source's own node,
    // not from the other source's identically-titled, also-completed topic.
    const completed = result.value.find(
      (r) => r.nodeId === topicIds["Completed Topic"],
    );
    expect(completed?.status).toBe("COMPLETED");
    // And the result set is scoped to exactly this source's topics — the
    // OTHER source's distinct "Completed Topic" node id never appears here.
    expect(result.value.map((r) => r.nodeId)).not.toContain(otherTopicNodeId);
  }, 30_000);
});

/**
 * INTEGRATION — NCERT curriculum browser (Milestone 18.1), against the real
 * Supabase project and the ACTUAL production NCERT pilot data imported in
 * Milestone 17.3.d. Not part of `npm test`.
 *
 *   LUMEN_TEST_SUPABASE_URL=...
 *   LUMEN_TEST_SUPABASE_ANON_KEY=...
 *   LUMEN_TEST_SERVICE_ROLE_KEY=...
 *   npm run test:integration
 *
 * READ-ONLY: this test never writes to curriculum_sources/curriculum_nodes
 * (the browser helper has no write path at all), and it never touches
 * concepts/mastery/misconceptions/sessions/teaching_answers. One ephemeral
 * user is created (to exercise the real `authenticated`-role RLS path) and
 * deleted in `afterAll` — nothing is left behind.
 */
import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createCurriculumStore } from "@/lib/db/repositories";
import type { Database } from "@/lib/db/types";

import {
  getNcertChapterLevel,
  getNcertClassLevel,
  getNcertSubjectLevel,
  getNcertTopicLevel,
  nodeSlug,
} from "./ncert-browser";

const url = process.env.LUMEN_TEST_SUPABASE_URL;
const anonKey = process.env.LUMEN_TEST_SUPABASE_ANON_KEY;
const serviceKey = process.env.LUMEN_TEST_SERVICE_ROLE_KEY;

const ready = Boolean(url && anonKey && serviceKey);

describe.skipIf(!ready)("NCERT curriculum browser (integration)", () => {
  let admin: ReturnType<typeof createClient<Database>>;
  const user = {
    email: `lumen-curriculum-browser-${randomUUID().slice(0, 8)}@example.test`,
    password: randomUUID(),
    id: "",
    client: null as unknown as ReturnType<typeof createClient<Database>>,
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

    user.client = createClient<Database>(url as string, anonKey as string);
    const signIn = await user.client.auth.signInWithPassword({
      email: user.email,
      password: user.password,
    });
    if (signIn.error) throw signIn.error;
  }, 30_000);

  afterAll(async () => {
    if (user.id) await admin.auth.admin.deleteUser(user.id);
  });

  it("resolves Class 11 -> Physics -> Units and Measurement -> exactly the 6 persisted topics", async () => {
    const store = createCurriculumStore(user.client);

    const classLevel = await getNcertClassLevel(store, user.id);
    expect(classLevel.ok).toBe(true);
    if (!classLevel.ok) return;
    expect(classLevel.value.classes.length).toBeGreaterThan(0);
    const classNode = classLevel.value.classes[0];
    const classSlug = nodeSlug(classNode);

    const subjectLevel = await getNcertSubjectLevel(store, user.id, classSlug);
    expect(subjectLevel.ok).toBe(true);
    if (!subjectLevel.ok || !subjectLevel.value) return;
    expect(subjectLevel.value.subjects.length).toBeGreaterThan(0);
    const subjectNode = subjectLevel.value.subjects[0];
    const subjectSlug = nodeSlug(subjectNode);

    const chapterLevel = await getNcertChapterLevel(
      store,
      user.id,
      classSlug,
      subjectSlug,
    );
    expect(chapterLevel.ok).toBe(true);
    if (!chapterLevel.ok || !chapterLevel.value) return;
    expect(chapterLevel.value.chapters.length).toBeGreaterThan(0);
    const chapterNode = chapterLevel.value.chapters[0];
    const chapterSlug = nodeSlug(chapterNode);

    const topicLevel = await getNcertTopicLevel(
      store,
      user.id,
      classSlug,
      subjectSlug,
      chapterSlug,
    );
    expect(topicLevel.ok).toBe(true);
    if (!topicLevel.ok || !topicLevel.value) return;

    // Exactly the verified 17.3.b/17.3.d pilot — never the legacy 10-topic
    // structure, never invented topics.
    expect(topicLevel.value.topics.map((t) => t.title)).toEqual([
      "Introduction",
      "The International System of Units",
      "Significant Figures",
      "Dimensions of Physical Quantities",
      "Dimensional Formulae and Dimensional Equations",
      "Dimensional Analysis and its Applications",
    ]);
  }, 30_000);

  it("returns ok(null) for an invalid slug at any level, never unrelated data", async () => {
    const store = createCurriculumStore(user.client);

    const badClass = await getNcertSubjectLevel(store, user.id, "class-999");
    expect(badClass.ok).toBe(true);
    if (badClass.ok) expect(badClass.value).toBeNull();

    const classLevel = await getNcertClassLevel(store, user.id);
    if (!classLevel.ok || classLevel.value.classes.length === 0) return;
    const classSlug = nodeSlug(classLevel.value.classes[0]);

    const badSubject = await getNcertChapterLevel(
      store,
      user.id,
      classSlug,
      "not-a-real-subject",
    );
    expect(badSubject.ok).toBe(true);
    if (badSubject.ok) expect(badSubject.value).toBeNull();
  }, 30_000);

  it("did not mutate curriculum data or touch learner-specific tables", async () => {
    const nodesBefore = await admin
      .from("curriculum_nodes")
      .select("id", { count: "exact", head: true });
    const concepts = await admin
      .from("concepts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);
    const sessions = await admin
      .from("learning_sessions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);

    expect(nodesBefore.count).toBe(9);
    expect(concepts.count).toBe(0);
    expect(sessions.count).toBe(0);
  }, 30_000);
});

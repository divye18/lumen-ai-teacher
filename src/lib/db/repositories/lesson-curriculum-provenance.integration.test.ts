/**
 * INTEGRATION — lesson curriculum provenance schema (Milestone 18.3a),
 * against a real Supabase project. Not part of `npm test`.
 *
 *   LUMEN_TEST_SUPABASE_URL=...
 *   LUMEN_TEST_SUPABASE_ANON_KEY=...
 *   LUMEN_TEST_SERVICE_ROLE_KEY=...
 *   npm run test:integration
 *
 * This milestone is schema-only: `lessons.curriculum_node_id` is a new
 * nullable FK, and NOTHING in the application yet populates it (that is
 * 18.3b). So this test writes the column directly via the admin client —
 * proving the DATABASE can store provenance — rather than through
 * `createLessonForUser`/`lesson-store.ts`'s `create()`, which intentionally
 * does not touch this column yet.
 *
 * Two ephemeral users, one ephemeral global curriculum source + one node,
 * and both lessons created for this test are all cleaned up in `afterAll`
 * (deleting the users cascades their lessons via the existing
 * `lessons.user_id ... on delete cascade`) — nothing is left behind.
 */
import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createCurriculumStore,
  createLessonStore,
} from "@/lib/db/repositories";
import type { Database } from "@/lib/db/types";
import { createLessonForUser } from "@/lib/lesson/service";
import { resolveLessonCurriculumNode } from "@/lib/curriculum/validate-lesson-node";

const url = process.env.LUMEN_TEST_SUPABASE_URL;
const anonKey = process.env.LUMEN_TEST_SUPABASE_ANON_KEY;
const serviceKey = process.env.LUMEN_TEST_SERVICE_ROLE_KEY;

const ready = Boolean(url && anonKey && serviceKey);

describe.skipIf(!ready)("lessons.curriculum_node_id (integration)", () => {
  let admin: ReturnType<typeof createClient<Database>>;
  const testId = randomUUID().slice(0, 8);

  const userA = {
    email: `lumen-provenance-a-${testId}@example.test`,
    password: randomUUID(),
    id: "",
    client: null as unknown as ReturnType<typeof createClient<Database>>,
  };
  const userB = {
    email: `lumen-provenance-b-${testId}@example.test`,
    password: randomUUID(),
    id: "",
    client: null as unknown as ReturnType<typeof createClient<Database>>,
  };

  let sourceId = "";
  let nodeId = "";
  /** An existing, ordinary free-text lesson — created through the real
   * (unmodified) repository, to prove existing behavior is unaffected. */
  let freeTextLessonId = "";
  /** A lesson with provenance, written directly via the admin client since
   * no application code path sets this column yet (18.3b). */
  let provenanceLessonId = "";

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
      title: `Test provenance source ${testId}`,
      status: "READY",
      version: `test-${testId}`,
    });
    if (!source.ok) throw source.error;
    sourceId = source.value.id;

    const node = await curriculum.createNode({
      curriculumSourceId: sourceId,
      nodeType: "TOPIC",
      title: "Test Topic",
      normalizedTitle: "test topic",
      position: 0,
      status: "ACTIVE",
    });
    if (!node.ok) throw node.error;
    nodeId = node.value.id;

    const lessons = createLessonStore(admin);
    const freeText = await lessons.create({
      userId: userA.id,
      title: "Free-text lesson",
      topic: "Some freely typed topic",
      objective: "Understand the topic.",
      language: "en",
      sourceGrounded: false,
      planSource: "fallback",
      status: "DRAFT",
      plan: {},
      citations: [],
    });
    if (!freeText.ok) throw freeText.error;
    freeTextLessonId = freeText.value.id;
  }, 30_000);

  afterAll(async () => {
    if (sourceId) {
      await admin.from("curriculum_sources").delete().eq("id", sourceId);
    }
    if (userA.id) await admin.auth.admin.deleteUser(userA.id);
    if (userB.id) await admin.auth.admin.deleteUser(userB.id);
  });

  it("1-2. an existing (free-text) lesson has curriculum_node_id = NULL", async () => {
    const res = await admin
      .from("lessons")
      .select("curriculum_node_id")
      .eq("id", freeTextLessonId)
      .single();
    expect(res.error).toBeNull();
    expect(res.data?.curriculum_node_id).toBeNull();
  });

  it("3-4. a lesson can store a valid curriculum_nodes.id (column accepts non-null)", async () => {
    const res = await admin
      .from("lessons")
      .insert({
        user_id: userA.id,
        title: "Provenance lesson",
        topic: "Test Topic",
        objective: "Understand the topic.",
        source_grounded: false,
        plan_source: "fallback",
        status: "DRAFT",
        plan: {},
        citations: [],
        curriculum_node_id: nodeId,
      })
      .select("id, curriculum_node_id")
      .single();
    expect(res.error).toBeNull();
    expect(res.data?.curriculum_node_id).toBe(nodeId);
    provenanceLessonId = res.data!.id;
  });

  it("5. references a valid global NCERT node", async () => {
    const res = await admin
      .from("lessons")
      .select("curriculum_node_id")
      .eq("id", provenanceLessonId)
      .single();
    expect(res.data?.curriculum_node_id).toBe(nodeId);

    const nodeRes = await admin
      .from("curriculum_nodes")
      .select("id, node_type")
      .eq("id", nodeId)
      .single();
    expect(nodeRes.data?.node_type).toBe("TOPIC");
  });

  it("6. an invalid/nonexistent curriculum_node_id is rejected by the FK", async () => {
    const res = await admin.from("lessons").insert({
      user_id: userA.id,
      title: "Bad provenance lesson",
      topic: "Should not be created",
      objective: "N/A",
      source_grounded: false,
      plan_source: "fallback",
      status: "DRAFT",
      plan: {},
      citations: [],
      curriculum_node_id: randomUUID(), // a well-formed but nonexistent uuid
    });
    expect(res.error).not.toBeNull();
  });

  it("7. deleting the referenced curriculum node sets curriculum_node_id to NULL, never deletes the lesson", async () => {
    const deleted = await admin
      .from("curriculum_nodes")
      .delete()
      .eq("id", nodeId);
    expect(deleted.error).toBeNull();

    const lessonRes = await admin
      .from("lessons")
      .select("id, curriculum_node_id")
      .eq("id", provenanceLessonId)
      .maybeSingle();
    expect(lessonRes.error).toBeNull();
    expect(lessonRes.data).not.toBeNull();
    expect(lessonRes.data?.curriculum_node_id).toBeNull();
  });

  it("8-9. existing lesson ownership/RLS remains intact — one user's lesson is invisible to another", async () => {
    const lessons = createLessonStore(userA.client);
    const ownRead = await lessons.get(freeTextLessonId);
    expect(ownRead.ok).toBe(true);

    const otherLessons = createLessonStore(userB.client);
    const otherRead = await otherLessons.get(freeTextLessonId);
    // RLS hides the row entirely — `get` resolves NOT_FOUND, not the row.
    expect(otherRead.ok).toBe(false);
  });

  it("10. curriculum nodes remain globally readable per existing RLS", async () => {
    const curriculumAsUserB = createCurriculumStore(userB.client);
    const sourceRead = await curriculumAsUserB.getSource(sourceId);
    expect(sourceRead.ok).toBe(true);
    if (sourceRead.ok) expect(sourceRead.value.owner_user_id).toBeNull();
  });

  it("11. no concepts/mastery/misconceptions/session rows were created by this schema change", async () => {
    for (const table of [
      "concepts",
      "concept_mastery",
      "misconceptions",
      "learning_sessions",
      "teaching_answers",
    ] as const) {
      const res = await admin
        .from(table)
        .select("*", { count: "exact", head: true })
        .eq("user_id", userA.id);
      expect(res.count).toBe(0);
    }
  });
});

/**
 * Milestone 18.3b — threading `curriculumNodeId` through the real
 * `createLessonForUser`/`resolveLessonCurriculumNode` path (not a raw admin
 * insert, unlike the 18.3a suite above). A separate ephemeral
 * users/source/node set, fully independent of the 18.3a suite's node
 * (which that suite deletes as part of its own ON DELETE SET NULL test).
 */
describe.skipIf(!ready)(
  "lesson provenance threading (18.3b, integration)",
  () => {
    let admin: ReturnType<typeof createClient<Database>>;
    const testId = randomUUID().slice(0, 8);

    const userA = {
      email: `lumen-provenance-b-a-${testId}@example.test`,
      password: randomUUID(),
      id: "",
      client: null as unknown as ReturnType<typeof createClient<Database>>,
    };
    /** Owns a PRIVATE curriculum source — used for the security test. */
    const userB = {
      email: `lumen-provenance-b-b-${testId}@example.test`,
      password: randomUUID(),
      id: "",
      client: null as unknown as ReturnType<typeof createClient<Database>>,
    };

    let globalSourceId = "";
    let topicNodeId = "";
    let privateSourceId = "";
    let privateNodeId = "";
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

      const globalSource = await curriculum.createSource({
        kind: "NCERT",
        title: `Test 18.3b global source ${testId}`,
        status: "READY",
        version: `test-18.3b-${testId}`,
      });
      if (!globalSource.ok) throw globalSource.error;
      globalSourceId = globalSource.value.id;

      const topicNode = await curriculum.createNode({
        curriculumSourceId: globalSourceId,
        nodeType: "TOPIC",
        title: "Introduction",
        normalizedTitle: "introduction",
        position: 0,
        status: "ACTIVE",
      });
      if (!topicNode.ok) throw topicNode.error;
      topicNodeId = topicNode.value.id;

      // userB's own PRIVATE source + a TOPIC node under it — used to prove
      // userA cannot reference it even by guessing/submitting its real id.
      const privateSource = await curriculum.createSource({
        ownerUserId: userB.id,
        kind: "USER_UPLOAD",
        title: "userB's private curriculum",
        status: "READY",
      });
      if (!privateSource.ok) throw privateSource.error;
      privateSourceId = privateSource.value.id;

      const privateNode = await curriculum.createNode({
        curriculumSourceId: privateSourceId,
        nodeType: "TOPIC",
        title: "Private Topic",
        normalizedTitle: "private topic",
        position: 0,
        status: "ACTIVE",
      });
      if (!privateNode.ok) throw privateNode.error;
      privateNodeId = privateNode.value.id;
    }, 30_000);

    afterAll(async () => {
      if (createdLessonIds.length > 0) {
        await admin.from("lessons").delete().in("id", createdLessonIds);
      }
      if (globalSourceId) {
        await admin
          .from("curriculum_sources")
          .delete()
          .eq("id", globalSourceId);
      }
      if (privateSourceId) {
        await admin
          .from("curriculum_sources")
          .delete()
          .eq("id", privateSourceId);
      }
      if (userA.id) await admin.auth.admin.deleteUser(userA.id);
      if (userB.id) await admin.auth.admin.deleteUser(userB.id);
    });

    it("A. free-text lesson creation (no curriculumNodeId) still results in curriculum_node_id = NULL", async () => {
      const result = await createLessonForUser(
        { db: userA.client, llm: null, retriever: null, userId: userA.id },
        { topic: "Newton's Laws" },
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      createdLessonIds.push(result.value.lessonId);

      const row = await admin
        .from("lessons")
        .select("curriculum_node_id")
        .eq("id", result.value.lessonId)
        .single();
      expect(row.data?.curriculum_node_id).toBeNull();
    });

    it("B/G. a validated curriculumNodeId is persisted exactly onto the created lesson", async () => {
      const store = createCurriculumStore(userA.client);
      const resolved = await resolveLessonCurriculumNode(store, topicNodeId);
      expect(resolved.ok).toBe(true);
      if (!resolved.ok) return;

      const result = await createLessonForUser(
        { db: userA.client, llm: null, retriever: null, userId: userA.id },
        {
          topic: "Units and Measurement — Introduction",
          curriculumNodeId: resolved.value,
        },
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      createdLessonIds.push(result.value.lessonId);

      const row = await admin
        .from("lessons")
        .select("curriculum_node_id, topic, title")
        .eq("id", result.value.lessonId)
        .single();
      expect(row.data?.curriculum_node_id).toBe(topicNodeId);
      expect(row.data?.topic).toBe("Units and Measurement — Introduction");
    });

    it("13. SECURITY: userA cannot reference userB's private curriculum node, even by submitting its real id", async () => {
      const storeAsUserA = createCurriculumStore(userA.client);
      const resolved = await resolveLessonCurriculumNode(
        storeAsUserA,
        privateNodeId,
      );
      // RLS hides userB's private node from userA entirely, so resolution
      // fails exactly like a nonexistent id would — never silently accepted.
      expect(resolved.ok).toBe(false);
    });
  },
);

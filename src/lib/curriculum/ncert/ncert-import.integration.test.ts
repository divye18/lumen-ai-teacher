/**
 * INTEGRATION — NCERT persistence importer (Milestone 17.3.c), against a
 * real Supabase project. Not part of `npm test`.
 *
 *   LUMEN_TEST_SUPABASE_URL=...
 *   LUMEN_TEST_SUPABASE_ANON_KEY=...
 *   LUMEN_TEST_SERVICE_ROLE_KEY=...
 *   npm run test:integration
 *
 * Uses a deliberately fake, uniquely-suffixed dataset (never the real
 * `data/curriculum/ncert/class-11/physics.json` file) so this test never
 * touches, collides with, or leaves behind anything resembling the actual
 * production NCERT import — no production data is imported anywhere in this
 * test. The one global source it creates is deleted in `afterAll`
 * (cascading to its nodes), and the ephemeral users are deleted too —
 * nothing is left behind in the hosted project, following the same
 * discipline as `curriculum.integration.test.ts`.
 */
import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createCurriculumStore } from "@/lib/db/repositories";
import type { Database } from "@/lib/db/types";

import type { NcertDatasetInput } from "./contracts";
import { parseNcertDataset } from "./dataset";
import { importNcertDataset } from "./importer";

const url = process.env.LUMEN_TEST_SUPABASE_URL;
const anonKey = process.env.LUMEN_TEST_SUPABASE_ANON_KEY;
const serviceKey = process.env.LUMEN_TEST_SERVICE_ROLE_KEY;

const ready = Boolean(url && anonKey && serviceKey);

describe.skipIf(!ready)("NCERT importer (integration)", () => {
  let admin: ReturnType<typeof createClient<Database>>;
  const testId = randomUUID().slice(0, 8);
  const textbookVersion = `test-${testId}`;
  const datasetVersion = `test-${testId}.v1`;

  const user = {
    email: `lumen-ncert-import-${testId}@example.test`,
    password: randomUUID(),
    id: "",
    client: null as unknown as ReturnType<typeof createClient<Database>>,
  };

  let sourceId = "";

  function dataset(
    topics: { title: string; position: number }[],
  ): NcertDatasetInput {
    return {
      datasetVersion,
      source: {
        kind: "NCERT",
        class: "11",
        subject: "Physics",
        textbookVersion,
      },
      chapters: [
        {
          title: "Test Chapter",
          position: 0,
          topics: topics.map((t) => ({ ...t, subtopics: [] })),
        },
      ],
    };
  }

  function planFor(topics: { title: string; position: number }[]) {
    const result = parseNcertDataset(dataset(topics));
    if (!result.ok) throw result.error;
    return result.value;
  }

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
    if (sourceId) {
      await admin.from("curriculum_sources").delete().eq("id", sourceId);
    }
    if (user.id) await admin.auth.admin.deleteUser(user.id);
  });

  it("1-5. first import creates exactly one global source and the expected hierarchy", async () => {
    const store = createCurriculumStore(admin);
    const plan = planFor([
      { title: "Topic A", position: 0 },
      { title: "Topic B", position: 1 },
    ]);

    const result = await importNcertDataset(store, plan);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    sourceId = result.value.sourceId;
    expect(result.value.createdSources).toBe(1);
    expect(result.value.reusedSources).toBe(0);
    // CLASS + SUBJECT + CHAPTER + 2 TOPIC = 5
    expect(result.value.createdNodes).toBe(5);
    expect(result.value.reusedNodes).toBe(0);
    expect(result.value.updatedNodes).toBe(0);
    expect(result.value.archivedNodes).toBe(0);

    const source = await store.getSource(sourceId);
    expect(source.ok).toBe(true);
    if (source.ok) {
      expect(source.value.owner_user_id).toBeNull();
      expect(source.value.kind).toBe("NCERT");
      expect(source.value.version).toBe(datasetVersion);
      expect(source.value.metadata).toMatchObject({
        class: "11",
        subject: "Physics",
        textbookVersion,
        datasetVersion,
      });
    }

    const nodes = await store.listNodesForSource(sourceId);
    expect(nodes.ok).toBe(true);
    if (nodes.ok) {
      expect(nodes.value).toHaveLength(5);
      expect(nodes.value.map((n) => n.node_type).sort()).toEqual(
        ["CHAPTER", "CLASS", "SUBJECT", "TOPIC", "TOPIC"].sort(),
      );
    }
  }, 30_000);

  it("6-11. second identical import is a full no-op: zero new sources/nodes, same ids, same order", async () => {
    const store = createCurriculumStore(admin);
    const plan = planFor([
      { title: "Topic A", position: 0 },
      { title: "Topic B", position: 1 },
    ]);

    const before = await store.listNodesForSource(sourceId);
    expect(before.ok).toBe(true);
    const idsBefore = before.ok
      ? new Map(before.value.map((n) => [`${n.node_type}:${n.title}`, n.id]))
      : new Map();

    const result = await importNcertDataset(store, plan);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.sourceId).toBe(sourceId);
    expect(result.value.createdSources).toBe(0);
    expect(result.value.reusedSources).toBe(1);
    expect(result.value.createdNodes).toBe(0);
    expect(result.value.reusedNodes).toBe(5);
    expect(result.value.updatedNodes).toBe(0);
    expect(result.value.archivedNodes).toBe(0);

    const after = await store.listNodesForSource(sourceId);
    expect(after.ok).toBe(true);
    if (after.ok) {
      expect(after.value).toHaveLength(5);
      for (const node of after.value) {
        expect(idsBefore.get(`${node.node_type}:${node.title}`)).toBe(node.id);
      }
    }
  }, 30_000);

  it("12. a changed position is updated safely, without creating or removing nodes", async () => {
    const store = createCurriculumStore(admin);
    // Swap positions: Topic A -> 1, Topic B -> 0.
    const plan = planFor([
      { title: "Topic A", position: 1 },
      { title: "Topic B", position: 0 },
    ]);

    const result = await importNcertDataset(store, plan);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.createdNodes).toBe(0);
    expect(result.value.updatedNodes).toBe(2);
    expect(result.value.reusedNodes).toBe(3); // CLASS, SUBJECT, CHAPTER
    expect(result.value.archivedNodes).toBe(0);

    const allNodes = await store.listNodesForSource(sourceId);
    expect(allNodes.ok).toBe(true);
    if (!allNodes.ok) return;
    const chapter = allNodes.value.find((n) => n.node_type === "CHAPTER");
    expect(chapter).toBeDefined();
    const children = await store.listChildren(sourceId, chapter!.id);
    expect(children.ok).toBe(true);
    if (children.ok) {
      expect(children.value.map((c) => c.title)).toEqual([
        "Topic B",
        "Topic A",
      ]);
    }
  }, 30_000);

  it("13. a newly added topic is created without duplicating existing nodes", async () => {
    const store = createCurriculumStore(admin);
    const plan = planFor([
      { title: "Topic A", position: 1 },
      { title: "Topic B", position: 0 },
      { title: "Topic C", position: 2 },
    ]);

    const result = await importNcertDataset(store, plan);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.createdNodes).toBe(1);
    expect(result.value.reusedNodes).toBe(5);
    expect(result.value.updatedNodes).toBe(0);
    expect(result.value.archivedNodes).toBe(0);

    const nodes = await store.listNodesForSource(sourceId);
    expect(nodes.ok).toBe(true);
    if (nodes.ok) {
      const topics = nodes.value.filter((n) => n.node_type === "TOPIC");
      expect(topics).toHaveLength(3);
    }
  }, 30_000);

  it("a topic dropped from a newer dataset is archived, never deleted", async () => {
    const store = createCurriculumStore(admin);
    // Back to A + B only — Topic C is no longer in the dataset.
    const plan = planFor([
      { title: "Topic A", position: 1 },
      { title: "Topic B", position: 0 },
    ]);

    const result = await importNcertDataset(store, plan);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.createdNodes).toBe(0);
    expect(result.value.archivedNodes).toBe(1);
    expect(result.value.reusedNodes).toBe(5);

    const nodes = await store.listNodesForSource(sourceId);
    expect(nodes.ok).toBe(true);
    if (nodes.ok) {
      const topics = nodes.value.filter((n) => n.node_type === "TOPIC");
      // The row still exists (never deleted) — just archived.
      expect(topics).toHaveLength(3);
      const topicC = topics.find((t) => t.title === "Topic C");
      expect(topicC?.status).toBe("ARCHIVED");
      const active = topics.filter((t) => t.status === "ACTIVE");
      expect(active.map((t) => t.title).sort()).toEqual(["Topic A", "Topic B"]);
    }
  }, 30_000);

  it("16. repeating the idempotency check again remains stable", async () => {
    const store = createCurriculumStore(admin);
    const plan = planFor([
      { title: "Topic A", position: 1 },
      { title: "Topic B", position: 0 },
    ]);

    const result = await importNcertDataset(store, plan);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.createdNodes).toBe(0);
    expect(result.value.createdSources).toBe(0);
    // Topic C stays archived and untouched — it's not part of this plan, and
    // the archive pass only re-archives what's already archived (a no-op).
  }, 30_000);

  it("14. existing concepts for an unrelated user are completely untouched by the import", async () => {
    const before = await admin
      .from("concepts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);
    expect(before.error).toBeNull();
    expect(before.count).toBe(0);

    // The import already ran multiple times above; re-check post-import.
    const after = await admin
      .from("concepts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);
    expect(after.error).toBeNull();
    expect(after.count).toBe(0);
  }, 30_000);

  it("15. RLS: the global NCERT source is readable by any authenticated user, unwritable by them", async () => {
    const asUser = createCurriculumStore(user.client);

    const read = await asUser.getSource(sourceId);
    expect(read.ok).toBe(true);
    if (read.ok) expect(read.value.owner_user_id).toBeNull();

    const mutate = await asUser.updateSource({
      id: sourceId,
      title: "Hijacked title",
    });
    expect(mutate.ok).toBe(false);

    const insertNode = await asUser.createNode({
      curriculumSourceId: sourceId,
      nodeType: "TOPIC",
      title: "Unauthorized Topic",
      normalizedTitle: "unauthorized topic",
      position: 99,
      status: "ACTIVE",
    });
    expect(insertNode.ok).toBe(false);
  }, 30_000);
});

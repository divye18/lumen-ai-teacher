/**
 * INTEGRATION — curriculum foundation (Milestone 17.2), against a real
 * Supabase project. Not part of `npm test`.
 *
 *   LUMEN_TEST_SUPABASE_URL=...
 *   LUMEN_TEST_SUPABASE_ANON_KEY=...
 *   LUMEN_TEST_SERVICE_ROLE_KEY=...
 *   npm run test:integration
 *
 * Verifies, against the real database:
 *   1. a private curriculum source + a full multi-level tree (root -> child
 *      -> grandchild) can be created and read back in position order;
 *   2. a shared/global source (owner_user_id IS NULL — created via the
 *      admin client, standing in for the future seed importer) is readable
 *      by any authenticated user;
 *   3. a private source stays invisible to a DIFFERENT user (RLS isolation);
 *   4. a normal authenticated user's attempt to mutate the global source, or
 *      insert a node under it, is rejected by RLS — global curriculum is
 *      not writable by any authenticated user in this milestone.
 *
 * `curriculum_nodes` deliberately has no link to `concepts` in this
 * milestone (concepts are per-user; a globally-shared node cannot safely
 * point at one universal concept row — see the migration header), so there
 * is no concept-linkage scenario to verify here.
 *
 * Two ephemeral users + one ephemeral global (admin-created, owner-less)
 * source are used and all deleted in `afterAll` — nothing is left behind in
 * the hosted project. Self-skips when DB creds are missing.
 */
import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "@/lib/db/types";
import { createCurriculumStore } from "@/lib/db/repositories";

const url = process.env.LUMEN_TEST_SUPABASE_URL;
const anonKey = process.env.LUMEN_TEST_SUPABASE_ANON_KEY;
const serviceKey = process.env.LUMEN_TEST_SERVICE_ROLE_KEY;

const ready = Boolean(url && anonKey && serviceKey);

describe.skipIf(!ready)("curriculum foundation (integration)", () => {
  let admin: ReturnType<typeof createClient<Database>>;
  const userA = {
    email: `lumen-curriculum-a-${randomUUID().slice(0, 8)}@example.test`,
    password: randomUUID(),
    id: "",
    client: null as unknown as ReturnType<typeof createClient<Database>>,
  };
  const userB = {
    email: `lumen-curriculum-b-${randomUUID().slice(0, 8)}@example.test`,
    password: randomUUID(),
    id: "",
    client: null as unknown as ReturnType<typeof createClient<Database>>,
  };
  /** A global (owner_user_id IS NULL) source, created via the admin client
   * as a stand-in for the future seed importer. Cleaned up manually in
   * afterAll since no user-deletion cascade reaches an owner-less row. */
  let globalSourceId = "";

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

    const globalSource = await createCurriculumStore(admin).createSource({
      kind: "NCERT",
      title: `Test NCERT ${randomUUID().slice(0, 8)}`,
      status: "READY",
      version: "2024-25",
    });
    if (!globalSource.ok) throw globalSource.error;
    globalSourceId = globalSource.value.id;
  }, 30_000);

  afterAll(async () => {
    if (globalSourceId) {
      await admin.from("curriculum_sources").delete().eq("id", globalSourceId);
    }
    // Cascades: profile -> curriculum_sources (private) -> curriculum_nodes,
    // and -> concepts created for these tests.
    if (userA.id) await admin.auth.admin.deleteUser(userA.id);
    if (userB.id) await admin.auth.admin.deleteUser(userB.id);
  });

  it("1-6. creates a private source and a multi-level hierarchy, read back in position order", async () => {
    const curriculum = createCurriculumStore(userA.client);

    // 1. private curriculum source
    const source = await curriculum.createSource({
      ownerUserId: userA.id,
      kind: "USER_UPLOAD",
      title: "My Physics Notes",
      status: "READY",
    });
    expect(source.ok).toBe(true);
    if (!source.ok) return;

    // 2. root node
    const root = await curriculum.createNode({
      curriculumSourceId: source.value.id,
      nodeType: "SUBJECT",
      title: "Physics",
      normalizedTitle: "physics",
      position: 0,
      status: "ACTIVE",
    });
    expect(root.ok).toBe(true);
    if (!root.ok) return;

    // 3. child nodes (two siblings, deliberately created out of position
    // order to prove ordering comes from the stored `position`, not insert
    // order).
    const chapterTwo = await curriculum.createNode({
      curriculumSourceId: source.value.id,
      parentId: root.value.id,
      nodeType: "CHAPTER",
      title: "Chapter 2: Magnetism",
      normalizedTitle: "chapter 2: magnetism",
      position: 1,
      status: "ACTIVE",
    });
    const chapterOne = await curriculum.createNode({
      curriculumSourceId: source.value.id,
      parentId: root.value.id,
      nodeType: "CHAPTER",
      title: "Chapter 1: Current Electricity",
      normalizedTitle: "chapter 1: current electricity",
      position: 0,
      status: "ACTIVE",
    });
    expect(chapterOne.ok && chapterTwo.ok).toBe(true);
    if (!chapterOne.ok || !chapterTwo.ok) return;

    // 4. deeper descendants (grandchild of root)
    const topic = await curriculum.createNode({
      curriculumSourceId: source.value.id,
      parentId: chapterOne.value.id,
      nodeType: "TOPIC",
      title: "Drift Velocity",
      normalizedTitle: "drift velocity",
      position: 0,
      status: "ACTIVE",
    });
    expect(topic.ok).toBe(true);

    // 5. read hierarchy
    const allNodes = await curriculum.listNodesForSource(source.value.id);
    expect(allNodes.ok).toBe(true);
    if (allNodes.ok) expect(allNodes.value).toHaveLength(4);

    // 6. position ordering — chapterOne (position 0) before chapterTwo
    // (position 1), regardless of insert order above.
    const children = await curriculum.listChildren(
      source.value.id,
      root.value.id,
    );
    expect(children.ok).toBe(true);
    if (children.ok) {
      expect(children.value.map((c) => c.title)).toEqual([
        "Chapter 1: Current Electricity",
        "Chapter 2: Magnetism",
      ]);
    }

    // Root children (parentId null) resolves correctly too.
    const roots = await curriculum.listChildren(source.value.id, null);
    expect(roots.ok).toBe(true);
    if (roots.ok) {
      expect(roots.value).toHaveLength(1);
      expect(roots.value[0].id).toBe(root.value.id);
    }
  }, 30_000);

  it("7. a shared/global source is readable by any authenticated user", async () => {
    const asUserA = await createCurriculumStore(userA.client).getSource(
      globalSourceId,
    );
    const asUserB = await createCurriculumStore(userB.client).getSource(
      globalSourceId,
    );
    expect(asUserA.ok).toBe(true);
    expect(asUserB.ok).toBe(true);
    if (asUserA.ok) expect(asUserA.value.owner_user_id).toBeNull();

    const listedForA = await createCurriculumStore(
      userA.client,
    ).listSourcesForUser(userA.id);
    expect(listedForA.ok).toBe(true);
    if (listedForA.ok) {
      expect(listedForA.value.some((s) => s.id === globalSourceId)).toBe(true);
    }
  }, 30_000);

  it("8. a private source is invisible to a different user", async () => {
    const source = await createCurriculumStore(userA.client).createSource({
      ownerUserId: userA.id,
      kind: "USER_UPLOAD",
      title: "User A's private source",
      status: "READY",
    });
    expect(source.ok).toBe(true);
    if (!source.ok) return;

    // User B's own request-scoped (RLS-enforced) client cannot see it.
    const asUserB = await createCurriculumStore(userB.client).getSource(
      source.value.id,
    );
    expect(asUserB.ok).toBe(false);

    const listedForB = await createCurriculumStore(
      userB.client,
    ).listSourcesForUser(userB.id);
    expect(listedForB.ok).toBe(true);
    if (listedForB.ok) {
      expect(listedForB.value.some((s) => s.id === source.value.id)).toBe(
        false,
      );
    }
  }, 30_000);

  it("9. an authenticated user cannot mutate the global source or insert nodes under it", async () => {
    const asUserA = createCurriculumStore(userA.client);

    const mutate = await asUserA.updateSource({
      id: globalSourceId,
      title: "Hijacked title",
    });
    expect(mutate.ok).toBe(false);

    const insertNode = await asUserA.createNode({
      curriculumSourceId: globalSourceId,
      nodeType: "SUBJECT",
      title: "Unauthorized Subject",
      normalizedTitle: "unauthorized subject",
      position: 0,
      status: "ACTIVE",
    });
    expect(insertNode.ok).toBe(false);

    // The global source itself is untouched by the rejected mutation.
    const stillGlobal = await admin
      .from("curriculum_sources")
      .select("title, owner_user_id")
      .eq("id", globalSourceId)
      .single();
    expect(stillGlobal.data?.title).not.toBe("Hijacked title");
    expect(stillGlobal.data?.owner_user_id).toBeNull();
  }, 30_000);
});

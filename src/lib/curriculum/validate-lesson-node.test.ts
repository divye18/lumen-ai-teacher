import { describe, expect, it } from "vitest";

import type {
  CurriculumNodeRow,
  CurriculumSourceRow,
  CurriculumStore,
} from "@/lib/db/repositories";
import { err, ok, type Result } from "@/lib/result";
import { LumenError } from "@/lib/errors";

import { resolveLessonCurriculumNode } from "./validate-lesson-node";

/** Minimal fake `CurriculumStore` — only `getNode`/`getSource` are used by
 * `resolveLessonCurriculumNode`; everything else throws if reached. Mirrors
 * an RLS-scoped client: a node under `HIDDEN_ID` is treated as invisible
 * (NOT_FOUND), exactly like a real request-scoped client would behave for a
 * node under another user's private source. */
const HIDDEN_ID = "hidden-node";

function fakeStore(
  nodes: Record<string, CurriculumNodeRow>,
  sources: Record<string, CurriculumSourceRow>,
): CurriculumStore {
  const notImplemented = () => {
    throw new Error("not implemented in fake store");
  };
  return {
    createSource: notImplemented,
    getSource: async (id: string) => {
      const row = sources[id];
      if (!row) {
        return err(
          new LumenError("NOT_FOUND", "not found", { recoverable: true }),
        );
      }
      return ok(row);
    },
    listSourcesForUser: notImplemented,
    updateSource: notImplemented,
    findSourceByNaturalKey: notImplemented,
    createNode: notImplemented,
    createNodes: notImplemented,
    getNode: async (id: string): Promise<Result<CurriculumNodeRow>> => {
      const row = nodes[id];
      if (!row || id === HIDDEN_ID) {
        return err(
          new LumenError("NOT_FOUND", "not found", { recoverable: true }),
        );
      }
      return ok(row);
    },
    listNodesForSource: notImplemented,
    listChildren: notImplemented,
    updateNode: notImplemented,
    findByNaturalKey: notImplemented,
  };
}

function source(
  overrides: Partial<CurriculumSourceRow> = {},
): CurriculumSourceRow {
  return {
    id: "source-1",
    owner_user_id: null,
    kind: "NCERT",
    title: "Test source",
    status: "READY",
    version: "v1",
    metadata: {},
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function node(overrides: Partial<CurriculumNodeRow> = {}): CurriculumNodeRow {
  return {
    id: "topic-1",
    curriculum_source_id: "source-1",
    parent_id: null,
    node_type: "TOPIC",
    title: "Introduction",
    normalized_title: "introduction",
    position: 0,
    page_start: null,
    page_end: null,
    metadata: {},
    status: "ACTIVE",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("resolveLessonCurriculumNode", () => {
  it("G. accepts a valid, active, global TOPIC node", async () => {
    const store = fakeStore({ "topic-1": node() }, { "source-1": source() });
    const result = await resolveLessonCurriculumNode(store, "topic-1");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe("topic-1");
  });

  it("A. rejects a nonexistent node id", async () => {
    const store = fakeStore({}, {});
    const result = await resolveLessonCurriculumNode(store, "does-not-exist");
    expect(result.ok).toBe(false);
  });

  it("B. rejects a CLASS node", async () => {
    const store = fakeStore(
      { "class-1": node({ id: "class-1", node_type: "CLASS" }) },
      { "source-1": source() },
    );
    const result = await resolveLessonCurriculumNode(store, "class-1");
    expect(result.ok).toBe(false);
  });

  it("C. rejects a SUBJECT node", async () => {
    const store = fakeStore(
      { "subject-1": node({ id: "subject-1", node_type: "SUBJECT" }) },
      { "source-1": source() },
    );
    const result = await resolveLessonCurriculumNode(store, "subject-1");
    expect(result.ok).toBe(false);
  });

  it("D. rejects a CHAPTER node", async () => {
    const store = fakeStore(
      { "chapter-1": node({ id: "chapter-1", node_type: "CHAPTER" }) },
      { "source-1": source() },
    );
    const result = await resolveLessonCurriculumNode(store, "chapter-1");
    expect(result.ok).toBe(false);
  });

  it("E. rejects an archived TOPIC", async () => {
    const store = fakeStore(
      { "topic-archived": node({ id: "topic-archived", status: "ARCHIVED" }) },
      { "source-1": source() },
    );
    const result = await resolveLessonCurriculumNode(store, "topic-archived");
    expect(result.ok).toBe(false);
  });

  it("F. rejects a TOPIC belonging to a private (non-global) source", async () => {
    const store = fakeStore(
      {
        "private-topic": node({
          id: "private-topic",
          curriculum_source_id: "private-source",
        }),
      },
      {
        "private-source": source({
          id: "private-source",
          owner_user_id: "some-other-user",
        }),
      },
    );
    const result = await resolveLessonCurriculumNode(store, "private-topic");
    expect(result.ok).toBe(false);
  });

  it("rejects a TOPIC belonging to a global-but-USER_UPLOAD-kind source (defense in depth)", async () => {
    const store = fakeStore(
      {
        "upload-topic": node({
          id: "upload-topic",
          curriculum_source_id: "upload-source",
        }),
      },
      {
        "upload-source": source({
          id: "upload-source",
          owner_user_id: null,
          kind: "USER_UPLOAD",
        }),
      },
    );
    const result = await resolveLessonCurriculumNode(store, "upload-topic");
    expect(result.ok).toBe(false);
  });

  it("rejects a node invisible to this caller (RLS-hidden), never falling back to unrelated data", async () => {
    const store = fakeStore(
      { [HIDDEN_ID]: node({ id: HIDDEN_ID }) },
      { "source-1": source() },
    );
    const result = await resolveLessonCurriculumNode(store, HIDDEN_ID);
    expect(result.ok).toBe(false);
  });
});

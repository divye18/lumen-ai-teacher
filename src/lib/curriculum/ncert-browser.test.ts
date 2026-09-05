import { describe, expect, it } from "vitest";

import type {
  CurriculumNodeRow,
  CurriculumSourceRow,
  CurriculumStore,
} from "@/lib/db/repositories";
import { ok, type Result } from "@/lib/result";

import {
  getNcertChapterLevel,
  getNcertClassLevel,
  getNcertSubjectLevel,
  getNcertTopicLevel,
  nodeSlug,
  resolveNcertSource,
} from "./ncert-browser";

/**
 * A minimal in-memory fake of `CurriculumStore`, implementing only the two
 * methods `ncert-browser.ts` actually calls (`listSourcesForUser`,
 * `listChildren`). Everything else throws if reached — these tests exercise
 * pure slug-resolution/filtering logic without a live database.
 */
function fakeStore(
  sources: CurriculumSourceRow[],
  nodes: CurriculumNodeRow[],
): CurriculumStore {
  const notImplemented = () => {
    throw new Error("not implemented in fake store");
  };
  return {
    createSource: notImplemented,
    getSource: notImplemented,
    async listSourcesForUser(): Promise<Result<CurriculumSourceRow[]>> {
      return ok(sources);
    },
    updateSource: notImplemented,
    findSourceByNaturalKey: notImplemented,
    createNode: notImplemented,
    createNodes: notImplemented,
    getNode: notImplemented,
    listNodesForSource: notImplemented,
    async listChildren(
      sourceId: string,
      parentId: string | null,
    ): Promise<Result<CurriculumNodeRow[]>> {
      const children = nodes
        .filter(
          (n) =>
            n.curriculum_source_id === sourceId && n.parent_id === parentId,
        )
        .sort((a, b) => a.position - b.position);
      return ok(children);
    },
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
    title: "NCERT Class 11 Physics (2026-27)",
    status: "READY",
    version: "2026-27.v1",
    metadata: {},
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function node(overrides: Partial<CurriculumNodeRow>): CurriculumNodeRow {
  return {
    id: "node",
    curriculum_source_id: "source-1",
    parent_id: null,
    node_type: "CLASS",
    title: "Untitled",
    normalized_title: "untitled",
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

describe("nodeSlug", () => {
  it("folds spaces to hyphens deterministically", () => {
    expect(nodeSlug({ normalized_title: "units and measurement" })).toBe(
      "units-and-measurement",
    );
  });

  it("is stable across repeated calls with the same input", () => {
    const n = { normalized_title: "the international system of units" };
    expect(nodeSlug(n)).toBe(nodeSlug(n));
  });

  it("strips characters that aren't alphanumeric, space, or hyphen", () => {
    expect(nodeSlug({ normalized_title: "topic: a, b & c" })).toBe(
      "topic-a-b-c",
    );
  });
});

describe("resolveNcertSource", () => {
  it("finds the NCERT source among a user's visible sources", async () => {
    const store = fakeStore(
      [
        source({ id: "other", kind: "USER_UPLOAD" }),
        source({ id: "ncert-1", kind: "NCERT" }),
      ],
      [],
    );
    const result = await resolveNcertSource(store, "user-1");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.id).toBe("ncert-1");
  });

  it("returns a NOT_FOUND error when no NCERT source exists", async () => {
    const store = fakeStore([source({ kind: "USER_UPLOAD" })], []);
    const result = await resolveNcertSource(store, "user-1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
  });

  it("ignores an archived NCERT source", async () => {
    const store = fakeStore(
      [source({ id: "archived", status: "ARCHIVED" })],
      [],
    );
    const result = await resolveNcertSource(store, "user-1");
    expect(result.ok).toBe(false);
  });
});

const src = source();
const classNode = node({
  id: "class-11",
  node_type: "CLASS",
  title: "Class 11",
  normalized_title: "class 11",
  parent_id: null,
  position: 0,
});
const subjectNode = node({
  id: "physics",
  node_type: "SUBJECT",
  title: "Physics",
  normalized_title: "physics",
  parent_id: "class-11",
  position: 0,
});
const chapterNode = node({
  id: "chapter-1",
  node_type: "CHAPTER",
  title: "Units and Measurement",
  normalized_title: "units and measurement",
  parent_id: "physics",
  position: 0,
});
const topicNodes = [
  node({
    id: "topic-1",
    node_type: "TOPIC",
    title: "Introduction",
    normalized_title: "introduction",
    parent_id: "chapter-1",
    position: 0,
  }),
  node({
    id: "topic-2",
    node_type: "TOPIC",
    title: "The International System of Units",
    normalized_title: "the international system of units",
    parent_id: "chapter-1",
    position: 1,
  }),
];
const archivedTopic = node({
  id: "topic-archived",
  node_type: "TOPIC",
  title: "Removed Topic",
  normalized_title: "removed topic",
  parent_id: "chapter-1",
  position: 2,
  status: "ARCHIVED",
});

function fullStore(): CurriculumStore {
  return fakeStore(
    [src],
    [classNode, subjectNode, chapterNode, ...topicNodes, archivedTopic],
  );
}

describe("getNcertClassLevel", () => {
  it("returns only CLASS nodes under the resolved source", async () => {
    const result = await getNcertClassLevel(fullStore(), "user-1");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.classes.map((c) => c.id)).toEqual(["class-11"]);
      expect(result.value.source.id).toBe(src.id);
    }
  });
});

describe("getNcertSubjectLevel", () => {
  it("returns SUBJECT nodes for a valid class slug", async () => {
    const result = await getNcertSubjectLevel(
      fullStore(),
      "user-1",
      "class-11",
    );
    expect(result.ok).toBe(true);
    if (result.ok && result.value) {
      expect(result.value.classNode.id).toBe("class-11");
      expect(result.value.subjects.map((s) => s.id)).toEqual(["physics"]);
    }
  });

  it("returns ok(null) for an unknown class slug (caller renders 404)", async () => {
    const result = await getNcertSubjectLevel(
      fullStore(),
      "user-1",
      "class-99",
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeNull();
  });
});

describe("getNcertChapterLevel", () => {
  it("returns CHAPTER nodes for valid class + subject slugs", async () => {
    const result = await getNcertChapterLevel(
      fullStore(),
      "user-1",
      "class-11",
      "physics",
    );
    expect(result.ok).toBe(true);
    if (result.ok && result.value) {
      expect(result.value.subjectNode.id).toBe("physics");
      expect(result.value.chapters.map((c) => c.id)).toEqual(["chapter-1"]);
    }
  });

  it("returns ok(null) for a valid class but unknown subject slug", async () => {
    const result = await getNcertChapterLevel(
      fullStore(),
      "user-1",
      "class-11",
      "chemistry",
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeNull();
  });
});

describe("getNcertTopicLevel", () => {
  it("returns active TOPIC nodes in position order for valid slugs all the way down", async () => {
    const result = await getNcertTopicLevel(
      fullStore(),
      "user-1",
      "class-11",
      "physics",
      "units-and-measurement",
    );
    expect(result.ok).toBe(true);
    if (result.ok && result.value) {
      expect(result.value.chapterNode.id).toBe("chapter-1");
      expect(result.value.topics.map((t) => t.title)).toEqual([
        "Introduction",
        "The International System of Units",
      ]);
    }
  });

  it("excludes archived topics", async () => {
    const result = await getNcertTopicLevel(
      fullStore(),
      "user-1",
      "class-11",
      "physics",
      "units-and-measurement",
    );
    expect(result.ok).toBe(true);
    if (result.ok && result.value) {
      expect(result.value.topics.some((t) => t.id === "topic-archived")).toBe(
        false,
      );
    }
  });

  it("returns ok(null) for an unknown chapter slug", async () => {
    const result = await getNcertTopicLevel(
      fullStore(),
      "user-1",
      "class-11",
      "physics",
      "not-a-real-chapter",
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeNull();
  });

  it("is deterministic — repeated calls with the same slugs return the same result", async () => {
    const store = fullStore();
    const r1 = await getNcertTopicLevel(
      store,
      "user-1",
      "class-11",
      "physics",
      "units-and-measurement",
    );
    const r2 = await getNcertTopicLevel(
      store,
      "user-1",
      "class-11",
      "physics",
      "units-and-measurement",
    );
    expect(r1).toEqual(r2);
  });
});

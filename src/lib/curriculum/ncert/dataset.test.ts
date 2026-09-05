import { describe, expect, it } from "vitest";

import { ValidationError } from "@/lib/errors";

import { buildNcertImportPlan, parseNcertDataset } from "./dataset";
import type { NcertDatasetInput } from "./contracts";

function minimalDataset(): NcertDatasetInput {
  return {
    datasetVersion: "2024-25.v1",
    source: {
      kind: "NCERT",
      class: "11",
      subject: "Physics",
      textbookVersion: "2024-25",
    },
    chapters: [
      {
        title: "Units and Measurements",
        position: 0,
        topics: [
          { title: "Units of Measurement", position: 0, subtopics: [] },
          {
            title: "Significant Figures",
            position: 1,
            subtopics: [{ title: "Rules for Arithmetic", position: 0 }],
          },
        ],
      },
    ],
  };
}

describe("buildNcertImportPlan", () => {
  it("valid minimal dataset parses", () => {
    const plan = buildNcertImportPlan(minimalDataset());
    expect(plan.datasetVersion).toBe("2024-25.v1");
    expect(plan.source).toEqual(minimalDataset().source);
    expect(plan.nodes.length).toBeGreaterThan(0);
  });

  it("produces CLASS -> SUBJECT -> CHAPTER -> TOPIC -> SUBTOPIC", () => {
    const plan = buildNcertImportPlan(minimalDataset());
    expect(plan.nodes.map((n) => n.nodeType)).toEqual([
      "CLASS",
      "SUBJECT",
      "CHAPTER",
      "TOPIC",
      "TOPIC",
      "SUBTOPIC",
    ]);
  });

  it("class and subject become explicit nodes with documented titles", () => {
    const plan = buildNcertImportPlan(minimalDataset());
    const classNode = plan.nodes.find((n) => n.nodeType === "CLASS");
    const subjectNode = plan.nodes.find((n) => n.nodeType === "SUBJECT");
    expect(classNode?.title).toBe("Class 11");
    expect(classNode?.parentNaturalKey).toBeNull();
    expect(subjectNode?.title).toBe("Physics");
    expect(subjectNode?.parentNaturalKey).toBe(classNode?.naturalKey);
  });

  it("normalized titles are deterministic and fold case/whitespace", () => {
    const plan = buildNcertImportPlan(minimalDataset());
    const chapter = plan.nodes.find((n) => n.nodeType === "CHAPTER");
    expect(chapter?.normalizedTitle).toBe("units and measurements");

    const dataset2 = minimalDataset();
    dataset2.chapters[0].title = "  UNITS   and Measurements  ";
    const plan2 = buildNcertImportPlan(dataset2);
    const chapter2 = plan2.nodes.find((n) => n.nodeType === "CHAPTER");
    expect(chapter2?.normalizedTitle).toBe(chapter?.normalizedTitle);
  });

  it("positions are preserved verbatim from the dataset", () => {
    const plan = buildNcertImportPlan(minimalDataset());
    const topics = plan.nodes.filter((n) => n.nodeType === "TOPIC");
    expect(topics.map((t) => t.position)).toEqual([0, 1]);
    const subtopic = plan.nodes.find((n) => n.nodeType === "SUBTOPIC");
    expect(subtopic?.position).toBe(0);
  });

  it("parent references are correct at every level", () => {
    const plan = buildNcertImportPlan(minimalDataset());
    const classNode = plan.nodes.find((n) => n.nodeType === "CLASS")!;
    const subjectNode = plan.nodes.find((n) => n.nodeType === "SUBJECT")!;
    const chapter = plan.nodes.find((n) => n.nodeType === "CHAPTER")!;
    const topics = plan.nodes.filter((n) => n.nodeType === "TOPIC");
    const subtopic = plan.nodes.find((n) => n.nodeType === "SUBTOPIC")!;

    expect(subjectNode.parentNaturalKey).toBe(classNode.naturalKey);
    expect(chapter.parentNaturalKey).toBe(subjectNode.naturalKey);
    expect(topics.every((t) => t.parentNaturalKey === chapter.naturalKey)).toBe(
      true,
    );
    expect(subtopic.parentNaturalKey).toBe(
      topics.find((t) => t.title === "Significant Figures")!.naturalKey,
    );
  });

  it("same input produces an identical plan (deterministic)", () => {
    const plan1 = buildNcertImportPlan(minimalDataset());
    const plan2 = buildNcertImportPlan(minimalDataset());
    expect(plan2).toEqual(plan1);
  });

  it("no random ids are generated — natural keys are pure functions of title/type/parent", () => {
    const plan1 = buildNcertImportPlan(minimalDataset());
    const plan2 = buildNcertImportPlan(minimalDataset());
    for (let i = 0; i < plan1.nodes.length; i++) {
      expect(plan2.nodes[i].naturalKey).toBe(plan1.nodes[i].naturalKey);
    }
    // Natural keys never look like UUIDs.
    const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-/i;
    for (const node of plan1.nodes) {
      expect(uuidLike.test(node.naturalKey)).toBe(false);
    }
  });

  it("input array order is preserved even when siblings are listed out of position order", () => {
    const dataset = minimalDataset();
    dataset.chapters[0].topics = [
      { title: "Second listed, position 0", position: 0, subtopics: [] },
      { title: "First listed, position 1", position: 1, subtopics: [] },
    ];
    const plan = buildNcertImportPlan(dataset);
    const topics = plan.nodes.filter((n) => n.nodeType === "TOPIC");
    // Array order is preserved verbatim (no re-sorting by position here) —
    // resolving stored order is the persistence layer's job in 17.3.c.
    expect(topics.map((t) => t.title)).toEqual([
      "Second listed, position 0",
      "First listed, position 1",
    ]);
    expect(topics.map((t) => t.position)).toEqual([0, 1]);
  });
});

describe("parseNcertDataset", () => {
  it("accepts a valid dataset", () => {
    const result = parseNcertDataset(minimalDataset());
    expect(result.ok).toBe(true);
  });

  it("rejects missing datasetVersion", () => {
    const dataset = minimalDataset() as unknown as Record<string, unknown>;
    delete dataset.datasetVersion;
    const result = parseNcertDataset(dataset);
    expect(result.ok).toBe(false);
  });

  it("rejects blank datasetVersion", () => {
    const dataset = minimalDataset();
    dataset.datasetVersion = "   ";
    const result = parseNcertDataset(dataset);
    expect(result.ok).toBe(false);
  });

  it("rejects an invalid source.kind", () => {
    const dataset = minimalDataset();
    (dataset.source as unknown as { kind: string }).kind = "CBSE";
    const result = parseNcertDataset(dataset);
    expect(result.ok).toBe(false);
  });

  it("rejects missing class", () => {
    const dataset = minimalDataset();
    (dataset.source as Record<string, unknown>).class = "";
    const result = parseNcertDataset(dataset);
    expect(result.ok).toBe(false);
  });

  it("rejects missing subject", () => {
    const dataset = minimalDataset();
    (dataset.source as Record<string, unknown>).subject = "";
    const result = parseNcertDataset(dataset);
    expect(result.ok).toBe(false);
  });

  it("rejects missing textbookVersion", () => {
    const dataset = minimalDataset() as unknown as {
      source: Record<string, unknown>;
    };
    delete dataset.source.textbookVersion;
    const result = parseNcertDataset(dataset);
    expect(result.ok).toBe(false);
  });

  it("rejects an empty chapter title", () => {
    const dataset = minimalDataset();
    dataset.chapters[0].title = "";
    const result = parseNcertDataset(dataset);
    expect(result.ok).toBe(false);
  });

  it("rejects an empty topic title", () => {
    const dataset = minimalDataset();
    dataset.chapters[0].topics[0].title = "";
    const result = parseNcertDataset(dataset);
    expect(result.ok).toBe(false);
  });

  it("rejects an empty subtopic title", () => {
    const dataset = minimalDataset();
    dataset.chapters[0].topics[1].subtopics![0].title = "";
    const result = parseNcertDataset(dataset);
    expect(result.ok).toBe(false);
  });

  it("rejects a negative position", () => {
    const dataset = minimalDataset();
    dataset.chapters[0].position = -1;
    const result = parseNcertDataset(dataset);
    expect(result.ok).toBe(false);
  });

  it("rejects a non-integer position", () => {
    const dataset = minimalDataset() as unknown as {
      chapters: Array<Record<string, unknown>>;
    };
    dataset.chapters[0].position = 1.5;
    const result = parseNcertDataset(dataset);
    expect(result.ok).toBe(false);
  });

  it("rejects malformed nesting (topics not an array)", () => {
    const dataset = minimalDataset() as unknown as {
      chapters: Array<Record<string, unknown>>;
    };
    dataset.chapters[0].topics = { title: "not an array" };
    const result = parseNcertDataset(dataset);
    expect(result.ok).toBe(false);
  });

  it("rejects chapters that is not an array", () => {
    const dataset = minimalDataset() as unknown as Record<string, unknown>;
    dataset.chapters = { title: "not an array" };
    const result = parseNcertDataset(dataset);
    expect(result.ok).toBe(false);
  });

  it("rejects invalid data types (position as string)", () => {
    const dataset = minimalDataset() as unknown as {
      chapters: Array<Record<string, unknown>>;
    };
    dataset.chapters[0].position = "0";
    const result = parseNcertDataset(dataset);
    expect(result.ok).toBe(false);
  });

  it("rejects a completely empty object", () => {
    const result = parseNcertDataset({});
    expect(result.ok).toBe(false);
  });

  it("rejects non-object input", () => {
    const result = parseNcertDataset("not a dataset");
    expect(result.ok).toBe(false);
  });

  it("preserves validation issues on failure, matching the project's ValidationError convention", () => {
    const result = parseNcertDataset({});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_FAILED");
      expect(result.error).toBeInstanceOf(ValidationError);
      expect((result.error as ValidationError).issues).toBeDefined();
    }
  });
});

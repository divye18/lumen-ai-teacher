import { describe, expect, it } from "vitest";

import { generateStructuredFromTemplate } from "./template";
import { structuredQuestionSchema } from "./contracts";

describe("generateStructuredFromTemplate", () => {
  it("builds a valid prerequisite MCQ grounded in real graph edges", () => {
    const q = generateStructuredFromTemplate({
      title: "Page Faults",
      kind: "CONCEPTUAL",
      difficulty: 3,
      prerequisiteTitles: ["Virtual Memory"],
      dependentTitles: [],
      otherConceptTitles: ["Thrashing", "TLB", "Segmentation"],
    });
    expect(q).not.toBeNull();
    expect(q!.format).toBe("MCQ");
    expect(structuredQuestionSchema.safeParse(q).success).toBe(true);
    if (q!.format === "MCQ") {
      const correct = q!.data.options.find((o) => o.id === q!.data.correctId);
      expect(correct?.text).toBe("Virtual Memory");
    }
  });

  it("builds a dependent MCQ when there are no prerequisites", () => {
    const q = generateStructuredFromTemplate({
      title: "Virtual Memory",
      kind: "APPLICATION",
      difficulty: 3,
      prerequisiteTitles: [],
      dependentTitles: ["Page Faults"],
      otherConceptTitles: ["Registers", "Bus", "ALU"],
    });
    expect(q?.format).toBe("MCQ");
    if (q?.format === "MCQ") {
      expect(q.data.options.find((o) => o.id === q.data.correctId)?.text).toBe(
        "Page Faults",
      );
    }
  });

  it("returns null when there isn't enough grounded structure (no fabrication)", () => {
    expect(
      generateStructuredFromTemplate({
        title: "Some Concept",
        kind: "CONCEPTUAL",
        difficulty: 3,
        prerequisiteTitles: [],
        dependentTitles: [],
        otherConceptTitles: [],
      }),
    ).toBeNull();

    expect(
      generateStructuredFromTemplate({
        title: "Some Concept",
        kind: "CONCEPTUAL",
        difficulty: 3,
        prerequisiteTitles: ["A"],
        dependentTitles: [],
        otherConceptTitles: ["B"], // only one distractor — not enough
      }),
    ).toBeNull();
  });

  it("only uses concept titles it was given — never invents a fact", () => {
    const q = generateStructuredFromTemplate({
      title: "X",
      kind: "CONCEPTUAL",
      difficulty: 3,
      prerequisiteTitles: ["Real Prereq"],
      dependentTitles: [],
      otherConceptTitles: ["Distractor One", "Distractor Two"],
    });
    if (q?.format === "MCQ") {
      const known = new Set([
        "Real Prereq",
        "Distractor One",
        "Distractor Two",
      ]);
      for (const o of q.data.options) expect(known.has(o.text)).toBe(true);
    }
  });

  it("is deterministic", () => {
    const input = {
      title: "Page Faults",
      kind: "CONCEPTUAL" as const,
      difficulty: 3,
      prerequisiteTitles: ["Virtual Memory"],
      dependentTitles: [],
      otherConceptTitles: ["Thrashing", "TLB", "Segmentation"],
    };
    expect(JSON.stringify(generateStructuredFromTemplate(input))).toBe(
      JSON.stringify(generateStructuredFromTemplate(input)),
    );
  });
});

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { parseNcertDataset } from "./dataset";

/**
 * MILESTONE 17.3.b — validates the actual production pilot dataset
 * (`data/curriculum/ncert/class-11/physics.json`) against the 17.3.a parser.
 * Reads the real file from disk (this test file only — the pure parser
 * itself remains filesystem-free) so a change to the production dataset that
 * breaks the contract, the hierarchy, or determinism fails CI immediately.
 *
 * Represents the CURRENT (rationalized) NCERT Class 11 Physics Chapter 1 —
 * "Units and Measurement" — per `keph101`, not the legacy `keph102` Chapter 2
 * structure. Measurement of Length/Mass/Time and the Errors-in-Measurement
 * section were dropped from the textbook in this edition and are
 * deliberately absent here.
 */

function loadDataset(): unknown {
  const filePath = path.join(
    process.cwd(),
    "data/curriculum/ncert/class-11/physics.json",
  );
  return JSON.parse(readFileSync(filePath, "utf-8"));
}

describe("NCERT Class 11 Physics — Chapter 1: Units and Measurement (pilot dataset)", () => {
  it("parses successfully against the 17.3.a contract", () => {
    const result = parseNcertDataset(loadDataset());
    expect(result.ok).toBe(true);
  });

  it("has the expected dataset version and source", () => {
    const dataset = loadDataset() as {
      datasetVersion: string;
      source: { class: string; subject: string };
    };
    expect(dataset.datasetVersion).toBe("2026-27.v1");
    expect(dataset.source.class).toBe("11");
    expect(dataset.source.subject).toBe("Physics");
  });

  it("produces the expected CLASS -> SUBJECT -> CHAPTER hierarchy", () => {
    const result = parseNcertDataset(loadDataset());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const classNode = result.value.nodes.find((n) => n.nodeType === "CLASS");
    const subjectNode = result.value.nodes.find(
      (n) => n.nodeType === "SUBJECT",
    );
    const chapterNode = result.value.nodes.find(
      (n) => n.nodeType === "CHAPTER",
    );

    expect(classNode?.title).toBe("Class 11");
    expect(subjectNode?.title).toBe("Physics");
    expect(subjectNode?.parentNaturalKey).toBe(classNode?.naturalKey);
    expect(chapterNode?.title).toBe("Units and Measurement");
    expect(chapterNode?.position).toBe(0);
    expect(chapterNode?.parentNaturalKey).toBe(subjectNode?.naturalKey);
  });

  it("produces exactly 6 top-level topics, in the current textbook's order", () => {
    const result = parseNcertDataset(loadDataset());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const topics = result.value.nodes.filter((n) => n.nodeType === "TOPIC");

    expect(topics).toHaveLength(6);
    expect(topics.map((t) => t.title)).toEqual([
      "Introduction",
      "The International System of Units",
      "Significant Figures",
      "Dimensions of Physical Quantities",
      "Dimensional Formulae and Dimensional Equations",
      "Dimensional Analysis and its Applications",
    ]);
    expect(topics.map((t) => t.position)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(topics.every((t) => t.parentNaturalKey !== null)).toBe(true);
  });

  it("produces no subtopics — the current chapter has no verified sub-sections", () => {
    const result = parseNcertDataset(loadDataset());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const subtopics = result.value.nodes.filter(
      (n) => n.nodeType === "SUBTOPIC",
    );
    expect(subtopics).toHaveLength(0);
  });

  it("does not contain the legacy (keph102) sections dropped from the current edition", () => {
    const result = parseNcertDataset(loadDataset());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const titles = result.value.nodes.map((n) => n.title.toLowerCase());
    const legacyTitles = [
      "measurement of length",
      "measurement of mass",
      "measurement of time",
      "accuracy, precision of instruments and errors in measurement",
      "systematic errors",
      "random errors",
      "least count error",
    ];
    for (const legacy of legacyTitles) {
      expect(titles).not.toContain(legacy);
    }
  });

  it("contains no id fields and no concept fields anywhere in the raw dataset", () => {
    const raw = JSON.stringify(loadDataset());
    expect(raw).not.toMatch(/"id"\s*:/i);
    expect(raw.toLowerCase()).not.toContain("concept");
  });

  it("repeated parsing of the production file produces an identical plan", () => {
    const result1 = parseNcertDataset(loadDataset());
    const result2 = parseNcertDataset(loadDataset());
    expect(result1.ok && result2.ok).toBe(true);
    if (result1.ok && result2.ok) {
      expect(result2.value).toEqual(result1.value);
    }
  });
});

import { describe, expect, it } from "vitest";

import { buildMasterySummary } from "./mastery-summary";

describe("buildMasterySummary", () => {
  // 1. Strong concepts.
  it("groups a high-mastery concept as strong", () => {
    const summary = buildMasterySummary([
      { key: "a", title: "A", masteryPoints: 90 },
    ]);
    expect(summary.strong.map((c) => c.key)).toEqual(["a"]);
    expect(summary.developing).toEqual([]);
    expect(summary.needsWork).toEqual([]);
  });

  it("groups a proficient (71-85) concept as strong", () => {
    const summary = buildMasterySummary([
      { key: "a", title: "A", masteryPoints: 75 },
    ]);
    expect(summary.strong.map((c) => c.key)).toEqual(["a"]);
  });

  // 2. Developing concepts.
  it("groups a developing (51-70) concept as developing", () => {
    const summary = buildMasterySummary([
      { key: "a", title: "A", masteryPoints: 60 },
    ]);
    expect(summary.developing.map((c) => c.key)).toEqual(["a"]);
  });

  it("groups an emerging (31-50) concept as developing", () => {
    const summary = buildMasterySummary([
      { key: "a", title: "A", masteryPoints: 40 },
    ]);
    expect(summary.developing.map((c) => c.key)).toEqual(["a"]);
  });

  // 3. Weak concepts.
  it("groups a not-understood (0-30) concept as needing work", () => {
    const summary = buildMasterySummary([
      { key: "a", title: "A", masteryPoints: 10 },
    ]);
    expect(summary.needsWork.map((c) => c.key)).toEqual(["a"]);
  });

  it("sorts multiple concepts into their correct buckets", () => {
    const summary = buildMasterySummary([
      { key: "strong1", title: "S", masteryPoints: 95 },
      { key: "dev1", title: "D", masteryPoints: 55 },
      { key: "weak1", title: "W", masteryPoints: 5 },
    ]);
    expect(summary.strong.map((c) => c.key)).toEqual(["strong1"]);
    expect(summary.developing.map((c) => c.key)).toEqual(["dev1"]);
    expect(summary.needsWork.map((c) => c.key)).toEqual(["weak1"]);
  });

  // 11. Empty session.
  it("handles an empty concept list safely", () => {
    const summary = buildMasterySummary([]);
    expect(summary).toEqual({ strong: [], developing: [], needsWork: [] });
  });

  it("is deterministic for the same input", () => {
    const input = [
      { key: "a", title: "A", masteryPoints: 60 },
      { key: "b", title: "B", masteryPoints: 20 },
    ];
    expect(buildMasterySummary(input)).toEqual(buildMasterySummary(input));
  });

  it("carries the readable band label alongside the raw points", () => {
    const summary = buildMasterySummary([
      { key: "a", title: "A", masteryPoints: 90 },
    ]);
    expect(summary.strong[0].band).toBe("Strong");
    expect(summary.strong[0].masteryPoints).toBe(90);
  });
});

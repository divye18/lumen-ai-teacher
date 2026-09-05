import { describe, expect, it } from "vitest";

import { tallyMisconceptionActivity } from "./misconception-tally";

describe("tallyMisconceptionActivity", () => {
  // Case A — new misconception only.
  it("Case A: one new misconception -> 1", () => {
    const tally = tallyMisconceptionActivity({
      candidateMentions: [{ category: "confuses-cache-storage" }],
      sessionCreatedCount: 1,
    });
    expect(tally.count).toBe(1);
    expect(tally.usedFallbackFloor).toBe(false);
  });

  // Case B — existing misconception strengthened once, no new create.
  it("Case B: one strengthen, teaching_answers intact -> 1", () => {
    const tally = tallyMisconceptionActivity({
      candidateMentions: [{ category: "confuses-cache-storage" }],
      sessionCreatedCount: 0,
    });
    expect(tally.count).toBe(1);
    expect(tally.usedFallbackFloor).toBe(false);
  });

  // Case C — new + strengthened in the same session (two distinct activities).
  it("Case C: one new + one strengthen -> 2", () => {
    const tally = tallyMisconceptionActivity({
      candidateMentions: [
        { category: "confuses-cache-storage" },
        { category: "thinks-bigger-is-faster" },
      ],
      sessionCreatedCount: 1,
    });
    expect(tally.count).toBe(2);
    expect(tally.usedFallbackFloor).toBe(false);
  });

  // Case D — the same activity visible through more than one path must
  // count once: taking the candidate-mention count directly (never summed
  // with the created count) guarantees this by construction.
  it("Case D: does not double-count a create that also appears as a candidate mention", () => {
    const tally = tallyMisconceptionActivity({
      // The one real candidate mention IS the create — counted once, not
      // (candidateMentions.length + sessionCreatedCount).
      candidateMentions: [{ category: "confuses-cache-storage" }],
      sessionCreatedCount: 1,
    });
    expect(tally.count).toBe(1);
  });

  // Case E — historical misconception, no activity this session.
  it("Case E: no candidates, no creates this session -> 0", () => {
    const tally = tallyMisconceptionActivity({
      candidateMentions: [],
      sessionCreatedCount: 0,
    });
    expect(tally.count).toBe(0);
    expect(tally.usedFallbackFloor).toBe(false);
  });

  // Case F — same misconception strengthened twice in two distinct
  // interactions -> 2, not collapsed to 1 merely because it's one entity.
  it("Case F: two strengthens of the SAME misconception, teaching_answers intact -> 2", () => {
    const tally = tallyMisconceptionActivity({
      candidateMentions: [
        { category: "confuses-cache-storage" },
        { category: "confuses-cache-storage" },
      ],
      sessionCreatedCount: 0,
    });
    expect(tally.count).toBe(2);
    expect(tally.usedFallbackFloor).toBe(false);
  });

  // Case G — a relapse (RESOLVED -> ACTIVE via strengthen()) is itself a
  // strengthen event; it contributes one candidate mention like any other.
  it("Case G: a relapse strengthen is counted once, like any other strengthen", () => {
    const tally = tallyMisconceptionActivity({
      candidateMentions: [{ category: "confuses-cache-storage" }],
      sessionCreatedCount: 0,
    });
    expect(tally.count).toBe(1);
  });

  // Case H — no misconception activity at all.
  it("Case H: empty input -> 0", () => {
    const tally = tallyMisconceptionActivity({
      candidateMentions: [],
      sessionCreatedCount: 0,
    });
    expect(tally).toEqual({ count: 0, usedFallbackFloor: false });
  });

  // Case I — missing/legacy linkage: teaching_answers rows are missing
  // (candidateMentions undercounts) but we have DIRECT PROOF of creates via
  // session_id. The floor is used rather than silently reporting fewer
  // misconceptions than we can prove happened. Strengthen-only activity in
  // that same gap cannot be recovered — documented, not fabricated.
  it("Case I: teaching_answers missing entirely, but 2 creates are proven via session_id -> floor of 2", () => {
    const tally = tallyMisconceptionActivity({
      candidateMentions: [], // teaching_answers rows silently dropped
      sessionCreatedCount: 2, // misconceptions.session_id proves 2 real creates
    });
    expect(tally.count).toBe(2);
    expect(tally.usedFallbackFloor).toBe(true);
  });

  it("Case I variant: partial teaching_answers loss still floors at the proven creation count", () => {
    const tally = tallyMisconceptionActivity({
      candidateMentions: [{ category: "confuses-cache-storage" }], // only 1 of 2 turns persisted
      sessionCreatedCount: 2,
    });
    expect(tally.count).toBe(2);
    expect(tally.usedFallbackFloor).toBe(true);
  });

  it("never fabricates activity beyond what is proven when both sources are empty", () => {
    const tally = tallyMisconceptionActivity({
      candidateMentions: [],
      sessionCreatedCount: 0,
    });
    expect(tally.count).toBe(0);
  });

  it("ignores a negative sessionCreatedCount rather than producing a negative tally", () => {
    const tally = tallyMisconceptionActivity({
      candidateMentions: [],
      sessionCreatedCount: -3,
    });
    expect(tally.count).toBe(0);
  });

  it("is deterministic and order-independent for the same input", () => {
    const input = {
      candidateMentions: [{ category: "a" }, { category: "b" }],
      sessionCreatedCount: 1,
    };
    const a = tallyMisconceptionActivity(input);
    const b = tallyMisconceptionActivity({
      candidateMentions: [...input.candidateMentions].reverse(),
      sessionCreatedCount: input.sessionCreatedCount,
    });
    expect(a).toEqual(b);
  });

  it("counts malformed/partial candidate entries the same as any other mention (unit is the mention itself)", () => {
    const tally = tallyMisconceptionActivity({
      candidateMentions: [{}, { category: undefined }],
      sessionCreatedCount: 0,
    });
    expect(tally.count).toBe(2);
  });
});

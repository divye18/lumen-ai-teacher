import { describe, expect, it } from "vitest";

import {
  applyConfidenceUpdate,
  applyMasteryUpdate,
  deriveMasteryStatus,
  masteryBand,
  masteryBandLabel,
  pointsToScore,
  scoreToPoints,
} from "./mastery";

describe("mastery scale", () => {
  it("maps DB score <-> product points", () => {
    expect(scoreToPoints(0.62)).toBe(62);
    expect(pointsToScore(62)).toBeCloseTo(0.62, 5);
    expect(scoreToPoints(1.5)).toBe(100);
    expect(scoreToPoints(-1)).toBe(0);
  });

  it.each([
    [0, "not-understood"],
    [30, "not-understood"],
    [31, "emerging"],
    [50, "emerging"],
    [51, "developing"],
    [70, "developing"],
    [71, "proficient"],
    [85, "proficient"],
    [86, "strong"],
    [100, "strong"],
  ])("band(%i) = %s", (points, band) => {
    expect(masteryBand(points)).toBe(band);
  });

  it("has a human label", () => {
    expect(masteryBandLabel(20)).toBe("Not understood");
    expect(masteryBandLabel(95)).toBe("Strong");
  });
});

describe("applyMasteryUpdate", () => {
  const base = {
    currentPoints: 50,
    correctnessScore: 1,
    difficulty: 3,
    priorAttempts: 1,
  };

  it("increases mastery on a correct answer, bounded", () => {
    const r = applyMasteryUpdate({ ...base, classification: "CORRECT" });
    expect(r.delta).toBeGreaterThan(0);
    expect(r.delta).toBeLessThanOrEqual(12);
    expect(r.nextPoints).toBeGreaterThan(50);
  });

  it("decreases mastery on an incorrect answer, bounded", () => {
    const r = applyMasteryUpdate({
      ...base,
      classification: "INCORRECT",
      correctnessScore: 0.1,
    });
    expect(r.delta).toBeLessThan(0);
    expect(r.delta).toBeGreaterThanOrEqual(-10);
  });

  it("never moves mastery wildly from one answer", () => {
    for (const cls of [
      "CORRECT",
      "INCORRECT",
      "PARTIALLY_CORRECT",
      "UNCERTAIN",
    ] as const) {
      for (const current of [0, 25, 50, 75, 100]) {
        const r = applyMasteryUpdate({
          ...base,
          currentPoints: current,
          classification: cls,
        });
        expect(Math.abs(r.delta)).toBeLessThanOrEqual(12);
        expect(r.nextPoints).toBeGreaterThanOrEqual(0);
        expect(r.nextPoints).toBeLessThanOrEqual(100);
      }
    }
  });

  it("gives a smaller gain as mastery approaches 100 (diminishing returns)", () => {
    const low = applyMasteryUpdate({
      ...base,
      currentPoints: 20,
      classification: "CORRECT",
    });
    const high = applyMasteryUpdate({
      ...base,
      currentPoints: 90,
      classification: "CORRECT",
    });
    expect(low.delta).toBeGreaterThan(high.delta);
  });

  it("gives partial credit a small positive nudge", () => {
    const r = applyMasteryUpdate({
      ...base,
      classification: "PARTIALLY_CORRECT",
      correctnessScore: 0.6,
    });
    expect(r.delta).toBeGreaterThan(0);
    expect(r.delta).toBeLessThanOrEqual(5);
  });

  it("damps repeated attempts", () => {
    const early = applyMasteryUpdate({
      ...base,
      priorAttempts: 0,
      classification: "CORRECT",
    });
    const late = applyMasteryUpdate({
      ...base,
      priorAttempts: 8,
      classification: "CORRECT",
    });
    expect(early.delta).toBeGreaterThan(late.delta);
  });
});

describe("applyConfidenceUpdate", () => {
  it("rises toward high confidence on CORRECT and falls on INCORRECT", () => {
    const up = applyConfidenceUpdate({
      current: 0.5,
      classification: "CORRECT",
      evaluatorConfidence: 0.9,
    });
    const down = applyConfidenceUpdate({
      current: 0.5,
      classification: "INCORRECT",
      evaluatorConfidence: 0.9,
    });
    expect(up).toBeGreaterThan(0.5);
    expect(down).toBeLessThan(0.5);
    expect(up).toBeLessThanOrEqual(1);
    expect(down).toBeGreaterThanOrEqual(0);
  });

  it("holds confidence on UNCERTAIN", () => {
    expect(
      applyConfidenceUpdate({
        current: 0.4,
        classification: "UNCERTAIN",
        evaluatorConfidence: 0.5,
      }),
    ).toBeCloseTo(0.4, 5);
  });
});

describe("deriveMasteryStatus", () => {
  it("is NOT_STARTED with zero attempts", () => {
    expect(
      deriveMasteryStatus({
        points: 0,
        attempts: 0,
        hasRepeatedMisconception: false,
      }),
    ).toBe("NOT_STARTED");
  });
  it("is NEEDS_RETEACHING when a misconception recurs", () => {
    expect(
      deriveMasteryStatus({
        points: 80,
        attempts: 3,
        hasRepeatedMisconception: true,
      }),
    ).toBe("NEEDS_RETEACHING");
  });
  it("is MASTERED at high points", () => {
    expect(
      deriveMasteryStatus({
        points: 90,
        attempts: 4,
        hasRepeatedMisconception: false,
      }),
    ).toBe("MASTERED");
  });
  it("is DEVELOPING mid-range and LEARNING low", () => {
    expect(
      deriveMasteryStatus({
        points: 60,
        attempts: 2,
        hasRepeatedMisconception: false,
      }),
    ).toBe("DEVELOPING");
    expect(
      deriveMasteryStatus({
        points: 20,
        attempts: 2,
        hasRepeatedMisconception: false,
      }),
    ).toBe("LEARNING");
  });
});

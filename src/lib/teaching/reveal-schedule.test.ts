import { describe, expect, it } from "vitest";

import { revealScheduleMs } from "./reveal-schedule";

describe("revealScheduleMs", () => {
  it("returns one delay per step, starting at firstMs and increasing", () => {
    const s = revealScheduleMs(4, { firstMs: 200, stepMs: 1000 });
    expect(s).toHaveLength(4);
    expect(s[0]).toBe(200);
    for (let i = 1; i < s.length; i += 1) {
      expect(s[i]).toBeGreaterThan(s[i - 1]);
    }
  });

  it("compresses the cadence for longer explanations", () => {
    const s = revealScheduleMs(6, {
      firstMs: 0,
      stepMs: 1000,
      maxStepMs: 1000,
    });
    const gapEarly = s[2] - s[1];
    const gapLate = s[5] - s[4];
    expect(gapLate).toBeLessThanOrEqual(gapEarly);
  });

  it("never exceeds maxStepMs between steps", () => {
    const s = revealScheduleMs(5, {
      firstMs: 0,
      stepMs: 5000,
      maxStepMs: 1200,
    });
    for (let i = 1; i < s.length; i += 1) {
      expect(s[i] - s[i - 1]).toBeLessThanOrEqual(1200);
    }
  });

  it("handles zero / negative / fractional counts", () => {
    expect(revealScheduleMs(0)).toEqual([]);
    expect(revealScheduleMs(-3)).toEqual([]);
    expect(revealScheduleMs(2.9)).toHaveLength(2);
  });

  it("is deterministic", () => {
    expect(revealScheduleMs(5)).toEqual(revealScheduleMs(5));
  });
});

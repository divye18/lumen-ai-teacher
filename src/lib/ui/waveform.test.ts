import { describe, expect, it } from "vitest";

import { computeWaveformBarAmplitudes } from "./waveform";

const PHASES = [0.1, 0.9, 1.7, 2.3, 3.1];

describe("computeWaveformBarAmplitudes", () => {
  it("returns one amplitude per bar, each within [0, 1]", () => {
    const amps = computeWaveformBarAmplitudes({
      level: 0.6,
      active: true,
      reduce: false,
      barCount: 5,
      phases: PHASES,
      t: 1.2,
    });
    expect(amps).toHaveLength(5);
    for (const a of amps) {
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(1);
    }
  });

  it("reduced motion is time-invariant — no wobble, no animation", () => {
    const at = (t: number) =>
      computeWaveformBarAmplitudes({
        level: 0.6,
        active: true,
        reduce: true,
        barCount: 5,
        phases: PHASES,
        t,
      });
    expect(at(0)).toEqual(at(3.7));
    expect(at(0)).toEqual(at(100));
  });

  it("full motion genuinely varies with time — the animation is real", () => {
    const at = (t: number) =>
      computeWaveformBarAmplitudes({
        level: 0.6,
        active: true,
        reduce: false,
        barCount: 5,
        phases: PHASES,
        t,
      });
    expect(at(0)).not.toEqual(at(3.7));
  });

  it("inactive (idle) still returns a small, stable baseline — never a blank/zero bar", () => {
    const amps = computeWaveformBarAmplitudes({
      level: 0.9,
      active: false,
      reduce: true,
      barCount: 3,
      phases: [0, 0, 0],
      t: 0,
    });
    for (const a of amps) expect(a).toBeGreaterThan(0);
  });

  it("higher level produces a taller centre bar while active", () => {
    const low = computeWaveformBarAmplitudes({
      level: 0.1,
      active: true,
      reduce: true,
      barCount: 3,
      phases: [0, 0, 0],
      t: 0,
    });
    const high = computeWaveformBarAmplitudes({
      level: 0.9,
      active: true,
      reduce: true,
      barCount: 3,
      phases: [0, 0, 0],
      t: 0,
    });
    expect(high[1]).toBeGreaterThan(low[1]);
  });

  it("is deterministic for identical input", () => {
    const input = {
      level: 0.5,
      active: true,
      reduce: false,
      barCount: 4,
      phases: PHASES.slice(0, 4),
      t: 2,
    };
    expect(computeWaveformBarAmplitudes(input)).toEqual(
      computeWaveformBarAmplitudes(input),
    );
  });
});

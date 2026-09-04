import { describe, expect, it } from "vitest";

import {
  presenceForContext,
  presenceVisual,
  TEACHER_PRESENCE_STATES,
} from "./presence";

describe("presenceForContext", () => {
  it("follows the voice state when voice is active", () => {
    expect(
      presenceForContext({ phase: "teaching", voiceState: "LISTENING" }),
    ).toBe("LISTENING");
    expect(
      presenceForContext({ phase: "question", voiceState: "PROCESSING" }),
    ).toBe("THINKING");
    expect(
      presenceForContext({ phase: "teaching", voiceState: "SPEAKING" }),
    ).toBe("TEACHING");
  });

  it("maps room phases to the Phase-6 state vocabulary", () => {
    expect(presenceForContext({ phase: "loading" })).toBe("THINKING");
    expect(presenceForContext({ phase: "teaching" })).toBe("TEACHING");
    expect(presenceForContext({ phase: "question" })).toBe("CHECKING");
    expect(presenceForContext({ phase: "transition" })).toBe("ADAPTING");
    expect(presenceForContext({ phase: "complete" })).toBe("CELEBRATING");
  });

  it("celebrates a correct answer and adapts after any other outcome", () => {
    expect(
      presenceForContext({ phase: "result", lastClassification: "CORRECT" }),
    ).toBe("CELEBRATING");
    expect(
      presenceForContext({ phase: "result", lastClassification: "INCORRECT" }),
    ).toBe("ADAPTING");
    expect(
      presenceForContext({ phase: "result", lastClassification: "UNCERTAIN" }),
    ).toBe("ADAPTING");
  });

  it("shows a recap state when the teaching action is RECAP", () => {
    expect(
      presenceForContext({ phase: "teaching", decisionAction: "RECAP" }),
    ).toBe("RECAP");
  });

  it("only produces states that have a visual mapping", () => {
    const phases = [
      "loading",
      "teaching",
      "question",
      "result",
      "transition",
      "complete",
      "error",
    ] as const;
    for (const phase of phases) {
      const state = presenceForContext({ phase });
      expect(TEACHER_PRESENCE_STATES).toContain(state);
      expect(() => presenceVisual(state)).not.toThrow();
      expect(presenceVisual(state).energy).toBeGreaterThanOrEqual(0);
    }
  });

  it("every declared state has a visual", () => {
    for (const state of TEACHER_PRESENCE_STATES) {
      const v = presenceVisual(state);
      expect(v.label.length).toBeGreaterThan(0);
      expect(v.color).toMatch(/^var\(--/);
    }
  });
});

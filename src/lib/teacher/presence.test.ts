import { describe, expect, it } from "vitest";

import { presenceForContext, presenceVisual } from "./presence";

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
    ).toBe("SPEAKING");
  });

  it("maps room phases when voice is idle", () => {
    expect(presenceForContext({ phase: "loading" })).toBe("THINKING");
    expect(presenceForContext({ phase: "teaching" })).toBe("SPEAKING");
    expect(presenceForContext({ phase: "question" })).toBe("LISTENING");
    expect(presenceForContext({ phase: "complete" })).toBe("CELEBRATING");
  });

  it("celebrates a correct answer and encourages a wrong one", () => {
    expect(
      presenceForContext({ phase: "result", lastClassification: "CORRECT" }),
    ).toBe("CELEBRATING");
    expect(
      presenceForContext({ phase: "result", lastClassification: "INCORRECT" }),
    ).toBe("ENCOURAGING");
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
      expect(() => presenceVisual(state)).not.toThrow();
      expect(presenceVisual(state).energy).toBeGreaterThanOrEqual(0);
    }
  });
});

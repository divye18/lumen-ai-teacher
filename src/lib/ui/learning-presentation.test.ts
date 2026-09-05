import { describe, expect, it } from "vitest";

import { liveStatusLabel } from "./learning-presentation";

describe("liveStatusLabel", () => {
  it("humanizes every known LiveStatusView.state value", () => {
    expect(liveStatusLabel("MASTERED")).toBe("Mastered");
    expect(liveStatusLabel("READY")).toBe("Ready to advance");
    expect(liveStatusLabel("RECOVERING")).toBe("Recovering");
    expect(liveStatusLabel("STUCK")).toBe("Working through it");
    expect(liveStatusLabel("DEVELOPING")).toBe("Developing");
    expect(liveStatusLabel("FORMING")).toBe("Getting started");
  });

  it("never returns a raw all-caps enum value for a known state", () => {
    for (const state of [
      "MASTERED",
      "READY",
      "RECOVERING",
      "STUCK",
      "DEVELOPING",
      "FORMING",
    ]) {
      expect(liveStatusLabel(state)).not.toBe(state);
    }
  });

  it("falls back to a title-cased label for an unrecognized state, never blank", () => {
    expect(liveStatusLabel("SOME_NEW_STATE")).toBe("Some New State");
  });
});

import { describe, expect, it } from "vitest";

import { composeCurriculumTopic } from "./compose-topic";

describe("composeCurriculumTopic", () => {
  it("joins chapter and topic with an em dash", () => {
    expect(
      composeCurriculumTopic("Units and Measurement", "Introduction"),
    ).toBe("Units and Measurement — Introduction");
  });

  it("trims surrounding whitespace from both inputs", () => {
    expect(
      composeCurriculumTopic("  Units and Measurement  ", "  Introduction  "),
    ).toBe("Units and Measurement — Introduction");
  });

  it("produces a single-line string with the expected format", () => {
    const result = composeCurriculumTopic("Chapter A", "Topic B");
    expect(result).toBe("Chapter A — Topic B");
    expect(result).not.toContain("\n");
  });
});

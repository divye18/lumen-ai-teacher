import { describe, expect, it } from "vitest";

import { classifyIntentHeuristic, SOURCE_SEEKING_INTENTS } from "./intent";
import { CONVERSATION_INTENTS } from "./contracts";

describe("classifyIntentHeuristic", () => {
  const cases: [string, string][] = [
    ["Can you give me a real-world example?", "EXAMPLE"],
    ["Why is cache faster than RAM?", "WHY"],
    ["Explain this like I'm new to computers", "SIMPLIFY"],
    ["What's the difference between cache and RAM?", "COMPARE"],
    ["So cache is basically just smaller RAM?", "COMPARE"],
    ["How does this connect to CPU performance?", "CONNECT"],
    ["What happens if the cache is full?", "DEEPEN"],
    ["Am I right that a miss goes to RAM?", "CHECK_UNDERSTANDING"],
    ["Quiz me on this", "CHALLENGE"],
    ["I don't understand why this matters", "CLARIFY"],
    ["I'm a bit confused about the hierarchy", "CLARIFY"],
  ];

  for (const [message, expected] of cases) {
    it(`classifies "${message.slice(0, 40)}" as ${expected}`, () => {
      expect(classifyIntentHeuristic(message).intent).toBe(expected);
    });
  }

  it("defaults to CLARIFY for an ambiguous message", () => {
    const g = classifyIntentHeuristic("hmm, interesting");
    expect(g.intent).toBe("CLARIFY");
    expect(g.source).toBe("default");
  });

  it("an explicit intent hint always wins", () => {
    const g = classifyIntentHeuristic("why is cache faster", "EXAMPLE");
    expect(g.intent).toBe("EXAMPLE");
    expect(g.source).toBe("hint");
  });

  it("detects an off-topic message during a lesson", () => {
    const g = classifyIntentHeuristic("who won the football game last night?");
    expect(g.intent).toBe("OFF_TOPIC");
  });

  it("keeps a concept-mentioning question on topic even if it looks off-topic", () => {
    const g = classifyIntentHeuristic("is cache like a music playlist?", null, [
      "cache",
      "ram",
    ]);
    expect(g.intent).not.toBe("OFF_TOPIC");
  });

  it("returns a valid intent for every input", () => {
    for (const m of ["", "?", "explain", "COMPARE these two things", "🤔"]) {
      expect(CONVERSATION_INTENTS).toContain(classifyIntentHeuristic(m).intent);
    }
  });

  it("marks the source-seeking intents", () => {
    expect(SOURCE_SEEKING_INTENTS.has("WHY")).toBe(true);
    expect(SOURCE_SEEKING_INTENTS.has("EXAMPLE")).toBe(true);
    expect(SOURCE_SEEKING_INTENTS.has("OFF_TOPIC")).toBe(false);
    expect(SOURCE_SEEKING_INTENTS.has("SIMPLIFY")).toBe(false);
    expect(SOURCE_SEEKING_INTENTS.has("CHALLENGE")).toBe(false);
  });

  it("is deterministic", () => {
    const m = "Why can't RAM just replace cache?";
    expect(classifyIntentHeuristic(m)).toEqual(classifyIntentHeuristic(m));
  });
});

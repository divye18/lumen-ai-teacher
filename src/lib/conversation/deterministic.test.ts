import { describe, expect, it } from "vitest";

import type { ConversationContext } from "./context";
import { CONVERSATION_INTENTS, teacherReplySchema } from "./contracts";
import { deterministicReply } from "./deterministic";

function context(over: Partial<ConversationContext> = {}): ConversationContext {
  return {
    sessionId: "s",
    userId: "u",
    lesson: {
      id: "l",
      title: "CPU memory",
      objective: "Understand memory",
      language: "en",
      sourceGrounded: false,
      documentId: null,
    },
    concept: {
      id: "c",
      key: "cache-vs-ram",
      title: "Cache vs RAM",
      summary:
        "Cache is a small, very fast memory close to the CPU. RAM is larger but slower and further away.",
      action: "EXPLAIN",
      difficulty: 3,
      importance: 4,
    },
    learner: {
      masteryPoints: 30,
      band: "Not understood",
      confidence: 0.2,
      attempts: 1,
      lastAnswerClassification: null,
    },
    misconceptions: [],
    recentTurns: [],
    ...over,
  };
}

describe("deterministicReply", () => {
  it("produces a schema-valid reply for every intent", () => {
    for (const intent of CONVERSATION_INTENTS) {
      const r = deterministicReply(context(), intent, "some question");
      expect(teacherReplySchema.safeParse(r).success).toBe(true);
      expect(r.intent).toBe(intent);
      expect(r.groundedInSource).toBe(false);
    }
  });

  it("is honest that a full AI explanation is unavailable", () => {
    const r = deterministicReply(context(), "WHY", "why is cache fast?");
    expect(r.answer).toMatch(/isn't available|short version/i);
  });

  it("keeps an off-topic message focused on the lesson without answering it", () => {
    const r = deterministicReply(context(), "OFF_TOPIC", "what's the weather?");
    expect(r.answer).toMatch(/focused on Cache vs RAM/i);
    expect(r.answer).not.toMatch(/weather/i);
  });

  it("suggests a comparison visual for a COMPARE intent", () => {
    expect(
      deterministicReply(context(), "COMPARE", "compare them").suggestVisual,
    ).toBe("comparison");
  });

  it("suggests a simpler visual for a SIMPLIFY intent", () => {
    expect(
      deterministicReply(context(), "SIMPLIFY", "simpler please").suggestVisual,
    ).toBe("simpler");
  });

  it("never fabricates source grounding", () => {
    for (const intent of CONVERSATION_INTENTS) {
      expect(deterministicReply(context(), intent, "q").groundedInSource).toBe(
        false,
      );
    }
  });

  it("is deterministic", () => {
    const a = deterministicReply(context(), "CLARIFY", "help");
    const b = deterministicReply(context(), "CLARIFY", "help");
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

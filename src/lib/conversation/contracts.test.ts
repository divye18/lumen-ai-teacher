import { describe, expect, it } from "vitest";

import { conversationRequestSchema, teacherReplySchema } from "./contracts";

const VALID_REPLY = {
  intent: "WHY",
  answer:
    "Cache is faster because it sits on the CPU die and is built from SRAM.",
  keyPoint: "Cache is faster because it is closer and made of faster memory.",
  followUpPrompt: "Want an analogy for why distance matters?",
  explanationStyle: "causal",
  misconceptionSignal: null,
  groundedInSource: false,
  suggestVisual: "none",
};

describe("teacherReplySchema", () => {
  it("accepts a well-formed reply and fills defaults", () => {
    const r = teacherReplySchema.parse({
      intent: "CLARIFY",
      answer: "Short answer.",
      keyPoint: "The point.",
    });
    expect(r.groundedInSource).toBe(false);
    expect(r.suggestVisual).toBe("none");
    expect(r.followUpPrompt ?? null).toBeNull();
  });

  it("accepts a misconception signal with a plain-identifier category", () => {
    const r = teacherReplySchema.parse({
      ...VALID_REPLY,
      misconceptionSignal: {
        category: "confuses-cache-with-ram",
        contrast: "Cache is a small fast copy, not just a smaller RAM.",
      },
    });
    expect(r.misconceptionSignal?.category).toBe("confuses-cache-with-ram");
  });

  it("rejects an unknown intent", () => {
    expect(
      teacherReplySchema.safeParse({ ...VALID_REPLY, intent: "RANT" }).success,
    ).toBe(false);
  });

  it("rejects an oversized answer", () => {
    expect(
      teacherReplySchema.safeParse({
        ...VALID_REPLY,
        answer: "x".repeat(2000),
      }).success,
    ).toBe(false);
  });

  it("rejects a misconception category that looks like a path or URL", () => {
    expect(
      teacherReplySchema.safeParse({
        ...VALID_REPLY,
        misconceptionSignal: {
          category: "http://evil/../x",
          contrast: "nope",
        },
      }).success,
    ).toBe(false);
  });

  it("rejects an unknown suggestVisual value", () => {
    expect(
      teacherReplySchema.safeParse({ ...VALID_REPLY, suggestVisual: "3d" })
        .success,
    ).toBe(false);
  });
});

describe("conversationRequestSchema", () => {
  it("accepts a minimal request", () => {
    const r = conversationRequestSchema.parse({
      sessionId: "00000000-0000-0000-0000-000000000000",
      message: "  why is cache faster?  ",
    });
    expect(r.message).toBe("why is cache faster?");
    expect(r.intentHint).toBeUndefined();
  });

  it("accepts an intent hint from a quick action", () => {
    const r = conversationRequestSchema.parse({
      sessionId: "00000000-0000-0000-0000-000000000000",
      message: "help",
      intentHint: "EXAMPLE",
    });
    expect(r.intentHint).toBe("EXAMPLE");
  });

  it("rejects an empty message", () => {
    expect(
      conversationRequestSchema.safeParse({
        sessionId: "00000000-0000-0000-0000-000000000000",
        message: "   ",
      }).success,
    ).toBe(false);
  });

  it("rejects an oversized message", () => {
    expect(
      conversationRequestSchema.safeParse({
        sessionId: "00000000-0000-0000-0000-000000000000",
        message: "x".repeat(2001),
      }).success,
    ).toBe(false);
  });
});

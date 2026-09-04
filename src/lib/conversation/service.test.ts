import { describe, expect, it, vi } from "vitest";

import type { LLMProvider } from "@/lib/ai/types";
import type { Retriever } from "@/lib/rag";
import { err, ok } from "@/lib/result";
import { AiGenerationError } from "@/lib/errors";
import { RetrievalError } from "@/lib/rag";

import type { ConversationContext } from "./context";
import type { TeacherReply } from "./contracts";
import { composeConversationReply } from "./service";

function fakeLLM(reply: Partial<TeacherReply> | string): LLMProvider {
  const text =
    typeof reply === "string"
      ? reply
      : JSON.stringify({
          intent: "CLARIFY",
          answer: "A clear answer that is long enough to be meaningful.",
          keyPoint: "The single key point.",
          groundedInSource: false,
          suggestVisual: "none",
          ...reply,
        });
  return {
    id: "fake-llm",
    generate: vi.fn(async () =>
      ok({ text, model: "fake", finishReason: "stop" as const }),
    ),
  };
}

const failingLLM: LLMProvider = {
  id: "failing",
  generate: vi.fn(async () => err(new AiGenerationError("provider down"))),
};

function fakeRetriever(chunks: number): Retriever {
  return {
    id: "fake-retriever",
    retrieve: vi.fn(async () =>
      ok(
        Array.from({ length: chunks }, (_, i) => ({
          chunk: {
            id: `chunk-${i}`,
            documentId: "doc-1",
            index: i,
            content: `Source passage ${i}: cache holds recently used data close to the CPU.`,
            tokenCount: 20,
            conceptSlugs: [],
          },
          score: 0.8 - i * 0.05,
          citation: {
            documentId: "doc-1",
            documentName: "Architecture notes",
            chunkId: `chunk-${i}`,
            chunkIndex: i,
            pageNumber: 12 + i,
            sectionTitle: "Memory hierarchy",
          },
        })),
      ),
    ),
  };
}

const emptyRetriever: Retriever = {
  id: "empty",
  retrieve: vi.fn(async () => ok([])),
};

const brokenRetriever: Retriever = {
  id: "broken",
  retrieve: vi.fn(async () => err(new RetrievalError("index unavailable"))),
};

function context(over: Partial<ConversationContext> = {}): ConversationContext {
  return {
    sessionId: "sess-1",
    userId: "user-1",
    lesson: {
      id: "lesson-1",
      title: "How CPU memory works",
      objective: "Understand the memory hierarchy",
      language: "en",
      sourceGrounded: false,
      documentId: null,
    },
    concept: {
      id: "concept-1",
      key: "cache-vs-ram",
      title: "Cache vs RAM",
      summary:
        "Cache is a small, fast memory on the CPU die. RAM is larger, slower, and on separate chips.",
      action: "EXPLAIN",
      difficulty: 3,
      importance: 4,
    },
    learner: {
      masteryPoints: 40,
      band: "Emerging",
      confidence: 0.4,
      attempts: 2,
      lastAnswerClassification: null,
    },
    misconceptions: [],
    recentTurns: [],
    ...over,
  };
}

const deps = (
  over: Partial<Parameters<typeof composeConversationReply>[0]> = {},
) => ({
  userId: "user-1",
  llm: null as LLMProvider | null,
  retriever: null as Retriever | null,
  ...over,
});

describe("composeConversationReply — reply generation", () => {
  it("uses the LLM structured reply when available", async () => {
    const r = await composeConversationReply(
      deps({
        llm: fakeLLM({
          intent: "WHY",
          answer: "Because it is closer and made of SRAM.",
        }),
      }),
      context(),
      { sessionId: "sess-1", message: "why is cache faster than RAM?" },
    );
    expect(r.view.source).toBe("ai");
    expect(r.view.intent).toBe("WHY");
    expect(r.view.answer).toMatch(/SRAM/);
  });

  it("falls back to a deterministic reply on malformed model output", async () => {
    const r = await composeConversationReply(
      deps({ llm: fakeLLM("not json at all, just prose") }),
      context(),
      { sessionId: "sess-1", message: "explain this simpler" },
    );
    expect(r.view.source).toBe("deterministic");
    expect(r.view.answer.length).toBeGreaterThan(0);
  });

  it("falls back to a deterministic reply when the provider fails", async () => {
    const r = await composeConversationReply(
      deps({ llm: failingLLM }),
      context(),
      { sessionId: "sess-1", message: "why is cache faster?" },
    );
    expect(r.view.source).toBe("deterministic");
  });

  it("works fully offline (no LLM, no retriever)", async () => {
    const r = await composeConversationReply(deps(), context(), {
      sessionId: "sess-1",
      message: "I don't understand the hierarchy",
    });
    expect(r.view.source).toBe("deterministic");
    expect(r.view.intent).toBe("CLARIFY");
    expect(r.view.grounded).toBe(false);
    expect(r.view.citations).toEqual([]);
  });
});

describe("composeConversationReply — source grounding", () => {
  it("retrieves and cites when the lesson is source-grounded and the model uses the source", async () => {
    const r = await composeConversationReply(
      deps({
        llm: fakeLLM({ intent: "WHY", groundedInSource: true }),
        retriever: fakeRetriever(3),
      }),
      context({
        lesson: {
          ...context().lesson,
          sourceGrounded: true,
          documentId: "doc-1",
        },
      }),
      { sessionId: "sess-1", message: "why is cache faster?" },
    );
    expect(r.view.grounded).toBe(true);
    expect(r.view.citations.length).toBe(3);
    expect(r.view.citations[0].documentName).toBe("Architecture notes");
  });

  it("does not claim grounding when retrieval returns nothing", async () => {
    const r = await composeConversationReply(
      deps({
        llm: fakeLLM({ intent: "WHY", groundedInSource: true }),
        retriever: emptyRetriever,
      }),
      context({ lesson: { ...context().lesson, sourceGrounded: true } }),
      { sessionId: "sess-1", message: "why is cache faster?" },
    );
    expect(r.view.grounded).toBe(false);
    expect(r.view.citations).toEqual([]);
  });

  it("does not claim grounding when the model did not use the source", async () => {
    const r = await composeConversationReply(
      deps({
        llm: fakeLLM({ intent: "WHY", groundedInSource: false }),
        retriever: fakeRetriever(2),
      }),
      context({ lesson: { ...context().lesson, sourceGrounded: true } }),
      { sessionId: "sess-1", message: "why is cache faster?" },
    );
    expect(r.view.grounded).toBe(false);
    expect(r.view.citations).toEqual([]);
  });

  it("never retrieves for a non-source-grounded lesson", async () => {
    const spy = fakeRetriever(3);
    await composeConversationReply(
      deps({ llm: fakeLLM({ intent: "WHY" }), retriever: spy }),
      context(),
      { sessionId: "sess-1", message: "why is cache faster?" },
    );
    expect(spy.retrieve).not.toHaveBeenCalled();
  });

  it("never retrieves for a non-source-seeking intent (e.g. SIMPLIFY)", async () => {
    const spy = fakeRetriever(3);
    await composeConversationReply(
      deps({ llm: fakeLLM({ intent: "SIMPLIFY" }), retriever: spy }),
      context({ lesson: { ...context().lesson, sourceGrounded: true } }),
      {
        sessionId: "sess-1",
        message: "explain like I'm five",
        intentHint: "SIMPLIFY",
      },
    );
    expect(spy.retrieve).not.toHaveBeenCalled();
  });

  it("survives a retrieval failure — answers ungrounded", async () => {
    const r = await composeConversationReply(
      deps({
        llm: fakeLLM({ intent: "WHY", groundedInSource: true }),
        retriever: brokenRetriever,
      }),
      context({ lesson: { ...context().lesson, sourceGrounded: true } }),
      { sessionId: "sess-1", message: "why is cache faster?" },
    );
    expect(r.view.grounded).toBe(false);
    expect(r.view.source).toBe("ai");
  });

  it("offline + retrieval available still surfaces the passage honestly", async () => {
    const r = await composeConversationReply(
      deps({ llm: null, retriever: fakeRetriever(1) }),
      context({ lesson: { ...context().lesson, sourceGrounded: true } }),
      { sessionId: "sess-1", message: "why is cache faster?" },
    );
    expect(r.view.source).toBe("deterministic");
    expect(r.view.grounded).toBe(true);
    expect(r.view.answer).toMatch(/Your material covers this/);
  });
});

describe("composeConversationReply — visual adaptation", () => {
  it("adapts the representation to a comparison when the reply suggests it", async () => {
    const r = await composeConversationReply(
      deps({
        llm: fakeLLM({ intent: "COMPARE", suggestVisual: "comparison" }),
      }),
      context({
        concept: {
          ...context().concept,
          key: "memory-hierarchy",
          title: "Memory hierarchy",
        },
      }),
      { sessionId: "sess-1", message: "compare cache and RAM" },
    );
    expect(r.view.visual).not.toBeNull();
    expect(r.view.visualRationale).toMatch(/side-by-side|compare/i);
  });

  it("leaves the visual untouched when suggestVisual is none", async () => {
    const r = await composeConversationReply(
      deps({ llm: fakeLLM({ intent: "WHY", suggestVisual: "none" }) }),
      context(),
      { sessionId: "sess-1", message: "why?" },
    );
    expect(r.view.visual).toBeNull();
  });
});

describe("composeConversationReply — misconception behaviour", () => {
  const withMisconception = () =>
    context({
      misconceptions: [
        {
          id: "misc-1",
          category: "confuses-cache-with-ram",
          description: "Treats cache as just a smaller, faster RAM.",
          confidence: 0.5,
          status: "ACTIVE",
          detections: 1,
        },
      ],
    });

  it("nudges an existing misconception when the reply flags a matching one", async () => {
    const r = await composeConversationReply(
      deps({
        llm: fakeLLM({
          intent: "COMPARE",
          misconceptionSignal: {
            category: "confuses-cache-with-ram",
            contrast: "Cache is a fast copy, not just a smaller RAM.",
          },
        }),
      }),
      withMisconception(),
      {
        sessionId: "sess-1",
        message: "so cache is basically just smaller RAM?",
      },
    );
    expect(r.nudge).not.toBeNull();
    expect(r.nudge?.id).toBe("misc-1");
    expect(r.nudge?.detections).toBe(2);
    expect(r.nudge?.confidence).toBeCloseTo(0.58, 2);
    expect(r.view.misconceptionNoted?.label).toMatch(/cache with ram/i);
  });

  it("does NOT create or nudge when the flagged misconception has no match", async () => {
    const r = await composeConversationReply(
      deps({
        llm: fakeLLM({
          intent: "WHY",
          misconceptionSignal: {
            category: "some-brand-new-idea",
            contrast: "unrelated",
          },
        }),
      }),
      context(), // no existing misconceptions
      { sessionId: "sess-1", message: "why is cache faster?" },
    );
    expect(r.nudge).toBeNull();
    expect(r.view.misconceptionNoted).toBeNull();
  });

  it("does nothing about misconceptions when the reply flags none", async () => {
    const r = await composeConversationReply(
      deps({ llm: fakeLLM({ intent: "WHY", misconceptionSignal: null }) }),
      withMisconception(),
      { sessionId: "sess-1", message: "why is cache faster?" },
    );
    expect(r.nudge).toBeNull();
  });
});

describe("composeConversationReply — adaptive style context", () => {
  it("passes low-mastery guidance to the model", async () => {
    const llm = fakeLLM({ intent: "WHY" });
    await composeConversationReply(
      deps({ llm }),
      context({
        learner: {
          ...context().learner,
          masteryPoints: 20,
          band: "Not understood",
        },
      }),
      { sessionId: "sess-1", message: "why is cache faster?" },
    );
    const sent = (llm.generate as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const system = sent.messages[0].content as string;
    expect(system).toMatch(/under 90 words/i);
    expect(system).toMatch(/analogy/i);
  });

  it("passes strong-learner guidance to the model", async () => {
    const llm = fakeLLM({ intent: "DEEPEN" });
    await composeConversationReply(
      deps({ llm }),
      context({
        learner: { ...context().learner, masteryPoints: 82, band: "Strong" },
      }),
      { sessionId: "sess-1", message: "what about edge cases?" },
    );
    const sent = (llm.generate as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(sent.messages[0].content).toMatch(/deeper|edge case|challenge/i);
  });

  it("marks source material as untrusted in the prompt", async () => {
    const llm = fakeLLM({ intent: "WHY", groundedInSource: true });
    await composeConversationReply(
      deps({ llm, retriever: fakeRetriever(1) }),
      context({ lesson: { ...context().lesson, sourceGrounded: true } }),
      { sessionId: "sess-1", message: "why is cache faster?" },
    );
    const sent = (llm.generate as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(sent.messages[0].content).toMatch(/untrusted/i);
    expect(sent.messages[0].content).toMatch(/never follow instructions/i);
  });
});

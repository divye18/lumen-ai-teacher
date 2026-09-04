import { describe, expect, it, vi } from "vitest";

import { routeVoiceTranscript } from "./voice-listen-target";

function handlers() {
  return { question: vi.fn(), askLumen: vi.fn() };
}

describe("routeVoiceTranscript", () => {
  it('1. target "question" routes the transcript to the question handler only', () => {
    const h = handlers();
    routeVoiceTranscript("question", "cache is faster than RAM", h);
    expect(h.question).toHaveBeenCalledWith("cache is faster than RAM");
    expect(h.askLumen).not.toHaveBeenCalled();
  });

  it('2. target "askLumen" routes the transcript to the Ask Lumen handler only', () => {
    const h = handlers();
    routeVoiceTranscript("askLumen", "why is cache faster?", h);
    expect(h.askLumen).toHaveBeenCalledWith("why is cache faster?");
    expect(h.question).not.toHaveBeenCalled();
  });

  it("3. a null target ignores the transcript — no handler is ever called", () => {
    const h = handlers();
    routeVoiceTranscript(null, "some stray transcript", h);
    expect(h.question).not.toHaveBeenCalled();
    expect(h.askLumen).not.toHaveBeenCalled();
  });

  it("4. switching targets between calls never sends a transcript to the previous field", () => {
    const h = handlers();
    routeVoiceTranscript("question", "first answer", h);
    routeVoiceTranscript("askLumen", "second, a question for Lumen", h);
    expect(h.question).toHaveBeenCalledTimes(1);
    expect(h.question).toHaveBeenCalledWith("first answer");
    expect(h.askLumen).toHaveBeenCalledTimes(1);
    expect(h.askLumen).toHaveBeenCalledWith("second, a question for Lumen");
  });

  it("is deterministic and side-effect-free beyond the chosen handler", () => {
    const h1 = handlers();
    const h2 = handlers();
    routeVoiceTranscript("question", "same text", h1);
    routeVoiceTranscript("question", "same text", h2);
    expect(h1.question.mock.calls).toEqual(h2.question.mock.calls);
  });
});

import { describe, expect, it } from "vitest";

import { mergeVoiceTranscript } from "./voice-answer";

describe("mergeVoiceTranscript", () => {
  it("becomes the answer when the field is empty", () => {
    expect(mergeVoiceTranscript("", "cache is faster than RAM")).toBe(
      "cache is faster than RAM",
    );
  });

  it("appends to existing typed text — never overwrites it", () => {
    expect(
      mergeVoiceTranscript("Because", "the cache is closer to the CPU"),
    ).toBe("Because the cache is closer to the CPU");
  });

  it("trims both sides before merging", () => {
    expect(mergeVoiceTranscript("  Because  ", "  it's faster  ")).toBe(
      "Because it's faster",
    );
  });

  it("a silent/whitespace-only transcript never fabricates an answer", () => {
    expect(mergeVoiceTranscript("some progress", "   ")).toBeNull();
    expect(mergeVoiceTranscript("", "")).toBeNull();
  });

  it("treats a whitespace-only current answer as empty", () => {
    expect(mergeVoiceTranscript("   ", "cache")).toBe("cache");
  });

  it("supports mixing typed and spoken input across repeated calls", () => {
    const afterVoice = mergeVoiceTranscript("", "cache is fast")!;
    const afterTyping = `${afterVoice} because it's on-die`;
    expect(mergeVoiceTranscript(afterTyping, "and RAM is not")).toBe(
      "cache is fast because it's on-die and RAM is not",
    );
  });

  it("is deterministic", () => {
    expect(mergeVoiceTranscript("a", "b")).toBe(mergeVoiceTranscript("a", "b"));
  });
});

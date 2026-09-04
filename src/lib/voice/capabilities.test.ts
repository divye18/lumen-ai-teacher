import { afterEach, describe, expect, it, vi } from "vitest";

import { detectVoiceCapabilities } from "./capabilities";

/**
 * The Vitest environment for this project is `node` (no DOM), which itself
 * exercises the SSR / no-`window` fallback exactly as a server render would.
 * The browser-present branches are exercised with a minimal stubbed global,
 * restored after every test so nothing leaks between cases.
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("detectVoiceCapabilities", () => {
  it("reports nothing available with no window (SSR) — never throws", () => {
    expect(detectVoiceCapabilities()).toEqual({
      recognition: false,
      synthesis: false,
      microphone: false,
      anyVoice: false,
    });
  });

  it("detects a fully-capable browser", () => {
    vi.stubGlobal("window", {
      SpeechRecognition: class {},
      speechSynthesis: {},
      SpeechSynthesisUtterance: class {},
    });
    vi.stubGlobal("navigator", {
      mediaDevices: { getUserMedia: () => {} },
    });
    expect(detectVoiceCapabilities()).toEqual({
      recognition: true,
      synthesis: true,
      microphone: true,
      anyVoice: true,
    });
  });

  it("accepts the webkit-prefixed recognition constructor", () => {
    vi.stubGlobal("window", { webkitSpeechRecognition: class {} });
    vi.stubGlobal("navigator", {});
    expect(detectVoiceCapabilities().recognition).toBe(true);
  });

  it("anyVoice is true with only synthesis (no recognition)", () => {
    vi.stubGlobal("window", {
      speechSynthesis: {},
      SpeechSynthesisUtterance: class {},
    });
    vi.stubGlobal("navigator", {});
    const c = detectVoiceCapabilities();
    expect(c.recognition).toBe(false);
    expect(c.synthesis).toBe(true);
    expect(c.anyVoice).toBe(true);
  });

  it("reports nothing when the browser has neither API — a graceful fallback, not a crash", () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", {});
    expect(detectVoiceCapabilities()).toEqual({
      recognition: false,
      synthesis: false,
      microphone: false,
      anyVoice: false,
    });
  });

  it("requires BOTH speechSynthesis and SpeechSynthesisUtterance for synthesis", () => {
    vi.stubGlobal("window", { speechSynthesis: {} });
    vi.stubGlobal("navigator", {});
    expect(detectVoiceCapabilities().synthesis).toBe(false);
  });

  it("microphone requires getUserMedia on navigator.mediaDevices", () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", { mediaDevices: {} });
    expect(detectVoiceCapabilities().microphone).toBe(false);
  });
});

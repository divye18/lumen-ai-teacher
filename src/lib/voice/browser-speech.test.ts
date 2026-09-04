import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createBrowserRecognizer,
  createBrowserSynthesizer,
} from "./browser-speech";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createBrowserRecognizer — unsupported / SSR fallback", () => {
  it("returns null with no window, instead of throwing — the caller falls back to typed input", () => {
    expect(createBrowserRecognizer()).toBeNull();
  });

  it("returns null when neither SpeechRecognition constructor exists", () => {
    vi.stubGlobal("window", {});
    expect(createBrowserRecognizer()).toBeNull();
  });
});

describe("createBrowserSynthesizer — unsupported / SSR fallback", () => {
  it("returns null with no window, instead of throwing", () => {
    expect(createBrowserSynthesizer()).toBeNull();
  });

  it("returns null when window.speechSynthesis is absent", () => {
    vi.stubGlobal("window", {});
    expect(createBrowserSynthesizer()).toBeNull();
  });
});

describe("createBrowserRecognizer — behaviour with a stubbed engine", () => {
  class FakeRecognition {
    lang = "";
    continuous = false;
    interimResults = false;
    maxAlternatives = 1;
    onresult: ((e: unknown) => void) | null = null;
    onerror: ((e: { error: string }) => void) | null = null;
    onend: (() => void) | null = null;
    start = vi.fn();
    stop = vi.fn();
    abort = vi.fn();
    constructor() {
      instances.push(this);
    }
  }
  let instances: FakeRecognition[] = [];

  function stub() {
    instances = [];
    vi.stubGlobal("window", { SpeechRecognition: FakeRecognition });
  }

  it("start/stop: relays a final transcript and never fabricates one", () => {
    stub();
    const recognizer = createBrowserRecognizer()!;
    const onFinal = vi.fn();
    const onPartial = vi.fn();
    recognizer.start({
      onFinal,
      onPartial,
      onError: vi.fn(),
      onEnd: vi.fn(),
    });

    const engine = instances.at(-1)!;
    expect(engine.start).toHaveBeenCalled();

    engine.onresult?.({
      resultIndex: 0,
      results: [
        Object.assign([{ transcript: "cache is fast" }], { isFinal: true }),
      ],
    });
    engine.onend?.();

    expect(onFinal).toHaveBeenCalledWith("cache is fast");
    expect(onPartial).not.toHaveBeenCalled();
  });

  it("onend with no final speech calls onEnd, not onFinal — no fabricated transcript", () => {
    stub();
    const recognizer = createBrowserRecognizer()!;
    const onFinal = vi.fn();
    const onEnd = vi.fn();
    recognizer.start({ onFinal, onError: vi.fn(), onEnd });
    const engine = instances.at(-1)!;
    engine.onend?.();
    expect(onFinal).not.toHaveBeenCalled();
    expect(onEnd).toHaveBeenCalled();
  });

  it("surfaces a clear message on permission denial, and swallows no-speech/aborted", () => {
    stub();
    const recognizer = createBrowserRecognizer()!;
    const onError = vi.fn();
    recognizer.start({ onFinal: vi.fn(), onError, onEnd: vi.fn() });
    const engine = instances.at(-1)!;

    engine.onerror?.({ error: "no-speech" });
    engine.onerror?.({ error: "aborted" });
    expect(onError).not.toHaveBeenCalled();

    engine.onerror?.({ error: "not-allowed" });
    expect(onError).toHaveBeenCalledWith("Microphone permission was denied.");
  });

  it("stop() never throws even if the engine has already stopped", () => {
    stub();
    const recognizer = createBrowserRecognizer()!;
    recognizer.start({ onFinal: vi.fn(), onError: vi.fn(), onEnd: vi.fn() });
    expect(() => recognizer.stop()).not.toThrow();
  });
});

describe("createBrowserSynthesizer — behaviour with a stubbed engine, incl. duplicate-speak prevention", () => {
  function stub() {
    const cancel = vi.fn();
    const speak = vi.fn();
    vi.stubGlobal("window", {
      speechSynthesis: { cancel, speak, getVoices: () => [] },
    });
    class FakeUtterance {
      lang = "";
      rate = 1;
      pitch = 1;
      voice: unknown = null;
      onboundary: ((e: { charIndex: number }) => void) | null = null;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(public text: string) {}
    }
    vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
    return { cancel, speak };
  }

  it("cancels any prior utterance before speaking the next one — duplicate speech prevention", () => {
    const { cancel, speak } = stub();
    const synth = createBrowserSynthesizer()!;
    synth.speak("first line", {
      onEnd: vi.fn(),
      onError: vi.fn(),
    });
    synth.speak("second line", {
      onEnd: vi.fn(),
      onError: vi.fn(),
    });
    expect(cancel).toHaveBeenCalledTimes(2);
    expect(speak).toHaveBeenCalledTimes(2);
  });

  it("cancel() stops playback without throwing", () => {
    const { cancel } = stub();
    const synth = createBrowserSynthesizer()!;
    expect(() => synth.cancel()).not.toThrow();
    expect(cancel).toHaveBeenCalled();
  });

  it("a construction failure is reported through onError, never thrown", () => {
    vi.stubGlobal("window", { speechSynthesis: {} });
    vi.stubGlobal(
      "SpeechSynthesisUtterance",
      class {
        constructor() {
          throw new Error("boom");
        }
      },
    );
    const synth = createBrowserSynthesizer()!;
    const onError = vi.fn();
    expect(() =>
      synth.speak("hello", { onEnd: vi.fn(), onError }),
    ).not.toThrow();
    expect(onError).toHaveBeenCalledWith("Speech playback failed.");
  });
});

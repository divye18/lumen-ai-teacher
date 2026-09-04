import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createBrowserRecognizer,
  createBrowserSynthesizer,
} from "./browser-speech";
import { withRecognizerFallback } from "./fallback";
import {
  DEFAULT_VOICE_LOCALE,
  mapSessionLanguageToVoiceLocale,
} from "./language";
import type { Recognizer, RecognizerHandlers } from "./controller";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("mapSessionLanguageToVoiceLocale", () => {
  it("en -> en-US", () => {
    expect(mapSessionLanguageToVoiceLocale("en")).toBe("en-US");
  });
  it("hi -> hi-IN", () => {
    expect(mapSessionLanguageToVoiceLocale("hi")).toBe("hi-IN");
  });
  it("hinglish -> hi-IN", () => {
    expect(mapSessionLanguageToVoiceLocale("hinglish")).toBe("hi-IN");
  });
  it("missing -> en-US (the default)", () => {
    expect(mapSessionLanguageToVoiceLocale(undefined)).toBe(
      DEFAULT_VOICE_LOCALE,
    );
    expect(mapSessionLanguageToVoiceLocale(null)).toBe(DEFAULT_VOICE_LOCALE);
    expect(mapSessionLanguageToVoiceLocale("")).toBe(DEFAULT_VOICE_LOCALE);
  });
  it("an unrecognised value -> en-US, never throws", () => {
    expect(mapSessionLanguageToVoiceLocale("klingon")).toBe(
      DEFAULT_VOICE_LOCALE,
    );
  });
  it("is deterministic", () => {
    expect(mapSessionLanguageToVoiceLocale("hi")).toBe(
      mapSessionLanguageToVoiceLocale("hi"),
    );
  });
});

describe("mapped locale reaches the browser adapters", () => {
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
    constructor() {
      instances.push(this);
    }
  }
  let instances: FakeRecognition[] = [];

  class FakeUtterance {
    lang = "";
    rate = 1;
    pitch = 1;
    voice: unknown = null;
    onboundary: (() => void) | null = null;
    onend: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(public text: string) {
      utterances.push(this);
    }
  }
  let utterances: FakeUtterance[] = [];

  function stubBrowserSpeech() {
    instances = [];
    utterances = [];
    vi.stubGlobal("window", {
      SpeechRecognition: FakeRecognition,
      speechSynthesis: {
        cancel: vi.fn(),
        speak: vi.fn(),
        getVoices: () => [],
      },
    });
    vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
  }

  it("the browser recognizer is constructed with the resolved locale", () => {
    stubBrowserSpeech();
    const locale = mapSessionLanguageToVoiceLocale("hi");
    const recognizer = createBrowserRecognizer(locale)!;
    recognizer.start({ onFinal: vi.fn(), onError: vi.fn(), onEnd: vi.fn() });
    expect(instances.at(-1)!.lang).toBe("hi-IN");
  });

  it("the browser synthesizer's utterance is constructed with the resolved locale", () => {
    stubBrowserSpeech();
    const locale = mapSessionLanguageToVoiceLocale("hinglish");
    const synth = createBrowserSynthesizer(locale)!;
    synth.speak("नमस्ते", { onEnd: vi.fn(), onError: vi.fn() });
    expect(utterances.at(-1)!.lang).toBe("hi-IN");
  });

  it("English sessions still resolve to en-US — no regression", () => {
    stubBrowserSpeech();
    const locale = mapSessionLanguageToVoiceLocale("en");
    createBrowserRecognizer(locale)!.start({
      onFinal: vi.fn(),
      onError: vi.fn(),
      onEnd: vi.fn(),
    });
    createBrowserSynthesizer(locale)!.speak("Cache is fast.", {
      onEnd: vi.fn(),
      onError: vi.fn(),
    });
    expect(instances.at(-1)!.lang).toBe("en-US");
    expect(utterances.at(-1)!.lang).toBe("en-US");
  });

  it("a session with no language field falls back to en-US, not a crash", () => {
    stubBrowserSpeech();
    const locale = mapSessionLanguageToVoiceLocale(undefined);
    createBrowserSynthesizer(locale)!.speak("Hello.", {
      onEnd: vi.fn(),
      onError: vi.fn(),
    });
    expect(utterances.at(-1)!.lang).toBe("en-US");
  });

  it("a cloud-to-browser fallback still uses the SAME resolved locale — language is never lost mid-fallback", () => {
    stubBrowserSpeech();
    const locale = mapSessionLanguageToVoiceLocale("hi");
    const failingCloud: Recognizer = {
      supportsStreaming: () => false,
      start: (handlers: RecognizerHandlers) => handlers.onError("cloud down"),
      stop: vi.fn(),
    };
    const browser = createBrowserRecognizer(locale)!;
    const combined = withRecognizerFallback(failingCloud, browser);
    combined.start({ onFinal: vi.fn(), onError: vi.fn(), onEnd: vi.fn() });
    expect(instances.at(-1)!.lang).toBe("hi-IN");
  });
});

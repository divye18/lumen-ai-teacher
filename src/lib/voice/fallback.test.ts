import { describe, expect, it, vi } from "vitest";

import type {
  Recognizer,
  RecognizerHandlers,
  Synthesizer,
  SynthesizerHandlers,
} from "./controller";
import { withRecognizerFallback, withSynthesizerFallback } from "./fallback";

function fakeSynth(): Synthesizer & {
  emitProgress: (n: number) => void;
  emitError: (m: string) => void;
  emitEnd: () => void;
} {
  let h: SynthesizerHandlers | null = null;
  return {
    supportsStreaming: () => true,
    speak: vi.fn((_t, handlers) => {
      h = handlers;
    }),
    cancel: vi.fn(),
    emitProgress: (n) => h?.onProgress?.(n),
    emitError: (m) => h?.onError(m),
    emitEnd: () => h?.onEnd(),
  };
}

function fakeRecognizer(): Recognizer & {
  emitPartial: (t: string) => void;
  emitFinal: (t: string) => void;
  emitError: (m: string) => void;
} {
  let h: RecognizerHandlers | null = null;
  return {
    supportsStreaming: () => true,
    start: vi.fn((handlers) => {
      h = handlers;
    }),
    stop: vi.fn(),
    emitPartial: (t) => h?.onPartial?.(t),
    emitFinal: (t) => h?.onFinal(t),
    emitError: (m) => h?.onError(m),
  };
}

describe("withSynthesizerFallback", () => {
  it("returns the primary unchanged when no fallback is given", () => {
    const primary = fakeSynth();
    expect(withSynthesizerFallback(primary, null)).toBe(primary);
  });

  it("falls back to browser when the cloud provider fails before any progress", () => {
    const cloud = fakeSynth();
    const browser = fakeSynth();
    const onFallback = vi.fn();
    const combined = withSynthesizerFallback(cloud, browser, onFallback);
    const onEnd = vi.fn();
    combined.speak("hello", { onEnd, onError: vi.fn() });
    cloud.emitError("cloud is down");
    expect(onFallback).toHaveBeenCalledTimes(1);
    expect(browser.speak).toHaveBeenCalledWith(
      "hello",
      expect.objectContaining({ onEnd }),
    );
  });

  it("does NOT restart from zero if the cloud provider fails mid-utterance", () => {
    const cloud = fakeSynth();
    const browser = fakeSynth();
    const combined = withSynthesizerFallback(cloud, browser);
    const onError = vi.fn();
    combined.speak("hello", { onEnd: vi.fn(), onError });
    cloud.emitProgress(3);
    cloud.emitError("dropped mid-sentence");
    expect(browser.speak).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith("dropped mid-sentence");
  });

  it("cancel() cancels both the primary and the fallback", () => {
    const cloud = fakeSynth();
    const browser = fakeSynth();
    withSynthesizerFallback(cloud, browser).cancel();
    expect(cloud.cancel).toHaveBeenCalled();
    expect(browser.cancel).toHaveBeenCalled();
  });

  it("relays onEnd straight through on a clean cloud completion (no fallback needed)", () => {
    const cloud = fakeSynth();
    const browser = fakeSynth();
    const onEnd = vi.fn();
    withSynthesizerFallback(cloud, browser).speak("hi", {
      onEnd,
      onError: vi.fn(),
    });
    cloud.emitEnd();
    expect(onEnd).toHaveBeenCalled();
    expect(browser.speak).not.toHaveBeenCalled();
  });
});

describe("withRecognizerFallback", () => {
  it("returns the primary unchanged when no fallback is given", () => {
    const primary = fakeRecognizer();
    expect(withRecognizerFallback(primary, null)).toBe(primary);
  });

  it("falls back to browser recognition when cloud fails immediately", () => {
    const cloud = fakeRecognizer();
    const browser = fakeRecognizer();
    const onFallback = vi.fn();
    const combined = withRecognizerFallback(cloud, browser, onFallback);
    const onFinal = vi.fn();
    combined.start({ onFinal, onError: vi.fn(), onEnd: vi.fn() });
    cloud.emitError("mic denied");
    expect(onFallback).toHaveBeenCalledTimes(1);
    expect(browser.start).toHaveBeenCalled();

    browser.emitFinal("locality of reference");
    expect(onFinal).toHaveBeenCalledWith("locality of reference");
  });

  it("does not fall back once a partial/final result has already arrived", () => {
    const cloud = fakeRecognizer();
    const browser = fakeRecognizer();
    const combined = withRecognizerFallback(cloud, browser);
    const onError = vi.fn();
    combined.start({ onFinal: vi.fn(), onError, onEnd: vi.fn() });
    cloud.emitPartial("cac");
    cloud.emitError("connection dropped");
    expect(browser.start).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith("connection dropped");
  });

  it("stop() stops whichever recognizer is currently active", () => {
    const cloud = fakeRecognizer();
    const browser = fakeRecognizer();
    const combined = withRecognizerFallback(cloud, browser);
    combined.start({ onFinal: vi.fn(), onError: vi.fn(), onEnd: vi.fn() });
    cloud.emitError("fail");
    combined.stop();
    expect(browser.stop).toHaveBeenCalled();
    expect(cloud.stop).not.toHaveBeenCalled();
  });

  it("relays a clean final transcript straight through (no fallback needed)", () => {
    const cloud = fakeRecognizer();
    const browser = fakeRecognizer();
    const onFinal = vi.fn();
    withRecognizerFallback(cloud, browser).start({
      onFinal,
      onError: vi.fn(),
      onEnd: vi.fn(),
    });
    cloud.emitFinal("cache is faster than RAM");
    expect(onFinal).toHaveBeenCalledWith("cache is faster than RAM");
    expect(browser.start).not.toHaveBeenCalled();
  });
});

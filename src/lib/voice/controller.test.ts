import { describe, expect, it, vi } from "vitest";

import {
  VoiceController,
  type Recognizer,
  type RecognizerHandlers,
  type Synthesizer,
  type SynthesizerHandlers,
} from "./controller";

function fakeRecognizer(): Recognizer & {
  emitFinal: (t: string) => void;
  emitError: (m: string) => void;
  emitEnd: () => void;
} {
  let handlers: RecognizerHandlers | null = null;
  return {
    supportsStreaming: () => true,
    start: (h) => {
      handlers = h;
    },
    stop: vi.fn(),
    emitFinal: (t) => handlers?.onFinal(t),
    emitError: (m) => handlers?.onError(m),
    emitEnd: () => handlers?.onEnd(),
  };
}

function fakeSynth(): Synthesizer & { finish: () => void } {
  let handlers: SynthesizerHandlers | null = null;
  return {
    supportsStreaming: () => true,
    speak: (_t, h) => {
      handlers = h;
    },
    cancel: vi.fn(),
    finish: () => handlers?.onEnd(),
  };
}

describe("VoiceController — state machine", () => {
  it("runs IDLE → LISTENING → PROCESSING → SPEAKING → IDLE", () => {
    const rec = fakeRecognizer();
    const synth = fakeSynth();
    const states: string[] = [];
    const c = new VoiceController({
      recognizer: rec,
      synthesizer: synth,
      events: { onStateChange: (s) => states.push(s) },
    });

    expect(c.getState()).toBe("IDLE");
    c.startListening();
    expect(c.getState()).toBe("LISTENING");
    rec.emitFinal("the cache is faster than RAM");
    expect(c.getState()).toBe("PROCESSING");
    c.speak("Correct — nice work.");
    expect(c.getState()).toBe("SPEAKING");
    synth.finish();
    expect(c.getState()).toBe("IDLE");
    expect(states).toEqual(["LISTENING", "PROCESSING", "SPEAKING", "IDLE"]);
  });

  it("rejects impossible transitions", () => {
    const c = new VoiceController({
      recognizer: fakeRecognizer(),
      synthesizer: fakeSynth(),
    });
    // Can't go straight from IDLE to PROCESSING via speak of empty text.
    expect(c.speak("")).toBe(false);
    expect(c.getState()).toBe("IDLE");
    c.startListening();
    // stopSpeaking while LISTENING is a no-op, not a crash.
    c.stopSpeaking();
    expect(c.getState()).toBe("LISTENING");
  });

  it("never fabricates a transcript from an empty result", () => {
    const rec = fakeRecognizer();
    const onTranscript = vi.fn();
    const onError = vi.fn();
    const c = new VoiceController({
      recognizer: rec,
      synthesizer: null,
      events: { onTranscript, onError },
    });
    c.startListening();
    rec.emitFinal("   ");
    expect(onTranscript).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalled();
    expect(c.getState()).toBe("IDLE");
  });

  it("falls back to ERROR when recognition is unavailable, and recovers", () => {
    const onError = vi.fn();
    const c = new VoiceController({
      recognizer: null,
      synthesizer: fakeSynth(),
      events: { onError },
    });
    expect(c.canListen()).toBe(false);
    c.startListening();
    expect(c.getState()).toBe("ERROR");
    expect(onError).toHaveBeenCalled();
    c.recover();
    expect(c.getState()).toBe("IDLE");
  });

  it("with no synthesizer, emits the full caption immediately and settles", () => {
    const captions: { text: string; spokenChars: number }[] = [];
    const c = new VoiceController({
      recognizer: fakeRecognizer(),
      synthesizer: null,
      events: { onCaption: (p) => captions.push(p) },
    });
    c.speak("A cache miss is expensive.");
    expect(captions.at(-1)).toEqual({
      text: "A cache miss is expensive.",
      spokenChars: "A cache miss is expensive.".length,
    });
    expect(c.getState()).toBe("IDLE");
  });

  it("abort() from PROCESSING returns to IDLE (stale API round-trip)", () => {
    const rec = fakeRecognizer();
    const c = new VoiceController({
      recognizer: rec,
      synthesizer: fakeSynth(),
    });
    c.startListening();
    rec.emitFinal("an answer");
    expect(c.getState()).toBe("PROCESSING");
    c.abort();
    expect(c.getState()).toBe("IDLE");
  });

  it("routes completed utterances to the registered handler", () => {
    const rec = fakeRecognizer();
    const handler = vi.fn();
    const c = new VoiceController({
      recognizer: rec,
      synthesizer: null,
    });
    c.setUtteranceHandler(handler);
    c.startListening();
    rec.emitFinal("locality of reference");
    expect(handler).toHaveBeenCalledWith("locality of reference");
  });

  it("a recognizer error moves to ERROR and stops the recognizer", () => {
    const rec = fakeRecognizer();
    const c = new VoiceController({ recognizer: rec, synthesizer: null });
    c.startListening();
    rec.emitError("Microphone permission was denied.");
    expect(c.getState()).toBe("ERROR");
    expect(rec.stop).toHaveBeenCalled();
  });
});

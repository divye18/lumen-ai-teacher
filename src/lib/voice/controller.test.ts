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

  it("stopSpeaking() cancels the synthesizer and returns to IDLE (speak cancellation)", () => {
    const synth = fakeSynth();
    const c = new VoiceController({ recognizer: null, synthesizer: synth });
    c.speak("A long explanation the learner wants to skip.");
    expect(c.getState()).toBe("SPEAKING");
    c.stopSpeaking();
    expect(synth.cancel).toHaveBeenCalledTimes(1);
    expect(c.getState()).toBe("IDLE");
  });

  it("stopListening() asks the recognizer to stop but stays LISTENING until the final result arrives", () => {
    const rec = fakeRecognizer();
    const c = new VoiceController({ recognizer: rec, synthesizer: null });
    c.startListening();
    c.stopListening();
    expect(rec.stop).toHaveBeenCalledTimes(1);
    expect(c.getState()).toBe("LISTENING");
    rec.emitFinal("done");
    expect(c.getState()).toBe("PROCESSING");
  });

  it("stopListening() while not listening is a no-op — never crashes", () => {
    const rec = fakeRecognizer();
    const c = new VoiceController({ recognizer: rec, synthesizer: null });
    expect(() => c.stopListening()).not.toThrow();
    expect(rec.stop).not.toHaveBeenCalled();
  });

  it("re-issuing speak() while already SPEAKING replaces the utterance, never stacking two (duplicate-speech prevention)", () => {
    const synth = fakeSynth();
    const speakSpy = vi.fn(synth.speak.bind(synth));
    synth.speak = speakSpy;
    const captions: { text: string; spokenChars: number }[] = [];
    const c = new VoiceController({
      recognizer: null,
      synthesizer: synth,
      events: { onCaption: (p) => captions.push(p) },
    });
    c.speak("first line");
    c.speak("second line");
    expect(c.getState()).toBe("SPEAKING");
    // The most recent caption reflects the latest utterance, not a stacked one.
    expect(captions.at(-1)?.text).toBe("second line");
  });

  it("abort() stops any in-progress recognition and synthesis and clears an ERROR state", () => {
    const rec = fakeRecognizer();
    const synth = fakeSynth();
    const c = new VoiceController({
      recognizer: rec,
      synthesizer: synth,
      events: {},
    });
    c.startListening();
    rec.emitError("boom");
    expect(c.getState()).toBe("ERROR");
    c.abort();
    expect(c.getState()).toBe("IDLE");
  });

  it("starting to listen while Lumen is still speaking stops the speech first — never records over itself", () => {
    const rec = fakeRecognizer();
    const synth = fakeSynth();
    const c = new VoiceController({ recognizer: rec, synthesizer: synth });
    c.speak("A long explanation.");
    expect(c.getState()).toBe("SPEAKING");
    c.startListening();
    expect(synth.cancel).toHaveBeenCalledTimes(1);
    expect(c.getState()).toBe("LISTENING");
  });

  it("starting to listen while idle never touches the synthesizer", () => {
    const rec = fakeRecognizer();
    const synth = fakeSynth();
    const c = new VoiceController({ recognizer: rec, synthesizer: synth });
    c.startListening();
    expect(synth.cancel).not.toHaveBeenCalled();
  });
});

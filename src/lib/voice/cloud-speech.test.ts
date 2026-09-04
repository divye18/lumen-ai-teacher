import { afterEach, describe, expect, it, vi } from "vitest";

import { createCloudRecognizer, createCloudSynthesizer } from "./cloud-speech";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createCloudSynthesizer — unsupported / SSR fallback", () => {
  it("returns null with no window", () => {
    expect(createCloudSynthesizer()).toBeNull();
  });

  it("returns null when Audio is unavailable", () => {
    vi.stubGlobal("window", {});
    expect(createCloudSynthesizer()).toBeNull();
  });
});

describe("createCloudRecognizer — unsupported / SSR fallback", () => {
  it("returns null with no window", () => {
    expect(createCloudRecognizer()).toBeNull();
  });

  it("returns null when MediaRecorder / getUserMedia are unavailable", () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", {});
    expect(createCloudRecognizer()).toBeNull();
  });
});

class FakeAudio {
  src: string;
  duration = 2;
  currentTime = 0;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeupdate: (() => void) | null = null;
  play = vi.fn(async () => {});
  pause = vi.fn();
  constructor(url: string) {
    this.src = url;
  }
}

function stubTtsGlobals(fetchImpl: typeof fetch) {
  vi.stubGlobal("window", {});
  vi.stubGlobal("Audio", FakeAudio);
  vi.stubGlobal("fetch", fetchImpl);
  vi.stubGlobal("URL", {
    createObjectURL: vi.fn(() => "blob:fake"),
    revokeObjectURL: vi.fn(),
  });
}

describe("createCloudSynthesizer — behaviour", () => {
  it("speaks via /api/voice/speak and reports onEnd when playback finishes", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(new Blob(["audio"], { type: "audio/mpeg" }), {
          status: 200,
        }),
    );
    stubTtsGlobals(fetchImpl as unknown as typeof fetch);
    const synth = createCloudSynthesizer()!;
    const onEnd = vi.fn();
    synth.speak("Cache is fast.", { onEnd, onError: vi.fn() });

    // Let the async fetch/blob chain settle.
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/voice/speak",
      expect.objectContaining({ method: "POST" }),
    );
    const call = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(call[1].body as string);
    expect(body).toEqual({ text: "Cache is fast." });
  });

  it("includes the resolved language in the request body when given one", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(new Blob(["audio"], { type: "audio/mpeg" }), {
          status: 200,
        }),
    );
    stubTtsGlobals(fetchImpl as unknown as typeof fetch);
    const synth = createCloudSynthesizer("hi-IN")!;
    synth.speak("नमस्ते", { onEnd: vi.fn(), onError: vi.fn() });
    await new Promise((r) => setTimeout(r, 0));
    const call = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(call[1].body as string);
    expect(body).toEqual({ text: "नमस्ते", language: "hi-IN" });
  });

  it("reports onError on a non-ok response, never throws", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 503 }));
    stubTtsGlobals(fetchImpl as unknown as typeof fetch);
    const synth = createCloudSynthesizer()!;
    const onError = vi.fn();
    synth.speak("hello", { onEnd: vi.fn(), onError });
    await new Promise((r) => setTimeout(r, 0));
    expect(onError).toHaveBeenCalled();
  });

  it("reports onError when the network request itself fails", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("offline");
    });
    stubTtsGlobals(fetchImpl as unknown as typeof fetch);
    const synth = createCloudSynthesizer()!;
    const onError = vi.fn();
    synth.speak("hello", { onEnd: vi.fn(), onError });
    await new Promise((r) => setTimeout(r, 0));
    expect(onError).toHaveBeenCalled();
  });

  it("a second speak() call supersedes the first — no overlapping cloud requests", async () => {
    let resolveFirst!: (r: Response) => void;
    const first = new Promise<Response>((r) => (resolveFirst = r));
    const fetchImpl = vi
      .fn()
      .mockReturnValueOnce(first)
      .mockResolvedValueOnce(
        new Response(new Blob(["a"], { type: "audio/mpeg" }), {
          status: 200,
        }),
      );
    stubTtsGlobals(fetchImpl as unknown as typeof fetch);
    const synth = createCloudSynthesizer()!;
    const onEndFirst = vi.fn();
    const onEndSecond = vi.fn();
    synth.speak("first", { onEnd: onEndFirst, onError: vi.fn() });
    synth.speak("second", { onEnd: onEndSecond, onError: vi.fn() });

    // Resolve the (now-abandoned) first request late.
    resolveFirst(new Response(new Blob(["a"]), { status: 200 }));
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    expect(onEndFirst).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("cancel() never throws even with nothing playing", () => {
    stubTtsGlobals(vi.fn() as unknown as typeof fetch);
    const synth = createCloudSynthesizer()!;
    expect(() => synth.cancel()).not.toThrow();
  });
});

class FakeMediaRecorder {
  static isTypeSupported = () => true;
  state: "inactive" | "recording" = "inactive";
  mimeType = "audio/webm";
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public stream: unknown) {}
  start() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["x".repeat(1000)]) });
    this.onstop?.();
  }
}

function fakeStream() {
  return { getTracks: () => [{ stop: vi.fn() }] };
}

function stubSttGlobals(
  fetchImpl: typeof fetch,
  getUserMedia = vi.fn(async () => fakeStream()),
) {
  vi.stubGlobal("window", {});
  vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
  vi.stubGlobal("fetch", fetchImpl);
}

describe("createCloudRecognizer — behaviour", () => {
  it("includes the resolved language as a form field when given one", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ ok: true, transcript: "cache hit" }), {
          status: 200,
        }),
    );
    stubSttGlobals(fetchImpl as unknown as typeof fetch);
    const recognizer = createCloudRecognizer("hi-IN")!;
    recognizer.start({ onFinal: vi.fn(), onError: vi.fn(), onEnd: vi.fn() });
    await new Promise((r) => setTimeout(r, 0));
    recognizer.stop();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    const call = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const form = call[1].body as FormData;
    expect(form.get("language")).toBe("hi-IN");
  });

  it("omits the language field entirely when none was resolved", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ ok: true, transcript: "cache hit" }), {
          status: 200,
        }),
    );
    stubSttGlobals(fetchImpl as unknown as typeof fetch);
    const recognizer = createCloudRecognizer()!;
    recognizer.start({ onFinal: vi.fn(), onError: vi.fn(), onEnd: vi.fn() });
    await new Promise((r) => setTimeout(r, 0));
    recognizer.stop();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    const call = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const form = call[1].body as FormData;
    expect(form.get("language")).toBeNull();
  });

  it("uploads the recording on stop() and reports the final transcript", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ ok: true, transcript: "cache hit" }), {
          status: 200,
        }),
    );
    stubSttGlobals(fetchImpl as unknown as typeof fetch);
    const recognizer = createCloudRecognizer()!;
    const onFinal = vi.fn();
    recognizer.start({ onFinal, onError: vi.fn(), onEnd: vi.fn() });
    await new Promise((r) => setTimeout(r, 0));
    recognizer.stop();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/voice/transcribe",
      expect.objectContaining({ method: "POST" }),
    );
    expect(onFinal).toHaveBeenCalledWith("cache hit");
  });

  it("never fabricates a transcript from a near-silent clip", async () => {
    class TinyRecorder extends FakeMediaRecorder {
      stop() {
        this.state = "inactive";
        this.ondataavailable?.({ data: new Blob(["x"]) }); // well under the floor
        this.onstop?.();
      }
    }
    vi.stubGlobal("window", {});
    vi.stubGlobal("MediaRecorder", TinyRecorder);
    vi.stubGlobal("navigator", {
      mediaDevices: { getUserMedia: vi.fn(async () => fakeStream()) },
    });
    const fetchImpl = vi.fn();
    vi.stubGlobal("fetch", fetchImpl);

    const recognizer = createCloudRecognizer()!;
    const onFinal = vi.fn();
    const onEnd = vi.fn();
    recognizer.start({ onFinal, onError: vi.fn(), onEnd });
    await new Promise((r) => setTimeout(r, 0));
    recognizer.stop();
    await new Promise((r) => setTimeout(r, 0));

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(onFinal).not.toHaveBeenCalled();
    expect(onEnd).toHaveBeenCalled();
  });

  it("reports a friendly error when microphone permission is denied", async () => {
    stubSttGlobals(
      vi.fn() as unknown as typeof fetch,
      vi.fn(async () => {
        throw new Error("NotAllowedError");
      }),
    );
    const recognizer = createCloudRecognizer()!;
    const onError = vi.fn();
    recognizer.start({ onFinal: vi.fn(), onError, onEnd: vi.fn() });
    await new Promise((r) => setTimeout(r, 0));
    expect(onError).toHaveBeenCalledWith("Microphone permission was denied.");
  });

  it("treats a non-ok transcribe response as a recoverable error, not a crash", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 500 }));
    stubSttGlobals(fetchImpl as unknown as typeof fetch);
    const recognizer = createCloudRecognizer()!;
    const onError = vi.fn();
    recognizer.start({ onFinal: vi.fn(), onError, onEnd: vi.fn() });
    await new Promise((r) => setTimeout(r, 0));
    recognizer.stop();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(onError).toHaveBeenCalled();
  });

  it("an empty transcript from the server calls onEnd, never onFinal", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ ok: true, transcript: "" }), {
          status: 200,
        }),
    );
    stubSttGlobals(fetchImpl as unknown as typeof fetch);
    const recognizer = createCloudRecognizer()!;
    const onFinal = vi.fn();
    const onEnd = vi.fn();
    recognizer.start({ onFinal, onError: vi.fn(), onEnd });
    await new Promise((r) => setTimeout(r, 0));
    recognizer.stop();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(onFinal).not.toHaveBeenCalled();
    expect(onEnd).toHaveBeenCalled();
  });
});

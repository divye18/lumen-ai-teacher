import { beforeEach, describe, expect, it, vi } from "vitest";

import { err, ok } from "@/lib/result";
import { LumenError } from "@/lib/errors";

const getUser = vi.fn();
const getConfiguredTextToSpeech = vi.fn();

vi.mock("@/lib/db/server", () => ({
  getSupabaseServerClient: async () => ({}) as never,
}));
vi.mock("@/lib/auth/current-user", () => ({
  requireUser: (...args: unknown[]) => getUser(...args),
}));
vi.mock("@/lib/voice", () => ({
  getConfiguredTextToSpeech: (...args: unknown[]) =>
    getConfiguredTextToSpeech(...args),
}));

import { POST } from "./route";

function post(body: unknown): Request {
  return new Request("http://localhost/api/voice/speak", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/voice/speak", () => {
  beforeEach(() => {
    getUser.mockReset();
    getConfiguredTextToSpeech.mockReset();
  });

  it("requires an authenticated user", async () => {
    getUser.mockResolvedValueOnce(
      err(new LumenError("UNAUTHORIZED", "Authentication required.")),
    );
    const res = await POST(post({ text: "Cache is fast." }));
    expect(res.status).toBe(401);
    expect(getConfiguredTextToSpeech).not.toHaveBeenCalled();
  });

  it("rejects a missing text field", async () => {
    getUser.mockResolvedValueOnce(ok({ id: "u1", email: null }));
    const res = await POST(post({}));
    expect(res.status).toBe(400);
    expect(getConfiguredTextToSpeech).not.toHaveBeenCalled();
  });

  it("rejects text over the teaching-content length cap", async () => {
    getUser.mockResolvedValueOnce(ok({ id: "u1", email: null }));
    const res = await POST(post({ text: "a".repeat(4001) }));
    expect(res.status).toBe(400);
    expect(getConfiguredTextToSpeech).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON", async () => {
    getUser.mockResolvedValueOnce(ok({ id: "u1", email: null }));
    const res = await POST(
      new Request("http://localhost/api/voice/speak", {
        method: "POST",
        body: "not json",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 503 (recoverable) when no cloud TTS provider is configured", async () => {
    getUser.mockResolvedValueOnce(ok({ id: "u1", email: null }));
    getConfiguredTextToSpeech.mockReturnValueOnce(null);
    const res = await POST(post({ text: "Cache is fast." }));
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("PROVIDER_NOT_CONFIGURED");
  });

  it("propagates a provider failure as a safe 502, no raw provider error leaked", async () => {
    getUser.mockResolvedValueOnce(ok({ id: "u1", email: null }));
    getConfiguredTextToSpeech.mockReturnValueOnce({
      id: "elevenlabs:test",
      synthesize: async () =>
        err(new LumenError("PROVIDER_ERROR", "ElevenLabs returned 500.")),
    });
    const res = await POST(post({ text: "Cache is fast." }));
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("PROVIDER_ERROR");
  });

  it("on success, streams the raw audio with the provider's mime type — never JSON, never a key", async () => {
    getUser.mockResolvedValueOnce(ok({ id: "u1", email: null }));
    const synthesize = vi.fn(async () =>
      ok({
        audio: new TextEncoder().encode("fake-audio").buffer,
        mimeType: "audio/mpeg",
      }),
    );
    getConfiguredTextToSpeech.mockReturnValueOnce({
      id: "elevenlabs:test",
      synthesize,
    });
    const res = await POST(post({ text: "Cache is fast." }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("audio/mpeg");
    const buf = await res.arrayBuffer();
    expect(new TextDecoder().decode(buf)).toBe("fake-audio");
    expect(synthesize).toHaveBeenCalledWith({
      text: "Cache is fast.",
      voice: undefined,
    });
    // The response is raw audio bytes only — never a key, never JSON metadata.
    expect(new TextDecoder().decode(buf)).not.toMatch(/api[_-]?key/i);
  });

  it("forwards a supplied language straight to the provider's synthesize() call", async () => {
    getUser.mockResolvedValueOnce(ok({ id: "u1", email: null }));
    const synthesize = vi.fn(async () =>
      ok({
        audio: new TextEncoder().encode("fake-audio").buffer,
        mimeType: "audio/mpeg",
      }),
    );
    getConfiguredTextToSpeech.mockReturnValueOnce({
      id: "elevenlabs:test",
      synthesize,
    });
    await POST(post({ text: "नमस्ते", language: "hi-IN" }));
    expect(synthesize).toHaveBeenCalledWith({
      text: "नमस्ते",
      voice: undefined,
      language: "hi-IN",
    });
  });

  it("does not call the provider before validating input (no wasted/duplicate calls)", async () => {
    getUser.mockResolvedValueOnce(ok({ id: "u1", email: null }));
    await POST(post({ text: "" }));
    expect(getConfiguredTextToSpeech).not.toHaveBeenCalled();
  });
});

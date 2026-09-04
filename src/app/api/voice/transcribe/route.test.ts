import { beforeEach, describe, expect, it, vi } from "vitest";

import { err, ok } from "@/lib/result";
import { LumenError } from "@/lib/errors";

const getUser = vi.fn();
const getConfiguredSpeechToText = vi.fn();

vi.mock("@/lib/db/server", () => ({
  getSupabaseServerClient: async () => ({}) as never,
}));
vi.mock("@/lib/auth/current-user", () => ({
  requireUser: (...args: unknown[]) => getUser(...args),
}));
vi.mock("@/lib/voice", () => ({
  getConfiguredSpeechToText: (...args: unknown[]) =>
    getConfiguredSpeechToText(...args),
}));

import { POST } from "./route";

function multipart(fields: Record<string, Blob | string>): Request {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (typeof value === "string") form.append(key, value);
    else form.append(key, value, "clip.webm");
  }
  return new Request("http://localhost/api/voice/transcribe", {
    method: "POST",
    body: form,
  });
}

const CLIP = new Blob(["x".repeat(2000)], { type: "audio/webm" });

describe("POST /api/voice/transcribe", () => {
  beforeEach(() => {
    getUser.mockReset();
    getConfiguredSpeechToText.mockReset();
  });

  it("requires an authenticated user", async () => {
    getUser.mockResolvedValueOnce(
      err(new LumenError("UNAUTHORIZED", "Authentication required.")),
    );
    const res = await POST(multipart({ audio: CLIP }));
    expect(res.status).toBe(401);
    expect(getConfiguredSpeechToText).not.toHaveBeenCalled();
  });

  it("rejects a request with no 'audio' field", async () => {
    getUser.mockResolvedValueOnce(ok({ id: "u1", email: null }));
    const res = await POST(multipart({ title: "no audio here" }));
    expect(res.status).toBe(400);
    expect(getConfiguredSpeechToText).not.toHaveBeenCalled();
  });

  it("rejects a non-multipart body", async () => {
    getUser.mockResolvedValueOnce(ok({ id: "u1", email: null }));
    const res = await POST(
      new Request("http://localhost/api/voice/transcribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects an unsupported audio format", async () => {
    getUser.mockResolvedValueOnce(ok({ id: "u1", email: null }));
    const res = await POST(
      multipart({
        audio: new Blob(["x".repeat(2000)], { type: "video/mp4" }),
      }),
    );
    expect(res.status).toBe(400);
    expect(getConfiguredSpeechToText).not.toHaveBeenCalled();
  });

  it("rejects an audio clip over the size limit", async () => {
    getUser.mockResolvedValueOnce(ok({ id: "u1", email: null }));
    const big = new Blob(["x".repeat(9_000_000)], { type: "audio/webm" });
    const res = await POST(multipart({ audio: big }));
    expect(res.status).toBe(400);
    expect(getConfiguredSpeechToText).not.toHaveBeenCalled();
  });

  it("rejects an empty clip", async () => {
    getUser.mockResolvedValueOnce(ok({ id: "u1", email: null }));
    const res = await POST(
      multipart({ audio: new Blob([], { type: "audio/webm" }) }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 503 (recoverable) when no cloud STT provider is configured", async () => {
    getUser.mockResolvedValueOnce(ok({ id: "u1", email: null }));
    getConfiguredSpeechToText.mockReturnValueOnce(null);
    const res = await POST(multipart({ audio: CLIP }));
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("PROVIDER_NOT_CONFIGURED");
  });

  it("propagates a provider failure as a safe 502", async () => {
    getUser.mockResolvedValueOnce(ok({ id: "u1", email: null }));
    getConfiguredSpeechToText.mockReturnValueOnce({
      id: "deepgram:test",
      transcribe: async () =>
        err(new LumenError("PROVIDER_ERROR", "Deepgram returned 500.")),
    });
    const res = await POST(multipart({ audio: CLIP }));
    expect(res.status).toBe(502);
  });

  it("returns ONLY the transcript — no confidence score, no provider id, no metadata", async () => {
    getUser.mockResolvedValueOnce(ok({ id: "u1", email: null }));
    const transcribe = vi.fn(async () =>
      ok({
        text: "cache is faster than RAM",
        language: "en",
        confidence: 0.94,
      }),
    );
    getConfiguredSpeechToText.mockReturnValueOnce({
      id: "deepgram:test",
      transcribe,
    });
    const res = await POST(multipart({ audio: CLIP }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({ ok: true, transcript: "cache is faster than RAM" });
    expect(transcribe).toHaveBeenCalledWith(
      expect.objectContaining({ mimeType: "audio/webm" }),
    );
  });
});

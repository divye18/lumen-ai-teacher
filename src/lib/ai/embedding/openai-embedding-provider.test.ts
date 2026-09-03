import { describe, expect, it, vi } from "vitest";

import { createOpenAIEmbeddingProvider } from "./openai-embedding-provider";

const DIMS = 4;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function makeProvider(fetchImpl: typeof fetch) {
  return createOpenAIEmbeddingProvider({
    apiKey: "test-key",
    model: "text-embedding-3-small",
    baseUrl: "https://api.example.com/v1",
    dimensions: DIMS,
    fetchImpl,
  });
}

describe("createOpenAIEmbeddingProvider", () => {
  it("returns ordered vectors on success", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        model: "text-embedding-3-small",
        data: [
          { index: 1, embedding: [1, 1, 1, 1] },
          { index: 0, embedding: [0, 0, 0, 0] },
        ],
      }),
    );
    const provider = makeProvider(fetchImpl);

    const res = await provider.embed({ input: ["a", "b"] });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.vectors).toEqual([
      [0, 0, 0, 0],
      [1, 1, 1, 1],
    ]);
    expect(res.value.dimensions).toBe(DIMS);

    const init = fetchImpl.mock.calls[0]?.[1];
    expect(init?.headers).toMatchObject({ authorization: "Bearer test-key" });
    const payload = JSON.parse(String(init?.body)) as { dimensions: number };
    expect(payload.dimensions).toBe(DIMS);
  });

  it("short-circuits on empty input without calling fetch", async () => {
    const fetchImpl = vi.fn();
    const provider = makeProvider(fetchImpl as unknown as typeof fetch);
    const res = await provider.embed({ input: [] });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.vectors).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("maps an HTTP 429 to a recoverable EmbeddingProviderError", async () => {
    const provider = makeProvider((async () =>
      jsonResponse({ error: { message: "rate limit" } }, 429)) as typeof fetch);
    const res = await provider.embed({ input: ["x"] });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("EMBEDDING_ERROR");
      expect(res.error.recoverable).toBe(true);
      expect(res.error.message).toContain("429");
    }
  });

  it("errors when the response is not JSON", async () => {
    const provider = makeProvider(
      (async () =>
        new Response("<html>502</html>", { status: 200 })) as typeof fetch,
    );
    const res = await provider.embed({ input: ["x"] });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.message).toContain("JSON");
  });

  it("errors on a dimension mismatch", async () => {
    const provider = makeProvider((async () =>
      jsonResponse({
        data: [{ index: 0, embedding: [1, 2, 3] }],
      })) as typeof fetch);
    const res = await provider.embed({ input: ["x"] });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.message).toContain("dimension");
  });

  it("errors when the provider returns the wrong number of rows", async () => {
    const provider = makeProvider((async () =>
      jsonResponse({
        data: [{ index: 0, embedding: [1, 1, 1, 1] }],
      })) as typeof fetch);
    const res = await provider.embed({ input: ["x", "y"] });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.message).toContain("expected 2");
  });

  it("wraps network failures", async () => {
    const provider = makeProvider((async () => {
      throw new Error("ECONNREFUSED");
    }) as typeof fetch);
    const res = await provider.embed({ input: ["x"] });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.message).toContain("ECONNREFUSED");
  });
});

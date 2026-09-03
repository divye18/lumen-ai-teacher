import { describe, expect, it, vi } from "vitest";

import { createOpenAIChatProvider } from "./openai-chat-provider";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function provider(fetchImpl: typeof fetch) {
  return createOpenAIChatProvider({
    apiKey: "k",
    model: "gpt-4o-mini",
    baseUrl: "https://api.example.com/v1",
    fetchImpl,
  });
}

describe("createOpenAIChatProvider", () => {
  it("returns the assistant message text on success", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        model: "gpt-4o-mini",
        choices: [
          { message: { content: '{"ok":true}' }, finish_reason: "stop" },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 4 },
      }),
    );
    const res = await provider(fetchImpl).generate({
      messages: [{ role: "user", content: "hi" }],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.text).toBe('{"ok":true}');
    expect(res.value.finishReason).toBe("stop");
    expect(res.value.usage).toEqual({ inputTokens: 10, outputTokens: 4 });

    const init = fetchImpl.mock.calls[0]?.[1];
    const payload = JSON.parse(String(init?.body)) as {
      response_format?: { type: string };
    };
    expect(payload.response_format).toEqual({ type: "json_object" });
  });

  it("maps an HTTP error to a recoverable AI_GENERATION_FAILED", async () => {
    const res = await provider((async () =>
      jsonResponse(
        { error: { message: "bad key" } },
        401,
      )) as typeof fetch).generate({
      messages: [{ role: "user", content: "hi" }],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("AI_GENERATION_FAILED");
      expect(res.error.recoverable).toBe(true);
      expect(res.error.message).toContain("401");
    }
  });

  it("errors on empty content", async () => {
    const res = await provider((async () =>
      jsonResponse({
        choices: [{ message: { content: "" } }],
      })) as typeof fetch).generate({
      messages: [{ role: "user", content: "hi" }],
    });
    expect(res.ok).toBe(false);
  });

  it("wraps a network failure", async () => {
    const res = await provider((async () => {
      throw new Error("ECONNRESET");
    }) as typeof fetch).generate({
      messages: [{ role: "user", content: "hi" }],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.message).toContain("ECONNRESET");
  });
});

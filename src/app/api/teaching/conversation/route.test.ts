import { beforeEach, describe, expect, it, vi } from "vitest";

import { err, ok } from "@/lib/result";
import { LumenError, SessionNotFoundError } from "@/lib/errors";

const getUser = vi.fn();
const runConversationTurnMock = vi.fn();
const buildTeachingRuntimeMock = vi.fn(() => ({ llm: null, retriever: null }));

vi.mock("@/lib/db/server", () => ({
  getSupabaseServerClient: async () => ({}) as never,
}));
vi.mock("@/lib/auth/current-user", () => ({
  requireUser: (...args: unknown[]) => getUser(...args),
}));
vi.mock("@/lib/session/service", () => ({
  buildTeachingRuntime: (...args: unknown[]) =>
    buildTeachingRuntimeMock(...(args as [])),
}));
vi.mock("@/lib/conversation", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/conversation")>(
      "@/lib/conversation",
    );
  return {
    ...actual,
    runConversationTurn: (...args: unknown[]) =>
      runConversationTurnMock(...args),
  };
});

import { POST } from "./route";

const SESSION = "11111111-1111-1111-1111-111111111111";

function post(body: unknown): Request {
  return new Request("http://localhost/api/teaching/conversation", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const sampleReply = {
  intent: "WHY",
  answer: "Because cache is on the CPU die.",
  keyPoint: "Cache is closer, so it is faster.",
  followUpPrompt: null,
  source: "ai",
  grounded: false,
  citations: [],
  visual: null,
  visualIntent: null,
  visualRationale: null,
  misconceptionNoted: null,
};

describe("POST /api/teaching/conversation", () => {
  beforeEach(() => {
    runConversationTurnMock.mockReset();
    getUser.mockReset();
  });

  it("requires an authenticated user", async () => {
    getUser.mockResolvedValueOnce(
      err(new LumenError("UNAUTHORIZED", "Authentication required.")),
    );
    const res = await POST(post({ sessionId: SESSION, message: "why?" }));
    expect(res.status).toBe(401);
    expect(runConversationTurnMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid body", async () => {
    getUser.mockResolvedValueOnce(ok({ id: "u1", email: null }));
    const res = await POST(post({ sessionId: SESSION, message: "" }));
    expect(res.status).toBe(400);
    expect(runConversationTurnMock).not.toHaveBeenCalled();
  });

  it("returns 404 for a session the user does not own", async () => {
    getUser.mockResolvedValueOnce(ok({ id: "u1", email: null }));
    runConversationTurnMock.mockResolvedValueOnce(
      err(new SessionNotFoundError(SESSION)),
    );
    const res = await POST(
      post({ sessionId: SESSION, message: "why is cache faster?" }),
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(false);
  });

  it("passes only server-resolved identity to the service", async () => {
    getUser.mockResolvedValueOnce(ok({ id: "u1", email: null }));
    runConversationTurnMock.mockResolvedValueOnce(ok(sampleReply));
    const res = await POST(
      post({
        sessionId: SESSION,
        message: "why is cache faster?",
        // a malicious client trying to spoof identity / state:
        userId: "someone-else",
        masteryPoints: 100,
      }),
    );
    expect(res.status).toBe(200);
    const call = runConversationTurnMock.mock.calls[0];
    expect(call[0].userId).toBe("u1");
    expect(call[1]).toEqual({
      sessionId: SESSION,
      message: "why is cache faster?",
    });
    const body = (await res.json()) as { ok: boolean; reply: unknown };
    expect(body.ok).toBe(true);
    expect(body.reply).toEqual(sampleReply);
  });

  it("forwards a valid intent hint", async () => {
    getUser.mockResolvedValueOnce(ok({ id: "u1", email: null }));
    runConversationTurnMock.mockResolvedValueOnce(ok(sampleReply));
    await POST(
      post({ sessionId: SESSION, message: "help", intentHint: "EXAMPLE" }),
    );
    expect(runConversationTurnMock.mock.calls[0][1].intentHint).toBe("EXAMPLE");
  });
});

import { describe, expect, it, vi } from "vitest";

import { err, ok } from "@/lib/result";
import { LumenError } from "@/lib/errors";

const getUser = vi.fn();
const getKnowledgeGraphMock = vi.fn();

vi.mock("@/lib/db/server", () => ({
  getSupabaseServerClient: async () => ({}) as never,
}));
vi.mock("@/lib/auth/current-user", () => ({
  requireUser: (...args: unknown[]) => getUser(...args),
}));
vi.mock("@/lib/graph", () => ({
  getKnowledgeGraph: (...args: unknown[]) => getKnowledgeGraphMock(...args),
}));

import { GET } from "./route";

const emptyView = {
  scope: "all",
  nodes: [],
  edges: [],
  layerCount: 0,
  stats: {
    nodeCount: 0,
    edgeCount: 0,
    assessedCount: 0,
    misconceptionCount: 0,
    prerequisiteEdges: 0,
    averageMastery: null,
  },
  generatedAt: "now",
};

describe("GET /api/graph", () => {
  it("requires an authenticated user", async () => {
    getUser.mockResolvedValueOnce(
      err(new LumenError("UNAUTHORIZED", "Authentication required.")),
    );
    const res = await GET(new Request("http://localhost/api/graph"));
    expect(res.status).toBe(401);
    const body = (await res.json()) as { ok: boolean; error: { code: string } };
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("UNAUTHORIZED");
    expect(getKnowledgeGraphMock).not.toHaveBeenCalled();
  });

  it("rejects passing both lessonId and documentId", async () => {
    getUser.mockResolvedValueOnce(ok({ id: "u1", email: null }));
    const res = await GET(
      new Request(
        "http://localhost/api/graph?lessonId=11111111-1111-1111-1111-111111111111&documentId=22222222-2222-2222-2222-222222222222",
      ),
    );
    expect(res.status).toBe(400);
  });

  it("returns the graph for the authenticated user only", async () => {
    getUser.mockResolvedValueOnce(ok({ id: "u1", email: null }));
    getKnowledgeGraphMock.mockResolvedValueOnce(ok(emptyView));
    const res = await GET(new Request("http://localhost/api/graph"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; graph: unknown };
    expect(body.ok).toBe(true);
    expect(body.graph).toEqual(emptyView);
    expect(getKnowledgeGraphMock).toHaveBeenCalledWith({}, "u1", {
      lessonId: null,
      documentId: null,
    });
  });
});

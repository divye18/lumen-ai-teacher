import { beforeEach, describe, expect, it, vi } from "vitest";

import { err, ok } from "@/lib/result";
import { LumenError, ValidationError } from "@/lib/errors";

const getUser = vi.fn();
const createLessonForUserMock = vi.fn();
const resolveLessonCurriculumNodeMock = vi.fn();
const buildTeachingRuntimeMock = vi.fn(() => ({
  orchestrator: {},
  llm: null,
  retriever: null,
  llmConfigured: false,
  retrievalConfigured: false,
}));

vi.mock("@/lib/db/server", () => ({
  getSupabaseServerClient: async () => ({}) as never,
}));
vi.mock("@/lib/auth/current-user", () => ({
  requireUser: (...args: unknown[]) => getUser(...args),
}));
vi.mock("@/lib/db/repositories", () => ({
  createCurriculumStore: () => ({}) as never,
}));
vi.mock("@/lib/curriculum/validate-lesson-node", () => ({
  resolveLessonCurriculumNode: (...args: unknown[]) =>
    resolveLessonCurriculumNodeMock(...args),
}));
vi.mock("@/lib/session/service", () => ({
  buildTeachingRuntime: (...args: unknown[]) =>
    buildTeachingRuntimeMock(...(args as [])),
  createLessonForUser: (...args: unknown[]) => createLessonForUserMock(...args),
}));

import { POST } from "./route";

const USER = "11111111-1111-1111-1111-111111111111";
const NODE = "22222222-2222-2222-2222-222222222222";

function post(body: unknown): Request {
  return new Request("http://localhost/api/lessons", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const sampleLesson = {
  lessonId: "33333333-3333-3333-3333-333333333333",
  title: "Some topic",
  topic: "Some topic",
  objective: "Understand it.",
  language: "en",
  estimatedMinutes: 15,
  teachingStyle: null,
  sourceGrounded: false,
  planSource: "fallback",
  assessmentStrategy: "Ask a question.",
  concepts: [],
  citations: [],
};

describe("POST /api/lessons — curriculum provenance (18.3b)", () => {
  beforeEach(() => {
    getUser.mockReset();
    createLessonForUserMock.mockReset();
    resolveLessonCurriculumNodeMock.mockReset();
  });

  it("H. absent curriculumNodeId preserves existing behavior — no validation call, no provenance passed", async () => {
    getUser.mockResolvedValue(ok({ id: USER, email: null }));
    createLessonForUserMock.mockResolvedValue(ok(sampleLesson));

    const res = await POST(post({ topic: "Newton's Laws" }));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.ok).toBe(true);
    expect(resolveLessonCurriculumNodeMock).not.toHaveBeenCalled();
    expect(createLessonForUserMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ curriculumNodeId: null }),
    );
  });

  it("G. a valid curriculumNodeId is validated and threaded through to createLessonForUser", async () => {
    getUser.mockResolvedValue(ok({ id: USER, email: null }));
    resolveLessonCurriculumNodeMock.mockResolvedValue(ok(NODE));
    createLessonForUserMock.mockResolvedValue(ok(sampleLesson));

    const res = await POST(
      post({
        topic: "Units and Measurement — Introduction",
        curriculumNodeId: NODE,
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.ok).toBe(true);
    expect(resolveLessonCurriculumNodeMock).toHaveBeenCalledWith(
      expect.anything(),
      NODE,
    );
    expect(createLessonForUserMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ curriculumNodeId: NODE }),
    );
  });

  it("rejects the request when curriculum-node validation fails, without ever calling createLessonForUser", async () => {
    getUser.mockResolvedValue(ok({ id: USER, email: null }));
    resolveLessonCurriculumNodeMock.mockResolvedValue(
      err(new ValidationError("curriculumNodeId must reference a TOPIC node.")),
    );

    const res = await POST(
      post({
        topic: "Units and Measurement — Introduction",
        curriculumNodeId: NODE,
      }),
    );
    const body = await res.json();

    expect(res.ok).toBe(false);
    expect(body.ok).toBe(false);
    expect(createLessonForUserMock).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated request before touching curriculum validation", async () => {
    getUser.mockResolvedValue(
      err(new LumenError("UNAUTHORIZED", "Authentication required.")),
    );

    const res = await POST(post({ topic: "Anything", curriculumNodeId: NODE }));
    expect(res.status).toBe(401);
    expect(resolveLessonCurriculumNodeMock).not.toHaveBeenCalled();
    expect(createLessonForUserMock).not.toHaveBeenCalled();
  });
});

import { jsonError, jsonOk } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/current-user";
import { createCurriculumStore } from "@/lib/db/repositories";
import { getSupabaseServerClient } from "@/lib/db/server";
import { ValidationError } from "@/lib/errors";
import { resolveLessonCurriculumNode } from "@/lib/curriculum/validate-lesson-node";
import { createLessonRequestSchema } from "@/lib/session/requests";
import {
  buildTeachingRuntime,
  createLessonForUser,
} from "@/lib/session/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/lessons
 *
 * Body: { topic, documentId?, timeBudgetMinutes?, teachingStyle?, curriculumNodeId? }
 *
 * Plans a structured lesson (source-grounded when a documentId is given),
 * persists it, and returns the plan. A lesson plan MUST exist before a
 * teaching session can start.
 *
 * `curriculumNodeId` is optional provenance (Milestone 18.3b) — when
 * present it is validated server-side (never trusted as-is) against the
 * request-scoped, RLS-enforced `CurriculumStore` before being persisted.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const supabase = await getSupabaseServerClient();
    const user = await requireUser(supabase);
    if (!user.ok) return jsonError(user.error);

    const body: unknown = await request.json().catch(() => null);
    const parsed = createLessonRequestSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(
        new ValidationError("invalid lesson request", parsed.error.issues),
      );
    }

    let curriculumNodeId: string | null = null;
    if (parsed.data.curriculumNodeId) {
      const resolved = await resolveLessonCurriculumNode(
        createCurriculumStore(supabase),
        parsed.data.curriculumNodeId,
      );
      if (!resolved.ok) return jsonError(resolved.error);
      curriculumNodeId = resolved.value;
    }

    const runtime = buildTeachingRuntime(supabase, user.value.id);
    const result = await createLessonForUser(
      {
        db: supabase,
        llm: runtime.llm,
        retriever: runtime.retriever,
        userId: user.value.id,
      },
      {
        topic: parsed.data.topic,
        documentId: parsed.data.documentId ?? null,
        timeBudgetMinutes: parsed.data.timeBudgetMinutes ?? null,
        teachingStyle: parsed.data.teachingStyle ?? null,
        curriculumNodeId,
      },
    );
    if (!result.ok) return jsonError(result.error);

    return jsonOk(
      {
        lesson: result.value,
        llmConfigured: runtime.llmConfigured,
        retrievalConfigured: runtime.retrievalConfigured,
      },
      { status: 201 },
    );
  } catch (error) {
    return jsonError(error);
  }
}

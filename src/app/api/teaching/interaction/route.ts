import { jsonError, jsonOk } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/current-user";
import { getSupabaseServerClient } from "@/lib/db/server";
import { ValidationError } from "@/lib/errors";
import { submitInteractionRequestSchema } from "@/lib/session/requests";
import { buildTeachingRuntime } from "@/lib/session/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/teaching/interaction
 *
 * Body: { sessionId, questionId, answer, responseTimeMs? }
 *
 * The critical product loop: evaluate the answer → update learner state
 * (deterministically) → decide the adaptive next action. Returns the
 * evaluation, the learner-state delta, and the next decision.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const supabase = await getSupabaseServerClient();
    const user = await requireUser(supabase);
    if (!user.ok) return jsonError(user.error);

    const body: unknown = await request.json().catch(() => null);
    const parsed = submitInteractionRequestSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(
        new ValidationError("invalid interaction request", parsed.error.issues),
      );
    }

    const { orchestrator } = buildTeachingRuntime(supabase, user.value.id);
    const result = await orchestrator.submitAnswer({
      sessionId: parsed.data.sessionId,
      questionId: parsed.data.questionId,
      answerText: parsed.data.answer,
      responseTimeMs: parsed.data.responseTimeMs ?? null,
    });
    if (!result.ok) return jsonError(result.error);

    return jsonOk({ result: result.value });
  } catch (error) {
    return jsonError(error);
  }
}

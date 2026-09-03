import { jsonError, jsonOk } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/current-user";
import { getSupabaseServerClient } from "@/lib/db/server";
import { ValidationError } from "@/lib/errors";
import { nextStepRequestSchema } from "@/lib/session/requests";
import { buildTeachingRuntime } from "@/lib/session/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/teaching/step
 *
 * Body: { sessionId }
 *
 * Asks the Teaching Engine for the next action, renders it (teaching content
 * or a question), persists the decision, and returns it with the "visible
 * intelligence" adaptation narrative.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const supabase = await getSupabaseServerClient();
    const user = await requireUser(supabase);
    if (!user.ok) return jsonError(user.error);

    const body: unknown = await request.json().catch(() => null);
    const parsed = nextStepRequestSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(
        new ValidationError("invalid step request", parsed.error.issues),
      );
    }

    const { orchestrator } = buildTeachingRuntime(supabase, user.value.id);
    const result = await orchestrator.getNextStep({
      sessionId: parsed.data.sessionId,
    });
    if (!result.ok) return jsonError(result.error);

    return jsonOk({ step: result.value });
  } catch (error) {
    return jsonError(error);
  }
}

import { jsonError, jsonOk } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/current-user";
import { getSupabaseServerClient } from "@/lib/db/server";
import { ValidationError } from "@/lib/errors";
import { submitDiagnosticRequestSchema } from "@/lib/session/requests";
import { buildTeachingRuntime } from "@/lib/session/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/teaching/diagnostic
 *
 * Body: { sessionId, answers: { conceptKey, answer }[] } — the batch of
 * structured answers to the diagnostic question set the session already
 * returned (`SessionView.diagnostic.items`). Grades deterministically, seeds
 * initial mastery, and marks the diagnostic complete. Calling this again
 * after completion is safe — it replays the stored result rather than
 * re-grading or re-seeding.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const supabase = await getSupabaseServerClient();
    const user = await requireUser(supabase);
    if (!user.ok) return jsonError(user.error);

    const body: unknown = await request.json().catch(() => null);
    const parsed = submitDiagnosticRequestSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(
        new ValidationError("invalid diagnostic request", parsed.error.issues),
      );
    }

    const { orchestrator } = buildTeachingRuntime(supabase, user.value.id);
    const result = await orchestrator.submitDiagnostic(parsed.data);
    if (!result.ok) return jsonError(result.error);

    return jsonOk({ ...result.value });
  } catch (error) {
    return jsonError(error);
  }
}

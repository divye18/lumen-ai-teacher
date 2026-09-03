import { jsonError, jsonOk } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/current-user";
import { getSupabaseServerClient } from "@/lib/db/server";
import { ValidationError } from "@/lib/errors";
import { startSessionRequestSchema } from "@/lib/session/requests";
import { buildTeachingRuntime } from "@/lib/session/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/teaching/session
 *
 * Body: { lessonId } to start, or { sessionId } to resume.
 * Returns the session view with the current concept and mastery snapshot.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const supabase = await getSupabaseServerClient();
    const user = await requireUser(supabase);
    if (!user.ok) return jsonError(user.error);

    const body: unknown = await request.json().catch(() => null);
    const parsed = startSessionRequestSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(
        new ValidationError("invalid session request", parsed.error.issues),
      );
    }

    const { orchestrator, llmConfigured } = buildTeachingRuntime(
      supabase,
      user.value.id,
    );
    const result = await orchestrator.startOrResume({
      lessonId: parsed.data.lessonId,
      sessionId: parsed.data.sessionId,
      timeBudgetMinutes: parsed.data.timeBudgetMinutes ?? null,
    });
    if (!result.ok) return jsonError(result.error);

    return jsonOk({ session: result.value, llmConfigured });
  } catch (error) {
    return jsonError(error);
  }
}

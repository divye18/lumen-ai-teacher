import { jsonError, jsonOk } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/current-user";
import {
  conversationRequestSchema,
  runConversationTurn,
} from "@/lib/conversation";
import { getSupabaseServerClient } from "@/lib/db/server";
import { ValidationError } from "@/lib/errors";
import { buildTeachingRuntime } from "@/lib/session/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/teaching/conversation
 *
 * Body: { sessionId, message, intentHint? }
 *
 * The learner interrupts a teaching step with a question. Lumen infers the
 * educational intent, answers in context (source-grounded when the lesson has
 * material), optionally adapts the visual, and hands back to the lesson. The
 * lesson state machine is not advanced. Authoritative state (user, mastery,
 * lesson/concept ownership, misconceptions) is resolved server-side.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const supabase = await getSupabaseServerClient();
    const user = await requireUser(supabase);
    if (!user.ok) return jsonError(user.error);

    const body: unknown = await request.json().catch(() => null);
    const parsed = conversationRequestSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(
        new ValidationError(
          "invalid conversation request",
          parsed.error.issues,
        ),
      );
    }

    const { llm, retriever } = buildTeachingRuntime(supabase, user.value.id);
    const result = await runConversationTurn(
      { db: supabase, userId: user.value.id, llm, retriever },
      parsed.data,
    );
    if (!result.ok) return jsonError(result.error);

    return jsonOk({ reply: result.value });
  } catch (error) {
    return jsonError(error);
  }
}

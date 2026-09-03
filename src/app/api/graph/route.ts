import { z } from "zod";

import { jsonError, jsonOk } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/current-user";
import { getSupabaseServerClient } from "@/lib/db/server";
import { uuidSchema } from "@/lib/db/schemas";
import { ValidationError } from "@/lib/errors";
import { getKnowledgeGraph } from "@/lib/graph";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z
  .object({
    lessonId: uuidSchema.optional(),
    documentId: uuidSchema.optional(),
  })
  .refine((v) => !(v.lessonId && v.documentId), {
    message: "Pass at most one of lessonId / documentId.",
  });

/**
 * GET /api/graph[?lessonId=|documentId=]
 *
 * The authenticated user's learner-aware knowledge graph. RLS + the ownership
 * checks inside `getKnowledgeGraph` guarantee one user never sees another's
 * concepts. No scope param → the whole graph.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const supabase = await getSupabaseServerClient();
    const user = await requireUser(supabase);
    if (!user.ok) return jsonError(user.error);

    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      lessonId: url.searchParams.get("lessonId") ?? undefined,
      documentId: url.searchParams.get("documentId") ?? undefined,
    });
    if (!parsed.success) {
      return jsonError(
        new ValidationError("invalid graph query", parsed.error.issues),
      );
    }

    const result = await getKnowledgeGraph(supabase, user.value.id, {
      lessonId: parsed.data.lessonId ?? null,
      documentId: parsed.data.documentId ?? null,
    });
    if (!result.ok) return jsonError(result.error);

    return jsonOk({ graph: result.value });
  } catch (error) {
    return jsonError(error);
  }
}

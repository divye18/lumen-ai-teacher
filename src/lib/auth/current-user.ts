import "server-only";

import type { LumenServerClient } from "@/lib/db/server";
import { LumenError } from "@/lib/errors";
import { err, ok, type Result } from "@/lib/result";

export interface CurrentUser {
  id: string;
  email: string | null;
}

/**
 * Resolve the authenticated user from a request-scoped Supabase client.
 *
 * `auth.getUser()` validates the JWT against the auth server, so the returned
 * id is trustworthy. Ownership in every RAG operation derives from this — a
 * client-supplied `user_id` is never trusted.
 */
export async function requireUser(
  client: LumenServerClient,
): Promise<Result<CurrentUser>> {
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) {
    return err(
      new LumenError("UNAUTHORIZED", "Authentication required.", {
        recoverable: true,
      }),
    );
  }
  return ok({ id: data.user.id, email: data.user.email ?? null });
}

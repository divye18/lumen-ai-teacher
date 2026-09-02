import type { PostgrestError } from "@supabase/supabase-js";
import type { z } from "zod";

import { LumenError, ValidationError } from "@/lib/errors";
import { err, ok, type Result } from "@/lib/result";

import type { LumenSupabaseClient } from "../client";

/**
 * Repositories accept any typed Supabase client — the request-scoped server
 * client (RLS as the user) or the admin client (trusted server tasks).
 */
export type DbClient = LumenSupabaseClient;

/** Map a Supabase/PostgREST error into a recoverable {@link LumenError}. */
export function fromPostgrestError(error: PostgrestError): LumenError {
  const code = error.code === "PGRST116" ? "NOT_FOUND" : "PROVIDER_ERROR";
  return new LumenError(code, `Database error: ${error.message}`, {
    recoverable: true,
    cause: error,
  });
}

/** Wrap a single-row query result. */
export function rowResult<T>(res: {
  data: T | null;
  error: PostgrestError | null;
}): Result<T> {
  if (res.error) return err(fromPostgrestError(res.error));
  if (res.data === null) {
    return err(
      new LumenError("NOT_FOUND", "Row not found.", { recoverable: true }),
    );
  }
  return ok(res.data);
}

/** Wrap a multi-row query result. */
export function listResult<T>(res: {
  data: T[] | null;
  error: PostgrestError | null;
}): Result<T[]> {
  if (res.error) return err(fromPostgrestError(res.error));
  return ok(res.data ?? []);
}

/** Validate input with a Zod schema, returning a {@link ValidationError} on failure. */
export function parseInput<S extends z.ZodTypeAny>(
  schema: S,
  input: unknown,
): Result<z.infer<S>, ValidationError> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return err(
      new ValidationError(
        "Repository input failed validation.",
        parsed.error.issues,
      ),
    );
  }
  return ok(parsed.data);
}

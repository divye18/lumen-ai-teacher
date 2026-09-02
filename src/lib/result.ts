import type { LumenError } from "./errors";

/**
 * A minimal Result type for operations whose failure is expected and
 * recoverable (provider calls, validation, retrieval). Reserve `throw` for
 * genuinely exceptional, non-recoverable situations.
 */
export type Result<T, E = LumenError> =
  { ok: true; value: T } | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

export function isOk<T, E>(
  result: Result<T, E>,
): result is { ok: true; value: T } {
  return result.ok;
}

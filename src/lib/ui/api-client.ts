/**
 * Tiny client-side fetch wrapper for Lumen's JSON API.
 *
 * The server always answers `{ ok: true, ... }` or
 * `{ ok: false, error: { code, message } }` (see `@/lib/api/http`). This
 * normalises both into a discriminated result and surfaces a human message —
 * never a stack trace.
 */

export interface ApiError {
  code: string;
  message: string;
  status: number;
}

export type ApiResult<T> =
  { ok: true; data: T } | { ok: false; error: ApiError };

const FRIENDLY: Record<string, string> = {
  UNAUTHORIZED: "Your session has expired. Please sign in again.",
  CONFIG_MISSING: "Lumen isn't fully configured yet. Add the missing API keys.",
  PROVIDER_NOT_CONFIGURED:
    "This step needs an AI provider that isn't configured yet.",
  EMBEDDING_ERROR: "The embedding service is unavailable right now.",
  RETRIEVAL_ERROR: "Couldn't search your material right now.",
  AI_GENERATION_FAILED: "The AI service didn't respond. Try again in a moment.",
  MALFORMED_AI_OUTPUT: "The AI response couldn't be used. Try again.",
  UNSUPPORTED_DOCUMENT_TYPE: "That file type isn't supported — upload a PDF.",
  DOCUMENT_TOO_LARGE: "That file is too large.",
  EMPTY_DOCUMENT: "No readable text was found in that document.",
  TEXT_EXTRACTION_FAILED: "That PDF couldn't be read.",
  SESSION_NOT_FOUND: "This learning session couldn't be found.",
  LESSON_NOT_FOUND: "This lesson couldn't be found.",
  PERSISTENCE_FAILED: "Couldn't save your progress. Try again.",
  RATE_LIMITED: "Too many requests — give it a moment.",
};

export async function apiFetch<T>(
  input: string,
  init?: RequestInit,
): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(input, {
      ...init,
      headers: {
        ...(init?.body && !(init.body instanceof FormData)
          ? { "content-type": "application/json" }
          : {}),
        ...init?.headers,
      },
    });
  } catch {
    return {
      ok: false,
      error: {
        code: "NETWORK",
        message: "Couldn't reach Lumen. Check your connection.",
        status: 0,
      },
    };
  }

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON */
  }

  if (res.ok && body && typeof body === "object" && "ok" in body) {
    const b = body as { ok: boolean };
    if (b.ok) return { ok: true, data: body as T };
  }

  const errObj =
    body && typeof body === "object" && "error" in body
      ? (body as { error?: { code?: string; message?: string } }).error
      : undefined;
  const code = errObj?.code ?? "UNKNOWN";
  return {
    ok: false,
    error: {
      code,
      message: FRIENDLY[code] ?? errObj?.message ?? "Something went wrong.",
      status: res.status,
    },
  };
}

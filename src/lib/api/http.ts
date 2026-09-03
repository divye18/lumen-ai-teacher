import "server-only";

import { NextResponse } from "next/server";

import { serverConfig } from "@/config/server";
import { LumenError, type LumenErrorCode } from "@/lib/errors";

/**
 * Thin HTTP helpers for route handlers. Routes stay declarative: authenticate,
 * validate, call a lib service, hand the `Result` here.
 */

const STATUS_BY_CODE: Record<LumenErrorCode, number> = {
  CONFIG_MISSING: 503,
  PROVIDER_NOT_CONFIGURED: 503,
  PROVIDER_ERROR: 502,
  VALIDATION_FAILED: 400,
  NOT_IMPLEMENTED: 501,
  NOT_FOUND: 404,
  UNAUTHORIZED: 401,
  RATE_LIMITED: 429,
  UNKNOWN: 500,
  UNSUPPORTED_DOCUMENT_TYPE: 415,
  DOCUMENT_TOO_LARGE: 413,
  EMPTY_DOCUMENT: 422,
  TEXT_EXTRACTION_FAILED: 422,
  EMBEDDING_ERROR: 502,
  RETRIEVAL_ERROR: 502,
};

export function jsonOk(
  data: Record<string, unknown>,
  init?: ResponseInit,
): NextResponse {
  return NextResponse.json({ ok: true, ...data }, init);
}

/**
 * Serialise any error to a safe JSON body. Known {@link LumenError}s expose
 * their stable `code` and message; anything else becomes a generic 500 and the
 * detail is logged server-side only (never in the response, never in prod
 * stack traces).
 */
export function jsonError(error: unknown): NextResponse {
  if (error instanceof LumenError) {
    return NextResponse.json(
      { ok: false, error: { code: error.code, message: error.message } },
      { status: STATUS_BY_CODE[error.code] ?? 500 },
    );
  }

  if (serverConfig.isProduction) {
    console.error("[api] unhandled error");
  } else {
    console.error("[api] unhandled error", error);
  }
  return NextResponse.json(
    {
      ok: false,
      error: { code: "UNKNOWN", message: "Internal server error." },
    },
    { status: 500 },
  );
}

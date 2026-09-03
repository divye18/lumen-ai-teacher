/**
 * Explicit, recoverable error types.
 *
 * Principle 14: errors should be explicit and recoverable. Every error carries
 * a stable `code` so callers can branch and degrade gracefully rather than
 * pattern-matching on message strings.
 */

export type LumenErrorCode =
  | "CONFIG_MISSING"
  | "PROVIDER_NOT_CONFIGURED"
  | "PROVIDER_ERROR"
  | "VALIDATION_FAILED"
  | "NOT_IMPLEMENTED"
  | "NOT_FOUND"
  | "UNAUTHORIZED"
  | "RATE_LIMITED"
  | "UNKNOWN"
  // RAG / ingestion / retrieval
  | "UNSUPPORTED_DOCUMENT_TYPE"
  | "DOCUMENT_TOO_LARGE"
  | "EMPTY_DOCUMENT"
  | "TEXT_EXTRACTION_FAILED"
  | "EMBEDDING_ERROR"
  | "RETRIEVAL_ERROR"
  // Teaching engine / AI generation / sessions
  | "AI_GENERATION_FAILED"
  | "MALFORMED_AI_OUTPUT"
  | "SESSION_NOT_FOUND"
  | "LESSON_NOT_FOUND"
  | "PERSISTENCE_FAILED";

export class LumenError extends Error {
  readonly code: LumenErrorCode;
  /** Whether the caller can reasonably retry or degrade and continue. */
  readonly recoverable: boolean;
  readonly cause?: unknown;

  constructor(
    code: LumenErrorCode,
    message: string,
    options: { recoverable?: boolean; cause?: unknown } = {},
  ) {
    super(message);
    this.name = "LumenError";
    this.code = code;
    this.recoverable = options.recoverable ?? false;
    this.cause = options.cause;
  }
}

/** A dependency (provider, integration) has not been configured yet. */
export class ProviderNotConfiguredError extends LumenError {
  constructor(provider: string) {
    super(
      "PROVIDER_NOT_CONFIGURED",
      `The "${provider}" provider is not configured. Set the relevant environment variables and register an implementation.`,
      { recoverable: true },
    );
    this.name = "ProviderNotConfiguredError";
  }
}

/** Reached code that is intentionally not built during the foundation phase. */
export class NotImplementedError extends LumenError {
  constructor(what: string) {
    super("NOT_IMPLEMENTED", `${what} is not implemented yet.`, {
      recoverable: false,
    });
    this.name = "NotImplementedError";
  }
}

/** Schema validation of an input or of AI output failed. */
export class ValidationError extends LumenError {
  readonly issues: unknown;
  constructor(message: string, issues?: unknown) {
    super("VALIDATION_FAILED", message, { recoverable: true });
    this.name = "ValidationError";
    this.issues = issues;
  }
}

/** The LLM call itself failed (network, provider HTTP error, timeout). */
export class AiGenerationError extends LumenError {
  constructor(message: string, options: { cause?: unknown } = {}) {
    super("AI_GENERATION_FAILED", `AI generation failed: ${message}`, {
      recoverable: true,
      cause: options.cause,
    });
    this.name = "AiGenerationError";
  }
}

/** The LLM returned output that never satisfied the required schema. */
export class MalformedAiOutputError extends LumenError {
  readonly issues: unknown;
  constructor(message: string, issues?: unknown) {
    super("MALFORMED_AI_OUTPUT", `Malformed AI output: ${message}`, {
      recoverable: true,
    });
    this.name = "MalformedAiOutputError";
    this.issues = issues;
  }
}

export class SessionNotFoundError extends LumenError {
  constructor(sessionId: string) {
    super("SESSION_NOT_FOUND", `Learning session ${sessionId} was not found.`, {
      recoverable: false,
    });
    this.name = "SessionNotFoundError";
  }
}

export class LessonNotFoundError extends LumenError {
  constructor(lessonId: string) {
    super("LESSON_NOT_FOUND", `Lesson ${lessonId} was not found.`, {
      recoverable: false,
    });
    this.name = "LessonNotFoundError";
  }
}

/** A write to the database failed after validation passed. */
export class PersistenceError extends LumenError {
  constructor(message: string, options: { cause?: unknown } = {}) {
    super("PERSISTENCE_FAILED", `Persistence failed: ${message}`, {
      recoverable: true,
      cause: options.cause,
    });
    this.name = "PersistenceError";
  }
}

import { visualDirectiveSchema, type VisualDirective } from "@/types/visuals";
import { ValidationError } from "@/lib/errors";
import { err, ok, type Result } from "@/lib/result";

/**
 * Visual directive validation.
 *
 * Principle 16/17: raw LLM output must never directly control the frontend.
 * All visual instructions pass through here first. On failure we degrade to a
 * plain TEXT directive rather than throwing, so a lesson can always continue.
 */
export function validateVisualDirective(
  input: unknown,
): Result<VisualDirective, ValidationError> {
  const parsed = visualDirectiveSchema.safeParse(input);
  if (!parsed.success) {
    return err(
      new ValidationError(
        "Visual directive failed schema validation.",
        parsed.error.issues,
      ),
    );
  }
  return ok(parsed.data);
}

/** A safe fallback directive: show the caption as text and nothing else. */
export function textFallback(caption: string): VisualDirective {
  return { mode: "TEXT", caption: caption.slice(0, 2_000) };
}

/**
 * Validate, or degrade gracefully to a TEXT directive. Never throws.
 */
export function coerceVisualDirective(
  input: unknown,
  fallbackCaption = "",
): VisualDirective {
  const result = validateVisualDirective(input);
  return result.ok ? result.value : textFallback(fallbackCaption);
}

export { visualDirectiveSchema, type VisualDirective };

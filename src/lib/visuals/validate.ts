import { visualDirectiveSchema, type VisualDirective } from "@/types/visuals";
import { ValidationError } from "@/lib/errors";
import { err, ok, type Result } from "@/lib/result";

/**
 * THE single visual-directive validation boundary.
 *
 * Raw / generated visual instructions must pass through here before any
 * renderer touches them. On failure we degrade to a plain TEXT directive
 * rather than throwing — a lesson can always continue.
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

/** Validate, or degrade gracefully to a TEXT directive. Never throws. */
export function coerceVisualDirective(
  input: unknown,
  fallbackCaption = "",
): VisualDirective {
  const result = validateVisualDirective(input);
  return result.ok ? result.value : textFallback(fallbackCaption);
}

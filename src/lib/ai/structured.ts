import type { z } from "zod";

import { AiGenerationError, MalformedAiOutputError } from "@/lib/errors";
import { err, ok, type Result } from "@/lib/result";

import type { ChatMessage, LLMProvider } from "./types";

/**
 * Structured generation: call the LLM, coerce its text into JSON, validate it
 * against a Zod schema, and repair-retry once on failure.
 *
 * Nothing downstream ever sees raw model text — only a validated `T`. Model
 * output is never trusted; malformed output after retries is a recoverable
 * {@link MalformedAiOutputError}.
 */

export interface StructuredRequest<T> {
  provider: LLMProvider;
  schema: z.ZodType<T>;
  system: string;
  user: string;
  temperature?: number;
  maxOutputTokens?: number;
  /** Extra repair attempts after the first failure (default 1). */
  maxRepairAttempts?: number;
  signal?: AbortSignal;
}

export interface StructuredResult<T> {
  value: T;
  model: string;
  /** True when a repair attempt (not the first response) produced the value. */
  repaired: boolean;
}

/**
 * Best-effort extraction of a single JSON object from arbitrary model text:
 * direct parse → fenced ```json block → first balanced `{…}` span.
 */
export function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    // fall through
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      // fall through
    }
  }

  const start = trimmed.indexOf("{");
  if (start === -1) return undefined;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < trimmed.length; i += 1) {
    const ch = trimmed[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(trimmed.slice(start, i + 1));
        } catch {
          return undefined;
        }
      }
    }
  }
  return undefined;
}

export async function generateStructured<T>(
  req: StructuredRequest<T>,
): Promise<Result<StructuredResult<T>>> {
  const maxRepairAttempts = req.maxRepairAttempts ?? 1;
  const messages: ChatMessage[] = [
    { role: "system", content: req.system },
    { role: "user", content: req.user },
  ];

  let lastIssues: unknown;

  for (let attempt = 0; attempt <= maxRepairAttempts; attempt += 1) {
    const generated = await req.provider.generate({
      messages,
      temperature: req.temperature,
      maxOutputTokens: req.maxOutputTokens,
      signal: req.signal,
    });
    if (!generated.ok) {
      // A transport failure is not going to be fixed by repeating; surface it.
      return err(
        generated.error instanceof AiGenerationError
          ? generated.error
          : new AiGenerationError(generated.error.message, {
              cause: generated.error,
            }),
      );
    }

    const raw = generated.value.text;
    const candidate = extractJsonObject(raw);
    const parsed = req.schema.safeParse(candidate);
    if (parsed.success) {
      return ok({
        value: parsed.data,
        model: generated.value.model,
        repaired: attempt > 0,
      });
    }

    lastIssues = parsed.error.issues;
    messages.push({ role: "assistant", content: raw.slice(0, 4000) });
    messages.push({
      role: "user",
      content:
        "That response was not valid for the required schema. " +
        `Problems: ${JSON.stringify(parsed.error.issues).slice(0, 1200)}. ` +
        "Reply again with ONLY a single valid JSON object matching the schema — " +
        "no prose, no markdown, no code fences.",
    });
  }

  return err(
    new MalformedAiOutputError(
      `output never matched the schema after ${maxRepairAttempts + 1} attempts`,
      lastIssues,
    ),
  );
}

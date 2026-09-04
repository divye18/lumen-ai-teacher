import { NextResponse } from "next/server";

import { jsonError } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/current-user";
import { getSupabaseServerClient } from "@/lib/db/server";
import { ProviderNotConfiguredError, ValidationError } from "@/lib/errors";
import { getConfiguredTextToSpeech } from "@/lib/voice";
import { speakRequestSchema } from "@/lib/voice/requests";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/voice/speak
 *
 * Body: { text: string, voice?: string, language?: string }
 *
 * Speaks TEXT ALREADY APPROVED by the teaching engine — this route never
 * generates content, it only converts existing text to audio. Returns raw
 * audio bytes (not JSON — there is no learner-safe way to encode audio as
 * `{ ok, data }`). 503 when no cloud TTS provider is configured; the client
 * falls back to browser `speechSynthesis`, never a hard failure.
 *
 * Never persists the generated audio. Never exposes the provider API key.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const supabase = await getSupabaseServerClient();
    const user = await requireUser(supabase);
    if (!user.ok) return jsonError(user.error);

    const body: unknown = await request.json().catch(() => null);
    const parsed = speakRequestSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(
        new ValidationError("invalid speak request", parsed.error.issues),
      );
    }

    const tts = getConfiguredTextToSpeech();
    if (!tts) {
      // Recoverable by design — the client treats this exactly like "no
      // cloud provider" and speaks with the browser instead.
      return jsonError(new ProviderNotConfiguredError("text-to-speech"));
    }

    const result = await tts.synthesize({
      text: parsed.data.text,
      voice: parsed.data.voice,
      // Passed through the existing `SynthesizeOptions.language` field.
      // Whether a given TTS provider actually honours it is up to the
      // provider adapter — this route never invents provider behaviour.
      language: parsed.data.language,
    });
    if (!result.ok) return jsonError(result.error);

    return new NextResponse(result.value.audio, {
      status: 200,
      headers: {
        "content-type": result.value.mimeType,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}

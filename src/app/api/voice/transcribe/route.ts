import { jsonError, jsonOk } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/current-user";
import { getSupabaseServerClient } from "@/lib/db/server";
import { ProviderNotConfiguredError, ValidationError } from "@/lib/errors";
import { getConfiguredSpeechToText } from "@/lib/voice";
import {
  MAX_TRANSCRIBE_AUDIO_BYTES,
  isAcceptedAudioMimeType,
} from "@/lib/voice/requests";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/voice/transcribe
 *
 * multipart/form-data:
 *   audio    — the recorded answer, a short clip (required)
 *   language — BCP-47 tag, already resolved from `session.language` (optional)
 *
 * Returns ONLY the transcript text — no provider metadata, no confidence
 * score, no language tag beyond what the client already knows it asked for.
 * The raw audio is held only for the duration of this request: it is never
 * written to Supabase, never logged, and never persisted anywhere. The
 * transcript itself only becomes part of the learner's record if and when
 * they submit it as an answer through the EXISTING interaction endpoint —
 * this route does not touch learner state.
 *
 * 503 when no cloud STT provider is configured; the client falls back to
 * browser `SpeechRecognition`, never a hard failure.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const supabase = await getSupabaseServerClient();
    const user = await requireUser(supabase);
    if (!user.ok) return jsonError(user.error);

    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (
      Number.isFinite(contentLength) &&
      contentLength > MAX_TRANSCRIBE_AUDIO_BYTES * 1.1
    ) {
      return jsonError(new ValidationError("audio clip is too large"));
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return jsonError(
        new ValidationError(
          "expected multipart/form-data with an 'audio' field",
        ),
      );
    }

    const file = form.get("audio");
    if (!(file instanceof File)) {
      return jsonError(new ValidationError("form field 'audio' is required"));
    }
    if (!isAcceptedAudioMimeType(file.type)) {
      return jsonError(
        new ValidationError(`unsupported audio format: "${file.type}"`),
      );
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength === 0) {
      return jsonError(new ValidationError("audio clip is empty"));
    }
    if (bytes.byteLength > MAX_TRANSCRIBE_AUDIO_BYTES) {
      return jsonError(new ValidationError("audio clip is too large"));
    }

    const stt = getConfiguredSpeechToText();
    if (!stt) {
      return jsonError(new ProviderNotConfiguredError("speech-to-text"));
    }

    // Optional BCP-47 tag, already resolved from `session.language` by the
    // client — this route never infers language from anything else.
    const languageField = form.get("language");
    const language =
      typeof languageField === "string" && languageField.trim().length > 0
        ? languageField.trim().slice(0, 20)
        : undefined;

    const result = await stt.transcribe({
      audio: bytes.buffer as ArrayBuffer,
      mimeType: file.type,
      language,
    });
    if (!result.ok) return jsonError(result.error);

    // ONLY the transcript text crosses back to the client — no confidence
    // score, no provider id, nothing else the provider returned.
    return jsonOk({ transcript: result.value.text });
  } catch (error) {
    return jsonError(error);
  }
}

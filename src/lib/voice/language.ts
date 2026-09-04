/**
 * SESSION LANGUAGE → VOICE LOCALE.
 *
 * `session.language` (`"en" | "hi" | "hinglish"`, see `SUPPORTED_LANGUAGES` in
 * `@/lib/db/enums`) is the ONLY source of truth for which language voice
 * should speak/recognize — never the learner's transcript, browser locale, or
 * UI locale. This is the single place that mapping happens; every adapter
 * factory and API route receives the already-resolved BCP-47 tag rather than
 * re-deriving it.
 *
 * Deliberately not typed against `SupportedLanguage` — this module stays
 * decoupled from the DB enum so it has no server/db import at all and can be
 * used from client code unchanged.
 */

/** en-US / hi-IN today; unknown or missing input safely defaults to en-US. */
export const DEFAULT_VOICE_LOCALE = "en-US";

const VOICE_LOCALE_BY_SESSION_LANGUAGE: Record<string, string> = {
  en: "en-US",
  hi: "hi-IN",
  hinglish: "hi-IN",
};

export function mapSessionLanguageToVoiceLocale(
  sessionLanguage: string | null | undefined,
): string {
  if (!sessionLanguage) return DEFAULT_VOICE_LOCALE;
  return (
    VOICE_LOCALE_BY_SESSION_LANGUAGE[sessionLanguage] ?? DEFAULT_VOICE_LOCALE
  );
}

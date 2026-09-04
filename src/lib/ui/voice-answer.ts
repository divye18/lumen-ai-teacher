/**
 * VOICE TRANSCRIPT → ANSWER FIELD.
 *
 * The exact merge rule the Question panel uses when a completed spoken
 * utterance arrives: it's appended to whatever the learner has already typed
 * (never overwrites), and a silent/whitespace-only transcript never touches
 * the field at all — voice can only ever add to what's there, never fabricate
 * an answer or clobber one already in progress. Pure so the rule is verifiable
 * without a browser/mic.
 */
export function mergeVoiceTranscript(
  currentAnswer: string,
  transcript: string,
): string | null {
  const clean = transcript.trim();
  if (clean.length === 0) return null;
  const prev = currentAnswer.trim();
  return prev.length > 0 ? `${prev} ${clean}` : clean;
}

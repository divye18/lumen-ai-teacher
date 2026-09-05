/**
 * Compose the lesson `topic` string sent to the existing `POST /api/lessons`
 * endpoint when a student starts learning from a Curriculum Explorer topic.
 *
 * A bare topic title (e.g. "Introduction") is often ambiguous on its own —
 * the deterministic lesson-planning fallback would turn it into the entire
 * lesson content verbatim with zero context. Prefixing the chapter title
 * disambiguates it while staying well within `createLessonRequestSchema`'s
 * 200-character limit.
 */
export function composeCurriculumTopic(
  chapterTitle: string,
  topicTitle: string,
): string {
  return `${chapterTitle.trim()} — ${topicTitle.trim()}`;
}

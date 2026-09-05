"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/ui/api-client";
import { composeCurriculumTopic } from "@/lib/curriculum/compose-topic";

interface CreateLessonResponse {
  ok: true;
  lesson: { lessonId: string };
}

interface StartSessionResponse {
  ok: true;
  session: { sessionId: string };
}

export interface CurriculumTopicData {
  id: string;
  title: string;
}

/**
 * Terminal NCERT Curriculum Explorer screen (Milestone 18.2). Turns a
 * selected topic into an actual lesson + teaching session via the existing,
 * completely unchanged `/api/lessons` -> `/api/teaching/session` pipeline —
 * the same two-call pattern `LessonPlanView` already uses to start a
 * planned lesson. No new teaching engine, no curriculum-specific Teaching
 * Room behavior: the orchestrator never learns this session came from the
 * Curriculum Explorer.
 */
export function CurriculumTopicList({
  chapterTitle,
  topics,
}: {
  chapterTitle: string;
  topics: CurriculumTopicData[];
}) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [startingId, setStartingId] = useState<string | null>(null);
  const [errorById, setErrorById] = useState<Record<string, string>>({});
  /**
   * A ref (not just the `startingId` state) guards against a double-click
   * landing before React commits the re-render that disables the button —
   * two clicks dispatched in the same tick both read the same stale state.
   * This is a plain same-component in-flight flag, not a cross-request lock.
   */
  const inFlight = useRef(false);

  async function startLearning(topic: CurriculumTopicData) {
    if (inFlight.current) return;
    inFlight.current = true;
    setStartingId(topic.id);
    setErrorById((prev) => ({ ...prev, [topic.id]: "" }));

    const lessonRes = await apiFetch<CreateLessonResponse>("/api/lessons", {
      method: "POST",
      body: JSON.stringify({
        topic: composeCurriculumTopic(chapterTitle, topic.title),
      }),
    });
    if (!lessonRes.ok) {
      setErrorById((prev) => ({
        ...prev,
        [topic.id]: lessonRes.error.message,
      }));
      setStartingId(null);
      inFlight.current = false;
      return;
    }

    const sessionRes = await apiFetch<StartSessionResponse>(
      "/api/teaching/session",
      {
        method: "POST",
        body: JSON.stringify({ lessonId: lessonRes.data.lesson.lessonId }),
      },
    );
    if (!sessionRes.ok) {
      setErrorById((prev) => ({
        ...prev,
        [topic.id]: sessionRes.error.message,
      }));
      setStartingId(null);
      inFlight.current = false;
      return;
    }

    router.push(`/learn/${sessionRes.data.session.sessionId}`);
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {topics.map((topic, index) => {
        const starting = startingId === topic.id;
        const error = errorById[topic.id];
        return (
          <motion.div
            key={topic.id}
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: reduce ? 0 : index * 0.03 }}
            className="flex h-full flex-col justify-between rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
          >
            <div>
              <p className="text-[14px] font-medium text-[var(--color-ink)]">
                {topic.title}
              </p>
              <Badge className="mt-1.5" tone="neutral">
                Topic {index + 1} of {topics.length}
              </Badge>
            </div>

            <div className="mt-4">
              <Button
                onClick={() => startLearning(topic)}
                loading={starting}
                disabled={startingId !== null && !starting}
                size="sm"
                className="w-full"
              >
                Start learning
              </Button>
              {error ? (
                <p
                  role="alert"
                  className="mt-2 text-[12px] text-[var(--color-danger)]"
                >
                  {error}
                </p>
              ) : null}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

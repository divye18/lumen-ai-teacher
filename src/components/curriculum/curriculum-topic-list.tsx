"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/surface";
import {
  type LearningModeId,
  ModeSelector,
} from "@/components/curriculum/mode-selector";
import { apiFetch } from "@/lib/ui/api-client";
import { composeCurriculumTopic } from "@/lib/curriculum/compose-topic";
import { cardEntrance, cardHover, sectionEntrance } from "@/lib/ui/motion";
import type { TopicStatus } from "@/lib/curriculum/topic-progress";
import { cn } from "@/lib/ui/cn";

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
  /** Curriculum ENGAGEMENT progress (18.3d) — never mastery. Defaults to
   * NOT_STARTED if the caller doesn't have it (keeps this component usable
   * without forcing every call site to compute status). */
  status?: TopicStatus;
}

export const STATUS_BADGE: Record<
  TopicStatus,
  { tone: "neutral" | "accent" | "positive"; label: string }
> = {
  NOT_STARTED: { tone: "neutral", label: "Not started" },
  IN_PROGRESS: { tone: "accent", label: "In progress" },
  COMPLETED: { tone: "positive", label: "Completed" },
};

export function ctaLabel(status: TopicStatus): string {
  if (status === "COMPLETED") return "Review topic";
  if (status === "IN_PROGRESS") return "Continue learning";
  return "Start learning";
}

/**
 * Terminal NCERT Curriculum Explorer screen (Milestone 18.2, status/CTA
 * evolved in 19.2). Turns a selected topic into an actual lesson + teaching
 * session via the existing, completely unchanged `/api/lessons` ->
 * `/api/teaching/session` pipeline — the same two-call pattern
 * `LessonPlanView` already uses to start a planned lesson. No new teaching
 * engine, no curriculum-specific Teaching Room behavior: the orchestrator
 * never learns this session came from the Curriculum Explorer.
 *
 * `status` (18.3d curriculum ENGAGEMENT progress) only changes the visible
 * badge/CTA label — it never changes the request payload or the two-call
 * sequence itself, and it is never mastery (see `curriculum-progress.tsx`
 * for why those two signals are deliberately rendered differently).
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
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [modeByTopic, setModeByTopic] = useState<
    Record<string, LearningModeId>
  >({});
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
        curriculumNodeId: topic.id,
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
        const status = topic.status ?? "NOT_STARTED";
        const statusBadge = STATUS_BADGE[status];
        const entrance = cardEntrance(index);
        const expanded = expandedId === topic.id;
        const selectedMode = modeByTopic[topic.id] ?? "explain";

        return (
          <motion.div
            key={topic.id}
            initial={reduce ? false : entrance.initial}
            animate={entrance.animate}
            transition={entrance.transition}
            whileHover={reduce ? undefined : cardHover}
          >
            <Panel
              variant="elevated"
              className={cn(
                "flex h-full flex-col justify-between gap-4 p-5",
                status === "IN_PROGRESS" &&
                  "border-[color-mix(in_oklab,var(--color-learning)_35%,var(--color-border))]",
                status === "COMPLETED" &&
                  "border-[color-mix(in_oklab,var(--color-positive)_28%,var(--color-border))]",
              )}
            >
              {/* Hierarchy: title -> status -> mode choice -> primary
                  action. The mode toggle is a distinct, smaller control so
                  it never competes with the title for visual weight. */}
              <div>
                <p className="text-[length:var(--text-subtitle)] font-semibold tracking-tight text-[var(--color-ink)]">
                  {topic.title}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <Badge tone="neutral">
                    Topic {index + 1} of {topics.length}
                  </Badge>
                  <Badge tone={statusBadge.tone} dot>
                    {statusBadge.label}
                  </Badge>
                </div>
              </div>

              <div>
                <button
                  type="button"
                  onClick={() =>
                    setExpandedId((prev) =>
                      prev === topic.id ? null : topic.id,
                    )
                  }
                  aria-expanded={expanded}
                  className="flex items-center gap-1 text-[length:var(--text-meta)] font-medium text-[var(--color-ink-muted)] transition-colors hover:text-[var(--color-ink)]"
                >
                  <motion.svg
                    aria-hidden
                    viewBox="0 0 12 12"
                    className="size-3"
                    animate={{ rotate: expanded ? 90 : 0 }}
                    transition={{ duration: reduce ? 0 : 0.15 }}
                  >
                    <path
                      d="M4 2l4 4-4 4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </motion.svg>
                  How do you want to learn this?
                </button>

                <AnimatePresence initial={false}>
                  {expanded ? (
                    <motion.div
                      key="modes"
                      initial={reduce ? false : { opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={reduce ? undefined : { opacity: 0, height: 0 }}
                      transition={sectionEntrance.transition}
                      className="overflow-hidden"
                    >
                      <ModeSelector
                        selected={selectedMode}
                        onSelect={(mode) =>
                          setModeByTopic((prev) => ({
                            ...prev,
                            [topic.id]: mode,
                          }))
                        }
                        className="mt-3"
                      />
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>

              <div>
                <Button
                  onClick={() => startLearning(topic)}
                  loading={starting}
                  disabled={startingId !== null && !starting}
                  variant={status === "COMPLETED" ? "secondary" : "primary"}
                  size="sm"
                  className="w-full"
                >
                  {ctaLabel(status)}
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
            </Panel>
          </motion.div>
        );
      })}
    </div>
  );
}

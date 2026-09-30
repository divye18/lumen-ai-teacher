"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ModeSelector,
  type LearningModeId,
} from "@/components/curriculum/mode-selector";
import { composeCurriculumTopic } from "@/lib/curriculum/compose-topic";
import {
  staggerContainer,
  staggerItem,
  sectionEntrance,
} from "@/lib/ui/motion";
import { cn } from "@/lib/ui/cn";
import { apiFetch } from "@/lib/ui/api-client";
import type { TopicStatus } from "@/lib/curriculum/topic-progress";

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
  status?: TopicStatus;
}

export const STATUS_BADGE: Record<
  TopicStatus,
  { label: string; tone: React.ComponentProps<typeof Badge>["tone"] }
> = {
  NOT_STARTED: { label: "Not started", tone: "neutral" },
  IN_PROGRESS: { label: "In progress", tone: "learning" },
  COMPLETED: { label: "Completed", tone: "positive" },
};

export function ctaLabel(status: TopicStatus): string {
  if (status === "COMPLETED") return "Review topic";
  if (status === "IN_PROGRESS") return "Continue learning";
  return "Start learning";
}

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
    <motion.div
      initial="hidden"
      animate="visible"
      variants={staggerContainer.variants}
      className="mt-4 flex w-full flex-col border-t border-[var(--color-border)]"
    >
      {topics.map((topic, index) => {
        const starting = startingId === topic.id;
        const error = errorById[topic.id];
        const status = topic.status ?? "NOT_STARTED";
        const statusBadge = STATUS_BADGE[status];
        const expanded = expandedId === topic.id;
        const selectedMode = modeByTopic[topic.id] ?? "explain";
        const num = (index + 1).toString().padStart(2, "0");

        return (
          <motion.div
            key={topic.id}
            variants={staggerItem.variants}
            className={cn(
              "group relative flex flex-col gap-4 border-b border-[var(--color-border)] px-4 py-6 transition-colors hover:bg-[var(--color-subtle)] sm:flex-row sm:items-start sm:gap-8 sm:px-6",
              expanded && "bg-[var(--color-subtle)]",
            )}
          >
            <div className="pt-0.5 text-[length:var(--text-meta)] font-semibold text-[var(--color-ink-faint)] sm:w-8">
              {num}.
            </div>

            <div className="flex min-w-0 flex-1 flex-col">
              <button
                type="button"
                onClick={() =>
                  setExpandedId((prev) => (prev === topic.id ? null : topic.id))
                }
                aria-expanded={expanded}
                className="flex w-full items-start justify-between rounded text-left focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:outline-none"
              >
                <div>
                  <h3 className="text-[length:var(--text-title)] font-medium tracking-tight text-[var(--color-ink)] transition-colors group-hover:text-[var(--color-learning)]">
                    {topic.title}
                  </h3>
                  <div className="mt-1 flex items-center gap-2">
                    <Badge tone={statusBadge.tone} dot>
                      {statusBadge.label}
                    </Badge>
                  </div>
                </div>

                <div className="ml-4 shrink-0 pt-1 text-[var(--color-ink-faint)] group-hover:text-[var(--color-ink-muted)]">
                  <motion.svg
                    aria-hidden
                    viewBox="0 0 12 12"
                    className="size-4"
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
                </div>
              </button>

              <AnimatePresence initial={false}>
                {expanded ? (
                  <motion.div
                    key="expanded"
                    initial={reduce ? false : { opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={reduce ? undefined : { opacity: 0, height: 0 }}
                    transition={sectionEntrance.transition}
                    className="overflow-hidden pt-6"
                  >
                    <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="mb-2 text-[length:var(--text-meta)] font-semibold tracking-wide text-[var(--color-ink-muted)] uppercase">
                          Learning Approach
                        </p>
                        <ModeSelector
                          selected={selectedMode}
                          onSelect={(mode) =>
                            setModeByTopic((prev) => ({
                              ...prev,
                              [topic.id]: mode,
                            }))
                          }
                        />
                      </div>

                      <div className="flex w-full shrink-0 flex-col gap-2 lg:w-48">
                        <Button
                          onClick={() => startLearning(topic)}
                          loading={starting}
                          disabled={startingId !== null && !starting}
                          variant={
                            status === "COMPLETED" ? "secondary" : "primary"
                          }
                          size="md"
                          className="w-full"
                        >
                          {ctaLabel(status)}
                        </Button>
                        {error ? (
                          <p
                            role="alert"
                            className="text-center text-[12px] text-[var(--color-danger)]"
                          >
                            {error}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          </motion.div>
        );
      })}
    </motion.div>
  );
}

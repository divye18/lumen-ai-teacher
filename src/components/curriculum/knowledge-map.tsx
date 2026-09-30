"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ModeSelector } from "./mode-selector";
import { apiFetch } from "@/lib/ui/api-client";
import { composeCurriculumTopic } from "@/lib/curriculum/compose-topic";
import type { TopicStatus } from "@/lib/curriculum/topic-progress";
import type { LearningModeId } from "./mode-selector";

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

export interface KnowledgeMapChapter {
  id: string;
  title: string;
  slug: string;
  topics: CurriculumTopicData[];
  completedTopics: number;
  totalTopics: number;
}

const STATUS_BADGE: Record<TopicStatus, { label: string; tone: React.ComponentProps<typeof Badge>["tone"] }> = {
  NOT_STARTED: { label: "Not started", tone: "neutral" },
  IN_PROGRESS: { label: "In progress", tone: "learning" },
  COMPLETED: { label: "Completed", tone: "positive" },
};

function ctaLabel(status: TopicStatus): string {
  if (status === "COMPLETED") return "Review topic";
  if (status === "IN_PROGRESS") return "Continue learning";
  return "Start learning";
}

export function KnowledgeMap({
  chapters,
  subjectTitle,
}: {
  chapters: KnowledgeMapChapter[];
  subjectTitle: string;
}) {
  const router = useRouter();
  const reduce = useReducedMotion();

  const [startingId, setStartingId] = useState<string | null>(null);
  const [errorById, setErrorById] = useState<Record<string, string>>({});
  const [expandedChapterId, setExpandedChapterId] = useState<string | null>(chapters[0]?.id ?? null);
  const [expandedTopicId, setExpandedTopicId] = useState<string | null>(null);
  const [modeByTopic, setModeByTopic] = useState<Record<string, LearningModeId>>({});

  const inFlight = useRef(false);

  async function startLearning(chapterTitle: string, topic: CurriculumTopicData) {
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
      setErrorById((prev) => ({ ...prev, [topic.id]: lessonRes.error.message }));
      setStartingId(null);
      inFlight.current = false;
      return;
    }

    const sessionRes = await apiFetch<StartSessionResponse>("/api/teaching/session", {
      method: "POST",
      body: JSON.stringify({ lessonId: lessonRes.data.lesson.lessonId }),
    });
    if (!sessionRes.ok) {
      setErrorById((prev) => ({ ...prev, [topic.id]: sessionRes.error.message }));
      setStartingId(null);
      inFlight.current = false;
      return;
    }

    router.push(`/learn/${sessionRes.data.session.sessionId}`);
  }

  return (
    <div className="relative flex flex-col w-full py-12">
      {/* SVG Connecting Line (Background) */}
      <div className="absolute left-6 top-12 bottom-0 w-px bg-[var(--color-border)]/30 hidden sm:block pointer-events-none" aria-hidden="true" />

      <div className="flex flex-col gap-12 sm:gap-24 relative z-10">
        {chapters.map((chapter, chapterIndex) => {
          const isExpanded = expandedChapterId === chapter.id;
          const chapterNum = (chapterIndex + 1).toString().padStart(2, "0");

          return (
            <div key={chapter.id} className="relative flex flex-col sm:pl-16">
              
              {/* Horizontal line connecting to spine */}
              <div className="absolute left-6 top-10 w-10 h-px bg-[var(--color-border)]/50 hidden sm:block pointer-events-none" aria-hidden="true" />
              
              {/* Chapter Header */}
              <button
                type="button"
                onClick={() => setExpandedChapterId(isExpanded ? null : chapter.id)}
                className="group flex flex-col items-start text-left focus-visible:outline-none"
              >
                <div className="flex items-center gap-4 mb-2">
                  <span className="font-editorial text-4xl sm:text-5xl text-[var(--color-ink-muted)] group-hover:text-[var(--color-ink)] transition-colors">
                    {chapterNum}
                  </span>
                  <div className="flex flex-col">
                    <span className="font-mono text-[10px] tracking-[0.15em] text-[var(--color-ink-faint)] uppercase">
                      Chapter
                    </span>
                    <span className="text-[12px] font-mono tracking-widest text-[var(--color-learning)] uppercase">
                      {chapter.completedTopics} / {chapter.totalTopics}
                    </span>
                  </div>
                </div>
                
                <h2 className="font-editorial text-4xl sm:text-5xl font-medium tracking-tight text-[var(--color-ink)] transition-colors group-hover:text-[var(--color-learning)]">
                  {chapter.title}
                </h2>
              </button>

              {/* Topics Container */}
              <AnimatePresence initial={false}>
                {isExpanded && (
                  <motion.div
                    initial={reduce ? false : { opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={reduce ? undefined : { opacity: 0, height: 0 }}
                    transition={{ duration: 0.3, ease: "easeInOut" }}
                    className="overflow-hidden flex flex-col gap-6 pt-12 pl-2 sm:pl-12 border-l border-[var(--color-border)]/20 ml-4 sm:ml-0 mt-6"
                  >
                    {chapter.topics.length === 0 ? (
                      <p className="text-[13px] text-[var(--color-ink-faint)]">No topics available in this chapter.</p>
                    ) : (
                      chapter.topics.map((topic, topicIndex) => {
                        const topicExpanded = expandedTopicId === topic.id;
                        const status = topic.status ?? "NOT_STARTED";
                        const statusBadge = STATUS_BADGE[status];
                        const starting = startingId === topic.id;
                        const error = errorById[topic.id];
                        const selectedMode = modeByTopic[topic.id] ?? "explain";
                        const topicNum = (topicIndex + 1).toString().padStart(2, "0");

                        return (
                          <div key={topic.id} className="relative flex flex-col group/topic">
                            {/* Topic Node Indicator */}
                            <div className="absolute -left-[9px] top-3 size-1.5 rounded-full bg-[var(--color-border-strong)] transition-colors group-hover/topic:bg-[var(--color-ink-muted)]" />
                            
                            <button
                              type="button"
                              onClick={() => setExpandedTopicId(topicExpanded ? null : topic.id)}
                              className="flex flex-col text-left focus-visible:outline-none pl-6"
                            >
                              <div className="flex items-center gap-3">
                                <span className="font-mono text-[11px] text-[var(--color-ink-faint)]">{topicNum}.</span>
                                <h3 className="text-xl sm:text-2xl font-editorial tracking-tight text-[var(--color-ink)] transition-colors group-hover/topic:text-[var(--color-learning)]">
                                  {topic.title}
                                </h3>
                              </div>
                              <div className="pl-7 mt-2">
                                <Badge tone={statusBadge.tone} dot>{statusBadge.label}</Badge>
                              </div>
                            </button>

                            {/* Topic Action Body */}
                            <AnimatePresence initial={false}>
                              {topicExpanded && (
                                <motion.div
                                  initial={reduce ? false : { opacity: 0, height: 0 }}
                                  animate={{ opacity: 1, height: "auto" }}
                                  exit={reduce ? undefined : { opacity: 0, height: 0 }}
                                  className="overflow-hidden pl-12 pt-6"
                                >
                                  <div className="flex flex-col gap-6 lg:flex-row lg:items-start p-6 bg-[var(--color-surface)] border border-[var(--color-border)]/30 rounded-[var(--radius-sm)]">
                                    <div className="min-w-0 flex-1">
                                      <p className="mb-4 text-[length:var(--text-meta)] font-semibold tracking-wide text-[var(--color-ink-muted)] uppercase">
                                        Learning Approach
                                      </p>
                                      <ModeSelector
                                        selected={selectedMode}
                                        onSelect={(mode) => setModeByTopic((prev) => ({ ...prev, [topic.id]: mode }))}
                                      />
                                    </div>
                                    <div className="flex w-full shrink-0 flex-col gap-2 lg:w-48">
                                      <Button
                                        onClick={() => startLearning(chapter.title, topic)}
                                        loading={starting}
                                        disabled={startingId !== null && !starting}
                                        variant={status === "COMPLETED" ? "secondary" : "primary"}
                                        size="md"
                                        className="w-full rounded-[var(--radius-xs)]"
                                      >
                                        {ctaLabel(status)}
                                      </Button>
                                      {error && (
                                        <p role="alert" className="text-center text-[12px] text-[var(--color-danger)]">
                                          {error}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        );
                      })
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
}

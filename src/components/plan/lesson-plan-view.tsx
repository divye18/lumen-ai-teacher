"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";

import { Panel } from "@/components/ui/surface";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MasteryMeter } from "@/components/ui/mastery-meter";
import { SourceCitations } from "@/components/teaching/source-citations";
import { apiFetch } from "@/lib/ui/api-client";
import type { LessonView } from "@/lib/session/views";

interface StartResponse {
  ok: true;
  session: { sessionId: string };
}

/** The spine labels frame the concept chain from prerequisite → advanced. */
function stageLabel(index: number, count: number, isPrereq: boolean): string {
  if (isPrereq || index === 0) return "Foundation";
  const p = count <= 1 ? 1 : index / (count - 1);
  if (p < 0.34) return "Understand";
  if (p < 0.67) return "Apply";
  if (p < 0.9) return "Scenario";
  return "Mastery";
}

export function LessonPlanView({
  lesson,
  masteryByConcept,
}: {
  lesson: LessonView;
  masteryByConcept?: Record<string, number>;
}) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setStarting(true);
    setError(null);
    const res = await apiFetch<StartResponse>("/api/teaching/session", {
      method: "POST",
      body: JSON.stringify({ lessonId: lesson.lessonId }),
    });
    if (!res.ok) {
      setError(res.error.message);
      setStarting(false);
      return;
    }
    router.push(`/learn/${res.data.session.sessionId}`);
  }

  return (
    <div className="flex flex-col gap-6">
      <Panel inset>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="accent" dot>
            Lesson plan
          </Badge>
          {lesson.sourceGrounded ? (
            <Badge>Grounded in your material</Badge>
          ) : lesson.planSource === "fallback" ? (
            <Badge tone="warning">Offline plan</Badge>
          ) : (
            <Badge>AI-designed</Badge>
          )}
          {lesson.estimatedMinutes ? (
            <Badge>~{lesson.estimatedMinutes} min</Badge>
          ) : null}
        </div>
        <h1 className="mt-3 text-xl font-semibold tracking-tight">
          {lesson.title}
        </h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-[var(--color-ink-muted)]">
          {lesson.objective}
        </p>

        {lesson.citations.length > 0 ? (
          <div className="mt-4">
            <SourceCitations citations={lesson.citations} compact />
          </div>
        ) : null}
      </Panel>

      <Panel inset>
        <p className="text-[11px] font-medium tracking-wide text-[var(--color-ink-faint)] uppercase">
          Your path · {lesson.concepts.length} concepts
        </p>
        <ol className="mt-4 flex flex-col">
          {lesson.concepts.map((c, i) => {
            const mastery = masteryByConcept?.[c.key];
            return (
              <motion.li
                key={c.key}
                initial={reduce ? false : { opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: reduce ? 0 : i * 0.05 }}
                className="relative flex gap-4 pb-6 last:pb-0"
              >
                <div className="flex flex-col items-center">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full border border-[var(--color-border-strong)] text-[11px] font-semibold text-[var(--color-ink-muted)] tabular-nums">
                    {i + 1}
                  </span>
                  {i < lesson.concepts.length - 1 ? (
                    <span className="mt-1 w-px flex-1 bg-[var(--color-border)]" />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1 pb-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-semibold tracking-wider text-[var(--color-accent)] uppercase">
                      {stageLabel(i, lesson.concepts.length, c.isPrerequisite)}
                    </span>
                    <span className="text-[10px] text-[var(--color-ink-faint)]">
                      difficulty {c.difficulty}/5 · importance {c.importance}/5
                    </span>
                  </div>
                  <p className="mt-1 text-[14px] font-medium text-[var(--color-ink)]">
                    {c.title}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-[var(--color-ink-muted)]">
                    {c.summary}
                  </p>
                  {typeof mastery === "number" ? (
                    <div className="mt-2 max-w-[220px]">
                      <MasteryMeter
                        value={mastery}
                        size="sm"
                        showLabel={false}
                      />
                    </div>
                  ) : null}
                </div>
              </motion.li>
            );
          })}
        </ol>
      </Panel>

      <Panel inset>
        <p className="text-[11px] font-medium tracking-wide text-[var(--color-ink-faint)] uppercase">
          How Lumen will check your understanding
        </p>
        <p className="mt-2 text-[13px] leading-relaxed text-[var(--color-ink)]">
          {lesson.assessmentStrategy}
        </p>
      </Panel>

      {error ? (
        <p
          role="alert"
          className="rounded-[var(--radius-sm)] border border-[color-mix(in_oklab,var(--color-danger)_30%,transparent)] bg-[color-mix(in_oklab,var(--color-danger)_8%,transparent)] px-3 py-2 text-[12px] text-[var(--color-danger)]"
        >
          {error}
        </p>
      ) : null}

      <div className="sticky bottom-4 z-10">
        <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[color-mix(in_oklab,var(--color-surface)_92%,transparent)] p-3 shadow-[var(--shadow-md)] backdrop-blur-md">
          <Button
            onClick={start}
            loading={starting}
            size="lg"
            className="w-full"
          >
            Start learning
          </Button>
        </div>
      </div>
    </div>
  );
}

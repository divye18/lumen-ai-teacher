"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

import { Panel } from "@/components/ui/surface";
import { Button } from "@/components/ui/button";
import { TextField, SegmentedField } from "@/components/ui/field";
import { LumenMark } from "@/components/ui/lumen-mark";
import { apiFetch } from "@/lib/ui/api-client";
import type { LessonView } from "@/lib/session/views";
import { cn } from "@/lib/ui/cn";

import { LessonPlanView } from "./lesson-plan-view";

interface CreateLessonResponse {
  ok: true;
  lesson: LessonView;
  llmConfigured: boolean;
}

interface DocOption {
  id: string;
  title: string;
  status: string;
}

const TIME_OPTIONS = [
  { value: "10", label: "10 min" },
  { value: "20", label: "20 min" },
  { value: "35", label: "35 min" },
  { value: "60", label: "1 hour" },
] as const;

const STYLE_OPTIONS = [
  { value: "conversational", label: "Plain language" },
  { value: "analogy-first", label: "Analogies" },
  { value: "example-first", label: "Examples" },
  { value: "visual-first", label: "Mental models" },
  { value: "formal", label: "Precise" },
  { value: "socratic", label: "Socratic" },
] as const;

export function PlanSetup({
  documents,
  initialTopic,
  initialDocumentId,
}: {
  documents: DocOption[];
  initialTopic: string;
  initialDocumentId: string | null;
}) {
  const reduce = useReducedMotion();
  const readyDocs = documents.filter((d) => d.status === "READY");

  const [documentId, setDocumentId] = useState<string | null>(
    initialDocumentId && readyDocs.some((d) => d.id === initialDocumentId)
      ? initialDocumentId
      : null,
  );
  const [topic, setTopic] = useState(
    initialTopic ||
      (documentId
        ? (readyDocs.find((d) => d.id === documentId)?.title ?? "")
        : ""),
  );
  const [goal, setGoal] = useState("");
  const [minutes, setMinutes] = useState<string>("20");
  const [style, setStyle] = useState<string | null>(null);

  const [state, setState] = useState<
    | { kind: "form" }
    | { kind: "planning" }
    | { kind: "done"; lesson: LessonView; llm: boolean }
    | { kind: "error"; message: string }
  >({ kind: "form" });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (topic.trim().length < 3) {
      setState({
        kind: "error",
        message: "Give the topic at least a few words.",
      });
      return;
    }
    setState({ kind: "planning" });
    const res = await apiFetch<CreateLessonResponse>("/api/lessons", {
      method: "POST",
      body: JSON.stringify({
        topic: topic.trim(),
        documentId: documentId ?? null,
        timeBudgetMinutes: Number(minutes),
        teachingStyle: style,
      }),
    });
    if (!res.ok) {
      setState({ kind: "error", message: res.error.message });
      return;
    }
    setState({
      kind: "done",
      lesson: res.data.lesson,
      llm: res.data.llmConfigured,
    });
  }

  if (state.kind === "done") {
    return (
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        {!state.llm ? (
          <p className="mb-4 rounded-[var(--radius-sm)] border border-[color-mix(in_oklab,var(--color-warning)_30%,transparent)] bg-[color-mix(in_oklab,var(--color-warning)_8%,transparent)] px-3 py-2 text-[12px] text-[var(--color-warning)]">
            Planned in offline mode — a deterministic outline. Add an{" "}
            <code className="font-mono">LLM_API_KEY</code> for a richer,
            AI-designed path.
          </p>
        ) : null}
        <LessonPlanView lesson={state.lesson} />
      </motion.div>
    );
  }

  if (state.kind === "planning") {
    return (
      <Panel inset>
        <div className="flex items-center gap-3">
          <motion.span
            className="text-[var(--color-accent)]"
            animate={reduce ? {} : { rotate: 360 }}
            transition={{ duration: 2.4, repeat: Infinity, ease: "linear" }}
          >
            <LumenMark className="size-5" />
          </motion.span>
          <div>
            <p className="text-[14px] font-medium">
              Designing your learning path
            </p>
            <p className="mt-0.5 text-[12px] text-[var(--color-ink-muted)]">
              Breaking &ldquo;{topic}&rdquo; into a concept chain, ordering
              prerequisites, and choosing where to assess.
            </p>
          </div>
        </div>
      </Panel>
    );
  }

  return (
    <Panel inset>
      <form onSubmit={submit} className="flex flex-col gap-5">
        {readyDocs.length > 0 ? (
          <div className="space-y-1.5">
            <span className="text-[13px] font-medium text-[var(--color-ink)]">
              Teach from
            </span>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setDocumentId(null)}
                className={cn(
                  "h-8 rounded-[var(--radius-sm)] border px-3 text-[13px] font-medium",
                  documentId === null
                    ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                    : "border-[var(--color-border-strong)] text-[var(--color-ink-muted)] hover:bg-[var(--color-subtle)]",
                )}
              >
                General knowledge
              </button>
              {readyDocs.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => {
                    setDocumentId(d.id);
                    if (!topic) setTopic(d.title);
                  }}
                  className={cn(
                    "h-8 max-w-[200px] truncate rounded-[var(--radius-sm)] border px-3 text-[13px] font-medium",
                    documentId === d.id
                      ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                      : "border-[var(--color-border-strong)] text-[var(--color-ink-muted)] hover:bg-[var(--color-subtle)]",
                  )}
                >
                  {d.title}
                </button>
              ))}
            </div>
            <p className="text-[12px] text-[var(--color-ink-faint)]">
              {documentId
                ? "Lumen will teach and cite directly from this material."
                : "Lumen will teach from general knowledge of the topic."}
            </p>
          </div>
        ) : null}

        <TextField
          label="What do you want to learn?"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="e.g. Virtual memory and page faults"
          required
        />

        <TextField
          label="Your goal"
          hint="optional"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="e.g. Be ready for the OS midterm"
        />

        <SegmentedField
          label="Time available"
          options={[...TIME_OPTIONS]}
          value={minutes}
          onChange={setMinutes}
        />

        <SegmentedField
          label="How should Lumen explain?"
          hint="optional"
          options={[...STYLE_OPTIONS]}
          value={style}
          onChange={setStyle}
        />

        {state.kind === "error" ? (
          <p
            role="alert"
            className="rounded-[var(--radius-sm)] border border-[color-mix(in_oklab,var(--color-danger)_30%,transparent)] bg-[color-mix(in_oklab,var(--color-danger)_8%,transparent)] px-3 py-2 text-[12px] text-[var(--color-danger)]"
          >
            {state.message}
          </p>
        ) : null}

        <Button type="submit" size="lg">
          Design my lesson
        </Button>
      </form>
    </Panel>
  );
}

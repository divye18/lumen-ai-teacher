"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";

import { Panel } from "@/components/ui/surface";
import { Button, LinkButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LumenMark } from "@/components/ui/lumen-mark";
import { apiFetch } from "@/lib/ui/api-client";
import { cn } from "@/lib/ui/cn";

import { IngestStages, type IngestPhase } from "./ingest-stages";

interface IngestResponse {
  ok: true;
  document: {
    documentId: string;
    title: string;
    fileName: string;
    totalPages: number;
    chunkCount: number;
    embeddingModel: string;
  };
}

const MAX_MB = 15;

type State =
  | { kind: "idle" }
  | { kind: "running"; phase: IngestPhase; fileName: string }
  | { kind: "done"; doc: IngestResponse["document"] }
  | { kind: "error"; message: string; fileName: string };

export function AddKnowledgePanel() {
  const router = useRouter();
  const reduce = useReducedMotion();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [state, setState] = useState<State>({ kind: "idle" });
  const [, startTransition] = useTransition();

  async function ingest(file: File) {
    if (
      file.type !== "application/pdf" &&
      !file.name.toLowerCase().endsWith(".pdf")
    ) {
      setState({
        kind: "error",
        fileName: file.name,
        message: "Only PDF files are supported right now.",
      });
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      setState({
        kind: "error",
        fileName: file.name,
        message: `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is ${MAX_MB} MB.`,
      });
      return;
    }

    setState({ kind: "running", phase: "uploading", fileName: file.name });
    const form = new FormData();
    form.append("file", file);
    form.append("title", file.name.replace(/\.pdf$/i, ""));

    // Flip to "processing" almost immediately — the upload of a <15MB file is quick,
    // the long tail is server-side extraction/embedding.
    setTimeout(
      () =>
        setState((s) =>
          s.kind === "running" ? { ...s, phase: "processing" } : s,
        ),
      600,
    );

    const res = await apiFetch<IngestResponse>("/api/documents/ingest", {
      method: "POST",
      body: form,
    });

    if (!res.ok) {
      setState({
        kind: "error",
        fileName: file.name,
        message: res.error.message,
      });
      return;
    }
    setState({ kind: "done", doc: res.data.document });
    startTransition(() => router.refresh());
  }

  function onPick(files: FileList | null) {
    const file = files?.[0];
    if (file) void ingest(file);
  }

  return (
    <Panel className="overflow-hidden">
      <AnimatePresence mode="wait">
        {state.kind === "idle" || state.kind === "error" ? (
          <motion.div
            key="drop"
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="p-5 sm:p-6"
          >
            <div className="flex items-center gap-2 text-[var(--color-accent)]">
              <LumenMark className="size-4" />
              <span className="text-[11px] font-semibold tracking-wide uppercase">
                Add learning material
              </span>
            </div>
            <p className="mt-2 max-w-md text-[13px] leading-relaxed text-[var(--color-ink-muted)]">
              Upload a chapter, lecture notes or a paper. Lumen extracts every
              page, builds a searchable knowledge base, and teaches from it with
              citations.
            </p>

            <label
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                onPick(e.dataTransfer.files);
              }}
              className={cn(
                "mt-5 flex cursor-pointer flex-col items-center justify-center rounded-[var(--radius-md)] border-2 border-dashed px-6 py-12 text-center transition-colors",
                dragOver
                  ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]"
                  : "border-[var(--color-border-strong)] hover:border-[var(--color-accent)] hover:bg-[var(--color-subtle)]",
              )}
            >
              <input
                ref={inputRef}
                type="file"
                accept="application/pdf,.pdf"
                className="sr-only"
                onChange={(e) => onPick(e.target.files)}
              />
              <UploadIcon />
              <span className="mt-3 text-[14px] font-medium text-[var(--color-ink)]">
                Drop a PDF here, or click to browse
              </span>
              <span className="mt-1 text-[12px] text-[var(--color-ink-faint)]">
                PDF · up to {MAX_MB} MB
              </span>
            </label>

            {state.kind === "error" ? (
              <p
                role="alert"
                className="mt-4 rounded-[var(--radius-sm)] border border-[color-mix(in_oklab,var(--color-danger)_30%,transparent)] bg-[color-mix(in_oklab,var(--color-danger)_8%,transparent)] px-3 py-2 text-[12px] text-[var(--color-danger)]"
              >
                <span className="font-medium">{state.fileName}</span> —{" "}
                {state.message}
              </p>
            ) : null}
          </motion.div>
        ) : null}

        {state.kind === "running" ? (
          <motion.div
            key="running"
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="p-5 sm:p-6"
          >
            <p className="text-[13px] font-medium text-[var(--color-ink)]">
              Analysing{" "}
              <span className="text-[var(--color-ink-muted)]">
                {state.fileName}
              </span>
            </p>
            <p className="mt-1 text-[12px] text-[var(--color-ink-faint)]">
              This usually takes 10–40 seconds. You can stay on this page.
            </p>
            <div className="mt-6">
              <IngestStages phase={state.phase} />
            </div>
          </motion.div>
        ) : null}

        {state.kind === "done" ? (
          <motion.div
            key="done"
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-5 sm:p-6"
          >
            <Badge tone="positive" dot>
              Ready
            </Badge>
            <h3 className="mt-3 text-lg font-semibold tracking-tight">
              {state.doc.title}
            </h3>
            <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-[12px]">
              <div>
                <dt className="text-[var(--color-ink-faint)]">Pages</dt>
                <dd className="font-medium">{state.doc.totalPages}</dd>
              </div>
              <div>
                <dt className="text-[var(--color-ink-faint)]">
                  Knowledge chunks
                </dt>
                <dd className="font-medium">{state.doc.chunkCount}</dd>
              </div>
              <div>
                <dt className="text-[var(--color-ink-faint)]">Retrieval</dt>
                <dd className="font-medium">Indexed</dd>
              </div>
            </dl>
            <p className="mt-4 text-[13px] leading-relaxed text-[var(--color-ink-muted)]">
              Your material is analysed and searchable. Design a lesson and
              Lumen will teach from it, citing the exact pages.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <LinkButton
                href={`/studio/plan?documentId=${state.doc.documentId}`}
                size="lg"
              >
                Design my lesson
              </LinkButton>
              <Button
                variant="ghost"
                size="lg"
                onClick={() => setState({ kind: "idle" })}
              >
                Add another
              </Button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </Panel>
  );
}

function UploadIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-7 text-[var(--color-ink-faint)]"
      fill="none"
      aria-hidden
    >
      <path
        d="M12 15V4m0 0L8 8m4-4 4 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

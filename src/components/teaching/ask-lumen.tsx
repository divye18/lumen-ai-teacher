"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import { SourceCitations } from "@/components/teaching/source-citations";
import { useStagedReveal } from "@/components/teaching/use-staged-reveal";
import { apiFetch } from "@/lib/ui/api-client";
import type {
  ConversationIntent,
  TeacherReplyView,
} from "@/lib/conversation/contracts";
import { cn } from "@/lib/ui/cn";

interface ConversationResponse {
  ok: true;
  reply: TeacherReplyView;
}

/** Deterministic quick-action hints — the same pipeline, just seeded. */
const QUICK_ACTIONS: { label: string; hint: ConversationIntent }[] = [
  { label: "Explain differently", hint: "SIMPLIFY" },
  { label: "Give an example", hint: "EXAMPLE" },
  { label: "Why?", hint: "WHY" },
  { label: "Compare", hint: "COMPARE" },
  { label: "Check me", hint: "CHECK_UNDERSTANDING" },
];

const INTENT_LABEL: Record<ConversationIntent, string> = {
  CLARIFY: "Clarifying",
  EXAMPLE: "Example",
  SIMPLIFY: "Simpler take",
  DEEPEN: "Going deeper",
  WHY: "The why",
  COMPARE: "Comparison",
  CONNECT: "How it connects",
  CHECK_UNDERSTANDING: "Checking you",
  CHALLENGE: "A challenge",
  OFF_TOPIC: "Staying focused",
};

/**
 * "ASK LUMEN" — the compact conversational layer inside the Teaching Room.
 *
 * The lesson stays primary. The learner can interrupt with a natural-language
 * question (or a quick-action). Lumen answers in context; only the latest
 * exchange is shown. If the answer changes the explanatory angle, the room's
 * visual is adapted (via `onVisual`).
 */
export function AskLumen({
  sessionId,
  conceptTitle,
  onVisual,
  onBusyChange,
  className,
}: {
  sessionId: string;
  conceptTitle: string;
  /** Swap the Teaching Room's held visual to a conversationally-adapted one. */
  onVisual?: (reply: TeacherReplyView) => void;
  onBusyChange?: (busy: boolean) => void;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState<TeacherReplyView | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    onBusyChange?.(pending);
  }, [pending, onBusyChange]);

  async function ask(text: string, intentHint?: ConversationIntent) {
    const trimmed = text.trim();
    if (!trimmed || pending) return;
    setPending(true);
    setError(null);
    const res = await apiFetch<ConversationResponse>(
      "/api/teaching/conversation",
      {
        method: "POST",
        body: JSON.stringify({
          sessionId,
          message: trimmed,
          ...(intentHint ? { intentHint } : {}),
        }),
      },
    );
    setPending(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    setReply(res.data.reply);
    setMessage("");
    if (res.data.reply.visual && onVisual) onVisual(res.data.reply);
  }

  return (
    <div
      className={cn(
        "rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[color-mix(in_oklab,var(--color-surface)_60%,var(--color-canvas))]",
        className,
      )}
    >
      <div className="flex items-center gap-2 px-4 pt-3">
        <TeacherGlyph />
        <p className="text-[12px] font-medium text-[var(--color-ink-muted)]">
          Ask Lumen about {conceptTitle.replace(/-/g, " ")}
        </p>
        {!open ? (
          <button
            type="button"
            onClick={() => {
              setOpen(true);
              requestAnimationFrame(() => inputRef.current?.focus());
            }}
            className="ml-auto text-[11px] font-medium text-[var(--color-accent)] hover:underline"
          >
            Ask a question
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-1.5 px-4 pt-2.5 pb-3">
        {QUICK_ACTIONS.map((a) => (
          <button
            key={a.hint}
            type="button"
            disabled={pending}
            onClick={() => {
              setOpen(true);
              void ask(
                message.trim() ||
                  `${a.label} for ${conceptTitle.replace(/-/g, " ")}`,
                a.hint,
              );
            }}
            className="rounded-full border border-[var(--color-border-strong)] px-2.5 py-1 text-[11px] text-[var(--color-ink-muted)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] disabled:opacity-40"
          >
            {a.label}
          </button>
        ))}
      </div>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            initial={reduce ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-[var(--color-border)]"
          >
            <form
              className="flex items-end gap-2 p-3"
              onSubmit={(e) => {
                e.preventDefault();
                void ask(message);
              }}
            >
              <textarea
                ref={inputRef}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void ask(message);
                  }
                }}
                rows={2}
                placeholder="e.g. Why is cache faster than RAM?"
                className="min-h-[44px] flex-1 resize-none rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-canvas)] px-3 py-2 text-[13px] leading-snug outline-none focus:border-[var(--color-accent)]"
              />
              <button
                type="submit"
                disabled={pending || message.trim().length === 0}
                className="rounded-[var(--radius-md)] bg-[var(--color-accent)] px-3 py-2 text-[12px] font-medium text-white disabled:opacity-40"
              >
                {pending ? "…" : "Ask"}
              </button>
            </form>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {error ? (
        <p
          role="alert"
          className="px-4 pb-3 text-[12px] text-[var(--color-danger)]"
        >
          {error}
        </p>
      ) : null}

      {pending ? (
        <div className="flex items-center gap-2 border-t border-[var(--color-border)] px-4 py-3 text-[12px] text-[var(--color-ink-faint)]">
          <ThinkingDots reduce={reduce} /> Lumen is thinking about your
          question…
        </div>
      ) : reply ? (
        <ReplyCard
          key={reply.answer}
          reply={reply}
          onFollowUp={(t) => void ask(t)}
        />
      ) : null}
    </div>
  );
}

function ReplyCard({
  reply,
  onFollowUp,
}: {
  reply: TeacherReplyView;
  onFollowUp: (text: string) => void;
}) {
  const reduce = useReducedMotion();
  const sentences = reply.answer
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const stage = useStagedReveal(sentences.length, {
    enabled: !reduce,
    firstMs: 120,
    stepMs: 550,
  });
  const shown = reduce
    ? sentences
    : sentences.slice(0, Math.max(1, stage.revealed));

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="border-t border-[var(--color-border)] px-4 py-3.5"
    >
      <div className="flex items-center gap-1.5 text-[10px] font-semibold tracking-wide text-[var(--color-accent)] uppercase">
        <TeacherGlyph />
        {INTENT_LABEL[reply.intent] ?? "Lumen"}
        {reply.source === "deterministic" ? (
          <span className="font-normal text-[var(--color-ink-faint)] normal-case">
            · short version (AI explanation unavailable)
          </span>
        ) : reply.grounded ? (
          <span className="font-normal text-[var(--color-ink-faint)] normal-case">
            · from your material
          </span>
        ) : null}
      </div>

      <div className="mt-2 space-y-1.5 text-[13px] leading-relaxed text-[var(--color-ink)]">
        {shown.map((s, i) => (
          <motion.p
            key={i}
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            {s}
          </motion.p>
        ))}
      </div>

      {stage.done || reduce ? (
        <>
          <p className="mt-2.5 border-l-2 border-[var(--color-accent)] pl-2.5 text-[12px] font-medium text-[var(--color-ink-muted)]">
            {reply.keyPoint}
          </p>

          {reply.misconceptionNoted ? (
            <p className="mt-2 text-[11px] text-[var(--color-warning)]">
              Lumen linked this to a pattern it&apos;s tracking:{" "}
              {reply.misconceptionNoted.label}.
            </p>
          ) : null}

          {reply.citations.length > 0 ? (
            <div className="mt-2.5">
              <SourceCitations citations={reply.citations} compact />
            </div>
          ) : null}

          {reply.followUpPrompt ? (
            <button
              type="button"
              onClick={() => onFollowUp(reply.followUpPrompt as string)}
              className="mt-2.5 rounded-full border border-[var(--color-border-strong)] px-2.5 py-1 text-[11px] text-[var(--color-ink-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
            >
              {reply.followUpPrompt}
            </button>
          ) : null}
        </>
      ) : null}
    </motion.div>
  );
}

function TeacherGlyph() {
  return (
    <span className="grid size-4 shrink-0 place-items-center rounded-full bg-[var(--color-accent-soft)]">
      <span className="size-1.5 rounded-full bg-[var(--color-accent)]" />
    </span>
  );
}

function ThinkingDots({ reduce }: { reduce: boolean | null }) {
  if (reduce) return <span aria-hidden>•••</span>;
  return (
    <span className="inline-flex gap-0.5" aria-hidden>
      {[0, 1, 2].map((d) => (
        <motion.span
          key={d}
          className="size-1 rounded-full bg-current"
          animate={{ opacity: [0.25, 1, 0.25] }}
          transition={{ duration: 1.1, repeat: Infinity, delay: d * 0.16 }}
        />
      ))}
    </span>
  );
}

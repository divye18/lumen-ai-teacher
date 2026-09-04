import "server-only";

import type { LLMProvider } from "@/lib/ai/types";
import { generateStructured } from "@/lib/ai/structured";
import {
  createInteractionStore,
  createMisconceptionStore,
  type DbClient,
} from "@/lib/db/repositories";
import { SessionNotFoundError } from "@/lib/errors";
import { matchMisconception } from "@/lib/learner";
import type { Retriever } from "@/lib/rag";
import { err, ok, type Result } from "@/lib/result";
import {
  buildSourceContextText,
  toTeachingCitations,
  type TeachingCitation,
} from "@/lib/session/citations";
import {
  coerceVisualDirective,
  resolveVisual,
  type LearnerVisualSignal,
} from "@/lib/visuals";

import type { ConversationContext } from "./context";
import { loadConversationContext } from "./context";
import {
  teacherReplySchema,
  type ConversationIntent,
  type ConversationRequest,
  type TeacherReply,
  type TeacherReplyView,
} from "./contracts";
import { deterministicReply } from "./deterministic";
import { classifyIntentHeuristic, SOURCE_SEEKING_INTENTS } from "./intent";
import { buildConversationPrompt } from "./prompts";

/**
 * CONVERSATIONAL TEACHING SERVICE.
 *
 *   learner message → intent → context → retrieval (if grounded) →
 *   structured LLM reply (or deterministic fallback) → validation →
 *   optional visual adaptation → misconception nudge → persist → reply
 *
 * Never touches lesson progression, `plan_cursor`, or mastery. Only ever
 * *strengthens* an already-tracked misconception. Degrades safely at every
 * step: bad model output, retrieval failure, or no LLM all yield a usable,
 * honest reply.
 *
 * `composeConversationReply` is the pure-ish core (context in, plan out);
 * `runConversationTurn` loads the context and applies the plan.
 */

export interface ConversationDeps {
  db: DbClient;
  userId: string;
  llm: LLMProvider | null;
  retriever: Retriever | null;
}

export interface ComposeDeps {
  userId: string;
  llm: LLMProvider | null;
  retriever: Retriever | null;
}

/** A bounded instruction to strengthen exactly one existing misconception. */
export interface MisconceptionNudge {
  id: string;
  confidence: number;
  detections: number;
  evidence: { quote: string; via: "conversation" };
}

export interface ComposeResult {
  view: TeacherReplyView;
  nudge: MisconceptionNudge | null;
  /** What to write to the interaction log. */
  audit: {
    intent: ConversationIntent;
    intentHint: ConversationIntent | null;
    grounded: boolean;
    source: "ai" | "deterministic";
    citedChunkIds: string[];
    misconceptionCategory: string | null;
    keyPoint: string;
  };
}

const SUGGEST_VISUAL_SIGNAL: Record<
  Exclude<TeacherReply["suggestVisual"], "none">,
  { signal: LearnerVisualSignal; intent: string; rationale: string }
> = {
  simpler: {
    signal: "struggling",
    intent: "concrete",
    rationale: "Showing a simpler view because you asked to break it down.",
  },
  comparison: {
    // the `simple` catalogue variant is a 2-column comparison for the common
    // cache / memory concepts, and the heuristic builds one for "X vs Y".
    signal: "struggling",
    intent: "connect",
    rationale: "Switching to a side-by-side because you asked to compare.",
  },
  system: {
    signal: "strong",
    intent: "systemView",
    rationale: "Showing the fuller picture since you're going deeper.",
  },
};

function conceptKeywords(title: string): string[] {
  return title
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2);
}

function labelFromCategory(category: string): string {
  const words = category
    .replace(/^(confuses|thinks|assumes|believes|misses)[-_]?/i, "")
    .split(/[-_\s]+/)
    .filter(Boolean);
  if (words.length === 0) return "a recurring mix-up";
  const phrase = words.join(" ");
  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}

export async function composeConversationReply(
  deps: ComposeDeps,
  context: ConversationContext,
  input: ConversationRequest,
): Promise<ComposeResult> {
  const workingIntent: ConversationIntent = classifyIntentHeuristic(
    input.message,
    input.intentHint ?? null,
    conceptKeywords(context.concept.title),
  ).intent;

  // ── retrieval (source-grounded lesson + source-seeking intent only) ──
  let citations: TeachingCitation[] = [];
  let sourceContext: string | null = null;
  if (
    context.lesson.sourceGrounded &&
    deps.retriever &&
    SOURCE_SEEKING_INTENTS.has(workingIntent)
  ) {
    const retrieved = await deps.retriever.retrieve({
      userId: deps.userId,
      text: `${input.message} ${context.concept.title}`.slice(0, 800),
      documentId: context.lesson.documentId ?? undefined,
      topK: 4,
      similarityThreshold: 0.15,
    });
    if (retrieved.ok && retrieved.value.length > 0) {
      sourceContext = buildSourceContextText(retrieved.value, 2800);
      citations = toTeachingCitations(retrieved.value);
    }
  }

  // ── the reply: LLM structured, else deterministic ──
  let reply: TeacherReply;
  let replySource: "ai" | "deterministic";
  if (deps.llm) {
    const { system, user } = buildConversationPrompt({
      context,
      message: input.message,
      workingIntent,
      sourceContext,
    });
    const generated = await generateStructured({
      provider: deps.llm,
      schema: teacherReplySchema,
      system,
      user,
      temperature: 0.3,
      maxOutputTokens: 700,
    });
    if (generated.ok) {
      reply = generated.value.value;
      replySource = "ai";
    } else {
      reply = deterministicReply(context, workingIntent, input.message);
      replySource = "deterministic";
    }
  } else {
    reply = deterministicReply(context, workingIntent, input.message);
    replySource = "deterministic";
    // Offline retrieval still counts — surface the passage honestly.
    if (citations.length > 0) {
      reply = {
        ...reply,
        answer: `Your material covers this — “${citations[0].snippet}”. ${reply.answer}`,
        groundedInSource: true,
      };
    }
  }

  // Grounding is honest: retrieval returned passages AND the answer uses them.
  const grounded = citations.length > 0 && reply.groundedInSource === true;
  const outCitations = grounded ? citations : [];

  // ── optional visual adaptation (reuses the 7.2 resolver) ──
  let visualView: Pick<
    TeacherReplyView,
    "visual" | "visualIntent" | "visualRationale"
  > = { visual: null, visualIntent: null, visualRationale: null };
  if (reply.suggestVisual !== "none") {
    const map = SUGGEST_VISUAL_SIGNAL[reply.suggestVisual];
    const resolved = resolveVisual({
      conceptKey: context.concept.key,
      title: context.concept.title,
      summary: context.concept.summary,
      action: context.concept.action ?? "EXPLAIN",
      strategy: "conversational",
      learnerSignal: map.signal,
    });
    if (resolved.source !== "text") {
      visualView = {
        visual: coerceVisualDirective(
          resolved.directive,
          context.concept.summary.slice(0, 2000),
        ),
        visualIntent: map.intent,
        visualRationale: map.rationale,
      };
    }
  }

  // ── misconception nudge: strengthen an existing one, never create ──
  let nudge: MisconceptionNudge | null = null;
  let misconceptionNoted: TeacherReplyView["misconceptionNoted"] = null;
  if (reply.misconceptionSignal && context.concept.id) {
    const match = matchMisconception(
      {
        category: reply.misconceptionSignal.category,
        description: reply.misconceptionSignal.contrast,
      },
      context.misconceptions,
    );
    if (match) {
      nudge = {
        id: match.existing.id,
        confidence: Math.min(0.95, match.existing.confidence + 0.08),
        detections: match.existing.detections + 1,
        evidence: { quote: input.message.slice(0, 240), via: "conversation" },
      };
      misconceptionNoted = {
        label: labelFromCategory(match.existing.category),
      };
    }
  }

  return {
    view: {
      intent: reply.intent,
      answer: reply.answer,
      keyPoint: reply.keyPoint,
      followUpPrompt: reply.followUpPrompt ?? null,
      source: replySource,
      grounded,
      citations: outCitations,
      ...visualView,
      misconceptionNoted,
    },
    nudge,
    audit: {
      intent: reply.intent,
      intentHint: input.intentHint ?? null,
      grounded,
      source: replySource,
      citedChunkIds: outCitations.map((c) => c.chunkId),
      misconceptionCategory: reply.misconceptionSignal?.category ?? null,
      keyPoint: reply.keyPoint,
    },
  };
}

export async function runConversationTurn(
  deps: ConversationDeps,
  input: ConversationRequest,
): Promise<Result<TeacherReplyView>> {
  const contextRes = await loadConversationContext(
    deps.db,
    deps.userId,
    input.sessionId,
  );
  if (!contextRes.ok) return err(new SessionNotFoundError(input.sessionId));
  const context = contextRes.value;

  const composed = await composeConversationReply(
    { userId: deps.userId, llm: deps.llm, retriever: deps.retriever },
    context,
    input,
  );

  if (composed.nudge) {
    const misconceptions = createMisconceptionStore(deps.db);
    await misconceptions.strengthen({
      id: composed.nudge.id,
      confidence: composed.nudge.confidence,
      detections: composed.nudge.detections,
      evidenceEntry: composed.nudge.evidence,
    });
  }

  await persistTurn(deps, context, input, composed.audit);

  return ok(composed.view);
}

async function persistTurn(
  deps: ConversationDeps,
  context: ConversationContext,
  input: ConversationRequest,
  audit: ComposeResult["audit"],
): Promise<void> {
  const interactions = createInteractionStore(deps.db);
  const base = {
    sessionId: context.sessionId,
    userId: deps.userId,
    conceptId: context.concept.id ?? undefined,
    interactionType: "OTHER" as const,
  };
  await interactions.record({
    ...base,
    role: "STUDENT",
    content: input.message.slice(0, 2000),
    metadata: {
      kind: "conversation",
      intent: audit.intent,
      intentHint: audit.intentHint,
    },
  });
  await interactions.record({
    ...base,
    role: "TEACHER",
    content: audit.keyPoint.slice(0, 2000),
    metadata: {
      kind: "conversation",
      intent: audit.intent,
      grounded: audit.grounded,
      source: audit.source,
      citedChunkIds: audit.citedChunkIds,
      misconceptionCategory: audit.misconceptionCategory,
    },
  });
}

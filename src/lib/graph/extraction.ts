import "server-only";

import type { LLMProvider } from "@/lib/ai/types";
import { generateStructured } from "@/lib/ai/structured";
import { slugifyConceptKey } from "@/lib/teaching/keys";
import { ok, type Result } from "@/lib/result";

import { extractedGraphSchema, type ExtractedGraph } from "./contracts";
import { buildConceptExtractionPrompt } from "./prompts";

/**
 * CONCEPT EXTRACTION PIPELINE.
 *
 * Produces a validated `ExtractedGraph`. The language model is used when
 * available and its output must pass the contract; on any failure — or with no
 * model at all — extraction falls back to the lesson plan's own concept chain,
 * which is already structured and prerequisite-ordered. Extraction therefore
 * NEVER fails as long as the lesson has at least one concept: the graph is an
 * enhancement, never a hard dependency.
 */

export interface PlanConceptSeed {
  key: string;
  title: string;
  summary: string;
  /** 1..5 */
  importance: number;
  prerequisiteKeys: string[];
}

export interface ExtractConceptsInput {
  llm: LLMProvider | null;
  subject: string;
  language?: string;
  /** Retrieved source passages, when the extraction is document-grounded. */
  sources?: { text: string; page: number | null }[];
  /** The lesson plan's concept chain — the deterministic fallback. */
  planConcepts: PlanConceptSeed[];
}

export interface ExtractConceptsResult {
  graph: ExtractedGraph;
  source: "ai" | "ai+source" | "plan";
}

/** Deterministic graph from the lesson plan alone. Always valid. */
export function graphFromPlan(planConcepts: PlanConceptSeed[]): ExtractedGraph {
  const keys = new Set(planConcepts.map((c) => c.key));
  const concepts = planConcepts.map((c) => ({
    key: c.key,
    title: c.title,
    description: c.summary.slice(0, 600) || c.title,
    importance: Math.min(5, Math.max(1, Math.round(c.importance))),
    sourcePages: [] as number[],
    prerequisiteKeys: c.prerequisiteKeys.filter(
      (p) => keys.has(p) && p !== c.key,
    ),
    relatedKeys: [] as string[],
  }));

  const relationships = planConcepts.flatMap((c) =>
    c.prerequisiteKeys
      .filter((p) => keys.has(p) && p !== c.key)
      .map((p) => ({
        sourceKey: p,
        targetKey: c.key,
        type: "PREREQUISITE" as const,
        confidence: 1,
      })),
  );

  // Chain consecutive plan concepts that have no explicit prerequisite so the
  // map still shows the intended learning order.
  planConcepts.forEach((c, i) => {
    if (i === 0) return;
    const hasPrereq = c.prerequisiteKeys.some((p) => keys.has(p));
    if (hasPrereq) return;
    const prev = planConcepts[i - 1];
    relationships.push({
      sourceKey: prev.key,
      targetKey: c.key,
      type: "PREREQUISITE" as const,
      confidence: 0.6,
    });
  });

  // `graphFromPlan` inputs are already schema-shaped; parse to be certain.
  return extractedGraphSchema.parse({ concepts, relationships });
}

export async function extractConcepts(
  input: ExtractConceptsInput,
): Promise<Result<ExtractConceptsResult>> {
  const fallback = (): ExtractConceptsResult => ({
    graph: graphFromPlan(
      input.planConcepts.length > 0
        ? input.planConcepts
        : [
            {
              key: slugifyConceptKey(input.subject, "topic"),
              title: input.subject,
              summary: `Core ideas of ${input.subject}.`,
              importance: 5,
              prerequisiteKeys: [],
            },
          ],
    ),
    source: "plan",
  });

  if (!input.llm) return ok(fallback());

  const sources = input.sources ?? [];
  const { system, user } = buildConceptExtractionPrompt({
    subject: input.subject,
    language: input.language ?? "en",
    planConceptTitles: input.planConcepts.map((c) => c.title),
    sources,
  });

  const generated = await generateStructured({
    provider: input.llm,
    schema: extractedGraphSchema,
    system,
    user,
    temperature: 0.2,
    maxOutputTokens: 1800,
  });

  if (!generated.ok) return ok(fallback());

  return ok({
    graph: generated.value.value,
    source: sources.length > 0 ? "ai+source" : "ai",
  });
}

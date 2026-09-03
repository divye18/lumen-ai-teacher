import { z } from "zod";

import { conceptRelationshipTypeSchema } from "@/lib/db/enums";
import { conceptKeySchema } from "@/lib/db/schemas";

/**
 * KNOWLEDGE-GRAPH AI OUTPUT CONTRACTS.
 *
 * Concept extraction is the only model-driven step in graph construction, and
 * its output is never trusted: it must pass `extractedGraphSchema` before the
 * deterministic normalize → validate → persist pipeline runs. `reason` fields
 * ask for one short product-facing sentence, never chain-of-thought.
 */

export const extractedConceptSchema = z.object({
  /** Stable lowercase-hyphen key, unique within the extraction. */
  key: conceptKeySchema,
  title: z.string().min(1).max(160),
  /** One or two sentences. Learner-facing. */
  description: z.string().min(1).max(600),
  /** 1 (peripheral) … 5 (central to the material). */
  importance: z.number().int().min(1).max(5),
  /** Pages in the source document this concept is grounded in. */
  sourcePages: z.array(z.number().int().min(0).max(10_000)).max(40).default([]),
  /** Keys of concepts (in this same extraction) that must be understood first. */
  prerequisiteKeys: z.array(conceptKeySchema).max(12).default([]),
  /** Keys of concepts (in this same extraction) that are closely related. */
  relatedKeys: z.array(conceptKeySchema).max(12).default([]),
});
export type ExtractedConcept = z.infer<typeof extractedConceptSchema>;

export const extractedRelationshipSchema = z.object({
  sourceKey: conceptKeySchema,
  targetKey: conceptKeySchema,
  type: conceptRelationshipTypeSchema,
  /** Model's confidence 0..1 that this edge is real. */
  confidence: z.number().min(0).max(1).default(0.6),
});
export type ExtractedRelationship = z.infer<typeof extractedRelationshipSchema>;

export const extractedGraphSchema = z
  .object({
    concepts: z.array(extractedConceptSchema).min(1).max(24),
    relationships: z.array(extractedRelationshipSchema).max(120).default([]),
  })
  .superRefine((graph, ctx) => {
    const keys = new Set(graph.concepts.map((c) => c.key));
    const dupes = new Set<string>();
    const seen = new Set<string>();
    for (const c of graph.concepts) {
      if (seen.has(c.key)) dupes.add(c.key);
      seen.add(c.key);
    }
    if (dupes.size > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["concepts"],
        message: `duplicate concept keys: ${[...dupes].join(", ")}`,
      });
    }
    graph.relationships.forEach((r, i) => {
      if (!keys.has(r.sourceKey)) {
        ctx.addIssue({
          code: "custom",
          path: ["relationships", i, "sourceKey"],
          message: `unknown concept "${r.sourceKey}"`,
        });
      }
      if (!keys.has(r.targetKey)) {
        ctx.addIssue({
          code: "custom",
          path: ["relationships", i, "targetKey"],
          message: `unknown concept "${r.targetKey}"`,
        });
      }
    });
  });
export type ExtractedGraph = z.infer<typeof extractedGraphSchema>;

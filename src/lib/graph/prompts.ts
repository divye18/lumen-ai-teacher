import type { PromptPair } from "@/lib/teaching/prompts";

import { CONCEPT_RELATIONSHIP_TYPES } from "@/lib/db/enums";

/**
 * Concept-extraction prompt. Asks for a STRUCTURED knowledge graph, grounded in
 * the supplied material where present. Output must match `extractedGraphSchema`.
 */
export function buildConceptExtractionPrompt(params: {
  subject: string;
  language: string;
  planConceptTitles: string[];
  sources: { text: string; page: number | null }[];
}): PromptPair {
  const grounded = params.sources.length > 0;

  const system = [
    "You are Lumen's Concept Extractor. From the material, identify the distinct",
    "concepts a learner must understand and how they relate.",
    "Return 4-16 concepts. Each concept: a stable lowercase-hyphen `key`, a",
    "`title`, a 1-2 sentence learner-facing `description`, `importance` 1-5,",
    "`sourcePages` (page numbers it came from, [] if unknown),",
    "`prerequisiteKeys` and `relatedKeys` (keys that appear in THIS list only).",
    `Relationship \`type\` is one of: ${CONCEPT_RELATIONSHIP_TYPES.join(", ")}.`,
    "PREREQUISITE/DEPENDS_ON/PART_OF are directional (source before target).",
    "Do NOT invent relationships you cannot justify from the material.",
    "Prerequisite relationships must not form a cycle.",
    grounded
      ? "Ground every concept in the SOURCE MATERIAL. Do not add concepts it does not support."
      : "No source material provided — use general knowledge of the subject.",
    "Respond with ONE JSON object only. No prose, no markdown, no code fences.",
    'Schema: {"concepts":[{"key","title","description","importance","sourcePages":[],"prerequisiteKeys":[],"relatedKeys":[]}],"relationships":[{"sourceKey","targetKey","type","confidence"}]}',
  ].join("\n");

  const user = [
    `SUBJECT: ${params.subject}`,
    `LANGUAGE: ${params.language}`,
    params.planConceptTitles.length > 0
      ? `CONCEPTS ALREADY IN THE LESSON PLAN: ${params.planConceptTitles.join(", ")}`
      : "",
    grounded
      ? `\nSOURCE MATERIAL:\n${params.sources
          .map(
            (s) =>
              `[p.${s.page ?? "?"}] ${s.text.replace(/\s+/g, " ").slice(0, 900)}`,
          )
          .join("\n\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  return { system, user };
}

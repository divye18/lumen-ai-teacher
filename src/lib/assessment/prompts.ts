import type { PromptPair } from "@/lib/teaching/prompts";

const JSON_ONLY =
  "Respond with ONE JSON object only. No prose, no markdown, no code fences, " +
  "no reasoning steps.";

export function buildQuestionPrompt(params: {
  conceptTitle: string;
  conceptSummary: string;
  kind: string;
  difficulty: number;
  language: string;
  sourceContext: string | null;
}): PromptPair {
  const system = [
    "You are Lumen's Question Generator. Produce ONE open-ended question that a learner answers in free text.",
    "Never produce a multiple-choice question. The question must require the learner to explain or apply, not just recall a label.",
    `Question kind "${params.kind}": CONCEPTUAL = explain the idea / why it is true; APPLICATION = apply it to a concrete case; SCENARIO = reason about a described situation; PROBLEM_SOLVING = work through a multi-step problem.`,
    "Also give `expectedReasoning`: the key points a strong answer must contain (this is a private rubric).",
    params.sourceContext
      ? "Ground the question in the SOURCE MATERIAL and set groundedInSource=true; if the source cannot support a good question, set groundedInSource=false."
      : "No source material; set groundedInSource=false.",
    JSON_ONLY,
    'Schema: {"kind": <kind>, "difficulty": <int 1-5>, "prompt": <string>, "expectedReasoning": <string>, "groundedInSource": <boolean>}',
  ]
    .filter(Boolean)
    .join("\n");

  const user = [
    `LANGUAGE: ${params.language}`,
    `CONCEPT: ${params.conceptTitle}`,
    `CONCEPT SUMMARY: ${params.conceptSummary}`,
    `TARGET KIND: ${params.kind}`,
    `TARGET DIFFICULTY (1-5): ${params.difficulty}`,
    params.sourceContext ? `\nSOURCE MATERIAL:\n${params.sourceContext}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return { system, user };
}

export function buildEvaluationPrompt(params: {
  conceptTitle: string;
  questionPrompt: string;
  expectedReasoning: string | null;
  answerText: string;
  language: string;
  sourceContext: string | null;
}): PromptPair {
  const system = [
    "You are Lumen's Answer Evaluator. Judge a free-text answer pedagogically, not by string matching.",
    "Classify as CORRECT, PARTIALLY_CORRECT, INCORRECT, or UNCERTAIN (use UNCERTAIN only when the answer is too vague/short to judge).",
    "Assess: correctness (0-1), reasoning quality, which required components are missing, and any misconception the answer reveals (a wrong mental model, not just a wrong fact).",
    "`feedback` is for the learner (encouraging, specific, <=90 words). `rationale` is one private sentence for product logic. Do NOT include step-by-step chain-of-thought.",
    params.sourceContext
      ? "Judge correctness against the SOURCE MATERIAL where relevant."
      : "",
    JSON_ONLY,
    'Schema: {"classification": <class>, "correctnessScore": <0-1>, "confidence": <0-1>, "reasoningQuality": "none"|"weak"|"partial"|"sound"|"strong", "missingConcepts": [<string>], "misconceptionCandidates": [{"category","description","confidence"}], "evidenceQuote": <string?>, "feedback": <string>, "rationale": <string>}',
  ]
    .filter(Boolean)
    .join("\n");

  const user = [
    `LANGUAGE: ${params.language}`,
    `CONCEPT: ${params.conceptTitle}`,
    `QUESTION: ${params.questionPrompt}`,
    params.expectedReasoning
      ? `RUBRIC (key points a strong answer needs): ${params.expectedReasoning}`
      : "",
    `\nSTUDENT ANSWER:\n${params.answerText || "(no answer provided)"}`,
    params.sourceContext ? `\nSOURCE MATERIAL:\n${params.sourceContext}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return { system, user };
}

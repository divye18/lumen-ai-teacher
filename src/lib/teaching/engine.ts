import type { LLMProvider } from "@/lib/ai/types";
import { generateStructured } from "@/lib/ai/structured";

import {
  engineDecisionSchema,
  type ResolvedTeachingDecision,
} from "./contracts";
import {
  baselineDecision,
  reconcileDecision,
  type PolicyFacts,
} from "./policy";
import {
  buildEnginePrompt,
  type EngineConceptContext,
  type EngineSignalContext,
} from "./prompts";

/**
 * TEACHING ENGINE — the brain that decides what happens next.
 *
 * AI reasoning is separated from deterministic product orchestration:
 *   1. The LLM proposes an action (validated by `engineDecisionSchema`).
 *   2. `reconcileDecision` enforces the allowed action / state transition.
 *   3. If the LLM is unavailable or its output never validates, the engine
 *      falls back to `baselineDecision` — a fully deterministic policy.
 *
 * `decide` therefore ALWAYS returns a usable decision; it never throws and has
 * no `Result` failure mode.
 */

export interface TeachingReasoningInput {
  facts: PolicyFacts;
  concept: EngineConceptContext;
  signal: EngineSignalContext;
  language: string;
  learningGoal: string | null;
  sourceGrounded: boolean;
}

export interface TeachingEngine {
  readonly id: string;
  decide(input: TeachingReasoningInput): Promise<ResolvedTeachingDecision>;
}

export interface CreateTeachingEngineOptions {
  /** Pass `null` to run the engine in pure-deterministic mode. */
  llm: LLMProvider | null;
  temperature?: number;
}

export function createTeachingEngine(
  options: CreateTeachingEngineOptions,
): TeachingEngine {
  const { llm } = options;

  return {
    id: llm ? `lumen-engine:${llm.id}` : "lumen-engine:policy-only",

    async decide(
      input: TeachingReasoningInput,
    ): Promise<ResolvedTeachingDecision> {
      const withConcept = (
        decision: ResolvedTeachingDecision,
      ): ResolvedTeachingDecision => ({
        ...decision,
        targetConceptKey: decision.targetConceptKey || input.concept.key,
      });

      if (!llm) {
        const base = baselineDecision(input.facts);
        return withConcept({
          ...base,
          adaptationNarrative: [
            "Using Lumen's deterministic teaching policy (language model not configured).",
            ...base.adaptationNarrative,
          ],
        });
      }

      const { system, user } = buildEnginePrompt(input);
      const proposal = await generateStructured({
        provider: llm,
        schema: engineDecisionSchema,
        system,
        user,
        temperature: options.temperature ?? 0.2,
        maxOutputTokens: 400,
      });

      if (!proposal.ok) {
        const base = baselineDecision(input.facts);
        return withConcept({
          ...base,
          adaptationNarrative: [
            "AI decision proposal was unavailable — applied Lumen's deterministic policy.",
            ...base.adaptationNarrative,
          ],
        });
      }

      return withConcept(reconcileDecision(proposal.value.value, input.facts));
    },
  };
}

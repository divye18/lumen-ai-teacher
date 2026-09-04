import type { ConversationIntent } from "./contracts";

/**
 * DETERMINISTIC INTENT CLASSIFICATION.
 *
 * Keyword / phrase heuristics that infer the educational intent of a learner
 * message without a model. Used:
 *   1. offline (no LLM),
 *   2. as the fallback when the LLM classification is unusable,
 *   3. to pick a retrieval strategy *before* the LLM call.
 *
 * A quick-action button supplies an explicit `hint` which always wins. When
 * nothing matches, we default to CLARIFY — the safest "I need help" intent.
 */

export interface IntentGuess {
  intent: ConversationIntent;
  source: "hint" | "heuristic" | "default";
}

interface Rule {
  intent: ConversationIntent;
  patterns: RegExp[];
}

// Ordered — earlier rules win a tie. More specific intents come first.
const RULES: Rule[] = [
  {
    intent: "SIMPLIFY",
    patterns: [
      /\bsimpler\b/i,
      /\bsimplif/i,
      /\bexplain (this|it|that)? ?(like|as if) i'?m\b/i,
      /\beli5\b/i,
      /\bdumb(ed)? (it |this )?down\b/i,
      /\bin plain (english|terms)\b/i,
      /\bi'?m new to\b/i,
      /\btoo (complicated|complex|technical)\b/i,
      /\bbreak (it|this) down\b/i,
    ],
  },
  {
    intent: "EXAMPLE",
    patterns: [
      /\b(an?|another|real[- ]?world|concrete|practical) example\b/i,
      /\bgive me an example\b/i,
      /\bfor (instance|example)\b/i,
      /\bin practice\b/i,
      /\bshow me\b/i,
      /\bwhat would (this|that) look like\b/i,
    ],
  },
  {
    intent: "COMPARE",
    patterns: [
      /\bdifference between\b/i,
      /\bcompare\b/i,
      /\bcompared? to\b/i,
      /\bvs\.?\b/i,
      /\bversus\b/i,
      /\b(how|what) (is|are) .* different\b/i,
      /\binstead of\b/i,
      /\bwhy not just\b/i,
      /\bcan'?t (we|you|it) just\b/i,
      // equivalence claims ("X is basically just Y") — a comparison in disguise
      /\bis (basically|essentially|just|simply|pretty much|the same as|like)\b/i,
      /\bthe same (thing )?as\b/i,
    ],
  },
  {
    intent: "CONNECT",
    patterns: [
      /\bconnect(ed|s|ion)?\b/i,
      /\brelate[ds]? to\b/i,
      /\bhow does (this|that|it) (relate|connect|tie|fit)\b/i,
      /\btie(s|d)? (in|into|together)\b/i,
      /\bwhere does (this|that) fit\b/i,
      /\bbigger picture\b/i,
    ],
  },
  {
    intent: "CHECK_UNDERSTANDING",
    patterns: [
      /\bam i (right|correct|getting|understanding)\b/i,
      /\bcheck (me|my understanding)\b/i,
      /\bdid i (get|understand|explain) (this|that|it)\b/i,
      /\bis (that|this) (right|correct)\b/i,
      /\bso .* (right|correct)\?\s*$/i,
      /\bdo i (have|understand) (this|that|it)\b/i,
    ],
  },
  {
    intent: "CHALLENGE",
    patterns: [
      /\b(quiz|test|challenge) me\b/i,
      /\bgive me a (harder|tougher|challenging) (question|problem)\b/i,
      /\bmake it harder\b/i,
      /\bi'?m ready for (more|harder)\b/i,
    ],
  },
  {
    intent: "DEEPEN",
    patterns: [
      /\b(go |explain in )?(deep(er)?|more detail|more depth)\b/i,
      /\bedge case/i,
      /\bwhat (happens|if) .*\b(full|empty|fails?|breaks?|overflows?)\b/i,
      /\bunder the hood\b/i,
      /\bmore (advanced|technical)\b/i,
      /\bwhat about when\b/i,
    ],
  },
  {
    intent: "WHY",
    patterns: [
      /^\s*why\b/i,
      /\bwhy (is|are|does|do|can'?t|would|should)\b/i,
      /\bhow come\b/i,
      /\bwhat makes (it|this|that)\b/i,
      /\bwhat'?s the reason\b/i,
      /\bwhat causes\b/i,
    ],
  },
  {
    intent: "CLARIFY",
    patterns: [
      /\bi (don'?t|do not|can'?t) (understand|get|follow)\b/i,
      /\bi'?m (confused|lost|stuck|not sure)\b/i,
      /\b(this|that|it) (doesn'?t|does not) make sense\b/i,
      /\bwhat (do(es)?|did) (you|that|this) mean\b/i,
      /\bunclear\b/i,
      /\bcan you (clarify|rephrase|say that again)\b/i,
      /\bwait,?\b/i,
    ],
  },
];

const OFF_TOPIC_PATTERNS: RegExp[] = [
  /\b(weather|sports?|football|basketball|movie|film|music|song|celebrity|politics|election|recipe|cook(ing)?|restaurant|vacation|holiday|dating|crypto price|stock price|joke|meme)\b/i,
  /\bwho (won|is winning)\b/i,
  /\bwhat time is it\b/i,
  /\btell me a story\b/i,
];

/**
 * Classify a learner message. When `conceptKeywords` are supplied, an
 * apparently off-topic message that mentions the concept is kept on-topic.
 */
export function classifyIntentHeuristic(
  message: string,
  hint?: ConversationIntent | null,
  conceptKeywords: string[] = [],
): IntentGuess {
  if (hint) return { intent: hint, source: "hint" };

  const text = message.trim();
  if (text.length === 0) return { intent: "CLARIFY", source: "default" };

  const mentionsConcept = conceptKeywords.some(
    (k) => k.length > 2 && text.toLowerCase().includes(k.toLowerCase()),
  );
  if (
    !mentionsConcept &&
    OFF_TOPIC_PATTERNS.some((p) => p.test(text)) &&
    // a bare "why is the sky blue" during a lesson is off-topic; keep the
    // check conservative so real questions are never rejected.
    !RULES.slice(0, 8).some((r) => r.patterns.some((p) => p.test(text)))
  ) {
    return { intent: "OFF_TOPIC", source: "heuristic" };
  }

  for (const rule of RULES) {
    if (rule.patterns.some((p) => p.test(text))) {
      return { intent: rule.intent, source: "heuristic" };
    }
  }

  return { intent: "CLARIFY", source: "default" };
}

/** Intents that benefit from source retrieval on a source-grounded lesson. */
export const SOURCE_SEEKING_INTENTS: ReadonlySet<ConversationIntent> = new Set([
  "CLARIFY",
  "WHY",
  "EXAMPLE",
  "COMPARE",
  "CONNECT",
  "DEEPEN",
  "CHECK_UNDERSTANDING",
]);

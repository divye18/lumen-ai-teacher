import type { ConversationContext } from "./context";
import type { ConversationIntent, TeacherReply } from "./contracts";

/**
 * DETERMINISTIC CONVERSATIONAL RESPONSES.
 *
 * Used when no language model is configured. Honest and useful, never faked:
 * each response is built from the concept summary + the learner's message and
 * is clearly a short deterministic answer, not a rich AI explanation. The
 * caller marks `source: "deterministic"` and the UI says so.
 */

/** First 1–2 sentences of the concept summary — a safe factual base. */
function gist(summary: string, maxSentences = 2): string {
  const sentences = summary
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 3)
    .slice(0, maxSentences);
  return sentences.join(" ") || summary.slice(0, 240);
}

const UNAVAILABLE_NOTE =
  "A fuller AI explanation isn't available right now — here's the short version.";

export function deterministicReply(
  ctx: ConversationContext,
  intent: ConversationIntent,
  message: string,
): TeacherReply {
  const concept = ctx.concept.title;
  const summary = gist(ctx.concept.summary);
  void message;

  switch (intent) {
    case "OFF_TOPIC":
      return {
        intent,
        answer: `That's an interesting question, but let's keep this session focused on ${concept}. We can come back to it once you've got this concept down.`,
        keyPoint: `Staying focused on ${concept} for now.`,
        followUpPrompt: `Want to keep going with ${concept}?`,
        explanationStyle: null,
        misconceptionSignal: null,
        groundedInSource: false,
        suggestVisual: "none",
      };

    case "EXAMPLE":
      return {
        intent,
        answer: `${UNAVAILABLE_NOTE} Think of ${concept} in terms of what the summary describes: ${summary} Try to picture a specific situation where that trade-off matters.`,
        keyPoint: `${concept}: ${summary}`,
        followUpPrompt: "Want to try applying it to a scenario?",
        explanationStyle: "example",
        misconceptionSignal: null,
        groundedInSource: false,
        suggestVisual: "none",
      };

    case "COMPARE":
      return {
        intent,
        answer: `${UNAVAILABLE_NOTE} ${summary} The comparison view below lays out how the two sides differ.`,
        keyPoint: `${concept} is best understood by contrasting its parts.`,
        followUpPrompt: null,
        explanationStyle: "comparison",
        misconceptionSignal: null,
        groundedInSource: false,
        suggestVisual: "comparison",
      };

    case "SIMPLIFY":
      return {
        intent,
        answer: `${UNAVAILABLE_NOTE} In the simplest terms: ${gist(ctx.concept.summary, 1)}`,
        keyPoint: gist(ctx.concept.summary, 1),
        followUpPrompt: "Does that make it clearer?",
        explanationStyle: "definition",
        misconceptionSignal: null,
        groundedInSource: false,
        suggestVisual: "simpler",
      };

    case "CHALLENGE":
      return {
        intent,
        answer: `Here's a question to test yourself on ${concept}: in your own words, what would go wrong if it worked the opposite way? ${UNAVAILABLE_NOTE}`,
        keyPoint: `Challenge: reason about ${concept} from the opposite direction.`,
        followUpPrompt: null,
        explanationStyle: "stepwise",
        misconceptionSignal: null,
        groundedInSource: false,
        suggestVisual: "none",
      };

    case "CHECK_UNDERSTANDING":
      return {
        intent,
        answer: `${UNAVAILABLE_NOTE} Compare your understanding against this: ${summary} If your version matches, you're on track.`,
        keyPoint: summary,
        followUpPrompt: "Want a question to confirm it?",
        explanationStyle: "definition",
        misconceptionSignal: null,
        groundedInSource: false,
        suggestVisual: "none",
      };

    default:
      // CLARIFY / WHY / DEEPEN / CONNECT
      return {
        intent,
        answer: `${UNAVAILABLE_NOTE} On ${concept}: ${summary}`,
        keyPoint: summary,
        followUpPrompt: `Want to keep going with ${concept}?`,
        explanationStyle: intent === "WHY" ? "causal" : "definition",
        misconceptionSignal: null,
        groundedInSource: false,
        suggestVisual: "none",
      };
  }
}

/**
 * CONVERSATIONAL TEACHING INTELLIGENCE.
 *
 * A side channel to the teaching loop: the learner can interrupt a step with a
 * natural-language question, Lumen infers the educational intent and answers in
 * context, and the deterministic lesson state machine is untouched.
 */
export {
  CONVERSATION_INTENTS,
  conversationIntentSchema,
  conversationRequestSchema,
  teacherReplySchema,
  type ConversationIntent,
  type ConversationRequest,
  type TeacherReply,
  type TeacherReplyView,
} from "./contracts";
export {
  classifyIntentHeuristic,
  SOURCE_SEEKING_INTENTS,
  type IntentGuess,
} from "./intent";
export {
  loadConversationContext,
  type ConversationContext,
  type ConversationTurn,
} from "./context";
export {
  runConversationTurn,
  composeConversationReply,
  type ConversationDeps,
  type ComposeDeps,
  type ComposeResult,
} from "./service";

/**
 * Deterministic structured assessment.
 *
 *   pickStructuredQuestion  ->  StructuredQuestion  (authored bank | grounded template)
 *   toClientStructured      ->  ClientStructuredQuestion  (no answer key)
 *   gradeStructuredAnswer   ->  RichAnswerEvaluation-shaped result  (pure, no LLM)
 *
 * The grader output flows through the same learner-state pipeline as the LLM
 * evaluator, so mastery movement, misconception planning and the adaptive next
 * decision are unchanged.
 */
export {
  structuredQuestionSchema,
  structuredAnswerSchema,
  misconceptionRefSchema,
  toClientStructured,
  structuredQuestionFromRow,
  type StructuredQuestion,
  type StructuredAnswer,
  type StructuredFormat,
  type ClientStructuredQuestion,
  type MisconceptionRef,
  type Choice,
} from "./contracts";
export { gradeStructuredAnswer, type StructuredGradeResult } from "./grader";
export {
  pickStructuredQuestion,
  type PickStructuredInput,
  type PickedStructuredQuestion,
} from "./select";
export { generateStructuredFromTemplate } from "./template";
export { ASSESSMENT_BANK, type BankEntry } from "./bank";
export { MISCONCEPTIONS, type MisconceptionKey } from "./misconceptions";

/**
 * Visual directive engine.
 *
 * Principle 16/17: raw model output never directly controls the frontend.
 * Everything the learner sees is a `VisualDirective` that passed
 * `validateVisualDirective`. The deterministic `resolveVisual` builds one from
 * a concept + the learner's live state with no model in the loop.
 */
export {
  validateVisualDirective,
  textFallback,
  coerceVisualDirective,
} from "./validate";
export {
  resolveVisual,
  visualSignalFromState,
  type ResolveVisualInput,
  type ResolvedVisual,
  type LearnerVisualSignal,
} from "./resolver";
export {
  VISUAL_CATALOGUE,
  type CatalogueEntry,
  type VisualVariants,
} from "./catalogue";

export { visualDirectiveSchema, type VisualDirective } from "@/types/visuals";

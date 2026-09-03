/**
 * Knowledge graph — learner-aware concept relationship layer.
 *
 *   extraction → normalize → validate → importance → persist → read
 *
 * The read model (`getKnowledgeGraph`) merges the static structure with live
 * learner state. Graph intelligence enhances the teaching engine but is never
 * a hard dependency — every stage has a deterministic fallback.
 */
export {
  extractedConceptSchema,
  extractedRelationshipSchema,
  extractedGraphSchema,
  type ExtractedConcept,
  type ExtractedRelationship,
  type ExtractedGraph,
} from "./contracts";
export {
  normalizeGraph,
  normalizeConceptTitle,
  rawFromExtraction,
  type NormalizedGraph,
  type NormalizedConcept,
  type NormalizedEdge,
  type RawConcept,
  type RawEdge,
} from "./normalize";
export {
  validateGraph,
  ORDERING_EDGE_TYPES,
  type ValidatedGraph,
  type RejectedEdge,
} from "./validate";
export { computeImportance, type ImportanceInput } from "./importance";
export { layoutGraph, type GraphLayout, type LayoutPosition } from "./layout";
export {
  extractConcepts,
  graphFromPlan,
  type ExtractConceptsInput,
  type ExtractConceptsResult,
  type PlanConceptSeed,
} from "./extraction";
export {
  buildAndPersistGraph,
  computeGraph,
  type BuildGraphInput,
  type BuildGraphResult,
} from "./build";
export {
  getKnowledgeGraph,
  type KnowledgeGraphView,
  type KnowledgeGraphNode,
  type KnowledgeGraphEdge,
  type GraphMisconception,
  type GetKnowledgeGraphOptions,
} from "./read";
export {
  buildGraphTeachingSignal,
  graphSignalFromView,
  loadBearingExplanation,
  type GraphTeachingSignal,
  type GraphSignalConcept,
  type GraphSignalEdge,
} from "./select";

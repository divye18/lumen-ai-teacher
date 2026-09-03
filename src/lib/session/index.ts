export {
  createTeachingOrchestrator,
  type TeachingOrchestrator,
  type OrchestratorDeps,
} from "./orchestrator";
export {
  buildPolicyFacts,
  buildEngineConcept,
  buildEngineSignal,
  currentStrategy,
  triedStrategies,
  type SessionContextData,
} from "./context";
export {
  toTeachingCitation,
  toTeachingCitations,
  buildSourceContextText,
  type TeachingCitation,
} from "./citations";
export type * from "./views";

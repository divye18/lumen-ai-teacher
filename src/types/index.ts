/**
 * Lumen domain contracts.
 *
 * These types describe the shape of the system we are building toward. Runtime
 * behaviour lives in `src/lib/*`. Where a type is derived from a Zod schema,
 * the schema is the source of truth and is exported alongside it.
 */
export * from "./common";
export * from "./concept";
export * from "./document";
export * from "./learner";
export * from "./misconception";
export * from "./visuals";
export * from "./teaching";
export * from "./lesson";
export * from "./assessment";
export * from "./report";

import { z } from "zod";

/**
 * VISUAL DIRECTIVE CONTRACT
 *
 * A VisualDirective is a *declarative* instruction describing what the learner
 * should see. It is produced (indirectly) from AI output and MUST pass schema
 * validation before any renderer touches it.
 *
 * Hard rule: a directive can never carry executable code, script, HTML, or
 * arbitrary URLs. The 3D renderer maps `scene` / `objects` values to a fixed
 * catalogue of known, pre-approved scenes. Anything unrecognised degrades to
 * TEXT.
 */

export const VISUAL_MODES = [
  "TEXT",
  "DIAGRAM",
  "CHART",
  "ANIMATION",
  "CODE_VISUALIZATION",
  "INTERACTIVE_SIMULATION",
  "THREE_D",
] as const;

export type VisualMode = (typeof VISUAL_MODES)[number];

/** Safe identifier: letters, digits, dash, underscore, dot. No paths, no URLs. */
const safeKey = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-zA-Z0-9._-]+$/, "must be a plain identifier, not a path or URL");

const label = z.object({
  /** Key of the target object/part this label points at. */
  target: safeKey,
  text: z.string().min(1).max(240),
});

const namedAnimation = z.object({
  /** Name of a renderer-known animation clip. */
  name: safeKey,
  loop: z.boolean().default(false),
  /** Playback speed multiplier. */
  speed: z.number().positive().max(8).default(1),
});

const cameraDirective = z.object({
  /** Renderer-known camera preset, e.g. "front", "orbit-left". */
  preset: safeKey,
  /** Optional eased transition duration in milliseconds. */
  transitionMs: z.number().int().min(0).max(10_000).optional(),
});

const sceneObject = z.object({
  /** Instance key, unique within the directive. */
  key: safeKey,
  /** Renderer-known object/model type. */
  type: safeKey,
  /** Optional renderer-known variant. */
  variant: safeKey.optional(),
});

const threeDDirective = z.object({
  /** Renderer-known scene id. Unknown ids degrade to TEXT. */
  scene: safeKey,
  /** Object keys to visually emphasise. */
  highlight: z.array(safeKey).max(32).default([]),
  /** Object keys to visually de-emphasise. */
  dim: z.array(safeKey).max(32).default([]),
  labels: z.array(label).max(32).default([]),
  animation: namedAnimation.optional(),
  /** Ordinal step within a multi-step scene walkthrough. */
  step: z.number().int().min(0).max(512).optional(),
  camera: cameraDirective.optional(),
  objects: z.array(sceneObject).max(64).default([]),
});

const chartSeries = z.object({
  name: z.string().min(1).max(120),
  points: z.array(z.object({ x: z.number(), y: z.number() })).max(2_048),
});

const chartDirective = z.object({
  kind: z.enum(["line", "bar", "scatter", "area"]),
  title: z.string().max(200).optional(),
  xLabel: z.string().max(120).optional(),
  yLabel: z.string().max(120).optional(),
  series: z.array(chartSeries).min(1).max(12),
});

const diagramNode = z.object({
  key: safeKey,
  text: z.string().min(1).max(240),
});

const diagramEdge = z.object({
  from: safeKey,
  to: safeKey,
  text: z.string().max(240).optional(),
});

const diagramDirective = z.object({
  layout: z.enum(["flow", "tree", "graph"]).default("flow"),
  nodes: z.array(diagramNode).min(1).max(64),
  edges: z.array(diagramEdge).max(128).default([]),
});

const codeVisualizationDirective = z.object({
  language: safeKey,
  code: z.string().min(1).max(8_000),
  /** 1-indexed line numbers to highlight. */
  highlightLines: z.array(z.number().int().positive()).max(200).default([]),
  /** Optional stepped walkthrough of the code. */
  steps: z
    .array(
      z.object({
        line: z.number().int().positive(),
        note: z.string().min(1).max(400),
      }),
    )
    .max(200)
    .default([]),
});

const simulationDirective = z.object({
  /** Renderer-known simulation id. Unknown ids degrade to TEXT. */
  sim: safeKey,
  /** Named numeric parameters within safe bounds, interpreted by the renderer. */
  params: z.record(z.string(), z.number()).default({}),
});

/**
 * The discriminated union of every supported visual mode.
 * `caption` is always allowed and is plain text.
 */
export const visualDirectiveSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("TEXT"), caption: z.string().max(2_000) }),
  z.object({
    mode: z.literal("DIAGRAM"),
    caption: z.string().max(2_000).optional(),
    diagram: diagramDirective,
  }),
  z.object({
    mode: z.literal("CHART"),
    caption: z.string().max(2_000).optional(),
    chart: chartDirective,
  }),
  z.object({
    mode: z.literal("ANIMATION"),
    caption: z.string().max(2_000).optional(),
    animation: namedAnimation,
  }),
  z.object({
    mode: z.literal("CODE_VISUALIZATION"),
    caption: z.string().max(2_000).optional(),
    codeVisualization: codeVisualizationDirective,
  }),
  z.object({
    mode: z.literal("INTERACTIVE_SIMULATION"),
    caption: z.string().max(2_000).optional(),
    simulation: simulationDirective,
  }),
  z.object({
    mode: z.literal("THREE_D"),
    caption: z.string().max(2_000).optional(),
    threeD: threeDDirective,
  }),
]);

export type VisualDirective = z.infer<typeof visualDirectiveSchema>;

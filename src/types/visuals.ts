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
  "COMPARISON",
  "FORMULA",
  "TIMELINE",
  "CONCEPT_MAP",
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

const comparisonColumn = z.object({
  title: z.string().min(1).max(120),
  points: z.array(z.string().min(1).max(300)).min(1).max(10),
});

const comparisonDirective = z.object({
  title: z.string().min(1).max(200),
  left: comparisonColumn,
  right: comparisonColumn,
  /** Free-text row labels aligning left/right points, when they pair up. */
  rows: z.array(z.string().min(1).max(120)).max(10).default([]),
  /** Short phrase naming the dimension that matters most. */
  highlight: z.string().max(120).optional(),
});

const formulaDirective = z.object({
  /** Plain-text formula, e.g. "AMAT = HitTime + MissRate x MissPenalty". */
  expression: z.string().min(1).max(400),
  /** Each symbol explained in plain language. */
  terms: z
    .array(
      z.object({
        symbol: z.string().min(1).max(60),
        meaning: z.string().min(1).max(240),
      }),
    )
    .max(16)
    .default([]),
  /** Optional worked example lines. */
  example: z.array(z.string().min(1).max(240)).max(8).default([]),
});

const timelineDirective = z.object({
  title: z.string().max(200).optional(),
  events: z
    .array(
      z.object({
        label: z.string().min(1).max(120),
        detail: z.string().max(300).optional(),
      }),
    )
    .min(2)
    .max(24),
});

const conceptMapDirective = z.object({
  /** The concept at the centre of the map. */
  root: z.string().min(1).max(120),
  branches: z
    .array(
      z.object({
        label: z.string().min(1).max(120),
        relation: z.string().max(60).optional(),
        children: z.array(z.string().min(1).max(120)).max(8).default([]),
      }),
    )
    .min(1)
    .max(12),
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
  z.object({
    mode: z.literal("COMPARISON"),
    caption: z.string().max(2_000).optional(),
    comparison: comparisonDirective,
  }),
  z.object({
    mode: z.literal("FORMULA"),
    caption: z.string().max(2_000).optional(),
    formula: formulaDirective,
  }),
  z.object({
    mode: z.literal("TIMELINE"),
    caption: z.string().max(2_000).optional(),
    timeline: timelineDirective,
  }),
  z.object({
    mode: z.literal("CONCEPT_MAP"),
    caption: z.string().max(2_000).optional(),
    conceptMap: conceptMapDirective,
  }),
]);

export type VisualDirective = z.infer<typeof visualDirectiveSchema>;

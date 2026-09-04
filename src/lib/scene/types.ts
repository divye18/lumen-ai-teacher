/**
 * 3D EDUCATIONAL SCENE — validated state.
 *
 * A `SceneState` is the ONLY thing the React Three Fiber renderer consumes. It
 * is built by `resolveScene` from (a) a fixed catalogue and (b) a
 * schema-validated `THREE_D` directive. The renderer never sees model output,
 * URLs, code, or arbitrary geometry — only known object types placed at known
 * coordinates.
 */

/** The complete whitelist of object types the renderer can draw. */
export const SCENE_OBJECT_TYPES = [
  "memory-layer",
  "cpu",
  "connector",
  "stack-frame",
  "pointer",
  "heap-block",
  "packet",
  "node",
  "link",
] as const;
export type SceneObjectType = (typeof SCENE_OBJECT_TYPES)[number];

export const CAMERA_PRESETS = [
  "front",
  "hero",
  "orbit-left",
  "orbit-right",
  "top",
  "close",
] as const;
export type CameraPreset = (typeof CAMERA_PRESETS)[number];

export interface SceneObjectState {
  key: string;
  type: SceneObjectType;
  label: string;
  /** Longer text shown when the object is selected. */
  detail?: string;
  position: [number, number, number];
  /** Relative size 0.2..3. */
  size: number;
  /** Accent 0..1 used to tint the object (e.g. speed, temperature). */
  intensity: number;
  /** Grouping key for "isolate this subsystem" interactions. */
  group?: string;
  highlighted: boolean;
  dimmed: boolean;
}

export interface SceneStep {
  label: string;
  caption: string;
  highlight: string[];
  camera?: CameraPreset;
}

export interface SceneState {
  id: string;
  title: string;
  summary: string;
  objects: SceneObjectState[];
  connectors: { from: string; to: string }[];
  steps: SceneStep[];
  activeStep: number;
  camera: CameraPreset;
}

/**
 * 3D educational scene engine.
 *
 *   VisualDirective (THREE_D)  ->  resolveScene  ->  SceneState  ->  R3F renderer
 *
 * The renderer only ever consumes a `SceneState` built from the fixed
 * `SCENE_CATALOGUE`. Unknown scenes and object types degrade to a 2D/text
 * fallback — a scene failure never blocks the lesson.
 */
export {
  SCENE_CATALOGUE,
  KNOWN_SCENE_IDS,
  type CatalogueScene,
  type CatalogueObject,
} from "./catalogue";
export { resolveScene, isRenderableScene } from "./resolver";
export {
  SCENE_OBJECT_TYPES,
  CAMERA_PRESETS,
  type SceneState,
  type SceneObjectState,
  type SceneStep,
  type SceneObjectType,
  type CameraPreset,
} from "./types";

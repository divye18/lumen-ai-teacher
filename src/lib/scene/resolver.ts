import type { VisualDirective } from "@/types/visuals";
import { ValidationError } from "@/lib/errors";
import { err, ok, type Result } from "@/lib/result";

import { SCENE_CATALOGUE } from "./catalogue";
import {
  CAMERA_PRESETS,
  SCENE_OBJECT_TYPES,
  type CameraPreset,
  type SceneObjectState,
  type SceneState,
} from "./types";

/**
 * SCENE RESOLVER — the single boundary between a validated `THREE_D` directive
 * and the 3D renderer.
 *
 *   directive.scene (id)  ->  catalogue lookup
 *   directive.highlight / dim / labels / step / camera  ->  applied
 *
 * Unknown scene id, unknown object type, or out-of-range step  ->  a typed
 * error, and the caller renders the TEXT / 2D fallback instead. The renderer
 * therefore only ever receives known object types at authored coordinates.
 */

type ThreeDDirective = Extract<VisualDirective, { mode: "THREE_D" }>["threeD"];

function isCameraPreset(v: string | undefined): v is CameraPreset {
  return !!v && (CAMERA_PRESETS as readonly string[]).includes(v);
}

export function resolveScene(
  directive: ThreeDDirective,
): Result<SceneState, ValidationError> {
  const scene = SCENE_CATALOGUE[directive.scene];
  if (!scene) {
    return err(
      new ValidationError(`Unknown 3D scene "${directive.scene}".`, [
        { path: ["scene"], message: "not in the scene catalogue" },
      ]),
    );
  }

  // Any object type the catalogue uses must be on the renderer whitelist.
  const allowed = new Set<string>(SCENE_OBJECT_TYPES);
  for (const o of scene.objects) {
    if (!allowed.has(o.type)) {
      return err(
        new ValidationError(`Scene "${scene.id}" uses unknown object type.`, [
          { path: ["objects", o.key], message: `type "${o.type}" not allowed` },
        ]),
      );
    }
  }

  const objectKeys = new Set(scene.objects.map((o) => o.key));
  const highlight = new Set(
    directive.highlight.filter((k) => objectKeys.has(k)),
  );
  const dim = new Set(directive.dim.filter((k) => objectKeys.has(k)));
  const labelByTarget = new Map(
    directive.labels
      .filter((l) => objectKeys.has(l.target))
      .map((l) => [l.target, l.text]),
  );

  const stepIndex =
    typeof directive.step === "number"
      ? Math.min(
          Math.max(0, directive.step),
          Math.max(0, scene.steps.length - 1),
        )
      : 0;
  const activeStep = scene.steps[stepIndex];

  // Directive highlight wins; otherwise fall back to the step's own highlight.
  const effectiveHighlight =
    highlight.size > 0 ? highlight : new Set(activeStep?.highlight ?? []);

  const camera: CameraPreset = isCameraPreset(directive.camera?.preset)
    ? (directive.camera!.preset as CameraPreset)
    : (activeStep?.camera ?? scene.camera);

  const objects: SceneObjectState[] = scene.objects.map((o) => ({
    key: o.key,
    type: o.type,
    label: labelByTarget.get(o.key) ?? o.label,
    detail: o.detail,
    position: o.position,
    size: o.size,
    intensity: o.intensity,
    group: o.group,
    highlighted: effectiveHighlight.has(o.key),
    dimmed: dim.has(o.key),
  }));

  return ok({
    id: scene.id,
    title: scene.title,
    summary: scene.summary,
    objects,
    connectors: scene.connectors,
    steps: scene.steps,
    activeStep: stepIndex,
    camera,
  });
}

/** True when a directive could produce a real 3D scene (renderer can try). */
export function isRenderableScene(directive: unknown): boolean {
  if (
    !directive ||
    typeof directive !== "object" ||
    (directive as { mode?: string }).mode !== "THREE_D"
  ) {
    return false;
  }
  const scene = (directive as { threeD?: { scene?: string } }).threeD?.scene;
  return typeof scene === "string" && scene in SCENE_CATALOGUE;
}

"use client";

import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, RoundedBox, Text } from "@react-three/drei";
import * as THREE from "three";

import type { CameraPreset, SceneObjectState, SceneState } from "@/lib/scene";

/**
 * R3F renderer for a validated `SceneState`. Every object is a known type at an
 * authored coordinate — there is no path from model output to geometry here.
 * Interaction (hover / select / step highlight) teaches: emphasis follows the
 * teacher's explanation.
 */

const CAMERA_POSITIONS: Record<CameraPreset, [number, number, number]> = {
  front: [0, 0, 11],
  hero: [6, 3.5, 10],
  "orbit-left": [-9, 2, 7],
  "orbit-right": [9, 2, 7],
  top: [0, 11, 0.001],
  close: [3, 1.5, 6],
};

function tint(intensity: number): THREE.Color {
  // cold (slow/far) -> warm (fast/near)
  const cold = new THREE.Color("#3b5bdb");
  const warm = new THREE.Color("#f08c00");
  return cold.clone().lerp(warm, Math.min(1, Math.max(0, intensity)));
}

function SceneObject({
  object,
  selected,
  onHover,
  onSelect,
}: {
  object: SceneObjectState;
  selected: boolean;
  onHover: (key: string | null) => void;
  onSelect: (key: string) => void;
}) {
  const ref = useRef<THREE.Group>(null);
  const baseColor = useMemo(() => tint(object.intensity), [object.intensity]);
  const active = object.highlighted || selected;

  useFrame((_, delta) => {
    if (!ref.current) return;
    const target = active ? 1.06 : 1;
    ref.current.scale.lerp(
      new THREE.Vector3(target, target, target),
      Math.min(1, delta * 6),
    );
  });

  const opacity = object.dimmed ? 0.28 : 1;
  const emissiveIntensity = active ? 0.9 : 0.18;

  const common = {
    onPointerOver: (e: THREE.Event) => {
      (e as unknown as { stopPropagation: () => void }).stopPropagation();
      onHover(object.key);
    },
    onPointerOut: () => onHover(null),
    onClick: (e: THREE.Event) => {
      (e as unknown as { stopPropagation: () => void }).stopPropagation();
      onSelect(object.key);
    },
  };

  let body: React.ReactNode;
  if (object.type === "node" || object.type === "packet") {
    const r = (object.type === "packet" ? 0.28 : 0.55) * object.size;
    body = (
      <mesh {...common}>
        <sphereGeometry args={[r, 32, 32]} />
        <meshStandardMaterial
          color={baseColor}
          emissive={baseColor}
          emissiveIntensity={emissiveIntensity}
          transparent
          opacity={opacity}
          roughness={0.35}
        />
      </mesh>
    );
  } else if (object.type === "pointer") {
    body = (
      <mesh {...common} rotation={[0, 0, -Math.PI / 2]}>
        <coneGeometry args={[0.28 * object.size, 0.7 * object.size, 24]} />
        <meshStandardMaterial
          color={baseColor}
          emissive={baseColor}
          emissiveIntensity={active ? 1 : 0.4}
          transparent
          opacity={opacity}
        />
      </mesh>
    );
  } else {
    const w =
      object.type === "memory-layer" || object.type === "stack-frame"
        ? object.size * 1.5
        : object.size;
    const h = object.type === "memory-layer" ? 0.7 : object.size * 0.7;
    const d = object.type === "memory-layer" ? 1.4 : object.size * 0.9;
    body = (
      <RoundedBox args={[w, h, d]} radius={0.08} smoothness={4} {...common}>
        <meshStandardMaterial
          color={baseColor}
          emissive={baseColor}
          emissiveIntensity={emissiveIntensity}
          transparent
          opacity={opacity}
          roughness={0.4}
          metalness={0.1}
        />
      </RoundedBox>
    );
  }

  return (
    <group ref={ref} position={object.position}>
      {body}
      <Text
        position={[
          0,
          object.type === "memory-layer" ? 0 : 0.95 * object.size,
          0.75,
        ]}
        fontSize={0.26}
        color={object.dimmed ? "#8891a5" : active ? "#ffffff" : "#c3cbdb"}
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.008}
        outlineColor="#0b0f1a"
      >
        {object.label}
      </Text>
    </group>
  );
}

function Connectors({
  connectors,
  objects,
}: {
  connectors: { from: string; to: string }[];
  objects: SceneObjectState[];
}) {
  const byKey = new Map(objects.map((o) => [o.key, o]));
  return (
    <>
      {connectors.map((c, i) => {
        const a = byKey.get(c.from);
        const b = byKey.get(c.to);
        if (!a || !b) return null;
        const start = new THREE.Vector3(...a.position);
        const end = new THREE.Vector3(...b.position);
        const mid = start.clone().lerp(end, 0.5);
        const len = start.distanceTo(end);
        const dir = end.clone().sub(start).normalize();
        const quat = new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          dir,
        );
        return (
          <mesh key={i} position={mid.toArray()} quaternion={quat}>
            <cylinderGeometry args={[0.03, 0.03, len, 8]} />
            <meshBasicMaterial color="#4b5570" transparent opacity={0.5} />
          </mesh>
        );
      })}
    </>
  );
}

function CameraRig({ preset }: { preset: CameraPreset }) {
  const target = useMemo(
    () => new THREE.Vector3(...CAMERA_POSITIONS[preset]),
    [preset],
  );
  useFrame(({ camera }, delta) => {
    camera.position.lerp(target, Math.min(1, delta * 1.6));
    camera.lookAt(0, 0, 0);
  });
  return null;
}

export default function SceneCanvas({
  scene,
  selectedKey,
  onHover,
  onSelect,
}: {
  scene: SceneState;
  selectedKey: string | null;
  onHover: (key: string | null) => void;
  onSelect: (key: string) => void;
}) {
  return (
    <Canvas
      camera={{ position: CAMERA_POSITIONS[scene.camera], fov: 42 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
      onPointerMissed={() => onSelect("")}
    >
      <color attach="background" args={["#0b0f1a"]} />
      <fog attach="fog" args={["#0b0f1a", 12, 28]} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 8, 6]} intensity={1.1} />
      <pointLight position={[-6, -4, 4]} intensity={0.4} color="#5b8cff" />

      <CameraRig preset={scene.camera} />
      <Connectors connectors={scene.connectors} objects={scene.objects} />
      {scene.objects.map((o) => (
        <SceneObject
          key={o.key}
          object={o}
          selected={selectedKey === o.key}
          onHover={onHover}
          onSelect={onSelect}
        />
      ))}

      <OrbitControls
        enablePan={false}
        enableZoom
        minDistance={5}
        maxDistance={20}
        makeDefault
      />
    </Canvas>
  );
}

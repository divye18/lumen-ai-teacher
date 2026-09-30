"use client";

import { useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { LumenCoreIntensity } from "./lumen-core";

const EMERALD_TINT = new THREE.Color("#0d4036");
const GOLD_EMISSIVE = new THREE.Color("#e6c887");

function CoreGeometry({
  intensity,
  interactive,
  reduceMotion,
}: {
  intensity: LumenCoreIntensity;
  interactive: boolean;
  reduceMotion: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const outerRef = useRef<THREE.Mesh>(null);
  const innerRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);

  const targetRotation = useRef(new THREE.Vector2(0, 0));
  const currentRotation = useRef(new THREE.Vector2(0, 0));

  useFrame((state, delta) => {
    if (!groupRef.current || !outerRef.current || !innerRef.current) return;

    if (!reduceMotion) {
      // Slow architectural rotation
      outerRef.current.rotation.y += 0.05 * delta;
      outerRef.current.rotation.x += 0.02 * delta;

      innerRef.current.rotation.y -= 0.08 * delta;
      innerRef.current.rotation.z += 0.03 * delta;
    }

    if (interactive) {
      // Subtle hover parallax
      if (hovered) {
        targetRotation.current.x = (state.pointer.y * Math.PI) / 8;
        targetRotation.current.y = (state.pointer.x * Math.PI) / 8;
      } else {
        targetRotation.current.x = 0;
        targetRotation.current.y = 0;
      }

      currentRotation.current.lerp(targetRotation.current, 0.05);
      groupRef.current.rotation.x = currentRotation.current.x;
      groupRef.current.rotation.y = currentRotation.current.y;

      const scaleTarget = hovered && !reduceMotion ? 1.05 : 1;
      groupRef.current.scale.lerp(
        new THREE.Vector3(scaleTarget, scaleTarget, scaleTarget),
        0.1,
      );
    }
  });

  const emissiveStrength = intensity === "focus" ? 0.8 : 0.3;

  return (
    <group
      ref={groupRef}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
    >
      {/* Outer Shell: Icosahedron */}
      <mesh ref={outerRef}>
        <icosahedronGeometry args={[2.5, 0]} />
        <meshPhysicalMaterial
          color={EMERALD_TINT}
          metalness={0.15}
          roughness={0.2}
          transmission={0.9} // Glass-like
          thickness={1.5}
          ior={1.4}
          clearcoat={0.8}
          clearcoatRoughness={0.1}
          transparent
          opacity={1}
        />
      </mesh>

      {/* Inner Core: Octahedron */}
      <mesh ref={innerRef}>
        <octahedronGeometry args={[1.2, 0]} />
        <meshStandardMaterial
          color="#ffffff"
          emissive={GOLD_EMISSIVE}
          emissiveIntensity={emissiveStrength}
          roughness={0.5}
          metalness={0.8}
        />
      </mesh>
    </group>
  );
}

export default function LumenCoreCanvas({
  intensity,
  interactive,
  reduceMotion,
}: {
  intensity: LumenCoreIntensity;
  interactive: boolean;
  reduceMotion: boolean;
}) {
  return (
    <Canvas
      camera={{ position: [0, 0, 8], fov: 45 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
    >
      {/* Restrained controlled lighting */}
      <ambientLight intensity={0.4} color="#fff1e6" />
      <directionalLight position={[5, 5, 4]} intensity={1.5} color="#ffffff" />
      <directionalLight
        position={[-5, -2, -4]}
        intensity={0.8}
        color="#8db2e5"
      />
      <pointLight
        position={[0, 0, 0]}
        intensity={0.5}
        color={GOLD_EMISSIVE}
        distance={4}
      />

      <CoreGeometry
        intensity={intensity}
        interactive={interactive}
        reduceMotion={reduceMotion}
      />
    </Canvas>
  );
}

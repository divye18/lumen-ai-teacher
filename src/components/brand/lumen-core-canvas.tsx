"use client";

import { useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { View, PerspectiveCamera } from "@react-three/drei";
import * as THREE from "three";
import type { LumenCoreIntensity, LumenCoreState } from "./lumen-core";

const EMERALD_TINT = new THREE.Color("#0d4036");
const GOLD_EMISSIVE = new THREE.Color("#e6c887");
const MISCONCEPTION_TINT = new THREE.Color("#164E45");
const MASTERY_TINT = new THREE.Color("#ffffff");

function CoreGeometry({
  intensity,
  state,
  interactive,
  reduceMotion,
}: {
  intensity: LumenCoreIntensity;
  state: LumenCoreState;
  interactive: boolean;
  reduceMotion: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const outerRef = useRef<THREE.Mesh>(null);
  const innerRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);

  const targetRotation = useRef(new THREE.Vector2(0, 0));
  const currentRotation = useRef(new THREE.Vector2(0, 0));

  useFrame((sceneState, delta) => {
    if (!groupRef.current || !outerRef.current || !innerRef.current) return;

    if (!reduceMotion) {
      let outerY = 0.05;
      let outerX = 0.02;
      let innerY = -0.08;
      const innerZ = 0.03;

      if (state === "THINKING" ) {
         outerY = 0.01;
         innerY = -0.02;
      } else if (state === "MISCONCEPTION") {
         outerY = 0.15;
         outerX = -0.05;
         innerY = 0.2;
      } else if (state === "LISTENING") {
         outerY = 0.02;
         innerY = 0.01;
      } else if (state === "MASTERY") {
         outerY = 0.03;
         outerX = 0.01;
         innerY = -0.03;
      }

      outerRef.current.rotation.y += outerY * delta;
      outerRef.current.rotation.x += outerX * delta;
      innerRef.current.rotation.y += innerY * delta;
      innerRef.current.rotation.z += innerZ * delta;
    }

    let scaleTarget = hovered && !reduceMotion ? 1.05 : 1;
    if (state === "TEACHING") scaleTarget *= 1.1;
    if (state === "LISTENING") scaleTarget *= 0.95;
    if (state === "MISCONCEPTION") scaleTarget *= 0.9;
    
    groupRef.current.scale.lerp(
      new THREE.Vector3(scaleTarget, scaleTarget, scaleTarget),
      0.1,
    );

    if (interactive) {
      if (hovered) {
        targetRotation.current.x = (sceneState.pointer.y * Math.PI) / 8;
        targetRotation.current.y = (sceneState.pointer.x * Math.PI) / 8;
      } else {
        targetRotation.current.x = 0;
        targetRotation.current.y = 0;
      }
      currentRotation.current.lerp(targetRotation.current, 0.05);
      groupRef.current.rotation.x = currentRotation.current.x;
      groupRef.current.rotation.y = currentRotation.current.y;
    } else {
      if (state === "MASTERY" && !reduceMotion) {
        groupRef.current.rotation.x = THREE.MathUtils.lerp(groupRef.current.rotation.x, 0, 0.05);
        groupRef.current.rotation.y = THREE.MathUtils.lerp(groupRef.current.rotation.y, 0, 0.05);
      }
    }
  });

  const isMisconception = state === "MISCONCEPTION";
  const isMastery = state === "MASTERY";
  
  const emissiveStrength = isMastery ? 1.5 : (isMisconception ? 0.1 : (intensity === "focus" || state === "TEACHING" ? 0.8 : 0.3));
  const outerColor = isMastery ? MASTERY_TINT : (isMisconception ? MISCONCEPTION_TINT : EMERALD_TINT);

  return (
    <group
      ref={groupRef}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
    >
      {/* Outer Shell: Icosahedron */}
      <mesh ref={outerRef}>
        <icosahedronGeometry args={[2.5, isMisconception ? 1 : 0]} />
        <meshPhysicalMaterial
          color={outerColor}
          metalness={isMisconception ? 0.4 : 0.15}
          roughness={isMastery ? 0.05 : (isMisconception ? 0.4 : 0.2)}
          transmission={isMisconception ? 0.5 : 0.9} 
          thickness={1.5}
          ior={1.4}
          clearcoat={isMastery ? 1.0 : 0.8}
          clearcoatRoughness={0.1}
          transparent
          opacity={1}
        />
      </mesh>

      {/* Inner Core: Octahedron */}
      <mesh ref={innerRef}>
        <octahedronGeometry args={[1.2, isMastery ? 1 : 0]} />
        <meshStandardMaterial
          color="#ffffff"
          emissive={GOLD_EMISSIVE}
          emissiveIntensity={emissiveStrength}
          roughness={isMastery ? 0.1 : 0.5}
          metalness={isMastery ? 1.0 : 0.8}
        />
      </mesh>
    </group>
  );
}

export default function LumenCoreCanvas({
  intensity,
  state,
  interactive,
  reduceMotion,
  trackRef,
}: {
  intensity: LumenCoreIntensity;
  state: LumenCoreState;
  interactive: boolean;
  reduceMotion: boolean;
  trackRef: any // eslint-disable-line @typescript-eslint/no-explicit-any
}) {
  return (
    <View track={trackRef}>
      <PerspectiveCamera makeDefault position={[0, 0, 8]} fov={45} />
      <ambientLight intensity={state === "MISCONCEPTION" ? 0.1 : 0.4} color="#fff1e6" />
      <directionalLight position={[5, 5, 4]} intensity={state === "MASTERY" ? 2.0 : 1.5} color="#ffffff" />
      <directionalLight
        position={[-5, -2, -4]}
        intensity={state === "MISCONCEPTION" ? 1.5 : 0.8}
        color={state === "MISCONCEPTION" ? "#ffffff" : "#8db2e5"}
      />
      <pointLight
        position={[0, 0, 0]}
        intensity={state === "MASTERY" ? 1.5 : 0.5}
        color={GOLD_EMISSIVE}
        distance={4}
      />

      <CoreGeometry
        intensity={intensity}
        state={state}
        interactive={interactive}
        reduceMotion={reduceMotion}
      />
    </View>
  );
}

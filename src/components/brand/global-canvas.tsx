"use client";

import { Canvas } from "@react-three/fiber";
import { View } from "@react-three/drei";
import { useEffect, useState } from "react";

export function GlobalCanvas() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <Canvas
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        pointerEvents: "none",
        zIndex: 50,
      }}
      eventSource={typeof document !== "undefined" ? document.body : undefined}
      dpr={[1, 1.5]}
      gl={{ antialias: true, alpha: true }}
    >
      <View.Port />
    </Canvas>
  );
}

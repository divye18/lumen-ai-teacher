import type { CameraPreset, SceneObjectType, SceneStep } from "./types";

/**
 * SCENE CATALOGUE — the fixed set of educational 3D scenes.
 *
 * Every scene id used by a `THREE_D` directive must exist here or the directive
 * degrades to TEXT. Coordinates, sizes and labels are authored, not generated.
 */

export interface CatalogueObject {
  key: string;
  type: SceneObjectType;
  label: string;
  detail?: string;
  position: [number, number, number];
  size: number;
  intensity: number;
  group?: string;
}

export interface CatalogueScene {
  id: string;
  title: string;
  summary: string;
  objects: CatalogueObject[];
  connectors: { from: string; to: string }[];
  steps: SceneStep[];
  camera: CameraPreset;
}

export const SCENE_CATALOGUE: Record<string, CatalogueScene> = {
  memory_hierarchy: {
    id: "memory_hierarchy",
    title: "The memory hierarchy",
    summary:
      "Storage layers trade size for speed. The CPU checks the fastest, smallest layer first and only falls through to slower layers on a miss.",
    camera: "hero",
    objects: [
      {
        key: "cpu",
        type: "cpu",
        label: "CPU",
        detail: "Executes instructions. Wants data in ~1 nanosecond.",
        position: [0, 2.6, 0],
        size: 1.1,
        intensity: 1,
        group: "core",
      },
      {
        key: "l1",
        type: "memory-layer",
        label: "L1 cache",
        detail: "~64 KB · ~1 ns · on the CPU core.",
        position: [0, 1.4, 0],
        size: 1.2,
        intensity: 0.92,
        group: "cache",
      },
      {
        key: "l2",
        type: "memory-layer",
        label: "L2 cache",
        detail: "~512 KB · ~4 ns.",
        position: [0, 0.4, 0],
        size: 1.7,
        intensity: 0.78,
        group: "cache",
      },
      {
        key: "l3",
        type: "memory-layer",
        label: "L3 cache",
        detail: "~8 MB · ~12 ns · shared between cores.",
        position: [0, -0.7, 0],
        size: 2.3,
        intensity: 0.6,
        group: "cache",
      },
      {
        key: "ram",
        type: "memory-layer",
        label: "RAM",
        detail: "~16 GB · ~100 ns · the program's working memory.",
        position: [0, -2, 0],
        size: 3,
        intensity: 0.38,
        group: "main",
      },
      {
        key: "disk",
        type: "memory-layer",
        label: "SSD storage",
        detail: "~1 TB · ~100,000 ns · survives power off.",
        position: [0, -3.4, 0],
        size: 3.6,
        intensity: 0.16,
        group: "storage",
      },
    ],
    connectors: [
      { from: "cpu", to: "l1" },
      { from: "l1", to: "l2" },
      { from: "l2", to: "l3" },
      { from: "l3", to: "ram" },
      { from: "ram", to: "disk" },
    ],
    steps: [
      {
        label: "The layers",
        caption:
          "Each layer down is larger but slower and further from the CPU.",
        highlight: [],
        camera: "hero",
      },
      {
        label: "A cache hit",
        caption: "The CPU asks L1, finds the data, and keeps running. ~1 ns.",
        highlight: ["cpu", "l1"],
        camera: "close",
      },
      {
        label: "A cache miss",
        caption:
          "L1 and L2 miss; L3 has it. The line is copied up so the next access is fast.",
        highlight: ["l2", "l3"],
        camera: "orbit-left",
      },
      {
        label: "Falling through to RAM",
        caption:
          "Every cache misses. The CPU stalls ~100 ns waiting on RAM — 100x slower than L1.",
        highlight: ["ram"],
        camera: "front",
      },
    ],
  },

  call_stack: {
    id: "call_stack",
    title: "The call stack",
    summary:
      "Each function call pushes a frame holding its local variables. The frame on top is the code running right now; returning pops it.",
    camera: "hero",
    objects: [
      {
        key: "frame_main",
        type: "stack-frame",
        label: "main()",
        detail: "The bottom frame. Calls run(), then waits for it to return.",
        position: [0, -2, 0],
        size: 2.4,
        intensity: 0.35,
        group: "frames",
      },
      {
        key: "frame_run",
        type: "stack-frame",
        label: "run()",
        detail: "Called by main(). Local: count = 3. Calls step().",
        position: [0, -0.7, 0],
        size: 2.4,
        intensity: 0.55,
        group: "frames",
      },
      {
        key: "frame_step",
        type: "stack-frame",
        label: "step(n)",
        detail: "Called by run(). Local: n = 3. Currently executing.",
        position: [0, 0.6, 0],
        size: 2.4,
        intensity: 0.8,
        group: "frames",
      },
      {
        key: "frame_top",
        type: "pointer",
        label: "top",
        detail: "The stack pointer — always points at the frame in control.",
        position: [1.9, 0.6, 0],
        size: 0.6,
        intensity: 1,
        group: "pointer",
      },
    ],
    connectors: [
      { from: "frame_main", to: "frame_run" },
      { from: "frame_run", to: "frame_step" },
    ],
    steps: [
      {
        label: "Three calls deep",
        caption:
          "main() called run(), which called step(). Three frames, top is step().",
        highlight: ["frame_step", "frame_top"],
        camera: "hero",
      },
      {
        label: "step() returns",
        caption: "step() finishes. Its frame is popped and its locals vanish.",
        highlight: ["frame_run"],
        camera: "close",
      },
      {
        label: "Back in run()",
        caption:
          "'top' now points at run(). Execution resumes right after the call.",
        highlight: ["frame_run", "frame_top"],
        camera: "hero",
      },
      {
        label: "Unbounded recursion",
        caption:
          "If frames never pop, the stack grows past its limit — a stack overflow.",
        highlight: ["frame_main", "frame_run", "frame_step"],
        camera: "orbit-right",
      },
    ],
  },

  network_packets: {
    id: "network_packets",
    title: "Packets across a network",
    summary:
      "A message is split into packets. Each hops from router to router, and any packet can take a different path or be dropped.",
    camera: "hero",
    objects: [
      {
        key: "sender",
        type: "node",
        label: "Sender",
        detail: "Splits the message into numbered packets.",
        position: [-3.2, 0, 0],
        size: 1,
        intensity: 0.9,
        group: "hosts",
      },
      {
        key: "r1",
        type: "node",
        label: "Router A",
        detail: "Forwards packets toward the destination.",
        position: [-1, 1.1, 0],
        size: 0.8,
        intensity: 0.6,
        group: "routers",
      },
      {
        key: "r2",
        type: "node",
        label: "Router B",
        detail: "An alternate path. Congested right now.",
        position: [-1, -1.1, 0],
        size: 0.8,
        intensity: 0.6,
        group: "routers",
      },
      {
        key: "receiver",
        type: "node",
        label: "Receiver",
        detail:
          "Reassembles packets in order and asks for any that are missing.",
        position: [3.2, 0, 0],
        size: 1,
        intensity: 0.9,
        group: "hosts",
      },
      {
        key: "p1",
        type: "packet",
        label: "Packet 1",
        detail: "Took the top path.",
        position: [-1, 1.1, 0.4],
        size: 0.4,
        intensity: 1,
        group: "packets",
      },
      {
        key: "p2",
        type: "packet",
        label: "Packet 2",
        detail: "Took the bottom path and arrived later.",
        position: [-1, -1.1, 0.4],
        size: 0.4,
        intensity: 1,
        group: "packets",
      },
    ],
    connectors: [
      { from: "sender", to: "r1" },
      { from: "sender", to: "r2" },
      { from: "r1", to: "receiver" },
      { from: "r2", to: "receiver" },
    ],
    steps: [
      {
        label: "Split and send",
        caption: "The message becomes numbered packets, sent back to back.",
        highlight: ["sender"],
        camera: "hero",
      },
      {
        label: "Different paths",
        caption:
          "Packet 1 goes via Router A; Packet 2 via the slower Router B.",
        highlight: ["p1", "p2", "r1", "r2"],
        camera: "top",
      },
      {
        label: "Out of order",
        caption:
          "Packet 2 arrives after Packet 1. The receiver buffers and reorders.",
        highlight: ["receiver"],
        camera: "close",
      },
    ],
  },
};

export const KNOWN_SCENE_IDS = Object.keys(SCENE_CATALOGUE);

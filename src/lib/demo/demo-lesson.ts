import type { LessonPlan } from "@/lib/teaching/contracts";

/**
 * DEMO LESSON — a curated, deterministic lesson used by Demo Mode.
 *
 * Every concept matches an entry in the visual catalogue, so the Teaching Room
 * shows rich 3D / comparison / formula / timeline visuals with NO model in the
 * loop. The adaptive teaching engine runs for real against it.
 */

export const DEMO_LESSON_TITLE = "How CPU cache memory works";
export const DEMO_LESSON_TOPIC = "CPU cache memory";

export const DEMO_LESSON_PLAN: LessonPlan = {
  objective:
    "Understand why fast memory sits close to the CPU, how a cache lookup succeeds or fails, and why programs are cache-friendly by design.",
  estimatedMinutes: 18,
  assessmentStrategy:
    "Check the mental model with one conceptual question per concept, then one applied scenario; reteach with a different representation on a repeated mix-up.",
  concepts: [
    {
      key: "memory-hierarchy",
      title: "Memory hierarchy",
      summary:
        "Computers stack storage in layers that trade size for speed: registers, L1/L2/L3 cache, RAM, then disk. The CPU checks the fastest, smallest layer first and only falls through to slower layers on a miss.",
      difficulty: 2,
      importance: 5,
      prerequisites: [],
    },
    {
      key: "cache-vs-ram",
      title: "Cache vs RAM",
      summary:
        "Cache and RAM do the same job — hold data the program is using — at very different points on the speed/size curve. Cache is kilobytes at ~1ns on the CPU die; RAM is gigabytes at ~100ns on separate chips.",
      difficulty: 3,
      importance: 4,
      prerequisites: ["memory-hierarchy"],
    },
    {
      key: "cache-hits-and-misses",
      title: "Cache hits and misses",
      summary:
        "A hit means the data is already in cache and is served in about a nanosecond. A miss means fetching from the next level down, which can cost a hundred times more. Average memory access time weighs the two: AMAT = HitTime + MissRate x MissPenalty.",
      difficulty: 3,
      importance: 4,
      prerequisites: ["cache-vs-ram"],
    },
    {
      key: "locality-of-reference",
      title: "Locality of reference",
      summary:
        "Caching works because programs reuse data predictably. Temporal locality: if you used it recently you will use it again soon. Spatial locality: if you used an address you will use nearby ones. Caches keep recently-used lines and fetch a whole line at a time.",
      difficulty: 3,
      importance: 5,
      prerequisites: ["memory-hierarchy"],
    },
  ],
  sequence: [
    {
      conceptKey: "memory-hierarchy",
      actions: ["EXPLAIN", "VISUALIZE", "ASK"],
    },
    { conceptKey: "cache-vs-ram", actions: ["EXPLAIN", "ASK"] },
    {
      conceptKey: "cache-hits-and-misses",
      actions: ["EXPLAIN", "ASK", "ASSESS"],
    },
    { conceptKey: "locality-of-reference", actions: ["EXPLAIN", "ASK"] },
  ],
};

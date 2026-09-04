import type { MisconceptionRef } from "./contracts";

/**
 * MISCONCEPTION TAXONOMY.
 *
 * `id` is the internal key stored in `misconceptions.category` and used by the
 * knowledge-graph / radar — NEVER shown to the learner. `label` + `explanation`
 * are the learner-facing text ("You appear to be mixing up cache and permanent
 * storage."). Distractors in the assessment bank reference these.
 */
export const MISCONCEPTIONS = {
  CONFUSES_CACHE_WITH_STORAGE: {
    id: "confuses-cache-with-storage",
    label: "mixing up cache and permanent storage",
    explanation:
      "You appear to be treating cache like disk — cache is small, volatile, and only holds copies of data that is being used right now.",
  },
  CONFUSES_PROXIMITY_WITH_LATENCY: {
    id: "confuses-proximity-with-latency",
    label: "explaining speed by physical distance alone",
    explanation:
      "Cache is fast mainly because it is small and built from faster circuitry, not simply because it sits a few millimetres closer to the core.",
  },
  THINKS_BIGGER_IS_FASTER: {
    id: "thinks-bigger-is-faster",
    label: "assuming a larger memory is a faster memory",
    explanation:
      "Larger memories are generally slower — capacity and speed trade off against each other at every level of the hierarchy.",
  },
  THINKS_MISS_IS_CHEAP: {
    id: "thinks-miss-is-cheap",
    label: "underestimating the cost of a cache miss",
    explanation:
      "A miss doesn't just cost a little extra — it can stall the CPU for roughly a hundred times the cost of a hit while data is fetched from RAM.",
  },
  CONFUSES_TEMPORAL_SPATIAL: {
    id: "confuses-temporal-spatial",
    label: "swapping temporal and spatial locality",
    explanation:
      "Temporal locality is reusing the same address soon; spatial locality is using nearby addresses. Walking an array is spatial; a loop counter is temporal.",
  },
  MISSES_LOCALITY_BENEFIT: {
    id: "misses-locality-benefit",
    label: "not connecting repeated access to cache performance",
    explanation:
      "When a program reuses the same small region, that region stays in cache, so almost every access is a fast hit.",
  },
  CONFUSES_STACK_HEAP_LIFETIME: {
    id: "confuses-stack-heap-lifetime",
    label: "mixing up how long stack and heap data lives",
    explanation:
      "Stack data disappears automatically when a function returns; heap data lives until it is explicitly freed or garbage-collected.",
  },
  THINKS_STACK_GROWS_ARBITRARILY: {
    id: "thinks-stack-grows-arbitrarily",
    label: "treating the stack as unbounded",
    explanation:
      "The stack has a fixed limit; frames that are never popped (for example unbounded recursion) overflow it.",
  },
  THINKS_TCP_ALWAYS_FAST: {
    id: "thinks-tcp-always-fast",
    label: "assuming TCP sends at full speed all the time",
    explanation:
      "TCP deliberately slows down when it detects loss and probes carefully back up — its rate is constantly adjusting to the network.",
  },
  THINKS_LOSS_MEANS_FAILURE: {
    id: "thinks-loss-means-failure",
    label: "treating packet loss as a connection failure",
    explanation:
      "Occasional loss is normal and expected — it is the main signal TCP uses to find the right sending rate.",
  },
  CONFUSES_VIRTUAL_PHYSICAL: {
    id: "confuses-virtual-physical",
    label: "mixing up virtual and physical addresses",
    explanation:
      "The addresses a program uses are virtual; the OS and hardware translate them to physical RAM locations, which the program never sees directly.",
  },
  THINKS_PAGE_FAULT_IS_ERROR: {
    id: "thinks-page-fault-is-error",
    label: "treating a page fault as a crash",
    explanation:
      "A page fault is a normal event — the OS pauses the program, loads the missing page from disk, and resumes it.",
  },
} satisfies Record<string, MisconceptionRef>;

export type MisconceptionKey = keyof typeof MISCONCEPTIONS;

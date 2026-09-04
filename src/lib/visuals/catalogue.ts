import type { VisualDirective } from "@/types/visuals";

/**
 * DETERMINISTIC VISUAL CATALOGUE.
 *
 * Hand-authored, pre-validated visual directives for common concepts. The
 * resolver matches a concept to an entry and picks a complexity variant from
 * the learner's live state. No LLM is required for the Teaching Room to show
 * rich, correct visuals — the model, when present, only chooses WHEN to show
 * one; the catalogue owns WHAT it looks like.
 */

export interface VisualVariants {
  /** Fewer moving parts — used when the learner is struggling. */
  simple?: VisualDirective;
  /** The default. */
  standard: VisualDirective;
  /** More detail / a harder representation — used for strong learners. */
  advanced?: VisualDirective;
  /** A different representation entirely — used on a repeated misconception. */
  alternate?: VisualDirective;
}

export interface CatalogueEntry {
  id: string;
  /** Lowercase substrings; any match on key/title/summary selects this entry. */
  match: string[];
  variants: VisualVariants;
}

export const VISUAL_CATALOGUE: CatalogueEntry[] = [
  {
    id: "memory-hierarchy",
    match: [
      "memory hierarchy",
      "memory-hierarchy",
      "cache",
      "cpu cache",
      "cache memory",
      " ram",
      "random access memory",
      "storage vs",
      "registers",
    ],
    variants: {
      standard: {
        mode: "THREE_D",
        caption:
          "The memory hierarchy: each layer is bigger but slower and further from the CPU.",
        threeD: {
          scene: "memory_hierarchy",
          highlight: [],
          dim: [],
          labels: [],
          objects: [],
        },
      },
      simple: {
        mode: "COMPARISON",
        caption: "Cache and RAM do the same job at very different speeds.",
        comparison: {
          title: "Cache vs RAM",
          left: {
            title: "CPU Cache",
            points: [
              "Kilobytes to a few megabytes",
              "~1 nanosecond to reach",
              "On the CPU die",
              "Holds the data used most recently",
            ],
          },
          right: {
            title: "Main memory (RAM)",
            points: [
              "Gigabytes",
              "~100 nanoseconds to reach",
              "Separate chips on the board",
              "Holds everything the program is using",
            ],
          },
          rows: ["Size", "Latency", "Location", "Contents"],
          highlight: "latency",
        },
      },
      advanced: {
        mode: "THREE_D",
        caption:
          "L1, L2 and L3 caches sit between the CPU and RAM; each miss falls through to the next layer.",
        threeD: {
          scene: "memory_hierarchy",
          highlight: ["l1", "l2", "l3"],
          dim: [],
          labels: [{ target: "l1", text: "checked first, ~1ns" }],
          objects: [],
          step: 0,
        },
      },
      alternate: {
        mode: "CONCEPT_MAP",
        caption: "How the memory layers relate.",
        conceptMap: {
          root: "Memory hierarchy",
          branches: [
            {
              label: "Registers",
              relation: "fastest",
              children: ["Inside the CPU", "A few hundred bytes"],
            },
            {
              label: "Cache (L1/L2/L3)",
              relation: "fast",
              children: ["Recently used data", "KBs to a few MB"],
            },
            {
              label: "RAM",
              relation: "working memory",
              children: ["Everything running now", "GBs"],
            },
            {
              label: "Storage (SSD/HDD)",
              relation: "slowest",
              children: ["Survives power off", "Hundreds of GB+"],
            },
          ],
        },
      },
    },
  },
  {
    id: "call-stack",
    match: [
      "call stack",
      "call-stack",
      "stack frame",
      "the stack",
      "stack data structure",
      "recursion",
      "stack overflow",
    ],
    variants: {
      standard: {
        mode: "THREE_D",
        caption:
          "Each function call pushes a frame; returning pops it. The top frame is the one running now.",
        threeD: {
          scene: "call_stack",
          highlight: ["frame_top"],
          dim: [],
          labels: [],
          objects: [],
          step: 0,
        },
      },
      simple: {
        mode: "DIAGRAM",
        caption: "The stack only grows and shrinks at one end — the top.",
        diagram: {
          layout: "flow",
          nodes: [
            { key: "call", text: "Call a function → push a frame" },
            { key: "run", text: "Frame holds its local variables" },
            { key: "ret", text: "Function returns → pop the frame" },
            { key: "back", text: "Control resumes in the caller" },
          ],
          edges: [
            { from: "call", to: "run" },
            { from: "run", to: "ret" },
            { from: "ret", to: "back" },
          ],
        },
      },
      alternate: {
        mode: "COMPARISON",
        caption: "The stack and the heap manage memory very differently.",
        comparison: {
          title: "Stack vs Heap",
          left: {
            title: "Stack",
            points: [
              "Automatic: frames pushed/popped with calls",
              "Very fast",
              "Fixed, limited size",
              "Last-in, first-out order",
            ],
          },
          right: {
            title: "Heap",
            points: [
              "Manual or garbage-collected",
              "Slower to allocate",
              "Large, flexible",
              "Any allocation order",
            ],
          },
          rows: ["Management", "Speed", "Size", "Order"],
          highlight: "management",
        },
      },
    },
  },
  {
    id: "cache-performance",
    match: [
      "cache hit",
      "cache miss",
      "hit rate",
      "miss rate",
      "amat",
      "average memory access time",
      "cache performance",
    ],
    variants: {
      standard: {
        mode: "FORMULA",
        caption:
          "Average memory access time weighs the fast path against the slow one.",
        formula: {
          expression: "AMAT = HitTime + MissRate x MissPenalty",
          terms: [
            { symbol: "AMAT", meaning: "average time to read one value" },
            {
              symbol: "HitTime",
              meaning: "time when the data is already in cache",
            },
            {
              symbol: "MissRate",
              meaning: "fraction of accesses not in cache",
            },
            {
              symbol: "MissPenalty",
              meaning: "extra time to fetch from the next level down",
            },
          ],
          example: [
            "HitTime = 1ns, MissRate = 5%, MissPenalty = 100ns",
            "AMAT = 1 + 0.05 x 100 = 6ns",
            "A 5% miss rate makes memory 6x slower than the cache alone.",
          ],
        },
      },
      simple: {
        mode: "COMPARISON",
        caption: "A hit is cheap; a miss is expensive.",
        comparison: {
          title: "Cache hit vs cache miss",
          left: {
            title: "Hit",
            points: [
              "Data is in the cache",
              "Served in ~1ns",
              "CPU keeps going",
            ],
          },
          right: {
            title: "Miss",
            points: [
              "Data is not in the cache",
              "Fetch from RAM (~100ns)",
              "CPU stalls, then caches it",
            ],
          },
          rows: ["Where the data is", "Cost", "Effect"],
          highlight: "cost",
        },
      },
    },
  },
  {
    id: "locality",
    match: [
      "locality",
      "locality of reference",
      "temporal locality",
      "spatial locality",
      "principle of locality",
    ],
    variants: {
      standard: {
        mode: "COMPARISON",
        caption:
          "Caching works because programs reuse data in predictable ways.",
        comparison: {
          title: "Temporal vs spatial locality",
          left: {
            title: "Temporal",
            points: [
              "If you used it recently, you'll use it again soon",
              "Example: a loop counter",
              "Cache keeps recently-used lines",
            ],
          },
          right: {
            title: "Spatial",
            points: [
              "If you used an address, you'll use nearby ones",
              "Example: walking an array",
              "Cache fetches a whole line, not one byte",
            ],
          },
          rows: ["Idea", "Example", "How the cache exploits it"],
          highlight: "idea",
        },
      },
      alternate: {
        mode: "CONCEPT_MAP",
        caption: "Where locality shows up.",
        conceptMap: {
          root: "Locality of reference",
          branches: [
            {
              label: "Temporal",
              children: [
                "Loop variables",
                "Hot functions",
                "Recently freed memory",
              ],
            },
            {
              label: "Spatial",
              children: [
                "Array traversal",
                "Struct fields",
                "Instruction fetch",
              ],
            },
          ],
        },
      },
    },
  },
  {
    id: "tcp-congestion",
    match: [
      "congestion control",
      "tcp congestion",
      "slow start",
      "congestion avoidance",
      "congestion window",
      "aimd",
    ],
    variants: {
      standard: {
        mode: "TIMELINE",
        caption: "TCP probes for bandwidth, then backs off when it sees loss.",
        timeline: {
          title: "One congestion-control cycle",
          events: [
            {
              label: "Slow start",
              detail: "Window doubles each round trip until a threshold",
            },
            {
              label: "Congestion avoidance",
              detail: "Window grows by one segment per round trip",
            },
            {
              label: "Packet loss detected",
              detail: "Triple duplicate ACK or timeout",
            },
            {
              label: "Multiplicative decrease",
              detail: "Window is roughly halved",
            },
            {
              label: "Recover and grow again",
              detail: "Back to linear growth",
            },
          ],
        },
      },
      simple: {
        mode: "DIAGRAM",
        caption: "Speed up gently, slow down hard.",
        diagram: {
          layout: "flow",
          nodes: [
            { key: "up", text: "No loss → send a bit faster" },
            { key: "loss", text: "Loss → the network is full" },
            { key: "down", text: "Cut the sending rate sharply" },
            { key: "repeat", text: "Ramp back up slowly" },
          ],
          edges: [
            { from: "up", to: "loss" },
            { from: "loss", to: "down" },
            { from: "down", to: "repeat" },
            { from: "repeat", to: "up" },
          ],
        },
      },
    },
  },
  {
    id: "virtual-memory",
    match: [
      "virtual memory",
      "page fault",
      "page faults",
      "paging",
      "page table",
      "demand paging",
      "tlb",
    ],
    variants: {
      standard: {
        mode: "DIAGRAM",
        caption: "A page fault is the OS quietly fetching a missing page.",
        diagram: {
          layout: "flow",
          nodes: [
            { key: "access", text: "Program accesses a virtual address" },
            { key: "check", text: "Page table: is the page in RAM?" },
            { key: "fault", text: "Not resident → page fault (trap to OS)" },
            { key: "load", text: "OS reads the page from disk into a frame" },
            { key: "resume", text: "Update the table, resume the instruction" },
          ],
          edges: [
            { from: "access", to: "check" },
            { from: "check", to: "fault", text: "miss" },
            { from: "fault", to: "load" },
            { from: "load", to: "resume" },
          ],
        },
      },
      alternate: {
        mode: "COMPARISON",
        caption:
          "Virtual addresses are what the program sees; physical addresses are real RAM.",
        comparison: {
          title: "Virtual vs physical address",
          left: {
            title: "Virtual",
            points: [
              "What the program uses",
              "Each process has its own space",
              "Contiguous and large",
            ],
          },
          right: {
            title: "Physical",
            points: [
              "Actual RAM locations",
              "Shared by every process",
              "Fragmented, limited",
            ],
          },
          rows: ["Who sees it", "Sharing", "Layout"],
          highlight: "who sees it",
        },
      },
    },
  },
];

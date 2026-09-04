import type { StructuredQuestion } from "./contracts";
import { MISCONCEPTIONS as M } from "./misconceptions";

/**
 * AUTHORED ASSESSMENT BANK.
 *
 * Hand-written structured questions for Lumen's flagship concepts. Each concept
 * has questions across the difficulty ladder and at least one that targets a
 * specific misconception through a carefully-chosen distractor. Questions test
 * understanding and transfer, not recall.
 *
 * Matched to a concept the same way the visual catalogue is: any lowercase
 * substring in `match` found in the concept key / title / summary selects the
 * entry.
 */

export interface BankEntry {
  id: string;
  match: string[];
  questions: StructuredQuestion[];
}

export const ASSESSMENT_BANK: BankEntry[] = [
  {
    id: "memory-hierarchy",
    match: [
      "memory hierarchy",
      "memory-hierarchy",
      "registers",
      "storage vs",
      " cpu",
    ],
    questions: [
      {
        format: "ORDER_STEPS",
        kind: "CONCEPTUAL",
        difficulty: 2,
        prompt:
          "Put these storage layers in order from the fastest the CPU can reach to the slowest.",
        data: {
          items: [
            { id: "reg", text: "CPU registers" },
            { id: "l1", text: "L1 cache" },
            { id: "ram", text: "Main memory (RAM)" },
            { id: "ssd", text: "SSD storage" },
          ],
          correctOrder: ["reg", "l1", "ram", "ssd"],
        },
      },
      {
        format: "MCQ",
        kind: "CONCEPTUAL",
        difficulty: 2,
        prompt:
          "As you move down the memory hierarchy from registers toward disk, what happens to capacity and access time?",
        data: {
          options: [
            {
              id: "a",
              text: "Capacity grows and access time grows (bigger but slower).",
            },
            {
              id: "b",
              text: "Capacity grows and access time shrinks (bigger and faster).",
              misconception: M.THINKS_BIGGER_IS_FASTER,
            },
            {
              id: "c",
              text: "Capacity shrinks and access time grows (smaller and slower).",
            },
            {
              id: "d",
              text: "Both stay roughly constant; only the price changes.",
            },
          ],
          correctId: "a",
        },
      },
      {
        format: "CLASSIFY",
        kind: "APPLICATION",
        difficulty: 3,
        prompt:
          "Classify each description by which layer of the hierarchy it best fits.",
        context: "Think about size, speed, and whether it survives power loss.",
        data: {
          buckets: [
            { id: "cache", text: "CPU cache" },
            { id: "ram", text: "RAM" },
            { id: "disk", text: "Disk / SSD" },
          ],
          items: [
            {
              id: "i1",
              text: "Holds copies of the few kilobytes used most recently",
              correctBucketId: "cache",
            },
            {
              id: "i2",
              text: "Holds every program and file that is currently running",
              correctBucketId: "ram",
            },
            {
              id: "i3",
              text: "Keeps its contents after the machine is switched off",
              correctBucketId: "disk",
            },
            {
              id: "i4",
              text: "About a nanosecond to read",
              correctBucketId: "cache",
            },
            {
              id: "i5",
              text: "About a hundred nanoseconds to read",
              correctBucketId: "ram",
            },
          ],
        },
      },
      {
        format: "MCQ",
        kind: "SCENARIO",
        difficulty: 4,
        prompt:
          "A CPU needs a value that is not in any cache level. Which statement best describes what happens next?",
        data: {
          options: [
            {
              id: "a",
              text: "The CPU stalls for roughly 100 ns while the line is fetched from RAM, then that line is cached for next time.",
            },
            {
              id: "b",
              text: "The value is read from RAM at the same speed as from L1, so there is no real penalty.",
              misconception: M.THINKS_MISS_IS_CHEAP,
            },
            {
              id: "c",
              text: "The program crashes because the data is missing from cache.",
            },
            {
              id: "d",
              text: "The CPU skips the value and continues with the next instruction.",
            },
          ],
          correctId: "a",
        },
      },
    ],
  },

  {
    id: "cache-vs-ram",
    match: ["cache vs ram", "cache-vs-ram", "cache memory", "cache and ram"],
    questions: [
      {
        format: "TRUE_FALSE",
        kind: "CONCEPTUAL",
        difficulty: 2,
        prompt: "Decide whether the statement is true or false.",
        data: {
          statement:
            "Cache permanently stores important data so the program never has to read it from RAM again.",
          answer: false,
          misconception: M.CONFUSES_CACHE_WITH_STORAGE,
        },
      },
      {
        format: "MCQ",
        kind: "CONCEPTUAL",
        difficulty: 3,
        prompt: "Why is L1 cache checked before RAM on every memory access?",
        data: {
          options: [
            {
              id: "a",
              text: "It is far smaller and built from faster circuitry, so a hit returns in about a nanosecond.",
            },
            {
              id: "b",
              text: "RAM is physically further from the CPU, and distance is the main reason it is slower.",
              misconception: M.CONFUSES_PROXIMITY_WITH_LATENCY,
            },
            {
              id: "c",
              text: "RAM can only be read once per program run, so the cache is used to avoid that.",
            },
            {
              id: "d",
              text: "The cache holds the whole program while RAM holds only the current function.",
            },
          ],
          correctId: "a",
        },
      },
      {
        format: "MATCH_RELATIONSHIP",
        kind: "APPLICATION",
        difficulty: 3,
        prompt: "Match each property to the memory it describes.",
        data: {
          left: [
            { id: "size", text: "Kilobytes to a few megabytes" },
            { id: "latency", text: "~1 nanosecond to reach" },
            {
              id: "contents",
              text: "Everything the program is currently using",
            },
          ],
          right: [
            { id: "cache", text: "CPU cache" },
            { id: "ram", text: "RAM" },
          ],
          correctPairs: [
            { leftId: "size", rightId: "cache" },
            { leftId: "latency", rightId: "cache" },
            { leftId: "contents", rightId: "ram" },
          ],
        },
      },
    ],
  },

  {
    id: "cache-hits-and-misses",
    match: [
      "cache hit",
      "cache miss",
      "hits and misses",
      "hit rate",
      "miss rate",
      "amat",
    ],
    questions: [
      {
        format: "MCQ",
        kind: "CONCEPTUAL",
        difficulty: 2,
        prompt: "What is a cache hit?",
        data: {
          options: [
            {
              id: "a",
              text: "The requested data is already in the cache and is returned in about a nanosecond.",
            },
            {
              id: "b",
              text: "The cache is full and an old line must be evicted.",
            },
            {
              id: "c",
              text: "The CPU writes a value directly to disk.",
            },
            {
              id: "d",
              text: "Two cores request the same address at the same time.",
            },
          ],
          correctId: "a",
        },
      },
      {
        format: "ORDER_STEPS",
        kind: "APPLICATION",
        difficulty: 3,
        prompt: "Put the events of a cache miss in the order they happen.",
        data: {
          items: [
            { id: "s1", text: "CPU asks the cache for an address" },
            { id: "s2", text: "Cache reports a miss" },
            { id: "s3", text: "The line is fetched from the next level down" },
            { id: "s4", text: "The line is copied into the cache" },
            { id: "s5", text: "The value is delivered to the CPU" },
          ],
          correctOrder: ["s1", "s2", "s3", "s4", "s5"],
        },
      },
      {
        format: "MCQ",
        kind: "PROBLEM_SOLVING",
        difficulty: 4,
        prompt:
          "HitTime is 1 ns, MissRate is 5%, MissPenalty is 100 ns. Roughly what is the average memory access time?",
        context: "AMAT = HitTime + MissRate x MissPenalty",
        data: {
          options: [
            { id: "a", text: "About 6 ns" },
            {
              id: "b",
              text: "About 1 ns — a 5% miss rate is rare enough to ignore",
              misconception: M.THINKS_MISS_IS_CHEAP,
            },
            { id: "c", text: "About 100 ns" },
            { id: "d", text: "About 101 ns" },
          ],
          correctId: "a",
        },
      },
      {
        format: "MULTI_SELECT",
        kind: "SCENARIO",
        difficulty: 4,
        prompt:
          "Select every change that would reduce a program's average memory access time.",
        data: {
          options: [
            { id: "a", text: "Lowering the miss rate" },
            { id: "b", text: "Reducing the miss penalty" },
            { id: "c", text: "Accessing memory in a more predictable pattern" },
            {
              id: "d",
              text: "Increasing the miss rate but keeping hit time the same",
            },
            {
              id: "e",
              text: "Making every access a miss to 'warm up' the cache",
            },
          ],
          correctIds: ["a", "b", "c"],
        },
      },
    ],
  },

  {
    id: "locality",
    match: [
      "locality",
      "locality of reference",
      "temporal locality",
      "spatial locality",
    ],
    questions: [
      {
        format: "CLASSIFY",
        kind: "CONCEPTUAL",
        difficulty: 3,
        prompt: "Classify each access pattern as temporal or spatial locality.",
        data: {
          buckets: [
            { id: "temporal", text: "Temporal locality" },
            { id: "spatial", text: "Spatial locality" },
          ],
          items: [
            {
              id: "i1",
              text: "A loop reads and updates the same counter every iteration",
              correctBucketId: "temporal",
              misconception: M.CONFUSES_TEMPORAL_SPATIAL,
            },
            {
              id: "i2",
              text: "Code walks through an array from index 0 to the end",
              correctBucketId: "spatial",
              misconception: M.CONFUSES_TEMPORAL_SPATIAL,
            },
            {
              id: "i3",
              text: "A hot function is called thousands of times per second",
              correctBucketId: "temporal",
            },
            {
              id: "i4",
              text: "Reading several fields of the same struct in a row",
              correctBucketId: "spatial",
            },
          ],
        },
      },
      {
        format: "MCQ",
        kind: "APPLICATION",
        difficulty: 3,
        prompt:
          "A program repeatedly accesses the same small array in a tight loop. Which memory behavior most likely improves performance, and why?",
        data: {
          options: [
            {
              id: "a",
              text: "The array stays resident in cache, so nearly every access is a fast hit.",
            },
            {
              id: "b",
              text: "The array is copied to disk so it survives between iterations.",
              misconception: M.CONFUSES_CACHE_WITH_STORAGE,
            },
            {
              id: "c",
              text: "Nothing changes — array access always costs the same.",
              misconception: M.MISSES_LOCALITY_BENEFIT,
            },
            {
              id: "d",
              text: "The CPU runs the loop entirely from registers without touching memory.",
            },
          ],
          correctId: "a",
        },
      },
      {
        format: "TRUE_FALSE",
        kind: "SCENARIO",
        difficulty: 3,
        prompt: "Decide whether the statement is true or false.",
        data: {
          statement:
            "Iterating an array column-by-column instead of row-by-row can be much slower because it breaks spatial locality.",
          answer: true,
        },
      },
    ],
  },

  {
    id: "call-stack",
    match: [
      "call stack",
      "call-stack",
      "stack frame",
      "the stack",
      "stack and heap",
      "stack vs heap",
      "recursion",
    ],
    questions: [
      {
        format: "ORDER_STEPS",
        kind: "CONCEPTUAL",
        difficulty: 2,
        prompt:
          "main() calls run(), which calls step(). Put these events in order.",
        data: {
          items: [
            { id: "a", text: "A frame for run() is pushed" },
            { id: "b", text: "A frame for step() is pushed" },
            { id: "c", text: "step() returns and its frame is popped" },
            { id: "d", text: "run() returns and its frame is popped" },
          ],
          correctOrder: ["a", "b", "c", "d"],
        },
      },
      {
        format: "MATCH_RELATIONSHIP",
        kind: "APPLICATION",
        difficulty: 3,
        prompt: "Match each property to the region of memory it describes.",
        data: {
          left: [
            { id: "auto", text: "Freed automatically when a function returns" },
            { id: "manual", text: "Lives until explicitly freed or collected" },
            { id: "lifo", text: "Grows and shrinks only at one end" },
          ],
          right: [
            { id: "stack", text: "Stack" },
            { id: "heap", text: "Heap" },
          ],
          correctPairs: [
            { leftId: "auto", rightId: "stack" },
            { leftId: "manual", rightId: "heap" },
            { leftId: "lifo", rightId: "stack" },
          ],
          misconceptionByLeft: {
            auto: M.CONFUSES_STACK_HEAP_LIFETIME,
            manual: M.CONFUSES_STACK_HEAP_LIFETIME,
          },
        },
      },
      {
        format: "MCQ",
        kind: "SCENARIO",
        difficulty: 4,
        prompt:
          "A recursive function never hits its base case. What happens, and why?",
        data: {
          options: [
            {
              id: "a",
              text: "Frames keep being pushed and never popped until the stack's fixed limit is exceeded — a stack overflow.",
            },
            {
              id: "b",
              text: "Nothing bad — the stack simply grows to whatever size it needs.",
              misconception: M.THINKS_STACK_GROWS_ARBITRARILY,
            },
            {
              id: "c",
              text: "The heap fills up first because recursion allocates heap memory each call.",
            },
            {
              id: "d",
              text: "The function returns a default value once it runs out of local variables.",
            },
          ],
          correctId: "a",
        },
      },
    ],
  },

  {
    id: "tcp-congestion",
    match: [
      "congestion control",
      "tcp congestion",
      "slow start",
      "congestion avoidance",
      "congestion window",
    ],
    questions: [
      {
        format: "ORDER_STEPS",
        kind: "CONCEPTUAL",
        difficulty: 3,
        prompt: "Put one congestion-control cycle in order.",
        data: {
          items: [
            { id: "a", text: "Slow start: the window grows exponentially" },
            {
              id: "b",
              text: "Congestion avoidance: the window grows one segment per round trip",
            },
            { id: "c", text: "Loss is detected (duplicate ACKs or a timeout)" },
            { id: "d", text: "The window is cut sharply" },
            { id: "e", text: "Linear growth resumes" },
          ],
          correctOrder: ["a", "b", "c", "d", "e"],
        },
      },
      {
        format: "TRUE_FALSE",
        kind: "APPLICATION",
        difficulty: 3,
        prompt: "Decide whether the statement is true or false.",
        data: {
          statement:
            "Occasional packet loss means the TCP connection has failed and must be re-established.",
          answer: false,
          misconception: M.THINKS_LOSS_MEANS_FAILURE,
        },
      },
      {
        format: "MCQ",
        kind: "SCENARIO",
        difficulty: 4,
        prompt:
          "A large download runs for a minute over TCP on a shared link. Which best describes its sending rate over that minute?",
        data: {
          options: [
            {
              id: "a",
              text: "It keeps adjusting — rising while there is no loss, dropping sharply when loss appears, then rising again.",
            },
            {
              id: "b",
              text: "It sends at the link's maximum speed the entire time.",
              misconception: M.THINKS_TCP_ALWAYS_FAST,
            },
            {
              id: "c",
              text: "It sends at a single fixed rate chosen when the connection opened.",
            },
            {
              id: "d",
              text: "It slows to zero after the first lost packet and stays there.",
            },
          ],
          correctId: "a",
        },
      },
    ],
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
    ],
    questions: [
      {
        format: "MCQ",
        kind: "CONCEPTUAL",
        difficulty: 3,
        prompt: "What is a page fault?",
        data: {
          options: [
            {
              id: "a",
              text: "A trap to the OS when a program touches a page that isn't currently in RAM, so the OS loads it and resumes.",
            },
            {
              id: "b",
              text: "A hardware error that crashes the offending program.",
              misconception: M.THINKS_PAGE_FAULT_IS_ERROR,
            },
            {
              id: "c",
              text: "The moment a page is written back to disk to save power.",
            },
            {
              id: "d",
              text: "A cache miss inside the CPU's L1 cache.",
            },
          ],
          correctId: "a",
        },
      },
      {
        format: "MATCH_RELATIONSHIP",
        kind: "APPLICATION",
        difficulty: 3,
        prompt: "Match each description to virtual or physical addressing.",
        data: {
          left: [
            { id: "prog", text: "What the running program actually uses" },
            { id: "real", text: "Actual locations in the RAM chips" },
            { id: "perproc", text: "Each process gets its own private space" },
          ],
          right: [
            { id: "virtual", text: "Virtual" },
            { id: "physical", text: "Physical" },
          ],
          correctPairs: [
            { leftId: "prog", rightId: "virtual" },
            { leftId: "real", rightId: "physical" },
            { leftId: "perproc", rightId: "virtual" },
          ],
          misconceptionByLeft: {
            prog: M.CONFUSES_VIRTUAL_PHYSICAL,
            real: M.CONFUSES_VIRTUAL_PHYSICAL,
          },
        },
      },
      {
        format: "ORDER_STEPS",
        kind: "SCENARIO",
        difficulty: 4,
        prompt: "Put the handling of a page fault in order.",
        data: {
          items: [
            { id: "a", text: "Program reads a virtual address" },
            { id: "b", text: "The page table shows the page is not resident" },
            { id: "c", text: "The CPU traps into the OS" },
            {
              id: "d",
              text: "The OS reads the page from disk into a free frame",
            },
            {
              id: "e",
              text: "The page table is updated and the instruction restarts",
            },
          ],
          correctOrder: ["a", "b", "c", "d", "e"],
        },
      },
    ],
  },
];

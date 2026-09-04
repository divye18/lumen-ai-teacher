import { describe, expect, it } from "vitest";

import {
  matchMisconception,
  normalizeCategory,
  planMisconceptionUpdates,
  type ExistingMisconception,
} from "./misconception-tracker";

const existing: ExistingMisconception[] = [
  {
    id: "m1",
    category: "page-fault-is-a-crash",
    description: "Believes a page fault terminates the program.",
    confidence: 0.6,
    status: "ACTIVE",
    detections: 1,
  },
];

describe("normalizeCategory", () => {
  it("canonicalises spacing and case", () => {
    expect(normalizeCategory("Page Fault  Is A Crash!")).toBe(
      "page-fault-is-a-crash",
    );
  });
});

describe("matchMisconception", () => {
  it("matches on an equivalent category name", () => {
    const m = matchMisconception(
      {
        category: "page fault is a crash",
        description: "thinks the process dies",
      },
      existing,
    );
    expect(m?.existing.id).toBe("m1");
    expect(m?.similarity).toBe(1);
  });

  it("matches on strong description overlap even with a different label", () => {
    const m = matchMisconception(
      {
        category: "fault-handling-misunderstanding",
        description:
          "Believes a page fault terminates the running program immediately.",
      },
      existing,
    );
    expect(m?.existing.id).toBe("m1");
  });

  it("does not match an unrelated misconception", () => {
    const m = matchMisconception(
      {
        category: "tlb-confusion",
        description: "Confuses the TLB with the page table cache size.",
      },
      existing,
    );
    expect(m).toBeNull();
  });

  it("matches a RESOLVED row the same as any other status (10 — spaced-review relapse)", () => {
    // matchMisconception is status-agnostic by design — the caller decides
    // which rows to include. A wrong answer on a previously-RESOLVED
    // misconception's category must still be found here, so the orchestrator
    // can route it to strengthen() (reactivate) instead of record() (a
    // duplicate row).
    const resolved: ExistingMisconception[] = [
      { ...existing[0], status: "RESOLVED" },
    ];
    const m = matchMisconception(
      {
        category: "page fault is a crash",
        description: "thinks the process dies",
      },
      resolved,
    );
    expect(m?.existing.id).toBe("m1");
  });
});

describe("planMisconceptionUpdates", () => {
  it("creates a new misconception above the confidence threshold", () => {
    const plan = planMisconceptionUpdates({
      candidates: [
        {
          category: "swap-is-ram",
          description: "Thinks swap space is part of RAM.",
          confidence: 0.8,
        },
      ],
      existing,
    });
    expect(plan.creates).toHaveLength(1);
    expect(plan.creates[0].severity).toBe("HIGH");
    expect(plan.strengthens).toHaveLength(0);
  });

  it("ignores a low-confidence novel candidate", () => {
    const plan = planMisconceptionUpdates({
      candidates: [
        {
          category: "maybe-something",
          description: "unclear",
          confidence: 0.2,
        },
      ],
      existing,
    });
    expect(plan.creates).toHaveLength(0);
  });

  it("strengthens on repeated evidence and flags it as repeated", () => {
    const plan = planMisconceptionUpdates({
      candidates: [
        {
          category: "page fault is a crash",
          description: "still thinks the process dies",
          confidence: 0.7,
        },
      ],
      existing,
    });
    expect(plan.strengthens).toHaveLength(1);
    expect(plan.strengthens[0].newDetections).toBe(2);
    expect(plan.strengthens[0].newConfidence).toBeGreaterThan(0.6);
    expect(plan.hasRepeated).toBe(true);
  });

  it("relapse on a RESOLVED row strengthens the existing row, never creates a duplicate (10)", () => {
    const resolved: ExistingMisconception[] = [
      { ...existing[0], status: "RESOLVED" },
    ];
    const plan = planMisconceptionUpdates({
      candidates: [
        {
          category: "page fault is a crash",
          description: "still thinks the process dies",
          confidence: 0.7,
        },
      ],
      existing: resolved,
    });
    expect(plan.strengthens).toHaveLength(1);
    expect(plan.strengthens[0].id).toBe("m1");
    expect(plan.creates).toHaveLength(0);
  });

  it("is not repeated on the very first detection of a fresh misconception", () => {
    const plan = planMisconceptionUpdates({
      candidates: [
        {
          category: "brand-new",
          description: "a fresh wrong idea about paging",
          confidence: 0.9,
        },
      ],
      existing: [],
    });
    expect(plan.hasRepeated).toBe(false);
    expect(plan.creates).toHaveLength(1);
  });
});

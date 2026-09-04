import { describe, expect, it } from "vitest";

import {
  buildMisconceptionDetail,
  type MisconceptionSource,
} from "./misconception-view";

function source(over: Partial<MisconceptionSource> = {}): MisconceptionSource {
  return {
    category: "confuses-cache-with-storage",
    description:
      "You appear to be treating cache as permanent storage. Cache holds temporary copies and is cleared when power is lost.",
    severity: "MEDIUM",
    status: "ACTIVE",
    firstDetectedAtISO: "2026-09-01T10:00:00.000Z",
    detectionCount: 1,
    isRecurrence: false,
    ...over,
  };
}

describe("buildMisconceptionDetail", () => {
  it("derives a readable label from the taxonomy id without leaking it", () => {
    const d = buildMisconceptionDetail(source());
    expect(d.label).toBe("Cache with storage");
    expect(d.label).not.toContain("-");
    expect(JSON.stringify(d)).not.toContain("confuses-cache-with-storage");
  });

  it("prefers the structured grader's insight when present", () => {
    const d = buildMisconceptionDetail(
      source({
        insight: {
          label: "Cache vs. permanent storage",
          explanation: "You seem to be mixing up cache and permanent storage.",
        },
      }),
    );
    expect(d.label).toBe("Cache vs. permanent storage");
    expect(d.explanation).toBe(
      "You seem to be mixing up cache and permanent storage.",
    );
  });

  it("shortens a long description to one sentence", () => {
    const d = buildMisconceptionDetail(source());
    expect(d.explanation).toBe(
      "You appear to be treating cache as permanent storage.",
    );
  });

  it("escalates the remediation message on recurrence", () => {
    const first = buildMisconceptionDetail(source({ detectionCount: 1 }));
    expect(first.remediation).toMatch(/before moving on/i);
    const repeat = buildMisconceptionDetail(
      source({ detectionCount: 2, isRecurrence: true }),
    );
    expect(repeat.remediation).toMatch(/seen this pattern before/i);
    expect(repeat.remediation).toMatch(/re-teach/i);
  });

  it("is deterministic", () => {
    const s = source({ detectionCount: 3, isRecurrence: true });
    expect(JSON.stringify(buildMisconceptionDetail(s))).toBe(
      JSON.stringify(buildMisconceptionDetail(s)),
    );
  });
});

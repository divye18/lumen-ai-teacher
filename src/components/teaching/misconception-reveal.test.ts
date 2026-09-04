import { describe, expect, it } from "vitest";

import { statusLabel } from "./misconception-reveal";

describe("statusLabel", () => {
  it("keeps the existing learner-facing label for ACTIVE", () => {
    expect(statusLabel("ACTIVE")).toBe("Active");
  });

  it("renders IMPROVING as 'Improving'", () => {
    expect(statusLabel("IMPROVING")).toBe("Improving");
  });

  it("keeps RESOLVED as 'Resolved'", () => {
    expect(statusLabel("RESOLVED")).toBe("Resolved");
  });

  it("no longer treats ADDRESSED as a real status — falls back to Active", () => {
    expect(statusLabel("ADDRESSED")).toBe("Active");
  });

  it("never leaks the raw internal status vocabulary into the label", () => {
    for (const raw of ["ACTIVE", "IMPROVING", "RESOLVED", "ADDRESSED"]) {
      const label = statusLabel(raw);
      expect(label).not.toBe(raw);
      expect(["Active", "Improving", "Resolved"]).toContain(label);
    }
  });

  it("is deterministic for identical input", () => {
    expect(statusLabel("IMPROVING")).toBe(statusLabel("IMPROVING"));
    expect(statusLabel("active")).toBe(statusLabel("active"));
  });
});

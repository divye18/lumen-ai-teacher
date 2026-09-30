import { describe, expect, it } from "vitest";

import { STATUS_BADGE, ctaLabel } from "./curriculum-topic-list";

describe("ctaLabel", () => {
  it("NOT_STARTED -> Start learning", () => {
    expect(ctaLabel("NOT_STARTED")).toBe("Start learning");
  });

  it("IN_PROGRESS -> Continue learning", () => {
    expect(ctaLabel("IN_PROGRESS")).toBe("Continue learning");
  });

  it("COMPLETED -> Review topic", () => {
    expect(ctaLabel("COMPLETED")).toBe("Review topic");
  });
});

describe("STATUS_BADGE", () => {
  it("maps each status to a tone and a non-color text label", () => {
    expect(STATUS_BADGE.NOT_STARTED).toEqual({
      tone: "neutral",
      label: "Not started",
    });
    expect(STATUS_BADGE.IN_PROGRESS).toEqual({
      tone: "learning",
      label: "In progress",
    });
    expect(STATUS_BADGE.COMPLETED).toEqual({
      tone: "positive",
      label: "Completed",
    });
  });
});

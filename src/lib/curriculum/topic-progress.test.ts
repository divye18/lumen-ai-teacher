import { describe, expect, it } from "vitest";

import { reduceLessonsToTopicStatus } from "./topic-progress";

describe("reduceLessonsToTopicStatus", () => {
  it("no lessons -> NOT_STARTED", () => {
    expect(reduceLessonsToTopicStatus([])).toBe("NOT_STARTED");
  });

  it("DRAFT -> IN_PROGRESS", () => {
    expect(reduceLessonsToTopicStatus([{ status: "DRAFT" }])).toBe(
      "IN_PROGRESS",
    );
  });

  it("ACTIVE -> IN_PROGRESS", () => {
    expect(reduceLessonsToTopicStatus([{ status: "ACTIVE" }])).toBe(
      "IN_PROGRESS",
    );
  });

  it("COMPLETED -> COMPLETED", () => {
    expect(reduceLessonsToTopicStatus([{ status: "COMPLETED" }])).toBe(
      "COMPLETED",
    );
  });

  it("multiple ACTIVE -> IN_PROGRESS", () => {
    expect(
      reduceLessonsToTopicStatus([{ status: "ACTIVE" }, { status: "ACTIVE" }]),
    ).toBe("IN_PROGRESS");
  });

  it("ACTIVE + COMPLETED -> COMPLETED", () => {
    expect(
      reduceLessonsToTopicStatus([
        { status: "ACTIVE" },
        { status: "COMPLETED" },
      ]),
    ).toBe("COMPLETED");
  });

  it("COMPLETED + ACTIVE -> COMPLETED (order-independent, sticky)", () => {
    expect(
      reduceLessonsToTopicStatus([
        { status: "COMPLETED" },
        { status: "ACTIVE" },
      ]),
    ).toBe("COMPLETED");
  });

  it("multiple COMPLETED -> COMPLETED", () => {
    expect(
      reduceLessonsToTopicStatus([
        { status: "COMPLETED" },
        { status: "COMPLETED" },
      ]),
    ).toBe("COMPLETED");
  });

  it("ABANDONED alone -> IN_PROGRESS (no special-casing)", () => {
    expect(reduceLessonsToTopicStatus([{ status: "ABANDONED" }])).toBe(
      "IN_PROGRESS",
    );
  });

  it("ABANDONED + COMPLETED -> COMPLETED (sticky regardless of other statuses)", () => {
    expect(
      reduceLessonsToTopicStatus([
        { status: "ABANDONED" },
        { status: "COMPLETED" },
      ]),
    ).toBe("COMPLETED");
  });
});

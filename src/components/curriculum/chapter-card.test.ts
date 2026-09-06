import { describe, expect, it } from "vitest";

import { isChapterComplete } from "./chapter-card";

describe("isChapterComplete", () => {
  it("NOT_STARTED-only chapter (has topics, next topic present) -> not complete", () => {
    expect(isChapterComplete(6, "Introduction")).toBe(false);
  });

  it("IN_PROGRESS chapter (a next topic still exists) -> not complete", () => {
    expect(isChapterComplete(6, "Significant Figures")).toBe(false);
  });

  it("every topic completed (nextTopicTitle null) -> complete", () => {
    expect(isChapterComplete(6, null)).toBe(true);
  });

  it("zero topics -> never complete, even with a null nextTopicTitle", () => {
    expect(isChapterComplete(0, null)).toBe(false);
  });
});

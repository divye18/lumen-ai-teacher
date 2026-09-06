import { describe, expect, it } from "vitest";

import type { TopicProgress, TopicStatus } from "./topic-progress";
import {
  computeChapterProgressPercent,
  pickNextTopic,
} from "./chapter-progress";

function topic(
  nodeId: string,
  position: number,
  status: TopicStatus,
  title = nodeId,
): TopicProgress {
  return { nodeId, title, position, status };
}

describe("computeChapterProgressPercent", () => {
  it("1. 0/0 topics -> 0%", () => {
    expect(computeChapterProgressPercent(0, 0)).toBe(0);
  });

  it("2. 0/6 completed -> 0%", () => {
    expect(computeChapterProgressPercent(0, 6)).toBe(0);
  });

  it("3. 1/6 -> 17% (Math.round)", () => {
    expect(computeChapterProgressPercent(1, 6)).toBe(17);
  });

  it("4. 2/6 -> 33%", () => {
    expect(computeChapterProgressPercent(2, 6)).toBe(33);
  });

  it("5. 3/6 -> 50%", () => {
    expect(computeChapterProgressPercent(3, 6)).toBe(50);
  });

  it("6. 6/6 -> 100%", () => {
    expect(computeChapterProgressPercent(6, 6)).toBe(100);
  });
});

describe("pickNextTopic", () => {
  it("7. first topic NOT_STARTED -> first topic", () => {
    const topics = [
      topic("t1", 0, "NOT_STARTED"),
      topic("t2", 1, "NOT_STARTED"),
    ];
    expect(pickNextTopic(topics)?.nodeId).toBe("t1");
  });

  it("8. first topic IN_PROGRESS -> first topic", () => {
    const topics = [
      topic("t1", 0, "IN_PROGRESS"),
      topic("t2", 1, "NOT_STARTED"),
    ];
    expect(pickNextTopic(topics)?.nodeId).toBe("t1");
  });

  it("9. first COMPLETED, second NOT_STARTED -> second", () => {
    const topics = [topic("t1", 0, "COMPLETED"), topic("t2", 1, "NOT_STARTED")];
    expect(pickNextTopic(topics)?.nodeId).toBe("t2");
  });

  it("10. first COMPLETED, second IN_PROGRESS -> second", () => {
    const topics = [topic("t1", 0, "COMPLETED"), topic("t2", 1, "IN_PROGRESS")];
    expect(pickNextTopic(topics)?.nodeId).toBe("t2");
  });

  it("11. first two COMPLETED, third NOT_STARTED -> third", () => {
    const topics = [
      topic("t1", 0, "COMPLETED"),
      topic("t2", 1, "COMPLETED"),
      topic("t3", 2, "NOT_STARTED"),
    ];
    expect(pickNextTopic(topics)?.nodeId).toBe("t3");
  });

  it("12. all COMPLETED -> null", () => {
    const topics = [topic("t1", 0, "COMPLETED"), topic("t2", 1, "COMPLETED")];
    expect(pickNextTopic(topics)).toBeNull();
  });

  it("13. COMPLETED topics after the next topic do not affect selection", () => {
    const topics = [
      topic("t1", 0, "COMPLETED"),
      topic("t2", 1, "IN_PROGRESS"),
      topic("t3", 2, "COMPLETED"),
      topic("t4", 3, "COMPLETED"),
    ];
    expect(pickNextTopic(topics)?.nodeId).toBe("t2");
  });

  it("14. selection follows array/position order, not title or id ordering", () => {
    const topics = [
      topic("zzz-later-id", 0, "NOT_STARTED", "Zeta title"),
      topic("aaa-earlier-id", 1, "NOT_STARTED", "Alpha title"),
    ];
    // Position 0 comes first in the array (caller is responsible for
    // position-ordering it before calling pickNextTopic) — the id/title
    // sort alphabetically the other way, proving neither is used.
    expect(pickNextTopic(topics)?.nodeId).toBe("zzz-later-id");
  });

  it("returns null for an empty topic list", () => {
    expect(pickNextTopic([])).toBeNull();
  });
});

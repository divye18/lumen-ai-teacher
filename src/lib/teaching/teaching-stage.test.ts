import { describe, expect, it } from "vitest";

import { deriveTeachingStage, type TeachingStageInput } from "./teaching-stage";

function input(over: Partial<TeachingStageInput> = {}): TeachingStageInput {
  return {
    phase: "teaching",
    busy: false,
    action: "EXPLAIN",
    revealComplete: false,
    resultBeat: 0,
    classification: null,
    firstLoad: false,
    ...over,
  };
}

describe("deriveTeachingStage", () => {
  it("is explaining while teaching content is still revealing, then ready-to-check", () => {
    expect(deriveTeachingStage(input({ revealComplete: false })).stage).toBe(
      "explaining",
    );
    const ready = deriveTeachingStage(input({ revealComplete: true }));
    expect(ready.stage).toBe("ready-to-check");
    expect(ready.canAdvance).toBe(true);
    expect(ready.presence).toBe("TEACHING");
  });

  it("only lets the learner advance once the explanation is fully revealed", () => {
    expect(
      deriveTeachingStage(input({ revealComplete: false })).canAdvance,
    ).toBe(false);
  });

  it("maps a live question to CHECKING, and a submitted answer to 'reading'", () => {
    expect(deriveTeachingStage(input({ phase: "question" })).stage).toBe(
      "checking",
    );
    const reading = deriveTeachingStage(
      input({ phase: "question", busy: true }),
    );
    expect(reading.stage).toBe("reading");
    expect(reading.presence).toBe("CHECKING");
  });

  it("walks the post-answer beats: evaluating -> updating -> adapting", () => {
    expect(
      deriveTeachingStage(input({ phase: "result", resultBeat: 0 })).stage,
    ).toBe("evaluating");
    expect(
      deriveTeachingStage(input({ phase: "result", resultBeat: 1 })).stage,
    ).toBe("updating");
    const adapting = deriveTeachingStage(
      input({ phase: "result", resultBeat: 2 }),
    );
    expect(adapting.stage).toBe("adapting");
    expect(adapting.canAdvance).toBe(true);
  });

  it("celebrates through the evaluation beats when the answer was correct", () => {
    expect(
      deriveTeachingStage(
        input({ phase: "result", resultBeat: 0, classification: "CORRECT" }),
      ).presence,
    ).toBe("CELEBRATING");
    expect(
      deriveTeachingStage(
        input({ phase: "result", resultBeat: 0, classification: "INCORRECT" }),
      ).presence,
    ).toBe("ADAPTING");
  });

  it("uses a RECAP stage when the teaching action is RECAP", () => {
    const s = deriveTeachingStage(
      input({ phase: "teaching", action: "RECAP", revealComplete: true }),
    );
    expect(s.stage).toBe("recap");
    expect(s.presence).toBe("RECAP");
  });

  it("distinguishes the first load from a mid-lesson pause in the status line", () => {
    expect(
      deriveTeachingStage(input({ phase: "loading", firstLoad: true }))
        .statusLine,
    ).toMatch(/preparing your lesson/i);
    expect(
      deriveTeachingStage(input({ phase: "loading", firstLoad: false }))
        .statusLine,
    ).toMatch(/deciding what comes next/i);
  });

  it("lets voice state override the presence but not the stage", () => {
    const s = deriveTeachingStage(
      input({ phase: "teaching", voiceState: "LISTENING" }),
    );
    expect(s.presence).toBe("LISTENING");
    expect(s.stage).toBe("explaining");
  });

  it("never leaks internal vocabulary in a status line", () => {
    const phases: TeachingStageInput["phase"][] = [
      "loading",
      "teaching",
      "question",
      "result",
      "complete",
      "error",
    ];
    for (const phase of phases) {
      for (let resultBeat = 0; resultBeat < 3; resultBeat += 1) {
        const s = deriveTeachingStage(input({ phase, resultBeat }));
        expect(s.statusLine).not.toMatch(
          /policy|reconcile|token|chain|prompt|LLM/i,
        );
        expect(s.statusLine.length).toBeLessThan(60);
      }
    }
  });

  it("is deterministic", () => {
    const i = input({
      phase: "result",
      resultBeat: 1,
      classification: "CORRECT",
    });
    expect(JSON.stringify(deriveTeachingStage(i))).toBe(
      JSON.stringify(deriveTeachingStage(i)),
    );
  });

  it("shows a 'conversing' stage while a learner question is in flight", () => {
    const teaching = deriveTeachingStage(
      input({ phase: "teaching", conversationBusy: true }),
    );
    expect(teaching.stage).toBe("conversing");
    expect(teaching.presence).toBe("THINKING");
    expect(teaching.statusLine).toMatch(/thinking about your question/i);

    const question = deriveTeachingStage(
      input({ phase: "question", conversationBusy: true }),
    );
    expect(question.stage).toBe("conversing");
  });

  it("does not let a learner question take over the post-answer sequence", () => {
    const s = deriveTeachingStage(
      input({ phase: "result", resultBeat: 1, conversationBusy: true }),
    );
    expect(s.stage).toBe("updating");
  });
});

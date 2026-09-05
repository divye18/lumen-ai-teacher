import { describe, expect, it } from "vitest";

import type {
  ClientTeachingQuestion,
  InteractionRow,
  MisconceptionRow,
  TeachingAnswerRow,
} from "@/lib/db/repositories";
import type { KnowledgeGraphView } from "@/lib/graph";

import {
  deriveConceptReadiness,
  deriveLearningEvent,
  deriveLearningIntelligence,
  deriveNextConcept,
  deriveRecoveryVelocity,
  deriveSessionEvents,
  repeatedMisconceptionCount,
  type EventSnapshot,
  type LearningIntelligenceInput,
} from "./learning-intelligence";

let clock = 0;
const at = () =>
  new Date(Date.UTC(2026, 0, 1, 0, 0, (clock += 1))).toISOString();

function q(
  id: string,
  over: Partial<ClientTeachingQuestion> = {},
): ClientTeachingQuestion {
  return {
    id,
    session_id: "s",
    lesson_id: "l",
    user_id: "u",
    concept_key: "cache",
    concept_id: "c",
    question_kind: "CONCEPTUAL",
    question_format: "FREE_FORM",
    difficulty: 3,
    prompt: "…",
    source_grounded: false,
    citations: [],
    metadata: {},
    created_at: at(),
    ...over,
  } as ClientTeachingQuestion;
}

function ans(
  qid: string,
  classification: string,
  over: Partial<TeachingAnswerRow> = {},
): TeachingAnswerRow {
  return {
    id: `a-${qid}-${clock}`,
    question_id: qid,
    session_id: "s",
    user_id: "u",
    response_text: "…",
    classification,
    correctness_score:
      classification === "CORRECT"
        ? 0.9
        : classification === "PARTIALLY_CORRECT"
          ? 0.55
          : 0.15,
    evaluation: {},
    response_time_ms: 15000,
    created_at: at(),
    ...over,
  } as TeachingAnswerRow;
}

function teach(action: string, conceptKey = "cache"): InteractionRow {
  return {
    id: `i-${clock}`,
    session_id: "s",
    user_id: "u",
    concept_id: "c",
    role: "TEACHER",
    interaction_type: "RETEACH",
    content: "…",
    metadata: { action, conceptKey },
    created_at: at(),
  } as InteractionRow;
}

function misconception(
  detections: number,
  severity = "MEDIUM",
): MisconceptionRow {
  return {
    id: `mc-${detections}`,
    category: "confuses-cache-and-ram",
    description: "…",
    confidence: 0.7,
    status: "ACTIVE",
    severity,
    evidence: Array.from({ length: detections }, () => ({ quote: "x" })),
    metadata: { detections },
    last_detected_at: at(),
  } as unknown as MisconceptionRow;
}

function baseInput(
  over: Partial<LearningIntelligenceInput> = {},
): LearningIntelligenceInput {
  return {
    concept: { key: "cache", title: "CPU Cache" },
    masteryPoints: 50,
    previousMasteryPoints: 50,
    confidence: 0.5,
    previousConfidence: 0.5,
    currentAction: "EXPLAIN",
    answers: [],
    questions: [],
    interactions: [],
    misconceptions: [],
    formatWeakness: null,
    graph: null,
    ...over,
  };
}

const GRAPH: KnowledgeGraphView = {
  scope: "lesson",
  nodes: [
    { id: "n1", conceptKey: "cache", title: "CPU Cache" },
    { id: "n2", conceptKey: "virtual-memory", title: "Virtual Memory" },
  ] as KnowledgeGraphView["nodes"],
  edges: [
    {
      id: "e1",
      source: "n1",
      target: "n2",
      type: "PREREQUISITE",
      label: "",
      confidence: 1,
      ordering: true,
    },
  ] as KnowledgeGraphView["edges"],
  layerCount: 2,
  stats: {
    nodeCount: 2,
    edgeCount: 1,
    assessedCount: 0,
    misconceptionCount: 0,
    prerequisiteEdges: 1,
    averageMastery: null,
  },
  generatedAt: at(),
};

describe("deriveLearningIntelligence — signals", () => {
  it("1. detects improving mastery", () => {
    const r = deriveLearningIntelligence(
      baseInput({
        masteryPoints: 60,
        previousMasteryPoints: 44,
        questions: [q("q1"), q("q2")],
        answers: [ans("q1", "CORRECT"), ans("q2", "CORRECT")],
      }),
    );
    expect(r.masteryDirection).toBe("rising");
  });

  it("2. detects declining mastery", () => {
    const r = deriveLearningIntelligence(
      baseInput({
        masteryPoints: 40,
        previousMasteryPoints: 58,
        questions: [q("q1"), q("q2")],
        answers: [ans("q1", "INCORRECT"), ans("q2", "INCORRECT")],
      }),
    );
    expect(r.masteryDirection).toBe("falling");
  });

  it("8. makes no claim on insufficient evidence", () => {
    const r = deriveLearningIntelligence(
      baseInput({ questions: [q("q1")], answers: [ans("q1", "CORRECT")] }),
    );
    expect(r.hasEvidence).toBe(false);
    expect(r.readiness).toBe("NOT_READY");
    expect(r.readinessRationale).toMatch(/not enough/i);
    expect(r.recoveryVelocity).toBeNull();
  });

  it("9. contradictory signals — a repeated misconception overrides high mastery", () => {
    const r = deriveLearningIntelligence(
      baseInput({
        masteryPoints: 85,
        previousMasteryPoints: 80,
        questions: [q("q1"), q("q2")],
        answers: [ans("q1", "CORRECT"), ans("q2", "CORRECT")],
        misconceptions: [misconception(3)],
      }),
    );
    expect(r.readiness).toBe("NOT_READY");
    expect(r.readyToAdvance).toBe(false);
  });

  it("14. guardrails: repeated misconception forces misconception-remediation", () => {
    const r = deriveLearningIntelligence(
      baseInput({
        masteryPoints: 88,
        previousMasteryPoints: 82,
        questions: [q("q1", { question_kind: "APPLICATION" }), q("q2")],
        answers: [ans("q1", "CORRECT"), ans("q2", "CORRECT")],
        misconceptions: [misconception(2)],
      }),
    );
    expect(r.recommendedIntervention).toBe("misconception-remediation");
  });

  it("13. is deterministic across repeated execution", () => {
    const input = baseInput({
      masteryPoints: 63,
      previousMasteryPoints: 50,
      questions: [q("q1", { question_kind: "APPLICATION" }), q("q2")],
      answers: [ans("q1", "CORRECT"), ans("q2", "CORRECT")],
    });
    expect(JSON.stringify(deriveLearningIntelligence(input))).toBe(
      JSON.stringify(deriveLearningIntelligence(input)),
    );
  });
});

describe("deriveRecoveryVelocity", () => {
  it("10. QUICK — incorrect → intervention → correct in one step", () => {
    clock = 0;
    const a1 = ans("q1", "INCORRECT");
    const iv = teach("SIMPLIFY");
    const a2 = ans("q2", "CORRECT");
    expect(
      deriveRecoveryVelocity({
        answers: [a1, a2],
        interactions: [iv],
        conceptKey: "cache",
      }),
    ).toBe("QUICK");
  });

  it("10. PERSISTENT — repeated failure despite two interventions", () => {
    clock = 0;
    const seq = [
      ans("q1", "INCORRECT"),
      teach("SIMPLIFY"),
      ans("q2", "INCORRECT"),
      teach("RETEACH"),
      ans("q3", "INCORRECT"),
    ];
    expect(
      deriveRecoveryVelocity({
        answers: seq.filter((x) => "question_id" in x) as TeachingAnswerRow[],
        interactions: seq.filter(
          (x) => !("question_id" in x),
        ) as InteractionRow[],
        conceptKey: "cache",
      }),
    ).toBe("PERSISTENT");
  });

  it("returns null with no wrong answer", () => {
    clock = 0;
    expect(
      deriveRecoveryVelocity({
        answers: [ans("q1", "CORRECT"), ans("q2", "CORRECT")],
        interactions: [],
        conceptKey: "cache",
      }),
    ).toBeNull();
  });
});

describe("deriveConceptReadiness", () => {
  it("6. READY — mastery + applied correct + clean recent + confidence", () => {
    clock = 0;
    const qs = [q("q1", { question_kind: "APPLICATION" }), q("q2")];
    const r = deriveConceptReadiness({
      masteryPoints: 66,
      confidence: 0.6,
      answers: [ans("q1", "CORRECT"), ans("q2", "CORRECT")],
      questions: qs,
      misconceptions: [],
      masteryDirection: "rising",
    });
    expect(r.readiness).toBe("READY");
  });

  it("7. MASTERED — strong, applied, all-correct, no misconception", () => {
    clock = 0;
    const qs = [q("q1", { question_kind: "APPLICATION" }), q("q2"), q("q3")];
    const r = deriveConceptReadiness({
      masteryPoints: 84,
      confidence: 0.8,
      answers: [
        ans("q1", "CORRECT"),
        ans("q2", "CORRECT"),
        ans("q3", "CORRECT"),
      ],
      questions: qs,
      misconceptions: [],
      masteryDirection: "steady",
    });
    expect(r.readiness).toBe("MASTERED");
  });

  it("does not claim readiness from one lucky answer", () => {
    clock = 0;
    const r = deriveConceptReadiness({
      masteryPoints: 70,
      confidence: 0.7,
      answers: [ans("q1", "CORRECT")],
      questions: [q("q1", { question_kind: "APPLICATION" })],
      misconceptions: [],
      masteryDirection: "unknown",
    });
    expect(r.readiness).toBe("NOT_READY");
  });

  it("NOT_READY while a repeated misconception is active (even at high mastery)", () => {
    clock = 0;
    const r = deriveConceptReadiness({
      masteryPoints: 82,
      confidence: 0.8,
      answers: [ans("q1", "CORRECT"), ans("q2", "CORRECT")],
      questions: [q("q1", { question_kind: "APPLICATION" }), q("q2")],
      misconceptions: [misconception(2)],
      masteryDirection: "steady",
    });
    expect(r.readiness).toBe("NOT_READY");
  });
});

describe("deriveNextConcept — knowledge graph", () => {
  it("11. returns a real downstream concept via a PREREQUISITE edge", () => {
    expect(deriveNextConcept(GRAPH, "cache")).toEqual({
      title: "Virtual Memory",
    });
  });
  it("returns null when no relationship exists", () => {
    expect(deriveNextConcept(GRAPH, "virtual-memory")).toBeNull();
    expect(deriveNextConcept(null, "cache")).toBeNull();
  });
});

// ── events ────────────────────────────────────────────────────────────────

function snap(
  input: LearningIntelligenceInput,
  extra: Omit<EventSnapshot, "intelligence">,
): EventSnapshot {
  return { intelligence: deriveLearningIntelligence(input), ...extra };
}

describe("deriveLearningEvent", () => {
  it("3 / A. RECOVERY_DETECTED — incorrect → simplify → correct", () => {
    clock = 0;
    const qs = [q("q1"), q("q2")];
    const before = snap(
      baseInput({
        masteryPoints: 42,
        previousMasteryPoints: 45,
        questions: qs,
        answers: [ans("q1", "INCORRECT")],
        interactions: [],
      }),
      {
        repeatedMisconceptionCount: 0,
        interventionSinceBefore: false,
        lastClassification: "INCORRECT",
      },
    );
    const after = snap(
      baseInput({
        masteryPoints: 50,
        previousMasteryPoints: 42,
        questions: qs,
        answers: [ans("q1", "INCORRECT"), ans("q2", "CORRECT")],
        interactions: [teach("SIMPLIFY")],
      }),
      {
        repeatedMisconceptionCount: 0,
        interventionSinceBefore: true,
        lastClassification: "CORRECT",
      },
    );
    const ev = deriveLearningEvent(before, after);
    expect(ev?.kind).toBe("RECOVERY_DETECTED");
    expect(ev?.masteryFrom).toBe(42);
    expect(ev?.masteryTo).toBe(50);
  });

  it("B. PATTERN_CONFIRMED — recurring misconception reaches evidence", () => {
    clock = 0;
    const qs = [q("q1"), q("q2")];
    const before = snap(
      baseInput({ questions: qs, answers: [ans("q1", "INCORRECT")] }),
      {
        repeatedMisconceptionCount: 1,
        interventionSinceBefore: true,
        lastClassification: "INCORRECT",
      },
    );
    const after = snap(
      baseInput({
        questions: qs,
        answers: [ans("q1", "INCORRECT"), ans("q2", "INCORRECT")],
        misconceptions: [misconception(2)],
      }),
      {
        repeatedMisconceptionCount: 2,
        interventionSinceBefore: true,
        lastClassification: "INCORRECT",
      },
    );
    expect(deriveLearningEvent(before, after)?.kind).toBe("PATTERN_CONFIRMED");
  });

  it("C. READY_TO_ADVANCE — stable understanding + application", () => {
    clock = 0;
    const qs = [
      q("q1", { question_kind: "APPLICATION" }),
      q("q2", { question_kind: "APPLICATION" }),
      q("q3"),
    ];
    const before = snap(
      baseInput({
        masteryPoints: 48,
        previousMasteryPoints: 40,
        questions: qs,
        answers: [ans("q1", "CORRECT")],
      }),
      {
        repeatedMisconceptionCount: 0,
        interventionSinceBefore: false,
        lastClassification: "CORRECT",
      },
    );
    const after = snap(
      baseInput({
        masteryPoints: 66,
        previousMasteryPoints: 48,
        confidence: 0.6,
        questions: qs,
        answers: [
          ans("q1", "CORRECT"),
          ans("q2", "CORRECT"),
          ans("q3", "CORRECT"),
        ],
        graph: GRAPH,
      }),
      {
        repeatedMisconceptionCount: 0,
        interventionSinceBefore: false,
        lastClassification: "CORRECT",
      },
    );
    const ev = deriveLearningEvent(before, after);
    expect(ev?.kind).toBe("READY_TO_ADVANCE");
    expect(ev?.next).toMatch(/Virtual Memory/);
  });

  it("D. no event on insufficient / drifting evidence", () => {
    clock = 0;
    const qs = [q("q1"), q("q2")];
    const before = snap(
      baseInput({ questions: qs, answers: [ans("q1", "CORRECT")] }),
      {
        repeatedMisconceptionCount: 0,
        interventionSinceBefore: false,
        lastClassification: "CORRECT",
      },
    );
    const after = snap(
      baseInput({
        masteryPoints: 52,
        previousMasteryPoints: 50,
        questions: qs,
        answers: [ans("q1", "CORRECT"), ans("q2", "PARTIALLY_CORRECT")],
      }),
      {
        repeatedMisconceptionCount: 0,
        interventionSinceBefore: false,
        lastClassification: "PARTIALLY_CORRECT",
      },
    );
    expect(deriveLearningEvent(before, after)).toBeNull();
  });

  it("5. DIFFICULTY_MISMATCH — repeated failure despite fresh intervention", () => {
    clock = 0;
    const qs = [q("q1"), q("q2"), q("q3")];
    const answers = [
      ans("q1", "INCORRECT"),
      ans("q2", "INCORRECT"),
      ans("q3", "INCORRECT"),
    ];
    const interactions = [teach("SIMPLIFY"), teach("RETEACH")];
    const before = snap(
      baseInput({
        masteryPoints: 34,
        previousMasteryPoints: 38,
        questions: qs,
        answers: answers.slice(0, 2),
        interactions: interactions.slice(0, 1),
      }),
      {
        repeatedMisconceptionCount: 0,
        interventionSinceBefore: false,
        lastClassification: "INCORRECT",
      },
    );
    const after = snap(
      baseInput({
        masteryPoints: 30,
        previousMasteryPoints: 34,
        questions: qs,
        answers,
        interactions,
      }),
      {
        repeatedMisconceptionCount: 0,
        interventionSinceBefore: true,
        lastClassification: "INCORRECT",
      },
    );
    expect(deriveLearningEvent(before, after)?.kind).toBe(
      "DIFFICULTY_MISMATCH",
    );
  });

  it("6. MISCONCEPTION_IMPROVING — first verified check on an ACTIVE misconception", () => {
    clock = 0;
    const qs = [q("q1"), q("q2")];
    const before = snap(
      baseInput({ questions: qs, answers: [ans("q1", "INCORRECT")] }),
      {
        repeatedMisconceptionCount: 1,
        interventionSinceBefore: false,
        lastClassification: "INCORRECT",
        misconceptionStatus: "ACTIVE",
      },
    );
    const after = snap(
      baseInput({
        questions: qs,
        answers: [ans("q1", "INCORRECT"), ans("q2", "CORRECT")],
      }),
      {
        repeatedMisconceptionCount: 1,
        interventionSinceBefore: false,
        lastClassification: "CORRECT",
        misconceptionStatus: "IMPROVING",
      },
    );
    const ev = deriveLearningEvent(before, after);
    expect(ev?.kind).toBe("MISCONCEPTION_IMPROVING");
  });

  it("7. MISCONCEPTION_CLEARED — a second distinct verified check resolves it", () => {
    clock = 0;
    const qs = [q("q1"), q("q2")];
    const before = snap(
      baseInput({ questions: qs, answers: [ans("q1", "CORRECT")] }),
      {
        repeatedMisconceptionCount: 1,
        interventionSinceBefore: false,
        lastClassification: "CORRECT",
        misconceptionStatus: "IMPROVING",
      },
    );
    const after = snap(
      baseInput({
        questions: qs,
        answers: [ans("q1", "CORRECT"), ans("q2", "CORRECT")],
      }),
      {
        repeatedMisconceptionCount: 1,
        interventionSinceBefore: false,
        lastClassification: "CORRECT",
        misconceptionStatus: "RESOLVED",
      },
    );
    const ev = deriveLearningEvent(before, after);
    expect(ev?.kind).toBe("MISCONCEPTION_CLEARED");
  });

  it("no MISCONCEPTION_CLEARED when there was nothing tracked before (status 'none')", () => {
    clock = 0;
    const qs = [q("q1")];
    const before = snap(baseInput({ questions: qs, answers: [] }), {
      repeatedMisconceptionCount: 0,
      interventionSinceBefore: false,
      lastClassification: null,
      misconceptionStatus: "none",
    });
    const after = snap(
      baseInput({ questions: qs, answers: [ans("q1", "CORRECT")] }),
      {
        repeatedMisconceptionCount: 0,
        interventionSinceBefore: false,
        lastClassification: "CORRECT",
        misconceptionStatus: "RESOLVED",
      },
    );
    expect(deriveLearningEvent(before, after)?.kind).not.toBe(
      "MISCONCEPTION_CLEARED",
    );
  });

  it("no MISCONCEPTION_IMPROVING/CLEARED when misconceptionStatus is unchanged", () => {
    clock = 0;
    const qs = [q("q1"), q("q2")];
    const before = snap(
      baseInput({ questions: qs, answers: [ans("q1", "CORRECT")] }),
      {
        repeatedMisconceptionCount: 0,
        interventionSinceBefore: false,
        lastClassification: "CORRECT",
        misconceptionStatus: "ACTIVE",
      },
    );
    const after = snap(
      baseInput({
        questions: qs,
        answers: [ans("q1", "CORRECT"), ans("q2", "INCORRECT")],
      }),
      {
        repeatedMisconceptionCount: 0,
        interventionSinceBefore: false,
        lastClassification: "INCORRECT",
        misconceptionStatus: "ACTIVE",
      },
    );
    const ev = deriveLearningEvent(before, after);
    expect(ev?.kind).not.toBe("MISCONCEPTION_IMPROVING");
    expect(ev?.kind).not.toBe("MISCONCEPTION_CLEARED");
  });
});

describe("deriveSessionEvents", () => {
  it("12. de-duplicates events by signature", () => {
    clock = 0;
    // two separate recovery arcs on the same concept, in real chronological
    // order → still just ONE RECOVERY_DETECTED event.
    const q1 = q("q1");
    const a1 = ans("q1", "INCORRECT");
    const iv1 = teach("SIMPLIFY");
    const q2 = q("q2");
    const a2 = ans("q2", "CORRECT");
    const q3 = q("q3");
    const a3 = ans("q3", "INCORRECT");
    const iv2 = teach("RETEACH");
    const q4 = q("q4");
    const a4 = ans("q4", "CORRECT");
    const questions = [q1, q2, q3, q4];
    const answers = [a1, a2, a3, a4];
    const interactions = [iv1, iv2];
    const events = deriveSessionEvents({
      concepts: [
        { key: "cache", title: "CPU Cache", masteryStart: 30, masteryEnd: 55 },
      ],
      answers,
      questions,
      interactions,
    });
    expect(events.filter((e) => e.kind === "RECOVERY_DETECTED")).toHaveLength(
      1,
    );
  });

  it("15. returns nothing when a concept has too little evidence", () => {
    clock = 0;
    const events = deriveSessionEvents({
      concepts: [
        { key: "cache", title: "CPU Cache", masteryStart: 40, masteryEnd: 44 },
      ],
      answers: [ans("q1", "CORRECT")],
      questions: [q("q1")],
      interactions: [],
    });
    expect(events).toEqual([]);
  });

  it("4. surfaces PATTERN_CONFIRMED from repeated misconception candidates", () => {
    clock = 0;
    const questions = [q("q1"), q("q2")];
    const answers = [
      ans("q1", "INCORRECT", {
        evaluation: { misconceptionCandidates: [{ category: "swap-latency" }] },
      }),
      ans("q2", "INCORRECT", {
        evaluation: { misconceptionCandidates: [{ category: "swap-latency" }] },
      }),
    ];
    const events = deriveSessionEvents({
      concepts: [
        { key: "cache", title: "CPU Cache", masteryStart: 40, masteryEnd: 38 },
      ],
      answers,
      questions,
      interactions: [],
    });
    expect(events.some((e) => e.kind === "PATTERN_CONFIRMED")).toBe(true);
  });

  // Milestone 14.2 — misconceptions CREATED this session (see
  // `misconception-store.ts`'s `listCreatedInSession`) whose CURRENT status
  // reflects real progress. No answers/interactions are needed for these —
  // the evidence is the persisted status transition itself.
  it("no misconceptionsByConcept -> no misconception events (existing behavior unchanged)", () => {
    const events = deriveSessionEvents({
      concepts: [
        { key: "cache", title: "CPU Cache", masteryStart: 40, masteryEnd: 40 },
      ],
      answers: [],
      questions: [],
      interactions: [],
    });
    expect(events).toEqual([]);
  });

  it("RESOLVED misconception -> one MISCONCEPTION_CLEARED", () => {
    const events = deriveSessionEvents({
      concepts: [
        { key: "cache", title: "CPU Cache", masteryStart: 40, masteryEnd: 60 },
      ],
      answers: [],
      questions: [],
      interactions: [],
      misconceptionsByConcept: [{ conceptKey: "cache", status: "RESOLVED" }],
    });
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe("MISCONCEPTION_CLEARED");
    expect(events[0].concept.key).toBe("cache");
  });

  it("IMPROVING misconception -> one MISCONCEPTION_IMPROVING", () => {
    const events = deriveSessionEvents({
      concepts: [
        { key: "cache", title: "CPU Cache", masteryStart: 40, masteryEnd: 50 },
      ],
      answers: [],
      questions: [],
      interactions: [],
      misconceptionsByConcept: [{ conceptKey: "cache", status: "IMPROVING" }],
    });
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe("MISCONCEPTION_IMPROVING");
  });

  it("ACTIVE misconception -> no event (unresolved, not yet improving)", () => {
    const events = deriveSessionEvents({
      concepts: [
        { key: "cache", title: "CPU Cache", masteryStart: 40, masteryEnd: 40 },
      ],
      answers: [],
      questions: [],
      interactions: [],
      misconceptionsByConcept: [{ conceptKey: "cache", status: "ACTIVE" }],
    });
    expect(events).toEqual([]);
  });

  it("de-duplicates two RESOLVED misconceptions on the same concept into one event", () => {
    const events = deriveSessionEvents({
      concepts: [
        { key: "cache", title: "CPU Cache", masteryStart: 40, masteryEnd: 60 },
      ],
      answers: [],
      questions: [],
      interactions: [],
      misconceptionsByConcept: [
        { conceptKey: "cache", status: "RESOLVED" },
        { conceptKey: "cache", status: "RESOLVED" },
      ],
    });
    expect(
      events.filter((e) => e.kind === "MISCONCEPTION_CLEARED"),
    ).toHaveLength(1);
  });

  it("ignores a misconception whose concept is not in this session's concept list", () => {
    const events = deriveSessionEvents({
      concepts: [
        { key: "cache", title: "CPU Cache", masteryStart: 40, masteryEnd: 60 },
      ],
      answers: [],
      questions: [],
      interactions: [],
      misconceptionsByConcept: [
        { conceptKey: "unrelated-concept", status: "RESOLVED" },
      ],
    });
    expect(events).toEqual([]);
  });

  it("orders MISCONCEPTION_CLEARED before MISCONCEPTION_IMPROVING (struggle-resolution rank)", () => {
    const events = deriveSessionEvents({
      concepts: [
        { key: "cache", title: "CPU Cache", masteryStart: 40, masteryEnd: 60 },
        {
          key: "memory",
          title: "Memory Hierarchy",
          masteryStart: 30,
          masteryEnd: 45,
        },
      ],
      answers: [],
      questions: [],
      interactions: [],
      misconceptionsByConcept: [
        { conceptKey: "memory", status: "IMPROVING" },
        { conceptKey: "cache", status: "RESOLVED" },
      ],
    });
    expect(events.map((e) => e.kind)).toEqual([
      "MISCONCEPTION_CLEARED",
      "MISCONCEPTION_IMPROVING",
    ]);
  });

  it("mixes misconception events with answer-derived events for a different concept", () => {
    clock = 0;
    const questions = [q("q1"), q("q2")];
    const answers = [
      ans("q1", "INCORRECT", {
        evaluation: { misconceptionCandidates: [{ category: "swap-latency" }] },
      }),
      ans("q2", "INCORRECT", {
        evaluation: { misconceptionCandidates: [{ category: "swap-latency" }] },
      }),
    ];
    const events = deriveSessionEvents({
      concepts: [
        { key: "cache", title: "CPU Cache", masteryStart: 40, masteryEnd: 38 },
        {
          key: "memory",
          title: "Memory Hierarchy",
          masteryStart: 30,
          masteryEnd: 60,
        },
      ],
      answers,
      questions,
      interactions: [],
      misconceptionsByConcept: [{ conceptKey: "memory", status: "RESOLVED" }],
    });
    expect(events.some((e) => e.kind === "PATTERN_CONFIRMED")).toBe(true);
    expect(events.some((e) => e.kind === "MISCONCEPTION_CLEARED")).toBe(true);
  });
});

describe("repeatedMisconceptionCount", () => {
  it("takes the highest detection count among active misconceptions", () => {
    expect(
      repeatedMisconceptionCount([misconception(1), misconception(3)]),
    ).toBe(3);
    expect(repeatedMisconceptionCount([])).toBe(0);
  });
});

import type {
  ClientTeachingQuestion,
  DocumentRow,
  LessonRow,
  TeachingAnswerRow,
} from "@/lib/db/repositories";

import type {
  ActiveSessionView,
  ConceptNode,
  MisconceptionInsight,
} from "./overview";

/**
 * The single recommended next action. Always tied to real learner state —
 * never a generic "keep learning!". Deterministic.
 */

export interface RecommendationView {
  kind:
    | "resume"
    | "review-concept"
    | "address-misconception"
    | "new-lesson-from-doc"
    | "add-material"
    | "choose-topic";
  title: string;
  reason: string;
  href: string;
  ctaLabel: string;
}

const KIND_LABEL: Record<string, string> = {
  CONCEPTUAL: "definition",
  APPLICATION: "application",
  SCENARIO: "scenario",
  PROBLEM_SOLVING: "problem-solving",
};

function accuracyByKind(
  answers: TeachingAnswerRow[],
  questions: ClientTeachingQuestion[],
): Map<string, { total: number; correct: number }> {
  const kindByQuestion = new Map(questions.map((q) => [q.id, q.question_kind]));
  const acc = new Map<string, { total: number; correct: number }>();
  for (const a of answers) {
    const kind = kindByQuestion.get(a.question_id);
    if (!kind) continue;
    const bucket = acc.get(kind) ?? { total: 0, correct: 0 };
    bucket.total += 1;
    if (a.classification === "CORRECT") bucket.correct += 1;
    acc.set(kind, bucket);
  }
  return acc;
}

function resumeReason(
  answers: TeachingAnswerRow[],
  questions: ClientTeachingQuestion[],
): string {
  const acc = accuracyByKind(answers, questions);
  const rate = (k: string) => {
    const b = acc.get(k);
    return b && b.total > 0 ? b.correct / b.total : null;
  };
  const app = rate("APPLICATION");
  const scenario = rate("SCENARIO") ?? rate("PROBLEM_SOLVING");
  const concept = rate("CONCEPTUAL");

  if (app !== null && app >= 0.6 && scenario !== null && scenario < 0.5) {
    return "Your application answers are landing, but scenario questions still need work.";
  }
  if (concept !== null && concept >= 0.7 && app !== null && app < 0.5) {
    return "You've got the definitions — the next step is applying them.";
  }
  const worst = [...acc.entries()]
    .filter(([, b]) => b.total > 0)
    .sort((a, b) => a[1].correct / a[1].total - b[1].correct / b[1].total)[0];
  if (worst) {
    return `Your ${KIND_LABEL[worst[0]] ?? "recent"} answers are where the gaps are right now.`;
  }
  return "Pick up where you left off — Lumen has your place.";
}

export function buildRecommendation(input: {
  activeSession: ActiveSessionView | null;
  concepts: ConceptNode[];
  documents: DocumentRow[];
  lessons: LessonRow[];
  misconceptions: MisconceptionInsight[];
  answers: TeachingAnswerRow[];
  questions: ClientTeachingQuestion[];
}): RecommendationView {
  const { activeSession, concepts, documents, lessons, misconceptions } = input;

  if (activeSession) {
    return {
      kind: "resume",
      title: `Resume ${activeSession.lessonTitle}${
        activeSession.currentConceptTitle
          ? `: ${activeSession.currentConceptTitle}`
          : ""
      }`,
      reason: resumeReason(input.answers, input.questions),
      href: `/learn/${activeSession.sessionId}`,
      ctaLabel: "Resume lesson",
    };
  }

  const recurring = misconceptions.find((m) => m.detections >= 2);
  if (recurring) {
    return {
      kind: "address-misconception",
      title: `Clear up ${recurring.conceptTitle}`,
      reason: `Lumen has seen a recurring misconception here: ${lowerFirst(
        recurring.whatLumenNoticed,
      )}`,
      href: `/studio/plan?topic=${encodeURIComponent(recurring.conceptTitle)}`,
      ctaLabel: "Start a focused lesson",
    };
  }

  const assessedWeak = concepts
    .filter((c) => c.assessed && c.masteryPoints < 55)
    .sort((a, b) => a.masteryPoints - b.masteryPoints)[0];
  if (assessedWeak) {
    return {
      kind: "review-concept",
      title: `Revisit ${assessedWeak.title}`,
      reason: `Mastery is ${assessedWeak.masteryPoints}/100 (${assessedWeak.band.toLowerCase()}) after ${
        assessedWeak.attempts
      } ${assessedWeak.attempts === 1 ? "attempt" : "attempts"}.`,
      href: `/studio/plan?topic=${encodeURIComponent(assessedWeak.title)}`,
      ctaLabel: "Plan a review",
    };
  }

  const readyDoc = documents.find((d) => d.status === "READY");
  if (readyDoc && lessons.length === 0) {
    return {
      kind: "new-lesson-from-doc",
      title: `Build a lesson from ${readyDoc.title}`,
      reason:
        "Your material is analysed and ready. Lumen can design a personalised path from it.",
      href: `/studio/plan?documentId=${readyDoc.id}`,
      ctaLabel: "Design my lesson",
    };
  }

  if (documents.length === 0) {
    return {
      kind: "add-material",
      title: "Add your first learning material",
      reason:
        "Upload lecture notes or a chapter PDF — Lumen teaches from your own sources, with citations.",
      href: "/studio/knowledge",
      ctaLabel: "Add knowledge",
    };
  }

  return {
    kind: "choose-topic",
    title: "Choose something to learn",
    reason:
      "Your knowledge base is set up. Pick a topic and Lumen will build the lesson.",
    href: "/studio/plan",
    ctaLabel: "Plan a lesson",
  };
}

function lowerFirst(s: string): string {
  return s.length > 0 ? s[0].toLowerCase() + s.slice(1) : s;
}

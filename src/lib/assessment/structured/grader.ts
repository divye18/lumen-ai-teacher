import type { AnswerClassification } from "@/lib/db/enums";
import type {
  ReasoningQuality,
  RichAnswerEvaluation,
} from "@/lib/teaching/contracts";

import type {
  MisconceptionRef,
  StructuredAnswer,
  StructuredQuestion,
} from "./contracts";

/**
 * DETERMINISTIC STRUCTURED GRADER.
 *
 * Pure. No LLM, no fuzzy string matching, no semantic guessing. Every format
 * has explicit, testable grading rules. Given the same (question, answer) it
 * always returns the same result.
 *
 * Output is the same `RichAnswerEvaluation` shape the LLM evaluator produces,
 * so everything downstream (bounded mastery math, misconception planning,
 * persistence, the adaptive next decision) is unchanged.
 */

export interface StructuredGradeResult extends RichAnswerEvaluation {
  source: "structured";
  breakdown: {
    summary: string;
    items?: { id: string; text: string; correct: boolean; expected?: string }[];
    correctAnswerText?: string;
  };
  /** Learner-facing misconception (never the internal taxonomy id). */
  misconceptionInsight: { label: string; explanation: string } | null;
}

const CONFIDENCE = 0.95; // deterministic grading is high-confidence

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function classify(score: number, exact: boolean): AnswerClassification {
  if (exact) return "CORRECT";
  if (score >= 0.5) return "PARTIALLY_CORRECT";
  return "INCORRECT";
}

function reasoning(score: number): ReasoningQuality {
  if (score >= 0.99) return "sound";
  if (score >= 0.6) return "partial";
  if (score > 0) return "weak";
  return "none";
}

function toRef(m: MisconceptionRef | undefined): {
  candidates: RichAnswerEvaluation["misconceptionCandidates"];
  insight: { label: string; explanation: string } | null;
} {
  if (!m) return { candidates: [], insight: null };
  return {
    candidates: [
      { category: m.id, description: m.explanation, confidence: 0.82 },
    ],
    insight: { label: m.label, explanation: m.explanation },
  };
}

function result(
  score: number,
  classification: AnswerClassification,
  feedback: string,
  breakdown: StructuredGradeResult["breakdown"],
  rationale: string,
  misconception: MisconceptionRef | undefined,
  evidence: string,
): StructuredGradeResult {
  const { candidates, insight } = toRef(
    classification === "CORRECT" ? undefined : misconception,
  );
  return {
    classification,
    correctnessScore: clamp01(score),
    confidence: CONFIDENCE,
    reasoningQuality: reasoning(score),
    missingConcepts: [],
    misconceptionCandidates: candidates,
    evidenceQuote: evidence.slice(0, 600),
    feedback: feedback.slice(0, 1600),
    rationale: rationale.slice(0, 600),
    source: "structured",
    breakdown,
    misconceptionInsight: classification === "CORRECT" ? null : insight,
  };
}

export function gradeStructuredAnswer(
  question: StructuredQuestion,
  answer: StructuredAnswer,
): StructuredGradeResult {
  if (answer.format !== question.format) {
    return result(
      0,
      "INCORRECT",
      "That response didn't match the question — try again.",
      { summary: "Answer format mismatch." },
      "answer.format did not match question.format",
      undefined,
      `format ${answer.format} vs ${question.format}`,
    );
  }

  switch (question.format) {
    case "MCQ": {
      if (answer.format !== "MCQ") break;
      const correctOption = question.data.options.find(
        (o) => o.id === question.data.correctId,
      )!;
      const chosen = question.data.options.find(
        (o) => o.id === answer.selectedId,
      );
      const correct = answer.selectedId === question.data.correctId;
      const feedback = correct
        ? `Correct. ${correctOption.text}`
        : `Not quite. The right answer is: ${correctOption.text.replace(
            /\s*\.\s*$/,
            "",
          )}.` +
          (chosen?.misconception ? ` ${chosen.misconception.explanation}` : "");
      return result(
        correct ? 1 : 0,
        correct ? "CORRECT" : "INCORRECT",
        feedback,
        {
          summary: correct ? "Correct choice." : "Wrong choice.",
          correctAnswerText: correctOption.text,
          items: question.data.options.map((o) => ({
            id: o.id,
            text: o.text,
            correct: o.id === question.data.correctId,
            expected:
              o.id === question.data.correctId ? "correct answer" : undefined,
          })),
        },
        `mcq: selected ${answer.selectedId}, correct ${question.data.correctId}`,
        chosen?.misconception,
        `selected: "${chosen?.text ?? answer.selectedId}"`,
      );
    }

    case "MULTI_SELECT": {
      if (answer.format !== "MULTI_SELECT") break;
      const correctSet = new Set(question.data.correctIds);
      const selectedSet = new Set(answer.selectedIds);
      const hits = [...selectedSet].filter((id) => correctSet.has(id)).length;
      const extras = [...selectedSet].filter((id) => !correctSet.has(id));
      const misses = [...correctSet].filter((id) => !selectedSet.has(id));
      const denomExtras = Math.max(
        1,
        question.data.options.length - correctSet.size,
      );
      const score = clamp01(
        hits / correctSet.size - extras.length / denomExtras,
      );
      const exact = extras.length === 0 && misses.length === 0;
      const firstBadOption = question.data.options.find(
        (o) => o.id === extras[0],
      );
      const textOf = (id: string) =>
        question.data.options.find((o) => o.id === id)?.text ?? id;
      const feedback = exact
        ? `Correct — you selected exactly the right ${correctSet.size}.`
        : `${hits} of ${correctSet.size} correct.` +
          (misses.length ? ` Missed: ${misses.map(textOf).join(", ")}.` : "") +
          (extras.length
            ? ` Shouldn't be selected: ${extras.map(textOf).join(", ")}.`
            : "") +
          (firstBadOption?.misconception
            ? ` ${firstBadOption.misconception.explanation}`
            : "");
      return result(
        score,
        classify(score, exact),
        feedback,
        {
          summary: `${hits} of ${correctSet.size} correct${
            extras.length ? `, ${extras.length} extra` : ""
          }.`,
          items: question.data.options.map((o) => ({
            id: o.id,
            text: o.text,
            correct: correctSet.has(o.id),
            expected: correctSet.has(o.id) ? "should be selected" : undefined,
          })),
        },
        `multi: hits ${hits}/${correctSet.size}, extras ${extras.length}`,
        firstBadOption?.misconception,
        `selected: ${answer.selectedIds.map(textOf).join(", ") || "(none)"}`,
      );
    }

    case "TRUE_FALSE": {
      if (answer.format !== "TRUE_FALSE") break;
      const correct = answer.value === question.data.answer;
      const feedback = correct
        ? "Correct."
        : `Not quite — the statement is ${
            question.data.answer ? "true" : "false"
          }.` +
          (question.data.misconception
            ? ` ${question.data.misconception.explanation}`
            : "");
      return result(
        correct ? 1 : 0,
        correct ? "CORRECT" : "INCORRECT",
        feedback,
        {
          summary: correct ? "Correct." : "Incorrect.",
          correctAnswerText: question.data.answer ? "True" : "False",
        },
        `true_false: answered ${answer.value}, correct ${question.data.answer}`,
        question.data.misconception,
        `answered ${answer.value ? "True" : "False"}`,
      );
    }

    case "ORDER_STEPS": {
      if (answer.format !== "ORDER_STEPS") break;
      const correctOrder = question.data.correctOrder;
      const n = correctOrder.length;
      const submitted = answer.order.filter((id) => correctOrder.includes(id));
      const rank = new Map(correctOrder.map((id, i) => [id, i]));
      const exactPositions = submitted.filter(
        (id, i) => rank.get(id) === i,
      ).length;
      let adjOk = 0;
      for (let i = 0; i < submitted.length - 1; i += 1) {
        if ((rank.get(submitted[i]) ?? 0) < (rank.get(submitted[i + 1]) ?? 0)) {
          adjOk += 1;
        }
      }
      const positionScore = n > 0 ? exactPositions / n : 0;
      const adjacencyScore =
        submitted.length > 1 ? adjOk / (submitted.length - 1) : positionScore;
      const score = clamp01(0.4 * positionScore + 0.6 * adjacencyScore);
      const exact =
        submitted.length === n &&
        submitted.every((id, i) => correctOrder[i] === id);
      const textOf = (id: string) =>
        question.data.items.find((it) => it.id === id)?.text ?? id;
      const firstWrong = submitted.findIndex((id, i) => correctOrder[i] !== id);
      const feedback = exact
        ? "Correct order."
        : firstWrong >= 0
          ? `Close. "${textOf(correctOrder[firstWrong])}" should come at step ${
              firstWrong + 1
            }.`
          : "Not the right order yet.";
      return result(
        score,
        classify(score, exact),
        feedback,
        {
          summary: `${exactPositions} of ${n} steps in the right place.`,
          items: correctOrder.map((id, i) => ({
            id,
            text: `${i + 1}. ${textOf(id)}`,
            correct: submitted[i] === id,
          })),
          correctAnswerText: correctOrder.map(textOf).join(" → "),
        },
        `order: ${exactPositions}/${n} exact, adjacency ${adjOk}`,
        undefined,
        `ordered: ${answer.order.map(textOf).join(" → ")}`,
      );
    }

    case "CLASSIFY": {
      if (answer.format !== "CLASSIFY") break;
      const items = question.data.items;
      let correct = 0;
      const misplaced: typeof items = [];
      for (const item of items) {
        if (answer.assignments[item.id] === item.correctBucketId) correct += 1;
        else misplaced.push(item);
      }
      const score = items.length > 0 ? correct / items.length : 0;
      const exact = correct === items.length;
      const bucketLabel = (id: string) =>
        question.data.buckets.find((b) => b.id === id)?.text ?? id;
      const firstBad = misplaced.find((m) => m.misconception);
      const feedback = exact
        ? `All ${items.length} placed correctly.`
        : `${correct} of ${items.length} correct. "${misplaced[0]?.text}" belongs in "${bucketLabel(
            misplaced[0]?.correctBucketId ?? "",
          )}".` +
          (firstBad?.misconception
            ? ` ${firstBad.misconception.explanation}`
            : "");
      return result(
        score,
        classify(score, exact),
        feedback,
        {
          summary: `${correct} of ${items.length} placed correctly.`,
          items: items.map((it) => ({
            id: it.id,
            text: it.text,
            correct: answer.assignments[it.id] === it.correctBucketId,
            expected: bucketLabel(it.correctBucketId),
          })),
        },
        `classify: ${correct}/${items.length} correct`,
        firstBad?.misconception,
        `placed: ${items
          .map(
            (it) =>
              `${it.text}→${bucketLabel(answer.assignments[it.id] ?? "?")}`,
          )
          .join("; ")}`,
      );
    }

    case "MATCH_RELATIONSHIP": {
      if (answer.format !== "MATCH_RELATIONSHIP") break;
      const correctByLeft = new Map(
        question.data.correctPairs.map((p) => [p.leftId, p.rightId]),
      );
      const submittedByLeft = new Map(
        answer.pairs.map((p) => [p.leftId, p.rightId]),
      );
      let correct = 0;
      const wrongLeftIds: string[] = [];
      for (const [leftId, rightId] of correctByLeft) {
        if (submittedByLeft.get(leftId) === rightId) correct += 1;
        else wrongLeftIds.push(leftId);
      }
      const total = correctByLeft.size;
      const score = total > 0 ? correct / total : 0;
      const exact = correct === total;
      const leftText = (id: string) =>
        question.data.left.find((x) => x.id === id)?.text ?? id;
      const rightText = (id: string) =>
        question.data.right.find((x) => x.id === id)?.text ?? id;
      const firstWrong = wrongLeftIds[0];
      const misc = firstWrong
        ? question.data.misconceptionByLeft?.[firstWrong]
        : undefined;
      const feedback = exact
        ? `Correct — every relationship matched.`
        : `${correct} of ${total} matched.` +
          (firstWrong
            ? ` "${leftText(firstWrong)}" pairs with "${rightText(
                correctByLeft.get(firstWrong) ?? "",
              )}".`
            : "") +
          (misc ? ` ${misc.explanation}` : "");
      return result(
        score,
        classify(score, exact),
        feedback,
        {
          summary: `${correct} of ${total} relationships matched.`,
          items: question.data.left.map((l) => ({
            id: l.id,
            text: `${l.text} → ${rightText(correctByLeft.get(l.id) ?? "")}`,
            correct: submittedByLeft.get(l.id) === correctByLeft.get(l.id),
          })),
        },
        `match: ${correct}/${total}`,
        misc,
        `matched: ${answer.pairs
          .map((p) => `${leftText(p.leftId)}→${rightText(p.rightId)}`)
          .join("; ")}`,
      );
    }
  }

  return result(
    0,
    "INCORRECT",
    "That response couldn't be graded — try again.",
    { summary: "Ungradeable answer." },
    "grader fell through — answer shape did not match",
    undefined,
    "ungradeable",
  );
}

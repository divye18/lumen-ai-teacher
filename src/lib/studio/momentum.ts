import type {
  InteractionRow,
  LearningSessionRow,
  TeachingAnswerRow,
} from "@/lib/db/repositories";

/**
 * Learning momentum — derived ENTIRELY from real, timestamped rows
 * (`teaching_answers`, `interactions`, `learning_sessions`). No fabricated
 * streaks or metrics: if there is no activity, `hasActivity` is false and the
 * UI shows an empty state.
 */

export interface MomentumDay {
  date: string; // YYYY-MM-DD
  answered: number;
  correct: number;
}

export interface MomentumView {
  hasActivity: boolean;
  answered7d: number;
  correct7d: number;
  accuracy7d: number | null;
  remediations7d: number;
  conceptsAssessed: number;
  sessions7d: number;
  daily: MomentumDay[];
  trend: "up" | "flat" | "down" | null;
}

const DAY_MS = 86_400_000;
const REMEDIATION_ACTIONS = new Set([
  "RETEACH",
  "SIMPLIFY",
  "HINT",
  "DECREASE_DIFFICULTY",
]);

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function buildMomentum(input: {
  answers: TeachingAnswerRow[];
  interactions: InteractionRow[];
  sessions: LearningSessionRow[];
  conceptCount: number;
}): MomentumView {
  const now = Date.now();
  const since = now - 7 * DAY_MS;

  const recentAnswers = input.answers.filter(
    (a) => new Date(a.created_at).getTime() >= since,
  );
  const answered7d = recentAnswers.length;
  const correct7d = recentAnswers.filter(
    (a) => a.classification === "CORRECT",
  ).length;

  const remediations7d = input.interactions.filter((i) => {
    if (i.role !== "SYSTEM") return false;
    if (new Date(i.created_at).getTime() < since) return false;
    const meta = i.metadata as Record<string, unknown> | null;
    return (
      meta?.kind === "teaching_decision" &&
      typeof meta.action === "string" &&
      REMEDIATION_ACTIONS.has(meta.action)
    );
  }).length;

  const sessions7d = input.sessions.filter((s) => {
    const t = s.started_at ?? s.created_at;
    return new Date(t).getTime() >= since;
  }).length;

  // Per-day buckets for the last 7 days (oldest first).
  const buckets = new Map<string, MomentumDay>();
  for (let i = 6; i >= 0; i -= 1) {
    const key = dayKey(new Date(now - i * DAY_MS));
    buckets.set(key, { date: key, answered: 0, correct: 0 });
  }
  for (const a of recentAnswers) {
    const key = dayKey(new Date(a.created_at));
    const b = buckets.get(key);
    if (b) {
      b.answered += 1;
      if (a.classification === "CORRECT") b.correct += 1;
    }
  }
  const daily = [...buckets.values()];

  // Trend: compare correctness score of the earlier vs later half of recent answers.
  let trend: MomentumView["trend"] = null;
  const scored = [...recentAnswers]
    .filter((a) => typeof a.correctness_score === "number")
    .sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
  if (scored.length >= 4) {
    const mid = Math.floor(scored.length / 2);
    const avg = (arr: TeachingAnswerRow[]) =>
      arr.reduce((s, a) => s + (a.correctness_score ?? 0), 0) / arr.length;
    const delta = avg(scored.slice(mid)) - avg(scored.slice(0, mid));
    trend = delta > 0.08 ? "up" : delta < -0.08 ? "down" : "flat";
  }

  return {
    hasActivity: answered7d > 0 || sessions7d > 0,
    answered7d,
    correct7d,
    accuracy7d: answered7d > 0 ? correct7d / answered7d : null,
    remediations7d,
    conceptsAssessed: input.conceptCount,
    sessions7d,
    daily,
    trend,
  };
}

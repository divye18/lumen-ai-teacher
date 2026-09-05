# Demo guide

A concise runbook for demonstrating Lumen's adaptive teaching loop reliably.
See [README.md](README.md) for full setup; this file only adds what's specific
to running a demo.

**This is not a fake demo mode.** There is no hidden flag, no special UI, no
scripted learner state. Every step below exercises the same code path a real
learner uses. The one configuration choice below (LLM on/off) selects between
two teaching-question sources that already exist in the product for every
session, demo or not (see [`.env.example`](.env.example) and
`src/lib/assessment/structured/select.ts`).

## Two teaching-question modes (both real, both already shipped)

|                         | `LLM_API_KEY` unset/blank                                                                                        | `LLM_API_KEY` set                                                                                              |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Questions               | Deterministic, hand-authored bank (`src/lib/assessment/structured/bank.ts`), matched to the concept being taught | LLM-generated free-form, graded by the LLM evaluator                                                           |
| Grading                 | Pure deterministic code (`gradeStructuredAnswer`)                                                                | LLM structured-output judgment (conservative non-LLM fallback on failure, which never reports a misconception) |
| Misconception detection | Reliable — a wrong option tagged with a known misconception fires deterministically                              | Contingent on that specific LLM call's live judgment — not guaranteed on any single run                        |

**For a live demo where the misconception moment must land, run with
`LLM_API_KEY` unset or blank in `.env.local`.** This is the deterministic
fallback the Teaching Engine already falls back to whenever no LLM is
configured (see README → "Adaptive teaching engine" → Config) — not a
demo-only code path.

To confirm which mode is active, check `GET /api/health` →
`checks.llmProviderRegistered` (`false` = deterministic mode).

## The demo lesson

`src/lib/demo/demo-lesson.ts` — **"How CPU cache memory works"**, 4 concepts in
a fixed sequence:

1. `memory-hierarchy` — EXPLAIN → VISUALIZE → **ASK**
2. `cache-vs-ram` — EXPLAIN → **ASK**
3. `cache-hits-and-misses` — EXPLAIN → **ASK** → **ASSESS**
4. `locality-of-reference` — EXPLAIN → **ASK**

Reached via **Studio → Demo** (`/studio/demo`, calls `ensureDemoSession`) — real
persistence, real adaptive engine, only the lesson content is fixed.

## Exact demo script (deterministic mode)

A fresh learner starts at low mastery, so the question-ranking logic
(`pickStructuredQuestion` → `wantMisconception = struggling || masteryPoints <
55`) already favors a misconception-mapped question on the very first ASK —
no need to answer wrong more than once to reach it.

1. Sign in, go to **Studio**, click **Demo** → lands in the Teaching Room on
   _Memory hierarchy_.
2. Read the explanation + visualization; continue to the question.
3. First question (bank entry `memory-hierarchy`, MCQ, difficulty 2):
   > "As you move down the memory hierarchy from registers toward disk, what
   > happens to capacity and access time?"
   - Correct answer: _"Capacity grows and access time grows (bigger but
     slower)."_
   - **Pick instead:** _"Capacity grows and access time shrinks (bigger and
     faster)."_ — tagged `THINKS_BIGGER_IS_FASTER`.
4. Lumen shows the amber **"Lumen noticed a pattern"** card (`MisconceptionReveal`)
   — first-seen, severity, and what Lumen is doing about it. Mastery moves down.
5. Lumen re-teaches the concept a different way, then serves a follow-up
   question. Answer it correctly (any answer classified `CORRECT` on this
   concept is genuine improvement evidence — the exact next question is chosen
   adaptively, not scripted here).
6. Continue through the remaining 3 concepts normally (`cache-vs-ram`,
   `cache-hits-and-misses` — which also has a second, harder misconception-
   tagged question if you want a second detection moment — and
   `locality-of-reference`).
7. Finish the lesson → session-complete screen: **"Where you stand"**, **"What
   changed"**, **"Learning signals this session"** (now includes the
   misconception-resolution event once it clears), **"Next best move"**.

## Verification

```bash
npm test                    # full unit suite, no network
npm run test:integration    # live Supabase — self-skips without LUMEN_TEST_* vars
npm run typecheck
npm run lint
npm run build
```

## Backup plan

- **LLM configured but you want the guaranteed path:** temporarily blank
  `LLM_API_KEY` in `.env.local` and restart `npm run dev`. No data is lost;
  this only changes which question source is used going forward.
- **The picked distractor doesn't trigger a misconception on a given
  run:** confirm `LLM_API_KEY` is actually blank (check `/api/health`) — if an
  LLM key is active, that's the expected reason (see the mode table above).
- **A network request fails / a step looks stuck:** the Teaching Room has a
  dedicated retry (`ErrorState` → "This step didn't load"); reloading the page
  resumes the session from persisted state (mastery/progress are never lost —
  only the on-screen elapsed clock restarts).
- **Session gets stuck or you want a clean run:** start a fresh **Demo**
  session — `ensureDemoSession` reuses an untouched one or creates a new one
  automatically.

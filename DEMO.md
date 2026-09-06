# Demo guide

A concise runbook for demonstrating Lumen's adaptive teaching loop reliably.
See [README.md](README.md) for full setup; this file only adds what's specific
to running a demo.

**This is not a fake demo mode.** There is no hidden flag, no special UI, no
scripted learner state. Every step below exercises the same code path a real
learner uses. The configuration choice below (`ASSESSMENT_LLM_ENABLED`)
selects between two teaching-question sources that already exist in the
product for every session, demo or not (see [`.env.example`](.env.example) and
`src/lib/assessment/structured/select.ts`).

## Two independent knobs: AI explanation vs. AI assessment

`LLM_API_KEY` and `ASSESSMENT_LLM_ENABLED` control two **separate**
capabilities. Configuring an LLM key alone no longer switches the assessment
engine — it only makes richer AI explanations/enrichment available
(conversation, teaching-content prose, the teaching engine's reasoning, which
is always reconciled by the deterministic policy either way).
`ASSESSMENT_LLM_ENABLED` (default `false`) is the only thing that permits an
LLM to drive question generation and grading. Assessment stays on the
deterministic path — the same one used with no LLM configured at all —
regardless of whether `LLM_API_KEY` is set, unless you explicitly opt in.

## Two teaching-question modes (both real, both already shipped)

|                         | `ASSESSMENT_LLM_ENABLED=false` (default, any `LLM_API_KEY`)                                                      | `ASSESSMENT_LLM_ENABLED=true` (requires `LLM_API_KEY`)                                                         |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Questions               | Deterministic, hand-authored bank (`src/lib/assessment/structured/bank.ts`), matched to the concept being taught | LLM-generated free-form, graded by the LLM evaluator                                                           |
| Grading                 | Pure deterministic code (`gradeStructuredAnswer`)                                                                | LLM structured-output judgment (conservative non-LLM fallback on failure, which never reports a misconception) |
| Misconception detection | Reliable — a wrong option tagged with a known misconception fires deterministically                              | Contingent on that specific LLM call's live judgment — not guaranteed on any single run                        |

**For a live demo where the misconception moment must land, leave
`ASSESSMENT_LLM_ENABLED` unset (or `false`) in `.env.local`.** This is the
default, and it is the deterministic fallback the Teaching Engine already
falls back to whenever no LLM is permitted to drive assessment (see README →
"Adaptive teaching engine" → Config) — not a demo-only code path. This holds
even with a valid `LLM_API_KEY` configured for AI explanations.

`GET /api/health` → `checks.llmProviderRegistered` reports whether an LLM
provider exists at all (`false` = no AI explanation either). It does **not**
report assessment mode — that's controlled purely by `ASSESSMENT_LLM_ENABLED`
in `.env.local`, independent of the health check.

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

- **LLM configured but you want the guaranteed assessment path:** confirm
  `ASSESSMENT_LLM_ENABLED` is unset or `false` in `.env.local` (the default) —
  no need to remove `LLM_API_KEY` at all; AI explanations keep working, only
  assessment stays deterministic.
- **The picked distractor doesn't trigger a misconception on a given
  run:** confirm `ASSESSMENT_LLM_ENABLED` is actually `false` — if it's `true`,
  that's the expected reason (see the mode table above).
- **A network request fails / a step looks stuck:** the Teaching Room has a
  dedicated retry (`ErrorState` → "This step didn't load"); reloading the page
  resumes the session from persisted state (mastery/progress are never lost —
  only the on-screen elapsed clock restarts).
- **Session gets stuck or you want a clean run:** start a fresh **Demo**
  session — `ensureDemoSession` reuses an untouched one or creates a new one
  automatically.

# Lumen

**Don't just get the answer. Understand it.**

Lumen is an adaptive AI teacher. It builds a model of what a student knows,
detects misconceptions while they learn, and changes how it teaches until they
understand.

> **Status: adaptive teaching engine + learner-facing product.** Foundation +
> Supabase persistence + RAG ingestion/retrieval + the full teaching loop
> (material → lesson plan → teach → question → evaluate → learner-state
> update → adaptive next decision) are in place, and so is the learner-facing
> UI: diagnostic pre-assessment, the Teaching Room, misconception detection +
> remediation + verification, session intelligence, and session completion.
> Voice has a working foundation; avatar and 3D visuals are still evolving.
> See [Project status](#project-status) and [DEMO.md](DEMO.md) for a demo
> runbook.

## Core architecture principle

**AI decides _what_. Deterministic application code decides _how_.**

- The AI/decision layer proposes a teaching action (explain, give an example,
  ask a question, visualize, reteach, …).
- Its output is coerced into a typed, schema-validated
  [`TeachingDecision`](src/types/teaching.ts) before anything acts on it.
- The deterministic lesson runtime turns a validated decision into what the
  learner sees.
- The frontend **never** independently decides teaching strategy, and raw LLM
  output **never** directly controls frontend behaviour. Visual instructions
  are declarative [`VisualDirective`](src/types/visuals.ts) values mapped to a
  fixed catalogue of renderers.

## Technology stack

| Area                      | Choice                                                         |
| ------------------------- | -------------------------------------------------------------- |
| Framework                 | Next.js (App Router) + React + TypeScript (strict)             |
| Styling                   | Tailwind CSS                                                   |
| Animation                 | Framer Motion                                                  |
| 3D                        | React Three Fiber + Three.js                                   |
| Backend                   | Next.js route handlers / server components (modular monolith)  |
| Database                  | Supabase PostgreSQL                                            |
| Vector store              | Supabase pgvector                                              |
| AI / Voice / TTS / Avatar | Provider abstraction layer — no vendor SDK in application code |
| Validation                | Zod at every API and AI-output boundary                        |
| Tests                     | Vitest                                                         |

Deployment is intentionally left open for now.

## Repository structure

```
supabase/
  migrations/              Ordered SQL: extensions → tables → indexes → RLS
  seed.sql                 Dev seed data (topic: Computer Memory)
  config.toml              Supabase CLI config
src/
  app/                     Routes (App Router)
    page.tsx               "/"        — landing placeholder
    setup/                 "/setup"   — placeholder
    lesson/                "/lesson"  — placeholder
    report/                "/report"  — placeholder
    api/health/            "/api/health" — liveness + readiness JSON
  components/               Shared UI (placeholder component for now)
  config/
    public.ts              Browser-safe config (NEXT_PUBLIC_*)
    server.ts              Server-only config + secrets (guarded by `server-only`)
  lib/
    ai/                    LLM + Embedding providers (OpenAI-compatible, no SDK),
                           registry, structured-generation helper
    db/                    Typed Supabase clients, Database types, DB enums,
                           Zod write-schemas, repositories/ (one store per table)
    rag/                   PDF ingestion, chunking, pgvector retrieval
    lesson/                Lesson planner + persistence service
    teaching/              contracts (Zod), mastery math, policy, engine,
                           content generator
    assessment/            question generator + structured answer evaluator
    learner/               learner-state update + misconception taxonomy
    session/               teaching orchestrator, context builders, citations,
                           request schemas, DTO views
    visuals/ voice/ avatar/ documents/   later-phase boundaries
    api/ auth/             HTTP helpers, requireUser
    errors.ts result.ts   coded recoverable errors + Result<T, E>
  types/                    Domain contracts (Concept, Lesson, LearnerState, …)
```

Folders exist only where there is a concrete architectural purpose.

## Local development

Requires Node.js 20+.

```bash
npm install
cp .env.example .env.local   # then fill in values as needed
npm run dev                  # http://localhost:3000
```

The app runs without any external services configured. Supabase and AI
providers are optional during the foundation phase; the relevant code paths
report themselves as "not configured" rather than crashing.

### Useful scripts

```bash
npm run dev           # start the dev server
npm run build         # production build
npm run typecheck     # tsc --noEmit
npm run lint          # eslint
npm run test          # vitest run
npm run format        # prettier --write .
```

Verify the app is up:

```bash
curl http://localhost:3000/api/health
```

## Environment configuration

All variables are documented in [`.env.example`](.env.example). Configuration
is split by trust boundary:

- **Public** (`NEXT_PUBLIC_*`) — inlined into the browser bundle. Validated by
  [`src/config/public.ts`](src/config/public.ts).
- **Server-only** — secrets (service-role key, provider API keys). Validated by
  [`src/config/server.ts`](src/config/server.ts), which imports `server-only`
  so it can never be bundled for the client.

Never commit `.env.local` or real secrets.

## Database

Postgres on **Supabase** with `pgvector` — one database, no separate vector
store. `document_chunks.embedding` is `vector(1536)` (migration
`20260903000100`) with an HNSW cosine index, and semantic search runs through
the `match_document_chunks` RPC (see [RAG](#document-ingestion--retrieval-rag)).

### Architecture

The database stores **persistent evidence and learner state — nothing more**.
It does not decide how to teach. Responsibilities stay separated:

| Layer           | Responsibility                         |
| --------------- | -------------------------------------- |
| Database        | persistent evidence / state            |
| Teaching Engine | decision-making (later phase)          |
| LLM             | reasoning / content generation (later) |
| Frontend        | presentation                           |

`concept_mastery` is a **roll-up**, never the sole record: `interactions`
(append-only) and `misconceptions` preserve the evidence behind every change,
so the Teaching Engine can later answer _what happened, why mastery changed,
what was tried, and what followed_.

Tables: `profiles`, `learner_profiles`, `documents`, `document_chunks`,
`concepts`, `concept_relationships`, `learning_sessions`, `interactions`,
`concept_mastery`, `misconceptions`, `assessments`, `assessment_questions`,
`assessment_answers`. Row-Level Security is enabled on every one — a signed-in
user reaches only their own rows. The service-role key is server-only and
bypasses RLS by design; it is never imported by client code.

### Supabase project setup

1. Create a project at [supabase.com](https://supabase.com) (or run locally
   with `npx supabase start`).
2. Copy these into `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (public)
   - `SUPABASE_SERVICE_ROLE_KEY` (server-only)
3. Link the CLI: `npx supabase link --project-ref <ref>`.

### Applying migrations

Migrations live in `supabase/migrations/` as an ordered SQL sequence
(extensions → tables → indexes → RLS/policies) and are fully reproducible.

```bash
npx supabase db push        # apply to the linked remote project
npx supabase db reset       # local: drop, re-run all migrations, then seed
```

### Seeding development data

`supabase/seed.sql` creates one dev user (`dev@lumen.test`) and a small
**Computer Memory** dataset — concepts (CPU, Cache, RAM, Storage, Stack, Heap),
prerequisite relationships, a session with interactions, mastery rows spanning
every status, a misconception, and an assessment. It runs automatically on
`npx supabase db reset`.

### Database types

[`src/lib/db/types.ts`](src/lib/db/types.ts) is **hand-written** (the generator
needs CLI auth that is not available here) but matches the shape of
`supabase gen types` output. Regenerate once a project is linked:

```bash
npm run db:types            # supabase gen types typescript --local > src/lib/db/types.ts
```

### Tests

- **Unit** (`npm test`) — ~190 tests: mastery/confidence math, difficulty and
  strategy transitions, teaching-action selection + guardrails, the critical
  adaptive loop (wrong vs right answer → different next action), all AI-output
  Zod contracts, misconception dedup/strengthening, learner-state updates,
  policy-fact derivation, structured-generation repair, provider error handling,
  chunking, PDF validation. No network.
- **Integration** (`npm run test:integration`) — run against a live stack; they
  self-skip unless the `LUMEN_TEST_*` vars are set (see `.env.example`). Nothing
  is mocked; the teaching-loop test proves material → plan → teach → wrong
  answer → mastery down + misconception → remediation → better answer → mastery
  up.

## Document ingestion & retrieval (RAG)

PDF-only for now. The pipeline is server-side and deterministic; every provider
secret stays server-only.

```
PDF bytes → validate (magic number + size + MIME cross-check)
          → extract per-page text (unpdf / pdf.js)
          → normalize + deterministic chunk (paragraph/heading aware)
          → embed (OpenAI-compatible, behind EmbeddingProvider)
          → persist documents + document_chunks (with pgvector embedding)
```

- **Embedding model** — `text-embedding-3-small`, **1536 dims**, via the
  OpenAI `/embeddings` REST API (no vendor SDK). Configure with
  `EMBEDDING_PROVIDER` / `EMBEDDING_MODEL` / `EMBEDDING_BASE_URL` /
  `EMBEDDING_DIMENSIONS` / `EMBEDDING_API_KEY`. Changing the dimension needs a
  new migration altering `document_chunks.embedding` and rebuilding the index.
- **Chunking** — character-based, configurable via `RAG_CHUNK_SIZE` /
  `RAG_CHUNK_OVERLAP` / `RAG_MIN_CHUNK_SIZE`. Splits on paragraphs and headings,
  falls back to sentence then hard cuts, merges tiny fragments, carries
  `sectionTitle` + page number + char range for citations. No LLM involved.
- **Retrieval** — `POST /api/retrieval` embeds the query and calls the
  `match_document_chunks` RPC (`SECURITY INVOKER`, `user_id = auth.uid()`,
  granted only to `authenticated`). Cross-user retrieval is impossible.
  Results carry document id/name, chunk id/index, page, section, and score.
- **Ingestion** — `POST /api/documents/ingest` (multipart `file`, optional
  `title`). Auth via the Supabase session cookie; ownership is the auth user.

New migrations to push (`npx supabase db push`):
`20260903000000_auto_create_profile`, `20260903000100_document_chunks_embedding_dimension`,
`20260903000200_document_chunks_vector_index`, `20260903000300_match_document_chunks_rpc`.

## Adaptive teaching engine

Lumen optimises the **learning process**, not the response. The backend is a
persistent learner model plus a decision engine for teaching.

```
material → retrieval → LESSON PLAN → teach → question → student answer
   → evaluation → LEARNER STATE UPDATE → TEACHING DECISION → adaptive next step
```

**AI decides WHAT, deterministic code decides HOW.** Every model output passes a
Zod contract (`src/lib/teaching/contracts.ts`); the product layer validates it
and can override it.

- **Learner model** — `concept_mastery` (0–1 in DB, exposed as an
  interpretable **0–100** product scale with bands: Not understood / Emerging /
  Developing / Proficient / Strong), confidence, attempt counters, a
  misconception taxonomy, and the full `interactions` evidence log. Every
  interaction can update it.
- **Lesson planner** (`src/lib/lesson/`) — turns a topic (+ retrieved source
  material) into a structured, validated `LessonPlan` (objective, concept chain
  with prerequisites / difficulty / importance, teaching sequence, assessment
  strategy). Persisted to `lessons` + `lesson_concepts`. Deterministic fallback
  plan when no LLM is configured.
- **Teaching engine** (`src/lib/teaching/`) — `mastery.ts` (bounded, deterministic
  state math), `policy.ts` (the IF/THEN rules + strategy rotation + difficulty
  ladder + guardrails that reconcile or replace the AI proposal), `engine.ts`
  (LLM proposal → reconcile → `ResolvedTeachingDecision`). 13 actions:
  `EXPLAIN EXAMPLE ANALOGY VISUALIZE ASK HINT SIMPLIFY RETEACH RECAP
INCREASE_DIFFICULTY DECREASE_DIFFICULTY ASSESS MOVE_FORWARD`. Every decision
  is persisted with a concise, non-CoT **adaptation narrative** ("visible
  intelligence").
- **Question generation** (`src/lib/assessment/question-generator.ts`) —
  free-form only, kind chosen from mastery (conceptual → application → scenario
  → problem-solving), grounded in source when a document is taught.
- **Answer evaluation** (`src/lib/assessment/evaluator.ts`) — structured, not
  string matching: `CORRECT / PARTIALLY_CORRECT / INCORRECT / UNCERTAIN`,
  correctness score, missing components, misconception candidates. Fallback is
  conservative (`UNCERTAIN`), never a faked judgement.
- **Orchestrator** (`src/lib/session/orchestrator.ts`) — the deterministic loop;
  resumable sessions in `learning_sessions` (+ `lesson_id`, `plan_cursor`,
  `time_budget_minutes`, `mastery_snapshot`).

APIs (thin route handlers; Node runtime; auth = Supabase session cookie):

| Route                            | Purpose                                               |
| -------------------------------- | ----------------------------------------------------- |
| `POST /api/lessons`              | plan + persist a lesson                               |
| `POST /api/teaching/session`     | start (`lessonId`) or resume (`sessionId`)            |
| `POST /api/teaching/step`        | next teaching action + rendered content/question      |
| `POST /api/teaching/interaction` | submit answer → evaluate → update state → decide next |

New migration to push: `20260904000000_teaching_engine` (`lessons`,
`lesson_concepts`, `teaching_questions`, `teaching_answers`, `learning_sessions`
columns, RLS on all).

Config: `LLM_PROVIDER` / `LLM_API_KEY` / `LLM_MODEL` / `LLM_BASE_URL` /
`LLM_TEMPERATURE`. Without a key the engine runs in deterministic policy-only
mode and still adapts.

## Project status

Implemented so far:

- [x] Next.js + TypeScript (strict) + Tailwind project
- [x] Typed domain contracts for the whole system
- [x] `TeachingDecision` and `VisualDirective` schemas with validation
- [x] Provider interfaces: LLM, embeddings, speech-to-text, text-to-speech, avatar
- [x] Split public / server-only configuration
- [x] **Supabase schema + migrations** (13 tables, indexes, RLS on all)
- [x] **Typed DB access + repositories** (learner profile, mastery, session,
      interaction, concept, misconception, assessment)
- [x] **Persistent `LearnerStateStore`** + database → `LearnerState` assembly
- [x] **Development seed data** (Computer Memory)
- [x] **RAG foundation** — PDF ingestion, deterministic chunking, OpenAI
      embeddings behind `EmbeddingProvider`, `vector(1536)` + HNSW index,
      RLS-scoped `match_document_chunks` RPC, `/api/documents/ingest` +
      `/api/retrieval`
- [x] **Auto-create profile** trigger for new auth users
- [x] **Adaptive teaching engine (P0 loop)** — learner model (0–100 mastery,
      confidence, misconception taxonomy), lesson planner, deterministic
      teaching policy + LLM-assisted engine, structured question generation and
      answer evaluation, bounded learner-state updates, resumable sessions, and
      the `/api/lessons` + `/api/teaching/*` routes
- [x] `LLMProvider` implementation (OpenAI-compatible chat, no SDK) + schema-
      validated structured generation with repair-retry
- [x] Routes: `/`, `/setup`, `/lesson`, `/report`, `/api/health`
- [x] ESLint, Prettier, Vitest (unit + integration split)

**Not** implemented (later phases): the learner-facing UI (`/setup`, `/lesson`,
`/report`), visual directives / 3D, voice, avatar, concept-graph auto-extraction
from documents, spaced review, and multi-session longitudinal reports.

## Planned development phases

1. **Foundation** _(done)_ — skeleton, contracts, tooling.
2. **Data layer** _(done)_ — Supabase schema + migrations, pgvector enabled,
   RLS, typed repositories, persistent learner state, seed data.
3. **Ingestion & RAG** _(phase 1 done)_ — PDF parsing, deterministic chunking,
   embeddings, pgvector retrieval, ingest/retrieval APIs. Next: more formats,
   re-ranking, concept extraction.
4. **Teaching engine** _(P0 loop done)_ — learner model, lesson planner,
   deterministic policy + LLM-assisted decisions, question generation, answer
   evaluation, bounded state updates, session orchestrator, teaching APIs.
5. **Assessment & misconceptions** _(P0 done)_ — structured evaluation and a
   misconception taxonomy with strengthening. Next: diagnostic assessments,
   spaced review.
6. **Learning surface** — `/setup`, `/lesson`, `/report` UIs.
7. **Visualization** — diagram / chart / code / 3D renderers mapped to
   `VisualDirective`.
8. **Voice & avatar** — concrete provider implementations behind the existing
   interfaces.

# Lumen

**Don't just get the answer. Understand it.**

Lumen is an adaptive AI teacher. It builds a model of what a student knows,
detects misconceptions while they learn, and changes how it teaches until they
understand.

> **Status: persistence foundation.** The project skeleton (contracts, provider
> abstractions, config, routing) plus the full Supabase schema, typed
> repositories and persistent learner state are in place. No teaching,
> ingestion, RAG or AI logic yet. See [Project status](#project-status).

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
    ai/                    LLMProvider / EmbeddingProvider interfaces + registry
    db/                    Typed Supabase clients, Database types, DB enums,
                           Zod write-schemas, and repositories/ (one store per
                           table the app uses)
    learner/               LearnerStateStore (Supabase impl) + state assembly
    rag/                   Retriever interface (pgvector-backed, later)
    teaching/              TeachingEngine boundary + decision validation
    assessment/            AnswerEvaluator boundary + evaluation validation
    visuals/               VisualDirective validation + safe fallback
    voice/                 SpeechToText / TextToSpeech provider interfaces
    avatar/                AvatarProvider interface
    documents/             DocumentStore boundary
    errors.ts             Explicit, coded, recoverable error types
    result.ts             Result<T, E> helper
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

Postgres on **Supabase**, with `pgvector` enabled now (the same database backs
RAG later — there is no separate vector store). Vector _search_ is not
implemented yet, and the `document_chunks.embedding` column is an unbounded
`vector` until the embedding model is chosen.

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

- **Unit** (`npm test`) — schema bounds, enum/language validation, learner-state
  assembly. No network.
- **Integration** (`npm run test:integration`) — run against a live local stack;
  they self-skip unless `LUMEN_TEST_SUPABASE_URL` and
  `LUMEN_TEST_SERVICE_ROLE_KEY` are set. Nothing is mocked.

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
- [x] Routes: `/`, `/setup`, `/lesson`, `/report`, `/api/health`
- [x] ESLint, Prettier, Vitest (unit + integration split)

**Not** implemented (later phases): document ingestion, RAG, embeddings and
vector search, the teaching decision engine, misconception _detection_,
assessment _grading_, voice, avatar, 3D scenes, dashboards, authentication UI,
and lesson UI.

## Planned development phases

1. **Foundation** _(done)_ — skeleton, contracts, tooling.
2. **Data layer** _(done)_ — Supabase schema + migrations, pgvector enabled,
   RLS, typed repositories, persistent learner state, seed data.
3. **Ingestion & RAG** — document parsing, chunking, embeddings, retrieval
   (fixes the embedding dimension and adds the vector index).
4. **Teaching engine** — the AI decision layer producing validated
   `TeachingDecision`s; deterministic lesson runtime.
5. **Assessment & misconceptions** — answer evaluation, misconception
   detection and tracking.
6. **Learning surface** — `/setup`, `/lesson`, `/report` UIs.
7. **Visualization** — diagram / chart / code / 3D renderers mapped to
   `VisualDirective`.
8. **Voice & avatar** — concrete provider implementations behind the existing
   interfaces.

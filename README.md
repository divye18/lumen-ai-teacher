# Lumen

**Don't just get the answer. Understand it.**

Lumen is an adaptive AI teacher. It builds a model of what a student knows,
detects misconceptions while they learn, and changes how it teaches until they
understand.

> **Status: foundation phase.** This repository currently contains the project
> skeleton only — typed domain contracts, provider abstractions, configuration,
> routing, and quality tooling. None of the teaching features are implemented
> yet. See [Project status](#project-status).

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
    db/                    Supabase browser + server clients
    rag/                   Retriever interface (pgvector-backed, later)
    teaching/              TeachingEngine boundary + decision validation
    learner/               LearnerStateStore boundary
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

## Project status

Implemented in this phase:

- [x] Next.js + TypeScript (strict) + Tailwind project
- [x] Typed domain contracts for the whole system
- [x] `TeachingDecision` and `VisualDirective` schemas with validation
- [x] Provider interfaces: LLM, embeddings, speech-to-text, text-to-speech, avatar
- [x] Split public / server-only configuration
- [x] Supabase browser + server client foundation
- [x] Routes: `/`, `/setup`, `/lesson`, `/report`, `/api/health`
- [x] ESLint, Prettier, Vitest

**Not** implemented (later phases): document ingestion, RAG, the teaching
decision engine, misconception detection, assessment logic, voice, avatar,
3D scenes, dashboards, authentication UI, lesson UI, and the database schema
and migrations.

## Planned development phases

1. **Foundation** _(this phase)_ — skeleton, contracts, tooling.
2. **Data layer** — full Supabase schema + migrations, pgvector setup,
   document storage, concrete `LearnerStateStore` / `DocumentStore`.
3. **Ingestion & RAG** — document parsing, chunking, embeddings, retrieval.
4. **Teaching engine** — the AI decision layer producing validated
   `TeachingDecision`s; deterministic lesson runtime.
5. **Assessment & misconceptions** — answer evaluation, misconception
   detection and tracking.
6. **Learning surface** — `/setup`, `/lesson`, `/report` UIs.
7. **Visualization** — diagram / chart / code / 3D renderers mapped to
   `VisualDirective`.
8. **Voice & avatar** — concrete provider implementations behind the existing
   interfaces.

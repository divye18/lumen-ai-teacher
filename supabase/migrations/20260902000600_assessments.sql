-- Migration 6/8: assessments, questions, answers

-- ── assessments ─────────────────────────────────────────────────────────────
create table public.assessments (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  session_id      uuid references public.learning_sessions (id) on delete set null,
  title           text,
  topic           text,
  assessment_type text not null default 'FORMATIVE'
                    check (assessment_type in (
                      'PLACEMENT', 'FORMATIVE', 'SUMMATIVE', 'DIAGNOSTIC')),
  status          text not null default 'PLANNED'
                    check (status in (
                      'PLANNED', 'IN_PROGRESS', 'COMPLETED', 'ABANDONED')),
  score           numeric check (score is null or score >= 0),
  max_score       numeric check (max_score is null or max_score >= 0),
  started_at      timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz not null default now()
);

comment on table public.assessments is 'A set of questions with a shared purpose.';

-- ── assessment_questions ────────────────────────────────────────────────────
-- expected_answer must NOT be sent to client components — repositories expose
-- a client-safe projection that omits it.
create table public.assessment_questions (
  id             uuid primary key default gen_random_uuid(),
  assessment_id  uuid not null references public.assessments (id) on delete cascade,
  concept_id     uuid references public.concepts (id) on delete set null,
  question_text  text not null,
  question_type  text not null default 'SHORT_ANSWER'
                   check (question_type in (
                     'MULTIPLE_CHOICE', 'SHORT_ANSWER', 'NUMERIC',
                     'FREE_RESPONSE', 'EXPLAIN_WHY')),
  difficulty     smallint not null default 3 check (difficulty between 1 and 5),
  expected_answer text,
  metadata       jsonb not null default '{}'::jsonb,
  position       integer not null default 0 check (position >= 0),
  created_at     timestamptz not null default now(),
  unique (assessment_id, position)
);

comment on column public.assessment_questions.expected_answer is
  'Rubric / reference answer. Never expose to client components.';

-- ── assessment_answers ──────────────────────────────────────────────────────
create table public.assessment_answers (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.assessment_questions (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  answer_text text not null default '',
  is_correct  boolean,
  score       numeric check (score is null or score between 0 and 1),
  evaluation  jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

comment on table public.assessment_answers is
  'A learner response plus its (later AI-assisted) evaluation.';

-- Lumen — Phase 2: adaptive teaching engine + learner model
--
-- Additive only. Nothing in the RAG / persistence layers is rewritten.
-- New tables:
--   lessons            — a structured, validated lesson plan
--   lesson_concepts    — ordered concepts within a lesson (relational view)
--   teaching_questions — a question posed during the adaptive loop
--   teaching_answers   — a student answer + its structured evaluation
-- `learning_sessions` gains the columns the teaching loop needs.
--
-- The turn-by-turn teaching Q&A is deliberately separate from `assessments`
-- (which model batch placement / summative tests): a teaching question is
-- transient, generated from live learner state, and has no assessment parent.
--
-- Mastery is still stored 0..1 in `concept_mastery.mastery_score` (unchanged
-- CHECK); the application exposes an interpretable 0..100 product scale on top.

-- ── lessons ────────────────────────────────────────────────────────────────
create table public.lessons (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles (id) on delete cascade,
  document_id       uuid references public.documents (id) on delete set null,
  title             text not null check (char_length(title) between 1 and 300),
  topic             text not null check (char_length(topic) between 1 and 300),
  objective         text not null,
  language          text not null default 'en'
                      check (language in ('en', 'hi', 'hinglish')),
  teaching_style    text
                      check (teaching_style is null or teaching_style in (
                        'formal', 'conversational', 'example-first',
                        'analogy-first', 'visual-first', 'socratic')),
  estimated_minutes integer
                      check (estimated_minutes is null
                        or estimated_minutes between 1 and 600),
  source_grounded   boolean not null default false,
  plan_source       text not null default 'fallback'
                      check (plan_source in ('ai', 'ai+source', 'fallback')),
  status            text not null default 'DRAFT'
                      check (status in ('DRAFT', 'ACTIVE', 'COMPLETED', 'ABANDONED')),
  plan              jsonb not null default '{}'::jsonb,
  citations         jsonb not null default '[]'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.lessons is
  'A structured, Zod-validated lesson plan. `plan` holds the full LessonPlan; '
  'lesson_concepts is the queryable relational projection.';

create trigger lessons_set_updated_at
  before update on public.lessons
  for each row execute function public.set_updated_at();

-- ── lesson_concepts ────────────────────────────────────────────────────────
create table public.lesson_concepts (
  id              uuid primary key default gen_random_uuid(),
  lesson_id       uuid not null references public.lessons (id) on delete cascade,
  concept_id      uuid references public.concepts (id) on delete set null,
  concept_key     text not null check (concept_key ~ '^[a-z0-9-]{1,80}$'),
  title           text not null check (char_length(title) between 1 and 200),
  summary         text not null default '',
  position        integer not null check (position >= 0),
  difficulty      smallint not null default 3 check (difficulty between 1 and 5),
  importance      smallint not null default 3 check (importance between 1 and 5),
  is_prerequisite boolean not null default false,
  status          text not null default 'PENDING'
                    check (status in (
                      'PENDING', 'TEACHING', 'ASSESSING', 'COMPLETED', 'SKIPPED')),
  created_at      timestamptz not null default now(),
  constraint lesson_concepts_unique_position unique (lesson_id, position),
  constraint lesson_concepts_unique_key unique (lesson_id, concept_key)
);

-- ── teaching_questions ─────────────────────────────────────────────────────
create table public.teaching_questions (
  id                uuid primary key default gen_random_uuid(),
  session_id        uuid not null references public.learning_sessions (id) on delete cascade,
  lesson_id         uuid references public.lessons (id) on delete set null,
  user_id           uuid not null references public.profiles (id) on delete cascade,
  concept_key       text not null,
  concept_id        uuid references public.concepts (id) on delete set null,
  question_kind     text not null
                      check (question_kind in (
                        'CONCEPTUAL', 'APPLICATION', 'SCENARIO', 'PROBLEM_SOLVING')),
  difficulty        smallint not null default 3 check (difficulty between 1 and 5),
  prompt            text not null,
  -- Rubric / model reasoning. NEVER sent to client components.
  expected_reasoning text,
  source_grounded   boolean not null default false,
  citations         jsonb not null default '[]'::jsonb,
  metadata          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now()
);

comment on column public.teaching_questions.expected_reasoning is
  'Model rubric. Never expose to client components.';

-- ── teaching_answers ───────────────────────────────────────────────────────
create table public.teaching_answers (
  id                uuid primary key default gen_random_uuid(),
  question_id       uuid not null references public.teaching_questions (id) on delete cascade,
  session_id        uuid not null references public.learning_sessions (id) on delete cascade,
  user_id           uuid not null references public.profiles (id) on delete cascade,
  response_text     text not null default '',
  classification    text
                      check (classification is null or classification in (
                        'CORRECT', 'PARTIALLY_CORRECT', 'INCORRECT', 'UNCERTAIN')),
  correctness_score numeric(4, 3)
                      check (correctness_score is null
                        or correctness_score between 0 and 1),
  evaluation        jsonb not null default '{}'::jsonb,
  response_time_ms  integer check (response_time_ms is null or response_time_ms >= 0),
  created_at        timestamptz not null default now()
);

comment on table public.teaching_answers is
  'A learner response plus its structured (AI-assisted) evaluation. The '
  'deterministic learner-state transition is derived from `classification` + '
  '`correctness_score` by the application, not stored here.';

-- ── learning_sessions: teaching-loop columns ──────────────────────────────
alter table public.learning_sessions
  add column if not exists lesson_id uuid
    references public.lessons (id) on delete set null,
  add column if not exists time_budget_minutes integer
    check (time_budget_minutes is null or time_budget_minutes between 1 and 600),
  add column if not exists current_action text,
  add column if not exists plan_cursor integer not null default 0
    check (plan_cursor >= 0),
  add column if not exists mastery_snapshot jsonb not null default '{}'::jsonb;

-- ── indexes ────────────────────────────────────────────────────────────────
create index lessons_user_created_idx
  on public.lessons (user_id, created_at desc);
create index lesson_concepts_lesson_idx
  on public.lesson_concepts (lesson_id, position);
create index teaching_questions_session_idx
  on public.teaching_questions (session_id, created_at);
create index teaching_answers_session_idx
  on public.teaching_answers (session_id, created_at);
create index teaching_answers_question_idx
  on public.teaching_answers (question_id);
create index learning_sessions_lesson_idx
  on public.learning_sessions (lesson_id) where lesson_id is not null;

-- ── Row Level Security ─────────────────────────────────────────────────────
alter table public.lessons enable row level security;
create policy lessons_owner on public.lessons
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter table public.lesson_concepts enable row level security;
create policy lesson_concepts_owner on public.lesson_concepts
  for all to authenticated
  using (
    exists (
      select 1 from public.lessons l
      where l.id = lesson_id and l.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.lessons l
      where l.id = lesson_id and l.user_id = (select auth.uid())
    )
  );

alter table public.teaching_questions enable row level security;
create policy teaching_questions_owner on public.teaching_questions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter table public.teaching_answers enable row level security;
create policy teaching_answers_owner on public.teaching_answers
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

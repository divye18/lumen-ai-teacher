-- Lumen — Milestone 7.3: adaptive teacher memory
--
-- ADDITIVE ONLY. Nothing existing is rewritten or dropped.
--
-- A single cross-session artefact: the derived "learning profile". It is
-- computed DETERMINISTICALLY from evidence that is already persisted
-- (teaching_answers, teaching_questions, interactions, concept_mastery,
-- misconceptions) — this table is a durable, explainable snapshot of that
-- derivation so the Teaching Room and dashboard can read it without a full
-- replay, and so personalization survives lesson -> session -> new session.
--
-- It never duplicates learner state: mastery, misconceptions and onboarding
-- preferences keep their own tables. `signals` / `evidence` hold only the
-- derived behavioural read.
--
-- RLS: user-owns-row, identical shape to learner_profiles.

create table public.learner_learning_profiles (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null unique
                 references public.profiles (id) on delete cascade,
  -- Derived behavioural signals: [{ kind, detail, summary, evidence }]. Each
  -- carries its own evidence model (count, confidence, lastObservedAt,
  -- supportingInteractions). Learner-facing text is concise; no chain-of-thought.
  signals      jsonb not null default '[]'::jsonb,
  -- Roll-up evidence: { strongestConceptFamily, weakestConceptFamily, ... }.
  evidence     jsonb not null default '{}'::jsonb,
  -- Total answers that could be attributed to a signal — the fallback gate.
  sample_size  integer not null default 0 check (sample_size >= 0),
  computed_at  timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.learner_learning_profiles is
  'Deterministically derived, cross-session behavioural learning profile. A '
  'durable snapshot of a pure derivation over already-persisted evidence — not '
  'a second copy of learner state.';

create trigger learner_learning_profiles_set_updated_at
  before update on public.learner_learning_profiles
  for each row execute function public.set_updated_at();

alter table public.learner_learning_profiles enable row level security;
create policy learner_learning_profiles_owner on public.learner_learning_profiles
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

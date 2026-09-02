-- Migration 5/8: concept_mastery + misconceptions (persistent learner state)

-- ── concept_mastery ─────────────────────────────────────────────────────────
-- The current, single source of "where is this learner on this concept".
-- It is a ROLL-UP, not the only record — interactions + misconceptions hold
-- the underlying evidence.
create table public.concept_mastery (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles (id) on delete cascade,
  concept_id        uuid not null references public.concepts (id) on delete cascade,

  mastery_score     numeric(4, 3) not null default 0
                      check (mastery_score between 0 and 1),
  confidence_score  numeric(4, 3) not null default 0
                      check (confidence_score between 0 and 1),

  attempt_count     integer not null default 0 check (attempt_count >= 0),
  correct_count     integer not null default 0 check (correct_count >= 0),
  incorrect_count   integer not null default 0 check (incorrect_count >= 0),
  misconception_count integer not null default 0 check (misconception_count >= 0),

  last_attempt_at   timestamptz,
  last_correct_at   timestamptz,

  preferred_strategy text
                      check (preferred_strategy is null or preferred_strategy in (
                        'formal', 'conversational', 'example-first',
                        'analogy-first', 'visual-first', 'socratic')),

  status            text not null default 'NOT_STARTED'
                      check (status in (
                        'NOT_STARTED', 'LEARNING', 'DEVELOPING',
                        'MASTERED', 'NEEDS_RETEACHING')),

  evidence_summary  text,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint concept_mastery_unique_learner_concept unique (user_id, concept_id)
);

comment on table public.concept_mastery is
  'One current mastery row per (user, concept). Roll-up of interaction '
  'evidence; never the sole record of learning.';

create trigger concept_mastery_set_updated_at
  before update on public.concept_mastery
  for each row execute function public.set_updated_at();

-- ── misconceptions ──────────────────────────────────────────────────────────
-- Persistent misconception records with preserved evidence.
create table public.misconceptions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles (id) on delete cascade,
  concept_id        uuid not null references public.concepts (id) on delete cascade,
  session_id        uuid references public.learning_sessions (id) on delete set null,
  interaction_id    uuid references public.interactions (id) on delete set null,

  category          text not null,
  description       text not null,
  severity          text not null default 'MEDIUM'
                      check (severity in ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  confidence        numeric(4, 3) not null default 0.5
                      check (confidence between 0 and 1),
  status            text not null default 'ACTIVE'
                      check (status in ('ACTIVE', 'IMPROVING', 'RESOLVED')),

  first_detected_at timestamptz not null default now(),
  last_detected_at  timestamptz not null default now(),
  resolved_at       timestamptz,

  evidence          jsonb not null default '[]'::jsonb,
  metadata          jsonb not null default '{}'::jsonb
);

comment on table public.misconceptions is
  'Detected misconceptions. session_id/interaction_id are SET NULL on delete '
  'so the misconception record survives evidence pruning.';

create index misconceptions_active_idx
  on public.misconceptions (user_id, concept_id)
  where status <> 'RESOLVED';

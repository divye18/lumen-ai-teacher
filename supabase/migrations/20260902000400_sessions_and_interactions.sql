-- Migration 4/8: learning sessions + interactions (the evidence log)

-- ── learning_sessions ───────────────────────────────────────────────────────
create table public.learning_sessions (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.profiles (id) on delete cascade,
  title              text,
  topic              text,
  language           text not null default 'en'
                       check (language in ('en', 'hi', 'hinglish')),
  goal               text,
  status             text not null default 'PLANNED'
                       check (status in (
                         'PLANNED', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ABANDONED')),
  current_concept_id uuid references public.concepts (id) on delete set null,
  started_at         timestamptz,
  ended_at           timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on table public.learning_sessions is
  'One learning sitting. Sessions are not deleted in normal operation — use '
  'status ABANDONED. Deleting a session cascades to its interactions.';

create trigger learning_sessions_set_updated_at
  before update on public.learning_sessions
  for each row execute function public.set_updated_at();

-- ── interactions ────────────────────────────────────────────────────────────
-- Persistent evidence of every meaningful teacher/student/system event.
-- Core queryable columns stay relational; structured extras go in metadata
-- (visual directive, source references, teaching action, latency, provider…).
create table public.interactions (
  id               uuid primary key default gen_random_uuid(),
  session_id       uuid not null references public.learning_sessions (id) on delete cascade,
  user_id          uuid not null references public.profiles (id) on delete cascade,
  concept_id       uuid references public.concepts (id) on delete set null,
  role             text not null
                     check (role in ('STUDENT', 'TEACHER', 'SYSTEM')),
  interaction_type text not null
                     check (interaction_type in (
                       'EXPLANATION', 'QUESTION', 'ANSWER', 'HINT', 'FEEDBACK',
                       'RETEACH', 'RECAP', 'VISUAL', 'ASSESSMENT', 'OTHER')),
  content          text not null default '',
  metadata         jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now()
);

comment on table public.interactions is
  'Append-only evidence log. Lets the Teaching Engine reconstruct what '
  'happened, what was tried, and what followed.';

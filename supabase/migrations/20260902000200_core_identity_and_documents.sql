-- Migration 2/8: identity, learning preferences, documents, document chunks

-- ── profiles ────────────────────────────────────────────────────────────────
-- Minimal student identity. Row id mirrors auth.users.id.
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 120),
  email        text check (email is null or char_length(email) <= 320),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.profiles is 'Basic student identity; id === auth.users.id.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ── learner_profiles ────────────────────────────────────────────────────────
-- Learning preferences and goals. One per user (extend later if needed).
create table public.learner_profiles (
  id                        uuid primary key default gen_random_uuid(),
  user_id                   uuid not null unique
                              references public.profiles (id) on delete cascade,
  current_level             smallint not null default 1
                              check (current_level between 1 and 5),
  learning_goal             text check (learning_goal is null
                              or char_length(learning_goal) <= 2000),
  available_time_minutes    integer check (available_time_minutes is null
                              or available_time_minutes between 0 and 100000),
  preferred_language        text not null default 'en'
                              check (preferred_language in ('en', 'hi', 'hinglish')),
  preferred_learning_strategy text
                              check (preferred_learning_strategy is null
                                or preferred_learning_strategy in (
                                  'formal', 'conversational', 'example-first',
                                  'analogy-first', 'visual-first', 'socratic')),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

comment on table public.learner_profiles is
  'Per-learner preferences and goals. MVP languages: en, hi, hinglish.';

create trigger learner_profiles_set_updated_at
  before update on public.learner_profiles
  for each row execute function public.set_updated_at();

-- ── documents ───────────────────────────────────────────────────────────────
-- Uploaded educational materials. Processing is NOT implemented in this phase.
create table public.documents (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  title         text not null check (char_length(title) between 1 and 300),
  file_name     text not null,
  file_type     text not null,
  file_size     bigint check (file_size is null or file_size >= 0),
  storage_path  text,
  status        text not null default 'UPLOADED'
                  check (status in ('UPLOADED', 'PROCESSING', 'READY', 'FAILED')),
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.documents is
  'Uploaded learning materials. Ingestion/processing is a later phase.';

create trigger documents_set_updated_at
  before update on public.documents
  for each row execute function public.set_updated_at();

-- ── document_chunks ─────────────────────────────────────────────────────────
-- Processed chunks for future RAG. Embedding generation is NOT done here.
--
-- EMBEDDING DIMENSION: the embedding provider/model is not finalised yet, so
-- the column is declared as an unbounded `vector` (no dimension, no index).
-- Before the RAG phase, a follow-up migration will `alter column embedding
-- type vector(<N>)` for the chosen model and add an HNSW/IVFFlat index. This
-- keeps the choice reversible until it is actually needed.
create table public.document_chunks (
  id            uuid primary key default gen_random_uuid(),
  document_id   uuid not null references public.documents (id) on delete cascade,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  content       text not null,
  chunk_index   integer not null check (chunk_index >= 0),
  page_number   integer check (page_number is null or page_number >= 0),
  section_title text,
  metadata      jsonb not null default '{}'::jsonb,
  embedding     vector,
  created_at    timestamptz not null default now(),
  unique (document_id, chunk_index)
);

comment on table public.document_chunks is
  'Future-RAG chunk store. `embedding` dimension is intentionally unbounded '
  'until the embedding model is chosen (see migration comment).';

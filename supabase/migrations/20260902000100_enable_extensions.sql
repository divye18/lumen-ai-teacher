-- Lumen — Step 6: persistent learner state
-- Migration 1/8: extensions + shared utilities
--
-- pgvector is enabled now because the SAME database will back RAG in a later
-- phase. No vector search or index is created here — see document_chunks.

create extension if not exists "pgcrypto";  -- gen_random_uuid()
create extension if not exists "vector";    -- pgvector (RAG, later phase)

-- Shared trigger: keep updated_at honest on every UPDATE.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'BEFORE UPDATE trigger helper: sets updated_at = now().';

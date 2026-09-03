-- Lumen — RAG Phase 1
-- Migration: semantic retrieval RPC over a user's own document chunks.
--
-- Authorization model:
--   * SECURITY INVOKER — the function runs as the calling role, so the
--     `document_chunks_owner` RLS policy (user_id = auth.uid()) applies.
--   * An explicit `user_id = auth.uid()` predicate is kept as defence in depth.
--   * Called with the service-role key, auth.uid() is NULL → zero rows. Safe.
--   * EXECUTE is granted only to `authenticated`.
--
-- This makes cross-user retrieval impossible regardless of the caller.
--
-- `set search_path = ''` hardens the function, so EVERYTHING must be
-- schema-qualified. `20260902000100_enable_extensions.sql` runs
-- `create extension if not exists "vector"` with no SCHEMA clause, which
-- installs pgvector (the `vector` type and the `<=>` cosine-distance operator)
-- into `public`. With an empty search_path the bare `<=>` operator is not
-- visible, so it is referenced as `OPERATOR(public.<=>)`.

create or replace function public.match_document_chunks(
  query_embedding public.vector(1536),
  match_count int default 8,
  similarity_threshold float default 0.0,
  filter_document_id uuid default null
)
returns table (
  id uuid,
  document_id uuid,
  chunk_index int,
  content text,
  page_number int,
  section_title text,
  metadata jsonb,
  similarity float
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    dc.id,
    dc.document_id,
    dc.chunk_index,
    dc.content,
    dc.page_number,
    dc.section_title,
    dc.metadata,
    1 - (dc.embedding OPERATOR(public.<=>) query_embedding) as similarity
  from public.document_chunks dc
  where dc.embedding is not null
    and dc.user_id = (select auth.uid())
    and (filter_document_id is null or dc.document_id = filter_document_id)
    and (1 - (dc.embedding OPERATOR(public.<=>) query_embedding))
        >= similarity_threshold
  order by dc.embedding OPERATOR(public.<=>) query_embedding
  limit least(greatest(match_count, 1), 50);
$$;

revoke all on function
  public.match_document_chunks(public.vector, int, float, uuid) from public;
grant execute on function
  public.match_document_chunks(public.vector, int, float, uuid) to authenticated;

comment on function
  public.match_document_chunks(public.vector, int, float, uuid) is
  'RLS-scoped cosine similarity search over the caller''s document_chunks.';

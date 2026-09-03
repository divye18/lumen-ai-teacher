-- Lumen — RAG Phase 1
-- Migration: fix the document_chunks.embedding vector dimension.
--
-- The embedding model has now been selected:
--   provider  : OpenAI-compatible /embeddings  (EMBEDDING_PROVIDER=openai)
--   model     : text-embedding-3-small         (EMBEDDING_MODEL)
--   dimension : 1536                            (EMBEDDING_DIMENSIONS)
--
-- Migration 20260902000200 created this column as an unbounded `vector` on
-- purpose. No embeddings were ever written (the RAG layer did not exist), so
-- clearing any stray value first makes the ALTER unconditionally safe and
-- reproducible.

update public.document_chunks
set embedding = null
where embedding is not null;

alter table public.document_chunks
  alter column embedding type vector(1536);

comment on column public.document_chunks.embedding is
  'OpenAI text-embedding-3-small, 1536 dimensions (see EMBEDDING_* env vars). '
  'Changing the model/dimension requires a NEW migration that alters this type '
  'and rebuilds the vector index.';

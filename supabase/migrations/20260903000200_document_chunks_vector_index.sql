-- Lumen — RAG Phase 1
-- Migration: approximate nearest-neighbour index for similarity search.
--
-- HNSW with cosine distance:
--   * no training/list-size tuning (unlike IVFFlat) — reliable at any size
--   * strong recall out of the box for hackathon-scale corpora
--   * built instantly here because the table is empty
--
-- The retrieval RPC ranks by `embedding <=> query` (cosine distance), so the
-- index opclass must be `vector_cosine_ops`.

create index if not exists document_chunks_embedding_hnsw
  on public.document_chunks
  using hnsw (embedding vector_cosine_ops);

-- Lumen — Phase 4: learner-aware knowledge graph
--
-- ADDITIVE ONLY. Nothing existing is rewritten or dropped.
--
-- The graph reuses the Phase-1 `concepts` + `concept_relationships` tables
-- (already user-owned, RLS-protected, de-duplicated per edge). This migration:
--   1. adds knowledge-graph columns to `concepts`
--        - normalized_key : stable identity for de-duplicating the same concept
--                           across lessons / documents
--        - importance_score: deterministic 0..1 centrality/emphasis score
--        - source_pages    : document pages the concept was grounded in
--        - graph_degree    : cached relationship count (for node sizing)
--   2. widens the `concept_relationships` type CHECK to add CONTRASTS_WITH
--   3. adds the indexes the graph read-path needs
--
-- RLS is unchanged: `concepts` is scoped by user_id, and
-- `concept_relationships` is scoped through BOTH endpoint concepts (existing
-- policy). No policy is modified.

-- ── concepts: knowledge-graph columns ─────────────────────────────────────
alter table public.concepts
  add column if not exists normalized_key text
    check (normalized_key is null
      or normalized_key ~ '^[a-z0-9][a-z0-9-]{0,120}$'),
  add column if not exists importance_score numeric(6, 5) not null default 0
    check (importance_score between 0 and 1),
  add column if not exists source_pages jsonb not null default '[]'::jsonb,
  add column if not exists graph_degree integer not null default 0
    check (graph_degree >= 0);

comment on column public.concepts.normalized_key is
  'Deterministic slug of the concept title. De-duplicates the same concept '
  'across lessons/documents for one user.';
comment on column public.concepts.importance_score is
  'Deterministic 0..1 score from graph centrality + source emphasis + lesson '
  'placement. Drives ordering, remediation priority and node size.';

-- "my concepts by identity" — powers graph de-duplication and lookup.
create index if not exists concepts_user_normkey_idx
  on public.concepts (user_id, normalized_key)
  where normalized_key is not null;

-- "my concepts, most important first" — dashboard + planner.
create index if not exists concepts_user_importance_idx
  on public.concepts (user_id, importance_score desc);

-- ── concept_relationships: add CONTRASTS_WITH ─────────────────────────────
alter table public.concept_relationships
  drop constraint if exists concept_relationships_relationship_type_check;

alter table public.concept_relationships
  add constraint concept_relationships_relationship_type_check
  check (relationship_type in (
    'PREREQUISITE', 'RELATED', 'PART_OF', 'DEPENDS_ON', 'CONTRASTS_WITH'));

comment on column public.concept_relationships.strength is
  'Edge confidence 0..1. LLM-proposed edges are clamped; structurally-derived '
  'edges (lesson prerequisites) are 1.0.';

-- Traversal from a set of source concepts (graph read) already covered by
-- concept_relationships_source_idx / _target_idx from migration 7.

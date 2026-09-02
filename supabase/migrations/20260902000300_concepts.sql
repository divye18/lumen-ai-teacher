-- Migration 3/8: concepts + concept relationships

-- ── concepts ────────────────────────────────────────────────────────────────
-- Concepts may originate from a document but can outlive it, so document_id is
-- nullable and set null on document delete.
create table public.concepts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  document_id uuid references public.documents (id) on delete set null,
  name        text not null check (char_length(name) between 1 and 200),
  description text,
  subject     text,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.concepts is
  'A unit of knowledge. Owned per-user for the MVP; may be shared later.';

create trigger concepts_set_updated_at
  before update on public.concepts
  for each row execute function public.set_updated_at();

-- ── concept_relationships ───────────────────────────────────────────────────
-- Directed edge: source --type--> target. Both endpoints deleted with a
-- concept (the edge is meaningless without them).
create table public.concept_relationships (
  id                 uuid primary key default gen_random_uuid(),
  source_concept_id  uuid not null references public.concepts (id) on delete cascade,
  target_concept_id  uuid not null references public.concepts (id) on delete cascade,
  relationship_type  text not null
                       check (relationship_type in (
                         'PREREQUISITE', 'RELATED', 'PART_OF', 'DEPENDS_ON')),
  strength           numeric(4, 3) not null default 1.0
                       check (strength between 0 and 1),
  metadata           jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  constraint concept_relationships_no_self_loop
    check (source_concept_id <> target_concept_id),
  constraint concept_relationships_unique_edge
    unique (source_concept_id, target_concept_id, relationship_type)
);

comment on table public.concept_relationships is
  'Directed dependency edges between concepts. Deduplicated per edge+type.';

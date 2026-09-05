-- Lumen — Milestone 17.2: curriculum foundation
--
-- ADDITIVE ONLY. Nothing existing is rewritten, dropped, or altered. This
-- migration creates exactly two tables (`curriculum_sources`,
-- `curriculum_nodes`) and nothing else — no seed data, no NCERT content, no
-- exam-question tables, no learning-asset tables (separate later milestones).
--
-- PURPOSE
-- A generic, recursive hierarchy (curriculum -> class -> subject -> chapter
-- -> topic -> subtopic -> ... arbitrary depth via self-reference) that
-- represents CANONICAL, GLOBAL curriculum structure only — e.g. the NCERT
-- Class 10-12 tree. It deliberately does NOT link to `concepts` in this
-- migration. `concepts` (and everything downstream of it — mastery,
-- misconceptions, concept_relationships, the knowledge graph) stays
-- strictly per-user, unchanged, and is not modified or duplicated here. A
-- global curriculum node (e.g. one NCERT topic) cannot safely point at one
-- universal concept row, because every learner has their own copy. The
-- future, learner-aware flow is:
--   global curriculum node -> learner selects a topic -> Lumen resolves or
--   creates THAT USER's canonical concept (reusing the existing
--   normalized-key reuse-or-create convention lesson planning already uses)
--   -> existing concept_relationships / mastery / misconceptions / Teacher
--   Brain, completely unchanged.
-- That resolution layer does not exist yet and is out of scope for this
-- migration; nothing here blocks building it later.
--
-- WHY A NEW OWNERSHIP MODEL
-- Every existing table is strictly per-user (RLS: `user_id = auth.uid()`).
-- Curriculum content is different: NCERT must be readable by every learner,
-- while a future user-uploaded curriculum must stay private to its owner.
-- `owner_user_id` is nullable specifically to express this:
--   owner_user_id IS NULL   -> shared/global curriculum (e.g. NCERT)
--   owner_user_id = <user>  -> private curriculum, owned by that user
-- This is why these two tables get FOUR narrow RLS policies each (select /
-- insert / update / delete) instead of the single `for all` policy every
-- other table in this schema uses — read and write access genuinely differ
-- here for the first time. Nothing about any EXISTING table's policy shape
-- changes. Global (owner_user_id IS NULL) rows are never writable by any
-- authenticated user in this migration — only a trusted server-side path
-- (the service-role client, which bypasses RLS entirely, same as every
-- other admin/seed operation in this codebase) can seed them. That importer
-- does not exist yet; this migration only makes it possible to build one
-- safely later.

-- ── curriculum_sources ──────────────────────────────────────────────────────
create table public.curriculum_sources (
  id            uuid primary key default gen_random_uuid(),
  -- NULL = shared/global curriculum (e.g. NCERT). Non-null = private,
  -- owned by that user (a future personal/uploaded curriculum).
  owner_user_id uuid references public.profiles (id) on delete cascade,
  kind          text not null
                  check (kind in (
                    'NCERT', 'USER_UPLOAD', 'CBSE', 'ICSE', 'UNIVERSITY',
                    'OTHER')),
  title         text not null check (char_length(title) between 1 and 300),
  status        text not null default 'DRAFT'
                  check (status in ('DRAFT', 'READY', 'ARCHIVED')),
  -- Free-text dataset version (e.g. "2024-25"). Lets a later NCERT revision
  -- be imported without corrupting historical references to this version's
  -- nodes — see the natural-key/versioning strategy on `curriculum_nodes`.
  version       text,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.curriculum_sources is
  'A curriculum dataset (e.g. one NCERT release, or one user-uploaded '
  'curriculum). owner_user_id NULL = shared/global; non-null = private to '
  'that user. Kind is intentionally an open, extensible list, not tied to '
  'NCERT specifically.';

create trigger curriculum_sources_set_updated_at
  before update on public.curriculum_sources
  for each row execute function public.set_updated_at();

-- ── curriculum_nodes ────────────────────────────────────────────────────────
create table public.curriculum_nodes (
  id                  uuid primary key default gen_random_uuid(),
  curriculum_source_id uuid not null
                         references public.curriculum_sources (id)
                         on delete cascade,
  -- Self-reference for an arbitrarily deep tree (class -> subject -> chapter
  -- -> topic -> subtopic -> ...). NULL = root of the source's tree. A parent
  -- and its whole subtree are deleted together (the subtree is meaningless
  -- without it) — same philosophy as concept_relationships' cascade.
  parent_id           uuid references public.curriculum_nodes (id)
                         on delete cascade,
  -- A descriptive label only — never a depth ceiling. Actual nesting depth
  -- is unbounded via parent_id; OTHER exists so a future, deeper convention
  -- never needs a migration just to add a node-type name.
  node_type           text not null
                         check (node_type in (
                           'CLASS', 'SUBJECT', 'CHAPTER', 'TOPIC', 'SUBTOPIC',
                           'SECTION', 'DOCUMENT', 'OTHER')),
  title               text not null check (char_length(title) between 1 and 300),
  -- Deterministic normalized form (lowercase, whitespace/punctuation
  -- collapsed) for comparison/dedup only. The display `title` is never
  -- altered.
  normalized_title     text not null check (char_length(normalized_title) between 1 and 300),
  position            integer not null default 0 check (position >= 0),
  -- Never invented: only ever set from a real source (printed textbook page,
  -- or a source chunk's page when derived from an ingested PDF).
  page_start          integer check (page_start is null or page_start >= 0),
  page_end            integer check (page_end is null or page_end >= 0),
  metadata            jsonb not null default '{}'::jsonb,
  status              text not null default 'ACTIVE'
                         check (status in ('ACTIVE', 'ARCHIVED')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint curriculum_nodes_no_self_parent check (id <> parent_id),
  -- Natural-key idempotency for deterministic re-seeding (e.g. a later NCERT
  -- revision re-running the same import): the same (source, parent, type,
  -- normalized title) can only exist once. `NULLS NOT DISTINCT` (not the
  -- default Postgres unique behaviour) is deliberate — without it, two
  -- actual root nodes (parent_id IS NULL) sharing a type+title would NOT be
  -- caught as duplicates, because plain UNIQUE treats every NULL as
  -- distinct from every other NULL. A sentinel "root" UUID was considered
  -- and rejected as unnecessary complexity now that Postgres supports this
  -- directly.
  constraint curriculum_nodes_unique_identity
    unique nulls not distinct (
      curriculum_source_id, parent_id, node_type, normalized_title
    )
);

comment on table public.curriculum_nodes is
  'Generic recursive curriculum tree (class/subject/chapter/topic/... to '
  'arbitrary depth via parent_id). Deliberately has NO link to `concepts`: '
  'concepts are per-user, so a globally-shared node (e.g. an NCERT topic) '
  'cannot safely point at one universal concept row. A later, learner-aware '
  'layer resolves/reuses the right per-user concept when a learner actually '
  'selects a topic — see the migration header.';

create trigger curriculum_nodes_set_updated_at
  before update on public.curriculum_nodes
  for each row execute function public.set_updated_at();

-- ── indexes ─────────────────────────────────────────────────────────────────

-- "sources available to a user": their own private sources, by owner.
-- (Global sources have owner_user_id IS NULL and are expected to be a small,
-- cacheable set — a handful of curricula, not worth a partial index yet.)
create index curriculum_sources_owner_idx
  on public.curriculum_sources (owner_user_id)
  where owner_user_id is not null;

-- "all nodes for a source" and "children of a parent, in order" — the two
-- access patterns the topic-selection UI and any tree walk will actually use.
create index curriculum_nodes_source_parent_position_idx
  on public.curriculum_nodes (curriculum_source_id, parent_id, position);

-- ── row level security ──────────────────────────────────────────────────────
-- See the migration header for why these are four narrow policies per table
-- instead of the single `for all` policy every other table in this schema
-- uses: read and write access genuinely differ for shared/global rows here.

alter table public.curriculum_sources enable row level security;

create policy curriculum_sources_select on public.curriculum_sources
  for select to authenticated
  using (owner_user_id is null or owner_user_id = (select auth.uid()));

create policy curriculum_sources_insert on public.curriculum_sources
  for insert to authenticated
  with check (owner_user_id = (select auth.uid()));

create policy curriculum_sources_update on public.curriculum_sources
  for update to authenticated
  using (owner_user_id = (select auth.uid()))
  with check (owner_user_id = (select auth.uid()));

create policy curriculum_sources_delete on public.curriculum_sources
  for delete to authenticated
  using (owner_user_id = (select auth.uid()));

alter table public.curriculum_nodes enable row level security;

-- curriculum_nodes has no owner_user_id of its own — scoped through the
-- parent curriculum_sources row, same pattern as concept_relationships
-- (scoped through concepts) and assessment_questions (scoped through
-- assessments).

create policy curriculum_nodes_select on public.curriculum_nodes
  for select to authenticated
  using (
    exists (
      select 1 from public.curriculum_sources s
      where s.id = curriculum_source_id
        and (s.owner_user_id is null or s.owner_user_id = (select auth.uid()))
    )
  );

create policy curriculum_nodes_insert on public.curriculum_nodes
  for insert to authenticated
  with check (
    exists (
      select 1 from public.curriculum_sources s
      where s.id = curriculum_source_id
        and s.owner_user_id = (select auth.uid())
    )
  );

create policy curriculum_nodes_update on public.curriculum_nodes
  for update to authenticated
  using (
    exists (
      select 1 from public.curriculum_sources s
      where s.id = curriculum_source_id
        and s.owner_user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.curriculum_sources s
      where s.id = curriculum_source_id
        and s.owner_user_id = (select auth.uid())
    )
  );

create policy curriculum_nodes_delete on public.curriculum_nodes
  for delete to authenticated
  using (
    exists (
      select 1 from public.curriculum_sources s
      where s.id = curriculum_source_id
        and s.owner_user_id = (select auth.uid())
    )
  );

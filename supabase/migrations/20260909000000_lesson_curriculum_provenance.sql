-- Lumen — Milestone 18.3a: lesson curriculum provenance (schema only)
--
-- ADDITIVE ONLY. Adds exactly one nullable column to the existing `lessons`
-- table — nothing else is created, dropped, or altered. No existing lesson
-- row is touched: `curriculum_node_id` defaults to NULL for every row,
-- existing and future, until a later milestone (18.3b) teaches the lesson
-- API to populate it.
--
-- PURPOSE
-- `lessons` is already the correct, and only, place for this edge: it is
-- the first per-user row created when a student starts learning, it already
-- carries an optional `document_id` provenance FK with the exact same
-- shape, and — unlike `concepts` — a user-owned `lessons` row pointing at a
-- GLOBAL `curriculum_nodes` row is architecturally safe: many learners'
-- lessons may reference the same global topic, with zero ownership
-- conflict. `concepts` (and everything downstream of it — mastery,
-- misconceptions) remains untouched and must never gain a `curriculum_node_id`
-- of its own, per the standing 17.2 constraint (a global node cannot safely
-- point at one universal per-user concept row, nor vice versa).
--
-- WHY NO NEW RLS POLICY
-- The existing `lessons_owner` policy already governs the entire `lessons`
-- row (`user_id = auth.uid()`), including this new column — reading or
-- writing a lesson is already scoped correctly with no changes needed here.
-- The referenced `curriculum_nodes` row is independently protected by its
-- own, already-correct RLS from 17.2 (global read, no authenticated write).

alter table public.lessons
  add column if not exists curriculum_node_id uuid
    references public.curriculum_nodes (id) on delete set null;

comment on column public.lessons.curriculum_node_id is
  'Optional provenance: the NCERT (or future global) curriculum TOPIC node '
  'this lesson was started from, if any. NULL for every existing lesson and '
  'for any lesson planned from free text (e.g. Studio). Never populated by '
  'this migration — see Milestone 18.3b.';

-- Partial index: only rows that actually carry provenance are indexed,
-- supporting the future "this user's lessons for this curriculum node"
-- query shape without indexing the (majority, NULL) free-text lessons.
create index lessons_curriculum_node_idx
  on public.lessons (curriculum_node_id)
  where curriculum_node_id is not null;

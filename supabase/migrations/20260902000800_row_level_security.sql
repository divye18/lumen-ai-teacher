-- Migration 8/8: Row Level Security
--
-- Every table below is user-owned. RLS is enabled and a single permissive
-- policy per table restricts all access to the owning user. The service-role
-- key (server-only) bypasses RLS by design and is never shipped to the client.
--
-- `(select auth.uid())` is the Supabase-recommended form (evaluated once).

-- ── profiles ────────────────────────────────────────────────────────────────
alter table public.profiles enable row level security;

create policy profiles_self_access on public.profiles
  for all to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ── helper macro (written out per table) ────────────────────────────────────
-- pattern: user_id = (select auth.uid())

alter table public.learner_profiles enable row level security;
create policy learner_profiles_owner on public.learner_profiles
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter table public.documents enable row level security;
create policy documents_owner on public.documents
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter table public.document_chunks enable row level security;
create policy document_chunks_owner on public.document_chunks
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter table public.concepts enable row level security;
create policy concepts_owner on public.concepts
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- concept_relationships has no user_id (concepts may be shared later). For the
-- MVP, ownership is enforced through both endpoint concepts.
alter table public.concept_relationships enable row level security;
create policy concept_relationships_owner on public.concept_relationships
  for all to authenticated
  using (
    exists (
      select 1 from public.concepts c
      where c.id = source_concept_id and c.user_id = (select auth.uid())
    )
    and exists (
      select 1 from public.concepts c
      where c.id = target_concept_id and c.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.concepts c
      where c.id = source_concept_id and c.user_id = (select auth.uid())
    )
    and exists (
      select 1 from public.concepts c
      where c.id = target_concept_id and c.user_id = (select auth.uid())
    )
  );

alter table public.learning_sessions enable row level security;
create policy learning_sessions_owner on public.learning_sessions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter table public.interactions enable row level security;
create policy interactions_owner on public.interactions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter table public.concept_mastery enable row level security;
create policy concept_mastery_owner on public.concept_mastery
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter table public.misconceptions enable row level security;
create policy misconceptions_owner on public.misconceptions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter table public.assessments enable row level security;
create policy assessments_owner on public.assessments
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- assessment_questions has no user_id — scope through the parent assessment.
alter table public.assessment_questions enable row level security;
create policy assessment_questions_owner on public.assessment_questions
  for all to authenticated
  using (
    exists (
      select 1 from public.assessments a
      where a.id = assessment_id and a.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.assessments a
      where a.id = assessment_id and a.user_id = (select auth.uid())
    )
  );

alter table public.assessment_answers enable row level security;
create policy assessment_answers_owner on public.assessment_answers
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Migration 7/8: indexes for expected access patterns
--
-- Deliberately conservative. Primary keys and UNIQUE constraints already cover
-- id lookups and (user_id, concept_id) mastery; these add the foreign-key and
-- time-ordering paths the app will actually query.

-- documents: "my documents, newest first"
create index documents_user_created_idx
  on public.documents (user_id, created_at desc);

-- document_chunks: fetch a document's chunks in order; user scoping
create index document_chunks_document_idx
  on public.document_chunks (document_id, chunk_index);
create index document_chunks_user_idx
  on public.document_chunks (user_id);

-- concepts: "my concepts", and "concepts from this document"
create index concepts_user_idx on public.concepts (user_id);
create index concepts_document_idx
  on public.concepts (document_id) where document_id is not null;

-- concept_relationships: graph traversal from either endpoint
create index concept_relationships_source_idx
  on public.concept_relationships (source_concept_id);
create index concept_relationships_target_idx
  on public.concept_relationships (target_concept_id);

-- learning_sessions: "my sessions, newest first"
create index learning_sessions_user_created_idx
  on public.learning_sessions (user_id, created_at desc);

-- interactions: session timeline (very hot), and per-concept evidence
create index interactions_session_created_idx
  on public.interactions (session_id, created_at);
create index interactions_user_created_idx
  on public.interactions (user_id, created_at desc);
create index interactions_concept_idx
  on public.interactions (concept_id) where concept_id is not null;

-- concept_mastery: "assemble this learner's state"
create index concept_mastery_user_idx on public.concept_mastery (user_id);

-- misconceptions: per-learner, per-concept, per-session lookups
create index misconceptions_user_idx on public.misconceptions (user_id);
create index misconceptions_concept_idx on public.misconceptions (concept_id);
create index misconceptions_session_idx
  on public.misconceptions (session_id) where session_id is not null;

-- assessments and children
create index assessments_user_created_idx
  on public.assessments (user_id, created_at desc);
create index assessments_session_idx
  on public.assessments (session_id) where session_id is not null;
create index assessment_questions_assessment_idx
  on public.assessment_questions (assessment_id, position);
create index assessment_answers_question_idx
  on public.assessment_answers (question_id);
create index assessment_answers_user_idx
  on public.assessment_answers (user_id);

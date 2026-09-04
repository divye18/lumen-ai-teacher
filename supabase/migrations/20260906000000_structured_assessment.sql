-- Lumen — Phase 5: deterministic structured assessment
--
-- ADDITIVE ONLY. No table is dropped or rewritten; no policy is changed.
--
-- Structured questions (MCQ / MULTI_SELECT / TRUE_FALSE / ORDER_STEPS /
-- CLASSIFY / MATCH_RELATIONSHIP) are graded by pure deterministic code on the
-- server. `question_kind` still drives the difficulty ladder; `question_format`
-- is the orthogonal input/grading shape. `answer_key` holds the correct answer
-- + per-distractor misconception mapping and is NEVER included in the
-- client-safe projection (like `expected_reasoning`).

alter table public.teaching_questions
  add column if not exists question_format text not null default 'FREE_FORM'
    check (question_format in (
      'FREE_FORM',
      'MCQ',
      'MULTI_SELECT',
      'TRUE_FALSE',
      'ORDER_STEPS',
      'CLASSIFY',
      'MATCH_RELATIONSHIP')),
  add column if not exists answer_key jsonb not null default '{}'::jsonb;

comment on column public.teaching_questions.question_format is
  'Input/grading shape. FREE_FORM keeps the LLM-evaluated path; the rest are '
  'graded deterministically on the server.';
comment on column public.teaching_questions.answer_key is
  'Server-only grading key (correct answer + distractor->misconception map). '
  'NEVER sent to client components.';

-- "structured questions asked in this session" — trajectory + analytics.
create index if not exists teaching_questions_session_format_idx
  on public.teaching_questions (session_id, question_format);

-- RLS is unchanged: teaching_questions_owner (user_id = auth.uid()) still
-- covers every row and both new columns.

-- Lumen — development seed data
--
-- Topic: Computer Memory. Enough data to exercise mastery, learner-state
-- assembly, misconceptions, sessions, interactions and assessments.
--
-- Runs on `supabase db reset`. DEV ONLY — do not run against production.
-- Everything is namespaced under one fixed dev user.

-- ── dev auth user ───────────────────────────────────────────────────────────
-- id: 00000000-0000-0000-0000-000000000001  /  dev@lumen.test  /  password123
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
)
values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-000000000001',
  'authenticated', 'authenticated', 'dev@lumen.test',
  crypt('password123', gen_salt('bf')),
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}', '{}'
)
on conflict (id) do nothing;

-- ── profile + learner profile ──────────────────────────────────────────────
insert into public.profiles (id, display_name, email)
values ('00000000-0000-0000-0000-000000000001', 'Dev Student', 'dev@lumen.test')
on conflict (id) do nothing;

insert into public.learner_profiles (
  user_id, current_level, learning_goal, available_time_minutes,
  preferred_language, preferred_learning_strategy
)
values (
  '00000000-0000-0000-0000-000000000001', 2,
  'Understand how computer memory works, from CPU to storage', 30,
  'en', 'analogy-first'
)
on conflict (user_id) do nothing;

-- ── concepts (Computer Memory) ─────────────────────────────────────────────
insert into public.concepts (id, user_id, name, description, subject) values
  ('c0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
   'CPU', 'The processor that executes instructions.', 'Computer Memory'),
  ('c0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001',
   'Cache', 'Small, fast memory close to the CPU holding recently used data.', 'Computer Memory'),
  ('c0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001',
   'RAM', 'Main working memory; volatile, byte-addressable.', 'Computer Memory'),
  ('c0000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001',
   'Storage', 'Persistent memory (SSD/HDD); survives power loss.', 'Computer Memory'),
  ('c0000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001',
   'Stack', 'LIFO region of RAM for call frames and locals.', 'Computer Memory'),
  ('c0000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001',
   'Heap', 'Region of RAM for dynamically allocated memory.', 'Computer Memory')
on conflict (id) do nothing;

-- ── concept relationships ──────────────────────────────────────────────────
insert into public.concept_relationships
  (source_concept_id, target_concept_id, relationship_type, strength) values
  ('c0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000003', 'PREREQUISITE', 0.7),
  ('c0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', 'PREREQUISITE', 0.8),
  ('c0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000002', 'PREREQUISITE', 0.9),
  ('c0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000003', 'PART_OF', 1.0),
  ('c0000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000003', 'PART_OF', 1.0),
  ('c0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000003', 'DEPENDS_ON', 0.6),
  ('c0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000006', 'RELATED', 0.5),
  ('c0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'RELATED', 0.5)
on conflict (source_concept_id, target_concept_id, relationship_type) do nothing;

-- ── a learning session ─────────────────────────────────────────────────────
insert into public.learning_sessions (
  id, user_id, title, topic, language, goal, status,
  current_concept_id, started_at
)
values (
  '5e550000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'Intro to Computer Memory', 'Computer Memory', 'en',
  'Understand RAM vs storage and the stack/heap split', 'ACTIVE',
  'c0000000-0000-0000-0000-000000000006', now() - interval '20 minutes'
)
on conflict (id) do nothing;

-- ── interactions (evidence log) ────────────────────────────────────────────
insert into public.interactions (
  id, session_id, user_id, concept_id, role, interaction_type, content, metadata, created_at
) values
  ('11110000-0000-0000-0000-000000000001', '5e550000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000003',
   'TEACHER', 'EXPLANATION', 'RAM is fast, volatile working memory the CPU reads and writes directly.',
   '{"teachingAction":"EXPLAIN"}', now() - interval '18 minutes'),
  ('11110000-0000-0000-0000-000000000002', '5e550000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000003',
   'TEACHER', 'QUESTION', 'What happens to data in RAM when the power is cut?',
   '{"teachingAction":"ASK"}', now() - interval '17 minutes'),
  ('11110000-0000-0000-0000-000000000003', '5e550000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000003',
   'STUDENT', 'ANSWER', 'It is lost, because RAM is volatile.',
   '{"latencyMs":9000}', now() - interval '16 minutes'),
  ('11110000-0000-0000-0000-000000000004', '5e550000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000003',
   'TEACHER', 'FEEDBACK', 'Correct. That is why unsaved work disappears on a crash.',
   '{"correct":true}', now() - interval '16 minutes'),
  ('11110000-0000-0000-0000-000000000005', '5e550000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000006',
   'STUDENT', 'ANSWER', 'The heap frees itself when the function returns.',
   '{"correct":false}', now() - interval '6 minutes'),
  ('11110000-0000-0000-0000-000000000006', '5e550000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000006',
   'TEACHER', 'RETEACH', 'Not quite — the stack unwinds automatically; heap memory stays until it is explicitly freed or garbage-collected.',
   '{"teachingAction":"RETEACH"}', now() - interval '5 minutes')
on conflict (id) do nothing;

-- ── concept mastery (current learner state roll-up) ────────────────────────
insert into public.concept_mastery (
  user_id, concept_id, mastery_score, confidence_score,
  attempt_count, correct_count, incorrect_count, misconception_count,
  last_attempt_at, last_correct_at, preferred_strategy, status, evidence_summary
) values
  ('00000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
   0.90, 0.85, 4, 4, 0, 0, now() - interval '2 days', now() - interval '2 days',
   'conversational', 'MASTERED', 'Consistently correct on CPU role questions.'),
  ('00000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000003',
   0.62, 0.55, 5, 3, 2, 0, now() - interval '16 minutes', now() - interval '16 minutes',
   'analogy-first', 'DEVELOPING', 'Understands volatility; shaky on addressing.'),
  ('00000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002',
   0.30, 0.40, 2, 1, 1, 0, now() - interval '1 day', now() - interval '1 day',
   null, 'LEARNING', 'Early exposure only.'),
  ('00000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000004',
   0.0, 0.0, 0, 0, 0, 0, null, null, null, 'NOT_STARTED', null),
  ('00000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000005',
   0.45, 0.50, 3, 2, 1, 0, now() - interval '1 day', now() - interval '1 day',
   'example-first', 'LEARNING', 'Grasps LIFO; confuses with heap.'),
  ('00000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000006',
   0.25, 0.35, 3, 1, 2, 1, now() - interval '5 minutes', now() - interval '1 day',
   'analogy-first', 'NEEDS_RETEACHING', 'Active misconception about automatic heap deallocation.')
on conflict (user_id, concept_id) do nothing;

-- ── a misconception (with preserved evidence) ─────────────────────────────
insert into public.misconceptions (
  id, user_id, concept_id, session_id, interaction_id,
  category, description, severity, confidence, status,
  first_detected_at, last_detected_at, evidence
)
values (
  'd1530000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000006',
  '5e550000-0000-0000-0000-000000000001',
  '11110000-0000-0000-0000-000000000005',
  'memory-lifecycle',
  'Believes heap allocations are freed automatically when a function returns, like stack frames.',
  'HIGH', 0.80, 'ACTIVE',
  now() - interval '6 minutes', now() - interval '5 minutes',
  '[{"interactionId":"11110000-0000-0000-0000-000000000005","quote":"The heap frees itself when the function returns."}]'
)
on conflict (id) do nothing;

-- ── an assessment ─────────────────────────────────────────────────────────
insert into public.assessments (
  id, user_id, session_id, title, topic, assessment_type, status,
  score, max_score, started_at, completed_at
)
values (
  'a5550000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  '5e550000-0000-0000-0000-000000000001',
  'RAM & Storage check', 'Computer Memory', 'FORMATIVE', 'COMPLETED',
  1, 2, now() - interval '12 minutes', now() - interval '10 minutes'
)
on conflict (id) do nothing;

insert into public.assessment_questions (
  id, assessment_id, concept_id, question_text, question_type,
  difficulty, expected_answer, position
) values
  ('a5550000-0000-0000-0000-0000000000a1', 'a5550000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-000000000003',
   'Is RAM volatile or non-volatile? Explain in one sentence.',
   'EXPLAIN_WHY', 2, 'Volatile — its contents are lost without power.', 0),
  ('a5550000-0000-0000-0000-0000000000a2', 'a5550000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-000000000004',
   'Name one difference between RAM and SSD storage.',
   'SHORT_ANSWER', 2, 'RAM is volatile and faster; SSD is persistent and slower.', 1)
on conflict (id) do nothing;

insert into public.assessment_answers (
  question_id, user_id, answer_text, is_correct, score, evaluation
) values
  ('a5550000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000001',
   'Volatile, it needs power to keep data.', true, 1.0,
   '{"feedback":"Correct and concise.","detectedMisconceptionSlugs":[]}'),
  ('a5550000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000001',
   'They are both memory so basically the same.', false, 0.0,
   '{"feedback":"Missed persistence vs volatility.","detectedMisconceptionSlugs":["memory-lifecycle"]}');

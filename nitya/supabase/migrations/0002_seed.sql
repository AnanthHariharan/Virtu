-- ═══════════════════════════════════════════════════════════════════
--  Seed. Run once, signed in as yourself — auth.uid() fills user_id.
--
--  Everything here is configuration you will edit: the rites are yours
--  and correct; the training split and menu are placeholders; the
--  brahma-yajñam canon is deliberately empty until you supply your
--  śākhā's portions and their order.
-- ═══════════════════════════════════════════════════════════════════

-- ───────────────── rites ─────────────────
insert into entities (kind, slug, name, ord, meta) values
  ('rite', 'pratah-sandhya',   'Prātaḥ sandhyāvandanam',    10,
     '{"slot":"morning","japa":true,"mantra":"gayatri"}'),
  ('rite', 'samidadana-am',    'Samidādāna mantra-pāṭham',  20,
     '{"slot":"morning"}'),
  ('rite', 'brahma-yajnam',    'Brahma-yajñam',             30,
     '{"slot":"morning","portion":true}'),
  ('rite', 'madhyahnika',      'Mādhyāhnika mantra-pāṭham', 40,
     '{"slot":"afternoon"}'),
  ('rite', 'sayam-sandhya',    'Sāyaṃ sandhyāvandanam',     50,
     '{"slot":"evening","japa":true,"mantra":"gayatri"}'),
  ('rite', 'samidadana-pm',    'Samidādānam',               60,
     '{"slot":"evening"}')
on conflict do nothing;

-- ───────────────── commonplace heads ─────────────────
insert into entities (kind, slug, name, ord) values
  ('locus', 'vedanta', 'Vedānta', 10),
  ('locus', 'method',  'Method',  20),
  ('locus', 'craft',   'Craft',   30),
  ('locus', 'nature',  'Nature',  40),
  ('locus', 'history', 'History', 50)
on conflict do nothing;

-- ───────────────── training: placeholder split ─────────────────
-- meta.days is the weekday numbers (0 = Sunday) this movement appears on,
-- meta.scheme is the prescription. Replace wholesale with your programme.
insert into entities (kind, slug, name, ord, meta, state) values
  ('exercise','bench-press',   'Bench press',       10, '{"days":[1],"scheme":"4×5"}',  '{"best_weight":105,"best_reps":3}'),
  ('exercise','overhead-press','Overhead press',    20, '{"days":[1],"scheme":"3×6"}',  '{"best_weight":62.5,"best_reps":1}'),
  ('exercise','incline-db',    'Incline dumbbell',  30, '{"days":[1],"scheme":"3×10"}', '{"best_weight":34,"best_reps":8}'),
  ('exercise','dips',          'Dips',              40, '{"days":[1],"scheme":"3×max","bodyweight":true}', '{}'),
  ('exercise','deadlift',      'Deadlift',          10, '{"days":[2],"scheme":"3×5"}',  '{"best_weight":170,"best_reps":3}'),
  ('exercise','pull-ups',      'Pull-ups',          20, '{"days":[2],"scheme":"3×max","bodyweight":true}', '{}'),
  ('exercise','barbell-row',   'Barbell row',       30, '{"days":[2],"scheme":"3×8"}',  '{"best_weight":85,"best_reps":6}'),
  ('exercise','barbell-curl',  'Barbell curl',      40, '{"days":[2],"scheme":"2×10"}', '{"best_weight":37.5,"best_reps":8}'),
  ('exercise','back-squat',    'Back squat',        10, '{"days":[3],"scheme":"3×5"}',  '{"best_weight":135,"best_reps":3}'),
  ('exercise','rdl',           'Romanian deadlift', 20, '{"days":[3],"scheme":"3×8"}',  '{"best_weight":105,"best_reps":8}'),
  ('exercise','leg-press',     'Leg press',         30, '{"days":[3],"scheme":"2×12"}', '{"best_weight":240,"best_reps":10}'),
  ('exercise','calf-raise',    'Standing calf',     40, '{"days":[3],"scheme":"3×15"}', '{"best_weight":85,"best_reps":12}'),
  ('exercise','incline-bench', 'Incline bench',     10, '{"days":[5],"scheme":"3×6"}',  '{"best_weight":90,"best_reps":4}'),
  ('exercise','weighted-pull', 'Weighted pull-up',  20, '{"days":[5],"scheme":"3×6"}',  '{"best_weight":12.5,"best_reps":5}'),
  ('exercise','lateral-raise', 'Lateral raise',     30, '{"days":[5],"scheme":"3×15"}', '{"best_weight":14,"best_reps":12}'),
  ('exercise','front-squat',   'Front squat',       10, '{"days":[6],"scheme":"3×5"}',  '{"best_weight":100,"best_reps":3}'),
  ('exercise','hip-thrust',    'Hip thrust',        20, '{"days":[6],"scheme":"2×10"}', '{"best_weight":150,"best_reps":8}'),
  ('exercise','leg-raise',     'Hanging leg raise', 30, '{"days":[6],"scheme":"3×12","bodyweight":true}', '{}')
on conflict do nothing;

-- ───────────────── meal plan: placeholder ─────────────────
-- meta.days omitted = every day.
insert into entities (kind, slug, name, ord, meta) values
  ('meal_slot','pre-rites', 'Warm water, soaked almonds',    10, '{"time":"06:30","label":"before the rites"}'),
  ('meal_slot','breakfast', 'Idli · sāmbār · chutney',        20, '{"time":"09:00","label":"breakfast"}'),
  ('meal_slot','lunch',     'Rice · sāmbār · poriyal · curd', 30, '{"time":"13:00","label":"lunch"}'),
  ('meal_slot','evening',   'Fruit · nuts',                   40, '{"time":"16:30","label":"evening"}'),
  ('meal_slot','dinner',    'Chapati · sabzi · dāl',          50, '{"time":"19:30","label":"dinner"}')
on conflict do nothing;

-- ───────────────── brahma-yajñam canon ─────────────────
-- INTENTIONALLY EMPTY. The corpus and its order differ by śākhā and
-- sampradāya; this must come from your paramparā, not from a model.
--
-- When you have it, insert one row per portion in recitation order and
-- coverage becomes exactly computable:
--
--   insert into entities (kind, slug, name, ord, meta) values
--     ('portion','tai-samhita-1-1','Taittirīya Saṃhitā 1.1', 10, '{"section":"saṃhitā"}'),
--     ...
--
-- The Frontier instrument, when you cut it, reads this table first —
-- coverage against a known canon is the one frontier signal with
-- ground truth, which is why it is worth building before the rest.

-- ───────────────── books: sample, delete freely ─────────────────
insert into entities (kind, slug, name, meta, state) values
  ('book','brahma-sutra-bhasya','Brahma Sūtra Bhāṣya',
     '{"author":"Śaṅkarācārya","pages":720}', '{"page":214}'),
  ('book','seeing-like-a-state','Seeing Like a State',
     '{"author":"James C. Scott","pages":445}', '{"page":88}')
on conflict do nothing;

-- ───────────────── the cabinet ─────────────────
insert into apps (id, ord, enabled) values
  ('day',         10, true),
  ('rites',       20, true),
  ('train',       30, true),
  ('ahara',       40, true),
  ('commonplace', 50, true),
  ('reading',     60, true),
  ('writing',     70, true),
  ('projects',    80, true)
on conflict do nothing;

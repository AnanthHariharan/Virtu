-- ═══════════════════════════════════════════════════════════════════════
--  Entities sync per user.
--
--  0001 keyed entities on `id` alone. Ids are deterministic ('exercise:
--  bench-press'), so that key is global: the first user to seed a
--  programme would own 'exercise:bench-press' for everyone. The client now
--  pushes entities (a working load, a page reached, a book added) with
--  upsert on (user_id, id), which needs this to be the key.
-- ═══════════════════════════════════════════════════════════════════════

alter table entities drop constraint entities_pkey;
alter table entities add primary key (user_id, id);

-- Incremental pull reads events in insertion order from a keyset cursor.
create index if not exists events_pull_idx on events (user_id, created_at, id);

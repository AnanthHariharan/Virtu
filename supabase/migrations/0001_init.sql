-- ═══════════════════════════════════════════════════════════════════════
--  Virtu — schema
--
--  Two ideas carry the whole design, and both are expensive to undo later.
--
--  1. ONE EVENT TABLE. Rites, sets, meals, notes, reading sessions, project
--     steps and measurements are all "something happened at a time, with a
--     payload". Seven trackers would mean seven APIs and seven half-built
--     features; one table means one write path, N views, and Today falls out
--     of a single query.
--
--  2. TWO TIMESTAMPS, ALWAYS. occurred_at is when it happened; recorded_at
--     is when you said so. You will log Tuesday's session on Thursday, and
--     with one column you can never tell them apart again.
-- ═══════════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";

-- ───────────────────────────── entities ─────────────────────────────
-- The nouns: rites, sessions, exercises, meals, heads, books, metrics.
-- `meta` holds immutable facts (an author, a scheme, a slot); `state` holds
-- the current cached value (a page, a working load). Events remain the
-- record of how that value got there.

create table entities (
  id          text primary key,          -- deterministic: 'exercise:bench-press'
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind        text not null,
  slug        text not null,
  name        text not null,
  aliases     text[] not null default '{}',
  meta        jsonb  not null default '{}',
  state       jsonb  not null default '{}',
  ord         int,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  unique (user_id, kind, slug)
);

create index entities_kind_idx on entities (user_id, kind) where archived_at is null;

-- ────────────────────────────── events ──────────────────────────────

create table events (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,

  kind         text not null,           -- rite|japa|set|meal|note|read|piece|task|measure|capture
  occurred_at  timestamptz not null,
  recorded_at  timestamptz not null default now(),
  local_date   date not null,           -- the user's calendar day for occurred_at

  raw          text,                    -- exactly what was typed, where anything was
  payload      jsonb,
  status       text not null default 'confirmed' check (status in ('raw','confirmed')),
  source       text not null default 'phone' check (source in ('phone','desktop','agent','import')),

  -- Idempotent offline sync. The client mints this BEFORE the write, so a
  -- queued event that pushes twice after a flaky connection lands once.
  -- Never generate it server-side.
  client_id    text not null,

  created_at   timestamptz not null default now(),
  unique (user_id, client_id)
);

create index events_recent_idx on events (user_id, occurred_at desc);
create index events_day_idx    on events (user_id, local_date);
create index events_kind_idx   on events (user_id, kind, occurred_at desc);
create index events_payload_idx on events using gin (payload);

comment on table events is
  'Append-only. Corrections are new events naming the old one in payload.corrects — never UPDATEs.';

-- ───────────────────────────── modules ──────────────────────────────
-- The ecosystem registry. Which instruments are kept, mirrored from the
-- client. Switching one off hides it; its events stay in the ledger.

create table modules (
  id       text not null,
  user_id  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  enabled  boolean not null default true,
  ord      int not null default 0,
  settings jsonb not null default '{}',
  primary key (user_id, id)
);

-- ═══════════════════════════════════════════════════════════════════════
--  Row Level Security. One user today, but the habit is free and the
--  retrofit is not.
-- ═══════════════════════════════════════════════════════════════════════

alter table entities enable row level security;
alter table events   enable row level security;
alter table modules  enable row level security;

do $$
declare t text;
begin
  foreach t in array array['entities','events','modules']
  loop
    execute format(
      'create policy %I_own on %I for all using (user_id = auth.uid()) with check (user_id = auth.uid())',
      t, t);
  end loop;
end $$;

-- ═══════════════════════════════════════════════════════════════════════
--  Views. The questions worth asking across modules — which is the whole
--  reason for keeping one table rather than seven.
-- ═══════════════════════════════════════════════════════════════════════

-- Volume load by day. Σ weight × reps.
create view training_load as
select user_id, local_date,
       sum((payload->>'weight')::numeric * (payload->>'reps')::int) as volume,
       count(*) as sets
from events
where kind = 'set' and payload ? 'weight' and payload ? 'reps'
group by user_id, local_date;

-- Rite adherence by day.
create view rite_adherence as
select user_id, local_date,
       count(*) filter (where payload->>'observed' = 'true') as observed,
       count(distinct payload->>'slug') as attempted
from events
where kind = 'rite'
group by user_id, local_date;

-- The cross-module question: does training the day before move the sleep
-- reading the morning after? One table is what makes this a single join.
create view day_summary as
select user_id, local_date,
       count(*) filter (where kind = 'rite' and payload->>'observed' = 'true') as rites,
       count(*) filter (where kind = 'set')                                     as sets,
       count(*) filter (where kind = 'meal' and payload->>'status' = 'ate')     as meals,
       count(*) filter (where kind = 'note')                                    as notes,
       sum((payload->>'to')::int - (payload->>'from')::int)
         filter (where kind = 'read')                                           as pages
from events
group by user_id, local_date;

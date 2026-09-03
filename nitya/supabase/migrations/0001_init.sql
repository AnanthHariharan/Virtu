-- ═══════════════════════════════════════════════════════════════════
--  Nitya — initial schema
--
--  Two ideas carry the whole design:
--
--  1. ONE EVENT TABLE. Rites, sets, meals, learnings, reading sessions
--     and project steps are all "something happened at a time, with a
--     payload". Four trackers would mean four APIs and four half-built
--     features; one table means one write path, N views, and the Daybook
--     falls out of a single query.
--
--  2. TWO TIMESTAMPS, ALWAYS. occurred_at is when it happened;
--     recorded_at is when you said so. You will log Tuesday's workout on
--     Thursday, and with one column you can never tell them apart again.
-- ═══════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";

-- ───────────────────────── entities ─────────────────────────
-- The nouns. Books, exercises, rites, loci, projects, ideas, concepts.
-- `state` holds current mutable state (a book's page, an idea's status).
-- Events remain the audit trail of how it got there.

create table entities (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind        text not null,           -- book|exercise|rite|locus|project|idea|meal_slot|portion|concept
  slug        text not null,
  name        text not null,
  aliases     text[] not null default '{}',
  meta        jsonb  not null default '{}',   -- immutable facts: author, page count, slot
  state       jsonb  not null default '{}',   -- current: page, status, best_1rm
  ord         int,                            -- for anything with a canonical order
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  unique (user_id, kind, slug)
);

create index entities_kind_idx on entities (user_id, kind) where archived_at is null;

-- ───────────────────────── events ─────────────────────────

create table events (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,

  kind         text not null,          -- see event_kinds below
  occurred_at  timestamptz not null,
  recorded_at  timestamptz not null default now(),
  local_date   date not null,          -- the user's calendar day for occurred_at

  raw          text,                   -- exactly what was typed or spoken, if anything
  payload      jsonb,                  -- structured; null until extracted
  status       text not null default 'raw'
                 check (status in ('raw','extracted','confirmed','failed')),
  source       text not null default 'phone'
                 check (source in ('phone','desktop','agent','import')),

  -- idempotent offline sync: the client mints this before the write, so a
  -- queued event that syncs twice after a flaky connection lands once
  client_id    text not null,

  created_at   timestamptz not null default now(),
  unique (user_id, client_id)
);

create index events_recent_idx  on events (user_id, occurred_at desc);
create index events_day_idx     on events (user_id, local_date);
create index events_kind_idx    on events (user_id, kind, occurred_at desc);
create index events_pending_idx on events (user_id, status) where status = 'raw';
create index events_payload_idx on events using gin (payload);

comment on table events is
  'Append-only. Corrections are new events referencing the old one in payload.corrects, never UPDATEs.';

-- ───────────────────────── event ↔ entity ─────────────────────────

create table event_entities (
  event_id   uuid not null references events(id)   on delete cascade,
  entity_id  uuid not null references entities(id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  role       text not null,           -- performed|consumed|read|referenced|produced|covers
  qty        numeric,
  unit       text,
  primary key (event_id, entity_id, role)
);

create index event_entities_entity_idx on event_entities (user_id, entity_id);

-- ───────────────────────── extractions ─────────────────────────
-- The learning loop. Every attempt by every model is kept, so
-- "is the local model good enough?" is a query, not an opinion.

create table extractions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  event_id       uuid not null references events(id) on delete cascade,
  model          text not null,
  quant          text,
  prompt_version text not null default 'v1',
  output         jsonb,
  latency_ms     int,
  accepted       boolean,              -- null = not yet reviewed
  expected       jsonb,                -- hand-labelled ground truth, for the eval set
  created_at     timestamptz not null default now()
);

create index extractions_event_idx on extractions (user_id, event_id);
create index extractions_eval_idx  on extractions (user_id, model, prompt_version);

-- ───────────────────────── app registry ─────────────────────────
-- The Cabinet. Sub-apps are rows, not hardcoded routes: turning one off
-- hides its instrument while leaving its entries in the Daybook.

create table apps (
  id         text primary key,         -- 'rites' | 'train' | ...
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  enabled    boolean not null default true,
  ord        int not null default 0,
  pinned     boolean not null default false,
  settings   jsonb not null default '{}'
);

-- ═══════════════════════════════════════════════════════════════════
--  Row Level Security. One user today, but the habit is free and the
--  retrofit is not.
-- ═══════════════════════════════════════════════════════════════════

alter table entities       enable row level security;
alter table events         enable row level security;
alter table event_entities enable row level security;
alter table extractions    enable row level security;
alter table apps           enable row level security;

do $$
declare t text;
begin
  foreach t in array array['entities','events','event_entities','extractions','apps']
  loop
    execute format(
      'create policy %I_own on %I for all using (user_id = auth.uid()) with check (user_id = auth.uid())',
      t, t);
  end loop;
end $$;

-- ═══════════════════════════════════════════════════════════════════
--  Views
-- ═══════════════════════════════════════════════════════════════════

-- The Daybook: everything entered on a day, whatever instrument entered it.
create view daybook as
select
  e.id, e.user_id, e.kind, e.occurred_at, e.recorded_at, e.local_date,
  e.payload, e.raw, e.status, e.source,
  coalesce(
    (select jsonb_agg(jsonb_build_object('id', en.id, 'kind', en.kind, 'name', en.name, 'role', ee.role))
     from event_entities ee join entities en on en.id = ee.entity_id
     where ee.event_id = e.id),
    '[]'::jsonb
  ) as touches
from events e;

-- Lineage: what each entity has produced, in the order it produced it.
create view entity_lineage as
select
  en.id as entity_id, en.user_id, en.kind as entity_kind, en.name as entity_name,
  e.id as event_id, e.kind as event_kind, e.occurred_at, e.payload, ee.role
from entities en
join event_entities ee on ee.entity_id = en.id
join events e on e.id = ee.event_id
order by e.occurred_at;

-- Training volume by day. Volume load = Σ weight × reps.
create view training_load as
select
  user_id, local_date,
  sum((payload->>'weight')::numeric * (payload->>'reps')::int) as volume_kg,
  count(*) as sets
from events
where kind = 'workout_set' and payload ? 'weight' and payload ? 'reps'
group by user_id, local_date;

-- Rite adherence by day.
create view rite_adherence as
select
  user_id, local_date,
  count(*) filter (where payload->>'observed' = 'true') as observed,
  count(*) as scheduled
from events
where kind = 'rite'
group by user_id, local_date;

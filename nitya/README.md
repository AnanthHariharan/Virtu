# Nitya

A personal ledger — anuṣṭhāna, training, āhāra, commonplace, reading, writing,
projects — kept in one book, under many heads.

An installable iPhone PWA. Local-first: every write lands in IndexedDB and returns
immediately, then syncs to Supabase whenever the network and the server are both
willing. Logging in a gym basement is indistinguishable from logging at a desk.

## Running it

```bash
npm install
cp .env.example .env.local        # fill in your Supabase URL and anon key
npm run dev                       # http://localhost:3000
```

It runs with **no** Supabase configured — the local store is authoritative for the
UI and sync simply no-ops. That is useful for the first day; you will want the
database before you have data worth losing.

### Database

Create a Supabase project, then in the SQL editor run, in order:

1. `supabase/migrations/0001_init.sql` — schema, RLS, views
2. `supabase/migrations/0002_seed.sql` — your rites, the commonplace heads, and
   placeholder training and menu

Sign in once so `auth.uid()` resolves; the seed's `default auth.uid()` fills
`user_id` for you.

### On your phone

Serve over HTTPS (`npx vercel dev`, a tunnel, or a deploy), open in Safari, then
**Share → Add to Home Screen**. This matters more than it looks:

- Push notifications only work on iOS from an installed PWA
- Non-installed PWAs can have their site data evicted after ~7 days of disuse

## What is where

```
supabase/migrations/  schema — read 0001 first, the comments carry the design
src/lib/
  store.ts            THE write path. logEvent() and the sync loop
  idb.ts              small IndexedDB wrapper, no dependency
  registry.ts         the Cabinet — sub-apps as data, not routes
  haptics.ts          iOS haptics via the switch trick, and the bell
  time.ts             vessels of the day, local dates, Epley
src/app/
  page.tsx            the Daybook — every instrument's entries on one page
  japa/               the counter: full-screen tap, haptics, wake lock, clicker
  reading/[id]/       an entity page: lineage from book → learning → piece
  cabinet/            the registry, and four instruments not yet cut
worker/extract.mjs    Phase 2. Free text → structured, with an eval loop
```

`CLAUDE.md` has the conventions. Read it before changing the schema or the write
path.

## Where this is going

**Phase 1 (this repo).** Log real things from your phone. No model anywhere.
Done when you have logged three workouts and one of them had no signal.

**Phase 2.** Expose the ledger as an MCP server so Claude can query your own data,
and start `worker/extract.mjs` on free text. Log every question you ask — those
traces are the eval set for Phase 3.

**Phase 3.** Replicate Phase 2 with open weights. `worker/extract.mjs --eval` scores
each model and quantization against your hand-labelled rows. Extraction is the right
job for a local model precisely because it has ground truth.

## Two things it is waiting on

- **Your brahma-yajñam corpus.** The seed deliberately contains no portions; the
  canon differs by śākhā and must come from your paramparā. Once seeded, coverage
  becomes exactly computable.
- **Your actual training split.** What is in `0002_seed.sql` is a placeholder.

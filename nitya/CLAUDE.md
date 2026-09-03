# Nitya — conventions

A personal ledger. One user, one book, many heads. Read this before changing anything.

## The three rules that are expensive to break

**1. One event table.** Rites, sets, meals, learnings, reading sessions and project
steps are all rows in `events` with a `kind` and a JSONB `payload`. Do not add a
`workouts` table. Four trackers means four APIs, four UIs, and four half-finished
features; one table means the Daybook falls out of a single query and cross-domain
questions are possible at all.

**2. Two timestamps, always.** `occurred_at` is when it happened, `recorded_at` is
when it was entered. Never collapse them. `local_date` is the user's calendar day —
use `localDate()` from `lib/time`, never `toISOString().slice(0,10)`, which rolls the
date over for anyone west of Greenwich logging in the evening.

**3. Everything speaks OpenAI-compatible HTTP.** No vendor SDK in business logic.
Local and cloud models are one `base_url` apart, which is what makes them
A/B-testable on identical inputs.

## Writes

Every write goes through `logEvent()` in `lib/store.ts` — agent or human, no
exceptions. A second write path is how you end up with two schemas.

Events are append-only. There are no UPDATEs. Unobserving a rite writes
`observed: false`; fixing a wrong number writes a new event whose payload carries
`corrects: <client_id>`. `correctEvent()` does this for you.

`client_id` is minted on the client before the write. It is the idempotency key: a
queued event that syncs twice after a flaky connection collides on
`(user_id, client_id)` and lands once. Never generate it server-side.

Entity `state` (a book's page, an exercise's best) is a cache of what the event log
already says. Patch it with `patchEntityState`, but the log stays the record.

## Local-first

IndexedDB is the source of truth for the UI. `logEvent` writes there and returns; it
never awaits the network. `flush()` pushes pending rows and is safe to call
constantly — it no-ops when offline, unconfigured, or already running.

**iOS has no Background Sync API.** The queue drains on app open, focus, visibility
change, and regaining network. Do not write code that assumes background sync; do not
add a service worker `sync` event handler and believe it fires.

Every IndexedDB call goes through `safe()`. It throws in private windows and when
site data is blocked, and a failed read must never break a render.

## Adding an instrument

Three steps, and nothing else in the app needs to know:

1. A row in `APPS` in `lib/registry.ts` declaring the event kinds it owns.
2. A route folder under `src/app/`.
3. A `case` in the Daybook's `line()` renderer in `src/app/page.tsx`.

Sub-apps are data. Shutting one in the Cabinet hides the instrument but leaves its
entries in the Daybook, because events belong to the ledger, not to the app that
wrote them.

## Design

Renaissance printed page, and the conventions are load-bearing rather than
decorative. **No `font-weight: bold` anywhere** — bold did not exist; emphasis is
italic and small caps. Old-style figures (`--osf`) in prose, lining and tabular
(`--lnf`) in any column of numbers. Rubrication in cinnabar for headings and marks;
gilt only ever means completion. Sigils are the seven classical planets, which
governed the days in every Renaissance almanac, plus the manicule ☞ for the
commonplace book.

All colour comes from tokens in `globals.css`. Never declare a colour only inside a
media query or `[data-theme]` block — it will not apply in the un-stamped default
state and the page will render one theme's text on the other theme's ground.

Components in `components/Page.tsx` (`Opening`, `Sec`, `Entry`, `Versal`, `Fleuron`)
are the shared vocabulary. A new instrument that uses them looks native for free.

## Haptics

`navigator.vibrate` has never been implemented in Safari. `haptic()` in
`lib/haptics.ts` toggles a hidden `<input type="checkbox" switch>`, which fires the
system haptic on iOS 17.4+. It is the only route a web app has to the Taptic Engine.
If it stops working the fallbacks are a Bluetooth clicker (already supported — the
japa page listens for space and arrow keys) or a Capacitor wrap, which would reuse
this entire codebase.

## Not yet built

- **Brahma-yajñam canon.** `0002_seed.sql` deliberately seeds no portions. The corpus
  and its order differ by śākhā and sampradāya and must come from the user's
  paramparā, not from a model. Once seeded, coverage is exactly computable and is the
  only frontier signal with ground truth.
- **The extraction worker** (`worker/extract.mjs`) exists but nothing in the app
  writes `note` events yet. Wire up free-text capture, then run it.
- **The Frontier instrument.** Listed in `FUTURE_APPS`. Build it after the canon.

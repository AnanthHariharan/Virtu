# Virtu — conventions

A personal ledger. One user, one book, many instruments. Read this before
changing anything.

## The four rules that are expensive to break

**1. One event table.** Rites, sets, meals, notes, reading sessions, project
steps and measurements are all rows in `events` with a `kind` and a typed
payload. Do not add a `workouts` table. Seven trackers means seven APIs, seven
UIs and seven half-finished features; one table means Today falls out of a
single query and cross-module questions are possible at all.

**2. Two timestamps, always.** `occurred_at` is when it happened,
`recorded_at` is when it was entered. Never collapse them — you will log
Tuesday's session on Thursday. `local_date` is the user's calendar day; use
`localDate()` from `lib/time`, never `toISOString().slice(0,10)`, which rolls
the date over for anyone west of Greenwich logging in the evening.

**3. One write path.** Every write goes through `log()` in `lib/ledger.ts` —
module, sheet or agent, no exceptions. A second write path is how you end up
with two schemas.

**4. Payloads are typed.** `Payloads` in `lib/types.ts` maps each kind to its
shape and `log()` is generic over it. Adding a kind means adding it there
first. A payload that is not in that map cannot be written, which is the point.

## Events are append-only

There are no UPDATEs. Un-observing a rite writes `observed: false`; fixing a
wrong number writes a new event whose payload carries `corrects: <client_id>`
— `correct()` does this for you. A record that you changed your mind at 22:40
is worth more than a row that quietly disappeared.

`client_id` is minted on the client before the write. It is the idempotency
key: a queued event that pushes twice after a flaky connection collides on
`(user_id, client_id)` and lands once. Never generate it server-side.

Entity `state` (a book's page, an exercise's working load) is a cache of what
the log already says. Patch it with `patchState`, but the log stays the record,
and anything derivable — a personal best, a streak, a pace — should be computed
from events rather than stored.

## Local-first

IndexedDB is the source of truth for the UI. `log()` writes there and returns;
it never awaits the network. `flush()` pushes pending rows and is safe to call
constantly — it no-ops when offline, unconfigured, or already running.

**iOS has no Background Sync API.** The queue drains on app open, focus,
visibility change, and regaining network. Do not write code that assumes
background sync; do not add a service worker `sync` handler and believe it
fires.

Every IndexedDB call goes through `safe()`. It throws in private windows and
where site data is blocked, and a failed read must never break a render.

The service worker is registered **in production only**. Its cache-first rule
for static assets serves stale chunks in development and silently breaks Fast
Refresh.

## Adding a module

Two files, and nothing else in the app needs to know:

1. A `Module` in `MODULES` in `src/modules/registry.ts`, declaring the event
   kinds it owns and carrying its own `describe(event)`.
2. A route folder under `src/app/`.

Do **not** add a case to `src/app/page.tsx`. Today renders whatever the
registry can describe — that is the entire reason `describe()` lives on the
module. Switching a module off hides its instrument and its entries but leaves
the events in the ledger, because events belong to the book, not to the module
that wrote them.

## The plan lives in `src/data`

Rites, programme, menu, heads and metrics are plain typed data with no
behaviour. Each collection carries a `VERSION`; bumping it reseeds that
collection on the next app open, preserving existing entity `state`. Never seed
from a page component, and never let a module reach past `src/data` to
hard-code a movement or a meal.

## Design — Swiss, and the rules are load-bearing

**Three colours.** Paper, ink, and one red. A fourth is a decision to make
forever after. Completion is a rule and a strikethrough, never a green tick.
The accent appears roughly once per screen: on what is due, what is a record,
or what is about to change by itself.

**Two typefaces, and they do not overlap.** Archivo carries everything read as
language. IBM Plex Mono — small, uppercase, letterspaced — carries everything
read as a label, a unit or a figure. If a thing is a number, it is tabular
(`--tnum`). There is no third typeface and no decorative weight.

**The grid is visible.** Every division of the page is a 1px rule. Nothing
floats, nothing has a shadow, nothing is rounded — `border-radius` is `0`
everywhere and should stay that way. Structure is the ornament.

**Flush left, ragged right.** No centred text anywhere except a single empty
state.

**All colour comes from tokens on bare `:root`** in `globals.css`. Never
declare a colour only inside a media query or a `[data-theme]` block — it will
not apply in the un-stamped default state, and the page will render one theme's
text on the other theme's ground.

The primitives in `components/ui.tsx` (`Display`, `Section`, `Row`, `Figures`,
`Sheet`, `Stepper`, `Chips`, `Spark`) are the shared vocabulary. A module built
from them looks native for free. `Row` in particular is the shared unit of
every list in the application; reach for it before writing a new layout.

**No `window.prompt()`, ever.** Every write happens in a `Sheet`, with a
sensible default, a unit, and a cancel that costs nothing. Numbers are entered
with `Stepper` so a set can be logged without a keyboard appearing.

Touch targets are never below 44px (`--tap`), and any text input is 16px or
larger or iOS will zoom the page on focus.

## Haptics

`navigator.vibrate` has never been implemented in Safari. `tap()` in
`lib/haptics.ts` toggles a hidden `<input type="checkbox" switch>`, which fires
the system haptic on iOS 17.4+. It is the only route a web app has to the
Taptic Engine. If it stops working the fallbacks are a Bluetooth clicker
(already supported — the japa counter listens for space and arrow keys) or a
Capacitor wrap, which would reuse this entire codebase.

## Three data rules that are not obvious

**Activity is measured in time.** Sport and running use the `activity` kind,
never `set`. They have no working load, and inventing one to fit the sets model
would put fictional weight into every volume total. Minutes are the shared
quantity; distance is optional. Do not compute a one-rep maximum or a volume
load for anything with `time`.

**The praśna cycle is relative, not calendrical.** The brahma-yajñam praśna due
today is the one after the last *recorded*, wrapping at the end of PORTIONS —
never `dayOfYear % 12`. A missed day must cost a day, not a praśna.

**Grams are the only quantity.** Bowls reference the ITEMS catalogue by slug so
an ingredient used in three bowls is one line on the grocery list, and every
amount is in grams because household measures cannot be added up. The `hint`
field is display only; never do arithmetic with it. A prepared mix declares
`parts` so the recipe keeps it whole while the grocery list expands it into
what can go in a basket.

## Not yet built

- **The MCP server.** The ledger as a queryable surface, with agent writes
  going through the same `log()` as everything else.
- **Extraction.** `capture` events are stored raw and unstructured. Wire them
  to a model only once there are enough of them to be an eval set.

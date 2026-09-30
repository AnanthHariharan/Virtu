# Virtu

A personal operating system. Anuṣṭhānas, training, meals, reading, writing,
projects and measures — nine instruments over **one** ledger, installable to a
phone home screen and fully usable with no network at all.

It is the successor to **Nitya** (the first commit in this repository). The
spine survived; almost everything above it was rebuilt.

---

## Running it

```bash
npm install
npm run dev            # http://localhost:3000
```

That is the whole setup. Virtu runs with **no** database configured — the local
store is authoritative for the interface and sync simply no-ops. You will want
a database before you have data worth losing, not before.

### A database, when you want one

```bash
cp .env.example .env.local     # fill in your Supabase URL and anon key
```

Then, in the Supabase SQL editor, run the migrations in `supabase/migrations`
in order. Open **Modules → Sync and account** (`/settings`) and send yourself a
sign-in link; until you are signed in, `auth.uid()` is null and nothing can be
pushed. The client mints `client_id` before every write, so a queue that
pushes twice after a flaky connection lands once.

### Triage with Jev, when you want it

Set `TYPESAFE_API_KEY` in `.env.local` (server-side; never `NEXT_PUBLIC_`),
then switch **Sort captures with Jev** on in Settings. Each capture is sent
once, as its text alone, and comes back as typed answers. A note Jev is sure
of is filed under its head; a set, a measure, a run or pages read is only
*offered* in the Inbox, with its figures on steppers. Every accept and refusal
is written as a verdict — the labels that will tune the thresholds.

### The ledger as an MCP server

```bash
VIRTU_EXPORT=~/Downloads/virtu-2026-09-30.json npm run mcp
```

Or point it at Supabase with `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and
`VIRTU_USER_ID` (keep the service key on your own machine). To use it from
Claude Code:

```bash
claude mcp add virtu -e VIRTU_EXPORT=/path/to/export.json -e TYPESAFE_API_KEY=... -- npm --prefix /path/to/Virtu run --silent mcp
```

Tools: `summary`, `events`, `day`, `account`, `week`, `forecast`, `search` (all read-only),
`capture` (a raw line into the inbox), and `log_event` (a shaped entry, written
only after Jev checks it against the user's own words).

### Tests

```bash
npm test
```

### On your phone

Serve over HTTPS (`npx vercel dev`, a tunnel, or a deploy), open in Safari, and
**Share → Add to Home Screen**. This matters more than it looks:

- Push notifications only work on iOS from an *installed* PWA.
- Non-installed PWAs can have their site data evicted after ~7 days of disuse.

The same build is a normal web app in any browser: under 900px it is a phone
app with a tab bar; above it, a desktop app with a left rail.

---

## The parts that are yours

Everything you will actually want to change is plain typed data in
[`src/data`](src/data), with no behaviour in it:

| File | What it defines |
|---|---|
| `anushtanas.ts` | The nitya-karma, and the twelve brahma-yajñam praśnas |
| `program.ts` | The training split — sessions, movements, schemes, loads |
| `activities.ts` | Sport and running — cricket, rugby, vinyasa, running |
| `menu.ts` | The five bowls, the item catalogue, and the aisles |
| `heads.ts` | Commonplace heads, and the measures kept |

Each carries a `VERSION`. Bump it after an edit and the next app open reseeds
**that collection only** — your logged events are never touched, because they
belong to the ledger rather than to the plan that produced them. Reseeding the
programme does not erase a lift's working load or its record, and anything
that has left the data is archived rather than left orphaned in the interface.

### Three things about the data worth knowing

**The praśna cycle.** The twelve brahma-yajñam praśnas are recited one a day,
in the order they are listed. The one due today is the one *after* the last
recorded, wrapping at the end — so missing a day costs you a day rather than a
praśna, and you resume where you stopped instead of where the calendar thinks
you ought to be. Because the corpus is finite and ordered, coverage is exactly
computable, which makes it the only measure in the application with hard
ground truth.

**Activity is time, not load.** Cricket, rugby, vinyasa and running live in
`activities.ts` and log against a separate event kind, because they do not fit
the sets-and-reps model and forcing them into it would mean inventing a
working weight for an hour of rugby — which would then corrupt every volume
figure on the page. What they all share is minutes, so minutes are the one
quantity every activity records; distance is optional and only running asks
for it. Each declares its own `modes`, because a match is not an hour in the
nets and a long run is not a set of intervals. Adding a fifth sport is one
entry in that file.

**Loads.** `UNIT` in `program.ts` is one constant, currently `"lb"`. It labels
barbell and dumbbell figures only; machine stacks are numbered on their own
scale and recorded as-is. A load marked `perSide` is per hand — a pair of 30s
reads `30 × 2`. Cardio is logged in minutes and contributes nothing to volume
load, which is correct, because minutes on a rower are not weight moved.

**Grocery lists are derived, never maintained.** Bowls reference an ITEMS
catalogue by slug rather than naming their ingredients, which is what lets
rice appearing in three bowls become one line on the list. Prepared mixes
declare their `parts`, so the Indian bowl keeps `kachumber` as one line in the
recipe and arrives at the shop as cucumber, tomato, onion and a lemon. Every
quantity is in grams, because grams are the only measure that can be added up;
the household measures beside them are hints and are never used in arithmetic.

---

## How it is built

```
src/data/            the plan — rites, programme, menu, heads. Edit these.
src/core/            pure, shared logic: schemas, corrections, rite state
  schema.ts          the schema of every event kind, in one place (Zod)
  triage.ts          Jev's questions for a capture, and the rules that decide
  inbox.ts           the inbox, folded from captures, judgments and verdicts
  reflection.ts      what Jev reads in an evening line: four scales, four signals
  account.ts         what is owed, as weight × urgency; the week against the last
  lab.ts             verdicts as labels: reliability, calibration error, replay
  event.ts           mintEvent(): the one constructor for a ledger row
  guard.ts           Jev's three checks on an agent's write
  links.ts           the commonplace, cross-referenced
  model.ts           what the days predict: held out, baselined, inspectable
src/mcp/             the ledger as an MCP server: stores, tools, stdio
  time.ts            local dates, parts of the day, Epley, streaks
src/lib/
  types.ts           Payloads, inferred from core/schema
  ledger.ts          THE write path. log(), corrections, the sync loop, export
  remote.ts          everything the sync loop asks of the server
  judge.ts           the triage runner, and accept / refuse / undo
  jev-server.ts      the only code that talks to Jev (server-side)
  db.ts              a small IndexedDB wrapper, no dependency
  seed.ts            src/data → entity rows, versioned per collection
  haptics.ts         iOS haptics via the switch trick, and the bell
src/modules/
  registry.ts        the ecosystem. Modules are data, and self-describing
src/components/
  ui.tsx             Display, Section, Row, Figures, Sheet, Stepper, Spark
  Glyph.tsx          the ten pictograms
  Shell.tsx          running head, rail/tab bar, quick capture
src/app/             one folder per module
supabase/migrations/ the schema — read 0001, the comments carry the design
scripts/icons.mjs    PWA icons, generated with no dependencies
```

`CLAUDE.md` holds the conventions. Read it before changing the schema, the
write path, or the colour tokens.

---

## What changed from Nitya

The architecture was right and it stayed. Three things about it are worth
keeping in mind before you change anything: **one event table**, **two
timestamps always**, and **one write path**. The rest was rebuilt.

**Modules are self-describing.** Nitya's home page held a `switch` over every
event kind, so adding an instrument meant editing the home page and adding a
case. Here each module carries its own `describe()`, so Today renders modules
it has never heard of, a switched-off module's history still reads correctly,
and adding one is two files — a registry entry and a route folder.

**Payloads are typed.** `Payloads` in `src/lib/types.ts` maps each event kind
to its shape, and `log()` is generic over it. `log("set", { rep: 5 })` is now a
compile error rather than a silently empty column six months from now.

**No more `window.prompt()`.** Every write in Nitya went through browser
prompts — two of them to log one set, unusable between sets with cold hands,
and losing the whole entry if either was cancelled. Everything now happens in a
sheet with steppers, defaults drawn from your last working set, and a cancel
that costs nothing.

**Training understands sessions.** Exercises were tagged with weekday numbers,
so a session could only be run on the day it was scheduled. Sessions are now
named (Push, Pull, Legs, Upper, Conditioning); you can run Monday's work on
Tuesday, and the ledger records which session a set belonged to.

**Records are computed, not stored.** Bests come from the log rather than from
a cached field, so correcting a set corrects the record.

**A quick capture, and Measures.** One button from anywhere writes an
unstructured line; it surfaces in Commonplace waiting for a head. Measures —
weight, sleep, resting pulse — is new, and is the module the others are
ultimately for.

**Meals became the table.** Two sittings a day drawn from five bowls, with
three views over the same data: what you ate, how each bowl is built, and the
shopping it all adds up to.

**The design is Swiss.** See `CLAUDE.md`. Three colours, two typefaces, a
visible grid, and no decoration anywhere.

Removed: the extraction worker and the `extractions` table. Nothing wrote to
them, and the `capture` event kind leaves the door open to do it properly
later, against real captured text.

---

## Where this is going

**Now.** Log real things from the phone. No model anywhere.

**Now, too.** The ledger is an MCP server (`npm run mcp`): an agent can read
any of it, and write only through the same constructor and schema as the app,
behind a calibrated check against the user's own words.

**And now.** Captures are triaged by Jev, with your verdicts as the eval set
(`/lab`); evening lines are read for features; and a small, honest model
predicts tomorrow's sleep and rites from the days so far — shown only when it
beats guessing the average.

## What it is still waiting on

- **Nothing, for the moment.** The praśnas, the split and the bowls are all
  in. What is still worth adding is a rest timer between sets, and a way to
  edit `src/data` from inside the app rather than in an editor.

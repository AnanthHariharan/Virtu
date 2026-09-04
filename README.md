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

Then, in the Supabase SQL editor, run `supabase/migrations/0001_init.sql`. Sign
in once so `auth.uid()` resolves. The client mints `client_id` before every
write, so a queue that pushes twice after a flaky connection lands once.

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
src/lib/
  types.ts           Payloads: the schema of every event kind, in one place
  ledger.ts          THE write path. log(), the sync loop, export
  db.ts              a small IndexedDB wrapper, no dependency
  seed.ts            src/data → entity rows, versioned per collection
  haptics.ts         iOS haptics via the switch trick, and the bell
  time.ts            local dates, parts of the day, Epley, streaks
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

**Next.** Expose the ledger as an MCP server so an agent can query your own
data. Every event already carries `source: 'agent'` as an option, and every
agent write would go through the same `log()` the interface uses.

**After that.** Free text → structure, with the captures as the eval set.
Extraction is the right job for a local model precisely because it has ground
truth.

## What it is still waiting on

- **Nothing, for the moment.** The praśnas, the split and the bowls are all
  in. What is still worth adding is a rest timer between sets, and a way to
  edit `src/data` from inside the app rather than in an editor.

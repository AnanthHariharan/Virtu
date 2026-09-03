# `src/data` — the parts that are yours

Everything in this folder is plain, typed data with no behaviour. It is the
only place you edit to change *what* Virtu tracks; the modules that render it
never need to know.

| File            | What it defines                                        |
|-----------------|--------------------------------------------------------|
| `anushtanas.ts` | The nitya-karma, by part of the day                    |
| `program.ts`    | The training split: sessions, movements, schemes        |
| `menu.ts`       | The standing menu, by meal                              |
| `heads.ts`      | Commonplace heads, and the measures kept                |

Each collection carries a `VERSION`. Bump it after an edit and the next app
open reseeds that collection, leaving your logged events — which belong to the
ledger, not to the plan — completely untouched.

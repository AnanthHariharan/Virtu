#!/usr/bin/env node
/**
 * The extraction worker.  ── Phase 2. Not wired into the app yet.
 *
 * Polls Supabase for events with status='raw' (free text you typed or spoke),
 * asks a model to turn them into structured payloads under a JSON schema, and
 * writes the result back along with a row in `extractions`.
 *
 * Three things about this are deliberate:
 *
 *  1. It talks OpenAI-compatible HTTP against a configurable base URL. Local
 *     (LM Studio, mlx_lm.server) and cloud are the same code path and one env
 *     var apart, which is what lets you A/B them on identical inputs.
 *
 *  2. It uses a JSON schema, not a polite request for JSON. An 8B model asked
 *     nicely returns broken JSON a few per cent of the time forever; the same
 *     model under a schema returns parseable output every time.
 *
 *  3. Every attempt lands in `extractions` tagged with model and quant. That
 *     is the whole learning loop: "is the local model good enough?" becomes a
 *     query, not an opinion.
 *
 *   node worker/extract.mjs           process the backlog once
 *   node worker/extract.mjs --watch   poll every 30s
 *   node worker/extract.mjs --eval    score against hand-labelled `expected`
 */

import { createClient } from "@supabase/supabase-js";

const {
  NEXT_PUBLIC_SUPABASE_URL: URL_,
  SUPABASE_SERVICE_KEY,
  NEXT_PUBLIC_SUPABASE_ANON_KEY,
  LLM_BASE_URL = "http://localhost:1234/v1",
  LLM_API_KEY = "not-needed",
  LLM_MODEL = "qwen3-8b-instruct-4bit",
  LLM_QUANT = "q4",
} = process.env;

const PROMPT_VERSION = "v1";

const db = createClient(URL_, SUPABASE_SERVICE_KEY || NEXT_PUBLIC_SUPABASE_ANON_KEY);

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "payload"],
  properties: {
    kind: {
      type: "string",
      enum: ["workout_set", "meal", "learning", "reading", "japa", "note"],
    },
    payload: { type: "object" },
    confidence: { type: "number", minimum: 0, maximum: 1 },
  },
};

const SYSTEM = `You convert one line of a personal daily log into a structured entry.

Kinds and their payloads:
  workout_set  { exercise: string, weight: number (kg, 0 if bodyweight), reps: integer }
  meal         { name: string, status: "ate" | reason string }
  learning     { text: string, locus: "Vedānta"|"Method"|"Craft"|"Nature"|"History" }
  reading      { book: string, from_page: integer, to_page: integer }
  japa         { mantra: string, count: integer, target: integer }
  note         { text: string }

Rules:
- Weights are kilograms unless the text says lb; convert lb to kg and round to 0.5.
- "5x5 at 100" means five sets of five reps; emit ONE workout_set for the whole
  prescription only if sets are not separable, otherwise the first set.
- Never invent a number that is not in the text. If a required field is absent,
  use kind "note" and put the original text in payload.text.
- Return confidence below 0.6 whenever you had to guess.`;

async function extract(raw) {
  const t0 = Date.now();
  const res = await fetch(`${LLM_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${LLM_API_KEY}` },
    body: JSON.stringify({
      model: LLM_MODEL,
      temperature: 0,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: raw },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "entry", strict: true, schema: SCHEMA },
      },
    }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const body = await res.json();
  return {
    output: JSON.parse(body.choices[0].message.content),
    latency_ms: Date.now() - t0,
  };
}

async function processBacklog() {
  const { data: rows, error } = await db
    .from("events").select("*").eq("status", "raw").not("raw", "is", null).limit(50);
  if (error) throw error;
  if (!rows?.length) return 0;

  for (const ev of rows) {
    try {
      const { output, latency_ms } = await extract(ev.raw);
      await db.from("extractions").insert({
        event_id: ev.id, model: LLM_MODEL, quant: LLM_QUANT,
        prompt_version: PROMPT_VERSION, output, latency_ms,
      });
      // 'extracted', not 'confirmed': extraction proposes, you dispose.
      await db.from("events").update({
        kind: output.kind, payload: output.payload, status: "extracted",
      }).eq("id", ev.id);
      console.log(`✓ ${latency_ms}ms  ${output.kind.padEnd(12)} ${ev.raw.slice(0, 56)}`);
    } catch (e) {
      await db.from("events").update({ status: "failed" }).eq("id", ev.id);
      console.error(`✗ ${ev.raw?.slice(0, 56)} — ${e.message}`);
    }
  }
  return rows.length;
}

/** Score this model+prompt against every hand-labelled row. The number that matters. */
async function runEval() {
  const { data } = await db.from("extractions").select("*").not("expected", "is", null);
  if (!data?.length) {
    console.log("No labelled rows. Set `expected` on ~50 extractions to build the eval set.");
    return;
  }
  const by = {};
  for (const r of data) {
    const k = `${r.model} @ ${r.quant ?? "—"} · ${r.prompt_version}`;
    by[k] ??= { n: 0, ok: 0, ms: 0 };
    by[k].n++;
    by[k].ms += r.latency_ms ?? 0;
    if (JSON.stringify(r.output) === JSON.stringify(r.expected)) by[k].ok++;
  }
  console.log("\nmodel · quant · prompt".padEnd(46), "n".padStart(5), "exact".padStart(8), "mean ms".padStart(9));
  for (const [k, v] of Object.entries(by)) {
    console.log(k.padEnd(46), String(v.n).padStart(5),
      `${((v.ok / v.n) * 100).toFixed(1)}%`.padStart(8),
      String(Math.round(v.ms / v.n)).padStart(9));
  }
  console.log("\nExact match is strict on purpose. Read the misses; most are units and dates.\n");
}

const arg = process.argv[2];
if (arg === "--eval") {
  await runEval();
} else if (arg === "--watch") {
  console.log(`watching · ${LLM_MODEL} @ ${LLM_BASE_URL}`);
  for (;;) {
    try { await processBacklog(); } catch (e) { console.error(e.message); }
    await new Promise(r => setTimeout(r, 30_000));
  }
} else {
  const n = await processBacklog();
  console.log(n ? `\n${n} processed.` : "Nothing waiting.");
}

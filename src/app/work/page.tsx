"use client";

import { useMemo, useState } from "react";
import { Display, Section, Row, Note, Sheet, Field, Text, Empty, Figures, Fig } from "@/components/ui";
import { useKind } from "@/hooks/useLedger";
import { log } from "@/lib/ledger";
import { tap } from "@/lib/haptics";

export default function Work() {
  const steps = useKind("task");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [plan, setPlan] = useState("");
  const [adding, setAdding] = useState<string | null>(null);
  const [step, setStep] = useState("");

  /** The current state of a step is its most recent event. */
  const stateOf = (project: string, s: string) =>
    !!steps.find(e => e.payload?.project === project && e.payload?.step === s)?.payload?.done;

  /** Projects are derived from their steps. There is no project table. */
  const projects = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const e of [...steps].reverse()) {
      const p = e.payload; if (!p?.project || !p?.step) continue;
      const list = m.get(p.project) ?? [];
      if (!list.includes(p.step)) list.push(p.step);
      m.set(p.project, list);
    }
    return [...m.entries()];
  }, [steps]);

  const openSteps = projects.reduce(
    (n, [proj, list]) => n + list.filter(s => !stateOf(proj, s)).length, 0
  );

  async function toggle(project: string, s: string) {
    tap();
    await log("task", { project, step: s, done: !stateOf(project, s) });
  }

  async function create() {
    const n = name.trim();
    if (!n) return;
    tap();
    const list = plan.split(/[;\n]/).map(s => s.trim()).filter(Boolean);
    for (const s of (list.length ? list : ["Begin"])) {
      await log("task", { project: n, step: s, done: false });
    }
    setName(""); setPlan(""); setOpen(false);
  }

  async function addStep() {
    const s = step.trim();
    if (!s || !adding) return;
    tap();
    await log("task", { project: adding, step: s, done: false });
    setStep(""); setAdding(null);
  }

  return (
    <>
      <Display deck={<>Plans broken into steps that can be struck through. <b>{openSteps}</b> outstanding across {projects.length} {projects.length === 1 ? "project" : "projects"}.</>}>
        Pro<span className="thin">jects</span>
      </Display>

      <div style={{ marginTop: 26 }}>
        <Figures cols={3}>
          <Fig value={projects.length} label="Projects" />
          <Fig value={openSteps} label="Outstanding" hot={openSteps > 8} />
          <Fig value={projects.reduce((n, [p, l]) => n + l.filter(s => stateOf(p, s)).length, 0)} label="Struck" />
        </Figures>
      </div>

      {projects.map(([project, list]) => {
        const done = list.filter(s => stateOf(project, s)).length;
        return (
          <div key={project}>
            <Section count={`${done}/${list.length}`}>{project}</Section>
            {list.map(s => {
              const d = stateOf(project, s);
              return (
                <Row key={s} mark={d ? "●" : "○"} markOn={!d} done={d}
                     title={s} onClick={() => toggle(project, s)} />
              );
            })}
            <div className="btn-row" style={{ marginTop: 12 }}>
              <button className="btn sm quiet" onClick={() => { tap(); setAdding(project); }}>
                Add a step
              </button>
            </div>
          </div>
        );
      })}

      {!projects.length && (
        <Empty title="No projects open.">
          A project here is nothing but a name and a list of steps. That is
          deliberate — anything more and it becomes software to maintain.
        </Empty>
      )}

      <div className="btn-row">
        <button className="btn accent grow" onClick={() => { tap(); setOpen(true); }}>Open a project</button>
      </div>

      <Sheet title="A project" open={open} onClose={() => setOpen(false)}>
        <Field label="Name"><Text value={name} onChange={setName} autoFocus placeholder="What is it?" /></Field>
        <Field label="Its steps — one per line">
          <Text value={plan} onChange={setPlan} area
                placeholder={"Draft the schema\nWire the sync\nShip it"} />
        </Field>
        <div className="btn-row">
          <button className="btn accent grow" onClick={create} disabled={!name.trim()}>Open</button>
          <button className="btn quiet" onClick={() => setOpen(false)}>Cancel</button>
        </div>
      </Sheet>

      <Sheet title={`Add to ${adding ?? ""}`} open={!!adding} onClose={() => setAdding(null)}>
        <Field label="The step"><Text value={step} onChange={setStep} autoFocus placeholder="One thing to do" /></Field>
        <div className="btn-row">
          <button className="btn accent grow" onClick={addStep} disabled={!step.trim()}>Add</button>
          <button className="btn quiet" onClick={() => setAdding(null)}>Cancel</button>
        </div>
      </Sheet>

      <Note>
        Striking a step through writes an event; un-striking writes another.
        There is no projects table — a project is simply the set of steps that
        name it, which is why one can be opened without any setup at all.
      </Note>
    </>
  );
}

"use client";

import { Opening, Fleuron } from "@/components/Page";
import { useEntities, useEvents } from "@/hooks/useLedger";
import { logEvent } from "@/lib/store";
import { haptic } from "@/lib/haptics";

export default function Projects() {
  const projects = useEntities("project");
  const steps = useEvents("project_step");

  /** A step's current state is its most recent event. */
  const stateOf = (project: string, step: string) => {
    const e = steps.find(x => x.payload?.project === project && x.payload?.step === step);
    return !!e?.payload?.done;
  };

  async function toggle(project: string, step: string, done: boolean) {
    haptic(1);
    await logEvent({ kind: "project_step", payload: { project, step, done: !done } });
  }

  async function addProject() {
    const n = prompt("The project?");
    if (!n) return;
    const plan = prompt("Its pieces, separated by semicolons?", "");
    const list = (plan ?? "").split(";").map(s => s.trim()).filter(Boolean);
    haptic(1);
    for (const step of list) {
      await logEvent({ kind: "project_step", payload: { project: n, step, done: false } });
    }
    if (!list.length) await logEvent({ kind: "project_step", payload: { project: n, step: "Begin", done: false } });
  }

  /** Projects are derived from their steps until you seed entity rows for them. */
  const byProject = new Map<string, string[]>();
  for (const e of [...steps].reverse()) {
    const p = e.payload as Record<string, any>;
    if (!p?.project || !p?.step) continue;
    const list = byProject.get(p.project) ?? [];
    if (!list.includes(p.step)) list.push(p.step);
    byProject.set(p.project, list);
  }
  for (const p of projects) if (!byProject.has(p.name)) byProject.set(p.name, []);

  return (
    <>
      <Opening title="Pro" em="jects" sub="Plans, in pieces" />
      <Fleuron mark="♄" />

      {[...byProject.entries()].map(([name, list]) => {
        const done = list.filter(s => stateOf(name, s)).length;
        return (
          <div className="card" key={name}>
            <h4>{name}</h4>
            <div className="m">{done} of {list.length} struck through</div>
            <ul>
              {list.map(s => {
                const d = stateOf(name, s);
                return (
                  <li key={s} className={d ? "done" : ""} onClick={() => toggle(name, s, d)}
                      style={{ cursor: "pointer" }}>
                    {s}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}

      {!byProject.size && <p className="note-it">No projects entered.</p>}

      <div className="btn-row">
        <button className="btn red" onClick={addProject}>Open a project</button>
      </div>
    </>
  );
}

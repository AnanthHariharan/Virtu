"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Glyph from "@/components/Glyph";
import { Display, Section, Note, Switch, Figures, Fig } from "@/components/ui";
import { MODULES, PLANNED } from "@/modules/registry";
import { useModules, useAll } from "@/hooks/useLedger";
import { exportAll } from "@/lib/ledger";
import { hasRemote } from "@/lib/supabase";
import { tap } from "@/lib/haptics";

/**
 * The ecosystem, as a page.
 *
 * Switching a module off hides its instrument and its entries. It does NOT
 * remove anything: the events stay in the ledger, and switching it back on
 * restores the history intact — because events belong to the book, not to
 * the module that wrote them.
 */
export default function Modules() {
  const router = useRouter();
  const { enabled, toggle } = useModules();
  const all = useAll();
  const [copied, setCopied] = useState(false);

  const kinds = new Set(all.map(e => e.kind));
  const days = new Set(all.map(e => e.local_date));

  async function download() {
    tap();
    const blob = new Blob([await exportAll()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `virtu-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2400);
  }

  return (
    <>
      <Display deck={<>Each module owns a kind of entry and nothing more. Nine instruments, one ledger.</>}>
        Mod<span className="thin">ules</span>
      </Display>

      <div style={{ marginTop: 26 }}>
        <Figures cols={3}>
          <Fig value={all.length.toLocaleString()} label="Entries" />
          <Fig value={days.size} label="Days kept" />
          <Fig value={kinds.size} label="Kinds in use" />
        </Figures>
      </div>

      <Section count={`${MODULES.filter(m => enabled(m.id)).length}/${MODULES.length}`}>Kept</Section>

      {MODULES.map(m => {
        const on = enabled(m.id);
        const n = all.filter(e => m.owns.includes(e.kind)).length;
        return (
          <div className="mod" key={m.id}>
            <span className={"ic" + (on ? "" : " off")}><Glyph name={m.icon} size={20} /></span>
            <span>
              <h4>
                <button onClick={() => { tap(); router.push(m.path); }}>{m.name}</button>
              </h4>
              <p>{m.blurb}</p>
              <div className="owns">
                {m.core ? "Always kept" : `Owns ${m.owns.join(" · ")}`}
                {n > 0 && ` — ${n} entries`}
              </div>
            </span>
            <Switch on={on} disabled={m.core} label={`Keep ${m.name}`} onToggle={() => toggle(m.id)} />
          </div>
        );
      })}

      <Section sub>Not yet cut</Section>
      {PLANNED.map(p => (
        <div className="mod planned" key={p.name}>
          <span className="ic off"><Glyph name={p.icon} size={20} /></span>
          <span>
            <h4>{p.name}</h4>
            <p>{p.blurb}</p>
            <div className="owns">Build it when the ledger asks for it</div>
          </span>
          <span className="label">Later</span>
        </div>
      ))}

      <Section sub>The book itself</Section>
      <div className="row">
        <span className="mk" aria-hidden="true">⇄</span>
        <span className="bd">
          <span className="t">{hasRemote() ? "Syncing to Supabase" : "Local only"}</span>
          <span className="m">
            {hasRemote()
              ? "Writes land locally and push when the network allows"
              : "No database configured — IndexedDB is the whole store"}
          </span>
        </span>
      </div>
      <div className="row">
        <span className="mk" aria-hidden="true">↓</span>
        <span className="bd">
          <span className="t">Export everything</span>
          <span className="m">One JSON file: every entity, every event</span>
        </span>
        <button className="btn sm quiet" onClick={download}>{copied ? "Saved" : "Export"}</button>
      </div>

      <Note>
        Adding a module is two files: a definition in{" "}
        <b>src/modules/registry.ts</b> carrying its own <b>describe()</b>, and a
        route folder under <b>src/app</b>. Nothing else in the application needs
        to know it exists — not even Today, which renders whatever the registry
        can describe.
      </Note>
    </>
  );
}

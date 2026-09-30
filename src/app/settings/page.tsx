"use client";

import { useEffect, useState } from "react";
import { Display, Section, Note, Field, Text, Figures, Fig, Switch, Row } from "@/components/ui";
import { exportAll, flush, pull, pendingCount, subscribe } from "@/lib/ledger";
import { hasRemote } from "@/lib/supabase";
import { sendMagicLink, signOut, useAccount } from "@/lib/auth";
import { tap } from "@/lib/haptics";
import { jevEnabled, setJevEnabled } from "@/lib/judge";

/**
 * The book itself: whose it is, where it is kept, and how to take it away.
 */
export default function Settings() {
  const account = useAccount();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(0);
  const [saved, setSaved] = useState(false);
  const [jev, setJev] = useState(false);

  useEffect(() => { void jevEnabled().then(setJev); }, []);

  async function toggleJev() {
    const next = !jev;
    setJev(next);
    await setJevEnabled(next);
  }

  useEffect(() => {
    const refresh = () => { void pendingCount().then(setPending); };
    refresh();
    return subscribe(refresh);
  }, []);

  async function link() {
    const e = email.trim();
    if (!e) return;
    tap();
    setError(null);
    const r = await sendMagicLink(e);
    if (r.ok) setSent(true);
    else setError(r.error ?? "The link could not be sent.");
  }

  async function syncNow() {
    tap();
    await flush();
    await pull();
  }

  async function download() {
    tap();
    const blob = new Blob([await exportAll()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `virtu-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    setSaved(true);
    setTimeout(() => setSaved(false), 2400);
  }

  const remote = hasRemote();

  return (
    <>
      <Display deck={<>Whose book this is, where it is kept, and how to take it with you.</>}>
        Set<span className="thin">tings</span>
      </Display>

      <div style={{ marginTop: 26 }}>
        <Figures cols={2}>
          <Fig value={remote ? (account ? "On" : "Off") : "—"} label="Sync" />
          <Fig value={pending} label="Unsent" hot={remote && !!account && pending > 0} />
        </Figures>
      </div>

      <Section>Account</Section>
      {!remote && (
        <div className="row">
          <span className="mk" aria-hidden="true">·</span>
          <span className="bd">
            <span className="t">Local only</span>
            <span className="m">No database configured — IndexedDB is the whole store</span>
          </span>
        </div>
      )}

      {remote && account && (
        <>
          <div className="row">
            <span className="mk" aria-hidden="true">⇄</span>
            <span className="bd">
              <span className="t">{account}</span>
              <span className="m">Signed in · writes push when the network allows</span>
            </span>
            <button className="btn sm quiet" onClick={syncNow}>Sync now</button>
          </div>
          <div className="btn-row">
            <button className="btn quiet" onClick={() => { tap(); void signOut(); }}>Sign out</button>
          </div>
        </>
      )}

      {remote && account === null && (
        sent ? (
          <p className="lede">
            A link is on its way to <b>{email.trim()}</b>. Open it on this device
            and the queue will drain on arrival.
          </p>
        ) : (
          <>
            <Field label="Email">
              <Text value={email} onChange={setEmail} placeholder="you@example.com" />
            </Field>
            {error && <p className="lede">{error}</p>}
            <div className="btn-row">
              <button className="btn accent grow" onClick={link} disabled={!email.trim()}>
                Send a sign-in link
              </button>
            </div>
          </>
        )
      )}

      <Section sub>Triage</Section>
      <div className="row">
        <span className="mk" aria-hidden="true">◇</span>
        <span className="bd">
          <span className="t">Sort captures with Jev</span>
          <span className="m">
            Sends each capture&rsquo;s text — and nothing else from the ledger
            but the names of your heads, books, lifts and projects — to TypeSafe
          </span>
        </span>
        <Switch on={jev} label="Sort captures with Jev" onToggle={toggleJev} />
      </div>
      {jev && <Row mark="→" title="Open the inbox" meta="What Jev filed, offered, and left for you"
                   value="→" href="/inbox" />}

      <Section sub>The book itself</Section>
      <div className="row">
        <span className="mk" aria-hidden="true">↓</span>
        <span className="bd">
          <span className="t">Export everything</span>
          <span className="m">One JSON file: every entity, every event</span>
        </span>
        <button className="btn sm quiet" onClick={download}>{saved ? "Saved" : "Export"}</button>
      </div>

      <Note>
        Nothing waits on the network. Every entry lands on this device first
        and is pushed when you are signed in and online — on opening the app,
        on returning to it, and on regaining a connection.
      </Note>
    </>
  );
}

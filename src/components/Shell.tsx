"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Glyph from "./Glyph";
import Banners from "./Banners";
import { Sheet, Field, Text } from "./ui";
import { MODULES, moduleForPath } from "@/modules/registry";
import { startSync, pendingCount, subscribe, log } from "@/lib/ledger";
import { seed } from "@/lib/seed";
import { useModules } from "@/hooks/useLedger";
import { stamp } from "@/lib/time";
import { tap } from "@/lib/haptics";
import { hasRemote } from "@/lib/supabase";

/** Sub-routes that are not modules but carry their own running head. */
const SUB: Record<string, string> = {
  "/anushtanas/japa": "Japa",
  "/modules": "Modules",
  "/settings": "Settings",
};

/**
 * Running head, leaf, and navigation. Every page renders inside this.
 *
 * The navigation is one list rendered twice: a foot bar under 900px, a left
 * rail above it. Two arrangements of the same grid — never two codebases.
 */
export default function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { enabled, ready: modsReady } = useModules();
  const [pending, setPending] = useState(0);
  const [date, setDate] = useState("");
  const [ready, setReady] = useState(false);
  const [capture, setCapture] = useState(false);
  const [text, setText] = useState("");

  const current = moduleForPath(path);
  const heading = SUB[path]
    ?? (path.startsWith("/read/") ? "Reading" : undefined)
    ?? current?.name
    ?? "Virtu";

  useEffect(() => {
    setDate(stamp());
    let stop = () => {};
    const refresh = () => { void pendingCount().then(setPending); };
    const un = subscribe(refresh);

    // Seed the local store from src/data, then start draining the queue.
    void seed().then(() => { setReady(true); stop = startSync(); refresh(); });

    // Ask the browser to keep our data. An installed app is usually granted
    // this outright, but asking is what makes it durable elsewhere — and the
    // ledger is the one thing here that cannot be reconstructed.
    void navigator.storage?.persisted?.()
      .then(ok => { if (!ok) return navigator.storage.persist?.(); })
      .catch(() => {});

    // Only in production. In development the worker's cache-first rule for
    // static assets serves stale chunks and quietly breaks Fast Refresh.
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    } else if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.getRegistrations()
        .then(rs => rs.forEach(r => void r.unregister()))
        .catch(() => {});
    }
    return () => { stop(); un(); };
  }, []);

  const nav = MODULES.filter(m => m.nav && (m.core || enabled(m.id)));

  const isOn = (p: string) => (p === "/" ? path === "/" : path === p || path.startsWith(p + "/"));

  async function saveCapture() {
    const t = text.trim();
    if (!t) return;
    tap();
    await log("capture", { text: t }, { raw: t });
    setText("");
    setCapture(false);
  }

  return (
    <div className="app">
      {/* the rail, ≥ 900px */}
      <aside className="rail">
        <div className="rail-mark">Vir<b>tu</b></div>
        <nav>
          {MODULES.filter(m => m.core || enabled(m.id)).map(m => (
            <Link key={m.id} href={m.path} className={isOn(m.path) ? "on" : ""} onClick={() => tap()}>
              <Glyph name={m.icon} size={17} />
              {m.name}
            </Link>
          ))}
          <Link href="/modules" className={isOn("/modules") ? "on" : ""} onClick={() => tap()}>
            <Glyph name="modules" size={17} />
            Modules
          </Link>
        </nav>
        <div className="rail-foot">
          <span className="label">{date}</span>
        </div>
      </aside>

      <div className="main">
        <header className="head">
          <span className="head-name">{heading}</span>
          <span className="head-meta">
            {/* with no database configured every row is 'unsent' forever, which is
                noise rather than information */}
            {hasRemote() && pending > 0 && <span className="unsent">{pending} unsent</span>}
            <span>{date}</span>
          </span>
        </header>

        <Banners />

        <main className="leaf">{ready && modsReady ? children : null}</main>
      </div>

      {/* quick capture — one tap from anywhere to a line of free text */}
      <button className="quick" aria-label="Capture a line"
              onClick={() => { tap(); setCapture(true); }}>+</button>

      <Sheet title="Capture" open={capture} onClose={() => setCapture(false)}>
        <Field label="Anything at all">
          <Text value={text} onChange={setText} area autoFocus
                placeholder="A line now; give it a head later." />
        </Field>
        <div className="btn-row">
          <button className="btn accent grow" onClick={saveCapture}>Enter</button>
          <button className="btn quiet" onClick={() => setCapture(false)}>Cancel</button>
        </div>
        <p className="foot-note">
          Captures land in the ledger unstructured and appear in Commonplace,
          where they can be given a head. A line entered badly beats an entry
          you meant to make.
        </p>
      </Sheet>

      {/* the foot, &lt; 900px */}
      <nav className="foot">
        {nav.map(m => (
          <Link key={m.id} href={m.path} className={isOn(m.path) ? "on" : ""} onClick={() => tap()}>
            <Glyph name={m.icon} size={19} />
            <span className="lbl">{m.short}</span>
          </Link>
        ))}
        <Link href="/modules" className={isOn("/modules") ? "on" : ""} onClick={() => tap()}>
          <Glyph name="modules" size={19} />
          <span className="lbl">More</span>
        </Link>
      </nav>
    </div>
  );
}

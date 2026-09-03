"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { APPS, byRoute } from "@/lib/registry";
import { startSync, pendingCount, subscribe } from "@/lib/store";
import { bootstrap } from "@/lib/bootstrap";
import { folio } from "@/lib/time";
import { haptic } from "@/lib/haptics";
import { useCabinet } from "@/hooks/useCabinet";

/** Running head, the leaf, and the foot. Every page sits inside this. */
export default function Chrome({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const app = byRoute(path);
  const { enabled } = useCabinet();
  const [pending, setPending] = useState(0);
  const [stamp, setStamp] = useState("");

  const [ready, setReady] = useState(false);

  useEffect(() => {
    setStamp(folio());
    let stop = () => {};
    const refresh = () => { void pendingCount().then(setPending); };
    const un = subscribe(refresh);

    // seed the local store on first run, then start syncing
    void bootstrap().then(() => { setReady(true); stop = startSync(); refresh(); });

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    return () => { stop(); un(); };
  }, []);

  const feet = APPS.filter(a => a.inFoot);

  return (
    <div className="codex">
      <header className="head">
        <span className="rh">
          <span className="sig">{app?.sigil ?? "❧"}</span>
          {app?.name ?? "Nitya"}
        </span>
        <span className="folio">
          {pending > 0 && <span className="pending">{pending} unsent · </span>}
          {stamp}
        </span>
      </header>

      <main className="leaf">{ready ? children : null}</main>

      <nav className="foot">
        {feet.map(a => {
          const on = a.route === "/" ? path === "/" : path.startsWith(a.route);
          const shut = !a.fixed && !enabled(a.id);
          return (
            <Link
              key={a.id}
              href={a.route}
              className={on ? "on" : ""}
              style={{ opacity: shut ? 0.35 : 1 }}
              onClick={() => haptic(1)}
            >
              <span className="s">{a.sigil}</span>
              {a.name.length > 9 ? a.name.slice(0, 6) + "…" : a.name}
            </Link>
          );
        })}
        <Link
          href="/cabinet"
          className={path === "/cabinet" ? "on" : ""}
          onClick={() => haptic(1)}
        >
          <span className="s">❦</span>Cabinet
        </Link>
      </nav>
    </div>
  );
}

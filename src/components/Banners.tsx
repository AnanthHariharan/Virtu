"use client";

import { useEffect, useState } from "react";
import { getMeta, setMeta } from "@/lib/db";
import { tap } from "@/lib/haptics";

/** Installed to the home screen, or launched from it. */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches
    || (navigator as any).standalone === true;   // the iOS legacy signal
}

/**
 * Two thin strips under the running head, and never more than one at a time.
 *
 * The first says the app can be installed — which matters more than it looks,
 * because an installed PWA gets durable storage and this one keeps a ledger
 * that cannot be re-derived. The second says a new version is waiting.
 */
export default function Banners() {
  const [install, setInstall] = useState(false);
  const [ios, setIos] = useState(false);
  const [prompt, setPrompt] = useState<any>(null);
  const [update, setUpdate] = useState<ServiceWorker | null>(null);

  /* ── install ── */
  useEffect(() => {
    if (isStandalone()) return;
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));

    void getMeta("install:dismissed", false).then(d => { if (!d) setInstall(true); });

    // Android and desktop Chrome hand us a real prompt; iOS never does, which
    // is why the strip falls back to telling you where the button is.
    const onPrompt = (e: Event) => { e.preventDefault(); setPrompt(e); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  async function dismiss() {
    tap();
    setInstall(false);
    await setMeta("install:dismissed", true);
  }

  async function doInstall() {
    tap();
    if (!prompt) return;
    prompt.prompt();
    await prompt.userChoice;
    setPrompt(null);
    setInstall(false);
  }

  /* ── updates ──
     A waiting worker only exists when one is already in control, so this
     never fires on a first visit — only when a deploy has landed. */
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let cancelled = false;

    void navigator.serviceWorker.getRegistration().then(reg => {
      if (!reg || cancelled) return;
      if (reg.waiting && navigator.serviceWorker.controller) setUpdate(reg.waiting);
      reg.addEventListener("updatefound", () => {
        const next = reg.installing;
        next?.addEventListener("statechange", () => {
          if (next.state === "installed" && navigator.serviceWorker.controller) {
            setUpdate(next);
          }
        });
      });
    });

    const onSwitch = () => window.location.reload();
    navigator.serviceWorker.addEventListener("controllerchange", onSwitch);
    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener("controllerchange", onSwitch);
    };
  }, []);

  if (update) {
    return (
      <div className="strip">
        <span>A new version is ready</span>
        <button onClick={() => { tap(); update.postMessage("skip-waiting"); }}>
          Reload
        </button>
      </div>
    );
  }

  if (!install) return null;

  return (
    <div className="strip">
      <span>{ios ? "Share → Add to Home Screen" : "Install Virtu"}</span>
      {prompt
        ? <button onClick={doInstall}>Install</button>
        : <button onClick={dismiss}>Dismiss</button>}
      {prompt && <button className="x" onClick={dismiss} aria-label="Dismiss">✕</button>}
    </div>
  );
}

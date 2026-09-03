/**
 * A deliberately small service worker.
 *
 * iOS has no Background Sync API, so this does NOT try to drain the write
 * queue in the background — that happens in the app on open, on focus, and
 * on regaining the network (see startSync in src/lib/ledger.ts). Do not add
 * a `sync` event handler here and believe it fires.
 *
 * All this does is make the shell available offline, which is what lets you
 * open Virtu in a gym basement and have it work at all.
 */

const VERSION = "virtu-v1";
const SHELL = [
  "/", "/anushtanas", "/anushtanas/japa", "/train", "/meals",
  "/commonplace", "/read", "/write", "/work", "/measures", "/modules",
  "/manifest.webmanifest",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(VERSION).then((c) => Promise.allSettled(SHELL.map((u) => c.add(u))))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (e) => {
  if (e.data === "skip-waiting") self.skipWaiting();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;

  // Never cache the database. A stale row is worse than no row, and the
  // local store is authoritative for the UI anyway.
  if (url.hostname.endsWith("supabase.co")) return;

  // Never cache Next's dev machinery — its chunk names are not content
  // hashed, so a cache-first rule would serve yesterday's code.
  if (url.pathname.startsWith("/_next/webpack-hmr") ||
      url.pathname.startsWith("/__nextjs")) return;

  // Navigations: network first so a deploy is picked up promptly, cache as
  // the fallback so being offline is not an error page.
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request)
        .then((r) => {
          const copy = r.clone();
          caches.open(VERSION).then((c) => c.put(e.request, copy)).catch(() => {});
          return r;
        })
        .catch(() => caches.match(e.request).then((r) => r || caches.match("/")))
    );
    return;
  }

  // Static assets and fonts: cache first.
  e.respondWith(
    caches.match(e.request).then((hit) =>
      hit ||
      fetch(e.request).then((r) => {
        const cacheable =
          r.ok && (url.origin === location.origin || url.hostname.includes("gstatic"));
        if (cacheable) {
          const copy = r.clone();
          caches.open(VERSION).then((c) => c.put(e.request, copy)).catch(() => {});
        }
        return r;
      }).catch(() => hit)
    )
  );
});

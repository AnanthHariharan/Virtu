/**
 * A deliberately small service worker.
 *
 * iOS has no Background Sync API, so this does NOT try to drain the write
 * queue in the background — that happens in the app on open, focus, and
 * regaining network (see lib/store.ts startSync). All this does is make the
 * shell available offline, which is what lets you open the app in a gym
 * basement and have it work at all.
 */

const CACHE = "nitya-shell-v1";
const SHELL = ["/", "/rites", "/japa", "/train", "/ahara", "/commonplace", "/reading", "/writing", "/projects", "/cabinet"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  // never cache Supabase — stale rows are worse than no rows
  if (url.hostname.endsWith("supabase.co")) return;

  // network first for navigations so a deploy is picked up promptly,
  // cache as the fallback so being offline is not an error page
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request)
        .then((r) => {
          const copy = r.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
          return r;
        })
        .catch(() => caches.match(e.request).then((r) => r || caches.match("/")))
    );
    return;
  }

  // cache first for static assets and fonts
  e.respondWith(
    caches.match(e.request).then((hit) =>
      hit ||
      fetch(e.request).then((r) => {
        if (r.ok && (url.origin === location.origin || url.hostname.includes("gstatic"))) {
          const copy = r.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        }
        return r;
      })
    )
  );
});

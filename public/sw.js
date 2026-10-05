/* The Happy Cookie Ops — service worker.
 *
 * Two jobs: keep the app openable with no signal, and wake the open app when the
 * radio comes back so it can send queued sales. It holds no sign-in and sends nothing
 * itself: the page owns the session, so the page sends. Nothing here caches customer
 * or money data.
 */
const VERSION = 'hc-ops-v3';
// '/sign-in' is stored so a signed-out phone with no signal gets the real sign-in page, not
// the app shell answering for it (which denies, redirects to sign-in, and so on without end).
const SHELL = ['/', '/bazaar', '/sign-in', '/manifest.webmanifest'];

/*
 * Stores the page shell and every build file it names. A redirected answer (the sign-in page
 * served for a signed-out visitor) is never stored as a page: it would be replayed for a
 * navigation, which the browser refuses, leaving an error page instead of the app.
 */
async function storeShell(cache) {
  await Promise.all(
    SHELL.map(async (path) => {
      try {
        const response = await fetch(path, { cache: 'reload' });
        if (!response.ok || response.redirected) return;
        const html = await response.clone().text();
        await cache.put(path, response);
        const files = [...new Set(html.match(/\/_next\/static\/[^"'\\)\s]+/g) || [])].slice(0, 200);
        await Promise.all(
          files.map((u) => cache.match(u).then((hit) => hit || cache.add(u).catch(() => undefined)))
        );
      } catch (error) {
        /* offline at install: the page is stored when it next loads online */
      }
    })
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then(storeShell)
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // product photography and QR codes: cache first, they never change
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches
        .match(request)
        .then((hit) => hit || fetch(request).then((response) => put(request, response)))
    );
    return;
  }

  // hashed build files never change under one URL; the page hands them over once loaded
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches
        .match(request)
        .then((hit) => hit || fetch(request).then((response) => put(request, response)))
    );
    return;
  }

  // screens: network first, fall back to the last copy so the app still opens offline
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => put(request, response))
        // ignoreSearch: '/sign-in?next=…' is the stored '/sign-in'
        .catch(() =>
          caches.match(request, { ignoreSearch: true }).then((hit) => hit || caches.match('/'))
        )
    );
  }
});

function put(request, response) {
  if (response && response.ok) {
    const copy = response.clone();
    caches.open(VERSION).then((cache) => cache.put(request, copy));
  }
  return response;
}

/* ---------- background sync: wake the open app so it sends queued sales ---------- */
self.addEventListener('sync', (event) => {
  if (event.tag === 'hc-sale-sync') event.waitUntil(wakeClients());
});

async function wakeClients() {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  clients.forEach((client) => client.postMessage({ type: 'hc-flush' }));
}

/* ---------- the page lists the scripts it loaded, so a reload works with no signal ---------- */
function cacheable(raw) {
  try {
    const url = new URL(raw, self.location.origin);
    return (
      url.origin === self.location.origin &&
      (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/assets/'))
    );
  } catch (error) {
    return false;
  }
}

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.type !== 'hc-precache' || !Array.isArray(data.urls)) return;
  const port = event.ports && event.ports[0];
  const urls = data.urls.filter(cacheable).slice(0, 400);
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) =>
        Promise.all([
          storeShell(cache),
          ...urls.map((u) => cache.match(u).then((hit) => hit || cache.add(u)))
        ])
      )
      .then(() => port && port.postMessage({ ok: true }))
      .catch(() => port && port.postMessage({ ok: false }))
  );
});

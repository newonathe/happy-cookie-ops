/* The Happy Cookie Ops — service worker.
 *
 * Two jobs: keep the app openable with no signal, and get bazaar sales out of the
 * device even if the tab is closed. Nothing here caches customer or money data beyond
 * the sale queue it is trying to send.
 */
const VERSION = 'hc-ops-v1';
const SHELL = ['/', '/bazaar', '/manifest.webmanifest'];
const QUEUE_DB = 'hc-ops';
const QUEUE_STORE = 'sale-queue';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
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
      caches.match(request).then((hit) => hit || fetch(request).then((response) => put(request, response)))
    );
    return;
  }

  // screens: network first, fall back to the last copy so the app still opens offline
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => put(request, response))
        .catch(() => caches.match(request).then((hit) => hit || caches.match('/')))
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

/* ---------- background sync: send queued sales without an open tab ---------- */
self.addEventListener('sync', (event) => {
  if (event.tag === 'hc-sale-sync') event.waitUntil(flushQueue());
});

self.addEventListener('message', (event) => {
  if (event.data === 'hc-flush') event.waitUntil(flushQueue());
});

function openQueue() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(QUEUE_DB, 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function readPending(db) {
  return new Promise((resolve, reject) => {
    const request = db.transaction(QUEUE_STORE, 'readonly').objectStore(QUEUE_STORE).getAll();
    request.onsuccess = () => resolve((request.result || []).filter((row) => row.state !== 'sent'));
    request.onerror = () => reject(request.error);
  });
}

function markSent(db, clientIds) {
  return new Promise((resolve) => {
    const store = db.transaction(QUEUE_STORE, 'readwrite').objectStore(QUEUE_STORE);
    clientIds.forEach((clientId) => {
      const get = store.get(clientId);
      get.onsuccess = () => {
        const row = get.result;
        if (row) store.put(Object.assign({}, row, { state: 'sent', lastError: null }));
      };
    });
    store.transaction.oncomplete = () => resolve();
  });
}

async function flushQueue() {
  const db = await openQueue();
  const pending = await readPending(db);
  if (!pending.length) return;
  const response = await fetch('/api/sync', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sales: pending })
  });
  if (!response.ok) throw new Error('sync failed: ' + response.status);
  const body = await response.json();
  await markSent(db, body.accepted || []);
  const clients = await self.clients.matchAll({ includeUncontrolled: true });
  clients.forEach((client) => client.postMessage({ type: 'hc-synced', accepted: body.accepted || [] }));
}

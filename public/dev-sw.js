/* Local Next development preview only. Production keeps /sw.js and its offline shell.
 * Do not intercept requests, cache bundles, erase storage, or send queued work here.
 * A new controller releases this origin from an older production worker's script cache.
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

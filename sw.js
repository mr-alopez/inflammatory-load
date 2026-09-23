/**
 * Service worker — §8.6 offline, §13.3 "the app opens and logs manual and saved
 * entries with no network. Only resolution requires it."
 *
 * REPORTED GAP: §8.6 requires offline but says nothing about how a shell update
 * reaches a user. A cache-first worker with a fixed cache name never updates —
 * the first version installed is served forever. That is what happened here
 * during step 7: the browser kept serving the step-6 shell after the file had
 * changed on disk.
 *
 * Strategy, chosen to make that unreachable rather than merely unlikely:
 *   - navigation and same-origin scripts: NETWORK FIRST, falling back to cache.
 *     A reachable network always yields the current shell.
 *   - everything else cached: cache first.
 *   - CACHE_VERSION is bumped on every shell change, and activate deletes any
 *     cache whose name does not match.
 *
 * No background sync, no push, no notifications: §13.3 prohibits any
 * notification or badge reporting a load, and the way to guarantee that is to
 * register no such handler at all.
 */
const CACHE_VERSION = 'v5';
const CACHE = `inflammatory-load-shell-${CACHE_VERSION}`;

const SHELL = [
  './', './index.html', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png',
  './src/coefficients.js', './src/schema.js', './src/scoring.js', './src/store.js',
  './src/macros.js', './src/display.js', './src/select.js', './src/sources.js',
  './src/manual.js', './src/entry.js', './src/client.js',
  './src/backends/indexeddb.js', './src/backends/memory.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const isShellCode = (url) =>
  url.origin === self.location.origin
  && (url.pathname.endsWith('.html') || url.pathname.endsWith('.js') || url.pathname === '/');

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  // Never cache API responses. §8.4 stores resolved values on the entry; a
  // cached OFF or USDA response would be a second, unversioned source of truth.
  if (url.origin !== self.location.origin) return;

  if (e.request.mode === 'navigate' || isShellCode(url)) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
          return res;
        })
        .catch(() => caches.match(e.request).then((hit) => hit ?? caches.match('./index.html')))
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then((hit) => hit ?? fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
      return res;
    }))
  );
});

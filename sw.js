// sw.js — network-first service worker (issue 063).
// Online: every response comes from THIS load's network fetch; the cache is
// rewritten from those bytes (destroy + rebuild), never used to answer a page
// while the network works. Offline: the cache is the fallback.
// file:// is NOT supported (service workers need http/https; localhost counts).
// Dev escape hatch when the worker gets in the way (browser console):
//   navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()));
//   caches.keys().then(ks => ks.forEach(k => caches.delete(k)));
var CACHE = 'emplois-v2';           // bump the suffix whenever PRECACHE or the
                                    // handler semantics change (forces a full
                                    // rebuild + wipes the old cache on activate)
var PRECACHE = [
  './',
  'index.html', 'classes.html', 'time.html', 'timetable.html',
  'styles.css',
  'manifest.json',
  'assets/icon-192.png', 'assets/icon-512.png',
  'assets/icon-maskable-512.png', 'assets/apple-touch-icon.png',
  'js/register.js',
  'js/data.js', 'js/libgroups.js', 'js/model.js', 'js/match.js',
  'js/theme.js', 'js/color.js', 'js/teachers.js', 'js/classes.js', 'js/app.js',
  'vendor/kaomoji.js',
  'vendor/dejavu-sans.woff2', 'vendor/noto-sans-kannada.woff2',
  'vendor/noto-sans-symbols.woff2',
  'emplois.csv'
];

// One shared in-flight precache/rebuild promise: install's addAll, a network
// navigation's rebuild and concurrent tabs await the SAME run, so the 26 URLs
// are never fetched twice in parallel (plan invariant d). Cleared when the run
// settles so the NEXT online navigation rebuilds again.
var inflight = null;
function share(p) {
  inflight = p;
  var done = function () { if (inflight === p) inflight = null; };
  p.then(done, done);
  return p;
}
function rebuild() {
  if (!inflight) {
    share(caches.open(CACHE).then(function (c) { return c.addAll(PRECACHE); }));
  }
  return inflight;
}

// Closed write set (plan criterion 9): only responses whose path matches an
// entry of PRECACHE are ever stored, and they are stored under that canonical
// PRECACHE URL (search stripped) — query strings collapse onto one entry and
// nothing outside the set can be written. The 2xx gate lives in the fetch
// handler above this call; no 404/500 body ever reaches here.
function putCanonical(req, copy) {
  var pathname = new URL(req.url).pathname;
  for (var i = 0; i < PRECACHE.length; i++) {
    var key = new URL(PRECACHE[i], self.location.origin);
    if (key.pathname === pathname) {
      return caches.open(CACHE).then(function (c) { return c.put(key, copy); });
    }
  }
  return Promise.resolve();
}

self.addEventListener('install', function (event) {
  self.skipWaiting();
  // all-or-nothing precache: any failing URL aborts addAll and writes nothing,
  // so a failed install leaves the previous generation intact and retries later.
  event.waitUntil(share(caches.open(CACHE).then(function (c) { return c.addAll(PRECACHE); })));
});

self.addEventListener('activate', function (event) {
  // Every non-current cache is destroyed here. The cache NAME changes with
  // each PRECACHE/semantics bump, so an entry removed from the list cannot
  // survive a generation — without ever opening an empty-cache window.
  event.waitUntil(
    caches.keys().then(function (ks) {
      return Promise.all(ks.filter(function (k) { return k !== CACHE; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;                                  // pass through
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;                   // CDN/Google Fonts untouched
  var nav = req.mode === 'navigate';
  var served = false;
  var save = Promise.resolve();            // per-branch write, created synchronously (inv. b)
  var reply = fetch(req).then(function (res) {                       // 1) NETWORK FIRST
    served = true;
    if (!res.ok) return res;                                         // never cache 404/500
    var copy = res.clone();                                          // clone BEFORE respondWith (inv. a)
    save = putCanonical(req, copy);                                  // 2) rebuild that entry
    if (nav && served) save = save.then(rebuild);                    // 3) network-served navigation ⇒ rebuild ALL (inv. c)
    return res;
  }).catch(function () {
    return caches.match(req, nav ? { ignoreSearch: true } : undefined)  // 4) CACHE FALLBACK
      .then(function (hit) { return hit || Response.error(); });
  });
  event.respondWith(reply);
  event.waitUntil(reply.then(function () { return save; }).catch(function () {}));
});

// sw.js — network-first service worker, "last snapshot" model (issues 063 + 070).
// The stored copy is a SNAPSHOT of the site, never a cache we trust: online,
// every response comes from THIS load's network fetch and the snapshot is only
// ever built WHOLESALE (install's all-or-nothing addAll, every network-served
// navigation's full take, and the erase-everything-then-retake when the
// recorded status goes offline -> online). Offline, the snapshot is the
// fallback. The last online status (online vs offline) is persisted in
// IndexedDB — a worker has no localStorage — so the offline -> online
// transition is detected even after this worker has been terminated and
// relaunched, logged, and the snapshot is erased + retaken on every reconnect.
// file:// is NOT supported (service workers need http/https; localhost counts).
// Dev escape hatch when the worker gets in the way (browser console):
//   navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()));
//   caches.keys().then(ks => ks.forEach(k => caches.delete(k)));
var SNAPSHOT = 'emplois-snapshot-v1'; // bump the suffix whenever SNAPSHOT_URLS or the
                                    // handler semantics change (forces a full
                                    // retake + wipes the old snapshot on activate)
var SNAPSHOT_URLS = [
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

// One shared in-flight take: install's addAll, the offline -> online retake,
// a network navigation's take and concurrent tabs await the SAME run, so the
// 26 URLs are never fetched twice in parallel (063 plan invariant d). Cleared
// when the run settles so the NEXT online navigation takes it again.
var inflight = null;
function share(p) {
  inflight = p;
  var done = function () { if (inflight === p) inflight = null; };
  p.then(done, done);
  return p;
}
function takeSnapshot() {
  if (!inflight) {
    share(caches.open(SNAPSHOT).then(function (c) { return c.addAll(SNAPSHOT_URLS); }));
  }
  return inflight;
}

// Issue 070 — erase-then-retake window: at the transition we ARE online
// (network-first serves every page from the network regardless), but between
// the deletes below and a completed addAll the snapshot is empty — a network
// fetch that fails in that window falls back to a miss -> Response.error()
// (honest failure, no fabricated content). Closest to atomic as the API
// allows: this runs as one chained erase -> addAll inside the serialized
// status chain, and addAll is all-or-nothing, so the snapshot is never
// half-written. It heals: the load being served chains the retake; if that
// fails, the next network-served navigation takes the whole snapshot anyway
// (063 inv c), and the next offline -> online cycle re-runs erase+retake.
// Every cache is snapshot territory — the status record lives in IndexedDB,
// outside Cache Storage, so this teardown can never erase it.
function eraseSnapshot() {
  return caches.keys().then(function (ks) {
    return Promise.all(ks.map(function (k) { return caches.delete(k); }));
  });
}

// --- last online status (issue 070): persisted in IndexedDB, NOT in a cache.
// db 'emplois-status', store 'kv', key 'last-online' -> 'online' | 'offline'.
// Storage errors resolve (best-effort) so the chain never wedges: opens and
// transaction use are guarded, and the connection is closed on every path.
// Version 2: onupgradeneeded also runs on an upgrade, so a store-less older
// database (left by any other opener of this name) is healed here too.
function readStatus() {
  return new Promise(function (resolve) {
    try {
      var req = indexedDB.open('emplois-status', 2);
      req.onupgradeneeded = function () {
        if (!req.result.objectStoreNames.contains('kv')) req.result.createObjectStore('kv');
      };
      req.onerror = function () { resolve(null); };
      req.onsuccess = function () {
        var db = req.result;
        try {
          var get = db.transaction('kv', 'readonly').objectStore('kv').get('last-online');
          get.onsuccess = function () {
            db.close();
            resolve(get.result === 'online' || get.result === 'offline' ? get.result : null);
          };
          get.onerror = function () { db.close(); resolve(null); };
        } catch (e) { db.close(); resolve(null); }
      };
    } catch (e) { resolve(null); }
  });
}
function writeStatus(value) {
  return new Promise(function (resolve) {
    try {
      var req = indexedDB.open('emplois-status', 2);
      req.onupgradeneeded = function () {
        if (!req.result.objectStoreNames.contains('kv')) req.result.createObjectStore('kv');
      };
      req.onerror = function () { resolve(value); };
      req.onsuccess = function () {
        var db = req.result;
        try {
          var put = db.transaction('kv', 'readwrite').objectStore('kv').put(value, 'last-online');
          put.onsuccess = function () { db.close(); resolve(value); };
          put.onerror = function () { db.close(); resolve(value); };
        } catch (e) { db.close(); resolve(value); }
      };
    } catch (e) { resolve(value); }
  });
}

// Loaded ONCE per worker start — every relaunch re-reads the persisted record,
// which is what makes offline -> online detection survive worker restarts —
// then kept in memory. Every update chains onto it so an erase+retake can
// never interleave with another transition check.
var status = readStatus();

// A successful network fetch: record 'online'. On the offline -> online
// transition (persisted record says offline — warm worker OR freshly
// relaunched worker) log it, persist it, tear down EVERYTHING and retake the
// snapshot wholesale; a navigation's take is covered by that same run.
function noteOnline(nav) {
  var run = status.then(function (prev) {
    if (prev === 'offline') {
      console.log('[sw] offline -> online: erasing the snapshot and retaking it fresh');
      return writeStatus('online').then(eraseSnapshot).then(takeSnapshot);
    }
    var stored = Promise.resolve();
    if (prev !== 'online') {
      console.log('[sw] status: online' + (prev === null ? ' (first observation)' : ''));
      stored = writeStatus('online');
    }
    return stored.then(function () {
      if (nav) return takeSnapshot();   // every network-served navigation takes the whole snapshot
    });
  });
  status = run.then(function () { return 'online'; }, function () { return 'online'; });
  return run;
}

// A failed network fetch: record 'offline' (logged + persisted on transition).
// The offline fallback below is never gated on any of this — status recording
// is an observability record, not a switch.
function noteOffline() {
  var run = status.then(function (prev) {
    if (prev === 'offline') return undefined;
    if (prev === 'online') {
      console.log('[sw] online -> offline: the last snapshot now serves');
    } else {
      console.log('[sw] status: offline (first observation)');
    }
    return writeStatus('offline');
  });
  status = run.then(function () { return 'offline'; }, function () { return 'offline'; });
  return run;
}

self.addEventListener('install', function (event) {
  self.skipWaiting();
  // all-or-nothing take: any failing URL aborts addAll and writes nothing,
  // so a failed install leaves the previous generation intact and retries later.
  event.waitUntil(share(caches.open(SNAPSHOT).then(function (c) { return c.addAll(SNAPSHOT_URLS); })));
});

self.addEventListener('activate', function (event) {
  // Every non-current cache is destroyed here. The snapshot NAME changes with
  // each SNAPSHOT_URLS/semantics bump, so an entry removed from the list cannot
  // survive a generation — without ever opening an empty-snapshot window.
  event.waitUntil(
    caches.keys().then(function (ks) {
      return Promise.all(ks.filter(function (k) { return k !== SNAPSHOT; })
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
  var save = Promise.resolve();            // per-branch work, created synchronously (inv. b)
  // cache: 'no-cache' (issue 070): every attempt must REVALIDATE with the
  // origin, so a resolved fetch means the server actually answered — an
  // HTTP-cache hit must never fake "online" for the status record — while
  // validators still let the origin answer 304 when nothing changed.
  var reply = fetch(req, { cache: 'no-cache' }).then(function (res) {  // 1) NETWORK FIRST
    if (!res.ok) return res;                                         // 404/500: never a status input, never snapshot material
    save = noteOnline(nav);                                          // 2) record online; transition => erase ALL + retake
    return res;                                                      //    wholesale inside noteOnline (inv. c)
  }).catch(function () {
    save = noteOffline();                                            // 3) record offline (logged + persisted)
    return caches.match(req, nav ? { ignoreSearch: true } : undefined)  // 4) SNAPSHOT FALLBACK
      .then(function (hit) { return hit || Response.error(); });
  });
  event.respondWith(reply);
  event.waitUntil(reply.then(function () { return save; }).catch(function () {}));
});

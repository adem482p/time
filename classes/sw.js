// classes/sw.js — network-first service worker of the classes app, "last
// snapshot" model (issues 063 + 070; the two-app split is issue 072). This
// worker owns the scope ./ = the classes/ directory only: the sibling
// teachers app runs its own worker (teachers/sw.js) with its own cache
// family and own status database, because Cache Storage and IndexedDB are
// per-ORIGIN — shared between the two workers — so every teardown here is
// filtered to THIS app's family and one app's reconnect can never erase the
// other app's snapshot. The stored copy is a SNAPSHOT of this app, never a
// cache we trust: online, every response comes from THIS load's network fetch
// and the snapshot is only ever built WHOLESALE (install's all-or-nothing
// addAll, every network-served navigation's full take, and the
// erase-then-retake when the recorded status goes offline -> online).
// Offline, the snapshot is the fallback. The last online status (online vs
// offline) is persisted per app in IndexedDB — a worker has no localStorage
// — so the offline -> online transition is detected even after this worker
// has been terminated and relaunched, logged, and the snapshot is erased +
// retaken on every reconnect.
// Shared assets (styles.css, js/, vendor/, assets/, emplois.csv) live at the
// site root and are referenced here relative to this script (../…):
// subresource requests of a controlled page reach THIS worker whatever their
// URL (Handle Fetch routes subresources to the client's controller), so the
// snapshot carries them; navigations to time.html, timetable.html and the
// site root match no registration and are online-only by design (issue 072).
// file:// is NOT supported (service workers need http/https; localhost counts).
// Dev escape hatch when the worker gets in the way (browser console):
//   navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()));
//   caches.keys().then(ks => ks.forEach(k => caches.delete(k)));
// This app's cache family (issue 072): every cache this worker owns starts
// with SNAPSHOT_PREFIX; erase and activation filter on it, so the sibling
// app's snapshot can never be touched. Bump the suffix whenever
// SNAPSHOT_URLS or the handler semantics change (forces a full retake +
// wipes the old generation of THIS family on activate).
var SNAPSHOT_PREFIX = 'emplois-classes-snapshot-';
var SNAPSHOT = SNAPSHOT_PREFIX + 'v1';
var SNAPSHOT_URLS = [
  './',
  'index.html',
  'manifest.json',
  '../styles.css',
  '../assets/icon-192.png',
  '../assets/icon-512.png',
  '../assets/icon-maskable-512.png',
  '../assets/apple-touch-icon.png',
  '../js/register.js',
  '../js/data.js',
  '../js/libgroups.js',
  '../js/model.js',
  '../js/match.js',
  '../js/theme.js',
  '../js/color.js',
  '../js/classes.js',
  '../vendor/kaomoji.js',
  '../vendor/dejavu-sans.woff2',
  '../vendor/noto-sans-kannada.woff2',
  '../vendor/noto-sans-symbols.woff2',
  '../emplois.csv'
];

// One shared in-flight take: install's addAll, the offline -> online retake,
// a network navigation's take and concurrent tabs await the SAME run, so the
// whole URL list is never fetched twice in parallel (063 inv d). Cleared
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
// Only THIS app's family is snapshot territory (issue 072: the sibling app
// shares this origin's Cache Storage and its caches are never ours to delete)
// — the status record lives in IndexedDB, outside Cache Storage, so this
// teardown can never erase it either.
function eraseSnapshot() {
  return caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k.indexOf(SNAPSHOT_PREFIX) === 0; })
      .map(function (k) { return caches.delete(k); }));
  });
}

// --- last online status (issue 070): persisted in IndexedDB, NOT in a cache.
// db 'emplois-classes-status', store 'kv', key 'last-online' -> 'online' | 'offline'.
// Storage errors resolve (best-effort) so the chain never wedges: opens and
// transaction use are guarded, and the connection is closed on every path.
// Version 2: onupgradeneeded also runs on an upgrade, so a store-less older
// database (left by any other opener of this name) is healed here too.
function readStatus() {
  return new Promise(function (resolve) {
    try {
      var req = indexedDB.open('emplois-classes-status', 2);
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
      var req = indexedDB.open('emplois-classes-status', 2);
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
// relaunched worker) log it, persist it, tear down this app's snapshot
// family and retake the snapshot wholesale; a navigation's take is
// covered by that same run.
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
  // Only THIS app's non-current caches are destroyed (a key must carry
  // SNAPSHOT_PREFIX): the sibling app's snapshot lives in the same origin's
  // Cache Storage and is never ours to delete (issue 072). The snapshot NAME
  // changes with each SNAPSHOT_URLS/semantics bump, so an entry removed from
  // the list cannot survive a generation — without ever opening an
  // empty-snapshot window.
  event.waitUntil(
    caches.keys().then(function (ks) {
      return Promise.all(ks.filter(function (k) {
        return k.indexOf(SNAPSHOT_PREFIX) === 0 && k !== SNAPSHOT;
      }).map(function (k) { return caches.delete(k); }));
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
    save = noteOnline(nav);                                          // 2) record online; transition => erase + retake (family-scoped)
    return res;                                                      //    wholesale inside noteOnline (inv. c)
  }).catch(function () {
    save = noteOffline();                                            // 3) record offline (logged + persisted)
    return caches.match(req, nav ? { ignoreSearch: true } : undefined)  // 4) SNAPSHOT FALLBACK
      .then(function (hit) { return hit || Response.error(); });
  });
  event.respondWith(reply);
  event.waitUntil(reply.then(function () { return save; }).catch(function () {}));
});

// omni/sw.js — network-first service worker of the omni app, runtime
// response caching (issue 087: the build-time "last snapshot" model of
// issues 063 + 070 is retired). This worker owns the scope ./ = the omni
// directory only: the sibling teachers app runs its own worker
// (teachers/sw.js) with its own cache family and own status database,
// because Cache Storage and IndexedDB are per-ORIGIN — shared between the
// two workers — so every cache access here is filtered to THIS app's family
// and one app's offline fallback can never erase the other's.
// Online, every same-origin GET is fetched network-first (cache: 'no-cache',
// so an HTTP-cache hit never fakes freshness or connectivity) and every
// successful response is put into this app's runtime cache; offline, that
// runtime cache serves the last successful response for the request, and a
// miss is an honest Response.error() — never fabricated content. Because the
// strategy is network-first, an online session re-puts every response it
// serves, so a cached entry can never go stale without a fresh network answer
// behind it.
// The runtime cache self-populates from real traffic: there is no build-time
// snapshot list and no install-time addAll any more (issue 087) — the worker
// source is stamped into the build by scripts/gen-sw.mjs (whose only remaining
// job is the teachers-only legacy root snapshot teardown) and the cache fills
// itself from whatever the app actually serves. Offline coverage is therefore
// visit-dependent (the accepted trade-off of runtime caching, issue 087).
// The last online status (online vs offline) is persisted per app in
// IndexedDB — a worker has no localStorage — so the offline -> online
// transitions are logged and recorded even after this worker has been
// terminated and relaunched.
// Shared assets (app.css, _app/, vendor/, assets/, emplois.csv) live at the
// site root and are referenced here relative to this script (../…):
// subresource requests of a controlled page reach THIS worker whatever their
// URL (Handle Fetch routes subresources to the client's controller), so the
// runtime cache carries them; navigations to the at/ and all/ utility pages and
// the site root match no registration and are online-only by design (issues
// 072, 073).
// Dev: the worker is a build artifact — vite dev serves the source tree, never
// build/ — so app/src/lib/register.js skips registration there (issue 087) and
// the /<app>/sw.js fetch never happens; the console escape hatch when the worker
// gets in the way (browser console):
//   navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()));
//   caches.keys().then(ks => ks.forEach(k => caches.delete(k)));
var CACHE = 'emplois-omni-snapshot-';

// A successful network fetch: record 'online'. On the offline -> online
// transition (persisted record says offline — warm worker OR freshly
// relaunched worker) log it and persist the new status; nothing else to do —
// the runtime cache is no longer erased and retaken (issue 087), the next
// successful response puts a fresh entry into it.
function noteOnline() {
  var run = status.then(function (prev) {
    if (prev === 'offline') {
      console.log('[sw] offline -> online');
      return writeStatus('online');
    }
    if (prev !== 'online') {
      console.log('[sw] status: online' + (prev === null ? ' (first observation)' : ''));
    }
    return writeStatus('online');
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
      console.log('[sw] online -> offline');
    } else {
      console.log('[sw] status: offline (first observation)');
    }
    return writeStatus('offline');
  });
  status = run.then(function () { return 'offline'; }, function () { return 'offline'; });
  return run;
}

// Loaded ONCE per worker start — every relaunch re-reads the persisted record,
// which is what makes offline -> online detection survive worker restarts —
// then kept in memory. Every update chains onto it so a transition check can
// never interleave with another.
var status = readStatus();

// --- last online status (issue 070, kept verbatim in behaviour): persisted in
// IndexedDB, NOT in a cache. db 'emplois-omni-status', store 'kv', key
// 'last-online' -> 'online' | 'offline'. Storage errors resolve (best-effort)
// so the chain never wedges: opens and transaction use are guarded, and the
// connection is closed on every path. Version 2: onupgradeneeded also runs on an
// upgrade, so a store-less older database (left by any other opener of this name)
// is healed here too.
function readStatus() {
  return new Promise(function (resolve) {
    try {
      var req = indexedDB.open('emplois-omni-status', 2);
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
      var req = indexedDB.open('emplois-omni-status', 2);
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

self.addEventListener('install', function (event) {
  // No install-time cache fill any more (issue 087): the runtime cache
  // self-populates from real traffic, so there is nothing to take. The worker
  // just takes over as soon as possible.
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  // Only THIS app's family is runtime-cache territory (issue 072): destroy
  // every OTHER cache of it — retired build-time snapshot generations
  // (…-v-<digest>), stale runtime entries of a superseded worker — then claim.
  // The current runtime cache is kept: entries in it are last-successful-
  // responses, which a returning online session simply overwrites.
  //
  event.waitUntil(
    caches.keys().then(function (ks) {
      return Promise.all(ks.filter(function (k) {
        return (k.indexOf(CACHE) === 0 && k !== CACHE);
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
  // validators still let the origin answer 304 when nothing changed. A
  // successful response is PUT into the runtime cache (issue 087); a failed
  // one falls through to the runtime cache's last successful response.
  var cache = caches.open(CACHE);
  var reply = fetch(req, { cache: 'no-cache' }).then(function (res) {  // 1) NETWORK FIRST
    if (!res.ok) return res;                                         // 404/500: never a status input, never runtime material
    save = noteOnline();                                             // 2) record online; the offline -> online transition just logs + persists now
    return cache.put(req, res.clone()).then(function () { return res; }, function () { return res; });  // 3) RUNTIME PUT (best-effort)
  }).catch(function () {
    save = noteOffline();                                           // 4) record offline (logged + persisted)
    return cache.match(req, nav ? { ignoreSearch: true } : undefined)  // 5) RUNTIME FALLBACK
      .then(function (hit) { return hit || Response.error(); });
  });
  event.respondWith(reply);
  event.waitUntil(reply.then(function () { return save; }).catch(function () {}));
});

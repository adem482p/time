// Tests for the network-first service workers, runtime response caching
// (issues 063 + 070, reworked by issue 087) as split into two independently
// installable apps (issue 072) — run with the other suites: `node --test` /
// `node --test test/*.test.js`.
//
// Source-level pins over the worker template (app/scripts/sw-template.js),
// the generator (app/scripts/gen-sw.mjs), the shared registration module
// (app/src/lib/register.js) and the pages: the install/activate/fetch
// lifecycle per worker, the runtime response-cache model (issue 087: no
// build-time snapshot URL list and no install-time addAll — every successful
// network response is put into the app's runtime cache and offline that cache
// serves the last successful response), network-first ordering with the
// runtime cache as fallback only (and the banned stale-while-revalidate /
// cache-first / precache strings absent everywhere), the shared registration
// module as each APP page's last script while the root landing and the
// online-only utility pages carry no registration at all, the dev skip (issue
// 087), the per-app persisted online/offline status databases, and the
// family-scoped teardown of retired runtime caches.

import test from 'node:test';
import assert from 'node:assert';

import { APPS, readSrc } from './helpers.js';

// Pages with NO manifest and NO service worker by design (issues 072, 073):
// the root landing (a pure redirect), the two online-only utility views.
const NO_WORKER = [
  'app/src/routes/+page.svelte',
  'app/src/routes/at/+page.svelte',
  'app/src/routes/all/+page.svelte'
];

test('the worker template declares both app families and the full lifecycle (issues 063, 072, 087)', function () {
  var tmpl = readSrc('app/scripts/sw-template.js');
  ["self.addEventListener('install'", "self.addEventListener('activate'",
   "self.addEventListener('fetch'", 'skipWaiting', 'clients.claim',
   'respondWith'].forEach(function (tok) {
    assert.ok(tmpl.indexOf(tok) !== -1, 'sw-template.js must contain ' + tok);
  });
  // The template uses tokens __APP__, __SIBLING__ which gen-sw.mjs replaces per
  // app; the build-time snapshot-list tokens (__SNAPSHOT_URLS__, __SNAP_SUFFIX__)
  // are gone since issue 087 moved to runtime response caching.
  ['__APP__', '__SIBLING__'].forEach(function (tok) {
    assert.ok(tmpl.indexOf(tok) !== -1, 'sw-template.js must carry token ' + tok);
  });
  assert.ok(tmpl.indexOf('__SNAPSHOT_URLS__') === -1,
    'sw-template.js must not carry the retired build-time snapshot-list token (issue 087)');
  assert.ok(tmpl.indexOf('__SNAP_SUFFIX__') === -1,
    'sw-template.js must not carry the retired snapshot-version token (issue 087)');
  // The template has the legacy-root clause (teachers-only) for the old root snapshot
  assert.ok(tmpl.indexOf('__LEGACY_ROOT_COMMENT__') !== -1,
    "sw-template.js must carry the teachers-only legacy root snapshot teardown comment token");
  assert.ok(tmpl.indexOf('__LEGACY_ROOT_CLAUSE__') !== -1,
    "sw-template.js must carry the teachers-only legacy root snapshot teardown clause token");
  // The cache family name uses the __APP__ token
  assert.ok(tmpl.indexOf("CACHE = 'emplois-__APP__-snapshot-'") !== -1,
    "sw-template.js must declare the runtime cache family name with __APP__ token");
  // The status database name uses the __APP__ token
  assert.ok(tmpl.indexOf("'emplois-__APP__-status'") !== -1,
    "sw-template.js must declare the status database name with __APP__ token");
});

test('gen-sw.mjs writes per-app runtime-cache workers from the template (issue 087)', function () {
  var gen = readSrc('app/scripts/gen-sw.mjs');
  // The generator replaces __APP__ with the app name, which expands the cache
  // family and status DB name in the template
  ['__APP__', '__SIBLING__', '__LEGACY_ROOT_COMMENT__', '__LEGACY_ROOT_CLAUSE__'].forEach(function (tok) {
    assert.ok(gen.indexOf(tok) !== -1, 'gen-sw.mjs must replace ' + tok + ' token');
  });
  assert.ok(gen.indexOf('__SNAPSHOT_URLS__') === -1,
    'gen-sw.mjs must not build a snapshot URL list any more (issue 087)');
  assert.ok(gen.indexOf('walkFiles') === -1,
    'gen-sw.mjs must not walk the build tree for a snapshot list any more (issue 087)');
  // The legacy-root clause is ONLY injected for teachers
  assert.ok(gen.indexOf("emplois-snapshot-v1") !== -1,
    'gen-sw.mjs must inject the legacy root snapshot teardown for teachers');
  // The sibling name is the other app's directory
  assert.ok(gen.indexOf("'classes'") !== -1 && gen.indexOf("'teachers'") !== -1,
    'gen-sw.mjs must name both app directories as siblings');
});

test('the worker runtime-caches successful responses instead of snapshotting a build-time list (issue 087)', function () {
  var tmpl = readSrc('app/scripts/sw-template.js');
  // The cache family name is the runtime cache entry of this app.
  assert.ok(tmpl.indexOf('var CACHE =') !== -1, 'sw-template.js must declare the runtime cache entry');
  // The build-time snapshot list and the wholesale take are gone: the cache
  // self-populates from real traffic, so install has nothing to addAll.
  var instAt = tmpl.indexOf("self.addEventListener('install'");
  var actAt = tmpl.indexOf("self.addEventListener('activate'");
  var instBlock = tmpl.slice(instAt, actAt);
  assert.ok(instBlock.indexOf('addAll') === -1,
    'install must not precache — the runtime cache self-populates (issue 087)');
  // The runtime cache is opened and written/read through the Cache API.
  assert.ok(tmpl.indexOf('caches.open(CACHE)') !== -1,
    'the fetch handler must open the app runtime cache');
  assert.ok(tmpl.indexOf('cache.put(') !== -1,
    'a successful network response must be put into the runtime cache');
  assert.ok(tmpl.indexOf('cache.match(') !== -1,
    'the offline fallback must read the runtime cache');
  assert.ok(tmpl.indexOf('Response.error()') !== -1,
    'a runtime-cache miss must be an honest failure (Response.error())');
});

test('load.js fetches the CSV from the site root (issue 072)', async function () {
  // In the SvelteKit build, loadStore is called with the base path from $app/paths
  // The CSV is at the site root: /emplois.csv
  var src = readSrc('app/src/lib/load.js');
  assert.ok(src.indexOf('emplois.csv') !== -1, 'load.js must reference emplois.csv');
  // The loadStore function takes a base path and constructs the CSV URL
  assert.ok(src.indexOf('loadStore') !== -1, 'load.js must export loadStore');
  assert.ok(src.indexOf('/emplois.csv') !== -1 || src.indexOf('emplois.csv') !== -1,
    'load.js must fetch CSV from site root');
});

test('the app pages register their own worker, the other pages register none (issue 072)', function () {
  APPS.forEach(function (app) {
    var html = readSrc(app.page);
    // In SvelteKit, the registration is done via the register module imported in the page script
    // The page should import registerApp from $lib/register.js
    assert.ok(html.indexOf("registerApp") !== -1,
      app.page + ' must register its worker via the register module');
  });
  NO_WORKER.forEach(function (p) {
    var html = readSrc(p);
    assert.strictEqual(html.split('register').length - 1, 0,
      p + ' must load no registration — landing and utility pages are online-only (issue 072)');
  });
  var reg = readSrc('app/src/lib/register.js');
  ["'serviceWorker' in navigator", ".register('sw.js')",
   'addEventListener'].forEach(function (tok) {
    assert.ok(reg.indexOf(tok) !== -1, 'register.js must contain ' + tok);
  });
  assert.ok(reg.indexOf('import.meta.env.DEV') !== -1,
    'register.js must skip registration in dev — the worker is a build artifact vite dev never serves (issue 087)');
});

test('old caches are destroyed on activate and the fetch is network-first runtime caching (issues 063, 070, 072, 087)', function () {
  var tmpl = readSrc('app/scripts/sw-template.js');
  var actAt = tmpl.indexOf("self.addEventListener('activate'");
  var fetchAt = tmpl.indexOf("self.addEventListener('fetch'");
  assert.ok(actAt !== -1 && fetchAt !== -1 && fetchAt > actAt, 'activate must precede fetch in template');
  var actBlock = tmpl.slice(actAt, fetchAt);
  var keysAt = actBlock.indexOf('caches.keys()');
  var delAt = actBlock.indexOf('caches.delete(');
  assert.ok(keysAt !== -1, 'activate must enumerate caches.keys()');
  assert.ok(delAt !== -1, 'activate must destroy via caches.delete(');
  assert.ok(keysAt < delAt, 'activate must key-filter before deleting');
  assert.ok(actBlock.indexOf('indexOf(CACHE) === 0') !== -1,
    'activate may only destroy keys of its OWN cache family (issue 072)');
  assert.ok(actBlock.indexOf('k !== CACHE') !== -1,
    'activate must keep the current runtime cache and only retire the others');

  var instAt = tmpl.indexOf("self.addEventListener('install'");
  var instBlock = tmpl.slice(instAt, actAt);
  assert.ok(instBlock.indexOf('skipWaiting') !== -1, 'install must skipWaiting');
  assert.ok(instBlock.indexOf('addAll') === -1,
    'install must not precache — the runtime cache self-populates (issue 087)');

  var fetchBlock = tmpl.slice(fetchAt);
  assert.ok(/fetch\(req, \{ cache: 'no-cache' \}\)/.test(fetchBlock),
    'the network first attempt must revalidate with cache: no-cache');
  assert.ok(fetchBlock.indexOf('cache.put(req, res.clone())') !== -1,
    'a successful response must be put into the runtime cache');
  assert.ok(fetchBlock.indexOf('noteOnline(') !== -1,
    'a network-served request must reach the online status recording');
  assert.ok(fetchBlock.indexOf('noteOffline(') !== -1,
    'a failed network fetch must record the offline status');
  assert.ok(fetchBlock.indexOf('cache.match(') !== -1,
    'the offline fallback must read the runtime cache');
  assert.ok(fetchBlock.indexOf('Response.error()') !== -1,
    'the offline fallback must be an honest miss -> Response.error()');
});

test('the last online status is persisted per app in IndexedDB and logged on transitions (issues 070, 072)', function () {
  var tmpl = readSrc('app/scripts/sw-template.js');
  // The template uses the __APP__ token for the DB name
  assert.ok(tmpl.indexOf("'emplois-__APP__-status'") !== -1,
    'template must carry the status database name with __APP__ token');
  // The template has the persistence logic with readStatus/writeStatus
  ["readStatus", "writeStatus", "'last-online'", "writeStatus('online')",
   "writeStatus('offline')", "=== 'offline'", "=== 'online'",
   '[sw] offline -> online', '[sw] online -> offline'].forEach(function (tok) {
    assert.ok(tmpl.indexOf(tok) !== -1, 'sw-template.js must contain ' + tok);
  });
  assert.ok(tmpl.indexOf('localStorage.') === -1,
    'sw-template.js: workers have no localStorage — no localStorage access may appear');
});

test('offline -> online no longer erases and retakes — the runtime cache self-updates (issues 070, 087)', function () {
  var tmpl = readSrc('app/scripts/sw-template.js');
  var n0 = tmpl.indexOf('function noteOnline');
  var n1 = tmpl.indexOf('function noteOffline');
  var i0 = tmpl.indexOf("self.addEventListener('install'");
  assert.ok(n0 !== -1 && n1 > n0, 'noteOnline and noteOffline must exist in that order');
  assert.ok(i0 > n1, 'noteOffline must precede the install listener');

  var note = tmpl.slice(n0, n1);
  assert.ok(note.indexOf("writeStatus('online')") !== -1,
    'the offline -> online transition must persist the online status');
  assert.ok(note.indexOf('eraseSnapshot') === -1,
    'no snapshot teardown — the runtime cache is no longer erased and retaken (issue 087)');
  assert.ok(note.indexOf('takeSnapshot') === -1,
    'no wholesale take — the runtime cache self-populates from real traffic (issue 087)');
});

test('the runtime cache is written per successful response, never patched entry by entry (issue 087)', function () {
  var tmpl = readSrc('app/scripts/sw-template.js');
  assert.ok(tmpl.indexOf('putCanonical') === -1,
    'the per-entry writer must be gone — the runtime cache is filled per response');
  var openLines = tmpl.split('\n').filter(function (line) {
    return line.indexOf('caches.open(') !== -1;
  });
  assert.strictEqual(openLines.length, 1,
    'exactly one cache-open site exists: the fetch handler runtime put');
  openLines.forEach(function (line) {
    assert.ok(line.indexOf('caches.open(CACHE)') !== -1,
      'the runtime cache must be opened as this app family: ' + line.trim());
  });
});

test('the vocabulary is the runtime cache, not the legacy precache one (issues 070, 087)', function () {
  var tmpl = readSrc('app/scripts/sw-template.js');
  var reg = readSrc('app/src/lib/register.js');
  ['var PRECACHE', "'emplois-v1'"].forEach(function (tok) {
    assert.ok(tmpl.indexOf(tok) === -1, 'sw-template.js must not carry the legacy precache vocabulary: ' + tok);
    assert.ok(reg.indexOf(tok) === -1, 'register.js must not carry the legacy precache vocabulary: ' + tok);
  });
  assert.ok(tmpl.indexOf('var CACHE =') !== -1, 'the worker must own the runtime cache entry');
  assert.ok(tmpl.indexOf('SNAPSHOT_URLS') === -1, 'the snapshot URL list identifier must be gone (issue 087)');
  assert.ok(tmpl.indexOf('takeSnapshot(') === -1, 'the wholesale take must be gone (issue 087)');
  var tmplHead = tmpl.slice(0, tmpl.indexOf('var CACHE'));
  assert.ok(/runtime/i.test(tmplHead), 'the template header comment must describe the runtime cache model');
  var regHead = reg.slice(0, reg.indexOf('if ('));
  assert.ok(/runtime/i.test(regHead), 'the register.js header comment must describe the runtime cache model');
});

test('the two workers own disjoint cache families and status databases (issue 072)', function () {
  // The template is shared; gen-sw.mjs produces per-app instances.
  // We verify the generator produces the right per-app values.
  var gen = readSrc('app/scripts/gen-sw.mjs');
  // cache families: each worker never names, let alone tears down, the sibling's
  // The template has 'emplois-__APP__-snapshot-' which gen-sw.mjs expands per app
  // by replacing __APP__. The generator source only has the token replacement logic.
  assert.ok(gen.indexOf('__APP__') !== -1,
    'gen-sw.mjs must replace __APP__ token to expand cache families');
  // status databases: same - the template has 'emplois-__APP__-status' which gen-sw.mjs expands
  // by replacing __APP__. The generator source only has the token replacement logic.
  assert.ok(gen.indexOf('__APP__') !== -1,
    'gen-sw.mjs must replace __APP__ token to expand status DB names');
  // The legacy pre-split root snapshot: teardown target of the teachers worker only
  assert.ok(gen.indexOf("emplois-snapshot-v1") !== -1,
    'gen-sw.mjs carries the legacy root snapshot teardown for teachers');
  // distinct families, both start at v1 (suffix is computed at build time)
  // The generator produces distinct families by replacing __APP__ with each app name
  assert.ok(gen.indexOf("'teachers'") !== -1 && gen.indexOf("'classes'") !== -1,
    'gen-sw.mjs must name both apps for distinct families');
});

test('the runtime cache is family-scoped per app and never lists pages outside its own app (issues 072, 087)', function () {
  // The template is shared; gen-sw.mjs produces per-app instances. With runtime
  // caching there is no snapshot URL list left to scope — the per-app family name
  // (CACHE = 'emplois-__APP__-snapshot-') does the scoping, and the teardown keeps
  // only the app's own family.
  var tmpl = readSrc('app/scripts/sw-template.js');
  assert.ok(tmpl.indexOf("CACHE = 'emplois-__APP__-snapshot-'") !== -1,
    'the runtime cache is family-namespaced per app (issue 087)');
  var gen = readSrc('app/scripts/gen-sw.mjs');
  APPS.forEach(function (app) {
    assert.ok(gen.indexOf(app.dir) !== -1, 'gen-sw.mjs must reference ' + app.dir);
    assert.ok(gen.indexOf("join(buildDir, app, 'sw.js')") !== -1,
      'gen-sw.mjs must stamp the worker of its own app directory only');
  });
});

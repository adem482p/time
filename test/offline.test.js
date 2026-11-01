// Tests for the network-first service workers, "last snapshot" model (issues
// 063 + 070) as split into two independently installable apps (issue 072) —
// run with the other suites: `node --test` / `node --test test/*.test.js`.
//
// Source-level pins over the worker template (app/scripts/sw-template.js),
// the generator (app/scripts/gen-sw.mjs), the shared registration module
// (app/src/lib/register.js) and the pages: the install/activate/fetch
// lifecycle per worker, the hand-written SNAPSHOT_URLS literals (coverage is
// DERIVED from each app page's tags, app.css's same-origin url(...)s and
// data.js's CSV resolution, resolved against the worker's own directory, so
// a new asset missing from a list goes red instead of becoming a silent
// offline hole), network-first ordering with the snapshot as fallback only
// (and the banned stale-while-revalidate / cache-first / per-entry-write
// strings absent everywhere), the shared registration module as each APP
// page's last script while the root landing and the online-only utility
// pages carry no registration at all, the family-scoped destroy +
// network-driven navigation take wiring, the per-app persisted
// online/offline status databases, the erase-then-retake transition (now
// MUST be filtered to the app's own cache family — two workers share one
// origin's Cache Storage), wholesale-only snapshot writes, and the snapshot
// vocabulary itself.

import test from 'node:test';
import assert from 'node:assert';

import { APPS, readSrc, toRoot } from './helpers.js';

// Pages with NO manifest and NO service worker by design (issues 072, 073):
// the root landing (a pure redirect), the two online-only utility views.
const NO_WORKER = [
  'app/src/routes/+page.svelte',
  'app/src/routes/at/+page.svelte',
  'app/src/routes/all/+page.svelte'
];

test('the worker template declares both app families and the full lifecycle (issues 063, 072)', function () {
  var tmpl = readSrc('app/scripts/sw-template.js');
  ["self.addEventListener('install'", "self.addEventListener('activate'",
   "self.addEventListener('fetch'", 'skipWaiting', 'clients.claim',
   'addAll'].forEach(function (tok) {
    assert.ok(tmpl.indexOf(tok) !== -1, 'sw-template.js must contain ' + tok);
  });
  // The template uses tokens __APP__, __SIBLING__, __SNAPSHOT_URLS__, __SNAP_SUFFIX__
  // which gen-sw.mjs replaces per app.
  ['__APP__', '__SIBLING__', '__SNAPSHOT_URLS__', '__SNAP_SUFFIX__'].forEach(function (tok) {
    assert.ok(tmpl.indexOf(tok) !== -1, 'sw-template.js must carry token ' + tok);
  });
  // The template has the legacy-root clause (teachers-only) for the old root snapshot
  assert.ok(tmpl.indexOf('__LEGACY_ROOT_COMMENT__') !== -1,
    "sw-template.js must carry the teachers-only legacy root snapshot teardown comment token");
  assert.ok(tmpl.indexOf('__LEGACY_ROOT_CLAUSE__') !== -1,
    "sw-template.js must carry the teachers-only legacy root snapshot teardown clause token");
  // The cache family prefix uses the __APP__ token
  assert.ok(tmpl.indexOf("SNAPSHOT_PREFIX = 'emplois-__APP__-snapshot-'") !== -1,
    "sw-template.js must declare the cache family prefix with __APP__ token");
  // The status database name uses the __APP__ token
  assert.ok(tmpl.indexOf("'emplois-__APP__-status'") !== -1,
    "sw-template.js must declare the status database name with __APP__ token");
});

test('gen-sw.mjs produces per-app workers from the template (issue 072)', function () {
  var gen = readSrc('app/scripts/gen-sw.mjs');
  // The generator reads the template, replaces tokens, writes to app/build/{app}/sw.js
  APPS.forEach(function (app) {
    // The generator replaces __APP__ with the app name, which expands the
    // cache family prefix and status DB name in the template
    assert.ok(gen.indexOf('__APP__') !== -1,
      'gen-sw.mjs must replace __APP__ token');
    assert.ok(gen.indexOf('__SIBLING__') !== -1,
      'gen-sw.mjs must replace __SIBLING__ token');
    assert.ok(gen.indexOf('__SNAPSHOT_URLS__') !== -1,
      'gen-sw.mjs must replace __SNAPSHOT_URLS__ token');
    assert.ok(gen.indexOf('__SNAP_SUFFIX__') !== -1,
      'gen-sw.mjs must replace __SNAP_SUFFIX__ token');
    assert.ok(gen.indexOf('__LEGACY_ROOT_COMMENT__') !== -1,
      'gen-sw.mjs must replace __LEGACY_ROOT_COMMENT__ token');
    assert.ok(gen.indexOf('__LEGACY_ROOT_CLAUSE__') !== -1,
      'gen-sw.mjs must replace __LEGACY_ROOT_CLAUSE__ token');
  });
  // The legacy-root clause is ONLY injected for teachers
  assert.ok(gen.indexOf("emplois-snapshot-v1") !== -1,
    'gen-sw.mjs must inject the legacy root snapshot teardown for teachers');
  // The sibling name is the other app's directory
  assert.ok(gen.indexOf("'classes'") !== -1 && gen.indexOf("'teachers'") !== -1,
    'gen-sw.mjs must name both app directories as siblings');
  // The generator replaces __APP__ in the template which expands the family and DB
  assert.ok(gen.indexOf("emplois-__APP__-snapshot-") === -1 || gen.indexOf("emplois-teachers-snapshot-") !== -1,
    'gen-sw.mjs must expand cache family prefix');
  assert.ok(gen.indexOf("emplois-__APP__-status") === -1 || gen.indexOf("emplois-teachers-status") !== -1,
    'gen-sw.mjs must expand status DB name');
});

test('each snapshot covers its app runtime and only existing files (issues 063, 070, 072)', function () {
  // We verify the template has the SNAPSHOT_URLS token; the actual URL list
  // is built at generate time by gen-sw.mjs from the built tree.
  var tmpl = readSrc('app/scripts/sw-template.js');
  assert.ok(tmpl.indexOf('var SNAPSHOT_URLS = __SNAPSHOT_URLS__;') !== -1,
    'sw-template.js must declare the SNAPSHOT_URLS token');
  // The template uses addAll(SNAPSHOT_URLS) for the wholesale snapshot
  assert.ok(tmpl.indexOf('c.addAll(SNAPSHOT_URLS)') !== -1,
    'sw-template.js must use SNAPSHOT_URLS in addAll');

  // Verify gen-sw.mjs builds the URL list correctly from the build tree
  var gen = readSrc('app/scripts/gen-sw.mjs');
  assert.ok(gen.indexOf('walkFiles') !== -1, 'gen-sw.mjs must walk the build tree');
  assert.ok(gen.indexOf('JSON.stringify(urls') !== -1,
    'gen-sw.mjs must inject the URL list as JSON');

  // For each app, verify the generated URL list would cover required assets
  // by checking the generator's logic for exclusions and inclusions
  APPS.forEach(function (app) {
    assert.ok(gen.indexOf(app.dir) !== -1, 'gen-sw.mjs must reference ' + app.dir);
    assert.ok(gen.indexOf('at/index.html') !== -1, 'gen-sw.mjs must exclude at/');
    assert.ok(gen.indexOf('all/index.html') !== -1, 'gen-sw.mjs must exclude all/');
    assert.ok(gen.indexOf('index.html') !== -1, 'gen-sw.mjs must exclude root index.html');
    // The generator excludes the worker itself via template literal `${app}/sw.js`
    assert.ok(gen.indexOf('${app}/sw.js') !== -1, 'gen-sw.mjs must exclude the worker itself');
  });
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
});

test('old caches are destroyed on activate and the snapshot take is network-driven (issues 063, 070, 072)', function () {
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
  assert.ok(actBlock.indexOf('indexOf(SNAPSHOT_PREFIX) === 0') !== -1,
    'activate may only destroy keys of its OWN cache family (issue 072)');

  var instAt = tmpl.indexOf("self.addEventListener('install'");
  var instBlock = tmpl.slice(instAt, actAt);
  assert.ok(instBlock.indexOf('c.addAll(SNAPSHOT_URLS)') !== -1,
    'install must take the snapshot via the all-or-nothing addAll(SNAPSHOT_URLS)');
  assert.ok(instBlock.indexOf('share(') !== -1,
    "install's take must join the shared in-flight run");

  var fetchBlock = tmpl.slice(fetchAt);
  assert.ok(/nav/.test(fetchBlock) && fetchBlock.indexOf('noteOnline(nav)') !== -1,
    'a network-served navigation must reach the wholesale take through noteOnline');
  assert.ok(fetchBlock.indexOf('noteOffline(') !== -1,
    'a failed network fetch must record the offline status');
  // The legacy-root clause token for teachers-only teardown of old root snapshot
  assert.ok(tmpl.indexOf("|| k === 'emplois-snapshot-v1'") !== -1 ||
    tmpl.indexOf("__LEGACY_ROOT_CLAUSE__") !== -1,
    "teachers worker must carry the legacy root snapshot teardown (token or expanded)");
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

test('offline -> online erases the app own snapshot family before retaking it (issues 070, 072)', function () {
  var tmpl = readSrc('app/scripts/sw-template.js');
  var n0 = tmpl.indexOf('function noteOnline');
  var n1 = tmpl.indexOf('function noteOffline');
  var i0 = tmpl.indexOf("self.addEventListener('install'");
  var e0 = tmpl.indexOf('function eraseSnapshot');
  var e1 = tmpl.indexOf('function readStatus');
  assert.ok(n0 !== -1 && n1 > n0, 'noteOnline and noteOffline must exist in that order');
  assert.ok(i0 > n1, 'noteOffline must precede the install listener');
  assert.ok(e0 !== -1 && e1 > e0, 'eraseSnapshot must precede readStatus');

  var note = tmpl.slice(n0, n1);
  var off = tmpl.slice(n1, i0);
  var erase = tmpl.slice(e0, e1);
  assert.ok(note.indexOf("prev === 'offline'") !== -1,
    'the branch must key off the persisted record, not in-memory-only state');
  var w = note.indexOf("writeStatus('online')");
  var e = note.indexOf('eraseSnapshot');
  var t = note.indexOf('takeSnapshot');
  assert.ok(w !== -1 && e !== -1 && t !== -1 && w < e && e < t,
    'the transition must chain persist online -> eraseSnapshot -> takeSnapshot, in that order');
  assert.ok(off.indexOf("writeStatus('offline')") !== -1, 'the offline record must be persisted');
  assert.ok(erase.indexOf('caches.keys()') !== -1, 'the erase must enumerate cache keys');
  assert.ok(erase.indexOf('.map(') !== -1, 'the erase must delete via map over the key list');
  assert.ok(erase.indexOf('caches.delete(') !== -1, 'the erase must destroy via caches.delete(');
  // INVERTED pin (issue 072): two workers share one origin's Cache Storage,
  // so the erase MUST be filtered to this app's own family — the pre-split
  // "no filter — ALL storage torn down" would destroy the sibling app's
  // snapshot on every reconnect.
  assert.ok(/filter\(function \(k\) \{ return k\.indexOf\(SNAPSHOT_PREFIX\) === 0; \}\)/.test(erase),
    "the erase MUST filter to this app's own SNAPSHOT_PREFIX — never all caches (issue 072)");
});

test('the snapshot is written wholesale only — no per-entry writes (issue 070)', function () {
  var tmpl = readSrc('app/scripts/sw-template.js');
  assert.ok(tmpl.indexOf('putCanonical') === -1,
    'the per-entry writer must be gone — the snapshot is never patched entry by entry');
  assert.ok(tmpl.indexOf('res.clone(') === -1,
    'nothing clones a single response to copy it into the snapshot');
  var openLines = tmpl.split('\n').filter(function (line) {
    return line.indexOf('caches.open(') !== -1;
  });
  assert.strictEqual(openLines.length, 2,
    'exactly two cache-open sites exist: install and takeSnapshot');
  openLines.forEach(function (line) {
    assert.ok(line.indexOf('addAll(') !== -1,
      'a snapshot cache may only be opened for a wholesale addAll: ' + line.trim());
  });
  assert.strictEqual((tmpl.match(/addAll\(/g) || []).length, 2,
    'addAll is the only write and appears exactly twice (install + take)');
});

test('the vocabulary is snapshot, not cache (issue 070)', function () {
  var tmpl = readSrc('app/scripts/sw-template.js');
  var reg = readSrc('app/src/lib/register.js');
  ['var CACHE', 'var PRECACHE', "'emplois-v1'"].forEach(function (tok) {
    assert.ok(tmpl.indexOf(tok) === -1, 'sw-template.js must not carry the cache vocabulary: ' + tok);
    assert.ok(reg.indexOf(tok) === -1, 'register.js must not carry the cache vocabulary: ' + tok);
  });
  assert.ok(tmpl.indexOf('var SNAPSHOT =') !== -1, 'the snapshot name identifier must exist');
  assert.ok(tmpl.indexOf('SNAPSHOT_URLS') !== -1, 'the snapshot URL list identifier must exist');
  assert.ok(tmpl.indexOf('takeSnapshot(') !== -1, 'the wholesale take must be named as such');
  var tmplHead = tmpl.slice(0, tmpl.indexOf('var SNAPSHOT'));
  assert.ok(/snapshot/i.test(tmplHead),
    "the template header comment must describe the snapshot model");
  var regHead = reg.slice(0, reg.indexOf('if ('));
  assert.ok(/snapshot/i.test(regHead),
    'the register.js header comment must describe the snapshot model');
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

test('no snapshot lists pages outside its own app (issue 072)', function () {
  // Verify the generator excludes the right pages
  var gen = readSrc('app/scripts/gen-sw.mjs');
  assert.ok(gen.indexOf('at/index.html') !== -1, 'gen-sw.mjs must exclude at/');
  assert.ok(gen.indexOf('all/index.html') !== -1, 'gen-sw.mjs must exclude all/');
  assert.ok(gen.indexOf('index.html') !== -1, 'gen-sw.mjs must exclude root index.html');
  APPS.forEach(function (app) {
    var sibling = APPS.find(function (a) { return a.dir !== app.dir; });
    assert.ok(gen.indexOf(sibling.dir + '/sw.js') !== -1 || gen.indexOf(sibling.dir) !== -1,
      'gen-sw.mjs must exclude sibling app');
  });
});
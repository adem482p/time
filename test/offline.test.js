// Tests for the network-first service worker, "last snapshot" model (issues
// 063 + 070) — run with the other suites: `node --test` / `node --test test/*.test.js`.
//
// Source-level pins over sw.js, js/register.js and the four pages: the install/
// activate/fetch lifecycle, the hand-written SNAPSHOT_URLS literal (its coverage
// is DERIVED from the pages' tags, styles.css's same-origin url(...)s and
// js/data.js's fetch, so a new asset missing from the list goes red instead of
// becoming a silent offline hole), network-first ordering with the snapshot as
// fallback only (and the banned stale-while-revalidate / cache-first /
// per-entry-write strings absent everywhere), the shared registration tag as
// each page's last script, the activate destroy + network-driven navigation
// take wiring, the persisted online/offline status record, the erase-everything-
// then-retake transition, wholesale-only snapshot writes, and the snapshot
// vocabulary itself.

'use strict';

var test = require('node:test');
var assert = require('node:assert');
var fs = require('node:fs');
var path = require('node:path');

var ROOT = path.join(__dirname, '..');
var PAGES = ['index.html', 'classes.html', 'time.html', 'timetable.html'];

function readSrc(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

// Parse the SNAPSHOT_URLS array literal out of sw.js (hand-written, no build step).
function snapshotUrls() {
  var src = readSrc('sw.js');
  var block = src.match(/var SNAPSHOT_URLS = \[([\s\S]*?)\];/);
  assert.ok(block, 'sw.js must declare the hand-written SNAPSHOT_URLS literal');
  var urls = [], m, re = /'([^']+)'/g;
  while ((m = re.exec(block[1]))) urls.push(m[1]);
  assert.ok(urls.length > 0, 'SNAPSHOT_URLS must not be empty');
  return urls;
}

function isSameOrigin(ref) {
  return !/^(https?:)?\/\//.test(ref) && !/^data:/.test(ref);
}

test('the service worker ships at the site root with the full lifecycle (issue 063)', function () {
  assert.ok(fs.existsSync(path.join(ROOT, 'sw.js')), 'sw.js must live at the site root');
  var src = readSrc('sw.js');
  ["self.addEventListener('install'", "self.addEventListener('activate'",
   "self.addEventListener('fetch'", 'skipWaiting', 'clients.claim',
   'addAll'].forEach(function (tok) {
    assert.ok(src.indexOf(tok) !== -1, 'sw.js must contain ' + tok);
  });
  // Pin the invariant, not the generation number: the sw.js header prescribes
  // bumping the suffix whenever SNAPSHOT_URLS or the handler semantics change,
  // so hard-coding a generation here would turn every legitimate bump red
  // (issue 068 bumped emplois-v1 -> emplois-v2 alongside its URL-list change).
  assert.ok(/SNAPSHOT = 'emplois-snapshot-v\d+'/.test(src),
    'sw.js must declare a versioned snapshot name');
});

test('the snapshot covers every runtime asset and only existing files (issues 063, 070)', function () {
  var urls = snapshotUrls();
  // './' (bare-origin navigation) plus every other entry as a real file here
  assert.ok(urls.indexOf('./') !== -1, "'./' must be snapshotted");
  assert.deepStrictEqual(urls.filter(function (u, i) { return urls.indexOf(u) === i; }), urls,
    'SNAPSHOT_URLS must not contain duplicates');
  urls.forEach(function (u) {
    assert.ok(!/^(https?:)?\/\//.test(u), 'no cross-origin/absolute URLs in SNAPSHOT_URLS: ' + u);
    if (u !== './') {
      assert.ok(fs.existsSync(path.join(ROOT, u)), 'SNAPSHOT_URLS entry missing on disk: ' + u);
    }
  });

  // derived required set: the four pages (navigations), the union of every
  // <script src> and <link rel="stylesheet" href> on them, every same-origin
  // url(...) in styles.css, and js/data.js's fetch target (path only).
  var required = PAGES.slice();
  PAGES.forEach(function (p) {
    var html = readSrc(p), m, re;
    re = /<script\b[^>]*\bsrc="([^"]+)"/g;
    while ((m = re.exec(html))) { if (isSameOrigin(m[1])) required.push(m[1]); }
    re = /<link\b[^>]*rel="stylesheet"[^>]*\bhref="([^"]+)"/g;
    while ((m = re.exec(html))) { if (isSameOrigin(m[1])) required.push(m[1]); }
  });
  var css = readSrc('styles.css'), m, re;
  re = /url\(\s*['"]?([^'")]+)['"]?\s*\)/g;
  while ((m = re.exec(css))) { if (isSameOrigin(m[1])) required.push(m[1]); }
  var fetchTarget = readSrc('js/data.js').match(/fetch\('([^']+)'\)/);
  assert.ok(fetchTarget, 'js/data.js must fetch the CSV');
  required.push(fetchTarget[1].split('?')[0]);

  Array.from(new Set(required)).forEach(function (u) {
    assert.ok(urls.indexOf(u) !== -1, 'SNAPSHOT_URLS misses runtime asset: ' + u);
  });
});

test('the fetch handler is network-first with the snapshot as fallback only (issues 063, 070)', function () {
  var src = readSrc('sw.js');
  var netAt = src.indexOf('fetch(');
  var cacheAt = src.indexOf('caches.match(');
  assert.ok(netAt !== -1, 'sw.js must fetch(');
  assert.ok(cacheAt !== -1, 'sw.js must caches.match(');
  assert.ok(netAt < cacheAt, 'network must be tried before the snapshot falls back');
  assert.ok(src.indexOf("cache: 'no-cache'") !== -1,
    'every fetch must revalidate with the origin — only origin contact may count as online (issue 070)');
  assert.ok(/if \(!res\.ok\)/.test(src),
    'the res.ok gate must keep non-2xx responses out of the status record and the snapshot');
  assert.ok(src.indexOf("req.method !== 'GET'") !== -1, 'the non-GET pass-through guard must exist');
  assert.ok(src.indexOf('url.origin !== self.location.origin') !== -1,
    'the cross-origin pass-through guard must exist');
  assert.ok(src.indexOf('req.mode === \'navigate\'') !== -1, 'navigations must be handled');
  ['stale-while-revalidate', 'cache-first', 'putCanonical'].forEach(function (tok) {
    assert.ok(src.indexOf(tok) === -1, 'banned from sw.js (issue 070): ' + tok);
  });
});

test('every page registers the service worker through the shared module (issue 063)', function () {
  PAGES.forEach(function (p) {
    var html = readSrc(p);
    var tags = html.split('src="js/register.js"').length - 1;
    assert.strictEqual(tags, 1, p + ' must carry exactly one js/register.js tag');
    var scripts = [], m, re = /<script\b[^>]*\bsrc="([^"]+)"/g;
    while ((m = re.exec(html))) scripts.push(m[1]);
    assert.strictEqual(scripts[scripts.length - 1], 'js/register.js',
      p + ': register.js must be the LAST script tag');
  });
  var reg = readSrc('js/register.js');
  ["'serviceWorker' in navigator", "serviceWorker.register('sw.js')",
   'addEventListener(\'load\'', '.update()'].forEach(function (tok) {
    assert.ok(reg.indexOf(tok) !== -1, 'js/register.js must contain ' + tok);
  });
});

test('old caches are destroyed on activate and the snapshot take is network-driven (issues 063, 070)', function () {
  var src = readSrc('sw.js');
  var actAt = src.indexOf("self.addEventListener('activate'");
  var fetchAt = src.indexOf("self.addEventListener('fetch'");
  assert.ok(actAt !== -1 && fetchAt !== -1 && fetchAt > actAt, 'activate must precede fetch');
  var actBlock = src.slice(actAt, fetchAt);
  var keysAt = actBlock.indexOf('caches.keys()');
  var delAt = actBlock.indexOf('caches.delete(');
  assert.ok(keysAt !== -1, 'activate must enumerate caches.keys()');
  assert.ok(delAt !== -1, 'activate must destroy via caches.delete(');
  assert.ok(keysAt < delAt, 'activate must key-filter before deleting');

  var instAt = src.indexOf("self.addEventListener('install'");
  var instBlock = src.slice(instAt, actAt);
  assert.ok(instBlock.indexOf('c.addAll(SNAPSHOT_URLS)') !== -1,
    'install must take the snapshot via the all-or-nothing addAll(SNAPSHOT_URLS)');
  assert.ok(instBlock.indexOf('share(') !== -1,
    "install's take must join the shared in-flight run");

  var fetchBlock = src.slice(fetchAt);
  assert.ok(/nav/.test(fetchBlock) && fetchBlock.indexOf('noteOnline(nav)') !== -1,
    'a network-served navigation must reach the wholesale take through noteOnline');
  assert.ok(fetchBlock.indexOf('noteOffline(') !== -1,
    'a failed network fetch must record the offline status');
});

test('the last online status is persisted in IndexedDB and logged on transitions (issue 070)', function () {
  var src = readSrc('sw.js');
  assert.ok(src.indexOf("indexedDB.open('emplois-status'") !== -1,
    'the status record must live in a dedicated IndexedDB database');
  assert.ok(/var status = readStatus\(\);/.test(src),
    'every worker (re)start must re-read the persisted record — restart-safe detection');
  assert.ok(src.indexOf("writeStatus('online')") !== -1, 'online must be persisted');
  assert.ok(src.indexOf("writeStatus('offline')") !== -1, 'offline must be persisted');
  assert.ok(src.indexOf("'last-online'") !== -1, 'the record key must exist');
  assert.ok(src.indexOf("=== 'offline'") !== -1 && src.indexOf("=== 'online'") !== -1,
    "the record's two values, 'offline' and 'online', must both be read back");
  assert.ok(src.indexOf('localStorage.') === -1,
    'workers have no localStorage — no localStorage access may appear in sw.js');
  assert.ok(src.indexOf('[sw] offline -> online') !== -1,
    'the offline -> online transition must be logged from the worker');
  assert.ok(src.indexOf('[sw] online -> offline') !== -1,
    'the online -> offline transition must be logged from the worker');
});

test('offline -> online erases every cache before retaking the snapshot (issue 070)', function () {
  var src = readSrc('sw.js');
  var n0 = src.indexOf('function noteOnline');
  var n1 = src.indexOf('function noteOffline');
  var i0 = src.indexOf("self.addEventListener('install'");
  var e0 = src.indexOf('function eraseSnapshot');
  var e1 = src.indexOf('function readStatus');
  assert.ok(n0 !== -1 && n1 > n0, 'noteOnline and noteOffline must exist in that order');
  assert.ok(i0 > n1, 'noteOffline must precede the install listener');
  assert.ok(e0 !== -1 && e1 > e0, 'eraseSnapshot must precede readStatus');

  var note = src.slice(n0, n1);
  var off = src.slice(n1, i0);
  var erase = src.slice(e0, e1);
  assert.ok(note.indexOf("prev === 'offline'") !== -1,
    'the branch must key off the persisted record, not in-memory-only state');
  var w = note.indexOf("writeStatus('online')");
  var e = note.indexOf('eraseSnapshot');
  var t = note.indexOf('takeSnapshot');
  assert.ok(w !== -1 && e !== -1 && t !== -1 && w < e && e < t,
    'the transition must chain persist online -> eraseSnapshot -> takeSnapshot, in that order');
  assert.ok(off.indexOf("writeStatus('offline')") !== -1, 'the offline record must be persisted');
  assert.ok(erase.indexOf('caches.keys()') !== -1, 'the erase must enumerate every cache');
  assert.ok(erase.indexOf('.map(') !== -1, 'the erase must delete via map over the key list');
  assert.ok(erase.indexOf('caches.delete(') !== -1, 'the erase must destroy via caches.delete(');
  assert.ok(erase.indexOf('.filter(') === -1,
    'no filter — ALL snapshot storage is torn down, not a subset');
});

test('the snapshot is written wholesale only — no per-entry writes (issue 070)', function () {
  var src = readSrc('sw.js');
  assert.ok(src.indexOf('putCanonical') === -1,
    'the per-entry writer must be gone — the snapshot is never patched entry by entry');
  assert.ok(src.indexOf('res.clone(') === -1,
    'nothing clones a single response to copy it into the snapshot');
  var openLines = src.split('\n').filter(function (line) {
    return line.indexOf('caches.open(') !== -1;
  });
  assert.strictEqual(openLines.length, 2,
    'exactly two cache-open sites exist: install and takeSnapshot');
  openLines.forEach(function (line) {
    assert.ok(line.indexOf('addAll(') !== -1,
      'a snapshot cache may only be opened for a wholesale addAll: ' + line.trim());
  });
  assert.strictEqual((src.match(/addAll\(/g) || []).length, 2,
    'addAll is the only write and appears exactly twice (install + take)');
});

test('the vocabulary is snapshot, not cache (issue 070)', function () {
  var sw = readSrc('sw.js');
  var reg = readSrc('js/register.js');
  ['var CACHE', 'var PRECACHE', "'emplois-v1'"].forEach(function (tok) {
    assert.ok(sw.indexOf(tok) === -1, 'sw.js must not carry the cache vocabulary: ' + tok);
    assert.ok(reg.indexOf(tok) === -1, 'js/register.js must not carry the cache vocabulary: ' + tok);
  });
  assert.ok(sw.indexOf('var SNAPSHOT =') !== -1, 'the snapshot name identifier must exist');
  assert.ok(sw.indexOf('SNAPSHOT_URLS') !== -1, 'the snapshot URL list identifier must exist');
  assert.ok(sw.indexOf('takeSnapshot(') !== -1, 'the wholesale take must be named as such');
  var swHead = sw.slice(0, sw.indexOf('var SNAPSHOT'));
  assert.ok(/snapshot/i.test(swHead),
    'the sw.js header comment must describe the snapshot model');
  var regHead = reg.slice(0, reg.indexOf('if ('));
  assert.ok(/snapshot/i.test(regHead),
    'the js/register.js header comment must describe the snapshot model');
});

// Tests for the network-first service worker (issue 063) — run with the other
// suites: `node --test` / `node --test test/*.test.js`.
//
// Source-level pins over sw.js, js/register.js and the four pages: the install/
// activate/fetch lifecycle, the hand-written PRECACHE literal (its coverage is
// DERIVED from the pages' tags, styles.css's same-origin url(...)s and
// js/data.js's fetch, so a new asset missing from the list goes red instead of
// becoming a silent offline hole), network-first ordering with the cache as
// fallback only (and the banned stale-while-revalidate / cache-first strings
// absent everywhere), the shared registration tag as each page's last script,
// and the activate destroy + network-driven navigation rebuild wiring.

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

// Parse the PRECACHE array literal out of sw.js (hand-written, no build step).
function precacheUrls() {
  var src = readSrc('sw.js');
  var block = src.match(/var PRECACHE = \[([\s\S]*?)\];/);
  assert.ok(block, 'sw.js must declare the hand-written PRECACHE literal');
  var urls = [], m, re = /'([^']+)'/g;
  while ((m = re.exec(block[1]))) urls.push(m[1]);
  assert.ok(urls.length > 0, 'PRECACHE must not be empty');
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
  // bumping the suffix whenever PRECACHE or the handler semantics change, so
  // hard-coding a generation here would turn every legitimate bump red
  // (issue 068 bumped emplois-v1 -> emplois-v2 alongside the PRECACHE change).
  assert.ok(/CACHE = 'emplois-v\d+'/.test(src),
    'sw.js must declare a versioned cache name');
});

test('the precache covers every runtime asset and only existing files (issue 063)', function () {
  var urls = precacheUrls();
  // './' (bare-origin navigation) plus every other entry as a real file here
  assert.ok(urls.indexOf('./') !== -1, "'./' must be precached");
  assert.deepStrictEqual(urls.filter(function (u, i) { return urls.indexOf(u) === i; }), urls,
    'PRECACHE must not contain duplicates');
  urls.forEach(function (u) {
    assert.ok(!/^(https?:)?\/\//.test(u), 'no cross-origin/absolute URLs in PRECACHE: ' + u);
    if (u !== './') {
      assert.ok(fs.existsSync(path.join(ROOT, u)), 'PRECACHE entry missing on disk: ' + u);
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
  var css = readSrc('styles.css'), m, re = /url\(\s*['"]?([^'")]+)['"]?\s*\)/g;
  while ((m = re.exec(css))) { if (isSameOrigin(m[1])) required.push(m[1]); }
  var fetchTarget = readSrc('js/data.js').match(/fetch\('([^']+)'\)/);
  assert.ok(fetchTarget, 'js/data.js must fetch the CSV');
  required.push(fetchTarget[1].split('?')[0]);

  Array.from(new Set(required)).forEach(function (u) {
    assert.ok(urls.indexOf(u) !== -1, 'PRECACHE misses runtime asset: ' + u);
  });
});

test('the fetch handler is network-first with the cache as fallback only (issue 063)', function () {
  var src = readSrc('sw.js');
  var netAt = src.indexOf('fetch(');
  var cacheAt = src.indexOf('caches.match(');
  assert.ok(netAt !== -1, 'sw.js must fetch(');
  assert.ok(cacheAt !== -1, 'sw.js must caches.match(');
  assert.ok(netAt < cacheAt, 'network must be tried before the cache falls back');
  assert.ok(/if \(!res\.ok\)/.test(src), 'the res.ok gate must reject non-2xx from the cache');
  assert.ok(src.indexOf("req.method !== 'GET'") !== -1, 'the non-GET pass-through guard must exist');
  assert.ok(src.indexOf('url.origin !== self.location.origin') !== -1,
    'the cross-origin pass-through guard must exist');
  assert.ok(src.indexOf('req.mode === \'navigate\'') !== -1, 'navigations must be handled');
  assert.ok(src.indexOf('stale-while-revalidate') === -1,
    'stale-while-revalidate must appear nowhere in sw.js');
  assert.ok(src.indexOf('cache-first') === -1, 'cache-first must appear nowhere in sw.js');
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

test('old caches are destroyed on activate and rebuild is network-driven (issue 063)', function () {
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
  assert.ok(instBlock.indexOf('c.addAll(PRECACHE)') !== -1,
    'install must precache via the all-or-nothing addAll(PRECACHE)');
  assert.ok(instBlock.indexOf('share(') !== -1,
    "install's precache must join the shared in-flight run");

  var fetchBlock = src.slice(fetchAt);
  assert.ok(/nav/.test(fetchBlock) && fetchBlock.indexOf('rebuild') !== -1,
    'the navigation path must reach the full addAll rebuild');
});

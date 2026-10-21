// Tests for the network-first service workers, "last snapshot" model (issues
// 063 + 070) as split into two independently installable apps (issue 072) —
// run with the other suites: `node --test` / `node --test test/*.test.js`.
//
// Source-level pins over teachers/sw.js, classes/sw.js, js/register.js and the
// pages: the install/activate/fetch lifecycle per worker, the hand-written
// SNAPSHOT_URLS literals (coverage is DERIVED from each app page's tags,
// styles.css's same-origin url(...)s and js/data.js's CSV resolution, resolved
// against the worker's own directory, so a new asset missing from a list goes
// red instead of becoming a silent offline hole), network-first ordering with
// the snapshot as fallback only (and the banned stale-while-revalidate /
// cache-first / per-entry-write strings absent everywhere), the shared
// registration module as each APP page's last script while the root landing and
// the online-only utility pages carry no registration at all, the
// family-scoped destroy + network-driven navigation take wiring, the per-app
// persisted online/offline status databases, the erase-then-retake transition
// (now MUST be filtered to the app's own cache family — two workers share one
// origin's Cache Storage), wholesale-only snapshot writes, and the snapshot
// vocabulary itself.

'use strict';

var test = require('node:test');
var assert = require('node:assert');
var fs = require('node:fs');
var path = require('node:path');
var vm = require('node:vm');

var ROOT = path.join(__dirname, '..');

// The two independently installable apps (issue 072): each page registers the
// worker of its own directory, each worker owns its own cache family + status DB.
var APPS = [
  { name: 'teachers', dir: 'teachers', page: 'teachers/index.html', sw: 'teachers/sw.js',
    family: 'emplois-teachers-snapshot-', db: 'emplois-teachers-status',
    pageScript: '../js/teachers.js' },
  { name: 'classes', dir: 'classes', page: 'classes/index.html', sw: 'classes/sw.js',
    family: 'emplois-classes-snapshot-', db: 'emplois-classes-status',
    pageScript: '../js/classes.js' }
];
// Pages with NO manifest and NO service worker by design (issue 072): the root
// landing, the two online-only utility views and the redirect stub.
var NO_WORKER = ['index.html', 'time.html', 'timetable.html', 'classes.html'];

function readSrc(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

// Parse the SNAPSHOT_URLS array literal out of a worker (hand-written, no build step).
function snapshotUrls(swRel) {
  var src = readSrc(swRel);
  var block = src.match(/var SNAPSHOT_URLS = \[([\s\S]*?)\];/);
  assert.ok(block, swRel + ' must declare the hand-written SNAPSHOT_URLS literal');
  var urls = [], m, re = /'([^']+)'/g;
  while ((m = re.exec(block[1]))) urls.push(m[1]);
  assert.ok(urls.length > 0, swRel + ': SNAPSHOT_URLS must not be empty');
  return urls;
}

function isSameOrigin(ref) {
  return !/^(https?:)?\/\//.test(ref) && !/^data:/.test(ref);
}

// Resolve a page- or worker-relative URL to a site-root-relative path
// ('../styles.css' from 'classes' -> 'styles.css', 'index.html' from 'teachers'
// -> 'teachers/index.html'). Both sides of every comparison below go through
// this, so coverage is checked in one canonical coordinate system.
function toRoot(rel, fromDir) {
  return path.posix.normalize(path.posix.join(fromDir, rel));
}

test('each app ships its worker in its own directory with the full lifecycle (issues 063, 072)', function () {
  assert.ok(!fs.existsSync(path.join(ROOT, 'sw.js')),
    'the root worker is gone — each app owns the worker of its directory (issue 072)');
  APPS.forEach(function (app) {
    assert.ok(fs.existsSync(path.join(ROOT, app.sw)), app.sw + ' must exist');
    var src = readSrc(app.sw);
    ["self.addEventListener('install'", "self.addEventListener('activate'",
     "self.addEventListener('fetch'", 'skipWaiting', 'clients.claim',
     'addAll'].forEach(function (tok) {
      assert.ok(src.indexOf(tok) !== -1, app.sw + ' must contain ' + tok);
    });
    // Pin the family name (the app's identity in Cache Storage) and the
    // invariant, not the generation number: bumping 'v1' -> 'v2' stays green,
    // renaming the family does not (issue 068 bumped generations alongside
    // URL-list changes; issue 072 established per-app families).
    var fam = src.match(/SNAPSHOT_PREFIX = '([^']+)'/);
    assert.ok(fam, app.sw + ' must declare its cache family prefix');
    assert.strictEqual(fam[1], app.family, app.sw + ' declares the wrong cache family');
    assert.ok(/var SNAPSHOT = SNAPSHOT_PREFIX \+ 'v\d+'/.test(src),
      app.sw + ' must derive a versioned snapshot name from its family prefix');
  });
});

test('each snapshot covers its app runtime and only existing files (issues 063, 070, 072)', function () {
  APPS.forEach(function (app) {
    var urls = snapshotUrls(app.sw);
    var pageDir = path.posix.dirname(app.page);
    // './' (bare app-entry navigation) plus every other entry as a real file,
    // resolved against the WORKER's directory.
    assert.ok(urls.indexOf('./') !== -1, app.sw + ": './' must be snapshotted");
    assert.deepStrictEqual(urls.filter(function (u, i) { return urls.indexOf(u) === i; }), urls,
      app.sw + ': SNAPSHOT_URLS must not contain duplicates');
    urls.forEach(function (u) {
      assert.ok(!/^(https?:)?\/\//.test(u),
        app.sw + ': no cross-origin/absolute URLs in SNAPSHOT_URLS: ' + u);
      assert.ok(fs.existsSync(path.join(ROOT, app.dir, u)),
        app.sw + ': SNAPSHOT_URLS entry missing on disk: ' + u);
    });

    // derived required set, normalized to site-root paths: the app page itself
    // (bare directory + file), the union of every <script src>, stylesheet,
    // manifest and icon link on it (resolved against the PAGE's directory),
    // every same-origin url(...) in styles.css (already site-root relative —
    // styles.css lives at the root), and js/data.js's CSV target (resolved
    // against js/, where the script lives).
    var required = [app.dir + '/', toRoot(path.posix.basename(app.page), pageDir)];
    var html = readSrc(app.page), m, re;
    re = /<script\b[^>]*\bsrc="([^"]+)"/g;
    while ((m = re.exec(html))) { if (isSameOrigin(m[1])) required.push(toRoot(m[1], pageDir)); }
    re = /<link\b[^>]*(?:rel="stylesheet"|rel="manifest"|rel="icon"|rel="apple-touch-icon")[^>]*\bhref="([^"]+)"/g;
    while ((m = re.exec(html))) { if (isSameOrigin(m[1])) required.push(toRoot(m[1], pageDir)); }
    var css = readSrc('styles.css');
    re = /url\(\s*['"]?([^'")]+)['"]?\s*\)/g;
    while ((m = re.exec(css))) { if (isSameOrigin(m[1])) required.push(toRoot(m[1], '.')); }
    var csvRel = readSrc('js/data.js').match(/new URL\('([^']*emplois\.csv)', SCRIPT_URL\)/);
    assert.ok(csvRel, "js/data.js must resolve the CSV against its own script URL (issue 072)");
    required.push(toRoot(csvRel[1], 'js'));

    var asRoot = urls.map(function (u) {
      return u === './' ? app.dir + '/' : toRoot(u, app.dir);
    });
    Array.from(new Set(required)).forEach(function (u) {
      assert.ok(asRoot.indexOf(u) !== -1,
        app.sw + ': SNAPSHOT_URLS misses runtime asset: ' + u);
    });
  });
});

test('js/data.js fetches the CSV from the site root in a page and in a sandbox (issue 072)', async function () {
  function boot(withDocument) {
    var requested = [];
    var sandbox = {
      fetch: function (url) {
        requested.push(url);
        return Promise.resolve({ ok: true, text: function () { return Promise.resolve('day,time\n'); } });
      }
    };
    if (withDocument) sandbox.document = { currentScript: { src: 'http://localhost/time/js/data.js' } };
    // no URL global unless the resolver needs it (sandbox path never does)
    sandbox.URL = URL;
    vm.createContext(sandbox);
    vm.runInContext(readSrc('js/data.js'), sandbox, { filename: 'js/data.js' });
    sandbox.TT.data.loadStore();
    return requested;
  }
  var inPage = boot(true);
  assert.strictEqual(inPage.length, 1, 'loadStore must fetch exactly once');
  assert.strictEqual(inPage[0], 'http://localhost/time/emplois.csv',
    "the CSV resolves against data.js's own URL: ../ from js/ lands on the site root (works from teachers/ and classes/ too)");
  var sandbox = boot(false);
  assert.deepStrictEqual(sandbox, ['emplois.csv'],
    'without document.currentScript (vm sandboxes) the fetch stays document-relative');
});

test('the app pages register their own worker, the other pages register none (issue 072)', function () {
  APPS.forEach(function (app) {
    var html = readSrc(app.page);
    var scripts = [], m, re = /<script\b[^>]*\bsrc="([^"]+)"/g;
    while ((m = re.exec(html))) scripts.push(m[1]);
    var regs = scripts.filter(function (s) { return /(^|\/)js\/register\.js$/.test(s); });
    assert.strictEqual(regs.length, 1, app.page + ' must carry exactly one js/register.js tag');
    assert.strictEqual(scripts[scripts.length - 1], regs[0],
      app.page + ': register.js must be the LAST script tag');
    assert.ok(/(^|\/)js\/register\.js$/.test(scripts[scripts.length - 1]),
      app.page + ': register.js must be last');
  });
  NO_WORKER.forEach(function (p) {
    var html = readSrc(p);
    assert.strictEqual(html.split('register.js').length - 1, 0,
      p + ' must load no js/register.js — landing and utility pages are online-only (issue 072)');
  });
  var reg = readSrc('js/register.js');
  ["'serviceWorker' in navigator", "serviceWorker.register('sw.js')",
   'addEventListener(\'load\'', '.update()'].forEach(function (tok) {
    assert.ok(reg.indexOf(tok) !== -1, 'js/register.js must contain ' + tok);
  });
  assert.ok(/serviceWorker\.register\('sw\.js'\)/.test(reg),
    "the registration stays the relative 'sw.js' — document-relative, one line for both apps (issue 072)");
});

test('old caches are destroyed on activate and the snapshot take is network-driven (issues 063, 070, 072)', function () {
  APPS.forEach(function (app) {
    var src = readSrc(app.sw);
    var actAt = src.indexOf("self.addEventListener('activate'");
    var fetchAt = src.indexOf("self.addEventListener('fetch'");
    assert.ok(actAt !== -1 && fetchAt !== -1 && fetchAt > actAt, app.sw + ': activate must precede fetch');
    var actBlock = src.slice(actAt, fetchAt);
    var keysAt = actBlock.indexOf('caches.keys()');
    var delAt = actBlock.indexOf('caches.delete(');
    assert.ok(keysAt !== -1, app.sw + ': activate must enumerate caches.keys()');
    assert.ok(delAt !== -1, app.sw + ': activate must destroy via caches.delete(');
    assert.ok(keysAt < delAt, app.sw + ': activate must key-filter before deleting');
    assert.ok(actBlock.indexOf('indexOf(SNAPSHOT_PREFIX) === 0') !== -1,
      app.sw + ': activate may only destroy keys of its OWN cache family (issue 072: one origin, two workers)');

    var instAt = src.indexOf("self.addEventListener('install'");
    var instBlock = src.slice(instAt, actAt);
    assert.ok(instBlock.indexOf('c.addAll(SNAPSHOT_URLS)') !== -1,
      app.sw + ': install must take the snapshot via the all-or-nothing addAll(SNAPSHOT_URLS)');
    assert.ok(instBlock.indexOf('share(') !== -1,
      app.sw + ": install's take must join the shared in-flight run");

    var fetchBlock = src.slice(fetchAt);
    assert.ok(/nav/.test(fetchBlock) && fetchBlock.indexOf('noteOnline(nav)') !== -1,
      app.sw + ': a network-served navigation must reach the wholesale take through noteOnline');
    assert.ok(fetchBlock.indexOf('noteOffline(') !== -1,
      app.sw + ': a failed network fetch must record the offline status');
  });
  // one-time upgrade cleanup: the legacy pre-split root snapshot dies with the
  // teachers worker — no root worker survives to clean it (issue 072).
  var t = readSrc('teachers/sw.js');
  assert.ok(t.indexOf("|| k === 'emplois-snapshot-v1'") !== -1,
    "the teachers worker's activate must delete the legacy root snapshot by exact name");
  var c = readSrc('classes/sw.js');
  assert.strictEqual(c.indexOf('emplois-snapshot-v1'), -1,
    'the classes worker never knew the legacy root snapshot');
});

test('the last online status is persisted per app in IndexedDB and logged on transitions (issues 070, 072)', function () {
  APPS.forEach(function (app) {
    var src = readSrc(app.sw);
    var opens = src.split("indexedDB.open('" + app.db + "'").length - 1;
    assert.strictEqual(opens, 2,
      app.sw + ': readStatus and writeStatus must both open the app own database ' + app.db);
    assert.strictEqual(src.indexOf("indexedDB.open('emplois-status'"), -1,
      app.sw + ": the pre-split shared status database name must not survive (issue 072)");
    assert.ok(/var status = readStatus\(\);/.test(src),
      app.sw + ': every worker (re)start must re-read the persisted record — restart-safe detection');
    assert.ok(src.indexOf("writeStatus('online')") !== -1, app.sw + ': online must be persisted');
    assert.ok(src.indexOf("writeStatus('offline')") !== -1, app.sw + ': offline must be persisted');
    assert.ok(src.indexOf("'last-online'") !== -1, app.sw + ': the record key must exist');
    assert.ok(src.indexOf("=== 'offline'") !== -1 && src.indexOf("=== 'online'") !== -1,
      app.sw + ": the record's two values, 'offline' and 'online', must both be read back");
    assert.ok(src.indexOf('localStorage.') === -1,
      app.sw + ': workers have no localStorage — no localStorage access may appear');
    assert.ok(src.indexOf('[sw] offline -> online') !== -1,
      app.sw + ': the offline -> online transition must be logged from the worker');
    assert.ok(src.indexOf('[sw] online -> offline') !== -1,
      app.sw + ': the online -> offline transition must be logged from the worker');
  });
});

test('offline -> online erases the app own snapshot family before retaking it (issues 070, 072)', function () {
  APPS.forEach(function (app) {
    var src = readSrc(app.sw);
    var n0 = src.indexOf('function noteOnline');
    var n1 = src.indexOf('function noteOffline');
    var i0 = src.indexOf("self.addEventListener('install'");
    var e0 = src.indexOf('function eraseSnapshot');
    var e1 = src.indexOf('function readStatus');
    assert.ok(n0 !== -1 && n1 > n0, app.sw + ': noteOnline and noteOffline must exist in that order');
    assert.ok(i0 > n1, app.sw + ': noteOffline must precede the install listener');
    assert.ok(e0 !== -1 && e1 > e0, app.sw + ': eraseSnapshot must precede readStatus');

    var note = src.slice(n0, n1);
    var off = src.slice(n1, i0);
    var erase = src.slice(e0, e1);
    assert.ok(note.indexOf("prev === 'offline'") !== -1,
      app.sw + ': the branch must key off the persisted record, not in-memory-only state');
    var w = note.indexOf("writeStatus('online')");
    var e = note.indexOf('eraseSnapshot');
    var t = note.indexOf('takeSnapshot');
    assert.ok(w !== -1 && e !== -1 && t !== -1 && w < e && e < t,
      app.sw + ': the transition must chain persist online -> eraseSnapshot -> takeSnapshot, in that order');
    assert.ok(off.indexOf("writeStatus('offline')") !== -1, app.sw + ': the offline record must be persisted');
    assert.ok(erase.indexOf('caches.keys()') !== -1, app.sw + ': the erase must enumerate cache keys');
    assert.ok(erase.indexOf('.map(') !== -1, app.sw + ': the erase must delete via map over the key list');
    assert.ok(erase.indexOf('caches.delete(') !== -1, app.sw + ': the erase must destroy via caches.delete(');
    // INVERTED pin (issue 072): two workers share one origin's Cache Storage,
    // so the erase MUST be filtered to this app's own family — the pre-split
    // "no filter — ALL storage torn down" would destroy the sibling app's
    // snapshot on every reconnect.
    assert.ok(/filter\(function \(k\) \{ return k\.indexOf\(SNAPSHOT_PREFIX\) === 0; \}\)/.test(erase),
      app.sw + ": the erase MUST filter to this app's own SNAPSHOT_PREFIX — never all caches (issue 072)");
  });
});

test('the snapshot is written wholesale only — no per-entry writes (issue 070)', function () {
  APPS.forEach(function (app) {
    var src = readSrc(app.sw);
    assert.ok(src.indexOf('putCanonical') === -1,
      app.sw + ': the per-entry writer must be gone — the snapshot is never patched entry by entry');
    assert.ok(src.indexOf('res.clone(') === -1,
      app.sw + ': nothing clones a single response to copy it into the snapshot');
    var openLines = src.split('\n').filter(function (line) {
      return line.indexOf('caches.open(') !== -1;
    });
    assert.strictEqual(openLines.length, 2,
      app.sw + ': exactly two cache-open sites exist: install and takeSnapshot');
    openLines.forEach(function (line) {
      assert.ok(line.indexOf('addAll(') !== -1,
        app.sw + ': a snapshot cache may only be opened for a wholesale addAll: ' + line.trim());
    });
    assert.strictEqual((src.match(/addAll\(/g) || []).length, 2,
      app.sw + ': addAll is the only write and appears exactly twice (install + take)');
  });
});

test('the vocabulary is snapshot, not cache (issue 070)', function () {
  APPS.forEach(function (app) {
    var sw = readSrc(app.sw);
    var reg = readSrc('js/register.js');
    ['var CACHE', 'var PRECACHE', "'emplois-v1'"].forEach(function (tok) {
      assert.ok(sw.indexOf(tok) === -1, app.sw + ' must not carry the cache vocabulary: ' + tok);
      assert.ok(reg.indexOf(tok) === -1, 'js/register.js must not carry the cache vocabulary: ' + tok);
    });
    assert.ok(sw.indexOf('var SNAPSHOT =') !== -1, app.sw + ': the snapshot name identifier must exist');
    assert.ok(sw.indexOf('SNAPSHOT_URLS') !== -1, app.sw + ': the snapshot URL list identifier must exist');
    assert.ok(sw.indexOf('takeSnapshot(') !== -1, app.sw + ': the wholesale take must be named as such');
    var swHead = sw.slice(0, sw.indexOf('var SNAPSHOT'));
    assert.ok(/snapshot/i.test(swHead),
      app.sw + ": the header comment must describe the snapshot model");
  });
  var reg = readSrc('js/register.js');
  var regHead = reg.slice(0, reg.indexOf('if ('));
  assert.ok(/snapshot/i.test(regHead),
    'the js/register.js header comment must describe the snapshot model');
});

test('the two workers own disjoint cache families and status databases (issue 072)', function () {
  var t = readSrc('teachers/sw.js');
  var c = readSrc('classes/sw.js');
  // cache families: each worker never names, let alone tears down, the sibling's
  assert.strictEqual(t.indexOf('emplois-classes'), -1,
    'teachers/sw.js must never mention the classes app family');
  assert.strictEqual(c.indexOf('emplois-teachers'), -1,
    'classes/sw.js must never mention the teachers app family');
  // status databases: same, and both names exist in their own file
  ['emplois-teachers-status', 'emplois-classes-status'].forEach(function (db) {
    assert.ok(t.indexOf(db) !== -1 || c.indexOf(db) !== -1, 'database name must appear: ' + db);
  });
  assert.strictEqual(t.indexOf('emplois-classes-status'), -1, 'teachers worker uses its own status DB only');
  assert.strictEqual(c.indexOf('emplois-teachers-status'), -1, 'classes worker uses its own status DB only');
  // the legacy pre-split root snapshot: teardown target of the teachers worker
  // only, exactly as the teardown predicate (not a name it acts on otherwise).
  assert.ok(t.split('emplois-snapshot-v1').length - 1 >= 1,
    'the teachers worker carries the legacy root snapshot teardown');
  assert.strictEqual(c.indexOf('emplois-snapshot-v1'), -1,
    'the classes worker never carries the legacy root snapshot');
  // distinct families, both v1 (each family is new)
  assert.ok(/SNAPSHOT_PREFIX = 'emplois-teachers-snapshot-'/.test(t));
  assert.ok(/SNAPSHOT_PREFIX = 'emplois-classes-snapshot-'/.test(c));
  assert.ok(/SNAPSHOT = SNAPSHOT_PREFIX \+ 'v1'/.test(t) && /SNAPSHOT = SNAPSHOT_PREFIX \+ 'v1'/.test(c),
    'both families start at v1');
});

test('no snapshot lists pages outside its own app (issue 072)', function () {
  // Navigations to these URLs are matched to a registration BY URL (Handle
  // Fetch), and under the strict split they match no app worker — snapshotting
  // them would be dead weight, and the user made the utility pages online-only.
  APPS.forEach(function (app) {
    var urls = snapshotUrls(app.sw);
    var asRoot = urls.map(function (u) {
      return u === './' ? app.dir + '/' : toRoot(u, app.dir);
    });
    var forbidden = ['time.html', 'timetable.html', 'classes.html', 'index.html'];
    APPS.forEach(function (other) {
      if (other.dir !== app.dir) forbidden.push(other.dir + '/index.html');
    });
    forbidden.forEach(function (u) {
      assert.ok(asRoot.indexOf(u) === -1,
        app.sw + ' must not snapshot ' + u + ' — outside the app scope, online-only by design');
    });
    assert.ok(asRoot.indexOf(app.dir + '/index.html') !== -1,
      app.sw + " must snapshot its own page ('./' and index.html)");
  });
});

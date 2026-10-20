// Tests for the redaction mode (issue 061) — run with the other suites:
// `node --test test/classes.test.js … test/redact.test.js` (the directory form
// `node --test test/` still fails; files stay listed).
//
// `?redact=1` swaps every rendered teacher name for an empty rectangle filled
// with the text foreground (`background: currentColor`). These tests pin the
// boot wiring, both redaction-aware entry points, the site inventory (negative
// tokens so a future raw-esc name site fails loudly, like deadcode.test.js),
// the ghost suppression, the appended CSS block, and the README captures.

'use strict';

var test = require('node:test');
var assert = require('node:assert');
var fs = require('node:fs');
var path = require('node:path');
var vm = require('node:vm');

var ROOT = path.join(__dirname, '..');
var CSV_PATH = path.join(ROOT, 'emplois.csv');

function readSrc(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

// Load the browser script stack (data, libgroups, model, match) into one shared
// TT context, exactly like the pages' <script> tags do. The context has no
// `location`, so js/data.js's boot parse leaves redaction off (issue 061's
// typeof-guard contract) and setRedact flips it for a test body only.
function loadStack() {
  var ctx = { console: console };
  vm.createContext(ctx);
  ['js/data.js', 'js/libgroups.js', 'js/model.js', 'js/match.js'].forEach(function (f) {
    vm.runInContext(readSrc(f), ctx, { filename: f });
  });
  return ctx.TT;
}

var TT = loadStack();
var data = TT.data;
var match = TT.match;
var store = data.createStore(fs.readFileSync(CSV_PATH, 'utf8'));

// accent-normalized substring helper — the Reporter's leak methodology
function norm(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// every professor token >= 4 chars, from the real CSV
var profTokens = (function () {
  var set = {};
  store.teachers.forEach(function (t) {
    norm(t).split(/[^a-z0-9]+/).forEach(function (w) {
      if (w.length >= 4) set[w] = true;
    });
  });
  return Object.keys(set);
})();

// ---- 1. wiring -------------------------------------------------------------

test('data.js wiring: typeof location guard, redact=1 parse, setRedact (issue 061)', function () {
  var src = readSrc('js/data.js');
  assert.ok(src.indexOf("typeof location !== 'undefined'") !== -1,
    'the boot parse must be location-guarded (vm sandboxes have no location)');
  assert.ok(/redact=1/.test(src), 'the redact=1 URL param parse must be present');
  assert.ok(src.indexOf('function setRedact(') !== -1, 'the setRedact test hook must exist');
  ['redacted: redacted', 'setRedact: setRedact', 'nameHTML: nameHTML'].forEach(function (tok) {
    assert.ok(src.indexOf(tok) !== -1, 'TT.data must export ' + tok);
  });
  assert.strictEqual(data.redacted(), false,
    'booting without location leaves the mode off (default rendering)');
});

// ---- 2. default output is byte-identical esc -------------------------------

test("nameHTML('Barboura') is exactly esc('Barboura') when redaction is off", function () {
  assert.ok(store.teachers.indexOf('Barboura') !== -1, 'the store knows Barboura');
  var out = data.nameHTML('Barboura');
  assert.strictEqual(out, data.esc('Barboura'), 'byte-identical to the plain escaper');
  assert.strictEqual(out, 'Barboura');
  assert.ok(out.indexOf('<span') === -1, 'no rectangle span while off');
});

// ---- 3. setRedact(true) emits the rectangle --------------------------------

test('setRedact(true) renders a class="redact" span with an em width, no name', function () {
  var off = data.nameHTML('Barboura');
  try {
    data.setRedact(true);
    assert.strictEqual(data.redacted(), true);
    var rect = data.nameHTML('Barboura');
    assert.ok(rect.indexOf('class="redact"') !== -1, 'the rectangle span is emitted');
    assert.ok(rect.indexOf('aria-hidden="true"') !== -1, 'the span is aria-hidden');
    assert.ok(/width:\d+\.\d{2}em/.test(rect), 'the width is an NN.NNem inline style');
    assert.ok(rect.indexOf('Barboura') === -1, 'the name never enters the DOM');
  } finally {
    data.setRedact(false);
  }
  assert.strictEqual(data.redacted(), false);
  assert.strictEqual(data.nameHTML('Barboura'), off, 'setRedact(false) restores the exact output');
});

// ---- 4. the placeholder is not a name --------------------------------------

test("nameHTML('', '—') returns esc('—') in both modes", function () {
  assert.strictEqual(data.nameHTML('', '—'), data.esc('—'), 'placeholder untouched while off');
  try {
    data.setRedact(true);
    assert.strictEqual(data.nameHTML('', '—'), data.esc('—'), 'placeholder untouched while on');
  } finally {
    data.setRedact(false);
  }
  assert.strictEqual(data.nameHTML(undefined, '—'), data.esc('—'), 'missing name falls back too');
});

// ---- 5. match.nameHTML: highlight off, rectangle on ------------------------

test('match.nameHTML highlights by default and redacts when on', function () {
  var ranges = [[0, 4]];
  var def = match.nameHTML('Barboura', ranges);
  assert.strictEqual(def, match.highlightHTML('Barboura', ranges), 'identical to highlightHTML');
  assert.ok(def.indexOf('<mark>') !== -1, 'the default keeps the match highlight');
  try {
    data.setRedact(true);
    var rect = match.nameHTML('Barboura', ranges);
    assert.ok(rect.indexOf('class="redact"') !== -1, 'rectangle instead of the label');
    assert.ok(rect.indexOf('<mark>') === -1, 'no highlight marks in redacted output');
    assert.ok(rect.indexOf('Barboura') === -1, 'no name in redacted output');
  } finally {
    data.setRedact(false);
  }
  // highlightHTML itself stays the generic label renderer for subjects/classes
  assert.ok(readSrc('js/match.js').indexOf('function highlightHTML(') !== -1);
});

// ---- 6. site-inventory pins ------------------------------------------------

test('site inventory: no raw-esc name sites left; every page wires nameHTML(', function () {
  var teachers = readSrc('js/teachers.js');
  var classes = readSrc('js/classes.js');
  var app = readSrc('js/app.js');
  // negative tokens: a future unredacted name site fails exactly like deadcode
  assert.ok(classes.indexOf('esc(s.professor') === -1,
    'classes.js must not raw-esc a professor (use nameHTML)');
  assert.ok(app.indexOf('esc(s.professor') === -1,
    'app.js must not raw-esc a professor (use nameHTML)');
  assert.ok(app.indexOf("'<td>' + esc(n)") === -1,
    'the matrix axis must not raw-esc n (use nameHTML)');
  assert.ok(teachers.indexOf('highlightHTML(r.teacher') === -1,
    'list rows must go through match.nameHTML, not raw highlightHTML');
  assert.ok(teachers.indexOf("'<h2>' + esc(name)") === -1,
    'the detail heading must go through nameHTML, not raw esc');
  // positive: each page renders names through the data-layer helper
  ['js/teachers.js', 'js/classes.js', 'js/app.js'].forEach(function (f) {
    assert.ok(readSrc(f).indexOf('nameHTML(') !== -1, f + ' must call nameHTML(');
  });
});

// ---- 7. ghost suppression --------------------------------------------------

test('renderGhost carries the redacted() guard (slice to acceptSuggest)', function () {
  var src = readSrc('js/teachers.js');
  var start = src.indexOf('function renderGhost()');
  var end = src.indexOf('function acceptSuggest', start);
  assert.ok(start !== -1 && end !== -1 && end > start, 'renderGhost slice bounds');
  var slice = src.slice(start, end);
  assert.ok(slice.indexOf('redacted()') !== -1, 'the guard lives inside renderGhost');
  assert.ok(slice.indexOf('redacted() ? null : suggestRows[suggestIdx]') !== -1,
    'the guard funnels into the existing hidden path');
});

// ---- 8. CSS block ----------------------------------------------------------

test('.redact CSS block pins background: currentColor and display: inline-block', function () {
  var css = readSrc('styles.css');
  var at = css.indexOf('.redact {');
  assert.ok(at !== -1, 'the .redact rule must exist');
  var close = css.indexOf('}', at);
  assert.ok(close !== -1, 'the .redact rule must close');
  var block = css.slice(at, close);
  assert.ok(block.indexOf('background: currentColor') !== -1,
    'the rectangle is the text foreground');
  assert.ok(block.indexOf('display: inline-block') !== -1, 'the rectangle sizes inline');
  assert.ok(css.slice(close + 1).trim() === '', 'the block is appended at the end of styles.css');
});

// ---- 9. README image links resolve -----------------------------------------

test('README image links resolve to committed files', function () {
  var md = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  var re = /\]\((assets\/[^)]+)\)/g;
  var m, n = 0;
  while ((m = re.exec(md))) {
    n++;
    assert.ok(fs.existsSync(path.join(ROOT, m[1])), 'missing README image: ' + m[1]);
  }
  assert.ok(n >= 7, 'the README links the 7 captures, found ' + n);
});

// ---- 10. README alts carry no professor token ------------------------------

test('README image alts are non-empty and contain no professor token (>=4 chars)', function () {
  var md = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  var re = /!\[([^\]]*)\]\((assets\/[^)]+)\)/g;
  var m, n = 0;
  while ((m = re.exec(md))) {
    var alt = m[1], file = m[2];
    assert.ok(alt.trim().length > 0, 'empty alt text for ' + file);
    var nAlt = norm(alt);
    profTokens.forEach(function (t) {
      assert.ok(nAlt.indexOf(t) === -1, 'alt of ' + file + ' leaks professor token "' + t + '"');
    });
    n++;
  }
  assert.ok(n >= 7, 'every capture carries an alt, found ' + n);
});

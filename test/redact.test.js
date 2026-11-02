// Tests for the redaction mode (issue 061) — run with:
// `node --test test/redact.test.js` (or with the other suites).
//
// Ported off the legacy suite: lib pins now come from the app's ESM libs
// (app/src/lib/*.js), and the site-inventory / ghost / CSS pins now target
// the Svelte routes and app/static/app.css. `?redact=1` swaps every rendered
// teacher name for an empty rectangle filled with the text foreground
// (`background: currentColor`). These tests pin the boot wiring, both
// redaction-aware entry points, the site inventory (negative tokens so a
// future raw-esc name site fails loudly, like deadcode.test.js), the ghost
// suppression, the appended CSS block, and the README captures.

import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as data from '../app/src/lib/data.js';
import * as search from '../app/src/lib/search.js';
import { CSV_PATH, readSrc } from './helpers.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');

const store = data.createStore(fs.readFileSync(CSV_PATH, 'utf8'));

// accent-normalized substring helper — the Reporter's leak methodology
function norm(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// every professor token >= 4 chars, from the real CSV
const profTokens = (function () {
  const set = {};
  store.teachers.forEach(function (t) {
    norm(t).split(/[^a-z0-9]+/).forEach(function (w) {
      if (w.length >= 4) set[w] = true;
    });
  });
  return Object.keys(set);
})();

// ---- 1. wiring -------------------------------------------------------------

test('data.js wiring: typeof location guard, redact=1 parse, setRedact (issue 061)', function () {
  const src = readSrc('app/src/lib/data.js');
  assert.ok(src.indexOf("typeof location !== 'undefined'") !== -1,
    'the boot parse must be location-guarded (node and Svelte SSR have no location)');
  assert.ok(/redact=1/.test(src), 'the redact=1 URL param parse must be present');
  assert.ok(src.indexOf('function setRedact(') !== -1, 'the setRedact test hook must exist');
  ['export function redacted(', 'export function nameHTML('].forEach(function (tok) {
    assert.ok(src.indexOf(tok) !== -1, 'data.js must export ' + tok);
  });
  assert.strictEqual(data.redacted(), false,
    'booting without location leaves the mode off (default rendering)');
});

// ---- 2. default output is byte-identical esc -------------------------------

test("nameHTML('Barboura') is exactly esc('Barboura') when redaction is off", function () {
  assert.ok(store.teachers.indexOf('Barboura') !== -1, 'the store knows Barboura');
  const out = data.nameHTML('Barboura');
  assert.strictEqual(out, data.esc('Barboura'), 'byte-identical to the plain escaper');
  assert.strictEqual(out, 'Barboura');
  assert.ok(out.indexOf('<span') === -1, 'no rectangle span while off');
});

// ---- 3. setRedact(true) emits the rectangle --------------------------------

test('setRedact(true) renders a class="redact" span with an em width, no name', function () {
  const off = data.nameHTML('Barboura');
  try {
    data.setRedact(true);
    assert.strictEqual(data.redacted(), true);
    const rect = data.nameHTML('Barboura');
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

// ---- 5. search.nameHTML: highlight off, rectangle on ------------------------

test('search.nameHTML highlights by default and redacts when on', function () {
  const ranges = [[0, 4]];
  const def = search.nameHTML('Barboura', ranges);
  assert.strictEqual(def, search.highlightHTML('Barboura', ranges), 'identical to highlightHTML');
  assert.ok(def.indexOf('<mark>') !== -1, 'the default keeps the match highlight');
  try {
    data.setRedact(true);
    const rect = search.nameHTML('Barboura', ranges);
    assert.ok(rect.indexOf('class="redact"') !== -1, 'rectangle instead of the label');
    assert.ok(rect.indexOf('<mark>') === -1, 'no highlight marks in redacted output');
    assert.ok(rect.indexOf('Barboura') === -1, 'no name in redacted output');
  } finally {
    data.setRedact(false);
  }
  // highlightHTML itself stays the generic label renderer for subjects/classes
  assert.ok(readSrc('app/src/lib/search.js').indexOf('function highlightHTML(') !== -1);
});

// ---- 6. site-inventory pins ------------------------------------------------

test('site inventory: no raw-esc name sites left; every page wires nameHTML(', function () {
  const teachersPage = readSrc('app/src/routes/teachers/+page.svelte');
  const classesPage = readSrc('app/src/routes/classes/+page.svelte');
  const atPage = readSrc('app/src/routes/at/+page.svelte');
  const allPage = readSrc('app/src/routes/all/+page.svelte');
  // negative tokens: a future unredacted name site fails exactly like deadcode
  assert.ok(classesPage.indexOf('esc(s.professor') === -1,
    'classes must not raw-esc a professor (use nameHTML)');
  assert.ok(atPage.indexOf('esc(s.professor') === -1,
    'the time page must not raw-esc a professor (use nameHTML)');
  assert.ok(allPage.indexOf('esc(n)') === -1,
    'the matrix axis must not raw-esc n (use nameHTML)');
  assert.ok(teachersPage.indexOf('highlightHTML(r.teacher') === -1,
    'list rows must go through search.nameHTML, not raw highlightHTML');
  assert.ok(teachersPage.indexOf('esc(detailGroups.name') === -1,
    'the detail heading must go through nameHTML, not raw esc');
  // positive: each page renders names through the data-layer helper
  // classes page uses nameHTML in the DayGroupCards component
  ['app/src/routes/teachers/+page.svelte', 'app/src/lib/components/DayGroupCards.svelte',
   'app/src/routes/at/+page.svelte', 'app/src/routes/all/+page.svelte'].forEach(function (f) {
    assert.ok(readSrc(f).indexOf('nameHTML(') !== -1, f + ' must call nameHTML(');
  });
});

// ---- 7. ghost suppression --------------------------------------------------

test('the ghost wiring carries the redacted() guard (slice to acceptSuggest)', function () {
  const src = readSrc('app/src/routes/teachers/+page.svelte');
  const at = src.indexOf('redacted() ? null : suggestRows[suggestIdx]');
  const end = src.indexOf('function acceptSuggest', at === -1 ? 0 : at);
  assert.ok(at !== -1 && end !== -1 && end > at,
    'the guard lives inside the ghost wiring, feeding the existing hidden path');
  assert.ok(src.slice(0, at).indexOf('the shadow ghost') !== -1,
    'the guard belongs to the ghost completion, not some other consumer');
});

// ---- 8. CSS block ----------------------------------------------------------

test('.redact CSS block pins background: currentColor and display: inline-block', function () {
  const css = readSrc('app/static/app.css');
  const at = css.indexOf('.redact {');
  assert.ok(at !== -1, 'the .redact rule must exist');
  const close = css.indexOf('}', at);
  assert.ok(close !== -1, 'the .redact rule must close');
  const block = css.slice(at, close);
  assert.ok(block.indexOf('background: currentColor') !== -1,
    'the rectangle is the text foreground');
  assert.ok(block.indexOf('display: inline-block') !== -1, 'the rectangle sizes inline');
  assert.ok(css.slice(close + 1).trim() === '', 'the block is appended at the end of app.css');
});

// ---- 9. README image links resolve -----------------------------------------

test('README image links resolve to committed files', function () {
  const md = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  const re = /\]\((assets\/[^)]+)\)/g;
  let m, n = 0;
  while ((m = re.exec(md))) {
    n++;
    assert.ok(fs.existsSync(path.join(ROOT, m[1])), 'missing README image: ' + m[1]);
  }
  assert.ok(n >= 7, 'the README links the 7 captures, found ' + n);
});

// ---- 10. README alts carry no professor token ------------------------------

test('README image alts are non-empty and contain no professor token (>=4 chars)', function () {
  const md = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  const re = /!\[([^\]]*)\]\((assets\/[^)]+)\)/g;
  let m, n = 0;
  while ((m = re.exec(md))) {
    const alt = m[1], file = m[2];
    assert.ok(alt.trim().length > 0, 'empty alt text for ' + file);
    const nAlt = norm(alt);
    profTokens.forEach(function (t) {
      assert.ok(nAlt.indexOf(t) === -1, 'alt of ' + file + ' leaks professor token "' + t + '"');
    });
    n++;
  }
  assert.ok(n >= 7, 'every capture carries an alt, found ' + n);
});

// Tests for the page chrome the user pinned in issue 076 — run with
// `node --test test/` … or the glob form `node --test test/*.test.js` (the
// directory form `node --test test/` still fails; files stay listed).
//
// Issue 076: (1) ONE unified h1 rule — `h1 { font-size: 17pt }` — replacing the
// old two-tier split (generic 1.3rem vs the teachers/classes 2em display
// override); (2) the `.author-credit` at `margin: 2px 0 20pt` with the author
// NAME (the link) at 14pt; (3) on the two filter pages the session/teacher
// count line `#status` sits UNDER the filter box (`#searchWrap`) and ABOVE the
// results list, in normal flow so it scrolls away with the page — while the
// utility views at/ and all/ keep `#status` under their title (no filter box
// there). The count line's text and its JS writers are untouched: this is a
// position change, never a behaviour change.

'use strict';

var test = require('node:test');
var assert = require('node:assert');
var fs = require('node:fs');
var path = require('node:path');

var ROOT = path.join(__dirname, '..');

function readSrc(name) { return fs.readFileSync(path.join(ROOT, name), 'utf8'); }

var CSS = readSrc('styles.css');
var TEACHERS = readSrc('teachers/index.html');
var CLASSES = readSrc('classes/index.html');
var AT = readSrc('at/index.html');
var ALL = readSrc('all/index.html');

// the first `{…}` block after `sel` — the suite's usual rule-extraction idiom
function rule(css, sel) {
  var at = css.indexOf(sel);
  assert.ok(at !== -1, 'missing rule for ' + sel);
  var open = css.indexOf('{', at);
  var close = css.indexOf('}', open);
  assert.ok(open !== -1 && close !== -1, 'unterminated rule for ' + sel);
  return css.slice(open + 1, close);
}

// ---- (1) the unified h1 ----------------------------------------------------

test('issue 076: ONE unified 17pt h1 rule, the two-tier split gone', function () {
  assert.ok(/(^|\n)h1 \{ font-size: 17pt; margin: \.6rem 0 \.2rem; \}/.test(CSS),
    'the single h1 rule carries the 17pt size and the generic margins');
  // exactly one font-size: 17pt declaration in the whole sheet
  assert.strictEqual(CSS.split('font-size: 17pt').length - 1, 1,
    'the 17pt h1 size is declared exactly once');
  // the replaced values are gone from every declaration (comments may mention them)
  assert.strictEqual(CSS.indexOf('font-size: 1.3rem'), -1,
    'the old generic 1.3rem h1 is gone');
  assert.strictEqual(CSS.indexOf('font-size: 2em'), -1,
    'the teachers/classes 2em display override is gone');
  // no page-scoped h1 font-size survives — only the text-align centre may scope h1
  var h1Scopes = ['body[data-page="teachers"] h1', 'body[data-page="classes"] h1'];
  h1Scopes.forEach(function (sel) {
    var re = new RegExp(sel.replace(/[[\]"]/g, '\\$&') + '[^{}]*\\{[^}]*font-size', 'g');
    assert.strictEqual(re.test(CSS), false, 'no page-scoped font-size may survive for ' + sel);
  });
});

// ---- (2) author credit: margin + name size ---------------------------------

test('issue 076: .author-credit is margin 2px 0 20pt with a 14pt name link', function () {
  var credit = rule(CSS, 'body[data-page="teachers"] .author-credit,\nbody[data-page="classes"] .author-credit');
  assert.ok(/margin: 2px 0 20pt;/.test(credit), 'credit margin pinned by the user');
  assert.ok(/text-align: center;/.test(credit), 'the credit stays centred');
  assert.strictEqual(CSS.indexOf('margin: 1.2rem 0'), -1, 'the old 1.2rem credit margin is gone');

  var name = rule(CSS, 'body[data-page="teachers"] .author-credit a,\nbody[data-page="classes"] .author-credit a');
  assert.ok(/font-size: 14pt;/.test(name), 'the author NAME (the link) is 14pt');
  assert.strictEqual(name.indexOf('1.3em'), -1, 'the old 1.3em name size is gone');
  // the "By" label keeps the inherited body size: no font-size on the span
  var label = rule(CSS, 'body[data-page="teachers"] .author-credit span,\nbody[data-page="classes"] .author-credit span');
  assert.strictEqual(label.indexOf('font-size'), -1,
    'the "By" label stays at the inherited size (only the name was pinned)');

  // only the two filter pages carry the class — the utility views have no credit
  [TEACHERS, CLASSES].forEach(function (html) {
    assert.strictEqual(html.split('class="author-credit"').length - 1, 1,
      'exactly one author credit');
  });
  [AT, ALL].forEach(function (html) {
    assert.strictEqual(html.indexOf('author-credit'), -1,
      'the utility views carry no author credit');
  });
});

// ---- (3) the count line under the filter box -------------------------------

test('issue 076: #status sits under #searchWrap and above the list on both filter pages', function () {
  assert.ok(TEACHERS.indexOf(
    '</div>\n    <p id="status">Loading emplois.csv…</p>\n    <ul id="teacherList">') !== -1,
    'teachers: #status directly follows the filter box, directly precedes the list');
  assert.ok(CLASSES.indexOf(
    '</div>\n    <p id="status">Loading emplois.csv…</p>\n    <ul id="classList">') !== -1,
    'classes: #status directly follows the filter box, directly precedes the list');
  // and it is out of the header: the credit now directly follows the title
  [TEACHERS, CLASSES].forEach(function (html) {
    assert.ok(html.indexOf('</h1>\n    <p class="author-credit">') !== -1,
      '#status left the header block — the credit follows the h1');
    assert.ok(html.indexOf('<p id="status">Loading emplois.csv…</p>\n    <p class="author-credit">') === -1,
      'the count line must not sit above the credit anymore');
  });
  // the teachers suggest dropdown stays INSIDE the wrap (absolute, top:100%) so an
  // open dropdown overlays the count line instead of pushing it around
  var wrapAt = TEACHERS.indexOf('<div id="searchWrap"');
  var listAt = TEACHERS.indexOf('<ul id="teacherList">');
  var suggestAt = TEACHERS.indexOf('<ul id="suggest"');
  assert.ok(wrapAt !== -1 && suggestAt > wrapAt && suggestAt < listAt,
    'teachers: #suggest lives inside #searchWrap');

  // the count line stays in normal flow: no position/pin declaration in its rule,
  // and the centre rules still cover it on both pages
  var statusRule = rule(CSS, '#status');
  assert.strictEqual(statusRule.indexOf('position'), -1,
    '#status is never positioned — it scrolls away with the page');
  ['teachers', 'classes'].forEach(function (page) {
    var sel = 'body[data-page="' + page + '"] #status';
    assert.ok(rule(CSS, sel).indexOf('text-align: center') !== -1,
      sel + ' stays centred');
  });
});

// ---- (4) the utility views keep their status where it is -------------------

test('issue 076: at/ and all/ keep #status under the title (no filter box there)', function () {
  assert.ok(AT.indexOf('<h1>Who teaches when</h1>\n<p id="status">') !== -1,
    'at/: the count line stays directly under the title');
  assert.ok(ALL.indexOf('<h1>Teachers × Time slots</h1>\n<p id="status">') !== -1,
    'all/: the count line stays directly under the title');
  [AT, ALL].forEach(function (html) {
    assert.strictEqual(html.indexOf('id="searchWrap"'), -1,
      'the utility views carry no filter box');
  });
});

// ---- the behaviour is untouched: textContent-only writers ------------------

test('issue 076: no JS writer re-parents #status — textContent only', function () {
  ['js/teachers.js', 'js/classes.js', 'js/app.js'].forEach(function (file) {
    var src = readSrc(file);
    assert.ok(src.indexOf("getElementById('status')") !== -1, file + ' still finds #status');
    assert.strictEqual(/status\.insert|status\.append|status\.remove|status\.parentNode|st\.parentNode/.test(src), false,
      file + ' must never re-parent the count line');
  });
});

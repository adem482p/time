// Tests for the page chrome the user pinned in issue 076 — run with
// `node --test test/` … or the glob form `node --test test/*.test.js` (the
// directory form `node --test test/` still fails; files stay listed).
//
// Issue 076: (1) ONE unified h1 rule — `h1 { font-size: 17pt }` — replacing the
// old two-tier split (generic 1.3rem vs the teachers/classes 2em display
// override); (2) the `.author-credit` at `margin: 2px 0 20pt` with the author
// NAME (the link) at 14pt — issue 078 reverted the name to its old 1.3em
// (Tiny5 is a 5px-grid font; 14pt's fractional px blurred it), the 076
// margins stand; (3) on the two filter pages the session/teacher
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

test('issue 076+078: .author-credit is margin 2px 0 20pt with the name link back at 1.3em', function () {
  var credit = rule(CSS, 'body[data-page="teachers"] .author-credit,\nbody[data-page="classes"] .author-credit');
  assert.ok(/margin: 2px 0 20pt;/.test(credit), 'credit margin pinned by the user (076, kept)');
  assert.ok(/text-align: center;/.test(credit), 'the credit stays centred');
  assert.strictEqual(CSS.indexOf('margin: 1.2rem 0'), -1, 'the old 1.2rem credit margin is gone');

  // issue 078: the user restored the old 1.3em name — Tiny5 is a 5px-grid
  // pixel font, and 14pt's 18.67px put every glyph edge off the grid (blur);
  // the 076 margins stay, the size reverts.
  var name = rule(CSS, 'body[data-page="teachers"] .author-credit a,\nbody[data-page="classes"] .author-credit a');
  assert.ok(/font-size: 1\.3em;/.test(name), 'the author NAME (the link) is back at 1.3em (issue 078)');
  assert.strictEqual(name.indexOf('14pt'), -1, 'the 076 14pt name size is gone (issue 078)');
  assert.ok(/font-family/.test(name), 'the name link still carries the Tiny5 family');
  assert.ok(/Tiny5/.test(name), 'the name stays on the Tiny5 web font (only the size reverted)');
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

// ---- issue 078: sticky day headings, the folding count line, class facts ---

test('issue 078: #detail .day-head sticks with an opaque surface and a padded hit area', function () {
  // the base rule (first occurrence) carries the sticky declaration itself —
  // no second sticky rule may exist to fight it
  var head = rule(CSS, '#detail .day-head');
  assert.ok(/position: sticky/.test(head), 'the day head is sticky');
  assert.ok(/top: 0;/.test(head),
    'the sticky offset pins the label flush at the scrollport top (measured in Chromium: top:-1rem hangs the whole 17px label off-screen)');
  assert.ok(/z-index: 2/.test(head), 'a stuck head paints over the rows beneath it');
  assert.ok(/background: var\(--md-surface, #fff\)/.test(head),
    'the stuck head is opaque — rows must never show through');
  assert.ok(/margin: 0;/.test(head), 'the day head has no outer margin');
  assert.ok(/padding: 1rem 0;/.test(head), 'the day head uses vertical padding for its sticky height');
  // every #detail .day-head rule keeps the padded hit area on every viewport
  // branch, not just the base.
  var re = /#detail \.day-head[^{}]*\{[^}]*\}/g, m;
  var seen = 0;
  while ((m = re.exec(CSS))) {
    seen++;
    assert.ok(/padding: 1rem 0/.test(m[0]), 'every day-head rule keeps padding: 1rem 0 — #' + seen);
  }
  assert.ok(seen >= 2, 'the base rule plus at least one media branch carry .day-head');
});

test('mobile detail h2 is hidden because overlayName supplies the heading', function () {
  var narrow = CSS.slice(CSS.indexOf('@media (max-width: 700px)'));
  assert.ok(/#detail > h2 \{\s*display: none;\s*\}/.test(narrow),
    'mobile hides the duplicated detail heading');
  assert.strictEqual(CSS.slice(0, CSS.indexOf('@media (max-width: 700px)'))
    .indexOf('#detail > h2'), -1,
    'desktop keeps the detail heading available');
});

test('teacher and class lists omit the final item border on every viewport', function () {
  assert.ok(CSS.indexOf('#teacherList li:last-child { border-bottom: 0; }') !== -1,
    'teacher list final item has no bottom border');
  assert.ok(CSS.indexOf('#classList li:last-child { border-bottom: 0; }') !== -1,
    'class list final item has no bottom border');
});

test('issue 078: #status folds away on desktop via a plain CSS transition', function () {
  // the pinned desktop box: a fixed one-line height (auto cannot transition)
  var box = rule(CSS, 'body[data-page="teachers"] #status, body[data-page="classes"] #status');
  assert.ok(/height: 1\.4em/.test(box), 'the count line keeps a pinned one-line height (covers the natural 19px line box — 1.35em clipped descenders)');
  assert.ok(/flex: none/.test(box),
    'the pinned box must not shrink: the pane is a flex column and the list absorbs the space');
  assert.ok(/overflow: hidden/.test(box), 'overflow hides the text while it folds');
  assert.ok(/transition: height \.18s ease, margin \.18s ease, opacity \.18s ease/.test(box),
    'the fold is a plain CSS transition — no JS measurement');
  // the collapsed state
  var away = rule(CSS, 'body[data-page="teachers"] #status.count-away');
  assert.ok(/height: 0/.test(away) && /margin: 0/.test(away) && /opacity: 0/.test(away),
    'count-away collapses the box to nothing');
  // narrow (the max-width: 700px branch) hides it outright — no animation there
  assert.ok(/body\[data-page="teachers"\] #status\.count-away,\s*\n?\s*body\[data-page="classes"\] #status\.count-away \{ display: none; \}/.test(CSS),
    'narrow hides the count line outright (no animation)');
  // the base #status rule is still unpositioned — the fold never turns it
  // into a positioning context
  assert.strictEqual(rule(CSS, '#status').indexOf('position'), -1,
    'the base #status rule stays unpositioned');
  // the utility views are untouched: every #status.count-away selector line
  // stays scoped to the two filter pages, never at/ or all/
  assert.strictEqual((CSS.match(/#status\.count-away/g) || []).length, 4,
    'two two-page rules: the desktop collapse and the narrow hide');
  CSS.split('#status.count-away').slice(0, -1).forEach(function (before) {
    var sel = before.slice(Math.max(before.lastIndexOf(';'), before.lastIndexOf('}')) + 1);
    assert.ok(/data-page="teachers"|data-page="classes"/.test(sel),
      'every #status.count-away selector stays scoped to the filter pages');
  });
});

test('issue 078: the class-facts dl is styled once, for both filter pages', function () {
  var facts = rule(CSS, '.class-facts');
  assert.ok(/display: grid/.test(facts) || /display: table/.test(facts) ||
           /margin/.test(facts), 'the facts dl carries its own rule');
  assert.ok(CSS.indexOf('.class-facts .fact-card { display: block;') !== -1,
    'desktop facts follow the teachers page mostly-item layout');
  assert.ok(CSS.indexOf('#detail .class-facts dt {') !== -1 &&
    CSS.indexOf('font-weight: 600') !== -1,
    'fact keys are bold secondary information');
  assert.strictEqual(CSS.indexOf('dd:not(:last-of-type)::after'), -1,
    'desktop facts do not use inline separators');
  assert.strictEqual(CSS.split('.class-facts').length - 1 >= 2, true,
    'the .class-facts selector appears (base rule, possibly with a scoped branch)');
});

test('issue 079: four mobile facts put Track below three equal cards on narrow phones', function () {
  var narrow = CSS.slice(CSS.indexOf('@media (max-width: 700px)'));
  assert.ok(narrow.indexOf('@media (max-width: 400px)') !== -1,
    'the three-card fallback has a narrow-phone breakpoint');
  assert.ok(/grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/.test(narrow),
    'narrow phones use three fact columns');
  assert.ok(/\.class-facts:has\(\.fact-card:nth-child\(4\)\) \.fact-card:first-child \{[\s\S]*?grid-column: 1 \/ -1;[\s\S]*?order: 4;/.test(narrow),
    'the four-fact layout moves Track below and spans all three columns');
  assert.ok(/\.teacher-facts \{\s*grid-template-columns: 1fr;\s*\}/.test(narrow),
    'mobile teacher facts use one full-width column');
  assert.ok(/\.teacher-facts \.fact-card:first-child \{[\s\S]*?grid-column: 1 \/ -1;[\s\S]*?order: 2;/.test(narrow),
    'mobile teacher facts move Subject below and span the full width');
  assert.ok(narrow.indexOf('.class-facts .fact-name::after { content: ""; }') !== -1,
    'mobile fact cards omit the desktop key colon');
});

test('issue 078: desktop #detail may grow past the viewport so sticky heads can travel', function () {
  // stretch caps #detail's box at the viewport line, which would also cap a
  // sticky child's travel; the teachers/classes branches release it while
  // min-height keeps the definite column the empty state fills
  var fix = rule(CSS, 'body[data-page="teachers"] #layout > #detail,\n  body[data-page="classes"] #layout > #detail');
  assert.ok(/align-self: flex-start/.test(fix), '#detail stretches to its content on the filter pages');
  assert.ok(/min-height: calc\(100vh - 2rem\)/.test(fix), 'min-height keeps the viewport-tall column');
  assert.ok(/min-height: calc\(100dvh - 2rem\)/.test(fix), 'the dvh variant follows');
  // the fix lives in the desktop branch — narrow keeps the document scroll
  var at = CSS.indexOf('body[data-page="teachers"] #layout > #detail');
  assert.ok(at > CSS.indexOf('@media (min-width: 701px)'), 'the release is desktop-only');
});

// Tests for the teacher day groups (one shared DOM for desktop + mobile) —
// run with `node --test test/`.
//
// showTeacher is a closure inside js/app.js, so the behavioral tests drive
// the real function source (breakdownHTML + treeHTML + showTeacher slice)
// in a vm sandbox with stubbed document/detail and a stubbed clock.

'use strict';

var test = require('node:test');
var assert = require('node:assert');
var fs = require('node:fs');
var path = require('node:path');
var vm = require('node:vm');

var CSV_PATH = path.join(__dirname, '..', 'emplois.csv');
var ROOT = path.join(__dirname, '..');

function loadStack() {
  var ctx = { console: console };
  vm.createContext(ctx);
  ['js/data.js', 'js/libgroups.js', 'js/model.js', 'js/match.js', 'js/color.js'].forEach(function (f) {
    var src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    vm.runInContext(src, ctx, { filename: f });
  });
  return ctx.TT;
}

var TT = loadStack();
var data = TT.data, model = TT.model, color = TT.color, match = TT.match;

var store = data.createStore(fs.readFileSync(CSV_PATH, 'utf8'));
var modelObjs = model.buildAll(store);
var groups = modelObjs.groups;
var index = match.buildIndex(store, modelObjs);

function main(arr) { return Array.prototype.slice.call(arr); }

var APP_SRC = fs.readFileSync(path.join(ROOT, 'js/teachers.js'), 'utf8');
var CLASSES_SRC = fs.readFileSync(path.join(ROOT, 'js/classes.js'), 'utf8');
var CSS_SRC = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');

// ---- source slices -------------------------------------------------------

function teacherSlice() {
  var start = APP_SRC.indexOf('function breakdownHTML(t)');
  var end = APP_SRC.indexOf('function markActive(name)', start);
  assert.ok(start !== -1 && end !== -1 && end > start, 'teacher slice bounds');
  return APP_SRC.slice(start, end);
}

function showTeacherFn() {
  var src = teacherSlice();
  var start = src.indexOf('function showTeacher(name)');
  assert.ok(start !== -1, 'showTeacher found in slice');
  return src.slice(start);
}

function arrowStmt() {
  var start = APP_SRC.indexOf('var NEXT_ARROW =');
  var end = APP_SRC.indexOf('</svg>\';', start);
  assert.ok(start !== -1 && end !== -1, 'NEXT_ARROW bounds');
  return APP_SRC.slice(start, end + '</svg>\';'.length);
}

// ---- harness: run the real showTeacher with a stubbed clock --------------

var RealDate = Date;

function runShowTeacher(name, clock) {
  var stamp = clock.getTime();
  function FakeDate() { return new RealDate(stamp); }
  var detail = { innerHTML: '' };
  var sandbox = {
    console: console,
    model: model, color: color, esc: data.esc,
    modelObjs: modelObjs, store: store,
    detail: detail,
    markActive: function () {},
    layout: null,
    syncClear: function () {},
    renderSuggest: function () {},
    renderGhost: function () {},
    Date: FakeDate
  };
  vm.createContext(sandbox);
  vm.runInContext(
    arrowStmt() + '\n' + teacherSlice() + '\nshowTeacher(' + JSON.stringify(name) + ');',
    sandbox, { filename: 'showTeacher-harness' });
  return detail.innerHTML;
}

function fri(hh, mm) { return new RealDate(2026, 9, 16, hh, mm); } // Friday
function sun(hh, mm) { return new RealDate(2026, 9, 11, hh, mm); } // Sunday

// ---- output parsing -------------------------------------------------------

function headingsOf(html) {
  var out = [];
  var re = /<h3 class="day-head">([^<]*)<\/h3>/g;
  var m;
  while ((m = re.exec(html))) out.push(m[1]);
  return out;
}

function sectionsOf(html) {
  return html.split('<section').slice(1).map(function (chunk) {
    var inner = chunk.slice(0, chunk.indexOf('</section>'));
    var tag = (/class="([^"]*)"/.exec(inner) || [])[1] || '';
    var tables = inner.split('<table').slice(1);
    var rows = inner.split('<tr').slice(1).filter(function (r) { return r.indexOf('<td') !== -1; });
    return { chunk: inner, cls: tag, tables: tables, rows: rows };
  });
}

function rowTime(row) { return (/c-time">([^<]*)</.exec(row) || [])[1]; }

// ---- structural asserts on the showTeacher source slice -------------------

test('showTeacher emits one heading + section per day with no Day column', function () {
  var fn = showTeacherFn();
  assert.ok(fn.indexOf('<section class="day-group') !== -1, 'missing day-group section');
  assert.ok(fn.indexOf('<h3 class="day-head">') !== -1, 'missing day-head h3');
  assert.ok(fn.indexOf('<table class="t-sessions">') !== -1, 'missing t-sessions table');
  assert.ok(fn.indexOf('<th>Time</th><th>Room</th><th>Subject</th><th>Class</th>') !== -1,
    'header must be Time/Room/Subject/Class with no Day column');
  assert.ok(fn.indexOf('<th>Day') === -1, 'no Day header in teacher output');
  assert.ok(fn.indexOf('c-day') === -1, 'no c-day cells in teacher output');
  assert.ok(fn.indexOf('<hr') === -1, 'no rule elements in teacher output');
  // heading is a sibling BEFORE the card, not a child of it
  assert.ok(fn.indexOf('<h3 class="day-head">') < fn.indexOf('<section class="day-group'),
    'day-head h3 must be emitted before the day-group section');
  // breakdown unchanged
  assert.strictEqual(fn.split('p class="count"').length - 1, 0, 'no session count captions');
  assert.ok(fn.indexOf('breakdownHTML(t)') !== -1, 'breakdown block must be kept');
});

test('showTeacher tracks no prevDay/dayStart; dim lives on the section', function () {
  var fn = showTeacherFn();
  assert.ok(fn.indexOf('prevDay') === -1, 'prevDay tracking must be gone');
  assert.ok(fn.indexOf('dayStart') === -1, 'dayStart must not reach color.sessionRow here');
  assert.ok(fn.indexOf('liveDays') !== -1, 'liveDays computation must stay');
  assert.ok(fn.indexOf('day-group') !== -1 && fn.indexOf('dim') !== -1,
    'dim must move to the section');
  assert.ok(fn.indexOf('color.sessionRow(') !== -1, 'rows still use color.sessionRow');
  assert.ok(fn.indexOf('NEXT_ARROW') !== -1, 'gutter still reuses NEXT_ARROW');
  assert.ok(fn.indexOf('model.isCurrentSession(s.day, s.time, now2)') !== -1,
    'NOW logic unchanged');
  assert.ok(fn.indexOf('upcoming.has(') !== -1, 'NEXT logic unchanged');
});

test('the classes list lives in js/classes.js with day groups (teachers file untouched)', function () {
  // the per-page split: neither page script defines the other's init
  assert.ok(APP_SRC.indexOf('function initClassesPage') === -1,
    'teachers file must not define initClassesPage');
  assert.ok(CLASSES_SRC.indexOf('function initTeachersPage') === -1,
    'classes file must not define initTeachersPage');
  // the classes card list mirrors the teacher day groups: heading outside
  // the card, no Day column, dim on the section
  var sec = CLASSES_SRC.slice(CLASSES_SRC.indexOf('function initClassesPage'));
  assert.ok(sec.indexOf('<table class="c-sessions">') !== -1, 'c-sessions table must stay');
  assert.ok(sec.indexOf('<h3 class="day-head">') !== -1, 'classes list must group by day');
  assert.ok(sec.indexOf('<section class="day-group') !== -1, 'classes list must use day-group sections');
  assert.ok(sec.indexOf("'<td class=\"c-day\">'") === -1, 'classes list must drop the Day column');
  var colorSrc = fs.readFileSync(path.join(ROOT, 'js/color.js'), 'utf8');
  assert.ok(colorSrc.indexOf('dayStart') !== -1, 'color.js dayStart key must stay');
});

// ---- behavioral battery (shared by every fixture) -------------------------

function checkInvariants(name, clock) {
  var ss = model.fuseSessions(store.sessionsOf(name), groups);
  var upcoming = model.nextSessionIdx(ss, clock);
  var live = {};
  var wantNow = {}, wantNext = {};
  ss.forEach(function (s, i) {
    var isNow = model.isCurrentSession(s.day, s.time, clock);
    if (isNow || upcoming.has(i)) live[s.day] = true;
    if (isNow) wantNow[s.day + '|' + s.time] = true;
    else if (upcoming.has(i)) wantNext[s.day + '|' + s.time] = true;
  });

  var html = runShowTeacher(name, clock);
  var heads = headingsOf(html);
  var secs = sectionsOf(html);

  // one heading + one section per distinct day, Monday-first, none for empty days
  var distinct = [];
  ss.forEach(function (s) { if (distinct.indexOf(s.day) === -1) distinct.push(s.day); });
  var wantHeads = distinct.map(function (d) { return model.frDay(d); });
  assert.deepStrictEqual(heads, wantHeads,
    name + ': one h3 per distinct day, Monday-first');
  assert.strictEqual(secs.length, distinct.length,
    name + ': one section per distinct day');
  main(store.days).forEach(function (d) {
    if (distinct.indexOf(d) === -1)
      assert.ok(html.indexOf('day-head">' + model.frDay(d) + '<') === -1,
        name + ': no heading for empty day ' + d);
  });

  // h3 is a sibling PRECEDING the card, never a child of it
  secs.forEach(function (g) {
    assert.ok(g.chunk.indexOf('day-head') === -1,
      name + ': day-head must not live inside the section card');
  });
  distinct.forEach(function (d) {
    var fr = model.frDay(d);
    assert.ok(html.indexOf('<h3 class="day-head">' + fr + '</h3><section class="day-group') !== -1,
      name + ': heading for ' + d + ' must immediately precede its section');
  });
  assert.strictEqual(html.split('<h3 class="day-head">').length - 1, distinct.length,
    name + ': exactly one heading per day group');

  // no Day column / day markers in the markup
  assert.ok(html.indexOf('c-day') === -1, name + ': no c-day cells');
  assert.ok(html.indexOf('Day</th>') === -1, name + ': no Day header');
  assert.ok(html.indexOf('daystart') === -1, name + ': no daystart class');
  assert.ok(html.indexOf('<hr') === -1, name + ': no rule elements');

  // row total == ss.length; per-table header cells match data cells
  assert.strictEqual(html.split('<td class="c-time">').length - 1, ss.length,
    name + ': row total == ss.length');
  secs.forEach(function (g) {
    assert.strictEqual(g.tables.length, 1, 'one table per group');
    assert.strictEqual(g.tables[0].split('<th').length - 1, 5, 'header has 5 columns');
    g.rows.forEach(function (r) {
      assert.strictEqual(r.split('<td').length - 1, 5, 'row has 5 cells');
    });
  });

  // NOW/NEXT markers land on the same rows as the pre-change logic
  var gotNow = {}, gotNext = {};
  secs.forEach(function (g, gi) {
    var day = distinct[gi];
    g.rows.forEach(function (r) {
      var key = day + '|' + rowTime(r);
      if (r.indexOf('nowtag') !== -1) gotNow[key] = true;
      if (r.indexOf('nexttag') !== -1) gotNext[key] = true;
    });
  });
  assert.deepStrictEqual(gotNow, wantNow, name + ': NOW rows match pre-change logic');
  assert.deepStrictEqual(gotNext, wantNext, name + ': NEXT rows match pre-change logic');

  // dim on the section iff its day has no now/next
  secs.forEach(function (g, gi) {
    var day = distinct[gi];
    assert.strictEqual(g.cls.split(' ').indexOf('dim') !== -1, !live[day],
      name + ': dim on section iff day has no now/next (' + day + ')');
  });

  // h2 before h3, day name once, breakdown kept
  assert.strictEqual(html.split('class="count"').length - 1, 0, 'no session count captions');
  assert.ok(html.indexOf('<h2>') !== -1 && html.indexOf('<h2>') < html.indexOf('<h3'),
    'h2 (teacher) precedes h3 (days)');
  heads.forEach(function (fr) {
    assert.strictEqual(html.split('>' + fr + '<').length - 1, 1,
      'day name exactly once in the output (' + fr + ')');
  });
  assert.ok(html.indexOf('Subjects (ranked by hours)') !== -1, 'breakdown subjects kept');
  assert.ok(html.indexOf('Classes (ranked by hours)') !== -1, 'breakdown classes kept');
  return { ss: ss, html: html };
}

test('Barboura at Fri 12:00 groups 12 fused rows with live Friday markers', function () {
  var r = checkInvariants('Barboura', fri(12, 0));
  assert.strictEqual(r.ss.length, 12, 'Barboura fuses to 12 rows');
  // Friday 12h00 sits inside 11h40-13h10: that row is NOW, 13h20-14h50 is NEXT
  assert.ok(r.html.indexOf('nowtag') !== -1, 'expected a NOW marker');
  assert.ok(r.html.indexOf('nexttag') !== -1, 'expected a NEXT marker');
});

test('Dlima at Fri 12:00 marks only the single next capsule, no NOW', function () {
  var r = checkInvariants('Dlima', fri(12, 0));
  assert.strictEqual(r.ss.length, 10, 'Dlima keeps 10 rows');
  assert.ok(r.html.indexOf('nowtag') === -1, 'no NOW at Fri 12:00 for Dlima');
  assert.strictEqual(r.html.split('nexttag').length - 1, 1, 'single NEXT capsule');
});

test('Barboura on Sunday morning marks the wrapped next session only', function () {
  var r = checkInvariants('Barboura', sun(10, 0));
  assert.ok(r.html.indexOf('nowtag') === -1, 'nothing is NOW on Sunday');
  assert.ok(r.html.indexOf('nexttag') !== -1, 'wrapped NEXT still marks');
});

// ---- styles.css asserts -----------------------------------------------------

test('styles.css defines day-group/day-head in the group-head language', function () {
  assert.ok(CSS_SRC.indexOf('.day-group') !== -1, 'missing .day-group');
  assert.ok(CSS_SRC.indexOf('.day-head') !== -1, 'missing .day-head');
  var head = CSS_SRC.slice(CSS_SRC.indexOf('#detail .day-head'),
    CSS_SRC.indexOf('}', CSS_SRC.indexOf('#detail .day-head')) + 1);
  ['uppercase', 'letter-spacing', '600', 'var(--md-on-surface-variant'].forEach(function (tok) {
    assert.ok(head.indexOf(tok) !== -1, 'day-head must reuse the group-head language: ' + tok);
  });
  assert.ok(head.indexOf('DynaPuff') === -1 && head.indexOf('Tiny5') === -1,
    'day-head must not use display faces');
  assert.ok(CSS_SRC.indexOf('#detail .day-group.dim') !== -1, 'missing dimmed-group rule');
});

test('styles.css re-scopes the desktop gutter hang to per-group tables', function () {
  assert.ok(CSS_SRC.indexOf('#layout > #detail .day-group table') !== -1,
    'gutter hang must apply per .day-group table');
  assert.ok(CSS_SRC.indexOf('#detail table.t-sessions') === -1,
    'unscoped teacher gutter rule must be gone');
});

test('day headings show on every viewport', function () {
  var deskStart = CSS_SRC.indexOf('@media (min-width: 701px)');
  var narrowStart = CSS_SRC.indexOf('@media (max-width: 700px)');
  assert.ok(deskStart !== -1 && narrowStart !== -1 && deskStart < narrowStart,
    'expected desktop block before narrow block');
  var desktop = CSS_SRC.slice(deskStart, narrowStart);
  assert.ok(desktop.indexOf('#detail .day-head') === -1,
    'desktop must not rule on day headings');
  assert.ok(!/\.day-head\s*\{\s*display\s*:\s*none/.test(CSS_SRC),
    'no day-head may be hidden on any viewport');
  var narrow = CSS_SRC.slice(narrowStart);
  assert.ok(narrow.indexOf('#detail .day-head') !== -1,
    'narrow must keep styling the day heading');
});

test('mobile cards key on the section with tr + tr dividers, heading outside', function () {
  var narrow = CSS_SRC.slice(CSS_SRC.indexOf('@media (max-width: 700px)'));
  assert.ok(narrow.indexOf('#detail .day-group') !== -1, 'mobile card must key on the section');
  var card = narrow.slice(narrow.indexOf('#detail .day-group {'),
    narrow.indexOf('}', narrow.indexOf('#detail .day-group {')) + 1);
  ['border:', 'border-radius', 'padding', 'margin'].forEach(function (tok) {
    assert.ok(card.indexOf(tok) !== -1, 'section card needs ' + tok);
  });
  // the heading is a sibling BEFORE the card, never a child of it
  assert.ok(narrow.indexOf('#detail .day-group .day-head') === -1,
    'heading must not be styled as a child of the card');
  assert.ok(narrow.indexOf('#detail .day-head') !== -1,
    'mobile must style the outside heading');
  assert.ok(narrow.indexOf('.day-group tr:has(td) + tr:has(td)') !== -1,
    'stacked rows need a tr + tr divider');
  var div = narrow.slice(narrow.indexOf('.day-group tr:has(td) + tr:has(td)'));
  assert.ok(div.slice(0, 120).indexOf('border-top') !== -1, 'divider must be a border-top');
});

test('mobile tinted rows full-bleed across the day-group card', function () {
  var narrow = CSS_SRC.slice(CSS_SRC.indexOf('@media (max-width: 700px)'));
  ['tr.now', 'tr.next'].forEach(function (tok) {
    assert.ok(narrow.indexOf('.day-group ' + tok) !== -1,
      'tinted ' + tok + ' rows inside .day-group must be handled');
  });
  var bleed = narrow.slice(narrow.indexOf('.day-group tr.now'));
  assert.ok(bleed.indexOf('margin-left: -.7rem') !== -1, 'full-bleed needs negative left margin');
  assert.ok(bleed.indexOf('margin-right: -.7rem') !== -1, 'full-bleed needs negative right margin');
  assert.ok(bleed.indexOf('padding-left: .7rem') !== -1, 'content stays inset via left padding');
  assert.ok(bleed.indexOf('padding-right: .7rem') !== -1, 'content stays inset via right padding');
  // vertical rhythm untouched: only horizontal margins/padding, no vertical override
  var rule = bleed.slice(bleed.indexOf('{'), bleed.indexOf('}') + 1);
  assert.ok(rule.indexOf('padding:') === -1, 'must not reset the .35rem vertical padding');
  assert.ok(rule.indexOf('margin:') === -1 || rule.indexOf('margin-left') !== -1,
    'must not reset the vertical margins');
  // card clips square tinted backgrounds to its rounded corners
  var cardBlock = narrow.slice(narrow.indexOf('#detail .day-group {'),
    narrow.indexOf('}', narrow.indexOf('#detail .day-group {')) + 1);
  assert.ok(cardBlock.indexOf('overflow:') !== -1, 'card must clip full-bleed rows round');
  // vertical full-bleed: tinted first/last rows cancel the .5rem card padding
  // (header tr is tbody's first child, so first session row is :nth-child(2))
  assert.ok(narrow.indexOf('.day-group tr.now:has(td):nth-child(2)') !== -1,
    'tinted first row must bleed to the card top');
  assert.ok(narrow.indexOf('.day-group tr.now:has(td):last-child') !== -1,
    'tinted last row must bleed to the card bottom');
  assert.ok(narrow.indexOf('margin-top: -.5rem') !== -1, 'top bleed cancels card padding');
  assert.ok(narrow.indexOf('padding-top: .85rem') !== -1, 'content stays put (.5 + .35)');
  assert.ok(narrow.indexOf('margin-bottom: -.5rem') !== -1, 'bottom bleed cancels card padding');
  assert.ok(narrow.indexOf('padding-bottom: .85rem') !== -1, 'content stays put (.5 + .35)');
  // the base #detail table margin-top would collapse with the top bleed to
  // net zero, so day-group tables zero it (card padding spaces first rows)
  assert.ok(narrow.indexOf('#detail .day-group table { margin-top: 0; }') !== -1,
    'day-group table must drop the base margin-top');
});

test('mobile detail expands with the page instead of inner-scrolling', function () {
  var narrow = CSS_SRC.slice(CSS_SRC.indexOf('@media (max-width: 700px)'));
  assert.ok(narrow.indexOf('#layout > #detail { overflow: visible; }') !== -1,
    'narrow #detail must not trap scroll (base overflow-x:auto computes overflow-y:auto)');
});

test('narrow screens swap menu and cards on focus/select only', function () {
  var narrow = CSS_SRC.slice(CSS_SRC.indexOf('@media (max-width: 700px)'));
  // one pane at a time, with no pointer gate: focusing the filter shows the
  // menu, selecting shows the cards, blur affects neither
  assert.ok(narrow.indexOf('#layout:not(.is-list) #teacherList') !== -1,
    'narrow hides the teacher list off-menu');
  assert.ok(narrow.indexOf('#layout:not(.is-list) #classList') !== -1,
    'narrow hides the class list off-menu');
  assert.ok(narrow.indexOf('#layout.is-list #detail') !== -1,
    'narrow hides detail while on-menu');
  assert.ok(narrow.indexOf('@media (pointer: coarse)') === -1,
    'swap must not depend on pointer type');
});

test('styles.css keeps the classes guards intact', function () {
  assert.ok(CSS_SRC.indexOf('#layout > #detail table.c-sessions { display: none; }') === -1,
    'desktop must keep the classes day tables visible');
  assert.ok(CSS_SRC.indexOf('#detail .weekwrap { display: none; }') !== -1,
    'retained weekwrap narrow hide');
  assert.ok(CSS_SRC.indexOf('#detail td.c-teacher { order: 4; }') !== -1,
    'retained c-teacher order');
  assert.ok(CSS_SRC.indexOf('td.c-teacher::before') !== -1, 'retained c-teacher label');
  assert.ok(CSS_SRC.indexOf('content: "Teacher: ";') !== -1, 'retained Teacher label text');
  assert.ok(CSS_SRC.indexOf('td.c-cell.today') < CSS_SRC.indexOf('td.c-cell.now'),
    'c-cell.today stays before c-cell.now');
});

test('menu visibility is selection-driven, never blur-driven', function () {
  var teachers = APP_SRC.slice(APP_SRC.indexOf('function initTeachersPage'));
  var classes = CLASSES_SRC.slice(CLASSES_SRC.indexOf('function initClassesPage'));
  [teachers, classes].forEach(function (sec, i) {
    var tag = i ? 'classes' : 'teachers';
    var at = sec.indexOf("addEventListener('blur'");
    var blur = sec.slice(at, sec.indexOf('});', at) + 3);
    assert.ok(blur.indexOf('renderSuggest([])') !== -1, tag + ': blur drops the overlay');
    assert.ok(blur.indexOf('searchFocused') === -1, tag + ': blur must not touch menu state');
    assert.ok(blur.indexOf('syncList()') === -1, tag + ': blur must not toggle panes');
    assert.ok(blur.indexOf('setTimeout') === -1, tag + ': no deferred blur');
    assert.ok(sec.indexOf('searchFocused = true') !== -1, tag + ': focus arms the menu');
    assert.ok(sec.indexOf("layout.classList.remove('is-list')") !== -1,
      tag + ': selection dismisses the menu');
  });
  assert.ok(APP_SRC.indexOf('setTimeout') === -1, 'no setTimeout left in the teachers page');
  assert.ok(CLASSES_SRC.indexOf('setTimeout') === -1, 'no setTimeout left in the classes page');
  var clicks = APP_SRC.split("search.addEventListener('click'").length - 1 +
    CLASSES_SRC.split("search.addEventListener('click'").length - 1;
  assert.strictEqual(clicks, 2, 'both pages bring the menu back on filter-box taps');
});

test('exact name selects even among partial matches (both pages)', function () {
  function sliceFn(sig) {
    var src = APP_SRC.indexOf(sig) !== -1 ? APP_SRC : CLASSES_SRC;
    var start = src.indexOf(sig);
    assert.ok(start !== -1, sig + ' found');
    var end = src.indexOf('\n    }', start);
    assert.ok(end !== -1, sig + ' bounds');
    return src.slice(start, end + '\n    }'.length);
  }
  function runExact(src, args) {
    var sandbox = { console: console, model: model };
    vm.createContext(sandbox);
    var names = src.indexOf('function exactTeacher') !== -1 ? 'exactTeacher' : 'exactClass';
    return vm.runInContext(src + '\n' + names + '(' + args.map(function (a) {
      return JSON.stringify(a);
    }).join(',') + ');', sandbox, { filename: 'exact-harness' });
  }
  var res = match.searchSections(index, 'Ben Haj', null);
  assert.strictEqual(res.total, 2, 'Ben Haj fixture must match two teachers');
  assert.strictEqual(runExact(sliceFn('function exactTeacher(res, q)'), [res, 'Ben Haj']), 'Ben Haj');
  assert.strictEqual(runExact(sliceFn('function exactTeacher(res, q)'),
    [match.searchSections(index, 'Ben ', null), 'Ben ']), null, 'partial query selects nothing');
  assert.strictEqual(runExact(sliceFn('function exactTeacher(res, q)'),
    [match.searchSections(index, '', null), '']), null, 'empty query selects nothing');
  var rows = match.classSearch(index, 'GLSI3D1');
  assert.ok(rows.length >= 1, 'GLSI3D1 fixture must return class rows');
  assert.strictEqual(runExact(sliceFn('function exactClass(rows, q)'), [rows, 'GLSI3D1']), 'GLSI3D1');
  assert.strictEqual(runExact(sliceFn('function exactClass(rows, q)'), [rows, 'GLSI']), null,
    'partial class query selects nothing');
  // wiring: commit consults the exact helper before the count branches
  var teachers = APP_SRC.slice(APP_SRC.indexOf('function initTeachersPage'));
  var commitFn = teachers.slice(teachers.indexOf('function commit()'), teachers.indexOf("search.addEventListener('input'"));
  assert.ok(commitFn.indexOf('var exact = exactTeacher(res, q);') !== -1, 'commit computes exact first');
  assert.ok(commitFn.indexOf('if (exact) {') !== -1, 'exact hit selects immediately');
  assert.ok(commitFn.indexOf('var exact = exactTeacher(res, q);') < commitFn.indexOf('res.total === 1'),
    'exact wins before the single-hit branch');
  assert.ok(commitFn.indexOf('if (!selected) syncList();') !== -1,
    'selection must suppress the trailing menu re-show');
  var classes = CLASSES_SRC.slice(CLASSES_SRC.indexOf('function initClassesPage'));
  assert.ok(classes.indexOf('var like = exactClass(rows, q);') !== -1, 'classes commit computes exact');
  assert.ok(classes.indexOf('showClass(like);') !== -1, 'exact class label selects');
});

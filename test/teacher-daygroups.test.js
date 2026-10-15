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
var data = TT.data, model = TT.model, color = TT.color;

var store = data.createStore(fs.readFileSync(CSV_PATH, 'utf8'));
var modelObjs = model.buildAll(store);
var groups = modelObjs.groups;

function main(arr) { return Array.prototype.slice.call(arr); }

var APP_SRC = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
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

function sectionsOf(html) {
  return html.split('<section').slice(1).map(function (chunk) {
    var tag = (/class="([^"]*)"/.exec(chunk) || [])[1] || '';
    var day = (/day-head">([^<]*)</.exec(chunk) || [])[1];
    var tables = chunk.split('<table').slice(1);
    var rows = chunk.split('<tr').slice(1).filter(function (r) { return r.indexOf('<td') !== -1; });
    return { chunk: chunk, cls: tag, day: day, tables: tables, rows: rows };
  });
}

function rowTime(row) { return (/c-time">([^<]*)</.exec(row) || [])[1]; }

// ---- structural asserts on the showTeacher source slice -------------------

test('showTeacher emits one section per day with no Day column', function () {
  var fn = showTeacherFn();
  assert.ok(fn.indexOf('<section class="day-group') !== -1, 'missing day-group section');
  assert.ok(fn.indexOf('<h3 class="day-head">') !== -1, 'missing day-head h3');
  assert.ok(fn.indexOf('<table class="t-sessions">') !== -1, 'missing t-sessions table');
  assert.ok(fn.indexOf('<th>Time</th><th>Room</th><th>Subject</th><th>Class</th>') !== -1,
    'header must be Time/Room/Subject/Class with no Day column');
  assert.ok(fn.indexOf('<th>Day') === -1, 'no Day header in teacher output');
  assert.ok(fn.indexOf('c-day') === -1, 'no c-day cells in teacher output');
  assert.ok(fn.indexOf('<hr') === -1, 'no rule elements in teacher output');
  // single count caption above all groups, breakdown unchanged
  assert.strictEqual(fn.split('p class="count"').length - 1, 1, 'exactly one p.count');
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

test('the classes path keeps its Day column and dayStart (untouched)', function () {
  var sec = APP_SRC.slice(APP_SRC.indexOf('function initClassesPage'), APP_SRC.indexOf('function boot('));
  assert.ok(sec.indexOf('<table class="c-sessions">') !== -1, 'c-sessions table must stay');
  assert.ok(sec.indexOf('c-day') !== -1, 'classes list keeps its Day column');
  assert.ok(sec.indexOf('dayStart') !== -1, 'classes dayStart must stay');
  var colorSrc = fs.readFileSync(path.join(ROOT, 'js/color.js'), 'utf8');
  assert.ok(colorSrc.indexOf('dayStart') !== -1, 'color.js dayStart key must stay for classes');
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
  var secs = sectionsOf(html);

  // one section per distinct day, Monday-first, none for empty days
  var distinct = [];
  ss.forEach(function (s) { if (distinct.indexOf(s.day) === -1) distinct.push(s.day); });
  assert.deepStrictEqual(secs.map(function (g) { return g.day; }),
    distinct.map(function (d) { return model.frDay(d); }),
    name + ': one section per distinct day, Monday-first');
  main(store.days).forEach(function (d) {
    if (distinct.indexOf(d) === -1)
      assert.ok(html.indexOf('day-head">' + model.frDay(d) + '<') === -1,
        name + ': no section for empty day ' + d);
  });

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
  secs.forEach(function (g) {
    var day = main(store.days).filter(function (d) { return model.frDay(d) === g.day; })[0];
    g.rows.forEach(function (r) {
      var key = day + '|' + rowTime(r);
      if (r.indexOf('nowtag') !== -1) gotNow[key] = true;
      if (r.indexOf('nexttag') !== -1) gotNext[key] = true;
    });
  });
  assert.deepStrictEqual(gotNow, wantNow, name + ': NOW rows match pre-change logic');
  assert.deepStrictEqual(gotNext, wantNext, name + ': NEXT rows match pre-change logic');

  // dim on the section iff its day has no now/next
  secs.forEach(function (g) {
    var day = main(store.days).filter(function (d) { return model.frDay(d) === g.day; })[0];
    assert.strictEqual(g.cls.split(' ').indexOf('dim') !== -1, !live[day],
      name + ': dim on section iff day has no now/next (' + day + ')');
  });

  // single count above the first group, h2 before h3, day name once, breakdown kept
  assert.strictEqual(html.split('class="count"').length - 1, 1, 'single p.count');
  assert.ok(html.indexOf('class="count"') < html.indexOf('<section'),
    'p.count sits above all groups');
  assert.ok(html.indexOf('<h2>') !== -1 && html.indexOf('<h2>') < html.indexOf('<h3'),
    'h2 (teacher) precedes h3 (days)');
  secs.forEach(function (g) {
    assert.strictEqual(g.chunk.split('>' + g.day + '<').length - 1, 1,
      'day name exactly once per group');
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
  assert.ok(CSS_SRC.indexOf('.day-group table.t-sessions') !== -1,
    'gutter hang must apply per .day-group table');
  assert.ok(CSS_SRC.indexOf('#detail table.t-sessions') === -1,
    'unscoped teacher gutter rule must be gone');
});

test('mobile cards key on the section with tr + tr dividers', function () {
  var narrow = CSS_SRC.slice(CSS_SRC.indexOf('@media (max-width: 700px)'));
  assert.ok(narrow.indexOf('#detail .day-group') !== -1, 'mobile card must key on the section');
  var card = narrow.slice(narrow.indexOf('#detail .day-group {'),
    narrow.indexOf('}', narrow.indexOf('#detail .day-group {')) + 1);
  ['border:', 'border-radius', 'padding', 'margin'].forEach(function (tok) {
    assert.ok(card.indexOf(tok) !== -1, 'section card needs ' + tok);
  });
  assert.ok(narrow.indexOf('.day-group tr:has(td) + tr:has(td)') !== -1,
    'stacked rows need a tr + tr divider');
  var div = narrow.slice(narrow.indexOf('.day-group tr:has(td) + tr:has(td)'));
  assert.ok(div.slice(0, 120).indexOf('border-top') !== -1, 'divider must be a border-top');
});

test('styles.css keeps the classes guards intact', function () {
  assert.ok(CSS_SRC.indexOf('#layout > #detail table.c-sessions { display: none; }') !== -1,
    'retained c-sessions desktop hide');
  assert.ok(CSS_SRC.indexOf('#detail .weekwrap { display: none; }') !== -1,
    'retained weekwrap narrow hide');
  assert.ok(CSS_SRC.indexOf('#detail td.c-teacher { order: 4; }') !== -1,
    'retained c-teacher order');
  assert.ok(CSS_SRC.indexOf('td.c-teacher::before') !== -1, 'retained c-teacher label');
  assert.ok(CSS_SRC.indexOf('content: "Teacher: ";') !== -1, 'retained Teacher label text');
  assert.ok(CSS_SRC.indexOf('td.c-cell.today') < CSS_SRC.indexOf('td.c-cell.now'),
    'c-cell.today stays before c-cell.now');
});

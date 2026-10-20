// Tests for the teacher day groups (one shared DOM for desktop + mobile) —
// run with `node --test test/`.
//
// showTeacher is a closure inside js/teachers.js, so the behavioral tests drive
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
var INDEX_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
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

function wed(hh, mm) { return new RealDate(2026, 9, 14, hh, mm); } // Wednesday
function fri(hh, mm) { return new RealDate(2026, 9, 16, hh, mm); } // Friday
function sat(hh, mm) { return new RealDate(2026, 9, 17, hh, mm); } // Saturday
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

  // one heading + one section per distinct day, start-from-today, none for empty days
  var distinct = [];
  ss.forEach(function (s) { if (distinct.indexOf(s.day) === -1) distinct.push(s.day); });
  var rotated = main(model.startFromToday(distinct, ss, clock));
  var wantHeads = rotated.map(function (d) { return model.frDay(d); });
  assert.deepStrictEqual(heads, wantHeads,
    name + ': one h3 per distinct day, start-from-today');
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
    var day = rotated[gi];
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
    var day = rotated[gi];
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
  assert.strictEqual(headingsOf(r.html)[0], 'vendredi');
  // Friday 12h00 sits inside 11h40-13h10: that row is NOW, 13h20-14h50 is NEXT
  assert.ok(r.html.indexOf('nowtag') !== -1, 'expected a NOW marker');
  assert.ok(r.html.indexOf('nexttag') !== -1, 'expected a NEXT marker');
});

test('Dlima at Fri 12:00 marks only the single next capsule, no NOW', function () {
  var r = checkInvariants('Dlima', fri(12, 0));
  assert.strictEqual(r.ss.length, 10, 'Dlima keeps 10 rows');
  // the rotation case from the issue: vendredi first, then mardi… cyclic
  assert.strictEqual(headingsOf(r.html)[0], 'vendredi');
  assert.ok(r.html.indexOf('nowtag') === -1, 'no NOW at Fri 12:00 for Dlima');
  assert.strictEqual(r.html.split('nexttag').length - 1, 1, 'single NEXT capsule');
});

test('Barboura on Sunday morning marks the wrapped next session only', function () {
  var r = checkInvariants('Barboura', sun(10, 0));
  assert.strictEqual(headingsOf(r.html)[0], 'jeudi');
  assert.ok(r.html.indexOf('nowtag') === -1, 'nothing is NOW on Sunday');
  assert.ok(r.html.indexOf('nexttag') !== -1, 'wrapped NEXT still marks');
});

test('Barboura at Sat 18:30 rolls past the finished Saturday to Thursday', function () {
  var r = checkInvariants('Barboura', sat(18, 30));
  assert.strictEqual(headingsOf(r.html)[0], 'jeudi');
  assert.ok(r.html.indexOf('nowtag') === -1, 'nothing is NOW at Sat 18:30');
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
  function handlerSlice(sec, sig) {
    var at = sec.indexOf(sig);
    assert.ok(at !== -1, sig + ' handler found');
    return sec.slice(at, sec.indexOf('});', at) + 3);
  }
  // blur stays pure on both pages: it drops the suggest overlay and nothing
  // else (3909bd9 — a press in flight must never lose its row)
  [teachers, classes].forEach(function (sec, i) {
    var tag = i ? 'classes' : 'teachers';
    var blur = handlerSlice(sec, "addEventListener('blur'");
    assert.ok(blur.indexOf('renderSuggest([])') !== -1, tag + ': blur drops the overlay');
    assert.ok(blur.indexOf('syncList()') === -1, tag + ': blur must not toggle panes');
    assert.ok(blur.indexOf('setTimeout') === -1, tag + ': no deferred blur');
    assert.ok(sec.indexOf("layout.classList.remove('is-list')") !== -1,
      tag + ': selection dismisses the menu');
  });
  // teachers: blur writes neither nav fact nor any menu-edge function
  var teachersBlur = handlerSlice(teachers, "addEventListener('blur'");
  ['menuOpen', 'openMenu', 'closeMenu'].forEach(function (tok) {
    assert.ok(teachersBlur.indexOf(tok) === -1, 'teachers: blur must not touch ' + tok);
  });
  // classes: blur writes neither nav fact nor any menu-edge function
  var classesBlur = handlerSlice(classes, "addEventListener('blur'");
  ['menuOpen', 'openMenu', 'closeMenu'].forEach(function (tok) {
    assert.ok(classesBlur.indexOf(tok) === -1, 'classes: blur must not touch ' + tok);
  });
  function fnSlice(sec, sig) {
    var start = sec.indexOf(sig);
    assert.ok(start !== -1, sig + ' found');
    var end = sec.indexOf('}', start);
    assert.ok(end !== -1, sig + ' bounds');
    return sec.slice(start, end + 1);
  }
  // the menu edges: openMenu arms the fact, closeMenu drops it + focus
  var openSlice = fnSlice(teachers, 'function openMenu()');
  assert.ok(openSlice.indexOf('menuOpen = true') !== -1, 'openMenu arms the fact');
  var closeSlice = fnSlice(teachers, 'function closeMenu()');
  assert.ok(closeSlice.indexOf('menuOpen = false') !== -1, 'closeMenu drops the fact');
  assert.ok(closeSlice.indexOf('search.blur()') !== -1, 'closeMenu removes focus');
  // focus and filter-box taps bring the menu back through openMenu
  assert.ok(handlerSlice(teachers, "addEventListener('focus'").indexOf('openMenu()') !== -1,
    'teachers: focus opens the menu');
  assert.ok(handlerSlice(teachers, "search.addEventListener('click'").indexOf('openMenu()') !== -1,
    'teachers: a filter-box tap opens the menu');
  // classes runs the same machine (issue 058): menu edges + both box handlers
  var classesOpen = fnSlice(classes, 'function openMenu()');
  assert.ok(classesOpen.indexOf('menuOpen = true') !== -1, 'classes: openMenu arms the fact');
  var classesClose = fnSlice(classes, 'function closeMenu()');
  assert.ok(classesClose.indexOf('menuOpen = false') !== -1, 'classes: closeMenu drops the fact');
  assert.ok(classesClose.indexOf('search.blur()') !== -1, 'classes: closeMenu removes focus');
  assert.ok(handlerSlice(classes, "addEventListener('focus'").indexOf('openMenu()') !== -1,
    'classes: focus opens the menu');
  assert.ok(handlerSlice(classes, "search.addEventListener('click'").indexOf('openMenu()') !== -1,
    'classes: a filter-box tap opens the menu');
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
  assert.ok(commitFn.indexOf('selectTeacher(exact);') !== -1,
    'exact commit selects through the single funnel');
  assert.ok(commitFn.indexOf('selectTeacher(only.teacher);') !== -1,
    'single-hit commit selects through the single funnel');
  assert.ok(commitFn.indexOf('showTeacher(') === -1,
    'commit must not bypass the selection funnel');
  var classes = CLASSES_SRC.slice(CLASSES_SRC.indexOf('function initClassesPage'));
  assert.ok(classes.indexOf('var like = exactClass(rows, q);') !== -1, 'classes commit computes exact');
  assert.ok(classes.indexOf('selectClass(like);') !== -1, 'exact class label selects through the funnel');
});

test('teachers nav chrome: state-gated back arrow, teacher overlay, V gone', function () {
  ['id="searchBack"', 'id="searchOverlay"', 'id="overlayClear"', 'id="overlayName"'].forEach(function (id) {
    assert.ok(INDEX_SRC.indexOf(id) !== -1, 'index.html missing ' + id);
  });
  assert.ok(INDEX_SRC.indexOf('id="searchDone"') === -1,
    'the V-chevron is gone from the teachers page');
  var base = CSS_SRC.slice(0, CSS_SRC.indexOf('@media (max-width: 700px)'));
  assert.ok(base.indexOf('#searchBack { display: none; }') !== -1,
    'desktop armour: the back arrow is display:none at base');
  assert.ok(base.indexOf('#searchOverlay { display: none; }') !== -1,
    'desktop armour: the teacher overlay is display:none at base');
  var narrow = CSS_SRC.slice(CSS_SRC.indexOf('@media (max-width: 700px)'));
  assert.ok(narrow.indexOf('#layout.is-list #searchBack') !== -1,
    'back arrow is gated on the list state, not on focus');
  assert.ok(narrow.indexOf('#searchOverlay:not([hidden])') !== -1,
    'overlay renders from its attribute on narrow screens');
  assert.ok(CSS_SRC.indexOf('#searchWrap:focus-within #searchBack') === -1,
    'the back control must never be focus-gated (anti-D4 regression pin)');
  // issue 057: the overlay matches the wrap's box chrome (radius only) and the
  // input under it goes invisible, keyed on the overlay's attribute
  var ovAt = narrow.indexOf('#searchOverlay:not([hidden])');
  var ovRule = narrow.slice(ovAt, narrow.indexOf('}', ovAt));
  assert.ok(ovRule.indexOf('border-radius: 8px') !== -1,
    'overlay takes the wrap 8px radius (square corners over the rounded box = issue 057)');
  assert.ok(narrow.indexOf('#searchWrap:has(#searchOverlay:not([hidden])) #search') !== -1,
    'the input hides while the overlay shows (narrow block)');
  assert.ok(CSS_SRC.indexOf('#searchWrap:has(#searchOverlay:not([hidden])) #search')
    > CSS_SRC.indexOf('@media (max-width: 700px)'),
    'the input-hide rule must stay narrow-only (a base-level copy would blank the desktop input)');
  assert.ok(CSS_SRC.indexOf('#searchWrap:focus-within #search ') === -1,
    'the input hide keys on the overlay attribute, never on focus');
});

test('nav machine: single selection/empty funnels, harness-safe showTeacher', function () {
  assert.ok(APP_SRC.indexOf('var menuOpen = false;') !== -1, 'menuOpen fact declared');
  assert.ok(APP_SRC.indexOf('var selectedTeacher = null;') !== -1, 'selectedTeacher fact declared');
  assert.ok(APP_SRC.indexOf('var lastResultCount') === -1, 'lastResultCount is dead');
  var fn = showTeacherFn();
  assert.ok(fn.indexOf('menuOpen') === -1, 'showTeacher must not read menuOpen (vm harness)');
  assert.ok(fn.indexOf('search.blur') === -1, 'showTeacher must not blur (vm harness)');
  function fnBody(sig) {
    var start = APP_SRC.indexOf(sig);
    assert.ok(start !== -1, sig + ' found');
    var end = APP_SRC.indexOf('\n    }', start);
    assert.ok(end !== -1, sig + ' bounds');
    return APP_SRC.slice(start, end + '\n    }'.length);
  }
  var sel = fnBody('function selectTeacher(name)');
  ['selectedTeacher = name', 'showTeacher(name)', 'search.blur()', 'menuOpen = false'].forEach(function (tok) {
    assert.ok(sel.indexOf(tok) !== -1, 'selectTeacher: ' + tok);
  });
  var emp = fnBody('function showEmpty()');
  ['selectedTeacher = null', 'emptyStateHTML()', 'markActive(null)'].forEach(function (tok) {
    assert.ok(emp.indexOf(tok) !== -1, 'showEmpty: ' + tok);
  });
  var inputFn = fnBody('function onInput()');
  assert.ok(inputFn.indexOf('showEmpty();') !== -1, 'onInput: empty filter deselects');
  assert.ok(inputFn.indexOf('selectTeacher(only.teacher)') !== -1, 'onInput: auto-jump selects via the funnel');
  var rowStart = APP_SRC.indexOf('function renderItem(r)');
  var rowWiring = APP_SRC.slice(rowStart, APP_SRC.indexOf('function onlyHit(res)', rowStart));
  assert.ok(rowWiring.indexOf('selectTeacher(r.teacher)') !== -1, 'row tap selects via the funnel');
  var ovStart = APP_SRC.indexOf('searchOverlay.addEventListener');
  assert.ok(ovStart !== -1, 'overlay wiring found');
  var ovWiring = APP_SRC.slice(ovStart, APP_SRC.indexOf('showEmpty();', ovStart) + 'showEmpty();'.length);
  assert.ok(ovWiring.indexOf('openMenu()') !== -1, 'overlay tap reopens the list');
  assert.ok(ovWiring.indexOf('search.focus()') !== -1, 'overlay tap focuses the box');
  assert.ok(ovWiring.indexOf('stopPropagation') !== -1, 'overlay X does not bubble to the surface');
  assert.ok(ovWiring.indexOf('showEmpty()') !== -1, 'overlay X deselects');
});

// ---- live detail from the one clock (issue 051) ------------------------------

function countTok(hay, needle) { return hay.split(needle).length - 1; }

// runShowTeacherLive drives the real showTeacher twice in ONE context: a
// selection (no tickNow) at clockA, then a clock-driven re-render at clockB.
// The selection-only side effects are counted to prove they stay off the
// live path.
function runShowTeacherLive(name, clockA, clockB) {
  var stampMs = clockA.getTime();
  function FakeDate() { return new RealDate(stampMs); }
  var counts = { writes: 0, suggest: 0, ghost: 0, clear: 0, layout: 0 };
  var lastHtml = '';
  var detail = {};
  Object.defineProperty(detail, 'innerHTML', {
    get: function () { return lastHtml; },
    set: function (v) { lastHtml = v; counts.writes++; }
  });
  var layout = { classList: { remove: function () { counts.layout++; } } };
  var sandbox = {
    console: console,
    model: model, color: color, esc: data.esc,
    modelObjs: modelObjs, store: store,
    detail: detail,
    markActive: function () {},
    layout: layout,
    syncClear: function () { counts.clear++; },
    renderSuggest: function () { counts.suggest++; },
    renderGhost: function () { counts.ghost++; },
    Date: FakeDate
  };
  vm.createContext(sandbox);
  vm.runInContext(arrowStmt() + '\n' + teacherSlice(), sandbox, { filename: 'showTeacher-live-harness' });
  vm.runInContext('showTeacher(' + JSON.stringify(name) + ');', sandbox, { filename: 'showTeacher-select' });
  var selectHtml = lastHtml;
  var selectCounts = JSON.parse(JSON.stringify(counts));
  stampMs = clockB.getTime();
  vm.runInContext('showTeacher(' + JSON.stringify(name) + ', new Date());', sandbox,
    { filename: 'showTeacher-tick' });
  return {
    sandbox: sandbox,
    selectHtml: selectHtml, tickHtml: lastHtml,
    selectCounts: selectCounts, tickCounts: JSON.parse(JSON.stringify(counts))
  };
}

function teacherRowAt(html, time) {
  return html.split('<tr').filter(function (r) {
    return r.indexOf('c-time">' + time + '<') !== -1;
  }).join('');
}

// runTeachersTick drives the real buildAvail + onTick with no selection:
// the real store/model/match, a counting list renderer and a counting
// detail renderer (the slice keeps renderList/showTeacher stubbable).
function runTeachersTick(clockA, clockB) {
  var stampMs = clockA.getTime();
  function FakeDate() { return new RealDate(stampMs); }
  var captured = { sections: null, listCalls: 0, showCalls: 0 };
  var sandbox = {
    console: console,
    model: model, match: match, color: color, esc: data.esc,
    store: store, index: index,
    search: { value: '' },
    status: { textContent: '' },
    renderList: function (sections) { captured.sections = sections; captured.listCalls++; },
    showTeacher: function () { captured.showCalls++; },
    avail: undefined, now: undefined, currentTeacher: undefined,
    Date: FakeDate
  };
  vm.createContext(sandbox);
  var sliceA = APP_SRC.slice(APP_SRC.indexOf('function buildAvail'), APP_SRC.indexOf('function renderList'));
  var sliceB = APP_SRC.slice(APP_SRC.indexOf('function onTick'), APP_SRC.indexOf('function breakdownHTML'));
  assert.ok(sliceA.indexOf('function buildAvail()') !== -1 && sliceA.indexOf('function onTick') === -1,
    'buildAvail slice bound');
  assert.ok(sliceB.indexOf('function onTick') !== -1 && sliceB.indexOf('function breakdownHTML') === -1,
    'onTick slice bound');
  vm.runInContext(sliceA + '\n' + sliceB, sandbox, { filename: 'teachers-tick-harness' });
  vm.runInContext('onTick(new Date());', sandbox);
  var wedOrder = teacherOrderOf(captured.sections);
  stampMs = clockB.getTime();
  vm.runInContext('onTick(new Date());', sandbox);
  return {
    sandbox: sandbox, captured: captured,
    wedOrder: wedOrder, sunOrder: teacherOrderOf(captured.sections)
  };
}

function teacherOrderOf(sections) {
  var out = [];
  (sections || []).forEach(function (sec) {
    (sec.hits || []).forEach(function (hit) { out.push(hit.teacher); });
  });
  return out;
}

test('teachers.js drives availability and the open detail from one clock (issue 051)', function () {
  var src = APP_SRC;
  assert.strictEqual(countTok(src, 'new Date()'), 3,
    'page capture + the showTeacher fallback + the clock tick');
  assert.strictEqual(countTok(src, 'clock.subscribe(onTick);'), 1, 'one subscription per page');
  assert.ok(src.indexOf('setInterval(tick, 30000)') !== -1, 'the clock owns the 30 s interval');
  assert.ok(src.indexOf('compute once per page load') === -1,
    'the one-shot availability comment is gone');
  ['listKeyOf', 'lastListKey', 'lastDetailH'].forEach(function (tok) {
    assert.ok(src.indexOf(tok) === -1, 'no gate state: ' + tok);
  });
  assert.ok(src.indexOf('h !== ') === -1, 'no emitted-string gate');
  // ownership drops in the one deselect funnel (so every caller — including
  // the overlay X — is covered) and in the nomatch branch, which never
  // reaches showEmpty
  assert.strictEqual(countTok(src, 'currentTeacher = null;'), 2,
    'the empty funnel and the nomatch branch drop ownership');
  var showEmptySlice = src.slice(src.indexOf('function showEmpty'),
    src.indexOf('function selectTeacher'));
  assert.ok(showEmptySlice.indexOf('currentTeacher = null;') !== -1,
    'showEmpty drops tick ownership (every deselect path is covered)');
  assert.ok(src.indexOf('function buildAvail()') !== -1, 'availability moved into a rebuildable');
  assert.strictEqual(countTok(src, 'model.availability(store.sessionsOf(n), now)'), 1,
    'one availability computation');
  var onTickSlice = src.slice(src.indexOf('function onTick'), src.indexOf('function breakdownHTML'));
  ['now = t;', 'buildAvail();',
   'renderList(match.searchSections(index, search.value, avail).sections);',
   'showTeacher(currentTeacher, t)'].forEach(function (tok) {
    assert.ok(onTickSlice.indexOf(tok) !== -1, 'onTick: ' + tok);
  });
  var fn = showTeacherFn();
  assert.ok(fn.indexOf('function showTeacher(name, tickNow)') !== -1, 'tick payload param');
  assert.ok(fn.indexOf('var now2 = tickNow || new Date();') !== -1,
    'the detail grades on the tick clock');
  assert.ok(fn.indexOf('if (!tickNow)') !== -1, 'selection side effects are fenced');
  assert.ok(fn.indexOf('lastDetailH') === -1, 'no gate state in showTeacher');
  assert.ok(teacherSlice().indexOf('function breakdownHTML(t)') === 0,
    'teacherSlice still starts at breakdownHTML');
  assert.ok(APP_SRC.indexOf('function markActive(name)') >
    APP_SRC.indexOf('function breakdownHTML(t)'),
    'teacherSlice still ends at markActive');
});

test('selecting a teacher renders once; a live re-render moves the marks (issue 051)', function () {
  var h = runShowTeacherLive('Bannour', wed(10, 30), wed(12, 0));
  var sel = h.selectCounts;
  assert.strictEqual(sel.writes, 1, 'one write per selection');
  assert.ok(h.selectHtml.indexOf('nowtag') === -1, 'nothing is NOW for Bannour at Wed 10:30');
  assert.ok(teacherRowAt(h.selectHtml, '11h40-13h10').indexOf('nexttag') !== -1,
    'NEXT marks her 11h40-13h10 Wednesday slot');
  assert.strictEqual(sel.suggest, 1, 'the selection dismisses the autocomplete');
  assert.strictEqual(sel.ghost, 1, 'the selection clears the ghost');
  assert.strictEqual(sel.layout, 1, 'the selection dismisses the list pane');
  assert.strictEqual(sel.clear, 1, 'the selection syncs the clear control');
  var tick = h.tickCounts;
  assert.strictEqual(tick.writes, 2, 'the live re-render writes unconditionally');
  assert.ok(teacherRowAt(h.tickHtml, '11h40-13h10').indexOf('<span class="nowtag">● NOW</span>') !== -1,
    'NOW moves onto the fresh slot');
  assert.strictEqual(tick.suggest, 1, 'a tick never dismisses the autocomplete');
  assert.strictEqual(tick.ghost, 1, 'a tick never clears the ghost');
  assert.strictEqual(tick.layout, 1, 'a tick never flips the pane');
  assert.strictEqual(tick.clear, 1, 'a tick never syncs the clear control');
});

test('a live teacher re-render with unchanged time state rewrites anyway and keeps the anchor (issue 051)', function () {
  var h = runShowTeacherLive('Barboura', fri(12, 0), fri(12, 0));
  assert.strictEqual(h.selectCounts.writes, 1, 'one write per selection');
  assert.strictEqual(h.tickCounts.writes, 2, 're-render on the hit, not on a diff');
  assert.strictEqual(headingsOf(h.selectHtml)[0], 'vendredi', 'the anchor on selection');
  assert.strictEqual(headingsOf(h.tickHtml)[0], 'vendredi', 'the anchor is stable within a day');
});

test('a teachers tick with no selection re-renders only the list, from the fresh clock (issue 051)', function () {
  var h = runTeachersTick(wed(10, 30), sun(10, 0));
  assert.ok(h.captured.listCalls >= 2, 'the list re-rendered on every hit');
  assert.strictEqual(h.captured.showCalls, 0, 'no detail is touched without a selection');
  assert.notDeepStrictEqual(h.sunOrder, h.wedOrder, 'availability re-ranks the list');
  assert.notStrictEqual(h.wedOrder[1], h.sunOrder[1],
    'the fresh order differs from position 2 (the Sunday collapse)');
  var availSun = {};
  store.teachers.forEach(function (n) {
    availSun[n] = model.availability(store.sessionsOf(n), new Date(sun(10, 0)));
  });
  store.teachers.forEach(function (n) {
    assert.strictEqual(h.sandbox.avail[n], availSun[n], 'avail rebuilt from the fresh clock: ' + n);
  });
  var fresh = teacherOrderOf(match.searchSections(index, '', availSun).sections);
  assert.deepStrictEqual(h.sunOrder, fresh, 'the fresh Sunday order is the real alphabetical collapse');
});

// Tests for the teacher day groups (one shared markup for desktop + mobile) —
// run with `node --test test/`.
//
// ESM/Sveltekit retarget of the legacy page tests: the behavioral battery
// drives the real lib computations (app/src/lib/model.js fuseSessions /
// nextSessionIdx / isCurrentSession / startFromToday / availability — the
// exact derivations the teachers page runs) directly against the real
// emplois.csv with fixed Dates, and the rendering shape is pinned
// structurally on app/src/routes/teachers/+page.svelte and the shared
// stylesheet (app/static/app.css). No component runner, no vm DOM stubs.

import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createStore } from '../app/src/lib/data.js';
import * as model from '../app/src/lib/model.js';
import * as searchTeachers from '../app/src/lib/search-teachers.js';
import { fuzzyRanges } from '../app/src/lib/search.js';
import * as color from '../app/src/lib/color.js';
import { CSV_PATH, readSrc } from './helpers.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

var store = createStore(fs.readFileSync(CSV_PATH, 'utf8'));
var modelObjs = model.buildAll(store);
var groups = modelObjs.groups;
var index = searchTeachers.buildTeacherIndex(store, modelObjs.groups);

var TEACHERS = readSrc('app', 'src', 'routes', 'teachers', '+page.svelte');
var CSS_SRC = readSrc('app', 'static', 'app.css');

// ---- fixed clocks -----------------------------------------------------------
// 2026 (same week figures as the pre-port run): Wed 2026-09-14, Fri 16,
// Sat 17, Sun 11.
function at(h, m, day, month) {
  return new Date(2026, month === undefined ? 9 : month, day || 14, h, m);
}
function wed(h, m) { return at(h, m, 14); }
function fri(h, m) { return at(h, m, 16); }
function sat(h, m) { return at(h, m, 17); }
function sun(h, m) { return at(h, m, 11); }

// ---- the page's derivation, driven directly on the lib ----------------------

// The teachers page derives the whole detail from (selectedTeacher, now):
// see the `detailGroups` $derived in app/src/routes/teachers/+page.svelte.
// This mirror runs the same lib calls, the same way, with a fixed Date —
// the structural pins below guarantee the template consumes exactly these
// derivations, so this record is the rendered output the page will paint.
function derive(name, now) {
  const t = modelObjs.teachers[name];
  assert.ok(t, name + ' is a fixture teacher');
  const ss = model.fuseSessions(store.sessionsOf(name), groups);
  const now2 = now;
  const upcoming = model.nextSessionIdx(ss, now2);
  const liveDays = {};
  ss.forEach(function (s, i) {
    if (model.isCurrentSession(s.day, s.time, now2) || upcoming.has(i)) liveDays[s.day] = true;
  });
  let dayOrder = [];
  const byDay = {};
  ss.forEach(function (s, i) {
    if (!byDay[s.day]) { byDay[s.day] = []; dayOrder.push(s.day); }
    byDay[s.day].push({ s: s, i: i });
  });
  dayOrder = model.startFromToday(dayOrder, ss, now2);
  return { t: t, ss: ss, upcoming: upcoming, liveDays: liveDays, dayOrder: dayOrder, byDay: byDay };
}

// The spec-side expectation, computed the way the pre-port test computed it
// (independent walk over the fused rows).
function expectations(name, now) {
  const ss = model.fuseSessions(store.sessionsOf(name), groups);
  const upcoming = model.nextSessionIdx(ss, now);
  const live = {}, wantNow = {}, wantNext = {};
  ss.forEach(function (s, i) {
    const isNow = model.isCurrentSession(s.day, s.time, now);
    if (isNow || upcoming.has(i)) live[s.day] = true;
    if (isNow) wantNow[s.day + '|' + s.time] = true;
    else if (upcoming.has(i)) wantNext[s.day + '|' + s.time] = true;
  });
  const distinct = [];
  ss.forEach(function (s) { if (distinct.indexOf(s.day) === -1) distinct.push(s.day); });
  const rotated = model.startFromToday(distinct, ss, now);
  const heads = rotated.map(function (d) { return model.frDay(d); });
  return { ss: ss, upcoming: upcoming, live: live, wantNow: wantNow, wantNext: wantNext,
           distinct: distinct, rotated: rotated, heads: heads };
}

// Behavioral battery shared by every fixture: the derived detail must equal
// the spec walk — order, dim, NOW/NEXT — and the row vocabulary must pass
// through color.sessionRow exactly as the template does.
function checkInvariants(name, clock) {
  const d = derive(name, clock);
  const want = expectations(name, clock);

  // one group per distinct day, start-from-today, none for empty days
  assert.deepStrictEqual(d.dayOrder, want.rotated,
    name + ': one group per distinct day, start-from-today');
  d.dayOrder.forEach(function (day) {
    assert.ok(want.distinct.indexOf(day) !== -1,
      name + ': no group for empty day ' + day);
  });
  assert.strictEqual(d.dayOrder.length, want.distinct.length,
    name + ': one section per distinct day');
  store.days.forEach(function (day) {
    if (want.distinct.indexOf(day) === -1)
      assert.ok(d.dayOrder.indexOf(day) === -1,
        name + ': no group for empty day ' + day);
  });

  // row total across the per-day maps == ss.length
  let total = 0, gotNow = {}, gotNext = {}, rowsWithCells = 0;
  d.dayOrder.forEach(function (day, gi) {
    const entries = d.byDay[day];
    assert.ok(entries.length > 0, name + ': every group has rows (' + day + ')');
    entries.forEach(function (e) {
      total++;
      // the template row: 5 cells (gutter + time/room/subject/class)
      assert.ok(e.s.time, name + ': every row has a time cell');
      rowsWithCells++;
      const isNow = model.isCurrentSession(e.s.day, e.s.time, clock);
      const isNext = !isNow && d.upcoming.has(e.i);
      if (isNow) gotNow[e.s.day + '|' + e.s.time] = true;
      else if (isNext) gotNext[e.s.day + '|' + e.s.time] = true;
      // row classes flow through the real color engine (template: rowClasses)
      assert.deepStrictEqual(
        color.sessionRow({ isNow: isNow, isNext: isNext, dimIdle: false }),
        model.isCurrentSession(e.s.day, e.s.time, clock)
          ? [color.CLASSES.now]
          : (d.upcoming.has(e.i) ? [color.CLASSES.next] : []),
        name + ': row classes are now/next driven only (' + e.s.time + ')');
    });
  });
  assert.strictEqual(total, want.ss.length, name + ': row total == ss.length');
  assert.strictEqual(rowsWithCells, want.ss.length, name + ': every row carries cells');

  assert.deepStrictEqual(gotNow, want.wantNow, name + ': NOW rows match the spec walk');
  assert.deepStrictEqual(gotNext, want.wantNext, name + ': NEXT rows match the spec walk');

  // dim on the section iff its day has no now/next
  d.dayOrder.forEach(function (day) {
    const dimmed = !d.liveDays[day];
    assert.strictEqual(dimmed, !want.live[day],
      name + ': dim on section iff day has no now/next (' + day + ')');
  });

  // breakdown stays: subjects and classes ranked by hours
  assert.ok(color && d.t.subjects.length > 0, name + ': subject buckets derive');
  return { d: d, want: want };
}

// ---- structural pins on the teachers page template --------------------------

// the markup section of the page (template body after the script block)
function markupOf() {
  const at = TEACHERS.indexOf('</script>');
  return TEACHERS.slice(at);
}
// the derivation block (script body)
function scriptOf() {
  const at = TEACHERS.indexOf('</script>');
  return TEACHERS.slice(0, at);
}

test('the teachers detail renders one heading + section per day with no Day column', function () {
  const m = markupOf();
  assert.ok(m.indexOf('<section class="day-group') !== -1, 'missing day-group section');
  assert.ok(m.indexOf('<h3 class="day-head">') !== -1, 'missing day-head h3');
  assert.ok(m.indexOf('<table class="t-sessions">') !== -1, 'missing t-sessions table');
  assert.ok(m.indexOf('<dl class="class-facts teacher-facts">') !== -1,
    'teacher details must render key/value facts');
  assert.ok(m.indexOf('Subject</dt>') !== -1 && m.indexOf('Class</dt>') !== -1,
    'teacher facts must expose Subject and Class keys');
  assert.ok(m.indexOf('<dd class="fact-value">~ ') !== -1,
    'teacher facts must prefix values with a tilde');
  assert.ok(m.indexOf('<tr><th></th><th>Time</th><th>Room</th><th>Subject</th><th>Class</th></tr>') !== -1,
    'header must be gutter/Time/Room/Subject/Class with no Day column');
  assert.ok(m.indexOf('<th>Day') === -1, 'no Day header in teacher output');
  assert.ok(TEACHERS.indexOf('c-day') === -1, 'no c-day cells in teacher output');
  assert.ok(TEACHERS.indexOf('<hr') === -1, 'no rule elements in teacher output');
  // heading is a sibling BEFORE the card, not a child of it
  assert.ok(m.indexOf('<h3 class="day-head">') < m.indexOf('<section class="day-group'),
    'day-head h3 must be emitted before the day-group section');
  // the heading text is the lib day name, per group
  assert.ok(m.indexOf('{model.frDay(day)}</h3>') !== -1,
    'each day-head renders frDay of its group key');
  assert.ok(m.indexOf('class="count"') === -1, 'no session count captions');
  // breakdown unchanged
  assert.ok(m.indexOf('<h3>Subjects (ranked by hours)</h3>') !== -1, 'breakdown subjects kept');
  assert.ok(m.indexOf('<h3>Classes (ranked by hours)</h3>') !== -1, 'breakdown classes kept');
  // the groups iterate the derived day order
  assert.ok(scriptOf().indexOf('{#each detailGroups.dayOrder as day (day)}') === -1,
    'the each lives in the template, not the derivation');
  assert.ok(markupOf().indexOf('{#each detailGroups.dayOrder as day (day)}') !== -1,
    'the markup groups over the derived dayOrder');
});

test('teacher search results label matched subject and class attributes', function () {
  // the list row body (rowHTML in the page script)
  assert.ok(TEACHERS.indexOf('<b>Subject:</b>') !== -1, 'subject matches need a key label');
  assert.ok(TEACHERS.indexOf('<b>Class:</b>') !== -1, 'class matches need a key label');
  assert.strictEqual(TEACHERS.indexOf('<br><span class="fmatch"'), -1,
    'subject matches must not add a redundant break before block rows');
  assert.strictEqual(TEACHERS.indexOf('<br><span class="cmatch"'), -1,
    'class matches must not add a redundant break before block rows');
});

test('the detail derives no prevDay/dayStart; dim lives on the section', function () {
  const d = derive('Barboura', fri(12, 0));
  assert.ok(d.liveDays && d.dayOrder, 'the live-days computation must stay');
  assert.ok(TEACHERS.indexOf('prevDay') === -1, 'prevDay tracking must be gone');
  assert.ok(TEACHERS.indexOf('dayStart') === -1, 'dayStart must not reach the detail rows');
  assert.ok(TEACHERS.indexOf('liveDays') !== -1, 'liveDays computation must stay');
  assert.ok(markupOf().indexOf('<section class="day-group{') !== -1 &&
    markupOf().indexOf("liveDays[day] ? '' : ' dim'") !== -1,
    'dim must live on the section class');
  assert.ok(TEACHERS.indexOf('color.sessionRow(') !== -1, 'rows still use color.sessionRow');
  // the NEXT gutter: the nextarrow class reuses the shared arrow glyph
  assert.ok(TEACHERS.indexOf('<span class="nexttag"') !== -1 && TEACHERS.indexOf('class="nextarrow"') !== -1,
    'the NEXT capsule renders with the shared next arrow');
  assert.ok(TEACHERS.indexOf('model.isCurrentSession(entry.s.day, entry.s.time, now)') !== -1,
    'NOW logic unchanged');
  assert.ok(TEACHERS.indexOf('detailGroups.upcoming.has(entry.i)') !== -1,
    'NEXT logic unchanged');
});

test('the classes list does not live on the teachers page', function () {
  // the per-page split: the teachers page defines no class-list machinery
  assert.ok(TEACHERS.indexOf('#classList') === -1, 'no classList markup on the teachers page');
  assert.ok(TEACHERS.indexOf('exactClass') === -1, 'no class exact-match funnel');
  assert.ok(TEACHERS.indexOf('c-sessions') === -1, 'the classes card table stays on the classes page');
  assert.ok(TEACHERS.indexOf('c-day') === -1, 'no classes day column here either');
  // and the color vocabulary the classes list uses stays defined in the lib
  const colorSrc = fs.readFileSync(path.join(ROOT, 'app/src/lib/color.js'), 'utf8');
  assert.ok(colorSrc.indexOf("dayStart: 'daystart'") !== -1, 'color.js dayStart key must stay');
  assert.ok(colorSrc.indexOf('if (st.dayStart) c.push(CLASSES.dayStart);') !== -1,
    'sessionRow still consumes the dayStart flag');
});

// ---- behavioral battery (shared by every fixture) ---------------------------

test('Barboura at Fri 12:00 groups 12 fused rows with live Friday markers', function () {
  const r = checkInvariants('Barboura', fri(12, 0));
  assert.strictEqual(r.d.ss.length, 12, 'Barboura fuses to 12 rows');
  assert.strictEqual(r.d.dayOrder[0].toLowerCase(), 'vendredi');
  // Friday 12h00 sits inside 11h40-13h10: that row is NOW, 13h20-14h50 is NEXT
  assert.strictEqual(r.want.wantNow['VENDREDI|11h40-13h10'], true, 'expected a NOW row');
  assert.strictEqual(r.want.wantNext['VENDREDI|13h20-14h50'], true, 'expected a NEXT row');
});

test('Dlima at Fri 12:00 marks only the single next capsule, no NOW', function () {
  const r = checkInvariants('Dlima', fri(12, 0));
  assert.strictEqual(r.d.ss.length, 10, 'Dlima keeps 10 rows');
  // the rotation case: vendredi first, then mardi… cyclic
  assert.strictEqual(r.d.dayOrder[0].toLowerCase(), 'vendredi');
  assert.strictEqual(Object.keys(r.want.wantNow).length, 0, 'no NOW at Fri 12:00 for Dlima');
  assert.strictEqual(Object.keys(r.want.wantNext).length, 1, 'single NEXT capsule');
});

test('Barboura on Sunday morning marks the wrapped next session only', function () {
  const r = checkInvariants('Barboura', sun(10, 0));
  assert.strictEqual(r.d.dayOrder[0].toLowerCase(), 'jeudi');
  assert.strictEqual(Object.keys(r.want.wantNow).length, 0, 'nothing is NOW on Sunday');
  assert.strictEqual(Object.keys(r.want.wantNext).length >= 1, true, 'wrapped NEXT still marks');
});

test('Barboura at Sat 18:30 rolls past the finished Saturday to Thursday', function () {
  const r = checkInvariants('Barboura', sat(18, 30));
  assert.strictEqual(r.d.dayOrder[0].toLowerCase(), 'jeudi');
  assert.strictEqual(Object.keys(r.want.wantNow).length, 0, 'nothing is NOW at Sat 18:30');
  assert.strictEqual(Object.keys(r.want.wantNext).length >= 1, true, 'wrapped NEXT still marks');
});

// ---- app.css asserts -----------------------------------------------------------

test('app.css defines day-group/day-head in the group-head language', function () {
  assert.ok(CSS_SRC.indexOf('.day-group') !== -1, 'missing .day-group');
  assert.ok(CSS_SRC.indexOf('.day-head') !== -1, 'missing .day-head');
  const head = CSS_SRC.slice(CSS_SRC.indexOf('#detail .day-head'),
    CSS_SRC.indexOf('}', CSS_SRC.indexOf('#detail .day-head')) + 1);
  ['uppercase', 'letter-spacing', '600', 'var(--md-on-surface-variant'].forEach(function (tok) {
    assert.ok(head.indexOf(tok) !== -1, 'day-head must reuse the group-head language: ' + tok);
  });
  assert.ok(head.indexOf('DynaPuff') === -1 && head.indexOf('Tiny5') === -1,
    'day-head must not use display faces');
  assert.ok(CSS_SRC.indexOf('#detail .day-group.dim') !== -1, 'missing dimmed-group rule');
});

test('app.css re-scopes the desktop gutter hang to per-group tables', function () {
  assert.ok(CSS_SRC.indexOf('#layout > #detail .day-group table') !== -1,
    'gutter hang must apply per .day-group table');
  assert.ok(CSS_SRC.indexOf('#detail table.t-sessions') === -1,
    'unscoped teacher gutter rule must be gone');
  assert.ok(CSS_SRC.indexOf('td:first-child:has(> .nowtag)') !== -1,
    'desktop NOW gutter restores left-side padding');
  assert.ok(CSS_SRC.indexOf('td:first-child:has(> .nexttag)') !== -1,
    'desktop NEXT gutter restores left-side padding');
});

test('day headings show on every viewport', function () {
  const deskStart = CSS_SRC.indexOf('@media (min-width: 701px)');
  const narrowStart = CSS_SRC.indexOf('@media (max-width: 700px)');
  assert.ok(deskStart !== -1 && narrowStart !== -1 && deskStart < narrowStart,
    'expected desktop block before narrow block');
  const desktop = CSS_SRC.slice(deskStart, narrowStart);
  assert.ok(desktop.indexOf('#detail .day-head') === -1,
    'desktop must not rule on day headings');
  assert.ok(!/\.day-head\s*\{\s*display\s*:\s*none/.test(CSS_SRC),
    'no day-head may be hidden on any viewport');
  const narrow = CSS_SRC.slice(narrowStart);
  assert.ok(narrow.indexOf('#detail .day-head') !== -1,
    'narrow must keep styling the day heading');
});

test('mobile cards key on the section with tr + tr dividers, heading outside', function () {
  const narrow = CSS_SRC.slice(CSS_SRC.indexOf('@media (max-width: 700px)'));
  assert.ok(narrow.indexOf('#detail .day-group') !== -1, 'mobile card must key on the section');
  const card = narrow.slice(narrow.indexOf('#detail .day-group {'),
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
  const div = narrow.slice(narrow.indexOf('.day-group tr:has(td) + tr:has(td)'));
  assert.ok(div.slice(0, 120).indexOf('border-top') !== -1, 'divider must be a border-top');
});

test('mobile tinted rows full-bleed across the day-group card', function () {
  const narrow = CSS_SRC.slice(CSS_SRC.indexOf('@media (max-width: 700px)'));
  ['tr.now', 'tr.next'].forEach(function (tok) {
    assert.ok(narrow.indexOf('.day-group ' + tok) !== -1,
      'tinted ' + tok + ' rows inside .day-group must be handled');
  });
  const bleed = narrow.slice(narrow.indexOf('.day-group tr.now'));
  assert.ok(bleed.indexOf('margin-left: -.7rem') !== -1, 'full-bleed needs negative left margin');
  assert.ok(bleed.indexOf('margin-right: -.7rem') !== -1, 'full-bleed needs negative right margin');
  assert.ok(bleed.indexOf('padding-left: .7rem') !== -1, 'content stays inset via left padding');
  assert.ok(bleed.indexOf('padding-right: .7rem') !== -1, 'content stays inset via right padding');
  // vertical rhythm untouched: only horizontal margins/padding, no vertical override
  const rule = bleed.slice(bleed.indexOf('{'), bleed.indexOf('}') + 1);
  assert.ok(rule.indexOf('padding:') === -1, 'must not reset the .35rem vertical padding');
  assert.ok(rule.indexOf('margin:') === -1 || rule.indexOf('margin-left') !== -1,
    'must not reset the vertical margins');
  // card clips square tinted backgrounds to its rounded corners
  const cardBlock = narrow.slice(narrow.indexOf('#detail .day-group {'),
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
  const narrow = CSS_SRC.slice(CSS_SRC.indexOf('@media (max-width: 700px)'));
  assert.ok(narrow.indexOf('#layout > #detail { overflow: visible; }') !== -1,
    'narrow #detail must not trap scroll (base overflow-x:auto computes overflow-y:auto)');
});

test('narrow screens swap menu and cards on focus/select only', function () {
  const narrow = CSS_SRC.slice(CSS_SRC.indexOf('@media (max-width: 700px)'));
  // one pane at a time, with no pointer gate: focusing the filter shows the
  // menu, selecting shows the cards, blur affects neither
  assert.ok(narrow.indexOf('#layout:not(.is-list) #teacherList') !== -1,
    'narrow hides the teacher list off-menu');
  assert.ok(narrow.indexOf('#layout.is-list #detail') !== -1,
    'narrow hides detail while on-menu');
  assert.ok(narrow.indexOf('@media (pointer: coarse)') === -1,
    'swap must not depend on pointer type');
});

test('app.css keeps the classes guards intact', function () {
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

// ---- menu machine ------------------------------------------------------------

test('menu visibility is selection-driven, never blur-driven', function () {
  // one fact pair, three named states: the layout class is written by the
  // markup class binding, not by any imperative add/remove
  assert.ok(TEACHERS.indexOf('<div id="layout" class={menuOpen ? \'is-list\' : \'\'}>') !== -1,
    'the layout carries the is-list fact directly');
  // blur stays pure: it drops the suggest overlay and nothing else
  // (a press in flight must never lose its row)
  const blurAt = TEACHERS.indexOf('function onBlur()');
  assert.ok(blurAt !== -1, 'blur handler found');
  const blur = TEACHERS.slice(blurAt, TEACHERS.indexOf('}', blurAt) + 1);
  assert.ok(blur.indexOf('renderSuggest([]);') !== -1, 'blur drops the overlay');
  assert.ok(blur.indexOf('menuOpen') === -1 && blur.indexOf('selectedTeacher') === -1,
    'blur must not toggle the panes');
  // the menu edges: openMenu arms the fact, closeMenu drops it + focus
  const open = TEACHERS.slice(TEACHERS.indexOf('function openMenu()'),
    TEACHERS.indexOf('function closeMenu()'));
  assert.ok(open.indexOf('menuOpen = true;') !== -1, 'openMenu arms the fact');
  const close = TEACHERS.slice(TEACHERS.indexOf('function closeMenu()'),
    TEACHERS.indexOf('}', TEACHERS.indexOf('function closeMenu()')) + 1);
  assert.ok(close.indexOf('menuOpen = false;') !== -1, 'closeMenu drops the fact');
  assert.ok(close.indexOf('searchEl.blur();') !== -1, 'closeMenu removes focus');
  // focus and filter-box taps bring the menu back through openMenu
  assert.ok(TEACHERS.indexOf('onfocus={onSearchFocus}') !== -1 &&
    TEACHERS.indexOf('function onSearchFocus() {\n\t\topenMenu();') !== -1,
    'focus opens the menu');
  assert.ok(TEACHERS.indexOf('onclick={onSearchClick}') !== -1 &&
    TEACHERS.indexOf('function onSearchClick() {\n\t\topenMenu();') !== -1,
    'a filter-box tap opens the menu');
  // selection exits the menu through the one funnel
  assert.ok(TEACHERS.indexOf('function selectTeacher(name)') !== -1 &&
    TEACHERS.slice(TEACHERS.indexOf('function selectTeacher(name)'),
      TEACHERS.indexOf('function showEmpty()')).indexOf('menuOpen = false;') !== -1,
    'selection dismisses the menu');
  assert.ok(TEACHERS.indexOf('setTimeout') === -1, 'no setTimeout left in the teachers page');
});

// ---- exact-name selection -----------------------------------------------------

test('exact name selects even among partial matches (teachers funnel)', function () {
  // the exact helper is a pure rank over the search result — exercise it on
  // the real index the way the page will at runtime
  const norm = model.normStr;
  function exactTeacher(r, q) {
    const want = norm(q.trim());
    let found = null;
    r.sections.forEach(function (sec) {
      (sec.hits || []).forEach(function (h) {
        if (!found && h.teacher && norm(h.teacher) === want) found = h.teacher;
      });
    });
    return found;
  }
  const res = searchTeachers.searchSections(index, 'Ben Haj', null);
  assert.strictEqual(res.total, 2, 'Ben Haj fixture must match two teachers');
  assert.strictEqual(exactTeacher(res, 'Ben Haj'), 'Ben Haj');
  assert.strictEqual(exactTeacher(searchTeachers.searchSections(index, 'Ben ', null), 'Ben '), null,
    'partial query selects nothing');
  assert.strictEqual(exactTeacher(searchTeachers.searchSections(index, '', null), ''), null,
    'empty query selects nothing');
  // wiring: commit consults the exact helper before the count branches
  const commitAt = TEACHERS.indexOf('function commit()');
  assert.ok(commitAt !== -1, 'commit funnel found');
  const commitFn = TEACHERS.slice(commitAt, TEACHERS.indexOf('function onKeydown', commitAt));
  assert.ok(commitFn.indexOf('const exact = exactTeacher(r, query);') !== -1,
    'commit computes exact first');
  assert.ok(commitFn.indexOf('if (exact) {') !== -1, 'exact hit selects immediately');
  assert.ok(commitFn.indexOf('const exact = exactTeacher(r, query);') <
    commitFn.indexOf('r.total === 1'), 'exact wins before the single-hit branch');
  assert.ok(commitFn.indexOf('selectTeacher(exact);') !== -1,
    'exact commit selects through the single funnel');
  assert.ok(commitFn.indexOf('selectTeacher(only.teacher);') !== -1,
    'single-hit commit selects through the single funnel');
  // and the helper the page ships is exactly the function exercised above
  const exactAt = TEACHERS.indexOf('function exactTeacher(r, q)');
  const exactFn = TEACHERS.slice(exactAt, TEACHERS.indexOf('}', exactAt) + 1);
  assert.ok(exactFn.indexOf('model.normStr(q.trim())') !== -1 &&
    exactFn.indexOf('model.normStr(h.teacher) === want') !== -1,
    'the shipped helper matches via the model norm');
});

// ---- nav chrome ----------------------------------------------------------------

test('teachers nav chrome: state-gated back arrow, teacher overlay, V gone', function () {
  ['id="searchBack"', 'id="searchOverlay"', 'id="overlayClear"', 'id="overlayName"']
    .forEach(function (id) {
      assert.ok(TEACHERS.indexOf(id) !== -1, 'teachers page missing ' + id);
    });
  assert.ok(TEACHERS.indexOf('id="searchDone"') === -1,
    'the V-chevron is gone from the teachers page');
  const base = CSS_SRC.slice(0, CSS_SRC.indexOf('@media (max-width: 700px)'));
  assert.ok(base.indexOf('#searchBack { display: none; }') !== -1,
    'desktop armour: the back arrow is display:none at base');
  assert.ok(base.indexOf('#searchOverlay { display: none; }') !== -1,
    'desktop armour: the teacher overlay is display:none at base');
  const narrow = CSS_SRC.slice(CSS_SRC.indexOf('@media (max-width: 700px)'));
  assert.ok(narrow.indexOf('#layout.is-list #searchBack') !== -1,
    'back arrow is gated on the list state, not on focus');
  assert.ok(narrow.indexOf('#searchOverlay:not([hidden])') !== -1,
    'overlay renders from its attribute on narrow screens');
  assert.ok(CSS_SRC.indexOf('#searchWrap:focus-within #searchBack') === -1,
    'the back control must never be focus-gated (anti-D4 regression pin)');
  // issue 057: the overlay matches the wrap's box chrome (radius only) and the
  // input under it goes invisible, keyed on the overlay's attribute
  const ovAt = narrow.indexOf('#searchOverlay:not([hidden])');
  const ovRule = narrow.slice(ovAt, narrow.indexOf('}', ovAt));
  assert.ok(ovRule.indexOf('border-radius: 8px') !== -1,
    'overlay takes the wrap 8px radius (square corners over the rounded box = issue 057)');
  const atInputHide = narrow.indexOf('#searchWrap:has(#searchOverlay:not([hidden])) #search');
  assert.ok(atInputHide !== -1,
    'the input hides while the overlay shows (narrow block)');
  assert.ok(CSS_SRC.indexOf('#searchWrap:has(#searchOverlay:not([hidden])) #search')
    > CSS_SRC.indexOf('@media (max-width: 700px)'),
    'the input-hide rule must stay narrow-only (a base-level copy would blank the desktop input)');
  assert.ok(CSS_SRC.indexOf('#searchWrap:focus-within #search ') === -1,
    'the input hide keys on the overlay attribute, never on focus');
});

test('nav machine: single selection/empty funnels, derivation-safe detail', function () {
  assert.ok(TEACHERS.indexOf('let menuOpen = $state(false);') !== -1, 'menuOpen fact declared');
  assert.ok(TEACHERS.indexOf('let selectedTeacher = $state(null);') !== -1,
    'selectedTeacher fact declared');
  // the detail is a derivation, not an innerHTML writer: it can carry no side
  // effects, so none need fencing
  assert.ok(scriptOf().indexOf('const detailGroups = $derived.by(() => {') !== -1,
    'the detail is derived');
  assert.ok(TEACHERS.indexOf('function showTeacher(') === -1,
    'no imperative detail renderer remains');
  function fnBody(sig) {
    const start = TEACHERS.indexOf(sig);
    assert.ok(start !== -1, sig + ' found');
    const end = TEACHERS.indexOf('\t}', start);
    assert.ok(end !== -1, sig + ' bounds');
    return TEACHERS.slice(start, end + '\t}'.length);
  }
  const sel = fnBody('function selectTeacher(name)');
  ['selectedTeacher = name', 'noMatch = \'\'', 'renderSuggest([])', 'searchEl.blur()',
   'menuOpen = false'].forEach(function (tok) {
    assert.ok(sel.indexOf(tok) !== -1, 'selectTeacher: ' + tok);
  });
  const emp = fnBody('function showEmpty()');
  ['selectedTeacher = null', 'noMatch = \'\'', 'renderSuggest([])'].forEach(function (tok) {
    assert.ok(emp.indexOf(tok) !== -1, 'showEmpty: ' + tok);
  });
  const inputFn = fnBody('function onSearchInput(e)');
  assert.ok(inputFn.indexOf('showEmpty();') !== -1, 'onInput: empty filter deselects');
  assert.ok(inputFn.indexOf('selectTeacher(only.teacher)') !== -1,
    'onInput: auto-jump selects via the funnel');
  // row tap selects via the funnel
  const listAt = TEACHERS.indexOf('id="teacherList"');
  const listEnd = TEACHERS.indexOf('</ul>', listAt);
  const listBlock = TEACHERS.slice(listAt, listEnd);
  assert.ok(listBlock.indexOf('selectTeacher(r.teacher)') !== -1, 'row tap selects via the funnel');
  // the overlay tap reopens the list; the X deselects without bubbling
  const ovStart = TEACHERS.indexOf('id="searchOverlay"');
  const ovEnd = TEACHERS.indexOf('</div>', ovStart);
  const ovWiring = TEACHERS.slice(ovStart, ovEnd);
  assert.ok(ovWiring.indexOf('onclick={openMenu}') !== -1, 'overlay tap reopens the list');
  assert.ok(ovWiring.indexOf('e.stopPropagation();') !== -1, 'overlay X does not bubble');
  assert.ok(ovWiring.indexOf('showEmpty();') !== -1, 'overlay X deselects');
});

// ---- one clock drives the list and the open detail ---------------------------

test('the teachers page drives availability and the open detail from one clock', function () {
  // one subscription per page; the clock owns the cadence
  assert.strictEqual(TEACHERS.split('clock((t)').length - 1, 1, 'one subscription per page');
  assert.ok(TEACHERS.indexOf('now = t;') !== -1, 'the tick payload is the fact the page re-derives from');
  assert.ok(TEACHERS.indexOf('setInterval') === -1, 'the page runs no timer of its own');
  assert.ok(TEACHERS.indexOf('compute once per page load') === -1,
    'the one-shot availability comment is gone');
  assert.ok(TEACHERS.indexOf('listKey') === -1 && TEACHERS.indexOf('lastListKey') === -1 &&
    TEACHERS.indexOf('lastDetailH') === -1, 'no gate state on the page');
  assert.strictEqual(TEACHERS.split('new Date()').length - 1, 1,
    'the mount capture is the only Date the page construct itself');
  // availability is derived per tick (the old buildAvail)
  assert.ok(scriptOf().indexOf('const avail = $derived.by(() => {') !== -1,
    'availability moved into a derived value');
  assert.strictEqual(TEACHERS.split('model.availability(store.sessionsOf(n), now)').length - 1, 1,
    'one availability computation');
  // every live surface re-derives from now: list through avail, detail directly
  assert.ok(TEACHERS.indexOf('$lib/clock.js') !== -1, 'the shared clock module powers the page');
  assert.ok(scriptOf().indexOf('const detailGroups = $derived.by(() => {') !== -1,
    'the detail re-derives on every tick');
  assert.ok(TEACHERS.indexOf('model.fuseSessions(store.sessionsOf(selectedTeacher), modelObjs.groups)') !== -1,
    'the detail grades the fused rows');
  assert.ok(TEACHERS.indexOf('const now2 = now;') !== -1, 'the detail grades on the tick clock');
});

test('selecting a teacher derives once; a live re-render moves the marks', function () {
  // selection: no MY-session row, the fresh 11h40-13h10 Wednesday slot is NEXT
  const h = derive('Bannour', wed(10, 30));
  const i11 = h.byDay['MERCREDI'].findIndex(function (e) { return e.s.time === '11h40-13h10'; });
  assert.strictEqual(h.ss.filter(function (s) {
    return model.isCurrentSession(s.day, s.time, wed(10, 30));
  }).length, 0, 'nothing is NOW for Bannour at Wed 10:30');
  assert.ok(h.upcoming.has(h.byDay['MERCREDI'][i11].i),
    'NEXT marks her 11h40-13h10 Wednesday slot');
  // the tick: same selection, marks move onto the 11h40-13h10 row
  const tick = derive('Bannour', wed(12, 0));
  const j11 = tick.byDay['MERCREDI'].findIndex(function (e) { return e.s.time === '11h40-13h10'; });
  assert.ok(model.isCurrentSession('MERCREDI', '11h40-13h10', wed(12, 0)) &&
    tick.byDay['MERCREDI'][j11].s.time === '11h40-13h10',
    'NOW moves onto the fresh slot');
  // and nothing but the fact write happens on the live path: the clock
  // callback is exactly the one assignment
  const cbAt = TEACHERS.indexOf('unsub = clock((t) => {');
  const cb = TEACHERS.slice(cbAt, TEACHERS.indexOf('});', cbAt));
  assert.ok(cb.indexOf('now = t;') !== -1, 'the tick writes the clock fact');
  ['selectTeacher', 'showEmpty', 'renderSuggest', 'noMatch ='].forEach(function (tok) {
    assert.ok(cb.indexOf(tok) === -1, 'a tick never runs side effects: ' + tok);
  });
});

test('a live teacher re-render with unchanged time state re-derives anyway and keeps the anchor', function () {
  // two ticks at the same clock: both derivations run (no gate) and produce
  // the same record — the anchor holds
  const a = derive('Barboura', fri(12, 0));
  const b = derive('Barboura', fri(12, 0));
  assert.deepStrictEqual(
    { ss: a.ss, upcoming: a.upcoming, liveDays: a.liveDays, dayOrder: a.dayOrder },
    { ss: b.ss, upcoming: b.upcoming, liveDays: b.liveDays, dayOrder: b.dayOrder },
    're-derivation on the hit, not on a diff');
  assert.strictEqual(a.dayOrder[0].toLowerCase(), 'vendredi', 'the anchor on selection');
  assert.strictEqual(b.dayOrder[0].toLowerCase(), 'vendredi', 'the anchor is stable within a day');
  // structural: with no gate state, the reactive re-run always happens
  assert.ok(TEACHERS.indexOf('listKey') === -1 && TEACHERS.indexOf('lastDetailH') === -1,
    'no emitted-string gate could ever skip the re-render');
});

test('a teachers tick with no selection re-derives only the list, from the fresh clock', function () {
  // avail rebuilds from the fresh clock for every teacher
  const availWedA = {}, availSun = {};
  store.teachers.forEach(function (n) {
    availWedA[n] = model.availability(store.sessionsOf(n), wed(10, 30));
    availSun[n] = model.availability(store.sessionsOf(n), sun(10, 0));
  });
  assert.strictEqual(availWedA['Bannour'], 'today', 'Wed 10:30 leaves Bannour live today');
  assert.strictEqual(availSun['Bannour'], 'tomorrow', 'Sunday collapses Bannour to tomorrow');
  const wedOrder = searchTeachers.searchSections(index, '', availWedA).sections
    .flatMap(function (s) { return s.hits.map(function (h) { return h.teacher; }); });
  const sunOrder = searchTeachers.searchSections(index, '', availSun).sections
    .flatMap(function (s) { return s.hits.map(function (h) { return h.teacher; }); });
  assert.notDeepStrictEqual(sunOrder, wedOrder, 'availability re-ranks the list');
  assert.notStrictEqual(wedOrder[1], sunOrder[1],
    'the fresh order differs from position 2 (the Sunday collapse)');
  const fresh = searchTeachers.searchSections(index, '', availSun).sections
    .flatMap(function (s) { return s.hits.map(function (h) { return h.teacher; }); });
  assert.deepStrictEqual(sunOrder, fresh, 'the fresh Sunday order is the real alphabetical collapse');
  // and the tick touches nothing but the list inputs: no selection writes
  const cbAt = TEACHERS.indexOf('unsub = clock((t) => {');
  const cb = TEACHERS.slice(cbAt, TEACHERS.indexOf('});', cbAt));
  assert.ok(cb.indexOf('selectedTeacher') === -1, 'no detail is touched without a selection');
  assert.ok(cb.indexOf('query') === -1, 'the filter is not rewritten by a tick');
});

// ---- clear X / deselect back-arrow split (issues 060, 064) -------------------

test('the clear X erases only, the back arrow deselects only', function () {
  // markup: the deselect button sits between the clear X and the overlay
  const clr = TEACHERS.indexOf('id="searchClear"');
  const des = TEACHERS.indexOf('id="searchDeselect"');
  const ov = TEACHERS.indexOf('id="searchOverlay"');
  assert.ok(clr !== -1 && des !== -1 && ov !== -1, 'markup ids present');
  assert.ok(clr < des && des < ov, '#searchDeselect sits between #searchClear and #searchOverlay');
  // the deselect glyph is the back arrow (issue 064): the box and the trigger
  // survived 060→064 verbatim, only the glyph swapped — the erase X stays with
  // #searchClear, byte for byte
  function btnBlock(id) {
    const at = TEACHERS.indexOf('id="' + id + '"');
    return TEACHERS.slice(TEACHERS.lastIndexOf('<button', at),
      TEACHERS.indexOf('</button>', at));
  }
  const desB = btnBlock('searchDeselect');
  assert.ok(desB.indexOf('M19 12h-14M12 6l-7 6 7 6') !== -1,
    'the desktop deselect shows the back arrow (arrow-left, issue 064)');
  assert.ok(desB.indexOf('M6 6l12 12M18 6L6 18') === -1,
    'the desktop deselect no longer shows the X');
  assert.ok(desB.indexOf('aria-label="Back to the teacher list"') !== -1,
    'the deselect button is named for the back action');
  assert.ok(btnBlock('searchClear').indexOf('M6 6l12 12M18 6L6 18') !== -1,
    'the erase X is untouched');
  // CSS: the engine cancel button is suppressed once, at base (I4 — the page
  // owns the only X); the narrow copy moved, it is not a duplicate
  const base = CSS_SRC.slice(0, CSS_SRC.indexOf('@media (max-width: 700px)'));
  const narrow = CSS_SRC.slice(CSS_SRC.indexOf('@media (max-width: 700px)'));
  assert.ok(base.indexOf('#search::-webkit-search-cancel-button') !== -1,
    'the native cancel button is suppressed at base (app-wide)');
  assert.ok(narrow.indexOf('#search::-webkit-search-cancel-button') === -1,
    'the narrow suppression copy moved to base, it is not a duplicate');
  // CSS: the X owns the 2.7rem right slot on every viewport; the ghost
  // completion clears the slot too
  assert.ok(base.indexOf('#search { padding-right: 2.7rem; }') !== -1,
    'the X slot gutter is base-level');
  assert.ok(narrow.indexOf('#search { padding-right: 2.7rem; }') === -1,
    'the narrow gutter copy moved to base, it is not a duplicate');
  assert.ok(base.indexOf('#ghost { padding-right: 2.7rem; }') !== -1,
    'the ghost completion clears the X slot as well');
  assert.strictEqual(base.indexOf('#searchClear { display: none; }'), -1,
    'the clear X is no longer armour-plated off desktop');
  // CSS: the deselect back arrow overlays the whole box at base; narrow armours it off
  const desAt = base.indexOf('#searchDeselect {');
  assert.ok(desAt !== -1, 'base deselect back-arrow rule present');
  const desRule = base.slice(desAt, base.indexOf('}', desAt));
  assert.ok(desRule.indexOf('position: absolute') !== -1,
    'the deselect back arrow covers the whole box (left/top/right/bottom 0)');
  assert.ok(base.indexOf('#searchDeselect[hidden] { display: none; }') !== -1,
    'the deselect back arrow honours its [hidden] attribute at base');
  assert.ok(narrow.split('\n').some(function (line) {
    return line.trim() === '#searchDeselect { display: none; }';
  }), 'narrow armours the desktop deselect back arrow off (its chrome is #overlayClear)');
  // the visibility fact is an Svelte attribute derivation from the two facts
  // (the legacy syncDeselect composition, kept live on every render)
  assert.ok(TEACHERS.indexOf('hidden={!(selectedTeacher !== null && query === \'\')}') !== -1,
    'searchDeselect derives [hidden] from the selection fact');
  assert.ok(TEACHERS.indexOf("hidden={!query}") !== -1,
    'searchClear derives [hidden] from the empty value');
  // eraseFilter: commit's empty branch minus the deselect, no funnel writes (I5)
  const efAt = TEACHERS.indexOf('function eraseFilter()');
  const ef = TEACHERS.slice(efAt, TEACHERS.indexOf('\t}', efAt) + '\t}'.length);
  ['query = \'\';', 'renderSuggest([]);'].forEach(function (tok) {
    assert.ok(ef.indexOf(tok) !== -1, 'eraseFilter: ' + tok);
  });
  ['showEmpty', 'selectTeacher(', 'menuOpen', 'isCoarsePointer'].forEach(function (tok) {
    assert.ok(ef.indexOf(tok) === -1, 'eraseFilter must not touch ' + tok);
  });
  // the clear X calls eraseFilter and nothing else — never commit/onInput;
  // the bare <input> flowing through onSearchInput keeps the keyboard
  // emptying on the deselect path (pinned 056)
  const clrH = TEACHERS.slice(TEACHERS.indexOf('id="searchClear"'),
    TEACHERS.indexOf('</button>', TEACHERS.indexOf('id="searchClear"')));
  assert.ok(clrH.indexOf('onclick={eraseFilter}') !== -1, 'the X erases only');
  ['commit()', 'onSearchInput', 'showEmpty()'].forEach(function (tok) {
    assert.ok(clrH.indexOf(tok) === -1, 'the X must proxy nothing else: ' + tok);
  });
  // the deselect back arrow funnels through the one empty funnel, never focuses
  const desH = desB;
  assert.ok(desH.indexOf('showEmpty();') !== -1 || TEACHERS.indexOf('onclick={() => showEmpty()}') !== -1,
    'the deselect back arrow runs the empty funnel');
  assert.ok(TEACHERS.indexOf('searchEl.focus()') === -1,
    'the deselect back arrow never focuses the box');
  // neither press may arm focus through mousedown
  ['searchClear', 'searchDeselect'].forEach(function (id) {
    const at = TEACHERS.lastIndexOf('<button', TEACHERS.indexOf('id="' + id + '"'));
    const end = TEACHERS.indexOf('\n>', at);
    const tag = TEACHERS.slice(at, end);
    assert.ok(tag.indexOf('onmousedown={(e) => e.preventDefault()}') !== -1,
      id + ' press never focuses the box');
  });
  // keyboard divergence: onSearchInput's empty branch is untouched (056)
  const inputFn = TEACHERS.slice(TEACHERS.indexOf('function onSearchInput(e)'),
    TEACHERS.indexOf('function commit()'));
  assert.ok(inputFn.indexOf('showEmpty();') !== -1, 'backspace-to-empty still deselects');
});

// ---- clear X absent from the first frame (issue 074) -------------------------

test('the clear X ships hidden in the markup, so an empty filter never paints it', function () {
  // The filter boots empty (`let query = $state('')`), so the derived [hidden]
  // IS the true initial state: the input ships with no text and the X renders
  // hidden before any interaction can fill it.
  assert.ok(TEACHERS.indexOf("let query = $state('');") !== -1, 'the filter boots empty');
  const clr = /<button[^>]*id="searchClear"[^>]*>/.exec(TEACHERS);
  assert.ok(clr, 'teachers: #searchClear opening tag found');
  assert.ok(clr[0].indexOf('hidden={!query}') !== -1,
    'teachers: the clear X ships hidden at first paint (issue 074), got: ' + clr[0]);
  // the state the markup declares is real: the input carries no value of its own
  const input = /<input[^>]*id="search"[^>]*>/.exec(TEACHERS);
  assert.ok(input, 'teachers: #search input found');
  assert.ok(!/\svalue="[^{]/.test(input[0]), 'teachers: the filter boots empty');
  // every other chrome node ships hidden at boot too:
  assert.ok(/<div id="searchOverlay" hidden={selectedTeacher === null || menuOpen}>/.test(TEACHERS) ||
    TEACHERS.indexOf('id="searchOverlay" hidden={selectedTeacher === null || menuOpen}') !== -1,
    'overlay ships hidden');
  assert.ok(/id="searchDeselect"[^>]*hidden=/.test(TEACHERS), 'deselect ships hidden');
  assert.ok(/<ul id="suggest" hidden=/.test(TEACHERS), 'suggest ships hidden');
  // and the declared state really renders hidden: the id rule (flex +
  // geometry) outranks the UA [hidden] default, so the base armour must stay
  const base = CSS_SRC.slice(0, CSS_SRC.indexOf('@media (max-width: 700px)'));
  assert.ok(base.indexOf('#searchClear[hidden] { display: none; }') !== -1,
    'base CSS honours #searchClear[hidden] so the markup default renders');
  // the attribute is the only visibility writer: no imperative sync functions remain
  assert.strictEqual(TEACHERS.split('function syncClear').length - 1, 0,
    'no imperative clear sync survives the derivation');
  assert.strictEqual((TEACHERS.match(/query = ''/g) || []).length, 1,
    'the X erase is the only writer of the empty value');
});

// ---- per-name session-count badges (issue 062) -------------------------------

test('teacher rows carry no session-count badge, in the list and in suggest', function () {
  // the teachers page emits no `.n` span anywhere any more.
  assert.ok(TEACHERS.indexOf('class="n"') === -1, 'no class="n" left on the teachers page');
  assert.ok(TEACHERS.indexOf('store.sessionsOf(r.teacher).length') === -1,
    'the list row no longer appends the session count');
  assert.ok(TEACHERS.indexOf('store.sessionsOf(r.label).length') === -1,
    'the suggest row no longer appends the session count');
  // the badge styles die with the badges: the shared rule and the dead
  // classes-page rule are both gone.
  assert.ok(CSS_SRC.indexOf('#suggest .n') === -1, 'no #suggest .n rule');
  assert.ok(CSS_SRC.indexOf('#teacherList .n') === -1, 'no #teacherList .n rule');
  assert.ok(CSS_SRC.indexOf('#classList .n') === -1, 'the unconsumed #classList .n rule is gone');
  assert.ok(!/[^a-zA-Z-]\.n\s*\{/.test(CSS_SRC), 'app.css defines no .n rule at all');
  // out of scope, still there: the exact-query relevant badge keeps its text
  // and its styling (renamed from .n), and so do the detail counts and the
  // status totals line.
  assert.ok(TEACHERS.indexOf('class="relevant"') !== -1, 'the exact-query relevant badge stays');
  assert.ok(CSS_SRC.indexOf('#teacherList .relevant') !== -1, 'the relevant badge keeps its styling');
  assert.ok(TEACHERS.indexOf('class="hours"') !== -1, 'detail-page counts stay');
  assert.ok(TEACHERS.indexOf('{store.size} sessions') !== -1 &&
    TEACHERS.indexOf('teachers{:else}') !== -1, 'the #status totals line stays');
});

// ---- suggest + shadow text (issue 085 phase 4) -------------------------------

test('the suggest rows keep every token, rank score-desc by byte label and cap at 8', function () {
  // issue 076 verified the cap against typing 'abe' — it still opens 8 rows
  const abe = searchTeachers.suggestTeachers(index, 'abe');
  assert.strictEqual(abe.length, 8, 'typing abe still opens 8 suggestions');
  assert.strictEqual(searchTeachers.suggestTeachers(index, '   ').length, 0,
    'a blank query suggests nothing');
  // kind vocabulary is the overlay's {teacher, class, subject} set
  abe.forEach(function (r) {
    assert.ok(['teacher', 'subject', 'class'].indexOf(r.kind) !== -1,
      'row ' + JSON.stringify(r.label) + ' carries a known kind');
  });
  // determinism over ties: every glsi prefix scores alike, so the byte
  // order must decide — ancestor keys included, first-seen deduped
  assert.deepStrictEqual(
    searchTeachers.suggestTeachers(index, 'glsi').map(function (r) { return r.label; }),
    ['GLSI1', 'GLSI1A', 'GLSI1A1', 'GLSI1A2', 'GLSI1B', 'GLSI1B1', 'GLSI1B2', 'GLSI1C'],
    'equal scores break byte-alphabetically');
  // token-AND on a two-token query: only texts keeping BOTH tokens survive,
  // and the tighter prefix scores ahead of the loose one
  const two = searchTeachers.suggestTeachers(index, 'algo struct');
  assert.ok(two.length > 0 && two.length <= 8, 'the two-token query still suggests');
  assert.ok(two.some(function (r) { return r.label === 'Algo Struct de Données I'; }),
    'the whole-token subject survives the AND');
  assert.strictEqual(two[0].label, 'Algo Struct de Données I',
    'the earlier token prefix outranks its & variant');
  ['abe', 'algo struct', 'machine'].forEach(function (q) {
    const tokens = q.split(/\s+/).filter(Boolean);
    searchTeachers.suggestTeachers(index, q).forEach(function (r, i) {
      tokens.forEach(function (tok) {
        assert.ok(fuzzyRanges(r.label, tok) !== null,
          q + ' row ' + JSON.stringify(r.label) + ' keeps every token (' + tok + ')');
      });
    });
  });
});

test('every suggest commit is a bare text that round-trips through searchSections', function () {
  ['abe', 'glsi', 'algo struct', 'machine', 'ben'].forEach(function (q) {
    searchTeachers.suggestTeachers(index, q).forEach(function (r) {
      assert.strictEqual(r.commit, r.label, 'commits are the bare texts (no typed prefixes)');
      assert.strictEqual(r.detail, null, 'rows stay minimal: no counted badge hints');
      const res = searchTeachers.searchSections(index, r.commit, null);
      assert.ok(res.total > 0,
        q + ' commit ' + JSON.stringify(r.commit) + ' resolves to hits');
      if (r.kind === 'teacher') {
        // the page's exactTeacher: the committed name is still the exact hit
        let found = null;
        res.sections.forEach(function (sec) {
          sec.hits.forEach(function (h) {
            if (!found && h.teacher && model.normStr(h.teacher) === model.normStr(r.commit)) found = h.teacher;
          });
        });
        assert.strictEqual(found, r.commit, 'a teacher commit is the exact selection');
      }
    });
  });
  // the class-key commit rides the exact-class relevance: the resolution
  // walk needs the groups back (they left the index in the redesign) —
  // counting restores instead of crashing on the leaf lookup
  const res = searchTeachers.searchSections(index, 'GLSI3D1', null);
  assert.ok(res.total > 0, 'the GLSI3D1 commit survives the class-exact relevance walk');
  assert.ok(res.sections[0].hits.some(function (h) {
    return h.exact === true && h.relevantSessions > 0;
  }), 'the exact class commit still counts its (n relevant)');
});

test('shadowText completes commit/label prefixes and stays null on divergence', function () {
  // the live path: the new suggest's bare-commit rows take the first branch
  assert.deepStrictEqual(searchTeachers.shadowText('glsi', { label: 'GLSI3D1', commit: 'GLSI3D1' }),
    { pre: '', rest: '3D1' }, 'a bare commit completes from the typed prefix');
  assert.deepStrictEqual(searchTeachers.shadowText('hass', { label: 'Hassairi', commit: 'Hassairi' }),
    { pre: '', rest: 'airi' }, 'teacher names complete inside the word');
  assert.deepStrictEqual(searchTeachers.shadowText('machine ', { label: 'Machine Learning', commit: 'Machine Learning' }),
    { pre: '', rest: 'Learning' }, 'a single typed space is an ordinary character');
  // after the prefix cleanup (branch 2 removed), the class:-prefixed commit
  // no longer surfaces its hint; the label prefix takes over (issue 085)
  assert.deepStrictEqual(searchTeachers.shadowText('glsi', { commit: 'class:GLSI3D1', label: 'GLSI3D1' }),
    { pre: '', rest: '3D1' }, 'the class: prefix no longer surfaces as the ghost pre');
  // divergence: no trim/collapse — the raw typed run must really prefix
  assert.strictEqual(searchTeachers.shadowText('machine  ', { label: 'Machine Learning', commit: 'Machine Learning' }),
    null, 'a double space means the ghost is gone (issue #2)');
  assert.strictEqual(searchTeachers.shadowText('', { label: 'x', commit: 'x' }), null,
    'an empty query ghosts nothing');
  assert.strictEqual(searchTeachers.shadowText('x', null), null,
    'no row ghosts nothing');
});

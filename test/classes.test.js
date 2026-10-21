// Tests for the classes page logic (issue 032) — run with `node --test test/`.
//
// The pure, DOM-free parts of the page (model.classWeek, model.dayCursor,
// match.classSearch) are exercised against the real emplois.csv, exactly like
// test/libgroups.test.js exercises the grouping library. The page itself is
// checked structurally (HTML/CSS shape), since no browser is available.

'use strict';

var test = require('node:test');
var assert = require('node:assert');
var fs = require('node:fs');
var path = require('node:path');
var vm = require('node:vm');

var CSV_PATH = path.join(__dirname, '..', 'emplois.csv');
var ROOT = path.join(__dirname, '..');

// Load the browser script stack (data, libgroups, model, match) into one shared
// TT context, exactly like classes/index.html's <script> tags do in the browser.
// model.js / match.js have no UMD wrapper, so they are eval'd in a vm context
// whose global carries the shared TT object.
function loadStack() {
  var ctx = { console: console };
  vm.createContext(ctx);
  ['js/data.js', 'js/libgroups.js', 'js/model.js', 'js/match.js'].forEach(function (f) {
    var src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    vm.runInContext(src, ctx, { filename: f });
  });
  return ctx.TT;
}

var TT = loadStack();
var data = TT.data, model = TT.model, match = TT.match;

var store = data.createStore(fs.readFileSync(CSV_PATH, 'utf8'));
var modelObjs = model.buildAll(store);
var index = match.buildIndex(store, modelObjs);
var groups = modelObjs.groups;

// deepStrictEqual compares prototypes, and values that come out of the vm loader
// belong to the vm's own Array — convert them to this context before comparing
// against array literals (two vm-context arrays compare fine as-is).
function main(arr) { return Array.prototype.slice.call(arr); }

// ---- model.classWeek -------------------------------------------------------

test('classWeek resolves a fully specified class to its own timetable', function () {
  var w = model.classWeek(groups, 'GLSI3D1');
  assert.strictEqual(w.leaves.length, 1);
  assert.strictEqual(w.leaves[0].key, 'GLSI3D1');
  assert.strictEqual(w.name, 'LCS3-GLSI_D Groupe 1');
  assert.ok(w.sessions.length > 0);
  // every line is labelled with the single class it comes from
  w.sessions.forEach(function (s) {
    assert.strictEqual(s.classKey, 'GLSI3D1');
    assert.strictEqual(s.classLabel, 'LCS3-GLSI_D Groupe 1');
  });
});

test('classWeek resolves an interior prefix to the union beneath it', function () {
  var w = model.classWeek(groups, 'LCS1');
  // LCS1 is a common branch: sections A..H, most split into two cohorts
  assert.ok(w.leaves.length > 1, 'expected several leaves under LCS1');
  assert.strictEqual(w.name, 'LCS1');
  // sessions come from more than one leaf, each labelled with its own class
  var labels = {};
  w.sessions.forEach(function (s) { labels[s.classLabel] = true; });
  assert.ok(Object.keys(labels).length > 1, 'expected sessions from several classes');
  // every label is the full name of a leaf actually under LCS1
  w.sessions.forEach(function (s) {
    var leaf = groups.byKey[s.classKey];
    assert.ok(leaf, 'classKey is a real node: ' + s.classKey);
    assert.strictEqual(s.classLabel, leaf.fullName());
    assert.ok(groups.byKey['LCS1'].contains(leaf), 'leaf is under LCS1: ' + s.classKey);
  });
});

test('classWeek unions every candidate of an ambiguous prefix', function () {
  // "GLSI" spans semesters 1 and 3 — the union of both, not just the first.
  var w = model.classWeek(groups, 'GLSI');
  var want = groups.byKey['GLSI1'].leaves().concat(groups.byKey['GLSI3'].leaves());
  assert.strictEqual(w.leaves.length, want.length);
  assert.strictEqual(w.name, 'GLSI');
  var keys = w.leaves.map(function (l) { return l.key; }).sort();
  assert.deepStrictEqual(keys, want.map(function (l) { return l.key; }).sort());
});

test('classWeek resolves a track node and a full-name reference', function () {
  var w = model.classWeek(groups, 'LCS');
  assert.strictEqual(w.leaves.length, groups.byKey['LCS'].leaves().length);
  assert.strictEqual(w.name, 'LCS');

  var w2 = model.classWeek(groups, 'LCS2-GLSI_C Groupe 2');
  assert.strictEqual(w2.leaves.length, 1);
  assert.strictEqual(w2.leaves[0].key, 'GLSI1C2');
  assert.strictEqual(w2.name, 'LCS2-GLSI_C Groupe 2');
});

test('classWeek accepts a node object as the ref', function () {
  var byRef = model.classWeek(groups, 'GLSI3D1');
  var byNode = model.classWeek(groups, groups.byKey['GLSI3D1']);
  assert.strictEqual(byNode.leaves.length, 1);
  assert.strictEqual(byNode.name, 'LCS3-GLSI_D Groupe 1');
  assert.deepStrictEqual(main(byNode.sessions), main(byRef.sessions));
});

test('classWeek unions the cohorts of a section node', function () {
  var w = model.classWeek(groups, 'LCS1A');
  assert.deepStrictEqual(
    main(w.leaves.map(function (l) { return l.key; })),
    ['LCS1A1', 'LCS1A2']
  );
  // the heading is the node's human name, like any single-node ref
  assert.strictEqual(w.name, 'LCS1-A');
  // every line is labelled with the cohort it comes from
  var labels = {};
  w.sessions.forEach(function (s) { labels[s.classLabel] = true; });
  assert.deepStrictEqual(Object.keys(labels).sort(),
    ['LCS1-A Groupe 1', 'LCS1-A Groupe 2']);
});

test('classWeek track union is exactly the year subtrees beneath it', function () {
  var w = model.classWeek(groups, 'LCS');
  var want = groups.byKey['LCS1'].leaves()
    .concat(groups.byKey['LCS2'].leaves(), groups.byKey['LCS3'].leaves());
  assert.strictEqual(w.leaves.length, want.length);
  assert.deepStrictEqual(
    main(w.leaves.map(function (l) { return l.key; })),
    main(want.map(function (l) { return l.key; })).sort()
  );
  // union labelling: every line names a leaf actually under LCS
  w.sessions.forEach(function (s) {
    var leaf = groups.byKey[s.classKey];
    assert.ok(leaf, 'classKey is a real node: ' + s.classKey);
    assert.strictEqual(s.classLabel, leaf.fullName());
    assert.ok(groups.byKey['LCS'].contains(leaf), 'leaf under LCS: ' + s.classKey);
  });
});

test('classWeek full-name reference resolves to its leaf', function () {
  var w = model.classWeek(groups, 'LCS1-A Groupe 1');
  assert.strictEqual(w.leaves.length, 1);
  assert.strictEqual(w.leaves[0].key, 'LCS1A1');
});

test('classWeek collapses identical rows within one leaf (issue-002 fusion)', function () {
  var w = model.classWeek(groups, 'GLSI3D1');
  var seen = {};
  w.sessions.forEach(function (s) {
    var k = s.classKey + '|' + s.day + '|' + s.time + '|' + s.subject + '|' + (s.room || '');
    assert.ok(!seen[k], 'duplicate fused row: ' + k);
    seen[k] = true;
  });
});

test('classWeek output is deterministic and ordered by (day, slot)', function () {
  var a = model.classWeek(groups, 'LCS1');
  var b = model.classWeek(groups, 'LCS1');
  assert.deepStrictEqual(a.sessions, b.sessions);
  for (var i = 1; i < a.sessions.length; i++) {
    var c = model.cmpSession(a.sessions[i - 1], a.sessions[i]);
    assert.ok(c <= 0, 'sessions are in (day, slot) order');
  }
});

test('classWeek skips rows that cannot be placed in the grid', function () {
  // build a tiny synthetic grouping with a session lacking a time
  var g = TT.groups.fromRows([
    { professor: 'P', day: 'LUNDI', time: '08h15-09h45', room: 'R1', subject: 'S', field: 'MP1-SD' },
    { professor: 'P', day: 'LUNDI', time: '', room: 'R1', subject: 'NoTime', field: 'MP1-SD' },
    { professor: 'P', day: '', time: '08h15-09h45', room: 'R1', subject: 'NoDay', field: 'MP1-SD' }
  ]);
  var w = model.classWeek(g, 'MP1-SD');
  assert.strictEqual(w.sessions.length, 1);
  assert.strictEqual(w.sessions[0].subject, 'S');
});

// ---- model.dayCursor -------------------------------------------------------

// Oct 13 2026 is a Tuesday; the boundary cases below use the surrounding
// week (Oct 11 = Sunday, Oct 12 = Monday, Oct 17 = Saturday).
function at(monthDay, hh, mm) { return new Date(2026, 9, monthDay, hh, mm); }

test('dayCursor marks nothing on Sunday', function () {
  var c = model.dayCursor(at(11, 10, 0), store.slots); // Sunday 10h00
  assert.strictEqual(c.visible, false);
  assert.strictEqual(c.phase, 'sunday');
  assert.strictEqual(c.isSunday, true);
  assert.strictEqual(c.cur, null);
  assert.strictEqual(c.next, null);
});

test('dayCursor marks nothing before the day begins (08h15)', function () {
  var c = model.dayCursor(at(12, 7, 0), store.slots); // Monday 07h00
  assert.strictEqual(c.visible, false);
  assert.strictEqual(c.phase, 'before');
  assert.strictEqual(c.cur, null);
  assert.strictEqual(c.next, null);
  // the first slot's start is the boundary: 08h15 exactly is already visible
  var c2 = model.dayCursor(at(12, 8, 15), store.slots);
  assert.strictEqual(c2.visible, true);
  assert.strictEqual(c2.cur, '08h15-09h45');
});

test('dayCursor marks nothing after the day ends (18h15)', function () {
  var c = model.dayCursor(at(12, 19, 0), store.slots); // Monday 19h00
  assert.strictEqual(c.visible, false);
  assert.strictEqual(c.phase, 'after');
  assert.strictEqual(c.cur, null);
  assert.strictEqual(c.next, null);
  // 18h15 exactly is the end of the last slot: already over
  var c2 = model.dayCursor(at(12, 18, 15), store.slots);
  assert.strictEqual(c2.visible, false);
  assert.strictEqual(c2.phase, 'after');
});

test('dayCursor finds the current slot and the next one still today', function () {
  // Monday 12h00 sits inside slot 3 (11h40-13h10); next is slot 4 (13h20).
  var c = model.dayCursor(at(12, 12, 0), store.slots);
  assert.strictEqual(c.visible, true);
  assert.strictEqual(c.phase, 'during');
  assert.strictEqual(c.today, 'LUNDI');
  assert.strictEqual(c.cur, '11h40-13h10');
  assert.strictEqual(c.next, '13h20-14h50');
  // frac is now's position inside the current slot: (720-700)/90
  assert.ok(Math.abs(c.frac - (20 / 90)) < 1e-9);
});

test('dayCursor marks no next once the last slot has begun', function () {
  // Saturday 16h45 is the start of the last slot: current, but nothing after.
  var c = model.dayCursor(at(17, 16, 45), store.slots);
  assert.strictEqual(c.visible, true);
  assert.strictEqual(c.today, 'SAMEDI');
  assert.strictEqual(c.cur, '16h45-18h15');
  assert.strictEqual(c.next, null);
  assert.ok(Math.abs(c.frac - 0) < 1e-9);
  // Saturday 15h00: current slot 5, next is the last slot.
  var c2 = model.dayCursor(at(17, 15, 0), store.slots);
  assert.strictEqual(c2.cur, '15h00-16h30');
  assert.strictEqual(c2.next, '16h45-18h15');
});

test('dayCursor is visible in the gaps between slots', function () {
  // Monday 09h45 sits in the 15-minute gap after slot 1: no current
  // slot, but the day is live and the next slot is known. The grid
  // cursor rests on the boundary (the next row's top edge).
  var c = model.dayCursor(at(12, 9, 45), store.slots);
  assert.strictEqual(c.visible, true);
  assert.strictEqual(c.phase, 'during');
  assert.strictEqual(c.cur, null);
  assert.strictEqual(c.frac, null);
  assert.strictEqual(c.next, '10h00-11h30');
  // Saturday 16h44: gap after slot 5, last slot still ahead.
  var c2 = model.dayCursor(at(17, 16, 44), store.slots);
  assert.strictEqual(c2.visible, true);
  assert.strictEqual(c2.cur, null);
  assert.strictEqual(c2.next, '16h45-18h15');
});

test('dayCursor one minute before the day begins', function () {
  var c = model.dayCursor(at(14, 8, 14), store.slots); // Wednesday 08h14
  assert.strictEqual(c.visible, false);
  assert.strictEqual(c.phase, 'before');
  assert.strictEqual(c.cur, null);
  assert.strictEqual(c.next, null);
});

test('dayCursor just before the day ends', function () {
  // Friday 18h14: still inside the last slot (ends 18h15),
  // 89 of its 90 minutes elapsed.
  var c = model.dayCursor(at(16, 18, 14), store.slots);
  assert.strictEqual(c.visible, true);
  assert.strictEqual(c.today, 'VENDREDI');
  assert.strictEqual(c.cur, '16h45-18h15');
  assert.strictEqual(c.next, null);
  assert.ok(Math.abs(c.frac - (89 / 90)) < 1e-9);
});

test('startFromToday rotates a day list per the unified anchor rule (issue 050)', function () {
  var days = ['LUNDI', 'MARDI', 'MERCREDI'];
  var ss = [{ day: 'LUNDI', time: '08h15-09h45' }, { day: 'MERCREDI', time: '10h00-11h30' }];
  // before phase: today's sessions are all ahead -> today first
  assert.deepStrictEqual(main(model.startFromToday(days, ss, at(12, 7, 0))),
    ['LUNDI', 'MARDI', 'MERCREDI']);
  // in progress: the session's end is after now -> today first
  assert.deepStrictEqual(main(model.startFromToday(days, ss, at(12, 9, 0))),
    ['LUNDI', 'MARDI', 'MERCREDI']);
  // boundary: a session ending exactly at now counts as ended -> roll
  assert.deepStrictEqual(main(model.startFromToday(days, ss, at(12, 9, 45))),
    ['MERCREDI', 'LUNDI', 'MARDI']);
  // slot gap after today's only session ended -> roll to the next session day
  assert.deepStrictEqual(main(model.startFromToday(days, ss, at(12, 9, 50))),
    ['MERCREDI', 'LUNDI', 'MARDI']);
  // no sessions today at all -> next cyclic day with sessions
  assert.deepStrictEqual(main(model.startFromToday(days, ss, at(13, 9, 0))),
    ['MERCREDI', 'LUNDI', 'MARDI']);
  // weekday evening wrap (Friday's sessions ended, Saturday has none here)
  assert.deepStrictEqual(main(model.startFromToday(days, ss, at(16, 18, 30))),
    ['LUNDI', 'MARDI', 'MERCREDI']);
  // Saturday wrap past Sunday -> Monday
  assert.deepStrictEqual(main(model.startFromToday(days, ss, at(17, 15, 26))),
    ['LUNDI', 'MARDI', 'MERCREDI']);
  // Sunday (rule 2): null anchor -> the Monday-first input stays
  assert.deepStrictEqual(main(model.startFromToday(days, ss, at(11, 10, 0))),
    ['LUNDI', 'MARDI', 'MERCREDI']);
  // degenerate: empty list / empty sessions -> unchanged
  assert.deepStrictEqual(main(model.startFromToday([], [], at(12, 9, 0))), []);
  // degenerate: single-day list at a wrap clock -> unchanged
  assert.deepStrictEqual(main(model.startFromToday(['LUNDI'], ss, at(17, 15, 26))),
    ['LUNDI']);
  // pure: the input array is never mutated (a real rotation happens here)
  var copy = days.slice();
  main(model.startFromToday(days, ss, at(13, 9, 0)));
  assert.deepStrictEqual(days, copy, 'input array is not mutated');
});

// ---- week grid shape ------------------------------------------------------

test('the grid is drawn from the six fixed days and slots', function () {
  assert.deepStrictEqual(main(store.days),
    ['LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI']);
  assert.deepStrictEqual(main(store.slots), [
    '08h15-09h45', '10h00-11h30', '11h40-13h10',
    '13h20-14h50', '15h00-16h30', '16h45-18h15'
  ]);
  // every classWeek row lands in the grid
  var w = model.classWeek(groups, 'LCS');
  w.sessions.forEach(function (s) {
    assert.notStrictEqual(store.days.indexOf(s.day), -1, 'known day: ' + s.day);
    assert.notStrictEqual(store.slots.indexOf(s.time), -1, 'known slot: ' + s.time);
  });
});

test('dayCursor defaults to the real clock when none is injected', function () {
  // just assert it runs and returns the documented shape
  var c = model.dayCursor();
  assert.ok(c && typeof c.visible === 'boolean');
  assert.ok(['sunday', 'before', 'during', 'after'].indexOf(c.phase) !== -1);
});

// ---- match.classSearch -----------------------------------------------------

test('classSearch returns the whole catalogue for an empty query', function () {
  var rows = match.classSearch(index, '');
  assert.strictEqual(rows.length, 163);
  // byte-sorted by key, deterministic
  var keys = rows.map(function (r) { return r.label; });
  var sorted = keys.slice().sort(model.cmpByte);
  assert.deepStrictEqual(keys, sorted);
});

test('classSearch ranks own-key prefix matches first', function () {
  var rows = match.classSearch(index, 'LCS');
  assert.strictEqual(rows[0].label, 'LCS');
  // the LCS* own-key nodes lead the list
  var own = main(rows.slice(0, 4).map(function (r) { return r.label; }));
  assert.deepStrictEqual(own, ['LCS', 'LCS1', 'LCS2', 'LCS3']);
});

test('classSearch finds a fully specified class by exact key', function () {
  var rows = match.classSearch(index, 'GLSI3D1');
  assert.deepStrictEqual(main(rows.map(function (r) { return r.label; })), ['GLSI3D1']);
});

test('classSearch matches a compact prefix across sections', function () {
  var rows = match.classSearch(index, 'glsi3d');
  assert.deepStrictEqual(
    main(rows.map(function (r) { return r.label; })),
    ['GLSI3D', 'GLSI3D1', 'GLSI3D2']
  );
});

test('classSearch ranks a year prefix first', function () {
  var rows = match.classSearch(index, 'lcs1');
  assert.strictEqual(rows[0].label, 'LCS1');
  assert.ok(rows.length > 1); // the LCS1* subtree follows
});

test('classSearch matches a full name via its own tier', function () {
  // the entry's own fullName "LCS2-GLSI_C Groupe 2" is an own
  // match, so GLSI1C2 outranks the alias-only hits
  var rows = match.classSearch(index, 'LCS2-GLSI_C Groupe 2');
  assert.strictEqual(rows[0].label, 'GLSI1C2');
  assert.ok(rows[0].score > rows[1].score);
});

test('classSearch matches a semester compact prefix', function () {
  var rows = match.classSearch(index, 'glsi1a');
  assert.deepStrictEqual(
    main(rows.map(function (r) { return r.label; })),
    ['GLSI1A', 'GLSI1A1', 'GLSI1A2']
  );
});

test('classSearch matches a descendant raw spelling', function () {
  // "LCS1-A Groupe 1" is a raw field value of LCS1A1 (an alias
  // text), so LCS1A1 leads, own-key nodes follow as aliases
  var rows = match.classSearch(index, 'LCS1-A Groupe 1');
  assert.strictEqual(rows[0].label, 'LCS1A1');
});

test('classSearch returns nothing for an unknown class', function () {
  assert.strictEqual(match.classSearch(index, 'ZZZZ').length, 0);
});

test('classSearch is deterministic', function () {
  var a = JSON.stringify(match.classSearch(index, 'lcs').map(function (r) { return r.label; }));
  var b = JSON.stringify(match.classSearch(index, 'lcs').map(function (r) { return r.label; }));
  assert.strictEqual(a, b);
});

// ---- suggest() regression (issue 029 must stay fixed) -----------------------

test('suggest still ranks own-key matches above aliases (issue 029)', function () {
  var labels = match.suggest(index, 'lcs').map(function (r) { return r.label; });
  assert.strictEqual(labels[0], 'LCS');
  assert.ok(labels.indexOf('LCS1') !== -1);
  assert.ok(labels.indexOf('GLSI2') === -1, 'no GLSI* alias in the top 8');
});

// ---- page structure (no browser available) --------------------------------

function readPage(name) { return fs.readFileSync(path.join(ROOT, name), 'utf8'); }

test('classes/index.html carries the teachers-page structure and script stack', function () {
  var html = readPage('classes/index.html');
  assert.ok(html.indexOf('data-page="classes"') !== -1);
  ['../js/data.js', '../js/libgroups.js', '../js/model.js', '../js/match.js',
   '../js/theme.js', '../js/color.js', '../js/classes.js'].forEach(function (s) {
    assert.ok(html.indexOf('src="' + s + '"') !== -1, 'missing script ' + s);
  });
  // the kaomoji empty state mirrors the teachers page, so the vendor is loaded
  assert.ok(html.indexOf('src="../vendor/kaomoji.js"') !== -1, 'kaomoji vendor must be loaded');
  // the author credit mirrors the teachers page, right after the status line
  assert.ok(html.indexOf('class="author-credit"') !== -1, 'missing author-credit');
  assert.ok(html.indexOf('https://github.com/adem482p') !== -1, 'missing author link');
  // SEO head mirrors the teachers page with classes-specific URLs/descriptions
  assert.ok(html.indexOf('name="description"') !== -1, 'missing meta description');
  assert.ok(html.indexOf('name="theme-color"') !== -1, 'missing theme-color');
  assert.ok(html.indexOf('rel="canonical"') !== -1, 'missing canonical');
  assert.ok(html.indexOf('https://adem482p.github.io/time/classes/') !== -1,
    'canonical/og:url must use the classes app URL (issue 072: the page moved to classes/)');
  ['id="searchWrap"', 'id="search"', 'id="suggest"', 'id="classList"',
   'id="detail"', 'id="status"', 'id="themeCycle"',
   'id="searchBack"', 'id="searchOverlay"', 'id="overlayClear"', 'id="overlayName"',
   'id="searchClear"'].forEach(function (id) {
    assert.ok(html.indexOf(id) !== -1, 'missing element ' + id);
  });
  assert.ok(html.indexOf('id="searchDone"') === -1, 'the V-chevron is gone from the classes page');
  // the theme control is ONE element: no #themeBar wrapper, no .theme-dot span
  assert.ok(html.indexOf('theme-dot') === -1, 'theme square must not use a .theme-dot span');
  assert.ok(html.indexOf('id="themeBar"') === -1, 'theme square must not use a #themeBar wrapper');
});

test('the classes nav pins the two links, and no page references the unlisted utility views (issue 073)', function () {
  // the root landing is now a pure redirect to the teachers app (issue 073);
  // the classes app's own nav addresses itself via index.html and its sibling
  // app via its directory — the utility views are unlisted, reachable only by
  // their URL (at/, all/), so their links left the nav.
  var html = readPage('classes/index.html');
  ['href="../teachers/"', 'href="index.html"'].forEach(function (a) {
    assert.ok(html.indexOf(a) !== -1, 'classes/index.html nav missing ' + a);
  });
  var nav = /<nav>[\s\S]*?<\/nav>/.exec(html);
  assert.ok(nav, 'classes/index.html keeps its nav');
  assert.strictEqual((nav[0].match(/<a /g) || []).length, 2,
    'the classes nav pins exactly two links (Teachers + Classes)');
  [/time\.html/, /timetable\.html/].forEach(function (old) {
    assert.strictEqual(old.test(html), false,
      'classes/index.html must not reference the unlisted old URL ' + old + ' (issue 073)');
  });
});

test('styles.css gains a classes section without touching the mobile block', function () {
  var css = readPage('styles.css');
  assert.ok(css.indexOf('classes page') !== -1);
  assert.ok(css.indexOf('table.week') !== -1);
  assert.ok(css.indexOf('.cursor') !== -1);
  // the current-day column is tinted like its header, before now/next so
  // now/next still win on equal specificity
  assert.ok(css.indexOf('td.c-cell.today') !== -1, 'missing c-cell.today column tint');
  assert.ok(css.indexOf('td.c-cell.today') < css.indexOf('td.c-cell.now'),
    'c-cell.today must come before c-cell.now');
  // the classes empty state shares the teachers empty-state heading style
  assert.ok(css.indexOf('no-class-selected') !== -1, 'missing no-class-selected style');
  // the V-stepping rules died with the V (issue 058); the X keeps its slot
  assert.ok(css.indexOf('#searchWrap:focus-within:has(#searchClear:not([hidden])) #searchClear') === -1,
    'the V-stepping rules died with the V');
  assert.ok(css.indexOf('body[data-page="classes"] #searchWrap:focus-within:has(#searchClear:not([hidden])) #search') === -1);
  assert.ok(css.indexOf('#search { padding-right: 2.7rem; }') !== -1, 'the X slot survives');
});

// ---- leaf-only selection + session cards (issue 047) -----------------------

// The page filters the match layer down to leaves in classes.js; the match layer
// itself is untouched, so the tests replicate the page's filter here.
function leafSet() {
  var set = {};
  groups.leaves.forEach(function (n) { set[n.key] = true; });
  return set;
}

test('the leaf-filtered catalogue is exactly the leaf set', function () {
  var set = leafSet();
  var rows = match.classSearch(index, '').filter(function (r) {
    return set[(r.node && r.node.key) || r.label];
  });
  assert.strictEqual(rows.length, groups.leaves.length);
  var labels = rows.map(function (r) { return r.label; });
  assert.ok(labels.indexOf('GLSI3D1') !== -1, 'leaf GLSI3D1 must be kept');
  assert.ok(labels.indexOf('LCS1') === -1, 'interior LCS1 must be excluded');
  assert.ok(labels.indexOf('LCS') === -1, 'interior LCS must be excluded');
  // the same filter on a mid-hierarchy query drops the interior node itself
  var sub = match.classSearch(index, 'lcs1');
  assert.ok(sub.map(function (r) { return r.label; }).indexOf('LCS1') !== -1,
    'match layer still returns the interior node (filtering lives in classes.js)');
  var kept = sub.filter(function (r) { return set[(r.node && r.node.key) || r.label]; });
  assert.ok(kept.length < sub.length);
  kept.forEach(function (r) {
    assert.ok(groups.byKey[r.label].isLeaf(), r.label + ' must be a leaf');
  });
  // class autocomplete entries resolve through the same leaf set
  var sug = match.suggest(index, 'lcs1').filter(function (r) { return r.kind === 'class'; });
  var sugKept = sug.filter(function (r) { return set[r.label]; });
  assert.ok(sug.length > sugKept.length, 'suggest still offers interior classes (classes.js filters them)');
  sugKept.forEach(function (r) {
    assert.ok(groups.byKey[r.label].isLeaf(), r.label + ' must be a leaf');
  });
});

test('leaf week sessions stay in (day, slot) order', function () {
  var w = model.classWeek(groups, 'GLSI3D1');
  assert.strictEqual(w.leaves.length, 1);
  for (var i = 1; i < w.sessions.length; i++) {
    assert.ok(model.cmpSession(w.sessions[i - 1], w.sessions[i]) <= 0);
  }
  // dayCursor boundaries are unchanged by the leaf/card work
  assert.strictEqual(model.dayCursor(at(11, 10, 0), store.slots).visible, false); // Sunday
  assert.strictEqual(model.dayCursor(at(12, 7, 0), store.slots).phase, 'before');
  assert.strictEqual(model.dayCursor(at(12, 19, 0), store.slots).phase, 'after');
  assert.strictEqual(model.dayCursor(at(12, 9, 45), store.slots).next, '10h00-11h30'); // gap
});

function classesSection() {
  var src = fs.readFileSync(path.join(ROOT, 'js/classes.js'), 'utf8');
  assert.ok(src.indexOf('function boot(') === -1, 'classes file carries no shared boot');
  return src.slice(src.indexOf('function initClassesPage'));
}

// The mobile card-list block: the day-grouped c-sessions markup at the end
// of renderWeek (liveDays computation through the last day-group section).
function classesListBlock() {
  var sec = classesSection();
  var start = sec.indexOf('var liveDays = {};');
  var end = sec.indexOf('<div class="weekwrap"', start);
  assert.ok(start !== -1 && end !== -1 && end > start, 'classes list block bounds');
  return sec.slice(start, end);
}

test('classes.js selects leaves only (no broader classes)', function () {
  var sec = classesSection();
  // leaf lookup built once from groups.leaves, applied to every surface
  assert.ok(sec.indexOf('groups.leaves.forEach') !== -1, 'missing leafSet build');
  assert.ok(sec.indexOf('function isLeafRow') !== -1, 'missing isLeafRow');
  assert.ok(sec.indexOf('function leafRows') !== -1, 'missing leafRows');
  assert.ok(sec.indexOf('leafRows(match.classSearch(index, q))') !== -1,
    'onInput/commit must leaf-filter classSearch rows');
  assert.ok(sec.indexOf('leafRows(match.classSearch(index, \'\'))') !== -1,
    'initial paint must leaf-filter the catalogue');
  assert.ok(sec.indexOf('leafSet[r.label]') !== -1,
    'classSuggestions must leaf-filter suggest rows');
  // single-leaf gates: exact refs and showClass take the nomatch path otherwise
  assert.ok(sec.indexOf('leaves.length === 1') !== -1, 'missing single-leaf commit gate');
  assert.ok(sec.indexOf('week.leaves.length !== 1') !== -1, 'missing single-leaf showClass gate');
  // the union rendering is gone: no per-line class label, no rotation helper
  assert.ok(sec.indexOf('s-class') === -1, 'union s-class span must be gone');
  assert.ok(sec.indexOf('isUnion') === -1, 'isUnion must be gone');
  assert.ok(sec.indexOf('orderedDays') === -1, 'orderedDays rotation must be gone');
  assert.ok(sec.indexOf('isNarrow') === -1, 'isNarrow gate must be gone');
});

test('classes.js emits a teacher-style day-grouped session list with today-only marking', function () {
  var sec = classesSection();
  var list = classesListBlock();
  assert.ok(list.indexOf('<table class="c-sessions">') !== -1, 'missing c-sessions table');
  assert.ok(list.indexOf('<th></th><th>Time</th>') !== -1 &&
    list.indexOf('<th>Teacher</th><th>Subject</th><th>Room</th>') !== -1,
    'c-sessions header must be Time/Teacher/Subject/Room with no Day column');
  assert.ok(list.indexOf('c-teacher') !== -1, 'missing c-teacher cells');
  assert.ok(list.indexOf('<p class="count">') === -1, 'no session count caption');
  // today-only model: isCurrentSession + the computed cursor, never the
  // wrapping nextSessionIdx
  assert.ok(list.indexOf('model.isCurrentSession(s.day, s.time, now)') !== -1);
  assert.ok(list.indexOf('s.time === cursor.next') !== -1, 'next must reuse the cursor');
  assert.ok(sec.indexOf('nextSessionIdx(') === -1, 'must not use the wrapping nextSessionIdx');
  assert.ok(list.indexOf('color.sessionRow(') !== -1, 'list rows must use color.sessionRow');
  assert.ok(list.indexOf('NEXT_ARROW') !== -1, 'list gutter must reuse NEXT_ARROW');
  // the desktop grid is untouched in structure: Monday-first store.days loops
  assert.ok(sec.indexOf('store.days.forEach') !== -1, 'grid must iterate store.days');
  assert.ok(sec.indexOf('table class="week"') !== -1 || sec.indexOf('<table class="week">') !== -1,
    'grid table.week must be kept');
});

test('classes row click keeps the filter (G1 keep-filter)', function () {
  var sec = classesSection();
  var at = sec.indexOf('li.onclick = function ()');
  assert.ok(at !== -1, 'row click handler found');
  var handler = sec.slice(at, sec.indexOf('};', at) + 2);
  assert.ok(handler.indexOf('selectClass(r.label)') !== -1, 'row click selects through the funnel');
  assert.ok(handler.indexOf('search.value =') === -1, 'row click must not rewrite the filter');
  // the sanctioned commit path still writes the filter
  var accept = sec.slice(sec.indexOf('function acceptSuggest(row)'));
  assert.ok(accept.indexOf('search.value = row.label') !== -1,
    'acceptSuggest keeps the commit write');
});

test('classes card list groups by day with no Day column (G2)', function () {
  var list = classesListBlock();
  // one h3 heading + one section per day, heading OUTSIDE the card
  assert.ok(list.indexOf('<h3 class="day-head">') !== -1, 'missing day-head h3');
  assert.ok(list.indexOf('<section class="day-group') !== -1, 'missing day-group section');
  assert.ok(list.indexOf('<h3 class="day-head">') < list.indexOf('<section class="day-group'),
    'day-head h3 must be emitted before the day-group section');
  // first-seen day grouping over the (day, slot)-ordered week
  assert.ok(list.indexOf('dayOrder.forEach') !== -1, 'missing first-seen day grouping');
  assert.ok(list.indexOf('byDay[day]') !== -1, 'missing per-day rows');
  // the day lives in the heading once: no Day header, no c-day cells
  assert.ok(list.indexOf('<th>Day') === -1, 'no Day header in the classes list');
  assert.ok(list.indexOf('c-day') === -1, 'no c-day cells in the classes list');
  assert.ok(list.indexOf('<hr') === -1, 'no rule elements in the classes list');
});

test('classes dim lives on the section, rows stay plain (G3)', function () {
  var list = classesListBlock();
  assert.ok(list.indexOf('liveDays') !== -1, 'liveDays computation must stay');
  assert.ok(list.indexOf('(liveDays[day] ? \'\' : \' dim\')') !== -1,
    'dim must move to the section');
  assert.ok(list.indexOf('dimIdle: false') !== -1, 'list rows must pass dimIdle:false');
  assert.ok(list.indexOf('dayStart') === -1, 'dayStart must not reach color.sessionRow here');
  assert.ok(list.indexOf('prevDay') === -1, 'prevDay tracking must be gone');
  assert.ok(classesSection().indexOf('dayStart') === -1,
    'no dayStart left anywhere in the classes page');
  // color.sessionRow itself is untouched (still supports the dayStart key)
  var colorSrc = fs.readFileSync(path.join(ROOT, 'js/color.js'), 'utf8');
  assert.ok(colorSrc.indexOf('dayStart') !== -1, 'color.js dayStart key must stay');
});

test('styles.css hides the week grid per viewport and labels teacher cells', function () {
  var css = readPage('styles.css');
  // desktop shows the day tables; narrow hides the WHOLE WEEK label and grid
  assert.ok(css.indexOf('#layout > #detail table.c-sessions { display: none; }') === -1,
    'desktop must keep the classes day tables visible');
  assert.ok(css.indexOf('#detail .weekwrap { display: none; }') !== -1,
    'missing narrow weekwrap hide');
  assert.ok(css.indexOf('#detail .week-head { display: none; }') !== -1,
    'missing narrow WHOLE WEEK label hide');
  assert.ok(css.indexOf('#detail .week-head { display: none; }') >
    css.lastIndexOf('@media (max-width: 700px)'),
    'the WHOLE WEEK label hide must live in a narrow block');
  assert.ok(css.indexOf('c-all') === -1, 'the flat full table is gone from the CSS');
  var deskStart = css.indexOf('@media (min-width: 701px)');
  var narrowStart = css.indexOf('@media (max-width: 700px)');
  assert.ok(deskStart !== -1 && narrowStart !== -1 && deskStart < narrowStart,
    'expected desktop block before narrow block');
  // the dead scroll-grid overrides are gone
  assert.ok(css.indexOf('.weekwrap { overflow-x: auto; }') === -1);
  assert.ok(css.indexOf('min-width: 42rem') === -1);
  assert.ok(css.indexOf('td.c-time::before { content: none') === -1);
  // teacher cells join the mobile card layout with a label
  assert.ok(css.indexOf('#detail td.c-teacher { order: 4; }') !== -1,
    'missing c-teacher card order');
  assert.ok(css.indexOf('td.c-teacher::before') !== -1, 'missing c-teacher card label');
  assert.ok(css.indexOf('content: "Teacher: ";') !== -1);
  // retained invariants: today-before-now order, list hide rule, flattening
  assert.ok(css.indexOf('td.c-cell.today') < css.indexOf('td.c-cell.now'));
  assert.ok(css.indexOf('#layout:not(.is-list) #classList') !== -1,
    'classList hide rule must stay');
  assert.ok(css.indexOf('#classList { max-width: none;') !== -1,
    'classList flattening must stay');
});

// ---- day-grouped card list behavior (G2/G3) -----------------------------------

// The list block at the end of renderWeek is straight-line HTML building over
// (week, cursor, now), so the behavioral tests drive the real block source
// in a vm sandbox with an injected clock, mirroring
// test/teacher-daygroups.test.js.
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/color.js'), 'utf8'),
  { TT: TT, console: console });
var color = TT.color;

var CLASSES_SRC = fs.readFileSync(path.join(ROOT, 'js/classes.js'), 'utf8');

function classesArrow() {
  var start = CLASSES_SRC.indexOf('var NEXT_ARROW =');
  var end = CLASSES_SRC.indexOf('</svg>\';', start);
  assert.ok(start !== -1 && end !== -1, 'NEXT_ARROW bounds');
  return CLASSES_SRC.slice(start, end + '</svg>\';'.length);
}

function runClassesList(week, now) {
  var cursor = model.dayCursor(now, store.slots);
  var sandbox = {
    console: console,
    model: model, color: color, esc: data.esc, nameHTML: data.nameHTML,
    week: week, cursor: cursor, now: now
  };
  vm.createContext(sandbox);
  var html = vm.runInContext(
    classesArrow() + '\nvar h = \'\';\n' + classesListBlock() + '\nh;',
    sandbox, { filename: 'classes-list-harness' });
  return { html: html, cursor: cursor };
}

function classHeadingsOf(html) {
  var out = [];
  var re = /<h3 class="day-head">([^<]*)<\/h3>/g;
  var m;
  while ((m = re.exec(html))) out.push(m[1]);
  return out;
}

function classSectionsOf(html) {
  return html.split('<section').slice(1).map(function (chunk) {
    var inner = chunk.slice(0, chunk.indexOf('</section>'));
    var tag = (/class="([^"]*)"/.exec(inner) || [])[1] || '';
    var tables = inner.split('<table').slice(1);
    var rows = inner.split('<tr').slice(1).filter(function (r) { return r.indexOf('<td') !== -1; });
    return { chunk: inner, cls: tag, tables: tables, rows: rows };
  });
}

function classRowTime(row) { return (/c-time">([^<]*)</.exec(row) || [])[1]; }

function checkClassesInvariants(key, clock) {
  var week = model.classWeek(groups, key);
  assert.strictEqual(week.leaves.length, 1, key + ' must resolve to one leaf');
  var res = runClassesList(week, clock);
  var html = res.html, cursor = res.cursor;
  var live = {};
  var wantNow = {}, wantNext = {};
  week.sessions.forEach(function (s) {
    var isNow = model.isCurrentSession(s.day, s.time, clock);
    var isNext = !isNow && cursor.visible && s.day === cursor.today && s.time === cursor.next;
    if (isNow || isNext) live[s.day] = true;
    if (isNow) wantNow[s.day + '|' + s.time] = true;
    else if (isNext) wantNext[s.day + '|' + s.time] = true;
  });

  var heads = classHeadingsOf(html);
  var secs = classSectionsOf(html);

  // one heading + one section per distinct day, start-from-today, none for empty days
  var distinct = [];
  week.sessions.forEach(function (s) { if (distinct.indexOf(s.day) === -1) distinct.push(s.day); });
  assert.ok(distinct.length > 1, key + ' must span several days to prove grouping');
  var rotated = main(model.startFromToday(distinct, week.sessions, clock));
  var wantHeads = rotated.map(function (d) { return model.frDay(d); });
  assert.deepStrictEqual(heads, wantHeads,
    key + ': one h3 per distinct day, start-from-today');
  assert.deepStrictEqual(distinct,
    main(store.days).filter(function (d) { return distinct.indexOf(d) !== -1; }),
    key + ': day order is the Monday-first store order');
  assert.strictEqual(secs.length, distinct.length,
    key + ': one section per distinct day');
  main(store.days).forEach(function (d) {
    if (distinct.indexOf(d) === -1)
      assert.ok(html.indexOf('day-head">' + model.frDay(d) + '<') === -1,
        key + ': no heading for empty day ' + d);
  });

  // h3 is a sibling PRECEDING the card, never a child of it
  secs.forEach(function (g) {
    assert.ok(g.chunk.indexOf('day-head') === -1,
      key + ': day-head must not live inside the section card');
  });
  distinct.forEach(function (d) {
    var fr = model.frDay(d);
    assert.ok(html.indexOf('<h3 class="day-head">' + fr + '</h3><section class="day-group') !== -1,
      key + ': heading for ' + d + ' must immediately precede its section');
  });

  // no Day column / day markers in the markup
  assert.ok(html.indexOf('c-day') === -1, key + ': no c-day cells');
  assert.ok(html.indexOf('Day</th>') === -1, key + ': no Day header');
  assert.ok(html.indexOf('daystart') === -1, key + ': no daystart class');
  assert.ok(html.indexOf('<hr') === -1, key + ': no rule elements');
  // the WHOLE WEEK label and the flat full table stay outside the day-list block
  assert.ok(html.indexOf('week-head') === -1, key + ': the WHOLE WEEK label stays outside the day-list block');
  assert.ok(html.indexOf('c-all') === -1, key + ': no flat full-table markup in the day groups');

  // row total == week.sessions.length; per-table header cells match data cells
  assert.strictEqual(html.split('<td class="c-time">').length - 1, week.sessions.length,
    key + ': row total == week.sessions.length');
  secs.forEach(function (g) {
    assert.strictEqual(g.tables.length, 1, 'one table per group');
    assert.strictEqual(g.tables[0].split('<th').length - 1, 5, 'header has 5 columns');
    g.rows.forEach(function (r) {
      assert.strictEqual(r.split('<td').length - 1, 5, 'row has 5 cells');
    });
  });

  // NOW/NEXT markers land on the cursor-computed rows
  var gotNow = {}, gotNext = {};
  secs.forEach(function (g, gi) {
    var day = rotated[gi];
    g.rows.forEach(function (r) {
      var rowKey = day + '|' + classRowTime(r);
      if (r.indexOf('nowtag') !== -1) gotNow[rowKey] = true;
      if (r.indexOf('nexttag') !== -1) gotNext[rowKey] = true;
    });
  });
  assert.deepStrictEqual(gotNow, wantNow, key + ': NOW rows match cursor logic');
  assert.deepStrictEqual(gotNext, wantNext, key + ': NEXT rows match cursor logic');

  // dim on the section iff its day has no now/next
  secs.forEach(function (g, gi) {
    var day = rotated[gi];
    assert.strictEqual(g.cls.split(' ').indexOf('dim') !== -1, !live[day],
      key + ': dim on section iff day has no now/next (' + day + ')');
  });

  // no count captions; h2-free heading order kept simple
  assert.strictEqual(html.split('class="count"').length - 1, 0, 'no p.count');
  return { week: week, html: html };
}

function friClass(hh, mm) { return new Date(2026, 9, 16, hh, mm); } // Friday
function sunClass(hh, mm) { return new Date(2026, 9, 11, hh, mm); } // Sunday

test('GLSI3D1 at Fri 12:00 groups its week with live Friday markers', function () {
  var r = checkClassesInvariants('GLSI3D1', friClass(12, 0));
  assert.strictEqual(classHeadingsOf(r.html)[0], 'vendredi');
  assert.ok(r.html.indexOf('nowtag') !== -1, 'expected a NOW marker');
  assert.ok(r.html.indexOf('nexttag') !== -1, 'expected a NEXT marker');
});

test('GLSI3D1 on Sunday morning dims every group with no markers', function () {
  var r = checkClassesInvariants('GLSI3D1', sunClass(10, 0));
  assert.strictEqual(classHeadingsOf(r.html)[0], 'lundi');
  assert.ok(r.html.indexOf('nowtag') === -1, 'nothing is NOW on Sunday');
  assert.ok(r.html.indexOf('nexttag') === -1, 'nothing is NEXT on Sunday');
  assert.ok(r.html.indexOf('day-group dim') !== -1, 'every group dims on Sunday');
});

test('GLSI3D1 at Fri 18:30 rolls the day groups forward to Saturday', function () {
  var r = checkClassesInvariants('GLSI3D1', at(16, 18, 30));
  assert.strictEqual(classHeadingsOf(r.html)[0], 'samedi');
  assert.ok(r.html.indexOf('nowtag') === -1, 'nothing is NOW at Fri 18:30');
  assert.ok(r.html.indexOf('nexttag') === -1, 'nothing is NEXT at Fri 18:30');
});

test('GLSI3D1 at Thu 15:30 starts at Thursday (a session is in progress)', function () {
  var r = checkClassesInvariants('GLSI3D1', at(15, 15, 30));
  assert.strictEqual(classHeadingsOf(r.html)[0], 'jeudi');
  assert.ok(r.html.indexOf('nowtag') !== -1, 'expected a NOW marker (in progress)');
});

test('GLSI3D1 at Sat 15:26 wraps the finished Saturday back to Monday', function () {
  var r = checkClassesInvariants('GLSI3D1', at(17, 15, 26));
  assert.strictEqual(classHeadingsOf(r.html)[0], 'lundi');
  assert.ok(r.html.indexOf('nowtag') === -1,
    'nothing is NOW at Sat 15:26 (its only Saturday session ended 09:45)');
});

test('SD1 at Tue 09:00 starts at Wednesday (no Tuesday sessions)', function () {
  var r = checkClassesInvariants('SD1', at(13, 9, 0));
  assert.deepStrictEqual(classHeadingsOf(r.html),
    ['mercredi', 'jeudi', 'vendredi', 'samedi', 'lundi']);
});

test('class list rows carry no session count badge', function () {
  var src = fs.readFileSync(path.join(ROOT, 'js/classes.js'), 'utf8');
  assert.ok(src.indexOf('weekCount') === -1, 'no per-row session counting');
  assert.ok(src.indexOf('span class="n"') === -1, 'no count badge in class rows');
});

// ---- whole-week label + grid (issue 049) -------------------------------------

test('renderWeek emits day groups, then the WHOLE WEEK label, then the week grid', function () {
  var src = fs.readFileSync(path.join(ROOT, 'js/classes.js'), 'utf8');
  var start = src.indexOf('function renderWeek');
  var end = src.indexOf('function applyCursor');
  assert.ok(start !== -1 && end !== -1 && end > start, 'renderWeek slice bounds');
  var slice = src.slice(start, end);
  var prev = -1;
  ['<h2>', '<h3 class="day-head">', '<section class="day-group',
   '<h3 class="day-head week-head">WHOLE WEEK</h3>',
   '<div class="weekwrap"><table class="week">', 'detail.innerHTML = h;'].forEach(function (m) {
    var at = slice.indexOf(m);
    assert.ok(at !== -1, 'renderWeek must emit ' + m);
    assert.ok(at > prev, 'renderWeek emissions must be in order at ' + m);
    prev = at;
  });
  function count(hay, needle) { return hay.split(needle).length - 1; }
  assert.strictEqual(count(src, '<h3 class="day-head week-head">WHOLE WEEK</h3>'), 1,
    'the WHOLE WEEK label must be emitted exactly once');
  // the flat full table is gone: no emission, no leftovers anywhere
  assert.ok(src.indexOf('<table class="c-all">') === -1, 'no c-all table emission');
  assert.ok(src.indexOf('<th>Day</th>') === -1, 'no five-column Day header left');
  assert.ok(src.indexOf('c-all') === -1, 'no c-all string anywhere in classes.js');
  // only two week.sessions.forEach walks remain in renderWeek: the liveDays
  // computation and the day grouping (the third was the flat table's)
  assert.strictEqual(count(slice, 'week.sessions.forEach'), 2,
    'exactly two week.sessions.forEach in renderWeek (liveDays + day grouping)');
  // grouping is built exactly once, for the day sections
  assert.strictEqual(count(src, 'var byDay = {};'), 1, 'byDay must be declared exactly once');
  assert.strictEqual(count(src, 'var dayOrder = [];'), 1, 'dayOrder must be declared exactly once');
  assert.strictEqual(count(src, 'dayOrder.forEach'), 1,
    'exactly one dayOrder.forEach (the sections loop)');
  // the whole-week grid stays Monday-first (issue 050): from the weekwrap
  // marker to the innerHTML write, only the two store.days loops feed it
  var gridTail = slice.slice(slice.indexOf('<div class="weekwrap"><table class="week">'),
    slice.indexOf('detail.innerHTML = h;'));
  assert.strictEqual(count(gridTail, 'store.days.forEach'), 2,
    'the week grid keeps its two Monday-first store.days loops');
  assert.strictEqual(count(gridTail, 'startFromToday'), 0,
    'startFromToday must not reach the whole-week grid');
  assert.ok(src.indexOf('nextSessionIdx(') === -1, 'must not use the wrapping nextSessionIdx');
  // the session-row helper is declared between liveDays and the first day-head
  var liveAt = slice.indexOf('var liveDays = {};');
  var headAt = slice.indexOf('<h3 class="day-head">');
  assert.ok(liveAt !== -1 && headAt > liveAt, 'liveDays must precede the first day-head');
  assert.ok(/function \w+\(/.test(slice.slice(liveAt, headAt)),
    'session-row helper must be declared between liveDays and the day-head emission');
});

// ---- live week view from the one clock (issue 051) ---------------------------

function countTok(hay, needle) { return hay.split(needle).length - 1; }

// The slice covers indexByDaySlot, renderWeek, applyCursor and onTick; the
// declarations that live in the page closure (now, currentWeek) are seeded
// to satisfy vm read-before-write, and the clock is a swappable FakeDate.
function classesWeekSlice() {
  var start = CLASSES_SRC.indexOf('function indexByDaySlot');
  var end = CLASSES_SRC.indexOf('function showClass', start);
  assert.ok(start !== -1 && end !== -1 && end > start, 'classes week slice bounds');
  return CLASSES_SRC.slice(start, end);
}

function runClassesWeek() {
  var clockMs = at(14, 10, 30).getTime(); // Wed 2026-10-14 10:30, inside 10h00-11h30
  function FakeDate() { return new Date(clockMs); }
  var writes = 0, qsa = 0, layoutRemoves = 0, clears = 0;
  var lastHtml = '';
  var detail = {};
  Object.defineProperty(detail, 'innerHTML', {
    get: function () { return lastHtml; },
    set: function (v) { lastHtml = v; writes++; }
  });
  detail.querySelectorAll = function () { qsa++; return []; };
  detail.querySelector = function (sel) {
    return sel === '.cursor' ? { style: { display: 'none' } } : null;
  };
  var sandbox = {
    console: console,
    model: model, color: color, C: color.CLASSES, esc: data.esc,
    nameHTML: data.nameHTML,
    store: store,
    week: model.classWeek(groups, 'GLSI3D1'),
    detail: detail,
    layout: { classList: { remove: function () { layoutRemoves++; } } },
    syncClear: function () { clears++; },
    now: undefined, currentWeek: undefined,
    Date: FakeDate
  };
  vm.createContext(sandbox);
  vm.runInContext(classesArrow() + '\n' + classesWeekSlice(), sandbox,
    { filename: 'classes-week-harness' });
  return {
    sandbox: sandbox,
    select: function () { vm.runInContext('renderWeek(week);', sandbox); },
    tick: function (clock) {
      clockMs = clock.getTime();
      vm.runInContext('onTick(new Date());', sandbox);
    },
    counts: function () {
      return { writes: writes, qsa: qsa, layout: layoutRemoves, clear: clears };
    },
    html: function () { return lastHtml; }
  };
}

function classRowAt(html, time) {
  return html.split('<tr').filter(function (r) {
    return r.indexOf('c-time">' + time + '<') !== -1;
  }).join('');
}

test('classes.js drives the week view from one clock and drops the gated ticker (issue 051)', function () {
  var src = CLASSES_SRC;
  assert.strictEqual(countTok(src, 'new Date()'), 3,
    'page capture + renderWeek head + the clock tick — nothing else reads the wall clock');
  assert.ok(src.indexOf('setInterval(tick, 30000)') !== -1, 'the clock owns the 30 s interval');
  ['startCursor', 'stopCursor', 'cursorTimer'].forEach(function (tok) {
    assert.ok(src.indexOf(tok) === -1, tok + ' must be gone');
  });
  assert.strictEqual(countTok(src, 'clock.subscribe(onTick);'), 1, 'one subscription per page');
  assert.ok(src.indexOf('visibilitychange') !== -1 && src.indexOf('document.hidden') !== -1,
    'the clock wires the tab-return catch-up');
  assert.strictEqual(countTok(src, 'currentWeek = null;'), 3,
    'the empty funnel owns the deselect clear; the two nomatch branches (which never reach showEmpty) drop it themselves');
  assert.ok(src.indexOf('lastWeekHTML') === -1, 'no emitted-string gate state');
  assert.ok(!/(^|[^a-zA-Z0-9_$])h\s*!==/.test(src), 'no emitted-string comparison gate');
  var slice = classesWeekSlice();
  assert.ok(slice.indexOf('now = tickNow || new Date();') !== -1,
    'renderWeek head takes the tick clock');
  assert.ok(slice.indexOf('currentWeek = week;') !== -1, 'renderWeek takes ownership');
  assert.ok(slice.indexOf('if (!tickNow) {') !== -1, 'selection side effects are fenced');
  assert.ok(slice.indexOf('renderWeek(currentWeek, t)') !== -1, 'onTick re-enters renderWeek');
  assert.ok(slice.indexOf('h !== ') === -1, 'no string gate inside the week view');
});

test('selecting a class renders the week once from a fresh clock (issue 051)', function () {
  var h = runClassesWeek();
  h.select();
  var c = h.counts();
  assert.strictEqual(c.writes, 1, 'one write per selection');
  var html = h.html();
  assert.ok(html.indexOf('<span class="nowtag">● NOW</span></td><td class="c-time">10h00-11h30') !== -1,
    'NOW lands on 10h00-11h30 at Wed 10:30');
  assert.ok(classRowAt(html, '11h40-13h10').indexOf('nexttag') !== -1,
    'NEXT marks 11h40-13h10');
  assert.strictEqual(classHeadingsOf(html)[0], 'mercredi', 'the anchor starts on today');
  assert.strictEqual(h.sandbox.currentWeek, h.sandbox.week, 'the page owns the rendered week');
  assert.strictEqual(c.layout, 1, 'the selection dismisses the list pane');
  assert.strictEqual(c.clear, 1, 'the selection syncs the clear control');
});

test('a clock tick re-renders the week view from the fresh Date (issue 051)', function () {
  var h = runClassesWeek();
  h.select();
  h.tick(at(14, 12, 0));
  var c = h.counts();
  assert.strictEqual(c.writes, 2, 'the tick writes unconditionally (no gate)');
  var html = h.html();
  assert.ok(html.indexOf('<span class="nowtag">● NOW</span></td><td class="c-time">11h40-13h10') !== -1,
    'NOW moves to the fresh slot');
  assert.ok(html.indexOf('<span class="nowtag">● NOW</span></td><td class="c-time">10h00-11h30') === -1,
    'the old NOW row is gone');
  assert.strictEqual(classHeadingsOf(html)[0], 'mercredi', 'the anchor holds within the day');
  assert.strictEqual(c.layout, 1, 'a tick never flips the pane');
  assert.strictEqual(c.clear, 1, 'a tick never syncs the clear control');
  assert.ok(c.qsa >= 4, 'applyCursor still runs on every pass, outside any gate');
  h.tick(at(14, 12, 20));
  assert.strictEqual(h.counts().writes, 3,
    'a same-state tick re-renders on the hit, not on a diff');
});

test('a tick past day end re-grades the anchor; a cleared view stays cleared (issue 051)', function () {
  var h = runClassesWeek();
  h.select();
  h.tick(at(14, 18, 30));
  assert.strictEqual(h.counts().writes, 2, 'the day-end tick re-renders unconditionally');
  var html = h.html();
  assert.strictEqual(classHeadingsOf(html)[0], 'jeudi',
    'Wed 18:30: Wednesday ended, the live anchor rolls to Thursday');
  assert.ok(html.indexOf('nowtag') === -1, 'nothing is NOW after the day');
  h.sandbox.currentWeek = null; // a clear site dropped ownership
  h.tick(at(15, 9, 0));
  assert.strictEqual(h.counts().writes, 2, 'a cleared view is never resurrected by a later tick');
});

// ---- mobile nav (issue 058) ------------------------------------------------

test('classes nav chrome: state-gated back arrow, class overlay, V gone', function () {
  var html = readPage('classes/index.html');
  ['id="searchBack"', 'id="searchOverlay"', 'id="overlayClear"', 'id="overlayName"'].forEach(function (id) {
    assert.ok(html.indexOf(id) !== -1, 'classes/index.html missing ' + id);
  });
  assert.ok(html.indexOf('id="searchDone"') === -1,
    'the V-chevron is gone from the classes page');
  var css = readPage('styles.css');
  assert.ok(css.indexOf('#searchDone') === -1, 'no #searchDone at all in styles.css');
  var base = css.slice(0, css.indexOf('@media (max-width: 700px)'));
  assert.ok(base.indexOf('#searchBack { display: none; }') !== -1,
    'desktop armour: the back arrow is display:none at base');
  assert.ok(base.indexOf('#searchOverlay { display: none; }') !== -1,
    'desktop armour: the class overlay is display:none at base');
  var narrow = css.slice(css.indexOf('@media (max-width: 700px)'));
  assert.ok(narrow.indexOf('#layout.is-list #searchBack') !== -1,
    'back arrow is gated on the list state, not on focus');
  assert.ok(narrow.indexOf('#searchOverlay:not([hidden])') !== -1,
    'overlay renders from its attribute on narrow screens');
  // issue 057's polish is shared CSS, verified live from the classes page:
  // the overlay takes the wrap's 8px radius and the input goes invisible
  var ovAt = narrow.indexOf('#searchOverlay:not([hidden])');
  var ovRule = narrow.slice(ovAt, narrow.indexOf('}', ovAt));
  assert.ok(ovRule.indexOf('border-radius: 8px') !== -1,
    'overlay takes the wrap 8px radius (issue 057, verified from classes)');
  assert.ok(narrow.indexOf('#searchWrap:has(#searchOverlay:not([hidden])) #search') !== -1,
    'the input hides while the overlay shows (issue 057, verified from classes)');
  // anti-D4: the back control is never focus-gated, and the V rules stay dead
  assert.ok(css.indexOf('#searchWrap:focus-within #searchBack') === -1,
    'the back control must never be focus-gated (anti-D4 regression pin)');
  assert.ok(css.indexOf('#searchWrap:focus-within #searchDone') === -1,
    'the dead V rule must stay gone');
});

test('classes nav machine: single selection/empty funnels, harness-safe week slice', function () {
  var src = CLASSES_SRC;
  assert.ok(src.indexOf('var menuOpen = false;') !== -1, 'menuOpen fact declared');
  assert.ok(src.indexOf('var selectedClass = null;') !== -1, 'selectedClass fact declared');
  assert.ok(src.indexOf('var lastResultCount') === -1, 'lastResultCount is dead');
  assert.ok(src.indexOf('searchFocused') === -1, 'searchFocused is dead');
  assert.ok(src.indexOf('searchDone') === -1, 'the V machinery is dead');
  // week-harness safety: that sandbox stubs only layout.classList.remove +
  // syncClear, so the slice between those bounds may carry no nav state
  var weekSlice = src.slice(src.indexOf('function indexByDaySlot'),
    src.indexOf('function showClass'));
  ['menuOpen', 'search.blur', 'syncOverlay', 'selectClass'].forEach(function (tok) {
    assert.ok(weekSlice.indexOf(tok) === -1, 'week slice must not contain ' + tok + ' (vm harness)');
  });
  function fnBody(sig) {
    var start = src.indexOf(sig);
    assert.ok(start !== -1, sig + ' found');
    var end = src.indexOf('\n    }', start);
    assert.ok(end !== -1, sig + ' bounds');
    return src.slice(start, end + '\n    }'.length);
  }
  var listFn = fnBody('function syncList()');
  assert.ok(listFn.indexOf("classList.add('is-list')") !== -1, 'syncList adds the flag');
  assert.ok(listFn.indexOf("classList.remove('is-list')") !== -1, 'syncList removes the flag');
  assert.ok(listFn.indexOf('toggle(') === -1, 'syncList uses the add/remove form, not toggle');
  var sel = fnBody('function selectClass(ref)');
  ['selectedClass = ref', 'showClass(ref)', 'search.blur()', 'menuOpen = false', 'syncOverlay()'].forEach(function (tok) {
    assert.ok(sel.indexOf(tok) !== -1, 'selectClass: ' + tok);
  });
  var emp = fnBody('function showEmpty()');
  ['selectedClass = null', 'currentWeek = null;', 'emptyStateHTML()', 'markActive(null)'].forEach(function (tok) {
    assert.ok(emp.indexOf(tok) !== -1, 'showEmpty: ' + tok);
  });
  var inputFn = fnBody('function onInput()');
  assert.ok(inputFn.indexOf('showEmpty();') !== -1, 'onInput: empty filter deselects');
  assert.ok(inputFn.indexOf('selectClass(rows[0].label)') !== -1, 'onInput: auto-jump selects via the funnel');
  var rowStart = src.indexOf('function renderList(rows)');
  var rowWiring = src.slice(rowStart, src.indexOf('function markActive(key)', rowStart));
  assert.ok(rowWiring.indexOf('selectClass(r.label)') !== -1, 'row tap selects via the funnel');
  var commitFn = src.slice(src.indexOf('function commit()'), src.indexOf("search.addEventListener('input'"));
  assert.ok(commitFn.indexOf('selectClass(q)') !== -1, 'commit exact-week selects via the funnel');
  assert.ok(commitFn.indexOf('selectClass(like)') !== -1, 'commit exact-label selects via the funnel');
  assert.ok(commitFn.indexOf('selectClass(rows[0].label)') !== -1, 'commit single-hit selects via the funnel');
  assert.ok(commitFn.indexOf('showClass(') === -1, 'commit must not bypass the selection funnel');
  var openSlice = fnBody('function openMenu()');
  assert.ok(openSlice.indexOf('menuOpen = true') !== -1, 'openMenu arms the fact');
  var closeSlice = fnBody('function closeMenu()');
  assert.ok(closeSlice.indexOf('menuOpen = false') !== -1, 'closeMenu drops the fact');
  assert.ok(closeSlice.indexOf('search.blur()') !== -1, 'closeMenu removes focus');
  assert.ok(closeSlice.indexOf('syncOverlay()') !== -1, 'closeMenu syncs the overlay');
  function handlerSlice(sig) {
    var at = src.indexOf(sig);
    assert.ok(at !== -1, sig + ' handler found');
    return src.slice(at, src.indexOf('});', at) + 3);
  }
  assert.ok(handlerSlice("addEventListener('focus'").indexOf('openMenu()') !== -1,
    'focus opens the menu');
  assert.ok(handlerSlice("search.addEventListener('click'").indexOf('openMenu()') !== -1,
    'a filter-box tap opens the menu');
  var backStart = src.indexOf("searchBack.addEventListener('click'");
  assert.ok(backStart !== -1, 'back wiring found');
  assert.ok(src.slice(backStart, src.indexOf('});', backStart) + 3).indexOf('closeMenu()') !== -1,
    'back closes the menu');
  var ovStart = src.indexOf('searchOverlay.addEventListener');
  assert.ok(ovStart !== -1, 'overlay wiring found');
  var ovWiring = src.slice(ovStart, src.indexOf('showEmpty();', ovStart) + 'showEmpty();'.length);
  assert.ok(ovWiring.indexOf('openMenu()') !== -1, 'overlay tap reopens the list');
  assert.ok(ovWiring.indexOf('search.focus()') !== -1, 'overlay tap focuses the box');
  assert.ok(ovWiring.indexOf('stopPropagation') !== -1, 'overlay X does not bubble to the surface');
  assert.ok(ovWiring.indexOf('showEmpty()') !== -1, 'overlay X deselects');
  assert.ok(handlerSlice("searchClear.addEventListener('click'").indexOf('search.focus()') === -1,
    'the X no longer re-focuses the box');
  assert.ok(handlerSlice("addEventListener('keydown'").indexOf('closeMenu();') !== -1,
    'Escape without an open suggest closes the menu');
  var bootTail = src.slice(src.indexOf('// initial paint'), src.indexOf('clock.subscribe(onTick);'));
  assert.ok(bootTail.indexOf('showEmpty();') !== -1, 'boot paints through the empty funnel');
});

// ---- theme button tooltip (issue 059) --------------------------------------

test('the theme button carries a media-gated data-tip tooltip (issue 059)', function () {
  var html = readPage('classes/index.html');
  var css = readPage('styles.css');
  var src = readPage('js/theme.js');
  // markup: the static title stays as the honest no-JS fallback, no #themeName
  assert.ok(html.indexOf('title="Cycle color preset"') !== -1,
    'the static no-JS title fallback must stay in the markup');
  assert.ok(html.indexOf('id="themeName"') === -1, 'the dead #themeName label must stay absent');
  // CSS: the ::after bubble reads its text from data-tip
  var tipStart = css.indexOf('#themeCycle::after');
  assert.ok(tipStart !== -1, 'missing #themeCycle::after tooltip rule');
  var tipBlock = css.slice(tipStart, css.indexOf('}', tipStart) + 1);
  ['content: attr(data-tip, none)', 'pointer-events: none', 'z-index: 20',
   'var(--md-inverse-surface', 'var(--md-inverse-on-surface'].forEach(function (s) {
    assert.ok(tipBlock.indexOf(s) !== -1, 'tooltip block missing ' + s);
  });
  // the hover show occurs exactly once and only inside the hover media gate
  // (a bare :hover would leave a sticky bubble on touch taps)
  var hov = css.indexOf('#themeCycle:hover::after');
  assert.ok(hov !== -1, 'missing hover show rule');
  assert.strictEqual(hov, css.lastIndexOf('#themeCycle:hover::after'),
    'the hover show must occur exactly once');
  assert.ok(hov > css.indexOf('@media (hover: hover)'),
    'the hover show must come after (inside) the @media (hover: hover) gate');
  // JS: one description feeds aria-label and data-tip; the native title is out
  ["setAttribute('aria-label'", "setAttribute('data-tip'", "removeAttribute('title')"].forEach(function (s) {
    assert.ok(src.indexOf(s) !== -1, 'js/theme.js missing ' + s);
  });
  assert.ok(src.indexOf('— click to change') !== -1,
    'the description string bytes stay unchanged');
  assert.ok(src.indexOf("setAttribute('title'") === -1,
    'js/theme.js must never write the native title');
});

// ---- clear-X / deselect back-arrow split (issues 060, 064) ------------------

test('classes mirrors the clear-X / back-arrow deselect split (issues 060, 064)', function () {
  // markup: the deselect button sits between the clear X and the overlay
  var html = readPage('classes/index.html');
  var clr = html.indexOf('id="searchClear"');
  var des = html.indexOf('id="searchDeselect"');
  var ov = html.indexOf('id="searchOverlay"');
  assert.ok(clr !== -1 && des !== -1 && ov !== -1, 'markup ids present');
  assert.ok(clr < des && des < ov, '#searchDeselect sits between #searchClear and #searchOverlay');
  // the deselect glyph is the back arrow (issue 064): the box, the id and the
  // trigger survived 060→064 verbatim, only the glyph swapped — the erase X
  // stays with #searchClear, byte for byte (classes mirrors teachers)
  function btnBlock(id) {
    var at = html.indexOf('id="' + id + '"');
    return html.slice(html.lastIndexOf('<button', at), html.indexOf('</button>', at));
  }
  var desB = btnBlock('searchDeselect');
  assert.ok(desB.indexOf('M19 12h-14M12 6l-7 6 7 6') !== -1,
    'the classes deselect shows the back arrow (arrow-left, issue 064)');
  assert.ok(desB.indexOf('M6 6l12 12M18 6L6 18') === -1,
    'the classes deselect no longer shows the X');
  assert.ok(desB.indexOf('aria-label="Back to the class list"') !== -1,
    'the deselect button is named for the back action (classes wording)');
  assert.ok(btnBlock('searchClear').indexOf('M6 6l12 12M18 6L6 18') !== -1,
    'the erase X is untouched');
  // shared CSS, verified from classes (house style): the engine cancel button
  // is suppressed once, at base; the narrow copy moved, it is not a duplicate
  var css = readPage('styles.css');
  var base = css.slice(0, css.indexOf('@media (max-width: 700px)'));
  var narrow = css.slice(css.indexOf('@media (max-width: 700px)'));
  assert.ok(base.indexOf('#search::-webkit-search-cancel-button') !== -1,
    'the native cancel button is suppressed at base (app-wide, verified from classes)');
  assert.ok(narrow.indexOf('#search::-webkit-search-cancel-button') === -1,
    'the narrow suppression copy moved to base, it is not a duplicate');
  // the app X owns the 2.7rem right slot on every viewport (the pinned
  // single-line gutter now lives at base); the ghost clears the slot too
  assert.ok(base.indexOf('#search { padding-right: 2.7rem; }') !== -1,
    'the X slot gutter is base-level (verified from classes)');
  assert.ok(narrow.indexOf('#search { padding-right: 2.7rem; }') === -1,
    'the narrow gutter copy moved to base, it is not a duplicate');
  assert.ok(base.indexOf('#ghost { padding-right: 2.7rem; }') !== -1,
    'the ghost completion clears the X slot as well');
  assert.strictEqual(base.indexOf('#searchClear { display: none; }'), -1,
    'the clear X is no longer armour-plated off desktop');
  // the deselect back arrow overlays the whole box at base; narrow armours it off
  var desAt = base.indexOf('#searchDeselect {');
  assert.ok(desAt !== -1, 'base deselect back-arrow rule present');
  var desRule = base.slice(desAt, base.indexOf('}', desAt));
  assert.ok(desRule.indexOf('position: absolute') !== -1,
    'the deselect back arrow covers the whole box (left/top/right/bottom 0)');
  assert.ok(base.indexOf('#searchDeselect[hidden] { display: none; }') !== -1,
    'the deselect back arrow honours its [hidden] attribute at base');
  assert.ok(narrow.split('\n').some(function (line) {
    return line.trim() === '#searchDeselect { display: none; }';
  }), 'narrow armours the desktop deselect back arrow off (its chrome is #overlayClear)');
  // JS: syncDeselect derives from the two facts only (I2)
  var src = CLASSES_SRC;
  function body(sig) {
    var start = src.indexOf(sig);
    assert.ok(start !== -1, sig + ' found');
    var end = src.indexOf('\n    }', start);
    assert.ok(end !== -1, sig + ' bounds');
    return src.slice(start, end + '\n    }'.length);
  }
  var sd = body('function syncDeselect()');
  assert.ok(sd.indexOf('searchDeselect.hidden = !(') !== -1,
    'syncDeselect derives the [hidden] attribute');
  assert.ok(sd.indexOf('selectedClass !== null') !== -1, 'keyed on the selection fact');
  assert.ok(sd.indexOf("search.value === ''") !== -1, 'keyed on the empty value');
  assert.ok(sd.indexOf('menuOpen') === -1, 'never keyed on the menu');
  // both syncs that sit on every fact/value write compose it (I2 stays live)
  assert.ok(body('function syncClear()').indexOf('syncDeselect();') !== -1,
    'syncClear composes syncDeselect');
  assert.ok(body('function syncOverlay()').indexOf('syncDeselect();') !== -1,
    'syncOverlay composes syncDeselect');
  // eraseFilter: commit's empty branch minus showEmpty, no funnel writes (I5)
  var ef = body('function eraseFilter()');
  ["search.value = '';", 'syncClear();', 'renderSuggest([])', 'renderGhost();',
   'syncList();'].forEach(function (tok) {
    assert.ok(ef.indexOf(tok) !== -1, 'eraseFilter: ' + tok);
  });
  assert.ok(ef.indexOf("leafRows(match.classSearch(index, ''))") !== -1,
    'eraseFilter re-renders the full leaf catalogue from the empty query');
  assert.ok(ef.indexOf('markActive') === -1,
    'the re-render re-applies the mark from activeKey itself');
  ['showEmpty', 'selectTeacher(', 'selectClass(', 'isCoarsePointer', 'matchMedia'].forEach(function (tok) {
    assert.ok(ef.indexOf(tok) === -1, 'eraseFilter must not touch ' + tok);
  });
  // the clear X calls eraseFilter and nothing else — never commit/onInput
  var clrAt = src.indexOf("searchClear.addEventListener('click'");
  assert.ok(clrAt !== -1, 'clear X handler found');
  var clrH = src.slice(clrAt, src.indexOf('});', clrAt) + 3);
  assert.ok(clrH.indexOf('eraseFilter();') !== -1, 'the X erases only');
  ['commit()', 'showEmpty()', 'search.focus()'].forEach(function (tok) {
    assert.ok(clrH.indexOf(tok) === -1, 'the X must not contain ' + tok);
  });
  // the deselect back arrow funnels through the one empty funnel, never focuses
  var desHAt = src.indexOf("searchDeselect.addEventListener('click'");
  assert.ok(desHAt !== -1, 'deselect back-arrow handler found');
  var desH = src.slice(desHAt, src.indexOf('});', desHAt) + 3);
  assert.ok(desH.indexOf('showEmpty();') !== -1, 'the deselect back arrow runs the empty funnel');
  assert.ok(desH.indexOf('search.focus()') === -1, 'the deselect back arrow never focuses the box');
  // neither press may arm focus through mousedown
  ['searchClear', 'searchDeselect'].forEach(function (id) {
    var at = src.indexOf(id + ".addEventListener('mousedown'");
    assert.ok(at !== -1, id + ' mousedown handler found');
    assert.ok(src.slice(at, src.indexOf('});', at) + 3).indexOf('preventDefault') !== -1,
      id + ' press never focuses the box');
  });
  // keyboard divergence: onInput's pinned empty branch is untouched (058)
  assert.ok(body('function onInput()').indexOf('showEmpty();') !== -1,
    'backspace-to-empty still deselects');
});

// ---- last selected class (issue 065) -----------------------------------------

// The persistence block of js/classes.js (CLASS_STORE_KEY + the two guarded
// accessors + the boot validation gate), sliced straight from source and run
// in a vm with an injected localStorage — the real logic against real
// storage stand-ins, mirroring the week/list harnesses above.
function persistenceBlock() {
  var start = CLASSES_SRC.indexOf('var CLASS_STORE_KEY');
  var end = CLASSES_SRC.indexOf('// ---- classes page', start);
  assert.ok(start !== -1 && end !== -1 && end > start, 'persistence block bounds');
  return CLASSES_SRC.slice(start, end);
}

function runPersistence(localStorage) {
  var sandbox = { console: console, model: model };
  if (localStorage !== undefined) sandbox.localStorage = localStorage;
  vm.createContext(sandbox);
  vm.runInContext(persistenceBlock(), sandbox, { filename: 'classes-persistence-harness' });
  return sandbox;
}

function memoryStorage() {
  var map = {};
  return {
    map: map,
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(map, k) ? map[k] : null; },
    setItem: function (k, v) { map[k] = String(v); },
    removeItem: function (k) { delete map[k]; }
  };
}

test('the selection funnels are the only storage write sites (issue 065)', function () {
  var src = CLASSES_SRC;
  // (a) definition + selectClass + showEmpty — exactly three, no other site
  assert.strictEqual(countTok(src, 'writeStoredClass('), 3,
    'one definition, one write in selectClass, one clear in showEmpty');
  assert.strictEqual(countTok(src, 'readStoredClass('), 2,
    'one definition, one read at boot');
  function body(sig) {
    var start = src.indexOf(sig);
    assert.ok(start !== -1, sig + ' found');
    var end = src.indexOf('\n    }', start);
    assert.ok(end !== -1, sig + ' bounds');
    return src.slice(start, end + '\n    }'.length);
  }
  // write on selection commit, at the same statement group as the fact
  var sel = body('function selectClass(ref)');
  assert.ok(sel.indexOf('selectedClass = ref') !== -1, 'the fact write stays');
  assert.ok(sel.indexOf('writeStoredClass(ref)') !== -1, 'selectClass persists the ref');
  assert.ok(sel.indexOf('selectedClass = ref') < sel.indexOf('writeStoredClass(ref)'),
    'storage mirrors the fact, in order');
  // (c) clear on explicit deselect, next to the fact clear
  var emp = body('function showEmpty()');
  assert.ok(emp.indexOf('selectedClass = null') !== -1, 'the fact clear stays');
  assert.ok(emp.indexOf('writeStoredClass(null)') !== -1, 'showEmpty forgets the class');
  // the 060 erase-only funnel stays pure: no selection fact, no storage
  var ef = body('function eraseFilter()');
  assert.ok(ef.indexOf('StoredClass') === -1 && ef.indexOf('localStorage') === -1,
    'eraseFilter never touches persistence');
});

test('boot reads, validates and restores around the empty funnel (issue 065)', function () {
  var src = CLASSES_SRC;
  var bootAt = src.indexOf('// initial paint');
  var subAt = src.indexOf('clock.subscribe(onTick);');
  assert.ok(bootAt !== -1 && subAt > bootAt, 'boot tail bounds');
  var boot = src.slice(bootAt, subAt);
  // (b) read BEFORE the funnel — showEmpty clears storage, so the local wins
  assert.ok(boot.indexOf('var stored = readStoredClass();') !== -1, 'boot reads the stored key');
  assert.ok(boot.indexOf('var stored = readStoredClass();') < boot.indexOf('showEmpty();'),
    'the read precedes the clearing funnel');
  // (b) live validation gate, then re-entry through the one selection funnel;
  // the slice ends at clock.subscribe(onTick);, so the restore is one-shot at
  // boot, before the page ever subscribes
  assert.ok(boot.indexOf('if (stored && restorable(groups, stored)) selectClass(stored);') !== -1,
    'validated restore re-enters selectClass');
  assert.strictEqual(countTok(src, 'selectClass(stored)'), 1, 'exactly one restore call');
  // (d) the no-stored-state fallback keeps the pinned shape verbatim — the
  // existing bootTail pin (test/classes.test.js, issue 058) asserts it
  assert.ok(boot.indexOf('showEmpty();') !== -1,
    'boot still paints through the empty funnel');
});

test('the stored class round-trips and clears through the guarded accessors (issue 065)', function () {
  var store = memoryStorage();
  var sb = runPersistence(store);
  // write + read round-trip of the exact ref selectClass hands over
  sb.writeStoredClass('GLSI3D1');
  assert.strictEqual(store.map['emplois-class'], 'GLSI3D1', 'written under the house key');
  assert.strictEqual(sb.readStoredClass(), 'GLSI3D1', 'read back the same ref');
  // another spelling selectClass accepts (full name) survives verbatim
  sb.writeStoredClass('LCS2-GLSI_C Groupe 2');
  assert.strictEqual(sb.readStoredClass(), 'LCS2-GLSI_C Groupe 2');
  // (c) a falsy write clears the key — the showEmpty path
  sb.writeStoredClass(null);
  assert.strictEqual('emplois-class' in store.map, false, 'deselect removes the key');
  assert.strictEqual(sb.readStoredClass(), null, 'nothing left to restore');
  // the empty string reads as nothing, never as a class
  sb.writeStoredClass('GLSI3D1');
  sb.writeStoredClass('');
  assert.strictEqual(sb.readStoredClass(), null, 'the empty string is not a class');
});

test('storage failures degrade to no-memory behavior (issue 065)', function () {
  // no localStorage at all (node/test context): both accessors no-op
  var bare = runPersistence(undefined);
  assert.strictEqual(bare.readStoredClass(), null, 'read yields null without storage');
  assert.doesNotThrow(function () { bare.writeStoredClass('GLSI3D1'); },
    'write never throws without storage');
  assert.doesNotThrow(function () { bare.writeStoredClass(null); },
    'clear never throws without storage');
  // private mode / quota: every method throws — both accessors swallow it
  var broken = {
    getItem: function () { throw new Error('SecurityError'); },
    setItem: function () { throw new Error('QuotaExceededError'); },
    removeItem: function () { throw new Error('SecurityError'); }
  };
  var sb = runPersistence(broken);
  assert.strictEqual(sb.readStoredClass(), null, 'a throwing read yields null');
  assert.doesNotThrow(function () { sb.writeStoredClass('GLSI3D1'); },
    'a throwing write never escapes');
  assert.doesNotThrow(function () { sb.writeStoredClass(null); },
    'a throwing clear never escapes');
});

test('restorable validates the stored ref against the live catalogue (issue 065)', function () {
  var sb = runPersistence(memoryStorage());
  // a real leaf restores
  assert.strictEqual(sb.restorable(groups, 'GLSI3D1'), true);
  // an interior node unions >1 leaves and was never selectable: falls through
  assert.strictEqual(sb.restorable(groups, 'LCS'), false);
  // unknown / removed class (the CSV is the single source of truth): falls through
  assert.strictEqual(sb.restorable(groups, 'ZZZZ'), false);
  // tampered prototype-key value: classWeek's plain-byKey quirk must not escape
  assert.strictEqual(sb.restorable(groups, 'constructor'), false);
  // non-strings never pass
  [null, undefined, 42, {}].forEach(function (v) {
    assert.strictEqual(sb.restorable(groups, v), false, 'rejects ' + String(v));
  });
});

// Tests for the classes page logic (issue 032) — run with
// `node --test test/classes.test.js`.
//
// The pure, DOM-free parts of the page (model.classWeek, model.dayCursor,
// match.classSearch) are exercised against the real emplois.csv, exactly like
// test/libgroups.test.js exercises the grouping library. The page itself is
// checked structurally (Svelte markup / CSS shape) since no browser is
// available — plus behaviorally for the DOM-free derivations the markup
// consumes: the day-group and live-day derivations, the per-session row
// classes and the facts renderer are sliced from
// app/src/routes/classes/+page.svelte and driven in a vm sandbox with an
// injected clock, exactly as the legacy test drove the old page script.
//
// ESM port: the browser script stack (data, libgroups, model, match, color,
// display) lives under app/src/lib/ as ES modules and is imported directly.
// The legacy vm loader that bridged the TT globals is gone, and with it the
// old main() realm-converter (arrays coming out of the imports sit in this
// file's own realm). Structural pins moved with the page:
// classes/index.html -> app/src/routes/classes/+page.svelte,
// styles.css -> app/static/app.css, js/teachers.js ->
// app/src/routes/teachers/+page.svelte, and the time page's class pills ->
// app/src/routes/at/+page.svelte.

import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import vm from 'node:vm';

import { CSV_PATH, countTok, readSrc } from './helpers.js';

import { createStore, esc } from '../app/src/lib/data.js';
import { shortcutOf, fromRows } from '../app/src/lib/libgroups.js';
import * as model from '../app/src/lib/model.js';
import * as match from '../app/src/lib/match.js';
import * as color from '../app/src/lib/color.js';
import * as display from '../app/src/lib/display.js';

// The ported surfaces the structural pins re-target: the classes page, its
// stylesheet, the sibling pages some pins share machinery with, the display
// boundary, and the color engine.
var PAGE_SRC = readSrc('app', 'src', 'routes', 'classes', '+page.svelte');
var TEACHERS_SRC = readSrc('app', 'src', 'routes', 'teachers', '+page.svelte');
var AT_SRC = readSrc('app', 'src', 'routes', 'at', '+page.svelte');
// The day-group cards and week grid are now separate components (issue 032 refactor)
var DAYGROUP_SRC = readSrc('app', 'src', 'lib', 'components', 'DayGroupCards.svelte');
var WEEKGRID_SRC = readSrc('app', 'src', 'lib', 'components', 'WeekGrid.svelte');
var CSS = readSrc('app', 'static', 'app.css');
var DISPLAY_SRC = readSrc('app', 'src', 'lib', 'display.js');
var COLOR_SRC = readSrc('app', 'src', 'lib', 'color.js');
var THEME_SRC = readSrc('app', 'src', 'lib', 'theme.js');

var store = createStore(fs.readFileSync(CSV_PATH, 'utf8'));
var modelObjs = model.buildAll(store);
var index = match.buildIndex(store, modelObjs);
var groups = modelObjs.groups;

// Slices the page component source between two exact byte markers — the vm
// harness seams. The bounds are asserted so a refactor that moves a marker
// fails loudly here instead of quietly testing a stale slice.
function pageSlice(startTok, endTok) {
  var start = PAGE_SRC.indexOf(startTok);
  var end = endTok === null ? PAGE_SRC.length : PAGE_SRC.indexOf(endTok, start);
  assert.ok(start !== -1 && end !== -1 && end > start, 'page slice bounds: ' + startTok);
  return PAGE_SRC.slice(start, end);
}

// Runs a $derived.by(...) derivation sliced from the page in a vm sandbox:
// the compiled Svelte runtime is not available in node, so the sandbox runs
// the derivation source directly against a $derived stub that invokes the
// initializer — the real page logic against real model objects. `bindings`
// carries the outer-scope names the slice reads (model, sel, now, cursor...).
function runDerived(sliceSrc, name, bindings) {
  var sandbox = { console: console, $derived: { by: function (f) { return f(); } },
                  $state: function (v) { return v; } };
  for (var k in bindings) sandbox[k] = bindings[k];
  vm.createContext(sandbox);
  vm.runInContext(sliceSrc + '\n__out__(' + name + ');', sandbox,
    { filename: 'derived-' + name });
  return sandbox.__out__;
}

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
  assert.deepStrictEqual(byNode.sessions, byRef.sessions);
});

test('classWeek unions the cohorts of a section node', function () {
  var w = model.classWeek(groups, 'LCS1A');
  assert.deepStrictEqual(
    w.leaves.map(function (l) { return l.key; }),
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
    w.leaves.map(function (l) { return l.key; }),
    want.map(function (l) { return l.key; }).sort()
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
  var g = fromRows([
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
  assert.deepStrictEqual(model.startFromToday(days, ss, at(12, 7, 0)),
    ['LUNDI', 'MARDI', 'MERCREDI']);
  // in progress: the session's end is after now -> today first
  assert.deepStrictEqual(model.startFromToday(days, ss, at(12, 9, 0)),
    ['LUNDI', 'MARDI', 'MERCREDI']);
  // boundary: a session ending exactly at now counts as ended -> roll
  assert.deepStrictEqual(model.startFromToday(days, ss, at(12, 9, 45)),
    ['MERCREDI', 'LUNDI', 'MARDI']);
  // slot gap after today's only session ended -> roll to the next session day
  assert.deepStrictEqual(model.startFromToday(days, ss, at(12, 9, 50)),
    ['MERCREDI', 'LUNDI', 'MARDI']);
  // no sessions today at all -> next cyclic day with sessions
  assert.deepStrictEqual(model.startFromToday(days, ss, at(13, 9, 0)),
    ['MERCREDI', 'LUNDI', 'MARDI']);
  // weekday evening wrap (Friday's sessions ended, Saturday has none here)
  assert.deepStrictEqual(model.startFromToday(days, ss, at(16, 18, 30)),
    ['LUNDI', 'MARDI', 'MERCREDI']);
  // Saturday wrap past Sunday -> Monday
  assert.deepStrictEqual(model.startFromToday(days, ss, at(17, 15, 26)),
    ['LUNDI', 'MARDI', 'MERCREDI']);
  // Sunday (rule 2): null anchor -> the Monday-first input stays
  assert.deepStrictEqual(model.startFromToday(days, ss, at(11, 10, 0)),
    ['LUNDI', 'MARDI', 'MERCREDI']);
  // degenerate: empty list / empty sessions -> unchanged
  assert.deepStrictEqual(model.startFromToday([], [], at(12, 9, 0)), []);
  // degenerate: single-day list at a wrap clock -> unchanged
  assert.deepStrictEqual(model.startFromToday(['LUNDI'], ss, at(17, 15, 26)),
    ['LUNDI']);
  // pure: the input array is never mutated (a real rotation happens here)
  var copy = days.slice();
  model.startFromToday(days, ss, at(13, 9, 0));
  assert.deepStrictEqual(days, copy, 'input array is not mutated');
});

// ---- week grid shape -------------------------------------------------------

test('the grid is drawn from the six fixed days and slots', function () {
  assert.deepStrictEqual(store.days,
    ['LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI']);
  assert.deepStrictEqual(store.slots, [
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
  var own = rows.slice(0, 4).map(function (r) { return r.label; });
  assert.deepStrictEqual(own, ['LCS', 'LCS1', 'LCS2', 'LCS3']);
});

test('classSearch finds a fully specified class by exact key', function () {
  var rows = match.classSearch(index, 'GLSI3D1');
  assert.deepStrictEqual(rows.map(function (r) { return r.label; }), ['GLSI3D1']);
});

test('classSearch matches a compact prefix across sections', function () {
  var rows = match.classSearch(index, 'glsi3d');
  assert.deepStrictEqual(
    rows.map(function (r) { return r.label; }),
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
    rows.map(function (r) { return r.label; }),
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

test('classSearch exposes track highlight ranges for track queries', function () {
  var rows = match.classSearch(index, 'LCS');
  var leaf = rows.filter(function (r) { return r.label === 'GLSI3D1'; })[0];
  assert.ok(leaf, 'expected GLSI3D1 in the LCS results');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(leaf.trackRanges)), [[0, 3]]);
  assert.strictEqual(match.highlightHTML(leaf.node.track, leaf.trackRanges),
    '<mark>LCS</mark>');
});

test('classSearch requires every space-separated token to match', function () {
  var rows = match.classSearch(index, 'LCS GLSI');
  var leaves = rows.filter(function (r) { return r.node.leaves().length === 1; });
  assert.ok(leaves.length > 0, 'expected combined track and specialty results');
  assert.ok(leaves.every(function (r) {
    return r.node.track === 'LCS' && r.label.indexOf('GLSI') === 0;
  }), 'every result must match both LCS and GLSI');
  assert.ok(leaves.some(function (r) { return r.label === 'GLSI3D1'; }),
    'expected GLSI3D1 in the combined results');
  assert.strictEqual(leaves.filter(function (r) { return r.node.track !== 'LCS'; }).length, 0,
    'classes from another track must be excluded');
});

test('classSearch exposes class-name highlight ranges for name tokens', function () {
  var rows = match.classSearch(index, 'LCS GLSI');
  var leaf = rows.filter(function (r) { return r.label === 'GLSI3D1'; })[0];
  assert.ok(leaf, 'expected GLSI3D1 in the combined results');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(leaf.ranges)), [[0, 4]]);
  assert.strictEqual(match.highlightHTML(leaf.label, leaf.ranges),
    '<mark>GLSI</mark>3D1');
});

// ---- suggest() regression (issue 029 must stay fixed) -----------------------

test('suggest still ranks own-key matches above aliases (issue 029)', function () {
  var labels = match.suggest(index, 'lcs').map(function (r) { return r.label; });
  assert.strictEqual(labels[0], 'LCS');
  assert.ok(labels.indexOf('LCS1') !== -1);
  assert.ok(labels.indexOf('GLSI2') === -1, 'no GLSI* alias in the top 8');
});

// ---- page structure (no browser available) ---------------------------------

test('the classes page component carries the app-page structure, module imports and ids', function () {
  var html = PAGE_SRC;
  // the ported page resolves its asset base and carries the full module
  // stack — the successor of the legacy <script src=…> list
  assert.ok(html.indexOf("from '$app/paths'") !== -1, 'the page resolves its asset base');
  ['$lib/load.js', '$lib/model.js', '$lib/match.js', '$lib/color.js',
   '$lib/libgroups.js', '$lib/data.js', '$lib/display.js', '$lib/clock.js',
   '$lib/kaomoji.js', '$lib/register.js'].forEach(function (s) {
    assert.ok(html.indexOf("from '" + s + "'") !== -1, 'missing module ' + s);
  });
  // the kaomoji empty state mirrors the teachers page, so the vendor is used
  assert.ok(html.indexOf('kaomoji.random()') !== -1 || html.indexOf('kaomoji.all()') !== -1,
    'the kaomoji fallback feeds the empty state');
  // the author credit mirrors the teachers page, under the title (issue 076
  // moved the count line under the filter box, so the credit follows the h1)
  assert.ok(html.indexOf('</h1>') !== -1 &&
    html.indexOf('</h1>') < html.indexOf('author-credit'),
    'author-credit must sit under the h1 (issue 076)');
  assert.ok(html.indexOf('https://github.com/adem482p') !== -1, 'missing author link');
  // SEO head: the page title and description travel with the component
  // (canonical/theme-color live on the built shell, not the page)
  assert.ok(html.indexOf('<title>Classes — Emplois</title>') !== -1, 'missing page title');
  assert.ok(html.indexOf('name="description"') !== -1, 'missing meta description');
  ['id="searchWrap"', 'id="search"', 'id="classList"',
   'id="detail"', 'id="status"', 'id="themeCycle"',
   'id="searchBack"', 'id="searchOverlay"', 'id="overlayClear"', 'id="overlayName"',
   'id="searchClear"'].forEach(function (id) {
    assert.ok(html.indexOf(id) !== -1, 'missing element ' + id);
  });
  assert.ok(html.indexOf('id="searchDone"') === -1, 'the V-chevron is gone from the classes page');
  // issue 075: the suggestion list and the ghost line left the classes page
  // (their absence is pinned positively in the "no autocomplete" test below)
  ['id="suggest"', 'id="ghost"'].forEach(function (id) {
    assert.ok(html.indexOf(id) === -1, 'element must stay gone from classes: ' + id);
  });
  // the theme control is ONE element: no #themeBar wrapper, no .theme-dot span
  assert.ok(html.indexOf('theme-dot') === -1, 'theme square must not use a .theme-dot span');
  assert.ok(html.indexOf('id="themeBar"') === -1, 'theme square must not use a #themeBar wrapper');
});

test('the classes page carries no navigation links, and still references no unlisted utility view (issues 075, 073)', function () {
  // Issue 075 removed the nav bar outright — the classes component is a
  // dead-end reachable only by URL (the /classes route stub remains the
  // other way in). What must stay true is issue 073's: no page references
  // the unlisted utility views.
  var html = PAGE_SRC;
  assert.strictEqual(html.indexOf('<nav'), -1,
    'the classes page ships no nav element at all (issue 075)');
  assert.strictEqual(html.indexOf('</nav>'), -1, 'no closing tag without an opener');
  ['href="../teachers/"', 'href="index.html"'].forEach(function (a) {
    assert.strictEqual(html.indexOf(a), -1,
      'the classes page must carry no nav link ' + a + ' (issue 075)');
  });
  [/time\.html/, /timetable\.html/].forEach(function (old) {
    assert.strictEqual(old.test(html), false,
      'the classes page must not reference the unlisted old URL ' + old + ' (issue 073)');
  });
});

// ---- issue 075: nav out, autocomplete out, shortcut heading in --------------

test('the class heading renders the shortcut with a real <sub> (issue 075)', function () {
  // the display boundary moved to app/src/lib/display.js; headingHTML is the
  // real renderer the page and the overlay both call.
  var heading = display.headingHTML;
  // the reporter's exact example, byte for byte
  assert.strictEqual(heading('LCS3-GLSI_D Groupe 2'), 'GLSI3 D<sub>2</sub>');
  assert.strictEqual(heading('LCS3-GLSI_D Groupe 1'), 'GLSI3 D<sub>1</sub>');
  // the documented shapes
  assert.strictEqual(heading('LBC1-H Groupe 2'), 'H1<sub>2</sub>');
  assert.strictEqual(heading('LCS1-A Groupe 1'), 'A1<sub>1</sub>');
  assert.strictEqual(heading('LBC2-BI_A Groupe 1'), 'BI2 A<sub>1</sub>');
  assert.strictEqual(heading('LCE2-IoT_A Groupe 1'), 'IoT2 A<sub>1</sub>');
  assert.strictEqual(heading('LBC3-EB_A'), 'EB3 A');
  assert.strictEqual(heading('MP1-EXR'), 'EXR1');
  assert.strictEqual(heading('MP2-SD'), 'SD2');
  assert.strictEqual(heading('MP2-SD_A'), 'SD2 A');
  // fallbacks: an unrecognized shape keeps the full name, never a blank
  assert.strictEqual(heading('LCS1'), 'LCS1');
  assert.strictEqual(heading('GLSI3D1'), 'GLSI3D1');
  assert.strictEqual(heading(''), '');
  assert.strictEqual(heading('LCS3-GLSI_D Groupe X'), 'LCS3-GLSI_D Groupe X');
  // markup safety: input HTML in a name is escaped, and the only literal
  // tags the renderer can emit are the <sub>/</sub> pair
  assert.strictEqual(heading('LCS3-GLSI_D Groupe <b>2</b>'),
    'LCS3-GLSI_D Groupe &lt;b&gt;2&lt;/b&gt;');
  var src = DISPLAY_SRC;
  assert.ok(src.indexOf('esc(sc.head)') !== -1 && src.indexOf('esc(sc.sub)') !== -1,
    'both shortcut parts are escaped before the <sub> is appended');
  assert.ok(src.indexOf('esc(name)') !== -1, 'the fallback escapes the full name');
});

test('the narrow overlay resolves the stored key before shortcutting it (issue 075)', function () {
  // overlayHeading, sliced from the page component and driven with the real
  // model/libgroups, exactly as the overlay markup runs it. headingHTML is
  // the real display-boundary renderer.
  var sandbox = { console: console, model: model };
  vm.createContext(sandbox);
  vm.runInContext(pageSlice('function overlayHeading(groups, ref)',
    '// ---- leaf-only catalogue'), sandbox, { filename: 'classes-overlay-harness' });
  function overlay(ref) {
    return display.headingHTML(sandbox.overlayHeading(groups, ref));
  }
  // the stored ref (issue 065 writes the compact key) resolves to the
  // canonical name and then shortens, byte-identical to the detail <h2>
  assert.strictEqual(overlay('GLSI3D2'), 'GLSI3 D<sub>2</sub>');
  assert.strictEqual(overlay('GLSI3D1'), 'GLSI3 D<sub>1</sub>');
  assert.strictEqual(overlay('EB1A'), 'EB3 A');
  // an unresolvable ref (removed data, tampered storage) falls back to the
  // raw ref — escaped by headingHTML, never blank
  assert.strictEqual(overlay('no-such-class'), 'no-such-class');
  assert.strictEqual(overlay('LCS1'), 'LCS1');
  assert.ok(!/undefined|null/.test(overlay('GLSI3D2')), 'no leak of undefined/null');
});

test('the shortcut heads every class-name display surface of the page (issue 075)', function () {
  var src = PAGE_SRC;
  // the detail heading (same element on desktop and narrow)…
  assert.ok(src.indexOf('<h2>{@html headingHTML(sel.week.name)}</h2>') !== -1,
    'the detail heads the week with the shortcut');
  assert.ok(src.indexOf('esc(sel.week.name)') === -1,
    'the detail heading no longer renders the raw field name');
  // …and the narrow selected-class overlay (issues 056/058 mobile chrome).
  // The stored selection is a compact key, so the overlay resolves it back to
  // the canonical class name before shortcutting it.
  assert.ok(src.indexOf('{@html headingHTML(overlayHeading(modelObjs.groups, selectedClass))}') !== -1,
    'the overlay heads the narrow view with the shortcut of the resolved name');
  assert.ok(src.indexOf('overlayHeading(groups, ref)') !== -1,
    'overlayHeading resolves the compact selection key to its canonical name');
  assert.ok(src.indexOf('model.classWeek(groups, ref)') !== -1,
    'the resolver reaches the week through model.classWeek');
  assert.ok(src.indexOf('overlayName.textContent') === -1,
    'the overlay no longer paints the raw name as text');
  // the raw name stays where correctness needs it: list identity, the
  // active mark, the no-match echo, and the issue-065 stored ref
  ['data-key={r.label}', 'activeKey', 'No match for "', 'writeStoredClass(ref)']
    .forEach(function (tok) {
      assert.ok(src.indexOf(tok) !== -1, 'the full name stays at: ' + tok);
    });
});

// ---- class hierarchy facts under the heading (issue 078) --------------------

// The real facts renderer, sliced from the page component (issue 078) and
// driven with the REAL model nodes, exactly as the detail pane renders it.
var classFactsSandbox = (function () {
  var sb = { console: console, esc: esc };
  vm.createContext(sb);
  vm.runInContext(pageSlice('function classFactsHTML(node)', '/** today-only next mark'),
    sb, { filename: 'classes-facts-harness' });
  return sb;
})();

test('classFactsHTML lists a fully specified class’s four display facts (issue 078)', function () {
  var facts = classFactsSandbox.classFactsHTML;
  var html = facts(groups.byKey['GLSI3D2']);
  // GLSI3D2 = track LCS, year 3, spec GLSI, section D, cohort 2
  var pairs = [];
  var re = /<dt class="fact-name">([^<]*)<\/dt><dd class="fact-value">([\s\S]*?)<\/dd>/g, m;
  while ((m = re.exec(html))) pairs.push([m[1], m[2]]);
  assert.deepStrictEqual(pairs, [
    ['Track', 'LCS'], ['Year', '3'], ['Specialty', 'GLSI'],
    ['Groupe', 'D<sub>2</sub>']
  ], 'a full class lists every level, in hierarchy order');
  assert.ok(html.indexOf('<dl class="class-facts">') === 0, 'facts render as one <dl class="class-facts">');
  assert.ok(/<\/dl>$/.test(html), 'the <dl> is closed');
});

test('classFactsHTML omits absent levels instead of rendering them empty (issue 078)', function () {
  var facts = classFactsSandbox.classFactsHTML;
  // MP1-EXR (byKey EXR1): MP track, year 1, spec EXR — no section, no cohort
  var html = facts(groups.byKey['EXR1']);
  var labels = [];
  var re = /<dt class="fact-name">([^<]*)<\/dt>/g, m;
  while ((m = re.exec(html))) labels.push(m[1]);
  assert.deepStrictEqual(labels, ['Track', 'Year', 'Specialty'],
    'a section-less class omits Groupe entirely');
  assert.strictEqual(html.indexOf('<dd>undefined</dd>'), -1, 'no undefined leaks');
  assert.strictEqual(html.indexOf('<dd></dd>'), -1, 'no empty <dd>');
});

test('classFactsHTML shows a common branch’s track+year as its specialty (issue 078)', function () {
  var facts = classFactsSandbox.classFactsHTML;
  // LBC1A2 sits under the LBC1 common branch: Specialty = track+year = LBC1
  var html = facts(groups.byKey['LBC1A2']);
  assert.ok(/<dt class="fact-name">Specialty<\/dt><dd class="fact-value">LBC1<\/dd>/.test(html),
    'the common branch keeps its track+year name as the specialty (LBC1)');
  // and the node really is a common branch in the model
  assert.ok(groups.byKey['LBC1'].commonBranch, 'LBC1 is the common branch in the data');
});

test('classFactsHTML escapes every value and survives a missing node (issue 078)', function () {
  var facts = classFactsSandbox.classFactsHTML;
  assert.strictEqual(facts(null), '', 'no node (no selection) renders nothing');
  assert.strictEqual(facts(undefined), '', 'undefined renders nothing');
  // markup in a data value can never inject: same esc() as the heading
  var injected = { track: '<b>T</b>', year: '1&2', specialization: 'S',
                   section: '"Q"', cohort: '<i>3</i>' };
  var html = facts(injected);
  assert.ok(html.indexOf('<b>') === -1 && html.indexOf('<i>') === -1,
    'no raw markup from data values');
  assert.ok(html.indexOf('&lt;b&gt;T&lt;/b&gt;') !== -1, 'track is escaped');
  assert.ok(html.indexOf('1&amp;2') !== -1, 'year ampersand is escaped');
  assert.ok(html.indexOf('&quot;Q&quot;') !== -1, 'section quotes are escaped');
});

test('the detail emits the facts dl between the h2 and the first day-head (issue 078)', function () {
  var src = PAGE_SRC;
  // the emission site: facts follow the heading, same detail element
  var h2At = src.indexOf('{@html headingHTML(sel.week.name)}');
  var factsAt = src.indexOf('{@html classFactsHTML(sel.week.leaves[0])}');
  // the day-head is now in the DayGroupCards component
  var headAt = DAYGROUP_SRC.indexOf('<h3 class="day-head">{model.frDay(g.day)}</h3>');
  assert.ok(h2At !== -1 && factsAt !== -1 && headAt !== -1,
    'the three emissiors exist');
  assert.ok(factsAt > h2At, 'facts sit after the h2');
  // the facts renderer is called on the week's leaf, still through one
  // {@html} write — no token-wise re-implementation of the markup
  assert.ok(/\{@html classFactsHTML\(sel\.week\.leaves\[0\]\)\}/.test(src),
    'the facts render from the real classFactsHTML of the leaf');
  // the mirror (narrow overlay) stays heading-only: the one-line ellipsis
  // chrome cannot carry a dl — pinned so the divergence is a decision
  assert.ok(src.indexOf('{@html headingHTML(overlayHeading(modelObjs.groups, selectedClass))}') !== -1,
    'the narrow overlay mirrors the heading only, no facts dl');
  assert.ok(src.indexOf('classFactsHTML(overlayHeading') === -1,
    'the overlay never carries the facts dl');
});

test('the classes page derives the count line’s absence from the one status class writer (issues 078/079)', function () {
  var src = PAGE_SRC;
  assert.strictEqual(countTok(src, "!!!(query || "), 0, 'sanity: no stray count derivation');
  assert.strictEqual(countTok(src, "(query || selectedClass !== null) ? 'count-away' : ''"), 1,
    'exactly one count-away writer — the status class derivation, inside the markup');
  assert.ok(src.indexOf("class={!!(query || selectedClass !== null) ? 'count-away' : ''}") !== -1,
    'the toggle rides the same derivation as the clear X, including selection');
  assert.ok(src.indexOf('selectedClass') !== -1, 'selectedClass participates in the count derivation');
  assert.strictEqual(src.indexOf('setTimeout'), -1, 'no timer drives the count line');
  assert.strictEqual(src.indexOf('requestAnimationFrame'), -1, 'no rAF drives the count line');
});

test('the teachers page derives the count line’s absence from the one status class writer (issue 078)', function () {
  var src = TEACHERS_SRC;
  assert.strictEqual(countTok(src, "(query || selectedTeacher) ? 'count-away' : ''"), 1,
    'exactly one count-away writer — the status class derivation, inside the markup');
  assert.ok(src.indexOf("class={!!(query || selectedTeacher) ? 'count-away' : ''}") !== -1,
    'the toggle rides the same derivation as the clear X, including selection');
  assert.ok(src.indexOf('selectedTeacher') !== -1, 'selectedTeacher participates in the count derivation');
  assert.strictEqual(src.indexOf('setTimeout'), -1, 'no timer drives the count line');
  assert.strictEqual(src.indexOf('requestAnimationFrame'), -1, 'no rAF drives the count line');
});

test('class-name display surfaces shorten aliases without changing raw identity (issue 079)', function () {
  var classes = PAGE_SRC;
  var teachers = TEACHERS_SRC;
  var at = AT_SRC;
  var daygroups = DAYGROUP_SRC;
  assert.ok(classes.indexOf('data-key={r.label}') !== -1,
    'classes list keeps the raw key in data-* identity');
  assert.ok(classes.indexOf('highlightedHeadingHTML(r.node ? r.node.fullName() : r.label, r.ranges)') !== -1,
    'classes list uses the shortcut renderer as its primary label');
  assert.ok(classes.indexOf('class-track') !== -1,
    'classes list can show structured track metadata');
  assert.ok(classes.indexOf('class-attribute') !== -1,
    'classes list can show every matched attribute');
  assert.strictEqual(classes.indexOf('class="alias"'), -1,
    'classes list does not append a redundant full-name alias');
  assert.ok(classes.indexOf('No match for "') !== -1,
    'classes no-match keeps the raw query echo');
  assert.ok(teachers.indexOf("headingHTML(r.detail)") !== -1,
    'teacher search class aliases use the shortcut renderer');
  assert.ok(teachers.indexOf("headingHTML(m.label)") !== -1,
    'teacher result class matches use the shortcut renderer');
  assert.ok(teachers.indexOf("headingHTML(r.label)") !== -1,
    'teacher class suggestions use the shortcut renderer');
  assert.ok(teachers.indexOf("headingHTML(nd.key)") !== -1,
    'teacher class breakdown uses the display renderer');
  assert.ok(at.indexOf("{@html headingHTML(p)}") !== -1,
    'time-page class pills use the shortcut renderer');
  // DayGroupCards component uses nameHTML for teacher display
  assert.ok(daygroups.indexOf("nameHTML(s.professor, '—')") !== -1,
    'DayGroupCards uses nameHTML for teacher display');
  assert.ok(classes.indexOf('writeStoredClass(ref)') !== -1,
    'classes selection storage remains raw');
});

test('the classes page ships no autocomplete machinery; the teachers page keeps its own (issue 075)', function () {
  // classes markup: no suggestion list, no inline ghost completion
  var html = PAGE_SRC;
  ['id="suggest"', 'id="ghost"', 'id="ghostPre"', 'id="ghostTyped"', 'id="ghostRest"']
    .forEach(function (tok) {
      assert.ok(html.indexOf(tok) === -1, 'classes markup must not carry ' + tok + ' (issue 075)');
    });
  // classes source: every piece of suggest machinery is gone
  var src = PAGE_SRC;
  ['renderSuggest', 'paintActive', 'classGhost', 'renderGhost', 'acceptSuggest',
   'classSuggestions', 'suggestIdx', 'suggestRows', 'isCoarsePointer',
   'match.suggest', "getElementById('suggest'",
   "getElementById('ghost'", '--ghost-pre'].forEach(function (tok) {
    assert.ok(src.indexOf(tok) === -1, 'the classes page must not carry ' + tok + ' (issue 075)');
  });
  // the input keeps every non-suggest behavior: live filtering (060), the
  // erase-only X (060/064/074), deselection and the 065 restore. The
  // deselect derivation that syncDeselect used to write is now the button's
  // hidden attribute itself.
  ['function eraseFilter()', "hidden={!(selectedClass !== null && query === '')}", 'match.classSearch',
   'readStoredClass', 'function restorable', 'oninput={onSearchInput}']
    .forEach(function (tok) {
      assert.ok(src.indexOf(tok) !== -1, 'classes keeps ' + tok);
    });
  // nameHTML is used in DayGroupCards component, not in main page
  var daygroups = DAYGROUP_SRC;
  assert.ok(daygroups.indexOf("nameHTML(s.professor, '—')") !== -1,
    'DayGroupCards uses nameHTML for teacher display');
  // teachers: markup keeps its suggest hidden element and ghost line, JS
  // renders them — untouched
  var thtml = TEACHERS_SRC;
  assert.ok(/<ul id="suggest" hidden/.test(thtml), 'teachers keeps its suggest element');
  assert.ok(/<div id="ghost"/.test(thtml), 'teachers keeps its ghost line');
  var tsrc = TEACHERS_SRC;
  ['function renderSuggest', 'function acceptSuggest', 'const sh = $derived.by',
   'match.shadowText', 'match.suggest', 'onblur={onBlur}'].forEach(function (tok) {
    assert.ok(tsrc.indexOf(tok) !== -1, 'teachers keeps ' + tok);
  });
});

test('app.css keeps the styles.css classes section without touching the mobile block', function () {
  var css = CSS;
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
  assert.ok(css.indexOf('#detail td:has(> .nowtag)') !== -1,
    'desktop NOW gutter keeps right-side padding');
  assert.ok(css.indexOf('#detail td:has(> .nexttag)') !== -1,
    'desktop NEXT gutter keeps right-side padding');
});

// ---- leaf-only selection + session cards (issue 047) -----------------------

// The page filters the match layer down to leaves in the component script;
// the match layer itself is untouched, so the tests replicate the page's
// filter here.
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
    'match layer still returns the interior node (filtering lives in the page)');
  var kept = sub.filter(function (r) { return set[(r.node && r.node.key) || r.label]; });
  assert.ok(kept.length < sub.length);
  kept.forEach(function (r) {
    assert.ok(groups.byKey[r.label].isLeaf(), r.label + ' must be a leaf');
  });
  // the shared suggest layer still offers interior classes; the classes page
  // no longer consumes it at all (issue 075: it never calls match.suggest —
  // asserted in the "leaf-only" source test below), so the leaf-set
  // filter here is the layer contract itself, not the page's.
  var sug = match.suggest(index, 'lcs1').filter(function (r) { return r.kind === 'class'; });
  var sugKept = sug.filter(function (r) { return set[r.label]; });
  assert.ok(sug.length > sugKept.length,
    'match.suggest still offers interior classes (only the leaf set keeps them)');
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

test('the classes page selects leaves only (no broader classes)', function () {
  // everything from the leaf-only catalogue marker down is page machinery
  var sec = pageSlice('// ---- leaf-only catalogue', null);
  assert.ok(sec.indexOf('function boot(') === -1, 'the component carries no shared boot');
  // leaf lookup built once from groups.leaves, applied to every surface
  assert.ok(sec.indexOf('groups.leaves.forEach') !== -1, 'missing leafSet build');
  assert.ok(sec.indexOf('function leafRows') !== -1, 'missing leafRows');
  assert.ok(sec.indexOf('leafRows(match.classSearch(index, query))') !== -1,
    'the live list must leaf-filter classSearch rows');
  // the initial paint is the boot query state: the filter boots empty and
  // the live derivation leaf-filters the catalogue from it
  assert.ok(PAGE_SRC.indexOf("let query = $state('');") !== -1, 'the filter boots empty');
  assert.ok(sec.indexOf('match.suggest') === -1,
    'the classes page never calls the suggest layer (issue 075: no autocomplete)');
  // single-leaf gates: refs resolve through the sel derivation and take the
  // week-null (nomatch) path otherwise
  assert.ok(sec.indexOf('week.leaves.length === 1') !== -1, 'missing single-leaf gate');
  assert.ok(sec.indexOf('week: null') !== -1, 'missing single-leaf nomatch path');
  // the union rendering is gone: no per-line class label, no rotation helper
  assert.ok(sec.indexOf('s-class') === -1, 'union s-class span must be gone');
  assert.ok(sec.indexOf('isUnion') === -1, 'isUnion must be gone');
  assert.ok(sec.indexOf('orderedDays') === -1, 'orderedDays rotation must be gone');
  assert.ok(sec.indexOf('isNarrow') === -1, 'isNarrow gate must be gone');
});

test('the classes page emits a teacher-style day-grouped session list with today-only marking', function () {
  // the per-day cards are now in the DayGroupCards component
  var list = DAYGROUP_SRC;
  var sec = pageSlice('// ---- leaf-only catalogue', null);
  assert.ok(list.indexOf('<table class="c-sessions">') !== -1, 'missing c-sessions table');
  assert.ok(list.indexOf('<th></th><th>Time</th>') !== -1 &&
    list.indexOf('<th>Teacher</th><th>Subject</th><th>Room</th>') !== -1,
    'c-sessions header must be Time/Teacher/Subject/Room with no Day column');
  assert.ok(list.indexOf('c-teacher') !== -1, 'missing c-teacher cells');
  assert.ok(list.indexOf('<p class="count">') === -1, 'no session count caption');
  // today-only model: the markup gates the NOW tag on isCurrentSession with
  // the computed cursor and nothing else…
  assert.ok(list.indexOf('model.isCurrentSession(s.day, s.time, now)') !== -1);
  assert.ok(list.indexOf('{#if model.isCurrentSession(s.day, s.time, now)}') !== -1 &&
    list.indexOf('{:else if nextMark(s)}') !== -1,
    'now/next land on the computed cursor, in that order');
  // …and the NEXT helper reuses the cursor, never the wrapping nextSessionIdx
  assert.ok(sec.indexOf('s.time === c.next') !== -1, 'next must reuse the cursor');
  assert.ok(sec.indexOf('nextSessionIdx(') === -1, 'must not use the wrapping nextSessionIdx');
  assert.ok(sec.indexOf('color.sessionRow(') !== -1, 'list rows must use color.sessionRow');
  assert.ok(list.indexOf('class="nexttag"') !== -1 && list.indexOf('nextarrow') !== -1,
    'list gutter must reuse the next arrow');
  // the desktop grid is untouched in structure: Monday-first store.days loops
  assert.ok(WEEKGRID_SRC.indexOf('store.days') !== -1, 'grid must iterate store.days');
  assert.ok(WEEKGRID_SRC.indexOf('<table class="week">') !== -1 && PAGE_SRC.indexOf('<table class="week">') === -1,
    'grid table.week must be in WeekGrid component, not main page');
});

test('classes row click keeps the filter (G1 keep-filter)', function () {
  var src = PAGE_SRC;
  assert.ok(src.indexOf('onclick={() => selectClass(r.label)}') !== -1,
    'row click selects through the funnel');
  assert.strictEqual(src.indexOf('searchEl.value'), -1, 'row click must not rewrite the filter');
  // with the autocomplete gone (issue 075) nothing rewrites the box except
  // the one erase-only funnel — the old acceptSuggest commit write left with it
  var writes = (src.match(/searchEl\.value\s*=/g) || []).length;
  assert.strictEqual(writes, 0,
    'no programmatic filter write is left, got ' + writes);
  var erase = pageSlice('function eraseFilter()', 'function openMenu()');
  assert.ok(erase.indexOf("query = '';") !== -1,
    'that one funnel is the erase command emptying the filter');
  assert.ok(src.indexOf('function acceptSuggest') === -1,
    'the suggest commit writer stays removed (issue 075)');
});

test('classes card list groups by day with no Day column (G2)', function () {
  // the per-day cards are now in the DayGroupCards component
  var list = DAYGROUP_SRC;
  assert.ok(list.indexOf('<section class="day-group') !== -1, 'missing day-group section');
  assert.ok(list.indexOf('<h3 class="day-head">{model.frDay(g.day)}</h3>') <
    list.indexOf('<section class="day-group'), 'day-head h3 must be emitted before the day-group section');
  // first-seen day grouping over the (day, slot)-ordered week
  var sec = DAYGROUP_SRC;
  assert.ok(sec.indexOf('dayOrder.push') !== -1, 'missing first-seen day grouping');
  assert.ok(sec.indexOf('byDay[s.day]') !== -1, 'missing per-day rows');
  // the day lives in the heading once: no Day header, no c-day cells
  assert.ok(list.indexOf('<th>Day') === -1, 'no Day header in the classes list');
  assert.ok(list.indexOf('c-day') === -1, 'no c-day cells in the classes list');
  assert.ok(list.indexOf('<hr') === -1, 'no rule elements in the classes list');
});

test('classes dim lives on the section, rows stay plain (G3)', function () {
  // the per-day cards are now in the DayGroupCards component
  var list = DAYGROUP_SRC;
  // liveDays is computed in the main page and passed as prop
  var src = PAGE_SRC;
  assert.ok(src.indexOf('const liveDays = $derived.by') !== -1, 'liveDays computation must stay');
  assert.ok(list.indexOf("{liveDays[g.day] ? '' : ' dim'}") !== -1,
    'dim must ride the section');
  // dimIdle: false is in the DayGroupCards component
  assert.ok(DAYGROUP_SRC.indexOf('dimIdle: false') !== -1, 'list rows must pass dimIdle:false');
  assert.ok(DAYGROUP_SRC.indexOf('dayStart') === -1, 'dayStart must not reach color.sessionRow here');
  assert.ok(DAYGROUP_SRC.indexOf('prevDay') === -1, 'prevDay tracking must be gone');
  // color.sessionRow itself is untouched (still supports the dayStart key)
  assert.ok(COLOR_SRC.indexOf('dayStart') !== -1, 'color.js dayStart key must stay');
});

test('app.css hides the week grid per viewport and labels teacher cells', function () {
  var css = CSS;
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

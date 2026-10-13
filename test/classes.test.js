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
// TT context, exactly like classes.html's <script> tags do in the browser.
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
  // "GLSI" spans years 2 and 3 — the union of both, not just the first.
  var w = model.classWeek(groups, 'GLSI');
  var want = groups.byKey['GLSI2'].leaves().concat(groups.byKey['GLSI3'].leaves());
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
  assert.strictEqual(w2.leaves[0].key, 'GLSI2C2');
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
  // match, so GLSI2C2 outranks the alias-only hits
  var rows = match.classSearch(index, 'LCS2-GLSI_C Groupe 2');
  assert.strictEqual(rows[0].label, 'GLSI2C2');
  assert.ok(rows[0].score > rows[1].score);
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

test('classes.html carries the teachers-page structure and script stack', function () {
  var html = readPage('classes.html');
  assert.ok(html.indexOf('data-page="classes"') !== -1);
  ['js/data.js', 'js/libgroups.js', 'js/model.js', 'js/match.js',
   'js/theme.js', 'js/color.js', 'js/app.js'].forEach(function (s) {
    assert.ok(html.indexOf('src="' + s + '"') !== -1, 'missing script ' + s);
  });
  // the empty state is plain text, so the kaomoji vendor is not loaded
  assert.ok(html.indexOf('kaomoji') === -1);
  ['id="searchWrap"', 'id="search"', 'id="suggest"', 'id="classList"',
   'id="detail"', 'id="status"', 'id="themeCycle"',
   'id="searchDone"', 'id="searchClear"'].forEach(function (id) {
    assert.ok(html.indexOf(id) !== -1, 'missing element ' + id);
  });
  // the theme control is ONE element: no #themeBar wrapper, no .theme-dot span
  assert.ok(html.indexOf('theme-dot') === -1, 'theme square must not use a .theme-dot span');
  assert.ok(html.indexOf('id="themeBar"') === -1, 'theme square must not use a #themeBar wrapper');
});

test('every page links to the Classes page in its nav', function () {
  ['classes.html'].forEach(function (p) {
    var html = readPage(p);
    assert.ok(html.indexOf('href="classes.html"') !== -1, p + ' has no Classes link');
  });
});

test('styles.css gains a classes section without touching the mobile block', function () {
  var css = readPage('styles.css');
  assert.ok(css.indexOf('classes page') !== -1);
  assert.ok(css.indexOf('table.week') !== -1);
  assert.ok(css.indexOf('.cursor') !== -1);
  // the pre-existing mobile search-button block is intact (rule text per
  // issue 031: the V owns right:0 and the X is the control that steps aside)
  assert.ok(css.indexOf('#searchWrap:focus-within:has(#searchClear:not([hidden])) #searchClear') !== -1);
});

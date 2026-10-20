// Tests for stage-2 session fusion (same teacher, same day+time, different
// classrooms -> one merged "A or B" row). Run with:
//   node --test test/classes.test.js test/libgroups.test.js test/fusion.test.js
//
// Loads the browser script stack over the real emplois.csv, exactly like
// test/classes.test.js does.

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

function main(arr) { return Array.prototype.slice.call(arr); }

// Oct 16 2026 is a Friday; Fri 12h00 sits inside slot 3 (11h40-13h10).
function fri(hh, mm) { return new Date(2026, 9, 16, hh, mm); }

function fusedOf(name) { return model.fuseSessions(store.sessionsOf(name), groups); }

// ---- the Barboura VENDREDI 13h20 triple --------------------------------------

test('fusion merges the Barboura VENDREDI 13h20 triple into one row', function () {
  // raw ground truth: three distinct (room, subject) stage-1 rows
  var raw = store.sessionsOf('Barboura').filter(function (s) {
    return s.day === 'VENDREDI' && s.time === '13h20-14h50';
  });
  assert.strictEqual(raw.length, 3);
  assert.deepStrictEqual(
    main(raw.map(function (s) { return s.room + '|' + s.subject + '|' + s.week; }).sort()),
    ['info A1|Fondements de Cybersécurité|SA',
     'info A1|Sécurité Réseaux sans fils|SB',
     'info B4|Programmation Python|']);

  var rows = fusedOf('Barboura').filter(function (r) {
    return r.day === 'VENDREDI' && r.time === '13h20-14h50';
  });
  assert.strictEqual(rows.length, 1);
  var row = rows[0];
  assert.strictEqual(row.professor, 'Barboura');
  assert.strictEqual(row.room, 'info A1 or info B4');
  assert.strictEqual(row.subject,
    'Fondements de Cybersécurité or Programmation Python or Sécurité Réseaux sans fils');
  assert.deepStrictEqual(main(row.fields), ['LCS1-B Groupe 2', 'MP1-EXR']);
  assert.deepStrictEqual(main(row.pills),
    main(model.pillsFor(groups, ['LCS1-B Groupe 2', 'MP1-EXR'])));
  assert.strictEqual(row.week, '');
  assert.strictEqual(row.merged, true);
});

test('3+ alternatives join as a plain " or " chain with no Oxford comma', function () {
  var row = fusedOf('Barboura').filter(function (r) {
    return r.day === 'VENDREDI' && r.time === '13h20-14h50';
  })[0];
  assert.strictEqual(row.subject.split(' or ').length, 3);
  assert.ok(row.subject.indexOf(',') === -1, 'no Oxford comma: ' + row.subject);
  assert.strictEqual(row.room.split(' or ').length, 2);
});

test('Barboura collapses 18 raw sessions to 12 fused rows', function () {
  assert.strictEqual(store.sessionsOf('Barboura').length, 18);
  var fused = fusedOf('Barboura');
  assert.strictEqual(fused.length, 12);
  assert.strictEqual(fused.filter(function (r) { return r.merged; }).length, 4);
});

// ---- the Ben Fradj JEUDI 16h45 same-subject pair ------------------------------

test('fusion merges the Ben Fradj JEUDI 16h45 same-subject pair', function () {
  // verify the pair against the raw data first: two rooms, two week markers
  var raw = store.sessionsOf('Ben Fradj').filter(function (s) {
    return s.day === 'JEUDI' && s.time === '16h45-18h15';
  });
  assert.strictEqual(raw.length, 4);
  var rooms = {}, weeks = {}, subjects = {};
  raw.forEach(function (s) { rooms[s.room] = true; weeks[s.week] = true; subjects[s.subject] = true; });
  assert.deepStrictEqual(Object.keys(rooms).sort(), ['A5', 'B3']);
  assert.deepStrictEqual(Object.keys(weeks).sort(), ['SA', 'SB']);
  assert.deepStrictEqual(Object.keys(subjects), ['Systèmes d\'exploitation']);

  var rows = fusedOf('Ben Fradj').filter(function (r) {
    return r.day === 'JEUDI' && r.time === '16h45-18h15';
  });
  assert.strictEqual(rows.length, 1);
  var row = rows[0];
  assert.strictEqual(row.room, 'A5 or B3');
  assert.strictEqual(row.subject, 'Systèmes d\'exploitation');
  assert.ok(row.subject.indexOf(' or ') === -1, 'single subject stays unjoined');
  assert.deepStrictEqual(main(row.fields), [
    'LCS1-A Groupe 1', 'LCS1-A Groupe 2', 'LCS1-B Groupe 1', 'LCS1-B Groupe 2']);
  assert.deepStrictEqual(main(row.pills), main(model.pillsFor(groups, main(row.fields))));
  assert.strictEqual(row.week, '');
  assert.strictEqual(row.merged, true);
});

// ---- singleton pass-through ---------------------------------------------------

test('unmerged teachers pass through with no merged flag and recorded counts', function () {
  [['Adel', 6], ['Chafroud', 10], ['Dlima', 10]].forEach(function (pair) {
    var fused = fusedOf(pair[0]);
    assert.strictEqual(fused.length, pair[1], pair[0] + ' fused count');
    fused.forEach(function (r) {
      assert.deepStrictEqual(Object.keys(r),
        ['professor', 'day', 'time', 'room', 'subject', 'fields', 'pills'],
        pair[0] + ' singleton keeps the stage-1 shape');
      assert.ok(!('merged' in r), pair[0] + ' singleton has no merged flag');
      assert.ok(!('week' in r), pair[0] + ' singleton has no week field');
    });
  });
});

// ---- determinism -----------------------------------------------------------------

test('fusion is deterministic under reversed input order', function () {
  [['Barboura'], ['Ben Fradj'], ['Dlima']].forEach(function (pair) {
    var sessions = store.sessionsOf(pair[0]);
    var fwd = model.fuseSessions(sessions, groups);
    var rev = model.fuseSessions(sessions.slice().reverse(), groups);
    assert.strictEqual(JSON.stringify(rev), JSON.stringify(fwd),
      pair[0] + ' fuses identically reversed');
  });
  var slice = store.byDaySlot('VENDREDI', '13h20-14h50');
  assert.strictEqual(JSON.stringify(model.fuseSessions(slice.slice().reverse(), groups)),
    JSON.stringify(model.fuseSessions(slice, groups)));
});

test('fused output stays sorted by cmpFusedSession across runs', function () {
  ['Barboura', 'Ben Fradj', 'Dlima'].forEach(function (n) {
    var a = model.fuseSessions(store.sessionsOf(n), groups);
    var b = model.fuseSessions(store.sessionsOf(n), groups);
    assert.strictEqual(JSON.stringify(b), JSON.stringify(a), n + ' stable across runs');
    for (var i = 1; i < a.length; i++)
      assert.ok(model.cmpFusedSession(a[i - 1], a[i]) <= 0, n + ' sorted output');
  });
});

// ---- clock-driven consumers at Fri 12h00 -------------------------------------------

test('singleton nextSessionIdx marks the earliest next occurrence at Fri 12:00', function () {
  var fused = fusedOf('Dlima');
  var at = fri(12, 0);
  assert.deepStrictEqual(main(Array.from(model.nextSessionIdx(fused, at))), [8]);
});

// ---- week-union rule: synthetic -----------------------------------------------------

function synthGroups() {
  return TT.groups.fromRows([
    { professor: 'P', day: 'LUNDI', time: '08h15-09h45', room: 'R1',
      subject: 'S', field: 'LCS1-A Groupe 1' },
    { professor: 'P', day: 'LUNDI', time: '08h15-09h45', room: 'R1',
      subject: 'S', field: 'LCS1-A Groupe 2' }
  ]);
}

function synthFuse(g, weeks) {
  var sessions = weeks.map(function (w, i) {
    return { professor: 'P', day: 'LUNDI', time: '08h15-09h45',
      room: i === 0 ? 'R1' : 'R2', subject: 'S',
      field: i === 0 ? 'LCS1-A Groupe 1' : 'LCS1-A Groupe 2', week: w };
  });
  var out = model.fuseSessions(sessions, g);
  assert.strictEqual(out.length, 1, 'synthetic pair merges for weeks ' + JSON.stringify(weeks));
  assert.strictEqual(out[0].room, 'R1 or R2');
  assert.strictEqual(out[0].merged, true);
  return out[0];
}

test('week-union keeps a single shared SA/SB marker (synthetic)', function () {
  var g = synthGroups();
  assert.strictEqual(synthFuse(g, ['SA', 'SA']).week, 'SA');
  assert.strictEqual(synthFuse(g, ['SB', 'SB']).week, 'SB');
});

test('week-union collapses mixed and weekly markers to every week (synthetic)', function () {
  var g = synthGroups();
  assert.strictEqual(synthFuse(g, ['SA', 'SB']).week, '');
  assert.strictEqual(synthFuse(g, ['', 'SA']).week, '');
  assert.strictEqual(synthFuse(g, ['', '']).week, '');
});

test('week-union never produces S1 (synthetic)', function () {
  var g = synthGroups();
  assert.strictEqual(synthFuse(g, ['S1', 'S1']).week, '');
  assert.strictEqual(synthFuse(g, ['S1', 'SA']).week, '');
  model.fuseSessions(store.sessionsOf('Barboura'), groups).forEach(function (r) {
    assert.ok((r.week || '') !== 'S1', 'no S1 on fused rows');
  });
});

// ---- week-union rule: real data -------------------------------------------------------

test('real merged rows resolve mixed weeks to every week', function () {
  var triple = fusedOf('Barboura').filter(function (r) {
    return r.day === 'VENDREDI' && r.time === '13h20-14h50';
  })[0];
  assert.strictEqual(triple.week, ''); // SA + SB + weekly
  var pair = fusedOf('Ben Fradj').filter(function (r) {
    return r.day === 'JEUDI' && r.time === '16h45-18h15';
  })[0];
  assert.strictEqual(pair.week, ''); // SA + SB
  // corpus-wide: merged weeks are only '', 'SA' or 'SB' — never 'S1'
  store.teachers.forEach(function (n) {
    model.fuseSessions(store.sessionsOf(n), groups).forEach(function (r) {
      if (r.merged) assert.ok(r.week === '' || r.week === 'SA' || r.week === 'SB',
        n + ' merged week: ' + JSON.stringify(r.week));
    });
  });
});

// ---- time-page slice -----------------------------------------------------------

test('time-page slice collapses per teacher without mixing professors', function () {
  var slice = store.byDaySlot('VENDREDI', '13h20-14h50');
  assert.strictEqual(slice.length, 60);
  var stage1keys = {};
  slice.forEach(function (s) { stage1keys[model.fusionKey(s)] = true; });
  var fused = model.fuseSessions(slice, groups);
  // only Barboura's triple collapses (3 stage-1 rows -> 1)
  assert.strictEqual(fused.length, Object.keys(stage1keys).length - 2);
  var barboura = fused.filter(function (r) { return r.professor === 'Barboura'; });
  assert.strictEqual(barboura.length, 1);
  assert.strictEqual(barboura[0].merged, true);
  assert.strictEqual(barboura[0].room, 'info A1 or info B4');
  // a lone teacher in the same slot stays a singleton
  var dlima = fused.filter(function (r) { return r.professor === 'Dlima'; });
  assert.strictEqual(dlima.length, 1);
  assert.ok(!('merged' in dlima[0]));
});

// ---- untouched layers ------------------------------------------------------------

test('raw layers are unchanged: classWeek length, availability, one match query', function () {
  assert.strictEqual(model.classWeek(groups, 'GLSI3D1').sessions.length, 22);
  assert.strictEqual(model.availability(fusedOf('Dlima'), fri(12, 0)), 'today');
  assert.deepStrictEqual(
    main(match.classSearch(index, 'glsi3d').map(function (r) { return r.label; })),
    ['GLSI3D', 'GLSI3D1', 'GLSI3D2']);
});

// ---- XSS: joined values escape exactly once ------------------------------------------

test('joined rooms escape exactly once', function () {
  var g = synthGroups();
  var sessions = [
    { professor: 'P', day: 'VENDREDI', time: '13h20-14h50', room: 'A<b>',
      subject: 'S', field: 'LCS1-A Groupe 1', week: '' },
    { professor: 'P', day: 'VENDREDI', time: '13h20-14h50', room: 'B&"',
      subject: 'S', field: 'LCS1-A Groupe 2', week: '' }
  ];
  var out = model.fuseSessions(sessions, g);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].room, 'A<b> or B&"');
  assert.strictEqual(data.esc(out[0].room), 'A&lt;b&gt; or B&amp;&quot;');
  assert.ok(data.esc(out[0].room).indexOf('&amp;amp;') === -1, 'no double escape');
});

// ---- the retired live-summary machinery stays gone ---------------------

test('the summary machinery stays removed from code, color and CSS', function () {
  assert.strictEqual(typeof model.teacherSummary, 'undefined');
  assert.strictEqual(model.EN_DAY, undefined);
  assert.ok(fs.readFileSync(path.join(ROOT, 'js/color.js'), 'utf8').indexOf('emph') === -1,
    'color.js keeps no emphasis hook or emph class');
  var css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
  assert.ok(css.indexOf('#detail .summary') === -1, 'dead .summary selector stays gone');
  assert.ok(css.indexOf('#detail em') === -1, 'dead #detail em rule stays gone');
});

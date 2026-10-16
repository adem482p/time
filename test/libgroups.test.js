// Tests for js/libgroups.js — run with `node --test test/`.
//
// The grouping library is exercised against the real emplois.csv (the single
// source of truth), so these tests double as a data contract: if the parser
// emits a class we cannot model, something here fails.

'use strict';

var test = require('node:test');
var assert = require('node:assert');
var fs = require('node:fs');
var path = require('node:path');

var Groups = require('../js/libgroups.js');

var CSV_PATH = path.join(__dirname, '..', 'emplois.csv');
var SOURCE_PATH = path.join(__dirname, '..', 'js', 'libgroups.js');

// Minimal RFC 4180 reader: the CSV has quoted fields that contain commas
// (e.g. "Intro Analyse, Vis données"), so a naive split is not enough.
function parseCSV(text) {
  var rows = [];
  var row = [];
  var cur = '';
  var quoted = false;
  for (var i = 0; i < text.length; i++) {
    var c = text.charAt(i);
    if (quoted) {
      if (c === '"') {
        if (text.charAt(i + 1) === '"') { cur += '"'; i++; }
        else { quoted = false; }
      } else { cur += c; }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ',') {
      row.push(cur); cur = '';
    } else if (c === '\n') {
      row.push(cur); rows.push(row); row = []; cur = '';
    } else if (c === '\r') {
      // ignore
    } else {
      cur += c;
    }
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

var table = parseCSV(fs.readFileSync(CSV_PATH, 'utf8'));
var header = table.shift();
var fieldCol = header.indexOf('field');
var rows = table.map(function (r) { return { field: r[fieldCol] }; });
var grouping = Groups.fromRows(rows);

function keys(nodes) { return nodes.map(function (n) { return n.key; }).join(','); }
function candidateKeys(result) {
  return result.candidates.map(function (n) { return n.key; });
}

test('exports the documented surface', function () {
  ['TRACKS', 'SECTIONS', 'COHORTS', 'GroupsError', 'Grouping', 'ClassNode',
   'normalize', 'parseLevels', 'parseFullName', 'formatFull', 'formatCompact',
   'build', 'fromFieldValues', 'fromRows'].forEach(function (name) {
    assert.ok(name in Groups, 'missing export: ' + name);
  });
});

test('reads the whole dataset: 94 fully specified classes', function () {
  assert.strictEqual(rows.length, 2093);
  assert.strictEqual(grouping.leaves.length, 94);
});

test('every raw field round-trips through its leaf', function () {
  var seen = {};
  rows.forEach(function (r) { seen[r.field] = true; });
  var fields = Object.keys(seen);
  assert.strictEqual(fields.length, 94);
  fields.forEach(function (f) {
    var leaf = grouping.leafFor(f);
    assert.ok(leaf, 'no leaf for ' + f);
    assert.strictEqual(leaf.fullName(), f);
    assert.strictEqual(leaf.compactName(), leaf.key);
  });
});

test('section and cohort sets are read from the data', function () {
  assert.strictEqual(keys(grouping.sections('LBC1')), 'LBC1A,LBC1B,LBC1C,LBC1D,LBC1E,LBC1F,LBC1G,LBC1H');
  assert.strictEqual(keys(grouping.cohorts('LBC1A')), 'LBC1A1,LBC1A2');
  assert.strictEqual(keys(grouping.sections('IRS3')), 'IRS3A');
  assert.strictEqual(keys(grouping.sections('SD3')), 'SD3A,SD3B');
});

test('LBC3-EB has a section but no cohorts', function () {
  assert.strictEqual(keys(grouping.sections('EB1')), 'EB1A');
  assert.strictEqual(grouping.cohorts('EB1A').length, 0);
  assert.ok(grouping.resolveOne('EB1A').isLeaf());
});

test('MP1-SD is a fully specified class with no section or cohort', function () {
  var n = grouping.resolveOne('MP1-SD');
  assert.strictEqual(n.section, null);
  assert.strictEqual(n.cohort, null);
  assert.ok(n.isLeaf());
  assert.ok(n.ownsTimetable());
  assert.strictEqual(n.fullName(), 'MP1-SD');
  assert.strictEqual(n.compactName(), 'SD1');
});

test('broad references are valid and ambiguous', function () {
  var cases = [
    ['GLSI', ['GLSI1', 'GLSI3']],
    ['LBC3', ['BI3', 'EB1']],
    ['MP1', ['EXR1', 'SD1']],
    ['LCS', ['LCS1', 'GLSI1', 'GLSI3']],
    ['MP', ['EXR1', 'SD1', 'EXR3', 'SD3']]
  ];
  cases.forEach(function (c) {
    var r = grouping.resolve(c[0]);
    assert.strictEqual(r.status, 'ambiguous', c[0]);
    assert.ok(r.ambiguous);
    assert.deepStrictEqual(candidateKeys(r).sort(), c[1].sort());
    assert.strictEqual(r.node.key, r.candidates[0].key);
  });
});

test('interior and leaf references resolve as expected', function () {
  var g3 = grouping.resolveOne('GLSI3');
  assert.strictEqual(g3.key, 'GLSI3');
  assert.strictEqual(g3.leaves().length, 8);

  assert.strictEqual(grouping.resolveOne('LCS2').key, 'GLSI1');       // unambiguous: one CS year-2 spec
  assert.strictEqual(grouping.resolveOne('LCS3-GLSI_D Groupe 1').key, 'GLSI3D1');
  assert.strictEqual(grouping.resolveOne('LCS1-A').key, 'LCS1A');
  assert.strictEqual(grouping.resolveOne('LCS1-A').leaves().length, 2);
  assert.strictEqual(grouping.resolveOne('MP2-SD_A').key, 'SD3A');
});

test('invalid references are reported, never silently mapped', function () {
  var reasons = {
    '': 'EMPTY',
    'GLSI2': 'UNKNOWN_YEAR',
    'GLSI4': 'UNKNOWN_YEAR',
    'BI2': 'UNKNOWN_YEAR',
    'IRS2': 'UNKNOWN_YEAR',
    'IOT2': 'UNKNOWN_YEAR',
    'SD2': 'UNKNOWN_YEAR',
    'EXR2': 'UNKNOWN_YEAR',
    'EB3': 'UNKNOWN_YEAR',
    'EB2': 'UNKNOWN_YEAR',
    'XYZ': 'UNKNOWN_TRACK',
    'GLSI3-Z': 'UNKNOWN_SECTION',
    'LCS-A': 'MALFORMED',
    'GLSIA': 'MALFORMED',
    'GLSI-A': 'MALFORMED',
    'LBC3-EB_B': 'UNKNOWN_SECTION',
    'LBC3-EB_A Groupe 1': 'UNKNOWN_COHORT'
  };
  Object.keys(reasons).forEach(function (ref) {
    var r = grouping.resolve(ref);
    assert.strictEqual(r.status, 'invalid', ref);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.node, null);
    assert.strictEqual(r.reason, reasons[ref], ref);
  });
});

test('resolve never throws; resolveOne throws for invalid and ambiguous', function () {
  function thrownCode(fn) { try { fn(); } catch (e) { return e.code; } return null; }

  assert.doesNotThrow(function () { grouping.resolve(null); });
  assert.doesNotThrow(function () { grouping.resolve('!!! nonsense !!!'); });
  assert.strictEqual(thrownCode(function () { grouping.resolveOne('GLSI'); }), 'AMBIGUOUS_REFERENCE');
  assert.strictEqual(thrownCode(function () { grouping.resolveOne('XYZ'); }), 'INVALID_REFERENCE');
  try {
    grouping.resolveOne('GLSI');
    assert.fail('expected resolveOne to throw');
  } catch (e) {
    assert.strictEqual(e.name, 'GroupsError');
    assert.strictEqual(e.code, 'AMBIGUOUS_REFERENCE');
  }
});

test('input is lenient: case, separators, ordering and aliases', function () {
  assert.strictEqual(grouping.resolveOne('  glsi-3-d-1 ').key, 'GLSI3D1');
  assert.strictEqual(grouping.resolveOne('LCS-3-GLSI').key, 'GLSI3');
  assert.strictEqual(grouping.resolveOne('lcs2-glsi_a groupe 2').key, 'GLSI1A2');
  assert.strictEqual(grouping.resolveOne('iot1').specialization, 'IoT');
  assert.strictEqual(grouping.resolveOne('IOT3-A').specialization, 'IoT');
});

test('track-implied references are accepted', function () {
  assert.strictEqual(grouping.resolveOne('LCS2A1').key, 'GLSI1A1');
  assert.strictEqual(grouping.resolveOne('LCS2GLSI').key, 'GLSI1');
});

test('common-branch compact form is accepted', function () {
  assert.strictEqual(grouping.resolveOne('LBC1A2').key, 'LBC1A2');
  assert.strictEqual(grouping.resolveOne('LCS1A2').key, 'LCS1A2');
  assert.strictEqual(grouping.resolveOne('LCS1A2').specialization, 'LCS');
  assert.ok(grouping.resolveOne('LCS1A2').commonBranch);
});

test('a runtime catalogue can forward-declare offerings', function () {
  var g = Groups.build({ rows: rows, catalogue: { LCS2: ['GLSI', 'SD'] } });
  var lcs2 = g.resolve('LCS2');
  assert.strictEqual(lcs2.status, 'ambiguous');
  assert.deepStrictEqual(candidateKeys(lcs2).sort(), ['GLSI1', 'SD3']);

  // SD3 has no rows yet but is known to the catalogue, so it resolves.
  var sd3 = g.resolve('SD3');
  assert.strictEqual(sd3.status, 'ok');
  assert.strictEqual(sd3.node.key, 'SD3');
});

test('short names use the program semester, not the track year', function () {
  // Track-qualified input parses the track year then maps to the semester.
  assert.strictEqual(grouping.leafFor('LCS2-GLSI_A Groupe 1').key, 'GLSI1A1');
  assert.strictEqual(grouping.resolveOne('LCS2A1').key, 'GLSI1A1');
  // Bare digit input already names the semester and validates against it.
  assert.strictEqual(grouping.resolve('GLSI1').status, 'ok');
  assert.strictEqual(grouping.resolveOne('GLSI1').key, 'GLSI1');
  assert.strictEqual(grouping.resolveOne('EB1').key, 'EB1');
  assert.strictEqual(grouping.resolve('GLSI2').status, 'invalid');
  assert.strictEqual(grouping.resolve('GLSI2').reason, 'UNKNOWN_YEAR');
  var amb = grouping.resolve('GLSI');
  assert.strictEqual(amb.status, 'ambiguous');
  assert.deepStrictEqual(candidateKeys(amb).sort(), ['GLSI1', 'GLSI3']);
  // No semester-2/4 GLSI keys exist anywhere in the catalogue.
  Object.keys(grouping.byKey).forEach(function (k) {
    assert.ok(/GLSI[24]/.test(k) === false, 'no GLSI2/GLSI4 key: ' + k);
  });
});

test('builder failures are typed GroupsErrors', function () {
  function thrownCode(fn) { try { fn(); } catch (e) { return e.code; } return null; }

  assert.strictEqual(thrownCode(function () { Groups.build({ fields: [] }); }), 'EMPTY');
  assert.strictEqual(thrownCode(function () {
    Groups.build({ fields: ['LBC1-A'], catalogue: { ZZZ: ['X'] } });
  }), 'MALFORMED');
  assert.doesNotThrow(function () { Groups.build({ fields: ['LBC1-A'] }); });
});

test('canonical full and compact formatting', function () {
  assert.strictEqual(
    Groups.formatFull({ track: 'LCS', year: 2, specialization: 'GLSI', section: 'A', cohort: '1' }),
    'LCS2-GLSI_A Groupe 1');
  assert.strictEqual(
    Groups.formatFull({ track: 'LBC', year: 1, specialization: 'LBC', commonBranch: true, section: 'A', cohort: '1' }),
    'LBC1-A Groupe 1');
  assert.strictEqual(
    Groups.formatFull({ track: 'LBC', year: 3, specialization: 'EB', section: 'A' }),
    'LBC3-EB_A');
  assert.strictEqual(Groups.formatFull({ track: 'MP', year: 1, specialization: 'SD' }), 'MP1-SD');

  assert.strictEqual(
    Groups.formatCompact({ track: 'LBC', year: 3, specialization: 'EB', section: 'A', cohort: null }),
    'EB1A');
  assert.strictEqual(
    Groups.formatCompact({ track: 'LCS', year: 2, specialization: 'GLSI', section: 'A', cohort: '1' }),
    'GLSI1A1');
});

test('the library has no time, DOM, Node or network dependencies', function () {
  var src = fs.readFileSync(SOURCE_PATH, 'utf8');
  ['require(', 'process.', 'document.', 'window.', 'new Date', 'Date.now', 'XMLHttpRequest', 'fetch('].forEach(function (needle) {
    assert.strictEqual(src.indexOf(needle), -1, 'source contains ' + needle);
  });
});

test('the library does not read the clock', function () {
  var RealDate = Date;
  var broken = function () { throw new Error('Date used'); };
  broken.now = function () { throw new Error('Date.now used'); };
  global.Date = broken;
  try {
    var g = Groups.fromRows(rows);
    assert.strictEqual(g.resolveOne('GLSI3D1').key, 'GLSI3D1');
  } finally {
    global.Date = RealDate;
  }
});

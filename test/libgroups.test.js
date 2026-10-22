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
   'shortcutOf',
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

// ---- shortcut heading form (issue 075) --------------------------------------
//
// `shortcutOf(fullName)` is the pure mapping behind the classes detail
// heading: it splits a full field name into the plain head and the cohort
// (rendered by the page as a real <sub> — `LCS3-GLSI_D Groupe 2` displays as
// `GLSI3 D<sub>2</sub>`). Table over the documented shapes, a sweep over
// every distinct field actually in emplois.csv, then the null fallbacks.

test('shortcutOf maps the documented shapes (issue 075)', function () {
  var table = [
    // [field, head, sub] — the first row is the reporter's exact example
    ['LCS3-GLSI_D Groupe 2', 'GLSI3 D', '2'],
    ['LCS3-GLSI_D Groupe 1', 'GLSI3 D', '1'],
    ['LBC1-H Groupe 2', 'H1', '2'],            // single-letter section, no _X
    ['LCS1-A Groupe 1', 'A1', '1'],            // common branch, same rule
    ['LBC2-BI_A Groupe 1', 'BI2 A', '1'],
    ['LCE2-IoT_A Groupe 1', 'IoT2 A', '1'],    // canonical case kept verbatim
    ['LCE3-IRS_B Groupe 2', 'IRS3 B', '2'],
    ['LBC3-EB_A', 'EB3 A', ''],                // no "Groupe": no subscript
    ['MP2-SD_A', 'SD2 A', ''],
    ['MP1-EXR', 'EXR1', ''],
    ['MP1-SD', 'SD1', ''],
    ['MP2-EXR', 'EXR2', ''],
    ['MP2-SD', 'SD2', '']                      // brief's shape, absent from this CSV
  ];
  table.forEach(function (row) {
    assert.deepStrictEqual(Groups.shortcutOf(row[0]), { head: row[1], sub: row[2] },
      'shortcut of ' + row[0]);
  });
  // the plain text the reporter asked for, sub digits included
  var ex = Groups.shortcutOf('LCS3-GLSI_D Groupe 2');
  assert.strictEqual(ex.head + ex.sub, 'GLSI3 D2');
});

test('shortcutOf maps every distinct field in the real CSV (issue 075)', function () {
  var distinct = {};
  rows.forEach(function (r) { distinct[r.field] = true; });
  var fields = Object.keys(distinct);
  assert.strictEqual(fields.length, 94);
  var fams = {};
  fields.forEach(function (f) {
    var leaf = grouping.leafFor(f);
    assert.ok(leaf, 'no leaf for ' + f);
    var sc = Groups.shortcutOf(f);
    assert.ok(sc, 'shortcutOf must map the real field ' + f);
    // the subscript is exactly the real cohort — nothing else can ever land
    // under the <sub>; cohort-less fields carry no subscript
    assert.strictEqual(sc.sub, leaf.cohort || '', f + ': subscript is the real cohort');
    // the head is the identity of the same leaf: section + year for a common
    // branch, specialization + year [+ " " + section] otherwise
    var want = leaf.commonBranch
      ? leaf.section + leaf.year
      : leaf.specialization + leaf.year + (leaf.section ? ' ' + leaf.section : '');
    assert.strictEqual(sc.head, want, f + ': head is the leaf identity');
    // plain text by construction (alnum + the one section space), so the
    // page's escaping before <sub> is belt-and-braces — never load-bearing
    assert.ok(/^[A-Za-z0-9]+(?: [A-Za-z0-9]+)?$/.test(sc.head), f + ': plain head ' + sc.head);
    assert.ok(!sc.sub || /^\d+$/.test(sc.sub), f + ': digit subscript ' + sc.sub);
    var fam = (leaf.commonBranch ? 'common' : 'spec') +
      (leaf.section ? '+section' : '') + (leaf.cohort ? '+cohort' : '');
    fams[fam] = (fams[fam] || 0) + 1;
  });
  // every documented family is really present in the data
  assert.deepStrictEqual(fams, {
    'common+section+cohort': 38,
    'spec': 3,
    'spec+section': 3,
    'spec+section+cohort': 50
  });
});

test('shortcutOf returns null for anything it does not recognize (issue 075)', function () {
  [
    null, undefined, '',
    'LCS1', 'LCS', 'GLSI',       // interior node names (unions keep their name)
    'GLSI3D1',                    // compact key, not a full name
    'LCS3-GLSI_D Groupe',         // malformed cohort wording
    'LCS3-GLSI_D Groupe X',       // non-digit cohort
    'LCS3_GLSI_D Groupe 2',       // no year/track separator
    'LBC1-A Groupe 1 ', ' LCS1-A Groupe 1',  // strict: whitespace is not trimmed
    'X9-YY_Z Groupe 1',           // unknown track
    'no track at all', 'LCS3-GLSI_D Groupe <b>2</b>'
  ].forEach(function (name) {
    assert.strictEqual(Groups.shortcutOf(name), null,
      'must fall back to the full name for ' + JSON.stringify(name));
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

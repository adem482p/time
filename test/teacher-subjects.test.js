// Tests for case/whitespace-insensitive subject counting on the teachers
// page (issue 053) — run with `node --test test/`.
//
// Teacher.subjectCounts is keyed by normStr(subject) (the module's own
// header contract), so a teacher's "Subjects (ranked by hours)" rows and
// topSubject merge case/whitespace variants of the same subject; the
// merged row's label is the byte-smallest spelling that teacher is
// scheduled under. Values below are executed against the real
// emplois.csv through the same vm stack as test/classes.test.js.

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

// deepStrictEqual compares prototypes, and values that come out of the vm loader
// belong to the vm's own Array — convert them to this context before comparing
// against array literals (two vm-context arrays compare fine as-is).
function main(arr) { return Array.prototype.slice.call(arr); }

// ---- issue 053: merged subject rows ---------------------------------------

test('subject rows merge case/whitespace variants (issue 053: Bannour)', function () {
  var t = modelObjs.teachers['Bannour'];
  // the two IoT spellings (F/f) collapse into one 16/24 bucket
  assert.deepStrictEqual(main(t.subjects.map(function (s) { return [s.name, s.sessions]; })),
    [['IoT:Appli et Plates Formes', 16], ['Atelier Python', 6],
     ['Réseaux multimédia', 2]]);
  assert.strictEqual((t.subjects[0].share * 100).toFixed(1), '66.7');
  assert.strictEqual(t.topSubject.name, 'IoT:Appli et Plates Formes');
});

test('merged counts pick the true top subject (issue 053: Ghanmi)', function () {
  var t = modelObjs.teachers['Ghanmi'];
  // merged Systèmes Logiques family (16/28) beats Electricité - Electronique (12)
  assert.deepStrictEqual(main(t.subjects.map(function (s) { return [s.name, s.sessions]; })),
    [['Systèmes Logiques', 16], ['Electricité - Electronique', 12]]);
  assert.strictEqual((t.subjects[0].share * 100).toFixed(1) + '%', '57.1%');
  assert.strictEqual(t.topSubject.name, 'Systèmes Logiques');
});

test('merged counts pick the true top subject (issue 053: Maaloul)', function () {
  var t = modelObjs.teachers['Maaloul'];
  // merged Services des Réseaux (16/26) beats Technologies Web 1 (10)
  assert.deepStrictEqual(main(t.subjects.map(function (s) { return [s.name, s.sessions]; })),
    [['Services des Réseaux', 16], ['Technologies Web 1', 10]]);
  assert.strictEqual((t.subjects[0].share * 100).toFixed(1) + '%', '61.5%');
  assert.strictEqual(t.topSubject.name, 'Services des Réseaux');
});

test('the remaining split teachers merge without flipping their top (issue 053)', function () {
  var a = modelObjs.teachers['Abdelhafidh'];
  assert.deepStrictEqual(main(a.subjects.map(function (s) { return [s.name, s.sessions]; })),
    [['Programmation Java', 8], ['Programmation OO', 8],
     ['Frameworks Big DATA', 4], ['Sécurité IoT', 4]]);
  assert.strictEqual(a.subjects.length, 4);
  assert.strictEqual(a.topSubject.name, 'Programmation Java');

  var g = modelObjs.teachers['Ghannay'];
  assert.deepStrictEqual(main(g.subjects.map(function (s) { return [s.name, s.sessions]; })),
    [['Virtualisation et conteneur', 4], ['Adm. serv. rés. sous Win', 2],
     ['Admin Avancée serv d\'entrep', 2], ['Virtualisation Avancée', 2]]);
  assert.strictEqual(g.subjects.length, 4);
  assert.strictEqual(g.topSubject.name, 'Virtualisation et conteneur');

  var h = modelObjs.teachers['Hamdani'];
  assert.deepStrictEqual(main(h.subjects.map(function (s) { return [s.name, s.sessions]; })),
    [['Fouille de données Massives', 4], ['Machine Learning 2', 2]]);
  assert.strictEqual(h.subjects.length, 2);
  assert.strictEqual(h.topSubject.name, 'Fouille de données Massives');
});

test('every teacher has one row per normalized subject with shares summing to 1 (issue 053)', function () {
  var totalRows = 0;
  Object.keys(modelObjs.teachers).forEach(function (name) {
    var t = modelObjs.teachers[name];
    // (a) subjectCounts is keyed by normalized keys (never display spellings)
    Object.keys(t.subjectCounts).forEach(function (k) {
      assert.strictEqual(k, model.normStr(k), name + ': non-normalized key ' + k);
    });
    // (b) one row per normalized subject, (c) each label is a real spelling
    var seen = {};
    t.subjects.forEach(function (s) {
      var nk = model.normStr(s.name);
      assert.ok(!seen[nk], name + ': duplicate subject row ' + s.name);
      seen[nk] = true;
      assert.ok(t.sessions.some(function (ss) { return ss.subject === s.name; }),
        name + ': label not among own sessions: ' + s.name);
    });
    // (d) merged buckets partition the teacher's sessions
    if (t.totalSessions) {
      var sum = t.subjects.reduce(function (acc, s) { return acc + s.share; }, 0);
      assert.ok(Math.abs(sum - 1) <= 1e-9, name + ': shares sum to ' + sum);
    }
    // (e) the "Mostly teaches" subject is the first ranked row
    assert.strictEqual(t.topSubject, t.subjects[0]);
    totalRows += t.subjects.length;
  });
  // (f) corpus pins on the current emplois.csv
  assert.strictEqual(store.teachers.length, 132);
  assert.strictEqual(totalRows, 266);
});

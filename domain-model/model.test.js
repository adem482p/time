// domain-model/model.test.js — Tests for the new Semester model.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Type, makeYear, makeSpecialty, makeSemester, makeClass, makeClasses, makeSession,
  classKind, trackOf, yearOf, specialtyOf, isClass, isSemester
} from './objects.js';
import { makeCatalog } from './catalog.js';
import {
  resolve, ancestors, descendants, children, parentOf, commonAncestors, shareAncestor,
  semestersOf, classes, sessionsFor, isPublished, weeksOverlap
} from './query.js';
import { parsePublicationField, catalogFromCsv, parseCsvRows } from './csv.js';
import { formatYear, formatSemester, formatClass, formatSession, printTree } from './print.js';
import { links } from './query.js';
import { catalogue } from './catalogue.js';

test('constructors derive labels and semester positions', () => {
  const lcs = makeYear('LCS', 3);
  assert.equal(lcs.label, 'LCS3');
  const glsi = makeSpecialty('GLSI', 'LCS', { startsYear: 2, durationSemesters: 3 });
  const y2 = makeYear('LCS', 2);
  const s1 = makeSemester(glsi, 1, y2);
  const s2 = makeSemester(glsi, 2, y2);
  const s3 = makeSemester(glsi, 3, lcs);
  assert.equal(s1.label, 'GLSI1'); assert.equal(s1.withinYear, 1);
  assert.equal(s2.label, 'GLSI2'); assert.equal(s2.withinYear, 2);
  assert.equal(s3.label, 'GLSI3'); assert.equal(s3.withinYear, 1);
  assert.equal(s3.year, lcs);
  assert.equal(trackOf(s3), 'LCS');
  assert.equal(yearOf(s3), lcs);
  assert.equal(specialtyOf(s3), glsi);
});

test('constructor invariants throw (programmer errors)', () => {
  const glsi = makeSpecialty('GLSI', 'LCS', { startsYear: 2, durationSemesters: 3 });
  assert.throws(() => makeSemester(glsi, 4, makeYear('LCS', 3)), /outside/);
  assert.throws(() => makeSemester(glsi, 2, makeYear('LCS', 3)), /in LCS2/);
  assert.throws(() => makeSemester(glsi, 2, makeYear('LBC', 2)), /in LCS2/);
  const s = makeSemester(glsi, 1, makeYear('LCS', 2));
  assert.throws(() => makeClass(s, null, 1), /cohort requires a group/);
  assert.throws(() => makeSession({ population: makeClass(s, 'A'), subject: 'M', day: 'FUNDAY', slot: '10h00-11h30', source: 'p' }), /Invalid day/);
  assert.throws(() => makeSession({ population: makeClass(s, 'A'), subject: 'M', day: 'LUNDI', slot: '10h00-11h30', weekPattern: 'S1', source: 'p' }), /semester label/);
  assert.throws(() => makeSession({ population: makeClass(s, 'A'), subject: 'M', day: 'LUNDI', slot: '10h00-11h30', kind: 'lab', source: 'p' }), /lab addresses a cohort/);
});

test('catalogue composition: counts and published vs declared', () => {
  assert.equal(catalogue.years.length, 11);
  assert.equal(catalogue.specialties.length, 7);
  assert.equal(catalogue.semesters.length, 23);
  assert.equal(catalogue.classes.length, 210);
  // GLSI2 exists in the catalog …
  assert.equal(resolve(catalogue, 'GLSI2').type, 'found');
  // … but has no sessions: it is the Y2·S2 semester, not in the S1 publication.
  assert.equal(isPublished(catalogue, resolve(catalogue, 'GLSI2').object), false);
  assert.equal(isPublished(catalogue, resolve(catalogue, 'GLSI3').object), false); // no sessions loaded yet
});

test('singleton only for group-less semesters', () => {
  const exr1 = resolve(catalogue, 'EXR1', { as: 'semester' }).object;
  const cls = catalogue.classes.filter((c) => c.semester === exr1);
  assert.equal(cls.length, 1);
  assert.equal(cls[0].group, null);
  assert.equal(classKind(cls[0]), 'singleton');
  const glsi3 = resolve(catalogue, 'GLSI3', { as: 'semester' }).object;
  const glsiClasses = catalogue.classes.filter((c) => c.semester === glsi3);
  assert.equal(glsiClasses.length, 12); // 4 groups × (group + 2 cohorts)
  assert.ok(!glsiClasses.some((c) => c.group == null), 'no singleton under a grouped semester');
  assert.equal(resolve(catalogue, 'GLSI3').type, 'found');
  assert.equal(resolve(catalogue, 'GLSI3').object.type, Type.SEMESTER);
});

test('resolution model: found / ambiguous / wrongKind / notFound / invalid', () => {
  assert.equal(resolve(catalogue, 'EXR1').type, 'ambiguous');
  assert.deepEqual(resolve(catalogue, 'EXR1').matches.map((m) => m.type), [Type.SEMESTER, Type.CLASS]);
  assert.equal(resolve(catalogue, 'EXR1', { as: 'class' }).object.label, 'EXR1');
  assert.equal(resolve(catalogue, 'EXR1', { as: 'year' }).type, 'wrongKind');
  assert.equal(resolve(catalogue, 'ZZZ9').type, 'notFound');
  assert.equal(resolve(catalogue, 'bad!').type, 'invalid');
  assert.equal(resolve(catalogue, '').type, 'invalid');
  // case-insensitive, canonical label preserved:
  const iot = resolve(catalogue, 'iot3 a1', { as: 'class' });
  assert.equal(iot.type, 'found');
  assert.equal(iot.object.label, 'IoT3 A1');
});

test('reflective API: sharing, ancestry, cohorts', () => {
  const a = resolve(catalogue, 'GLSI3 A1', { as: 'class' }).object;
  const b = resolve(catalogue, 'GLSI3 B2', { as: 'class' }).object;
  const c = resolve(catalogue, 'IoT3 A1', { as: 'class' }).object;
  assert.equal(a.semester.specialty, b.semester.specialty); // shared reference
  assert.equal(shareAncestor(a, b, 'specialty'), true);
  assert.equal(shareAncestor(a, c, 'specialty'), false);
  assert.ok(commonAncestors(a, b).includes(a.semester.specialty));
  assert.deepEqual(ancestors(a).map((x) => (typeof x === 'string' ? x : x.label)), ['GLSI3', 'LCS3', 'GLSI', 'LCS']);
  assert.equal(parentOf(a), a.semester);
  assert.deepEqual(children(catalogue, a.semester).length, 12);
  const glsi = resolve(catalogue, 'GLSI', { as: 'specialty' }).object;
  assert.deepEqual(semestersOf(catalogue, glsi).map((s) => s.label), ['GLSI1', 'GLSI2', 'GLSI3']);
  assert.ok(descendants(catalogue, glsi).filter(isClass).length > 0);
  // cohorts of a group class, by predicate over shared references:
  const group = resolve(catalogue, 'GLSI3 A', { as: 'class' }).object;
  const cohorts = classes(catalogue, (x) => x.semester === group.semester && x.group === group.group && x.cohort !== null);
  assert.deepEqual(cohorts.map((x) => x.label), ['GLSI3 A1', 'GLSI3 A2']);
});

test('publication field parsing: all observed shapes', () => {
  const pop = (f) => {
    const r = parsePublicationField(f, catalogue);
    assert.equal(r.ok, true, `${f}: ${r.errors}`);
    return r.population;
  };
  assert.equal(pop('LBC2-BI_A Groupe 1').label, 'BI1 A1');
  assert.equal(pop('LBC1-A Groupe 2').label, 'LBC1 A2');
  assert.equal(pop('LBC3-EB_A').label, 'EB1 A');
  assert.equal(pop('MP1-EXR').label, 'EXR1');
  assert.equal(isClass(pop('MP1-EXR')), true);
  assert.equal(pop('MP1-SD').label, 'SD1');
  assert.equal(pop('MP2-SD_A').label, 'SD3 A');
  assert.equal(pop('LCS3-GLSI_B Groupe 2').label, 'GLSI3 B2');
  assert.equal(pop('GLSI3 A1').label, 'GLSI3 A1'); // canonical passthrough
  assert.equal(parsePublicationField('ZZZ1-A', catalogue).ok, false);
});

test('CSV conversion: missing teacher is null, S1 rejected, counts are exact', () => {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const text = fs.readFileSync(path.join(root, 'time.csv'), 'utf8');
  const rows = parseCsvRows(text);
  assert.equal(rows.length, 2093);
  const out = catalogFromCsv({ rows, catalog: catalogue });
  assert.equal(out.sessions.length, 2093);
  assert.equal(out.rejected.length, 0);
  const noTeacher = out.sessions.filter((s) => s.teacher === null);
  assert.equal(noTeacher.length, 4);
  assert.equal(new Set(out.sessions.map((s) => s.population.label)).size, 94);
  assert.equal(isPublished(out.catalog, resolve(out.catalog, 'GLSI3', { as: 'semester' }).object), true);
  assert.equal(isPublished(out.catalog, resolve(out.catalog, 'GLSI2', { as: 'semester' }).object), false);
  // S1 is not a week pattern:
  const bad = catalogFromCsv({
    rows: [{ field: 'LCS1-A Groupe 1', professor: 'T', subject: 'M', room: 'A1', day: 'Lundi', time: '08h15-09h45', week: 'S1', source: 'p1', color: '' }],
    catalog: catalogue
  });
  assert.equal(bad.rejected.length, 1);
  assert.match(bad.rejected[0].errors[0], /semester label/);
});

test('makeCatalog rejects duplicate labels within a kind', () => {
  const a = makeYear('LCS', 1);
  const b = makeYear('LCS', 1);
  assert.throws(() => makeCatalog({ years: [a, b] }), /Duplicate year label: LCS1/);
  // … but a Semester and a singleton Class may share a label:
  const glsi = makeSpecialty('GLSI', 'LCS', { startsYear: 2, durationSemesters: 1 });
  const sem = makeSemester(glsi, 1, makeYear('LCS', 2));
  const cat = makeCatalog({ years: [makeYear('LCS', 2)], specialties: [glsi], semesters: [sem], classes: [makeClass(sem)] });
  assert.equal(resolve(cat, 'GLSI1').type, 'ambiguous');
});

test('makeClasses expands group/cohort/singleton shapes', () => {
  const glsi = makeSpecialty('GLSI', 'LCS', { startsYear: 2, durationSemesters: 1 });
  const sem = makeSemester(glsi, 1, makeYear('LCS', 2));
  assert.deepEqual(makeClasses(sem, []).map((c) => c.label), ['GLSI1']);
  assert.deepEqual(makeClasses(sem, [{ group: 'A', cohorts: 0 }]).map((c) => c.label), ['GLSI1 A']);
  assert.deepEqual(
    makeClasses(sem, [{ group: 'A', cohorts: 2 }]).map((c) => c.label),
    ['GLSI1 A', 'GLSI1 A1', 'GLSI1 A2']
  );
  assert.throws(() => makeClasses(sem, [{ group: 'A', cohorts: 3 }]), /cohorts must be 0 or 2/);
});

test('graph walks: children/descendants of Year and Specialty, links', () => {
  const lcs1 = resolve(catalogue, 'LCS1', { as: 'year' }).object;
  const trunkClasses = children(catalogue, lcs1);
  assert.ok(trunkClasses.length > 0 && trunkClasses.every(isClass));
  assert.ok(trunkClasses.every((c) => c.semester === lcs1));
  const glsi = resolve(catalogue, 'GLSI', { as: 'specialty' }).object;
  assert.deepEqual(children(catalogue, glsi).map((s) => s.label), ['GLSI1', 'GLSI2', 'GLSI3']);
  const sem = resolve(catalogue, 'GLSI3', { as: 'semester' }).object;
  assert.deepEqual(links(sem).map((o) => o.label), ['LCS3', 'GLSI']);
  const cls = resolve(catalogue, 'GLSI3 A1', { as: 'class' }).object;
  assert.deepEqual(links(cls), [sem]);
  assert.deepEqual(descendants(catalogue, sem).filter(isClass).length, 12);
});

test('semester filtering by withinYear models the S1 publication', () => {
  const glsi = resolve(catalogue, 'GLSI', { as: 'specialty' }).object;
  assert.deepEqual(
    semestersOf(catalogue, glsi).filter((s) => s.withinYear === 1).map((s) => s.label),
    ['GLSI1', 'GLSI3']
  );
});

test('CSV reader rejects unknown notations with reasons', () => {
  const out = catalogFromCsv({
    rows: [{ field: 'ZZZ1-A', professor: 'T', subject: 'M', room: 'A1', day: 'Lundi', time: '08h15-09h45', week: '', source: 'p1', color: '' }],
    catalog: catalogue
  });
  assert.equal(out.sessions.length, 0);
  assert.equal(out.rejected.length, 1);
  assert.ok(out.rejected[0].errors.length > 0);
});

test('printing formats every entity', () => {
  const y = resolve(catalogue, 'LCS3', { as: 'year' }).object;
  const s = resolve(catalogue, 'GLSI3', { as: 'semester' }).object;
  const c = resolve(catalogue, 'GLSI3 A1', { as: 'class' }).object;
  assert.equal(formatYear(y), 'LCS3');
  assert.equal(formatSemester(s), 'GLSI3');
  assert.equal(formatClass(c), 'GLSI3 A1');
  const tree = printTree(catalogue, 'LCS');
  assert.ok(tree.startsWith('LCS'));
  assert.ok(tree.includes('GLSI3 A1'));
  assert.ok(tree.includes('LCS1 A1'));
});

test('printing is null-safe', () => {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const out = catalogFromCsv({ text: fs.readFileSync(path.join(root, 'time.csv'), 'utf8'), catalog: catalogue });
  const s = out.sessions.find((x) => x.teacher === null);
  assert.ok(formatSession(s).includes('—'));
  assert.ok(printTree(out.catalog, 'LCS').includes('GLSI3'));
  assert.equal(weeksOverlap('A', 'B'), false);
  assert.equal(weeksOverlap('every', 'B'), true);
});

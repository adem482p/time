import assert from 'node:assert/strict';
import test from 'node:test';
import {
  Catalogue, academicSemester, branch, classPopulation, fromCsvRecord, parseReference,
  populationReference, programmeSemesterFor, queryBranches, queryClasses, queryRecords,
  sessionKind, sessionSpecifier, weekPattern
} from '../domain-model/index.js';

test('parses common, non-common, verbose and compact references', () => {
  assert.equal(parseReference('LCS1').branch.kind, 'common');
  assert.equal(parseReference('GLSI3').branch.kind, 'non-common');
  assert.equal(parseReference('LCS3 GLSI3').branch.identifier, 'GLSI3');
  assert.equal(parseReference('LCS3 GLSI3 A2').class.identifier, 'GLSI3 A2');
  assert.equal(parseReference('LCS1 A2').specific, true);
  assert.equal(parseReference('GLSI3 A').broad, true);
  assert.equal(parseReference('GLSI3A2').class.identifier, 'GLSI3 A2');
  assert.equal(parseReference('MP1-EXR').branch.identifier, 'MP1-EXR');
});

test('supports configurable common tracks without treating unknown codes as tracks', () => {
  assert.equal(parseReference('BIO1', { commonTracks: ['BIO'] }).branch.kind, 'common');
  assert.equal(parseReference('BIO1').branch.kind, 'non-common');
  assert.equal(parseReference('ZZZ1').branch.kind, 'non-common');
  const catalogue = new Catalogue({ commonTracks: ['BIO'], branches: ['BIO1'] });
  const resolved = catalogue.resolve('BIO1');
  assert.equal(resolved.catalogue.result, 'branch');
  assert.equal(resolved.syntax.branch.kind, 'common');
  assert.equal(resolved.syntax.branch.identifier, 'BIO1');
});

test('rejects malformed references and preserves singleton ambiguity', () => {
  assert.equal(parseReference('').valid, false);
  assert.equal(parseReference('LCS1 A B').valid, false);
  const parsed = parseReference('MP1-EXR');
  assert.equal(parsed.valid, true);
  assert.equal(parsed.singletonClass.identifier, 'MP1-EXR');
});

test('catalogue resolution separates syntax, catalogue and publication results', () => {
  const b = branch({ identifier: 'LCS1' });
  const catalogue = new Catalogue({
    branches: [b, branch({ identifier: 'GLSI3' })],
    classes: [classPopulation(b, 'A'), classPopulation(b, 'A', 1)],
    records: [fromCsvRecord({ field: 'LCS1-A Groupe 1', subject: 'Math', source: 'p1' })]
  });
  const found = catalogue.resolve('LCS1 A1');
  assert.equal(found.syntax.valid, true);
  assert.equal(found.catalogue.matches.length, 1);
  assert.equal(found.publication.present, true);
  assert.equal(catalogue.resolve('LCS9').catalogue.absent, true);
  assert.equal(catalogue.resolve('bad!').syntax.valid, false);
});

test('catalogue accepts singleton strings and exposes branch/class ambiguity', () => {
  const catalogue = new Catalogue({
    branches: ['MP1-EXR'],
    classes: ['MP1-EXR'],
    records: [fromCsvRecord({ field: 'MP1-EXR', subject: 'Project' })]
  });
  assert.equal(catalogue.classes.length, 1);
  const result = catalogue.resolve('MP1-EXR');
  assert.equal(result.catalogue.result, 'branch-and-singleton-class');
  assert.equal(result.catalogue.branchMatches.length, 1);
  assert.equal(result.catalogue.classMatches.length, 1);
  assert.equal(result.catalogue.ambiguous, true);
  assert.equal(result.publication.present, true);
});

test('catalogue reports branch, class, invalid, absent and publication states', () => {
  const catalogue = new Catalogue({
    branches: ['LCS1'],
    classes: ['LCS1 A2'],
    records: [fromCsvRecord({ field: 'LCS1-A Groupe 2' })]
  });
  assert.equal(catalogue.resolve('LCS1').catalogue.result, 'branch');
  assert.equal(catalogue.resolve('LCS1 A2').catalogue.result, 'class');
  assert.equal(catalogue.resolve('LCS1 A2').publication.present, true);
  assert.equal(catalogue.resolve('LCS9').catalogue.absent, true);
  assert.equal(catalogue.resolve('LCS1 A B').catalogue.result, 'invalid');
  assert.equal(catalogue.resolve('LCS1 A2').catalogue.classMatches.length, 1);
});

test('programme semester depends on current half', () => {
  assert.equal(programmeSemesterFor(2, 1, academicSemester(1)), 3);
  assert.equal(programmeSemesterFor(2, 1, 2), 4);
});

test('session scope invariants and week patterns', () => {
  assert.equal(sessionKind('lecture', 'branch').scope, 'branch');
  assert.deepEqual(sessionKind('branch', 'lecture'), sessionKind('lecture', 'branch'));
  assert.deepEqual(sessionKind('seminar', 'section'), sessionKind('section', 'seminar'));
  assert.deepEqual(sessionKind('lab', 'cohort'), sessionKind('cohort', 'lab'));
  assert.throws(() => sessionKind('lab', 'section'));
  assert.equal(weekPattern('').name, 'every');
  assert.equal(weekPattern('SA').name, 'A');
  assert.throws(() => weekPattern('S1'));
  const session = sessionSpecifier({ subject: 'Math', population: 'LCS1', kind: 'lecture', scope: 'branch' });
  assert.equal(session.week.code, '');
  assert.equal(sessionSpecifier({ kind: 'lecture', population: 'LCS1' }).scope, 'branch');
  assert.equal(sessionSpecifier({ scope: 'branch', population: 'LCS1' }).kind, 'lecture');
  assert.throws(() => populationReference('LCS1 A', 'branch'));
  assert.equal(populationReference('LCS1', 'branch').scope, 'branch');
  assert.equal(populationReference('LCS1 A', 'section').scope, 'section');
  assert.equal(populationReference('LCS1 A2', 'cohort').scope, 'cohort');
  assert.throws(() => populationReference('LCS1', 'section'));
  assert.throws(() => populationReference('LCS1 A', 'cohort'));
});

test('converts partial CSV records without inventing scope', () => {
  const record = fromCsvRecord({
    professor: 'Teacher', day: 'LUNDI', time: '08h15-09h45', room: 'A1',
    subject: 'Math', field: 'GLSI3-A Groupe 2', week: 'SB', source: 'page 2', color: '#fff000'
  });
  assert.equal(record.population.parsed.class.identifier, 'GLSI3 A2');
  assert.deepEqual(record.missing, ['kind', 'scope']);
  assert.equal(record.provenance.color, '#fff000');
});

test('query utilities filter domain collections and records', () => {
  const b = branch({ identifier: 'LCS1' });
  const c = new Catalogue({ branches: [b], classes: [classPopulation(b, 'A')] });
  assert.equal(queryBranches(c, (x) => x.identifier === 'LCS1').length, 1);
  assert.equal(queryClasses(c, (x) => x.level === 'section').length, 1);
  assert.equal(queryRecords([{ day: 'LUNDI' }, { day: 'MARDI' }], { day: 'LUNDI' }).length, 1);
});

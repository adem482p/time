import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Catalogue,
  Type,
  cohortSpecifier,
  DAYS,
  SESSION_KIND_SCOPES,
  SLOTS,
  branchSemesterFor,
  branchSemesterSpecifier,
  branch,
  classPopulation,
  fromCsvRecord,
  parseReference,
  populationReference,
  queryBranches,
  queryClasses,
  queryRecords,
  sessionKind,
  sessionSpecifier,
  sectionSpecifier,
  singletonBranch,
  specializationSpecifier,
  track,
  trackSpecifier,
  weekPatternSpecifier,
  yearSemesterSpecifier,
  yearSpecifier
} from './index.js';

test('exports unique symbol discriminators as an enum-like type table', () => {
  assert.equal(typeof Type.INVALID_REFERENCE, 'symbol');
  assert.notEqual(Type.INVALID_REFERENCE, Type.BRANCH_REFERENCE);
  assert.equal(Object.isFrozen(Type), true);
  assert.equal(parseReference('  ').type, Type.INVALID_REFERENCE);
});

test('creates explicit track and branch variants without nullable hierarchy fields', () => {
  assert.deepEqual(trackSpecifier('lcs'), { type: Type.TRACK_SPECIFIER, value: 'LCS' });
  assert.deepEqual(yearSpecifier('2'), { type: Type.YEAR_SPECIFIER, value: 2 });
  assert.deepEqual(specializationSpecifier('GLSI'), { type: Type.SPECIALIZATION_SPECIFIER, value: 'GLSI' });
  assert.deepEqual(branchSemesterSpecifier(3), { type: Type.BRANCH_SEMESTER_SPECIFIER, value: 3 });
  assert.deepEqual(yearSemesterSpecifier(1), { type: Type.YEAR_SEMESTER_SPECIFIER, value: 1 });
  assert.deepEqual(sectionSpecifier('A'), { type: Type.SECTION_SPECIFIER, value: 'A' });
  assert.deepEqual(cohortSpecifier(2), { type: Type.COHORT_SPECIFIER, value: 2 });
  const concreteTrack = track({
    track_specifier: trackSpecifier('lcs'),
    year_specifier: yearSpecifier(2)
  });
  assert.deepEqual(concreteTrack, {
    type: Type.TRACK,
    track_specifier: { type: Type.TRACK_SPECIFIER, value: 'LCS' },
    year_specifier: { type: Type.YEAR_SPECIFIER, value: 2 },
    identifier: 'LCS2'
  });
  const common = singletonBranch(track({
    track_specifier: trackSpecifier('lcs'),
    year_specifier: yearSpecifier(1)
  }));
  const specialization = branch({
    specialization_specifier: specializationSpecifier('GLSI'),
    branch_semester_specifier: branchSemesterSpecifier(3),
    track: concreteTrack
  });
  assert.deepEqual(common, {
    type: Type.COMMON_BRANCH,
    track: {
      type: Type.TRACK,
      track_specifier: { type: Type.TRACK_SPECIFIER, value: 'LCS' },
      year_specifier: { type: Type.YEAR_SPECIFIER, value: 1 },
      identifier: 'LCS1'
    },
    identifier: 'LCS1'
  });
  assert.equal(specialization.type, Type.SPECIALIZATION_BRANCH);
  assert.equal(specialization.track.identifier, 'LCS2');
  assert.equal(specialization.identifier, 'GLSI3');
  assert.throws(() => branch({
    track: concreteTrack
  }), /requires a specialization specifier/);
  assert.throws(() => branch({ track: 'LCS2' }), /requires a track object/);
  assert.throws(() => singletonBranch('LCS2'), /requires a track object/);
});

test('calculates branch semesters and validates boundaries', () => {
  assert.deepEqual(branchSemesterFor({
    year_specifier: 3,
    branch_start_year: 2,
    year_semester_specifier: yearSemesterSpecifier(1)
  }), branchSemesterSpecifier(3));
  assert.deepEqual(branchSemesterFor({
    year_specifier: 3,
    branch_start_year: 2,
    year_semester_specifier: yearSemesterSpecifier(2)
  }), branchSemesterSpecifier(4));
  assert.throws(() => branchSemesterFor({
    year_specifier: 1,
    branch_start_year: 2,
    year_semester_specifier: yearSemesterSpecifier(1)
  }), /must not precede/);
  assert.throws(() => branchSemesterFor({
    year_specifier: 2,
    branch_start_year: 2,
    year_semester_specifier: 3
  }), /must be 1 or 2/);
});

test('creates distinct singleton, section, and cohort classes', () => {
  const branchValue = singletonBranch(track({ track_specifier: 'LCS', year_specifier: 1 }));
  const singleton = classPopulation({ branch: branchValue });
  const section = classPopulation({ branch: branchValue, section_specifier: 'a' });
  const cohort = classPopulation({
    branch: branchValue,
    section_specifier: 'a',
    cohort_specifier: '2'
  });

  assert.equal(singleton.type, Type.SINGLETON_CLASS);
  assert.equal(singleton.identifier, 'LCS1');
  assert.equal(section.type, Type.SECTION_CLASS);
  assert.equal(section.identifier, 'LCS1 A');
  assert.equal(cohort.type, Type.COHORT_CLASS);
  assert.equal(cohort.identifier, 'LCS1 A2');
  assert.deepEqual(cohort.cohort_specifier, cohortSpecifier(2));
  assert.equal(Object.hasOwn(singleton, 'section_specifier'), false);
  assert.equal(Object.hasOwn(section, 'cohort_specifier'), false);
  assert.deepEqual(section.section_specifier, sectionSpecifier('A'));
  assert.throws(() => classPopulation({
    branch: branchValue,
    section_specifier: 'A',
    cohort_specifier: 'x'
  }), /Invalid cohort specifier/);
});

test('parses branch and class references as explicit result variants', () => {
  const branchReference = parseReference(' lcs3 glsi3 ');
  const sectionReference = parseReference('LCS1 A');
  const cohortReference = parseReference('lcs1a2');
  const verboseReference = parseReference('LCS3 GLSI3 A2');
  const invalidReference = parseReference('  ');

  assert.equal(branchReference.type, Type.BRANCH_REFERENCE);
  assert.equal(branchReference.branch.type, Type.SPECIALIZATION_BRANCH);
  assert.equal(sectionReference.type, Type.CLASS_REFERENCE);
  assert.equal(sectionReference.class.type, Type.SECTION_CLASS);
  assert.equal(cohortReference.class.type, Type.COHORT_CLASS);
  assert.equal(verboseReference.class.identifier, 'GLSI3 A2');
  assert.deepEqual(invalidReference, {
    type: Type.INVALID_REFERENCE,
    input: '  ',
    diagnostics: ['Reference is empty']
  });
  assert.equal(Object.hasOwn(sectionReference, 'branch'), false);
  assert.equal(Object.hasOwn(invalidReference, 'class'), false);
});

test('lets consumers choose the expected interpretation before parsing', () => {
  const trackReference = parseReference('LCS2', { expected: 'track' });
  const commonBranchReference = parseReference('LCS2', { expected: 'branch' });
  const sectionlessBranchReference = parseReference('MP1-EXR', { expected: 'branch' });
  const classReference = parseReference('MP1-EXR', { expected: 'class' });

  assert.equal(trackReference.type, Type.TRACK_REFERENCE);
  assert.equal(commonBranchReference.type, Type.BRANCH_REFERENCE);
  assert.equal(sectionlessBranchReference.type, Type.BRANCH_REFERENCE);
  assert.equal(classReference.type, Type.CLASS_REFERENCE);
  assert.equal(classReference.class.type, Type.SINGLETON_CLASS);
  assert.equal(parseReference('LCS1 A', { expected: 'branch' }).type, Type.INVALID_REFERENCE);
  assert.equal(parseReference('LCS1', { expected: 'class' }).class.type, Type.SINGLETON_CLASS);
  assert.throws(() => parseReference('LCS1', { expected: 'reference' }), /Invalid expected reference type/);
});

test('parses references to tracks, track specifiers, branches, classes, and specialization specifiers', () => {
  const trackReference = parseReference('LCS2');
  const trackSpecifierReference = parseReference('LCS');
  const branchReference = parseReference('LCS3 GLSI3');
  const classReference = parseReference('LCS2 A');
  const specializationSpecifierReference = parseReference('GLSI');
  const specializationBranchReference = parseReference('GLSI3');

  assert.equal(trackReference.type, Type.TRACK_REFERENCE);
  assert.equal(trackReference.track.identifier, 'LCS2');
  assert.equal(trackSpecifierReference.type, Type.TRACK_SPECIFIER_REFERENCE);
  assert.equal(trackSpecifierReference.track_specifier.value, 'LCS');
  assert.equal(branchReference.type, Type.BRANCH_REFERENCE);
  assert.equal(branchReference.branch.identifier, 'GLSI3');
  assert.equal(classReference.type, Type.CLASS_REFERENCE);
  assert.equal(classReference.class.identifier, 'LCS2 A');
  assert.equal(specializationSpecifierReference.type, Type.SPECIALIZATION_SPECIFIER_REFERENCE);
  assert.equal(specializationSpecifierReference.specialization_specifier.value, 'GLSI');
  assert.equal(specializationBranchReference.type, Type.BRANCH_REFERENCE);
  assert.equal(specializationBranchReference.branch.identifier, 'GLSI3');
});

test('parses custom common tracks without changing default semantics', () => {
  assert.equal(parseReference('ABC1').branch.type, Type.SECTIONLESS_BRANCH);
  assert.equal(parseReference('ABC1', { commonTracks: ['ABC'], expected: 'branch' }).branch.type, Type.COMMON_BRANCH);
  assert.equal(parseReference('ABC1', { commonTracks: ['ABC'], expected: 'branch' }).branch.track.identifier, 'ABC1');
});

test('rejects malformed references instead of returning nullable fields', () => {
  for (const input of ['', 'LCS?', 'LCS1 A2 B', 'LCS1 ???']) {
    const result = parseReference(input);
    assert.equal(result.type, Type.INVALID_REFERENCE, input);
    assert.ok(result.diagnostics.length > 0);
  }
});

test('creates scope-specific population references', () => {
  const branchPopulation = populationReference({ reference: 'LCS1', session_kind: 'branch-lecture' });
  const sectionPopulation = populationReference({ reference: 'LCS1 A', session_kind: 'section-seminar' });
  const cohortPopulation = populationReference({ reference: 'LCS1 A2', session_kind: 'cohort-lab-work' });

  assert.equal(branchPopulation.type, Type.BRANCH_POPULATION);
  assert.equal(sectionPopulation.type, Type.SECTION_POPULATION);
  assert.equal(cohortPopulation.type, Type.COHORT_POPULATION);
  assert.equal(sectionPopulation.class.type, Type.SECTION_CLASS);
  assert.equal(cohortPopulation.class.type, Type.COHORT_CLASS);
  assert.throws(() => populationReference({
    reference: 'LCS1 A',
    session_kind: 'branch-lecture'
  }), /Expected a branch reference/);
  assert.throws(() => populationReference({
    reference: 'LCS1',
    session_kind: 'section-seminar'
  }), /Section population/);
  assert.throws(() => populationReference({
    reference: 'LCS1 A',
    session_kind: 'cohort-lab-work'
  }), /Cohort population/);
  assert.equal(populationReference({ reference: 'LCS1' }).type, Type.BRANCH_POPULATION);
});

test('normalizes and validates session activities', () => {
  assert.equal(sessionKind('lecture'), 'branch-lecture');
  assert.equal(sessionKind('section-seminar'), 'section-seminar');
  assert.deepEqual(SESSION_KIND_SCOPES, {
    'branch-lecture': 'branch',
    'section-seminar': 'section',
    'cohort-lab-work': 'cohort'
  });
  assert.throws(() => sessionKind('lecture-branch'), /Invalid session kind/);
});

test('creates complete session specifiers with no null fields', () => {
  const session = sessionSpecifier({
    subject: 'Algebra',
    teacher: 'Ada Lovelace',
    room: 'B12',
    population: 'LCS1 A',
    day: 'lundi',
    time: '10H00-11H30',
    week_pattern_specifier: 'SA',
    session_kind: 'section-seminar'
  });

  assert.equal(session.session_kind, 'section-seminar');
  assert.equal(session.population.type, Type.SECTION_POPULATION);
  assert.equal(session.day, 'LUNDI');
  assert.equal(session.time, '10h00-11h30');
  assert.equal(session.week_pattern_specifier, 'SA');
  assert.equal(Object.values(session).some((value) => value === null), false);
  assert.throws(() => sessionSpecifier({
    session_kind: 'branch-lecture',
    population: 'LCS1',
    subject: '',
    teacher: 'B',
    room: 'C',
    day: 'Lundi',
    time: '08h15-09h45'
  }), /subject is required/);
  assert.throws(() => sessionSpecifier({
    subject: 'A', teacher: 'B', room: 'C', population: 'LCS1', day: 'Dimanche', time: '08h15-09h45', session_kind: 'branch-lecture'
  }), /Invalid day/);
  assert.throws(() => sessionSpecifier({
    subject: 'A', teacher: 'B', room: 'C', population: 'LCS1', day: 'Lundi', time: '09h00-10h00', session_kind: 'branch-lecture'
  }), /Invalid time/);
});

test('normalizes week patterns and rejects unknown patterns', () => {
  assert.equal(weekPatternSpecifier(), '');
  assert.equal(weekPatternSpecifier('every'), '');
  assert.equal(weekPatternSpecifier('sb'), 'SB');
  assert.throws(() => weekPatternSpecifier('S1'), /Invalid week pattern/);
});

test('converts valid CSV records into explicit partial records', () => {
  const result = fromCsvRecord({
    field: 'LCS1-A2',
    professor: 'Ada',
    subject: 'Algebra',
    room: 'B12',
    day: 'Lundi',
    time: '10H00-11H30',
    week: 'SA',
    source: 'page-2',
    color: '#AABBCC'
  });

  assert.equal(result.type, Type.PARTIAL_SESSION_RECORD);
  assert.equal(result.reference, 'LCS1 A2');
  assert.equal(result.population.type, Type.COHORT_POPULATION);
  assert.deepEqual(result.provenance, { type: Type.PROVENANCE, source: 'page-2', color: '#AABBCC' });
  assert.deepEqual(result.missing, ['session_kind']);
  assert.equal(Object.values(result).some((value) => value === null), false);
});

test('reports malformed or incomplete CSV records explicitly', () => {
  const missing = fromCsvRecord({ field: 'LCS1 A', subject: '', week: 'S1' });
  assert.equal(missing.type, Type.INVALID_CSV_RECORD);
  assert.ok(missing.errors.includes('professor is required'));
  assert.ok(missing.errors.includes('Invalid week pattern: S1'));
  assert.equal(missing.record.subject, '');

  const malformedReference = fromCsvRecord({
    field: 'not a reference',
    professor: 'Ada',
    subject: 'Algebra',
    room: 'B12',
    day: 'Lundi',
    time: '10h00-11h30',
    week: ''
  });
  assert.equal(malformedReference.type, Type.INVALID_CSV_RECORD);
  assert.ok(malformedReference.errors.some((error) => error.includes('Malformed')));
});

test('catalogue resolves invalid, absent, unique, and ambiguous references', () => {
  const records = [{
    type: Type.PARTIAL_SESSION_RECORD,
    subject: 'Algebra',
    teacher: 'Ada',
    room: 'B12',
    day: 'LUNDI',
    time: '10h00-11h30',
    week_pattern_specifier: weekPatternSpecifier(),
    population: populationReference({ reference: 'LCS1' }),
    reference: 'LCS1',
    provenance: { type: Type.PROVENANCE, source: 'p1', color: '' },
    missing: ['session_kind']
  }];
  const catalogue = new Catalogue({
    branches: ['LCS1', 'LCS2'],
    classes: ['LCS1 A', 'LCS1 A2'],
    records
  });

  assert.equal(catalogue.resolve('???').type, Type.INVALID_RESOLUTION);
  assert.equal(catalogue.resolve('LCS3').type, Type.NOT_FOUND);
  const unique = catalogue.resolve('LCS1');
  assert.equal(unique.type, Type.UNIQUE_MATCH);
  assert.equal(unique.catalogue.match.identifier, 'LCS1');
  assert.equal(unique.publication.type, Type.RECORDS);
  assert.equal(catalogue.resolve('LCS1 A').type, Type.UNIQUE_MATCH);

  const ambiguous = new Catalogue({ branches: [
    singletonBranch(track({ track_specifier: 'LCS', year_specifier: 1 })),
    singletonBranch(track({ track_specifier: 'LCS', year_specifier: 1 }))
  ] })
    .resolve('LCS1');
  assert.equal(ambiguous.type, Type.AMBIGUOUS_MATCH);
  assert.equal(ambiguous.catalogue.matches.length, 2);
});

test('catalogue adds singleton classes for sectionless branches', () => {
  const catalogue = new Catalogue({ branches: ['MP1-EXR'] });
  assert.equal(catalogue.classes.length, 1);
  assert.equal(catalogue.classes[0].type, Type.SINGLETON_CLASS);
  assert.equal(catalogue.resolve('MP1-EXR').type, Type.UNIQUE_MATCH);
});

test('query helpers filter explicit values', () => {
  const catalogue = new Catalogue({ branches: ['LCS1', 'LCS2'], classes: ['LCS1 A', 'LCS2 A'] });
  assert.equal(queryClasses(catalogue, (value) => value.branch.identifier === 'LCS1').length, 1);
  const records = [
    { type: Type.PARTIAL_SESSION_RECORD, subject: 'A' },
    { type: Type.PARTIAL_SESSION_RECORD, subject: 'B' }
  ];
  assert.deepEqual(queryRecords(records, { subject: 'B' }), [records[1]]);
});

test('exports fixed timetable coordinates', () => {
  assert.equal(DAYS.has('LUNDI'), true);
  assert.equal(SLOTS.has('08h15-09h45'), true);
});

test('covers common, specialization, verbose, compact, and sectionless notation', () => {
  assert.equal(parseReference('LCS3 GLSI3').branch.type, Type.SPECIALIZATION_BRANCH);
  assert.equal(parseReference('GLSI3').branch.type, Type.SECTIONLESS_BRANCH);
  assert.equal(parseReference('LCS3 GLSI3').branch.identifier, 'GLSI3');
  assert.equal(parseReference('LCS3 GLSI3 A2').class.identifier, 'GLSI3 A2');
  assert.equal(parseReference('GLSI3 A').class.type, Type.SECTION_CLASS);
  assert.equal(parseReference('LCS1 A2').class.type, Type.COHORT_CLASS);
  assert.equal(parseReference('GLSI3A2').class.identifier, 'GLSI3 A2');
  assert.equal(parseReference('MP1-EXR', { expected: 'branch' }).branch.identifier, 'MP1-EXR');
});

test('supports configurable common tracks and preserves unknown-code semantics', () => {
  assert.equal(parseReference('BIO1', { commonTracks: ['BIO'], expected: 'branch' }).branch.type, Type.COMMON_BRANCH);
  assert.equal(parseReference('BIO1').branch.type, Type.SECTIONLESS_BRANCH);
  assert.equal(parseReference('ZZZ1').branch.type, Type.SECTIONLESS_BRANCH);
  const catalogue = new Catalogue({ commonTracks: ['BIO'], branches: ['BIO1'] });
  const resolved = catalogue.resolve('BIO1');
  assert.equal(resolved.type, Type.UNIQUE_MATCH);
  assert.equal(resolved.syntax.branch.type, Type.COMMON_BRANCH);
  assert.equal(resolved.syntax.branch.identifier, 'BIO1');
});

test('rejects malformed references and preserves explicit singleton interpretation', () => {
  assert.equal(parseReference('').type, Type.INVALID_REFERENCE);
  assert.equal(parseReference('LCS1 A B').type, Type.INVALID_REFERENCE);
  const parsed = parseReference('MP1-EXR');
  assert.equal(parsed.type, Type.BRANCH_REFERENCE);
  assert.equal(parsed.branch.identifier, 'MP1-EXR');
  assert.equal(classPopulation({ branch: parsed.branch }).type, Type.SINGLETON_CLASS);
});

test('separates catalogue matching from publication records', () => {
  const branchValue = singletonBranch(track({ track_specifier: 'LCS', year_specifier: 1 }));
  const catalogue = new Catalogue({
    branches: [branchValue, branch({
      track: track({ track_specifier: 'LCS', year_specifier: 3 }),
      specialization_specifier: specializationSpecifier('GLSI'),
      branch_semester_specifier: branchSemesterSpecifier(3)
    })],
    classes: [
      classPopulation({ branch: branchValue, section_specifier: 'A' }),
      classPopulation({ branch: branchValue, section_specifier: 'A', cohort_specifier: 1 })
    ],
    records: [fromCsvRecord({
      field: 'LCS1-A Groupe 1',
      professor: 'Teacher',
      day: 'LUNDI',
      time: '08h15-09h45',
      room: 'A1',
      subject: 'Math',
      source: 'p1'
    })]
  });
  const found = catalogue.resolve('LCS1 A1');
  assert.equal(found.type, Type.UNIQUE_MATCH);
  assert.equal(found.catalogue.match.identifier, 'LCS1 A1');
  assert.equal(found.publication.type, Type.RECORDS);
  assert.equal(catalogue.resolve('LCS9').type, Type.NOT_FOUND);
  assert.equal(catalogue.resolve('bad!').type, Type.INVALID_RESOLUTION);
});

test('handles sectionless branches and their singleton classes', () => {
  const catalogue = new Catalogue({
    branches: ['MP1-EXR'],
    classes: ['MP1-EXR'],
    records: [fromCsvRecord({
      field: 'MP1-EXR',
      professor: 'Teacher',
      day: 'LUNDI',
      time: '08h15-09h45',
      room: 'A1',
      subject: 'Project'
    })]
  });
  assert.equal(catalogue.classes.length, 1);
  assert.equal(catalogue.classes[0].type, Type.SINGLETON_CLASS);
  const result = catalogue.resolve('MP1-EXR');
  assert.equal(result.type, Type.UNIQUE_MATCH);
  assert.equal(result.catalogue.match.type, Type.SECTIONLESS_BRANCH);
  assert.equal(result.publication.type, Type.RECORDS);
});

test('catalogue resolution propagates the preferred interpretation', () => {
  const catalogue = new Catalogue({ branches: ['MP1-EXR'], classes: ['MP1-EXR'] });

  const branchResult = catalogue.resolve('MP1-EXR', { expected: 'branch' });
  const classResult = catalogue.resolve('MP1-EXR', { expected: 'class' });

  assert.equal(branchResult.type, Type.UNIQUE_MATCH);
  assert.equal(branchResult.catalogue.match.type, Type.SECTIONLESS_BRANCH);
  assert.equal(classResult.type, Type.UNIQUE_MATCH);
  assert.equal(classResult.catalogue.match.type, Type.SINGLETON_CLASS);
  assert.equal(classResult.syntax.type, Type.CLASS_REFERENCE);
});

test('reports branch, class, invalid, absent, and no-publication outcomes', () => {
  const catalogue = new Catalogue({
    branches: ['LCS1'],
    classes: ['LCS1 A2'],
    records: [fromCsvRecord({
      field: 'LCS1-A Groupe 2',
      professor: 'Teacher',
      day: 'LUNDI',
      time: '08h15-09h45',
      room: 'A1',
      subject: 'Math'
    })]
  });
  assert.equal(catalogue.resolve('LCS1').type, Type.UNIQUE_MATCH);
  assert.equal(catalogue.resolve('LCS1 A2').type, Type.UNIQUE_MATCH);
  assert.equal(catalogue.resolve('LCS1 A2').publication.type, Type.RECORDS);
  assert.equal(catalogue.resolve('LCS9').type, Type.NOT_FOUND);
  assert.equal(catalogue.resolve('LCS1 A B').type, Type.INVALID_RESOLUTION);
  assert.equal(catalogue.resolve('LCS1 A2').catalogue.match.identifier, 'LCS1 A2');
});

test('uses the year semester validator in branch-semester calculations', () => {
  assert.deepEqual(branchSemesterFor({
    year_specifier: 2,
    branch_start_year: 1,
    year_semester_specifier: yearSemesterSpecifier(1)
  }), branchSemesterSpecifier(3));
  assert.deepEqual(branchSemesterFor({
    year_specifier: 2,
    branch_start_year: 1,
    year_semester_specifier: yearSemesterSpecifier(2)
  }), branchSemesterSpecifier(4));
});

test('supports all session scope aliases and rejects incompatible scopes', () => {
  assert.equal(sessionKind('lecture'), 'branch-lecture');
  assert.equal(sessionKind('seminar'), 'section-seminar');
  assert.equal(sessionKind('lab'), 'cohort-lab-work');
  assert.throws(() => sessionKind('lab-section'));
  assert.equal(weekPatternSpecifier(''), '');
  assert.equal(weekPatternSpecifier('SA'), 'SA');
  assert.throws(() => weekPatternSpecifier('S1'));
  assert.equal(sessionSpecifier({
    subject: 'Math',
    teacher: 'Teacher',
    room: 'A1',
    population: 'LCS1',
    session_kind: 'branch-lecture',
    day: 'LUNDI',
    time: '08h15-09h45'
  }).week_pattern_specifier, '');
  assert.equal(sessionSpecifier({
    subject: 'Math',
    teacher: 'Teacher',
    room: 'A1',
    session_kind: 'branch-lecture',
    population: 'LCS1',
    day: 'LUNDI',
    time: '08h15-09h45'
  }).session_kind, 'branch-lecture');
  assert.equal(sessionSpecifier({
    subject: 'Math',
    teacher: 'Teacher',
    room: 'A1',
    session_kind: 'branch-lecture',
    population: 'LCS1',
    day: 'LUNDI',
    time: '08h15-09h45'
  }).session_kind, 'branch-lecture');
  assert.throws(() => populationReference({
    reference: 'LCS1 A',
    session_kind: 'branch-lecture'
  }));
  assert.equal(populationReference({
    reference: 'LCS1',
    session_kind: 'branch-lecture'
  }).type, Type.BRANCH_POPULATION);
  assert.equal(populationReference({
    reference: 'LCS1 A',
    session_kind: 'section-seminar'
  }).type, Type.SECTION_POPULATION);
  assert.equal(populationReference({
    reference: 'LCS1 A2',
    session_kind: 'cohort-lab-work'
  }).type, Type.COHORT_POPULATION);
  assert.throws(() => populationReference({
    reference: 'LCS1',
    session_kind: 'section-seminar'
  }));
  assert.throws(() => populationReference({
    reference: 'LCS1 A',
    session_kind: 'cohort-lab-work'
  }));
});

test('converts complete CSV records while preserving missing activity metadata', () => {
  const record = fromCsvRecord({
    professor: 'Teacher',
    day: 'LUNDI',
    time: '08h15-09h45',
    room: 'A1',
    subject: 'Math',
    field: 'GLSI3-A Groupe 2',
    week: 'SB',
    source: 'page 2',
    color: '#fff000'
  });
  assert.equal(record.population.type, Type.COHORT_POPULATION);
  assert.equal(record.population.class.identifier, 'GLSI3 A2');
  assert.deepEqual(record.missing, ['session_kind']);
  assert.equal(record.provenance.color, '#fff000');
});

test('queries branches, classes, and records using predicates and filters', () => {
  const branchValue = singletonBranch(track({ track_specifier: 'LCS', year_specifier: 1 }));
  const catalogue = new Catalogue({
    branches: [branchValue],
    classes: [classPopulation({ branch: branchValue, section_specifier: 'A' })]
  });
  assert.equal(queryBranches(catalogue, (value) => value.identifier === 'LCS1').length, 1);
  assert.equal(queryClasses(catalogue, (value) => value.type === Type.SECTION_CLASS).length, 1);
  assert.equal(queryRecords([{ day: 'LUNDI' }, { day: 'MARDI' }], { day: 'LUNDI' }).length, 1);
});

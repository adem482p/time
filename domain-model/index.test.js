import test from 'node:test';
import assert from 'node:assert/strict';
import { createCatalogue } from './catalogue.js';
import {
  Type, DAYS, SLOTS, SESSION_KIND_SCOPES,
  trackSpecifier, yearSpecifier, specialtySpecifier,
  yearSemesterSpecifier, specialtySemesterSpecifier, sectionSpecifier, cohortSpecifier,
  year, commonSpecialty, specialty, classPopulation,
  parseReference, populationReference, sessionKind, sessionSpecifier,
  weekPatternSpecifier, fromCsvRecord, specialtySemesterFor,
  twoCohorts, noCohorts, sectionsWithTwoCohorts, sectionsWithNoCohorts,
  populationsForYear, commonSpecialtyRule, specialtyRule,
  querySpecialties, queryClasses, queryRecords,
  Catalogue
} from './index.js';

const cat = createCatalogue();

test('exports unique symbol discriminators', () => {
  assert.equal(typeof Type.INVALID_REFERENCE, 'symbol');
  assert.notEqual(Type.INVALID_REFERENCE, Type.SPECIALTY_REFERENCE);
  assert.equal(Object.isFrozen(Type), true);
});

test('grammar rules expose their type symbols', () => {
  const commonRule = commonSpecialtyRule({ track_specifier: trackSpecifier('LBC'), year_specifier: yearSpecifier(1), sections: [] });
  assert.equal(commonRule.type, Type.COMMON_SPECIALTY_RULE);
  const specialtyRuleValue = specialtyRule({
    specialty_specifier: specialtySpecifier('GLSI'),
    track_specifier: trackSpecifier('LCS'),
    start_year_specifier: 2,
    duration_semesters: 3
  });
  assert.equal(specialtyRuleValue.type, Type.SPECIALTY_RULE);
  assert.equal(Object.isFrozen(specialtyRuleValue), true);
});

test('year and specialty construction validated by catalogue', () => {
  const y = year(cat, { track_specifier: trackSpecifier('LCS'), year_specifier: yearSpecifier(3) });
  assert.equal(y.type, Type.YEAR);
  assert.equal(y.identifier, 'LCS3');
  const node = specialty(cat, { specialty_specifier: specialtySpecifier('GLSI'), year_specifier: yearSpecifier(3), year_semester_specifier: yearSemesterSpecifier(1) });
  assert.equal(node.identifier, 'GLSI5');
  assert.equal(node.year.identifier, 'LCS3');
  assert.throws(() => year(cat, { track_specifier: trackSpecifier('MP'), year_specifier: yearSpecifier(3) }), /Unsupported year/);
  // GLSI semester 6 (year 3 sem 2) is outside duration (3 semesters: 3, 4, 5)
  assert.throws(
    () => specialty(cat, { specialty_specifier: specialtySpecifier('GLSI'), year_specifier: yearSpecifier(3), year_semester_specifier: yearSemesterSpecifier(2) }),
    /outside active duration/
  );
  assert.throws(
    () => specialtyRule({ specialty_specifier: specialtySpecifier('GLSI'), track_specifier: trackSpecifier('LCS'), start_year_specifier: 0, duration_semesters: 3 }),
    /start_year_specifier must be a positive integer/
  );
});

test('common specialty construction', () => {
  const commonNode = commonSpecialty(cat, { track_specifier: trackSpecifier('LBC'), year_specifier: yearSpecifier(1) });
  assert.equal(commonNode.type, Type.COMMON_SPECIALTY);
  assert.equal(commonNode.identifier, 'LBC1');
  assert.equal(commonNode.year.identifier, 'LBC1');
  assert.throws(
    () => commonSpecialty(cat, { track_specifier: trackSpecifier('MP'), year_specifier: yearSpecifier(1) }),
    /Track MP has no common specialty/
  );
  assert.throws(
    () => commonSpecialty(cat, { track_specifier: trackSpecifier('LCS'), year_specifier: yearSpecifier(2) }),
    /diverged into specialties/
  );
});

test('class population shapes', () => {
  const node = specialty(cat, { specialty_specifier: specialtySpecifier('GLSI'), year_specifier: yearSpecifier(2), year_semester_specifier: yearSemesterSpecifier(1) });
  const cls = classPopulation(cat, { specialty: node, section_specifier: 'A', cohort_specifier: 1 });
  assert.equal(cls.type, Type.COHORT_CLASS);
  assert.equal(cls.identifier, `${node.identifier} A1`);
  const singletonSpecialty = specialty(cat, { specialty_specifier: specialtySpecifier('EXR'), year_specifier: yearSpecifier(1), year_semester_specifier: yearSemesterSpecifier(1) });
  const single = classPopulation(cat, { specialty: singletonSpecialty });
  assert.equal(single.type, Type.SINGLETON_CLASS);
  assert.throws(() => classPopulation(cat, { specialty: singletonSpecialty, section_specifier: 'A' }), /Invalid section/);
});

test('specialty semester calculation', () => {
  assert.deepEqual(
    specialtySemesterFor({ year_specifier: 3, year_semester_specifier: 1, start_year_specifier: 2 }),
    specialtySemesterSpecifier(5)
  );
  assert.deepEqual(
    specialtySemesterFor({ year_specifier: 2, year_semester_specifier: 2, start_year_specifier: 2 }),
    specialtySemesterSpecifier(4)
  );
});

test('parseReference catalogue-aware', () => {
  const r = parseReference('LCS3 GLSI5', { catalogue: cat });
  assert.equal(r.type, Type.SPECIALTY_REFERENCE);
  assert.equal(r.specialty.identifier, 'GLSI5');
  const c = parseReference('GLSI3', { catalogue: cat });
  assert.equal(c.type, Type.SPECIALTY_REFERENCE);
  assert.equal(c.specialty.type, Type.SPECIALTY);
  const cls = parseReference('GLSI3 A2', { catalogue: cat });
  assert.equal(cls.type, Type.CLASS_REFERENCE);
  const bad = parseReference('ZZZ1', { catalogue: cat });
  assert.equal(bad.type, Type.INVALID_REFERENCE);
  const mp = parseReference('MP1-EXR', { catalogue: cat, expected: 'specialty' });
  assert.equal(mp.type, Type.SPECIALTY_REFERENCE);
  assert.equal(mp.specialty.specialty_specifier.value, 'EXR');
});

test('population references', () => {
  const specialtyPopulation = populationReference({ reference: 'LCS1', session_kind: 'specialty-lecture', catalogue: cat });
  assert.equal(specialtyPopulation.type, Type.SPECIALTY_POPULATION);
  const sp = populationReference({ reference: 'LCS1 A', session_kind: 'section-seminar', catalogue: cat });
  assert.equal(sp.type, Type.SECTION_POPULATION);
  const cp = populationReference({ reference: 'LCS1 A1', session_kind: 'cohort-lab-work', catalogue: cat });
  assert.equal(cp.type, Type.COHORT_POPULATION);
  assert.throws(() => populationReference({ reference: 'LCS1 A', session_kind: 'specialty-lecture', catalogue: cat }));
});

test('session specifier', () => {
  const s = sessionSpecifier({ subject: 'Math', teacher: 'T', room: 'A1', population: 'LCS1', day: 'lundi', time: '10H00-11H30', session_kind: 'specialty-lecture', catalogue: cat });
  assert.equal(s.day, 'LUNDI');
  assert.equal(s.time, '10h00-11h30');
  assert.equal(s.week_pattern_specifier, '');
});

test('week pattern', () => {
  assert.equal(weekPatternSpecifier('sb'), 'SB');
  assert.throws(() => weekPatternSpecifier('S1'));
});

test('CSV conversion', () => {
  const row = (field) => ({ field, professor: 'T', subject: 'Math', room: 'A1', day: 'Lundi', time: '08h15-09h45', week: 'SA', source: 'p1', color: '#aabbcc' });
  const r = fromCsvRecord(row('LCS1-A Groupe 2'), { catalogue: cat });
  assert.equal(r.type, Type.PARTIAL_SESSION_RECORD);
  assert.equal(r.population.type, Type.COHORT_POPULATION);
  assert.equal(r.population.class.identifier, 'LCS1 A2');

  const specialtyRow = fromCsvRecord(row('LBC2-BI_A Groupe 1'), { catalogue: cat });
  assert.equal(specialtyRow.type, Type.PARTIAL_SESSION_RECORD);
  assert.equal(specialtyRow.reference, 'BI3 A1');
  assert.equal(specialtyRow.population.class.identifier, 'BI3 A1');

  const section = fromCsvRecord(row('LBC3-EB_A'), { catalogue: cat });
  assert.equal(section.reference, 'EB5 A');
  assert.equal(section.population.type, Type.SECTION_POPULATION);

  const singleton = fromCsvRecord(row('MP1-SD'), { catalogue: cat });
  assert.equal(singleton.reference, 'SD1');
  assert.equal(singleton.population.type, Type.SPECIALTY_POPULATION);

  const bad = fromCsvRecord({ field: 'LCS1 A', subject: '', week: 'S1' }, { catalogue: cat });
  assert.equal(bad.type, Type.INVALID_CSV_RECORD);
});

test('catalogue resolution', () => {
  const u = cat.resolve('LCS1');
  assert.equal(u.type, Type.UNIQUE_MATCH);
  assert.equal(u.catalogue.match.identifier, 'LCS1');
  assert.equal(cat.resolve('ZZZ9').type, Type.INVALID_RESOLUTION);
  assert.equal(cat.resolve('bad!').type, Type.INVALID_RESOLUTION);
});

test('generation', () => {
  assert.ok(cat.years.length > 0);
  assert.ok(cat.specialties.some((node) => node.identifier === 'GLSI3'));
  assert.ok(cat.specialties.some((node) => node.identifier === 'GLSI4'));
  assert.ok(cat.specialties.some((node) => node.identifier === 'GLSI5'));
  // GLSI6 does not exist because duration is 3 semesters
  assert.equal(cat.specialties.some((node) => node.identifier === 'GLSI6'), false);
  assert.ok(cat.classes.some((c) => c.identifier === 'LCS1 A1'));
  assert.ok(cat.classes.some((c) => c.type === Type.SINGLETON_CLASS && c.identifier === 'EXR1'));
});

test('queries', () => {
  assert.equal(querySpecialties(cat, (v) => v.identifier === 'LCS1').length, 1);
  assert.equal(queryClasses(cat, (v) => v.type === Type.SECTION_CLASS).length > 0, true);
  assert.equal(queryRecords([{ day: 'LUNDI' }, { day: 'MARDI' }], { day: 'LUNDI' }).length, 1);
});

test('strict tree divergence and trunk derivation invariant enforcement', () => {
  // Missing commonSpecialtyRule for derived trunk throws
  assert.throws(
    () => new Catalogue({
      trackSpecifiers: [trackSpecifier('TST')],
      specialtySpecifiers: [specialtySpecifier('SPC')],
      specialtyRules: [
        specialtyRule({
          specialty_specifier: 'SPC',
          track_specifier: 'TST',
          start_year_specifier: 2,
          duration_semesters: 2,
          populations: [populationsForYear({ year_specifier: 2, sections: [] })]
        })
      ],
      commonSpecialtyRules: [] // Missing year 1 commonSpecialtyRule!
    }),
    /Missing commonSpecialtyRule for TST at year specifier 1/
  );

  // Common specialty requested past divergence throws
  assert.throws(
    () => new Catalogue({
      trackSpecifiers: [trackSpecifier('TST')],
      specialtySpecifiers: [specialtySpecifier('SPC')],
      specialtyRules: [
        specialtyRule({
          specialty_specifier: 'SPC',
          track_specifier: 'TST',
          start_year_specifier: 2,
          duration_semesters: 2,
          populations: [populationsForYear({ year_specifier: 2, sections: [] })]
        })
      ],
      commonSpecialtyRules: [
        commonSpecialtyRule({ track_specifier: 'TST', year_specifier: 1, sections: [] }),
        commonSpecialtyRule({ track_specifier: 'TST', year_specifier: 2, sections: [] }) // Invalid! Year 2 is already diverged
      ]
    }),
    /diverged before year specifier 2/
  );
});

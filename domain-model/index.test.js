import test from 'node:test';
import assert from 'node:assert/strict';
import { createCatalogue } from '../data/catalogue.js';
import {
  Type, DAYS, SLOTS, SESSION_KIND_SCOPES,
  trackSpecifier, yearSpecifier, specializationSpecifier,
  yearSemesterSpecifier, branchSemesterSpecifier, sectionSpecifier, cohortSpecifier,
  year, commonBranch, branch, classPopulation,
  parseReference, populationReference, sessionKind, sessionSpecifier,
  weekPatternSpecifier, fromCsvRecord, branchSemesterFor,
  twoCohorts, noCohorts, sectionsWithTwoCohorts, sectionsWithNoCohorts,
  populationsForYear, trackRule, specializationRule, branchRule,
  queryBranches, queryClasses, queryRecords,
  Catalogue
} from './index.js';

const cat = createCatalogue();

test('exports unique symbol discriminators', () => {
  assert.equal(typeof Type.INVALID_REFERENCE, 'symbol');
  assert.notEqual(Type.INVALID_REFERENCE, Type.BRANCH_REFERENCE);
  assert.equal(Object.isFrozen(Type), true);
});

test('year and branch construction validated by catalogue', () => {
  const y = year(cat, { track_specifier: trackSpecifier('LCS'), year_specifier: yearSpecifier(3) });
  assert.equal(y.type, Type.YEAR);
  assert.equal(y.identifier, 'LCS3');
  const b = branch(cat, { specialization_specifier: specializationSpecifier('GLSI'), year_specifier: yearSpecifier(3), year_semester_specifier: yearSemesterSpecifier(1) });
  assert.equal(b.identifier, 'GLSI3');
  assert.equal(b.year.identifier, 'LCS3');
  assert.throws(() => year(cat, { track_specifier: trackSpecifier('MP'), year_specifier: yearSpecifier(3) }), /Unsupported year/);
  assert.throws(() => branch(cat, { specialization_specifier: specializationSpecifier('GLSI'), year_specifier: yearSpecifier(1), year_semester_specifier: yearSemesterSpecifier(1) }), /Branch year specifier outside duration/);
  assert.throws(() => branchRule({ specialization_specifier: specializationSpecifier('GLSI'), start_year_specifier: 0, duration: 2 }), /start_year_specifier must be a positive integer/);
});

test('common branch construction', () => {
  const cb = commonBranch(cat, { track_specifier: trackSpecifier('LBC'), year_specifier: yearSpecifier(1) });
  assert.equal(cb.type, Type.COMMON_BRANCH);
  assert.equal(cb.identifier, 'LBC1');
  assert.equal(cb.year.identifier, 'LBC1');
  assert.throws(
    () => commonBranch(cat, { track_specifier: trackSpecifier('MP'), year_specifier: yearSpecifier(1) }),
    /Track MP has no common branch/
  );
  assert.throws(
    () => commonBranch(cat, { track_specifier: trackSpecifier('LCS'), year_specifier: yearSpecifier(2) }),
    /diverged into specializations/
  );
});

test('class population shapes', () => {
  const b = branch(cat, { specialization_specifier: specializationSpecifier('GLSI'), year_specifier: yearSpecifier(2), year_semester_specifier: yearSemesterSpecifier(1) });
  const cls = classPopulation(cat, { branch: b, section_specifier: 'A', cohort_specifier: 1 });
  assert.equal(cls.type, Type.COHORT_CLASS);
  assert.equal(cls.identifier, `${b.identifier} A1`);
  const singletonBranch = branch(cat, { specialization_specifier: specializationSpecifier('EXR'), year_specifier: yearSpecifier(1), year_semester_specifier: yearSemesterSpecifier(1) });
  const single = classPopulation(cat, { branch: singletonBranch });
  assert.equal(single.type, Type.SINGLETON_CLASS);
  assert.throws(() => classPopulation(cat, { branch: singletonBranch, section_specifier: 'A' }), /Invalid section/);
});

test('branch semester calculation', () => {
  assert.deepEqual(branchSemesterFor({ year_specifier: 3, start_year_specifier: 2, year_semester_specifier: yearSemesterSpecifier(1) }), branchSemesterSpecifier(3));
  assert.deepEqual(branchSemesterFor({ year_specifier: 3, start_year_specifier: 2, year_semester_specifier: yearSemesterSpecifier(2) }), branchSemesterSpecifier(4));
});

test('parseReference catalogue-aware', () => {
  const r = parseReference('LCS3 GLSI3', { catalogue: cat });
  assert.equal(r.type, Type.BRANCH_REFERENCE);
  assert.equal(r.branch.identifier, 'GLSI3');
  const c = parseReference('GLSI3', { catalogue: cat });
  assert.equal(c.type, Type.BRANCH_REFERENCE);
  assert.equal(c.branch.type, Type.SPECIALIZATION_BRANCH);
  const cls = parseReference('GLSI3 A2', { catalogue: cat });
  assert.equal(cls.type, Type.CLASS_REFERENCE);
  const bad = parseReference('ZZZ1', { catalogue: cat });
  assert.equal(bad.type, Type.INVALID_REFERENCE);
  const mp = parseReference('MP1-EXR', { catalogue: cat, expected: 'branch' });
  assert.equal(mp.type, Type.BRANCH_REFERENCE);
  assert.equal(mp.branch.specialization_specifier.value, 'EXR');
});

test('population references', () => {
  const bp = populationReference({ reference: 'LCS1', session_kind: 'branch-lecture', catalogue: cat });
  assert.equal(bp.type, Type.BRANCH_POPULATION);
  const sp = populationReference({ reference: 'LCS1 A', session_kind: 'section-seminar', catalogue: cat });
  assert.equal(sp.type, Type.SECTION_POPULATION);
  const cp = populationReference({ reference: 'LCS1 A1', session_kind: 'cohort-lab-work', catalogue: cat });
  assert.equal(cp.type, Type.COHORT_POPULATION);
  assert.throws(() => populationReference({ reference: 'LCS1 A', session_kind: 'branch-lecture', catalogue: cat }));
});

test('session specifier', () => {
  const s = sessionSpecifier({ subject: 'Math', teacher: 'T', room: 'A1', population: 'LCS1', day: 'lundi', time: '10H00-11H30', session_kind: 'branch-lecture', catalogue: cat });
  assert.equal(s.day, 'LUNDI');
  assert.equal(s.time, '10h00-11h30');
  assert.equal(s.week_pattern_specifier, '');
});

test('week pattern', () => {
  assert.equal(weekPatternSpecifier('sb'), 'SB');
  assert.throws(() => weekPatternSpecifier('S1'));
});

test('CSV conversion', () => {
  const r = fromCsvRecord({ field: 'LCS1-A Groupe 2', professor: 'T', subject: 'Math', room: 'A1', day: 'Lundi', time: '08h15-09h45', week: 'SA', source: 'p1', color: '#aabbcc' }, { catalogue: cat });
  assert.equal(r.type, Type.PARTIAL_SESSION_RECORD);
  assert.equal(r.population.type, Type.COHORT_POPULATION);
  assert.equal(r.population.class.identifier, 'LCS1 A2');
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
  assert.ok(cat.branches.some((b) => b.identifier === 'GLSI3'));
  assert.ok(cat.classes.some((c) => c.identifier === 'LCS1 A1'));
  assert.ok(cat.classes.some((c) => c.type === Type.SINGLETON_CLASS && c.identifier === 'EXR1'));
});

test('queries', () => {
  assert.equal(queryBranches(cat, (v) => v.identifier === 'LCS1').length, 1);
  assert.equal(queryClasses(cat, (v) => v.type === Type.SECTION_CLASS).length > 0, true);
  assert.equal(queryRecords([{ day: 'LUNDI' }, { day: 'MARDI' }], { day: 'LUNDI' }).length, 1);
});

test('strict tree divergence invariant enforcement', () => {
  // 1. Trunk must be contiguous starting at 1
  assert.throws(
    () => new Catalogue({
      trackSpecifiers: [trackSpecifier('TST')],
      trackRules: [
        trackRule({
          track_specifier: 'TST',
          duration: 3,
          trunk: [populationsForYear({ year_specifier: 2, sections: [] })]
        })
      ]
    }),
    /must be contiguous starting at year specifier 1/
  );

  // 2. Trunk year cannot exceed track duration
  assert.throws(
    () => new Catalogue({
      trackSpecifiers: [trackSpecifier('TST')],
      trackRules: [
        trackRule({
          track_specifier: 'TST',
          duration: 1,
          trunk: [
            populationsForYear({ year_specifier: 1, sections: [] }),
            populationsForYear({ year_specifier: 2, sections: [] })
          ]
        })
      ]
    }),
    /exceeds track duration/
  );

  // 3. Specialization cannot start within or before the common trunk
  assert.throws(
    () => new Catalogue({
      trackSpecifiers: [trackSpecifier('TST')],
      specializationSpecifiers: [specializationSpecifier('SPEC')],
      trackRules: [
        trackRule({
          track_specifier: 'TST',
          duration: 3,
          trunk: [
            populationsForYear({ year_specifier: 1, sections: [] }),
            populationsForYear({ year_specifier: 2, sections: [] })
          ]
        })
      ],
      specializationRules: [
        specializationRule({ specialization_specifier: 'SPEC', track_specifier: 'TST' })
      ],
      branchRules: [
        branchRule({
          specialization_specifier: 'SPEC',
          start_year_specifier: 2,
          duration: 1,
          populations: [populationsForYear({ year_specifier: 2, sections: [] })]
        })
      ]
    }),
    /cannot start at year specifier 2 because track TST has a common trunk through year specifier 2.*Branches never merge/
  );
});

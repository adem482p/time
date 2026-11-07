import {
  trackSpecifier, yearSpecifier, specialtySpecifier,
  commonSpecialtyRule, specialtyRule,
  populationsForYear, groupsWithTwoCohorts, groupsWithNoCohorts,
  Catalogue
} from './index.js';

const lbc = trackSpecifier('LBC');
const lce = trackSpecifier('LCE');
const lcs = trackSpecifier('LCS');
const mp = trackSpecifier('MP');

const bi = specialtySpecifier('BI');
const eb = specialtySpecifier('EB');
const iot = specialtySpecifier('IoT');
const irs = specialtySpecifier('IRS');
const glsi = specialtySpecifier('GLSI');
const exr = specialtySpecifier('EXR');
const sd = specialtySpecifier('SD');

const y1 = yearSpecifier(1);
const y2 = yearSpecifier(2);
const y3 = yearSpecifier(3);

export function createCatalogue(records = []) {
  return new Catalogue({
    trackSpecifiers: [lbc, lce, lcs, mp],
    specialtySpecifiers: [bi, eb, iot, irs, glsi, exr, sd],
    specialtyRules: [
      // LBC specialties: BI starts at year 2 (semester 3), lasts 4 semesters
      specialtyRule({ specialty_specifier: bi, track_specifier: lbc, start_year_specifier: 2, duration_semesters: 4, populations: [
        populationsForYear({ year_specifier: y2, groups: groupsWithTwoCohorts('A','B','C','D','E','F') }),
        populationsForYear({ year_specifier: y3, groups: groupsWithTwoCohorts('A','B','C','D') })
      ]}),
      // EB starts at year 3 (semester 5), lasts 2 semesters
      specialtyRule({ specialty_specifier: eb, track_specifier: lbc, start_year_specifier: 3, duration_semesters: 2, populations: [
        populationsForYear({ year_specifier: y3, groups: groupsWithNoCohorts('A') })
      ]}),
      // LCE specialties: IoT & IRS start at year 2 (semester 3), last 4 semesters
      specialtyRule({ specialty_specifier: iot, track_specifier: lce, start_year_specifier: 2, duration_semesters: 4, populations: [
        populationsForYear({ year_specifier: y2, groups: groupsWithTwoCohorts('A','B') }),
        populationsForYear({ year_specifier: y3, groups: groupsWithTwoCohorts('A','B') })
      ]}),
      specialtyRule({ specialty_specifier: irs, track_specifier: lce, start_year_specifier: 2, duration_semesters: 4, populations: [
        populationsForYear({ year_specifier: y2, groups: groupsWithTwoCohorts('A','B') }),
        populationsForYear({ year_specifier: y3, groups: groupsWithTwoCohorts('A','B') })
      ]}),
      // LCS specialty: GLSI starts at year 2 (semester 3), lasts exactly 3 semesters (GLSI3, GLSI4, GLSI5 - sem 6 is PFE)
      specialtyRule({ specialty_specifier: glsi, track_specifier: lcs, start_year_specifier: 2, duration_semesters: 3, populations: [
        populationsForYear({ year_specifier: y2, groups: groupsWithTwoCohorts('A','B','C','D') }),
        populationsForYear({ year_specifier: y3, groups: groupsWithTwoCohorts('A','B','C','D') })
      ]}),
      // MP specialties: EXR & SD start at year 1 (semester 1), last 3 semesters (courses during S1, S2, S3 - S4 is master thesis)
      specialtyRule({ specialty_specifier: exr, track_specifier: mp, start_year_specifier: 1, duration_semesters: 3, populations: [
        populationsForYear({ year_specifier: y1, groups: [] }),
        populationsForYear({ year_specifier: y2, groups: [] })
      ]}),
      specialtyRule({ specialty_specifier: sd, track_specifier: mp, start_year_specifier: 1, duration_semesters: 3, populations: [
        populationsForYear({ year_specifier: y1, groups: [] }),
        populationsForYear({ year_specifier: y2, groups: groupsWithNoCohorts('A','B') })
      ]})
    ],
    commonSpecialtyRules: [
      commonSpecialtyRule({ track_specifier: lbc, year_specifier: y1, groups: groupsWithTwoCohorts('A','B','C','D','E','F','G','H') }),
      commonSpecialtyRule({ track_specifier: lce, year_specifier: y1, groups: groupsWithTwoCohorts('A','B','C','D','E','F') }),
      commonSpecialtyRule({ track_specifier: lcs, year_specifier: y1, groups: groupsWithTwoCohorts('A','B','C','D','E') })
    ],
    records
  });
}

export const catalogue = createCatalogue();
export { lbc, lce, lcs, mp, bi, eb, iot, irs, glsi, exr, sd, y1, y2, y3 };

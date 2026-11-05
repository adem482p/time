import {
  trackSpecifier, yearSpecifier, specializationSpecifier,
  commonBranchRule, specializationBranchRule,
  populationsForYear, sectionsWithTwoCohorts, sectionsWithNoCohorts,
  Catalogue
} from './index.js';

const lbc = trackSpecifier('LBC');
const lce = trackSpecifier('LCE');
const lcs = trackSpecifier('LCS');
const mp = trackSpecifier('MP');

const bi = specializationSpecifier('BI');
const eb = specializationSpecifier('EB');
const iot = specializationSpecifier('IoT');
const irs = specializationSpecifier('IRS');
const glsi = specializationSpecifier('GLSI');
const exr = specializationSpecifier('EXR');
const sd = specializationSpecifier('SD');

const y1 = yearSpecifier(1);
const y2 = yearSpecifier(2);
const y3 = yearSpecifier(3);

export function createCatalogue(records = []) {
  return new Catalogue({
    trackSpecifiers: [lbc, lce, lcs, mp],
    specializationSpecifiers: [bi, eb, iot, irs, glsi, exr, sd],
    branchRules: [
      // LBC branches: BI starts at year 2 (semester 3), lasts 4 semesters
      specializationBranchRule({ specialization_specifier: bi, track_specifier: lbc, start_year_specifier: 2, duration_semesters: 4, populations: [
        populationsForYear({ year_specifier: y2, sections: sectionsWithTwoCohorts('A','B','C','D','E','F') }),
        populationsForYear({ year_specifier: y3, sections: sectionsWithTwoCohorts('A','B','C','D') })
      ]}),
      // EB starts at year 3 (semester 5), lasts 2 semesters
      specializationBranchRule({ specialization_specifier: eb, track_specifier: lbc, start_year_specifier: 3, duration_semesters: 2, populations: [
        populationsForYear({ year_specifier: y3, sections: sectionsWithNoCohorts('A') })
      ]}),
      // LCE branches: IoT & IRS start at year 2 (semester 3), last 4 semesters
      specializationBranchRule({ specialization_specifier: iot, track_specifier: lce, start_year_specifier: 2, duration_semesters: 4, populations: [
        populationsForYear({ year_specifier: y2, sections: sectionsWithTwoCohorts('A','B') }),
        populationsForYear({ year_specifier: y3, sections: sectionsWithTwoCohorts('A','B') })
      ]}),
      specializationBranchRule({ specialization_specifier: irs, track_specifier: lce, start_year_specifier: 2, duration_semesters: 4, populations: [
        populationsForYear({ year_specifier: y2, sections: sectionsWithTwoCohorts('A','B') }),
        populationsForYear({ year_specifier: y3, sections: sectionsWithTwoCohorts('A','B') })
      ]}),
      // LCS branch: GLSI starts at year 2 (semester 3), lasts exactly 3 semesters (GLSI3, GLSI4, GLSI5 - sem 6 is PFE)
      specializationBranchRule({ specialization_specifier: glsi, track_specifier: lcs, start_year_specifier: 2, duration_semesters: 3, populations: [
        populationsForYear({ year_specifier: y2, sections: sectionsWithTwoCohorts('A','B','C','D') }),
        populationsForYear({ year_specifier: y3, sections: sectionsWithTwoCohorts('A','B','C','D') })
      ]}),
      // MP branches: EXR & SD start at year 1 (semester 1), last 3 semesters (courses during S1, S2, S3 - S4 is master thesis)
      specializationBranchRule({ specialization_specifier: exr, track_specifier: mp, start_year_specifier: 1, duration_semesters: 3, populations: [
        populationsForYear({ year_specifier: y1, sections: [] }),
        populationsForYear({ year_specifier: y2, sections: [] })
      ]}),
      specializationBranchRule({ specialization_specifier: sd, track_specifier: mp, start_year_specifier: 1, duration_semesters: 3, populations: [
        populationsForYear({ year_specifier: y1, sections: [] }),
        populationsForYear({ year_specifier: y2, sections: sectionsWithNoCohorts('A','B') })
      ]})
    ],
    commonBranchRules: [
      commonBranchRule({ track_specifier: lbc, year_specifier: y1, sections: sectionsWithTwoCohorts('A','B','C','D','E','F','G','H') }),
      commonBranchRule({ track_specifier: lce, year_specifier: y1, sections: sectionsWithTwoCohorts('A','B','C','D','E','F') }),
      commonBranchRule({ track_specifier: lcs, year_specifier: y1, sections: sectionsWithTwoCohorts('A','B','C','D','E') })
    ],
    records
  });
}

export const catalogue = createCatalogue();
export { lbc, lce, lcs, mp, bi, eb, iot, irs, glsi, exr, sd, y1, y2, y3 };

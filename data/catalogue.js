import {
  trackSpecifier, yearSpecifier, specializationSpecifier,
  trackRule, specializationRule, branchRule,
  populationsForYear, sectionsWithTwoCohorts, sectionsWithNoCohorts,
  Catalogue
} from '../domain-model/index.js';

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
    trackRules: [
      trackRule({ track_specifier: lbc, duration: 3, trunk: [
        populationsForYear({ year_specifier: y1, sections: sectionsWithTwoCohorts('A','B','C','D','E','F','G','H') })
      ]}),
      trackRule({ track_specifier: lce, duration: 3, trunk: [
        populationsForYear({ year_specifier: y1, sections: sectionsWithTwoCohorts('A','B','C','D','E','F') })
      ]}),
      trackRule({ track_specifier: lcs, duration: 3, trunk: [
        populationsForYear({ year_specifier: y1, sections: sectionsWithTwoCohorts('A','B','C','D','E') })
      ]}),
      trackRule({ track_specifier: mp, duration: 2, trunk: [] })
    ],
    specializationRules: [
      specializationRule({ specialization_specifier: bi, track_specifier: lbc }),
      specializationRule({ specialization_specifier: eb, track_specifier: lbc }),
      specializationRule({ specialization_specifier: iot, track_specifier: lce }),
      specializationRule({ specialization_specifier: irs, track_specifier: lce }),
      specializationRule({ specialization_specifier: glsi, track_specifier: lcs }),
      specializationRule({ specialization_specifier: exr, track_specifier: mp }),
      specializationRule({ specialization_specifier: sd, track_specifier: mp })
    ],
    branchRules: [
      branchRule({ specialization_specifier: bi, start_year_specifier: 2, duration: 2, populations: [
        populationsForYear({ year_specifier: y2, sections: sectionsWithTwoCohorts('A','B','C','D','E','F') }),
        populationsForYear({ year_specifier: y3, sections: sectionsWithTwoCohorts('A','B','C','D') })
      ]}),
      branchRule({ specialization_specifier: eb, start_year_specifier: 3, duration: 1, populations: [
        populationsForYear({ year_specifier: y3, sections: sectionsWithNoCohorts('A') })
      ]}),
      branchRule({ specialization_specifier: iot, start_year_specifier: 2, duration: 2, populations: [
        populationsForYear({ year_specifier: y2, sections: sectionsWithTwoCohorts('A','B') }),
        populationsForYear({ year_specifier: y3, sections: sectionsWithTwoCohorts('A','B') })
      ]}),
      branchRule({ specialization_specifier: irs, start_year_specifier: 2, duration: 2, populations: [
        populationsForYear({ year_specifier: y2, sections: sectionsWithTwoCohorts('A','B') }),
        populationsForYear({ year_specifier: y3, sections: sectionsWithTwoCohorts('A','B') })
      ]}),
      branchRule({ specialization_specifier: glsi, start_year_specifier: 2, duration: 2, populations: [
        populationsForYear({ year_specifier: y2, sections: sectionsWithTwoCohorts('A','B','C','D') }),
        populationsForYear({ year_specifier: y3, sections: sectionsWithTwoCohorts('A','B','C','D') })
      ]}),
      branchRule({ specialization_specifier: exr, start_year_specifier: 1, duration: 2, populations: [
        populationsForYear({ year_specifier: y1, sections: [] }),
        populationsForYear({ year_specifier: y2, sections: [] })
      ]}),
      branchRule({ specialization_specifier: sd, start_year_specifier: 1, duration: 2, populations: [
        populationsForYear({ year_specifier: y1, sections: [] }),
        populationsForYear({ year_specifier: y2, sections: sectionsWithNoCohorts('A','B') })
      ]})
    ],
    records
  });
}

export const catalogue = createCatalogue();
export { lbc, lce, lcs, mp, bi, eb, iot, irs, glsi, exr, sd, y1, y2, y3 };

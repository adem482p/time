// domain-model/catalogue.js — The institute, composed from the construction
// functions in objects.js and indexed by makeCatalog. No schema object, no
// rules: each track/year/semester/class below is an explicit constructor call
// (looped over small local tables, which is just data).

import { makeYear, makeSpecialty, makeSemester, makeClasses } from './objects.js';
import { makeCatalog } from './catalog.js';

// groups('A', 2) → [{group:'A', cohorts:2}]; groups('A','B') → cohortless groups.
const groups = (letters, cohorts = 0) => letters.map((g) => ({ group: g, cohorts }));
const twoCohorts = (letters) => groups(letters, 2);
const noCohorts = (letters) => groups(letters, 0);

const years = [];
const specialties = [];
const semesters = [];
const classes = [];

const yearByNumber = new Map(); // "TRACK|n" -> Year
function trackYears(track, count) {
  const out = [];
  for (let n = 1; n <= count; n++) {
    const y = makeYear(track, n);
    years.push(y);
    yearByNumber.set(`${track}|${n}`, y);
    out.push(y);
  }
  return out;
}

function trunk(track, yearNumber, groupList) {
  const y = yearByNumber.get(`${track}|${yearNumber}`);
  classes.push(...makeClasses(y, groupList));
}

// groupsByYear: {2: [...], 3: [...]} — population of each academic year.
function specialty(code, track, { startsYear, durationSemesters, groupsByYear }) {
  const spec = makeSpecialty(code, track, { startsYear, durationSemesters });
  specialties.push(spec);
  for (let index = 1; index <= durationSemesters; index++) {
    const global = 2 * (startsYear - 1) + 1 + index - 1;
    const yearNumber = Math.floor((global - 1) / 2) + 1;
    const y = yearByNumber.get(`${track}|${yearNumber}`);
    const sem = makeSemester(spec, index, y);
    semesters.push(sem);
    classes.push(...makeClasses(sem, groupsByYear[yearNumber] ?? []));
  }
  return spec;
}

trackYears('LBC', 3);
trackYears('LCE', 3);
trackYears('LCS', 3);
trackYears('MP', 2);

trunk('LBC', 1, twoCohorts(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']));
trunk('LCE', 1, twoCohorts(['A', 'B', 'C', 'D', 'E', 'F']));
trunk('LCS', 1, twoCohorts(['A', 'B', 'C', 'D', 'E']));

specialty('BI', 'LBC', {
  startsYear: 2, durationSemesters: 4,
  groupsByYear: { 2: twoCohorts(['A', 'B', 'C', 'D', 'E', 'F']), 3: twoCohorts(['A', 'B', 'C', 'D']) }
});
specialty('EB', 'LBC', {
  startsYear: 3, durationSemesters: 2,
  groupsByYear: { 3: noCohorts(['A']) }
});
specialty('IoT', 'LCE', {
  startsYear: 2, durationSemesters: 4,
  groupsByYear: { 2: twoCohorts(['A', 'B']), 3: twoCohorts(['A', 'B']) }
});
specialty('IRS', 'LCE', {
  startsYear: 2, durationSemesters: 4,
  groupsByYear: { 2: twoCohorts(['A', 'B']), 3: twoCohorts(['A', 'B']) }
});
specialty('GLSI', 'LCS', {
  startsYear: 2, durationSemesters: 3,
  groupsByYear: { 2: twoCohorts(['A', 'B', 'C', 'D']), 3: twoCohorts(['A', 'B', 'C', 'D']) }
});
specialty('EXR', 'MP', {
  startsYear: 1, durationSemesters: 3,
  groupsByYear: { 1: [], 2: [] }
});
specialty('SD', 'MP', {
  startsYear: 1, durationSemesters: 3,
  groupsByYear: { 1: [], 2: noCohorts(['A', 'B']) }
});

export const catalogue = makeCatalog({ years, specialties, semesters, classes });

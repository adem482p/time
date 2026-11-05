const DAYS = new Set(['LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI']);
const SLOTS = new Set(['08h15-09h45', '10h00-11h30', '11h40-13h10', '13h20-14h50', '15h00-16h30', '16h45-18h15']);
const SESSION_KIND_SCOPES = Object.freeze({
  'branch-lecture': 'branch',
  'section-seminar': 'section',
  'cohort-lab-work': 'cohort'
});

export const Type = Object.freeze({
  TRACK_SPECIFIER: Symbol('track-specifier'),
  YEAR_SPECIFIER: Symbol('year-specifier'),
  SPECIALIZATION_SPECIFIER: Symbol('specialization-specifier'),
  YEAR_SEMESTER_SPECIFIER: Symbol('year-semester-specifier'),
  BRANCH_SEMESTER_SPECIFIER: Symbol('branch-semester-specifier'),
  SECTION_SPECIFIER: Symbol('section-specifier'),
  COHORT_SPECIFIER: Symbol('cohort-specifier'),
  YEAR: Symbol('year'),
  COMMON_BRANCH: Symbol('common-branch'),
  SPECIALIZATION_BRANCH: Symbol('specialization-branch'),
  SECTION_CLASS: Symbol('section-class'),
  COHORT_CLASS: Symbol('cohort-class'),
  SINGLETON_CLASS: Symbol('singleton-class'),
  INVALID_REFERENCE: Symbol('invalid-reference'),
  TRACK_SPECIFIER_REFERENCE: Symbol('track-specifier-reference'),
  SPECIALIZATION_SPECIFIER_REFERENCE: Symbol('specialization-specifier-reference'),
  YEAR_REFERENCE: Symbol('year-reference'),
  BRANCH_REFERENCE: Symbol('branch-reference'),
  CLASS_REFERENCE: Symbol('class-reference'),
  BRANCH_POPULATION: Symbol('branch-population'),
  SECTION_POPULATION: Symbol('section-population'),
  COHORT_POPULATION: Symbol('cohort-population'),
  SESSION_SPECIFIER: Symbol('session-specifier'),
  PROVENANCE: Symbol('provenance'),
  PARTIAL_SESSION_RECORD: Symbol('partial-session-record'),
  INVALID_CSV_RECORD: Symbol('invalid-csv-record'),
  INVALID_RESOLUTION: Symbol('invalid-resolution'),
  NOT_FOUND: Symbol('not-found'),
  UNIQUE_MATCH: Symbol('unique-match'),
  AMBIGUOUS_MATCH: Symbol('ambiguous-match'),
  NOT_APPLICABLE: Symbol('not-applicable'),
  NO_RECORDS: Symbol('no-records'),
  RECORDS: Symbol('records'),
  COMMON_BRANCH_RULE: Symbol('common-branch-rule'),
  SPECIALIZATION_BRANCH_RULE: Symbol('specialization-branch-rule')
});

const freeze = (value) => Object.freeze(value);
const clean = (value) => String(value ?? '').trim().replace(/\s+/g, ' ');

function trackSpecifierValue(tag) {
  if (tag?.type === Type.TRACK_SPECIFIER) return tag;
  const value = clean(tag).toUpperCase();
  if (!/^[A-Z][A-Z0-9-]*$/.test(value)) throw new Error(`Invalid track specifier: ${tag}`);
  return freeze({ type: Type.TRACK_SPECIFIER, value });
}
function yearSpecifierValue(year) {
  if (year?.type === Type.YEAR_SPECIFIER) return year;
  const value = Number(year);
  if (!Number.isInteger(value) || value < 1) throw new Error(`Invalid year specifier: ${year}`);
  return freeze({ type: Type.YEAR_SPECIFIER, value });
}
function specializationSpecifierValue(value) {
  if (value?.type === Type.SPECIALIZATION_SPECIFIER) return value;
  const normalized = clean(value).toUpperCase();
  if (!/^[A-Z][A-Z0-9-]*$/.test(normalized)) throw new Error(`Invalid specialization specifier: ${value}`);
  return freeze({ type: Type.SPECIALIZATION_SPECIFIER, value: normalized });
}
function yearSemesterSpecifierValue(value) {
  if (value?.type === Type.YEAR_SEMESTER_SPECIFIER) return value;
  const number = Number(value);
  if (number !== 1 && number !== 2) throw new Error('Year semester specifier must be 1 or 2');
  return freeze({ type: Type.YEAR_SEMESTER_SPECIFIER, value: number });
}
function branchSemesterSpecifierValue(value) {
  if (value?.type === Type.BRANCH_SEMESTER_SPECIFIER) return value;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) throw new Error('Branch semester specifier must be positive');
  return freeze({ type: Type.BRANCH_SEMESTER_SPECIFIER, value: number });
}
function sectionSpecifierValue(value) {
  if (value?.type === Type.SECTION_SPECIFIER) return value;
  const normalized = clean(value).toUpperCase();
  if (!/^[A-Z]+$/.test(normalized)) throw new Error(`Invalid section specifier: ${value}`);
  return freeze({ type: Type.SECTION_SPECIFIER, value: normalized });
}
function cohortSpecifierValue(value) {
  if (value?.type === Type.COHORT_SPECIFIER) return value;
  const normalized = String(value);
  if (!/^[0-9]+$/.test(normalized)) throw new Error(`Invalid cohort specifier: ${value}`);
  return freeze({ type: Type.COHORT_SPECIFIER, value: Number(normalized) });
}

export function trackSpecifier(tag) { return trackSpecifierValue(tag); }
export function yearSpecifier(year) { return yearSpecifierValue(year); }
export function specializationSpecifier(value) { return specializationSpecifierValue(value); }
export function yearSemesterSpecifier(value) { return yearSemesterSpecifierValue(value); }
export function branchSemesterSpecifier(value) { return branchSemesterSpecifierValue(value); }
export function sectionSpecifier(value) { return sectionSpecifierValue(value); }
export function cohortSpecifier(value) { return cohortSpecifierValue(value); }

export const twoCohorts = 'two-cohorts';
export const noCohorts = 'no-cohorts';

function normalizeSections(sections) {
  if (sections == null) return null;
  return freeze(sections.map((item) => {
    if (item?.section_specifier) return freeze({ section_specifier: sectionSpecifierValue(item.section_specifier), cohorting: item.cohorting === twoCohorts ? twoCohorts : noCohorts });
    // allow shorthand strings
    return freeze({ section_specifier: sectionSpecifierValue(item), cohorting: noCohorts });
  }));
}
export function sectionsWithTwoCohorts(...letters) {
  return letters.map((letter) => ({ section_specifier: sectionSpecifier(letter), cohorting: twoCohorts }));
}
export function sectionsWithNoCohorts(...letters) {
  return letters.map((letter) => ({ section_specifier: sectionSpecifier(letter), cohorting: noCohorts }));
}

export function populationsForYear({ year_specifier, sections } = {}) {
  return freeze({
    year_specifier: yearSpecifierValue(year_specifier),
    sections: normalizeSections(sections ?? [])
  });
}

export function commonBranchRule({ track_specifier, year_specifier, sections } = {}) {
  const ts = trackSpecifierValue(track_specifier);
  const ys = yearSpecifierValue(year_specifier);
  return freeze({
    type: Type.COMMON_BRANCH_RULE,
    track_specifier: ts,
    year_specifier: ys,
    sections: normalizeSections(sections ?? [])
  });
}

export function specializationBranchRule({
  specialization_specifier,
  track_specifier,
  start_year_specifier,
  duration_semesters,
  populations
} = {}) {
  const spec = specializationSpecifierValue(specialization_specifier);
  const trackSpec = trackSpecifierValue(track_specifier);
  const startYear = Number(start_year_specifier?.value ?? start_year_specifier);
  if (!Number.isInteger(startYear) || startYear < 1) throw new Error('start_year_specifier must be a positive integer');
  const durSem = Number(duration_semesters?.value ?? duration_semesters);
  if (!Number.isInteger(durSem) || durSem < 1) throw new Error('duration_semesters must be positive');
  const normalizedPopulations = (populations ?? []).map((entry) => freeze({
    year_specifier: yearSpecifierValue(entry.year_specifier),
    sections: normalizeSections(entry.sections ?? [])
  }));
  return freeze({
    type: Type.SPECIALIZATION_BRANCH_RULE,
    specialization_specifier: spec,
    track_specifier: trackSpec,
    start_year_specifier: startYear,
    duration_semesters: durSem,
    populations: freeze(normalizedPopulations)
  });
}

export function branchSemesterFor({
  year_specifier,
  year_semester_specifier,
  start_year_specifier
} = {}) {
  const ys = Number(year_specifier?.value ?? year_specifier);
  const yss = yearSemesterSpecifierValue(year_semester_specifier).value;
  const bys = Number(start_year_specifier?.value ?? start_year_specifier);
  if (!Number.isInteger(ys) || !Number.isInteger(bys) || ys < bys) throw new Error('Year specifier must not precede start year specifier');

  const globalTarget = 2 * (ys - 1) + yss;
  const globalStart = 2 * (bys - 1) + 1;
  if (globalTarget < globalStart) throw new Error('Target semester precedes branch start semester');

  // In this university's compact naming, the numeral represents the global degree semester
  return branchSemesterSpecifierValue(globalTarget);
}

export function weekPatternSpecifier(value = '') {
  const normalized = clean(value).toUpperCase();
  if (normalized === '' || normalized === 'EVERY') return '';
  if (normalized === 'SA' || normalized === 'SB') return normalized;
  throw new Error(`Invalid week pattern: ${value}`);
}

export function sessionKind(value) {
  const normalized = clean(value).toLowerCase();
  const aliases = {
    lecture: 'branch-lecture',
    seminar: 'section-seminar',
    lab: 'cohort-lab-work',
    'branch-lecture': 'branch-lecture',
    'section-seminar': 'section-seminar',
    'cohort-lab-work': 'cohort-lab-work'
  };
  if (!aliases[normalized]) throw new Error(`Invalid session kind: ${value}`);
  return aliases[normalized];
}

export { SESSION_KIND_SCOPES };

function populationForParsed(parsed, sessionKindValue) {
  if (parsed.type === Type.INVALID_REFERENCE) throw new Error(parsed.diagnostics.join('; '));
  const scope = sessionKindValue ? SESSION_KIND_SCOPES[sessionKind(sessionKindValue)] : undefined;
  switch (scope) {
    case 'branch':
      if (parsed.type !== Type.BRANCH_REFERENCE) throw new Error('Branch population must be a branch');
      return freeze({ type: Type.BRANCH_POPULATION, branch: parsed.branch });
    case 'section':
      if (parsed.type !== Type.CLASS_REFERENCE || parsed.class.type !== Type.SECTION_CLASS) throw new Error('Section population must be a section class');
      return freeze({ type: Type.SECTION_POPULATION, class: parsed.class });
    case 'cohort':
      if (parsed.type !== Type.CLASS_REFERENCE || parsed.class.type !== Type.COHORT_CLASS) throw new Error('Cohort population must be a cohort class');
      return freeze({ type: Type.COHORT_POPULATION, class: parsed.class });
    default:
      break;
  }
  switch (parsed.type) {
    case Type.BRANCH_REFERENCE:
      return freeze({ type: Type.BRANCH_POPULATION, branch: parsed.branch });
    case Type.CLASS_REFERENCE:
      switch (parsed.class.type) {
        case Type.SECTION_CLASS:
          return freeze({ type: Type.SECTION_POPULATION, class: parsed.class });
        case Type.COHORT_CLASS:
          return freeze({ type: Type.COHORT_POPULATION, class: parsed.class });
        default:
          throw new Error('Singleton classes require branch scope');
      }
    default:
      throw new Error('Invalid population reference');
  }
}

function inferExpectedReference(reference) {
  const value = clean(reference).toUpperCase();
  return value.includes(' ') || /^[A-Z][A-Z0-9-]*\d+[A-Z]+\d*$/.test(value) ? 'class' : 'branch';
}

export function populationReference({ reference, session_kind, catalogue } = {}) {
  const scope = session_kind ? SESSION_KIND_SCOPES[sessionKind(session_kind)] : undefined;
  const expected = scope === 'branch'
    ? 'branch'
    : scope === 'section' || scope === 'cohort'
      ? 'class'
      : inferExpectedReference(reference);
  const parsed = typeof reference === 'string' ? parseReference(reference, { catalogue, expected }) : reference;
  return populationForParsed(parsed, session_kind);
}

function requiredText(fields, name) {
  const value = clean(fields[name]);
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function sessionSpecifier(fields = {}) {
  if (fields.session_kind === undefined) throw new Error('session_kind is required');
  const normalizedSessionKind = sessionKind(fields.session_kind);
  if (fields.population === undefined) throw new Error('population is required');
  const population = populationReference({ reference: fields.population, session_kind: normalizedSessionKind, catalogue: fields.catalogue });
  const day = requiredText(fields, 'day').toUpperCase();
  const time = requiredText(fields, 'time').toLowerCase();
  if (!DAYS.has(day)) throw new Error(`Invalid day: ${fields.day}`);
  if (!SLOTS.has(time)) throw new Error(`Invalid time: ${fields.time}`);
  return freeze({
    type: Type.SESSION_SPECIFIER,
    subject: requiredText(fields, 'subject'),
    teacher: requiredText(fields, 'teacher'),
    room: requiredText(fields, 'room'),
    population,
    day,
    time,
    week_pattern_specifier: weekPatternSpecifier(fields.week_pattern_specifier),
    session_kind: normalizedSessionKind
  });
}

// ---- Catalogue ----

function toTrackSpecifier(v) {
  if (v?.type === Type.TRACK_SPECIFIER) return v;
  return trackSpecifierValue(v);
}
function toSpecializationSpecifier(v) {
  if (v?.type === Type.SPECIALIZATION_SPECIFIER) return v;
  return specializationSpecifierValue(v);
}

export class Catalogue {
  constructor({
    trackSpecifiers = [],
    specializationSpecifiers = [],
    branchRules = [],
    commonBranchRules = [],
    records = []
  } = {}) {
    this.trackSpecifiers = new Set(trackSpecifiers.map(toTrackSpecifier).map((s) => s.value));
    this.specializationSpecifiers = new Set(specializationSpecifiers.map(toSpecializationSpecifier).map((s) => s.value));
    this._trackSpecifierObjects = new Map(trackSpecifiers.map((v) => { const s = toTrackSpecifier(v); return [s.value, s]; }));
    this._specializationSpecifierObjects = new Map(specializationSpecifiers.map((v) => { const s = toSpecializationSpecifier(v); return [s.value, s]; }));

    this.branchRules = new Map();
    for (const rule of branchRules) {
      const spec = toSpecializationSpecifier(rule.specialization_specifier).value;
      const trackSpec = toTrackSpecifier(rule.track_specifier).value;
      if (!this.specializationSpecifiers.has(spec)) throw new Error(`Unknown specialization specifier: ${spec}`);
      if (!this.trackSpecifiers.has(trackSpec)) throw new Error(`Unknown track specifier: ${trackSpec}`);
      if (this.branchRules.has(spec)) throw new Error(`Duplicate branchRule for specialization: ${spec}`);

      this.branchRules.set(spec, {
        specialization_specifier: this._specializationSpecifierObjects.get(spec),
        track_specifier: this._trackSpecifierObjects.get(trackSpec),
        start_year_specifier: rule.start_year_specifier,
        duration_semesters: rule.duration_semesters,
        populations: new Map(rule.populations.map((p) => [yearSpecifierValue(p.year_specifier).value, p]))
      });
    }

    // Derive track metrics from specialization branches
    this.trackMetrics = new Map();
    for (const ts of this.trackSpecifiers) {
      const ownedBranches = [];
      for (const [, br] of this.branchRules) {
        if (br.track_specifier.value === ts) {
          ownedBranches.push(br);
        }
      }
      if (ownedBranches.length === 0) {
        // Track without specializations (all common)
        this.trackMetrics.set(ts, {
          durationYears: 1,
          trunkDepthYears: 1,
          minStartGlobalSemester: Infinity
        });
        continue;
      }
      let minStartGlobalSemester = Infinity;
      let maxEndGlobalSemester = 0;
      for (const br of ownedBranches) {
        const startGlobal = 2 * (br.start_year_specifier - 1) + 1;
        const endGlobal = startGlobal + br.duration_semesters - 1;
        if (startGlobal < minStartGlobalSemester) minStartGlobalSemester = startGlobal;
        if (endGlobal > maxEndGlobalSemester) maxEndGlobalSemester = endGlobal;
      }

      const trunkDepthYears = Math.floor((minStartGlobalSemester - 1) / 2);
      const durationYears = Math.ceil(maxEndGlobalSemester / 2);

      // Verify Non-Convergence Invariant: no specialization can start within or before the common trunk
      for (const br of ownedBranches) {
        const startGlobal = 2 * (br.start_year_specifier - 1) + 1;
        if (startGlobal <= 2 * trunkDepthYears) {
          throw new Error(
            `Specialization ${br.specialization_specifier.value} starts at semester ${startGlobal} inside common trunk (depth ${trunkDepthYears} years). Branches never merge or co-exist with a common trunk.`
          );
        }
      }

      this.trackMetrics.set(ts, {
        durationYears,
        trunkDepthYears,
        minStartGlobalSemester
      });
    }

    // Process common branch rules and validate against derived trunk
    this.commonBranchRules = new Map();
    for (const rule of commonBranchRules) {
      const ts = toTrackSpecifier(rule.track_specifier).value;
      const ys = yearSpecifierValue(rule.year_specifier).value;
      if (!this.trackSpecifiers.has(ts)) throw new Error(`Unknown track specifier: ${ts}`);
      const metrics = this.trackMetrics.get(ts);
      if (!metrics || ys > metrics.trunkDepthYears) {
        if (!metrics || metrics.trunkDepthYears === 0) {
          throw new Error(`Track ${ts} has no common branch; it starts directly as specializations`);
        }
        throw new Error(`Track ${ts} diverged before year specifier ${ys}; common branch cannot exist`);
      }
      if (!this.commonBranchRules.has(ts)) this.commonBranchRules.set(ts, new Map());
      this.commonBranchRules.get(ts).set(ys, rule);
    }

    // Verify all derived trunk years have a commonBranchRule
    for (const [ts, metrics] of this.trackMetrics) {
      for (let y = 1; y <= metrics.trunkDepthYears; y++) {
        if (!this.commonBranchRules.get(ts)?.has(y)) {
          throw new Error(`Missing commonBranchRule for ${ts} at year specifier ${y}`);
        }
      }
    }

    this.records = records;
    this._cache = null;
  }

  _buildCache() {
    if (this._cache) return this._cache;
    const years = [];
    const branches = []; // common + specialization
    const classes = [];

    // years (derived from track metrics)
    for (const [tsValue, metrics] of this.trackMetrics) {
      const tsObj = this._trackSpecifierObjects.get(tsValue);
      for (let y = 1; y <= metrics.durationYears; y++) {
        const ysObj = yearSpecifierValue(y);
        const yObj = year(this, { track_specifier: tsObj, year_specifier: ysObj });
        years.push(yObj);
      }
    }

    // specialization branches (derived from exact semester count)
    for (const [, br] of this.branchRules) {
      const specObj = br.specialization_specifier;
      const startGlobal = 2 * (br.start_year_specifier - 1) + 1;

      for (let s = 0; s < br.duration_semesters; s++) {
        const globalSem = startGlobal + s;
        const curYear = Math.floor((globalSem - 1) / 2) + 1;
        const curSem = ((globalSem - 1) % 2) + 1;
        const b = branch(this, {
          specialization_specifier: specObj,
          year_specifier: yearSpecifier(curYear),
          year_semester_specifier: yearSemesterSpecifier(curSem)
        });
        branches.push(b);
      }
    }

    // common branches (derived from common trunk)
    for (const [tsValue, metrics] of this.trackMetrics) {
      const tsObj = this._trackSpecifierObjects.get(tsValue);
      for (let y = 1; y <= metrics.trunkDepthYears; y++) {
        const cb = commonBranch(this, { track_specifier: tsObj, year_specifier: yearSpecifierValue(y) });
        branches.push(cb);
      }
    }

    // classes
    const populationSectionsFor = (b) => {
      if (b.type === Type.COMMON_BRANCH) {
        const tsValue = b.year.track_specifier.value;
        const ysValue = b.year.year_specifier.value;
        return this.commonBranchRules.get(tsValue)?.get(ysValue)?.sections ?? null;
      }
      const specValue = b.specialization_specifier.value;
      const ysValue = b.year.year_specifier.value;
      const br = this.branchRules.get(specValue);
      const pop = br?.populations.get(ysValue);
      return pop ? pop.sections : null;
    };

    for (const b of branches) {
      const sections = populationSectionsFor(b);
      if (sections == null) continue;
      if (sections.length === 0) {
        classes.push(classPopulation(this, { branch: b }));
      } else {
        for (const sec of sections) {
          const secSpec = sectionSpecifierValue(sec.section_specifier);
          classes.push(classPopulation(this, { branch: b, section_specifier: secSpec }));
          if (sec.cohorting === twoCohorts) {
            classes.push(classPopulation(this, { branch: b, section_specifier: secSpec, cohort_specifier: cohortSpecifier(1) }));
            classes.push(classPopulation(this, { branch: b, section_specifier: secSpec, cohort_specifier: cohortSpecifier(2) }));
          }
        }
      }
    }

    this._cache = { years, branches, classes };
    return this._cache;
  }

  get years() { return this._buildCache().years; }
  get branches() { return this._buildCache().branches; }
  get classes() { return this._buildCache().classes; }

  matches(parsed) {
    const { years, branches, classes } = this._buildCache();
    switch (parsed.type) {
      case Type.BRANCH_REFERENCE:
        return branches.filter((v) => v.identifier === parsed.branch.identifier);
      case Type.CLASS_REFERENCE:
        return classes.filter((v) => v.identifier === parsed.class.identifier);
      case Type.YEAR_REFERENCE:
        return years.filter((v) => v.identifier === parsed.year.identifier);
      default:
        return [];
    }
  }

  resolve(input, options = {}) {
    const syntax = parseReference(input, {
      catalogue: this,
      expected: options.expected ?? inferExpectedReference(input)
    });
    if (syntax.type === Type.INVALID_REFERENCE) {
      return freeze({
        type: Type.INVALID_RESOLUTION,
        syntax,
        catalogue: freeze({ type: Type.NOT_APPLICABLE }),
        publication: freeze({ type: Type.NOT_APPLICABLE })
      });
    }
    const matches = this.matches(syntax);
    const records = publicationRecords(this.records, syntax, this);
    const publication = records.length === 0
      ? freeze({ type: Type.NO_RECORDS })
      : freeze({ type: Type.RECORDS, records: freeze(records) });
    if (matches.length === 0) {
      return freeze({
        type: Type.NOT_FOUND,
        syntax,
        catalogue: freeze({ type: Type.NOT_FOUND }),
        publication
      });
    }
    if (matches.length > 1) {
      return freeze({
        type: Type.AMBIGUOUS_MATCH,
        syntax,
        catalogue: freeze({ type: Type.AMBIGUOUS_MATCH, matches: freeze(matches) }),
        publication
      });
    }
    return freeze({
      type: Type.UNIQUE_MATCH,
      syntax,
      catalogue: freeze({ type: Type.UNIQUE_MATCH, match: matches[0] }),
      publication
    });
  }
}

// ---- Bottom-up constructors ----

export function year(catalogue, { track_specifier, year_specifier } = {}) {
  const ts = toTrackSpecifier(track_specifier);
  const ys = yearSpecifierValue(year_specifier);
  if (!catalogue.trackSpecifiers.has(ts.value)) throw new Error(`Unknown track specifier: ${ts.value}`);
  const metrics = catalogue.trackMetrics.get(ts.value);
  if (!metrics || ys.value < 1 || ys.value > metrics.durationYears) throw new Error(`Unsupported year: ${ts.value}${ys.value}`);
  return freeze({
    type: Type.YEAR,
    track_specifier: ts,
    year_specifier: ys,
    identifier: `${ts.value}${ys.value}`
  });
}

export function commonBranch(catalogue, { track_specifier, year_specifier } = {}) {
  const ts = toTrackSpecifier(track_specifier);
  const ys = yearSpecifierValue(year_specifier);
  const y = year(catalogue, { track_specifier: ts, year_specifier: ys });
  const metrics = catalogue.trackMetrics.get(ts.value);
  if (!metrics) throw new Error(`Unknown track ${ts.value}`);
  if (ys.value > metrics.trunkDepthYears) {
    if (metrics.trunkDepthYears === 0) {
      throw new Error(`Track ${ts.value} has no common branch; it starts directly as specializations at year specifier 1`);
    }
    throw new Error(`Track ${ts.value} diverged into specializations after year specifier ${metrics.trunkDepthYears}; common branch ${ts.value}${ys.value} cannot exist because branches never merge back`);
  }
  const entry = catalogue.commonBranchRules.get(ts.value)?.get(ys.value);
  if (!entry) throw new Error(`No common branch for ${ts.value}${ys.value}`);
  return freeze({
    type: Type.COMMON_BRANCH,
    year: y,
    identifier: y.identifier
  });
}

export function branch(catalogue, { specialization_specifier, year_specifier, year_semester_specifier } = {}) {
  if (catalogue == null) throw new Error('A branch requires a catalogue');
  const spec = toSpecializationSpecifier(specialization_specifier);
  if (!catalogue.specializationSpecifiers.has(spec.value)) throw new Error(`Unknown specialization specifier: ${spec.value}`);
  const br = catalogue.branchRules.get(spec.value);
  if (!br) throw new Error(`No branch rule for: ${spec.value}`);
  const owner = br.track_specifier.value;
  const ys = yearSpecifierValue(year_specifier);
  const yss = yearSemesterSpecifierValue(year_semester_specifier);

  const globalTarget = 2 * (ys.value - 1) + yss.value;
  const globalStart = 2 * (br.start_year_specifier - 1) + 1;
  const globalEnd = globalStart + br.duration_semesters - 1;

  if (globalTarget < globalStart || globalTarget > globalEnd) {
    throw new Error(`Branch semester ${globalTarget} outside active duration [${globalStart}..${globalEnd}] for ${spec.value}`);
  }

  const semester = branchSemesterFor({
    year_specifier: ys.value,
    year_semester_specifier: yss,
    start_year_specifier: br.start_year_specifier
  });
  const y = year(catalogue, { track_specifier: trackSpecifier(owner), year_specifier: ys });
  return freeze({
    type: Type.SPECIALIZATION_BRANCH,
    specialization_specifier: spec,
    branch_semester_specifier: semester,
    year: y,
    identifier: `${spec.value}${semester.value}`
  });
}

export function classPopulation(catalogue, { branch: branchValue, section_specifier, cohort_specifier } = {}) {
  // accept string branch reference
  let b = branchValue;
  if (typeof b === 'string') {
    const parsed = parseReference(b, { catalogue, expected: 'branch' });
    if (parsed.type !== Type.BRANCH_REFERENCE) throw new Error('Invalid branch reference');
    b = parsed.branch;
  }
  if (!b || (b.type !== Type.COMMON_BRANCH && b.type !== Type.SPECIALIZATION_BRANCH)) throw new Error('Class population needs a branch');

  // determine population sections for this branch/year
  let sections = null;
  if (b.type === Type.COMMON_BRANCH) {
    const tsValue = b.year.track_specifier.value;
    const ysValue = b.year.year_specifier.value;
    sections = catalogue.commonBranchRules.get(tsValue)?.get(ysValue)?.sections ?? null;
  } else {
    const specValue = b.specialization_specifier.value;
    const ysValue = b.year.year_specifier.value;
    const br = catalogue.branchRules.get(specValue);
    const pop = br?.populations.get(ysValue);
    sections = pop ? pop.sections : null;
  }
  if (sections == null) throw new Error('No population rule for branch');

  if (section_specifier === undefined) {
    if (sections.length !== 0) throw new Error('Singleton class only allowed where no sections');
    return freeze({ type: Type.SINGLETON_CLASS, branch: b, identifier: b.identifier });
  }
  const secSpec = sectionSpecifierValue(section_specifier);
  const sectionDescriptor = sections.find((s) => sectionSpecifierValue(s.section_specifier).value === secSpec.value);
  if (!sectionDescriptor) throw new Error(`Invalid section: ${secSpec.value}`);
  if (cohort_specifier === undefined) {
    return freeze({
      type: Type.SECTION_CLASS,
      branch: b,
      section_specifier: secSpec,
      identifier: `${b.identifier} ${secSpec.value}`
    });
  }
  const coh = cohortSpecifierValue(cohort_specifier);
  if (sectionDescriptor.cohorting !== twoCohorts) throw new Error('Cohorts not allowed for this section');
  if (coh.value !== 1 && coh.value !== 2) throw new Error('Cohort must be 1 or 2');
  return freeze({
    type: Type.COHORT_CLASS,
    branch: b,
    section_specifier: secSpec,
    cohort_specifier: coh,
    identifier: `${b.identifier} ${secSpec.value}${coh.value}`
  });
}

// ---- parseReference (catalogue-aware) ----

export function parseReference(input, options = {}) {
  const original = String(input ?? '');
  const value = clean(original).toUpperCase();
  if (!value) return invalid(original, ['Reference is empty']);
  const catalogue = options.catalogue ?? null;
  const commonTracks = catalogue ? new Set(catalogue.trackSpecifiers) : new Set(['LBC','LCE','LCS','MP']);
  const expected = options.expected;
  if (expected !== undefined && !['track-specifier','specialization-specifier','year','branch','class'].includes(expected)) {
    throw new Error(`Invalid expected reference type: ${expected}`);
  }

  const simpleSpecifier = value.match(/^[A-Z][A-Z-]*$/);
  if (simpleSpecifier) {
    const tag = simpleSpecifier[0];
    if (expected === 'track-specifier' || (expected === undefined && commonTracks.has(tag))) {
      if (catalogue && !catalogue.trackSpecifiers.has(tag)) return invalid(original, [`Unknown track specifier: ${tag}`]);
      return trackSpecifierReference(value, trackSpecifierValue(tag));
    }
    if (expected === 'specialization-specifier' || expected === undefined) {
      if (catalogue && !catalogue.specializationSpecifiers.has(tag)) return invalid(original, [`Unknown specifier: ${tag}`]);
      return specializationSpecifierReference(value, specializationSpecifierValue(tag));
    }
    return invalid(original, [`Expected a ${expected} reference, got a specifier reference`]);
  }

  // compact notation GLSI3A2
  const compact = value.match(/^([A-Z][A-Z0-9-]*\d+)([A-Z]+)(\d+)$/);
  const tokens = compact ? [compact[1], compact[2], compact[3]] : value.split(' ');

  // two-token branch form (verbose specialization): "LCS3 GLSI3"
  if (!compact && tokens.length === 2 &&
      /^[A-Z][A-Z0-9-]*\d+$/.test(tokens[0]) &&
      /^[A-Z][A-Z0-9-]*\d+$/.test(tokens[1]) &&
      tokens[1].match(/^([A-Z][A-Z0-9-]*)\d+$/)[1].length > 1) {
    const valueBranch = parseBranchTokens(tokens, { catalogue, commonTracks });
    if (!valueBranch) return invalid(original, ['Malformed branch reference']);
    if (expected === 'class') return invalid(original, ['Expected a class reference, got a branch reference']);
    return branchReference(value, valueBranch);
  }

  let branchTokens = tokens;
  let sectionValue;
  let cohortValue;

  if (compact) {
    branchTokens = [compact[1]];
    sectionValue = compact[2];
    cohortValue = compact[3];
  } else if (tokens.length >= 2 && /^[A-Z]+$/.test(tokens.at(-1))) {
    sectionValue = tokens.at(-1);
    branchTokens = tokens.slice(0, -1);
  } else if (tokens.length >= 2 && /^[A-Z]+\d+$/.test(tokens.at(-1))) {
    const match = tokens.at(-1).match(/^([A-Z]+)(\d+)$/);
    sectionValue = match[1];
    cohortValue = match[2];
    branchTokens = tokens.slice(0, -1);
  } else if (tokens.length === 2 && /^[A-Z]+\d+$/.test(tokens[1])) {
    const match = tokens[1].match(/^([A-Z]+)(\d+)$/);
    sectionValue = match[1];
    cohortValue = match[2];
    branchTokens = [tokens[0]];
  }

  const valueBranch = parseBranchTokens(branchTokens, { catalogue, commonTracks });
  if (!valueBranch) return invalid(original, ['Malformed branch or class reference']);
  if (sectionValue !== undefined) {
    if (expected === 'branch') return invalid(original, ['Expected a branch reference, got a class reference']);
    return classReference(value, classFromBranch(valueBranch, sectionValue, cohortValue));
  }
  if (expected === 'class') {
    return classReference(value, classFromBranch(valueBranch));
  }
  if (expected === 'year') {
    if (valueBranch.type !== Type.COMMON_BRANCH) return invalid(original, ['Expected a year reference, got a branch reference']);
    return yearReference(value, valueBranch.year);
  }
  if (expected === 'track-specifier' || expected === 'specialization-specifier') {
    return invalid(original, [`Expected a ${expected} reference, got a compound reference`]);
  }
  if (expected === 'branch') return branchReference(value, valueBranch);
  switch (valueBranch.type) {
    case Type.COMMON_BRANCH:
      return yearReference(value, valueBranch.year);
    default:
      return branchReference(value, valueBranch);
  }
}

function parseBranchTokens(tokens, options) {
  const catalogue = options.catalogue ?? null;
  const commonTracks = options.commonTracks ?? new Set();
  if (tokens.length === 1) {
    // singleton-style specialization with hyphen: "MP1-EXR" => specialization EXR at year 1
    const singleton = tokens[0].match(/^([A-Z][A-Z0-9-]*)(\d+)-([A-Z][A-Z0-9-]*)$/);
    if (singleton) {
      const trackSpec = singleton[1];
      const year = Number(singleton[2]);
      const spec = singleton[3];
      if (catalogue) {
        if (!catalogue.trackSpecifiers.has(trackSpec)) return undefined;
        if (!catalogue.specializationSpecifiers.has(spec)) return undefined;
        const br = catalogue.branchRules.get(spec);
        if (!br || br.track_specifier.value !== trackSpec) return undefined;
      }
      // derive branch semester at year, semester 1
      let semester = 1;
      if (catalogue) {
        const br = catalogue.branchRules.get(spec);
        if (!br) return undefined;
        const globalStart = 2 * (br.start_year_specifier - 1) + 1;
        const globalTarget = 2 * (year - 1) + 1;
        const globalEnd = globalStart + br.duration_semesters - 1;
        if (globalTarget < globalStart || globalTarget > globalEnd) return undefined;
        semester = globalTarget;
      }
      const tsObj = trackSpecifier(trackSpec);
      const specObj = specializationSpecifier(spec);
      const y = { type: Type.YEAR, track_specifier: tsObj, year_specifier: yearSpecifier(year), identifier: `${trackSpec}${year}` };
      const branchSem = branchSemesterSpecifier(semester);
      return freeze({
        type: Type.SPECIALIZATION_BRANCH,
        specialization_specifier: specObj,
        branch_semester_specifier: branchSem,
        year: y,
        identifier: `${spec}${branchSem.value}`
      });
    }
  }
  if (tokens.length === 2) {
    const prefix = tokens[0].match(/^([A-Z][A-Z0-9-]*)(\d+)$/);
    const specialization = tokens[1].match(/^([A-Z][A-Z0-9-]*)(\d+)$/);
    if (prefix && specialization && specialization[1].length > 1) {
      const trackSpec = prefix[1];
      const yearNum = Number(prefix[2]);
      const spec = specialization[1];
      const semester = Number(specialization[2]);
      if (catalogue) {
        if (!catalogue.trackSpecifiers.has(trackSpec)) return undefined;
        if (!catalogue.specializationSpecifiers.has(spec)) return undefined;
        const br = catalogue.branchRules.get(spec);
        if (!br || br.track_specifier.value !== trackSpec) return undefined;
        const globalStart = 2 * (br.start_year_specifier - 1) + 1;
        const globalEnd = globalStart + br.duration_semesters - 1;
        if (semester < globalStart || semester > globalEnd) return undefined;
        const expectedYear = Math.floor((semester - 1) / 2) + 1;
        if (yearNum !== expectedYear) return undefined;
        const metrics = catalogue.trackMetrics.get(trackSpec);
        if (!metrics || yearNum < 1 || yearNum > metrics.durationYears) return undefined;
      }
      const tsObj = trackSpecifier(trackSpec);
      const ysObj = yearSpecifier(yearNum);
      const y = { type: Type.YEAR, track_specifier: tsObj, year_specifier: ysObj, identifier: `${trackSpec}${yearNum}` };
      return freeze({
        type: Type.SPECIALIZATION_BRANCH,
        specialization_specifier: specializationSpecifier(spec),
        branch_semester_specifier: branchSemesterSpecifier(semester),
        year: y,
        identifier: `${spec}${semester}`
      });
    }
    return undefined;
  }
  if (tokens.length !== 1) return undefined;
  const match = tokens[0].match(/^([A-Z][A-Z0-9-]*)(\d+)$/);
  if (!match) return undefined;
  const tag = match[1];
  const semNum = Number(match[2]);
  // compact specialization branch form: specialization specifier + branch semester (e.g. GLSI3)
  if (catalogue && catalogue.specializationSpecifiers.has(tag)) {
    const br = catalogue.branchRules.get(tag);
    if (br) {
      const globalStart = 2 * (br.start_year_specifier - 1) + 1;
      const globalEnd = globalStart + br.duration_semesters - 1;
      if (semNum >= globalStart && semNum <= globalEnd) {
        const owner = br.track_specifier.value;
        const trackYear = Math.floor((semNum - 1) / 2) + 1;
        const tsObj = trackSpecifier(owner);
        const ysObj = yearSpecifier(trackYear);
        const y = { type: Type.YEAR, track_specifier: tsObj, year_specifier: ysObj, identifier: `${owner}${trackYear}` };
        return freeze({
          type: Type.SPECIALIZATION_BRANCH,
          specialization_specifier: specializationSpecifier(tag),
          branch_semester_specifier: branchSemesterSpecifier(semNum),
          year: y,
          identifier: `${tag}${semNum}`
        });
      }
    }
    return undefined;
  }
  if (commonTracks.has(tag)) {
    // common branch / year (e.g. LCS1)
    if (catalogue && !catalogue.trackSpecifiers.has(tag)) return undefined;
    if (catalogue) {
      const metrics = catalogue.trackMetrics.get(tag);
      if (!metrics || semNum < 1 || semNum > metrics.trunkDepthYears) return undefined;
      const entry = catalogue.commonBranchRules.get(tag)?.get(semNum);
      if (!entry) return undefined;
    }
    const tsObj = trackSpecifier(tag);
    const ysObj = yearSpecifier(semNum);
    const y = { type: Type.YEAR, track_specifier: tsObj, year_specifier: ysObj, identifier: `${tag}${semNum}` };
    return freeze({
      type: Type.COMMON_BRANCH,
      year: y,
      identifier: y.identifier
    });
  }
  // unknown single token with digits: rejected (no sectionless fallback)
  return undefined;
}

function classFromBranch(branchValue, sectionValue, cohortValue) {
  const branch = branchValue;
  if (sectionValue === undefined) {
    return freeze({ type: Type.SINGLETON_CLASS, branch, identifier: branch.identifier });
  }
  const sectionValueObject = sectionSpecifierValue(sectionValue);
  if (cohortValue === undefined) {
    return freeze({
      type: Type.SECTION_CLASS,
      branch,
      section_specifier: sectionValueObject,
      identifier: `${branch.identifier} ${sectionValueObject.value}`
    });
  }
  const cohortValueObject = cohortSpecifierValue(cohortValue);
  return freeze({
    type: Type.COHORT_CLASS,
    branch,
    section_specifier: sectionValueObject,
    cohort_specifier: cohortValueObject,
    identifier: `${branch.identifier} ${sectionValueObject.value}${cohortValueObject.value}`
  });
}

function invalid(input, diagnostics) {
  return freeze({ type: Type.INVALID_REFERENCE, input, diagnostics: freeze(diagnostics) });
}
function trackSpecifierReference(notation, value) {
  return freeze({ type: Type.TRACK_SPECIFIER_REFERENCE, notation, track_specifier: value });
}
function specializationSpecifierReference(notation, value) {
  return freeze({ type: Type.SPECIALIZATION_SPECIFIER_REFERENCE, notation, specialization_specifier: value });
}
function yearReference(notation, value) {
  return freeze({ type: Type.YEAR_REFERENCE, notation, year: value });
}
function branchReference(notation, value) {
  return freeze({ type: Type.BRANCH_REFERENCE, notation, branch: value });
}
function classReference(notation, value) {
  return freeze({ type: Type.CLASS_REFERENCE, notation, class: value });
}

// ---- CSV ----

function csvRecord(record = {}) {
  const fields = ['field', 'professor', 'subject', 'room', 'day', 'time', 'week', 'source', 'color'];
  return freeze(Object.fromEntries(fields.map((field) => [field, clean(record[field])])));
}

function provenance(record) {
  if (!record.source && !record.color) return freeze({ type: Type.PROVENANCE, source: '', color: '' });
  return freeze({ type: Type.PROVENANCE, source: record.source, color: record.color });
}

// Publication notation, e.g. `LBC2-BI_A Groupe 1`, `LBC1-A`, `MP1-EXR`.
// Returns the canonical reference, or null when the field is not in that shape.
function sourceFieldReference(field, catalogue) {
  const matched = clean(field).toUpperCase().match(
    /^([A-Z][A-Z0-9-]*?)(\d+)-(.+?)(?:\s+GROUPE\s+(\d+))?$/
  );
  if (!matched) return null;
  const [, track, yearText, rest] = matched;
  const cohort = matched[4];
  const parts = rest.match(/^(?:([A-Z][A-Z0-9-]*)_)?([A-Z]+)$/);
  if (!parts) return null;
  let specification = parts[1];
  let section = parts[2];
  if (specification === undefined) {
    const rule = catalogue.branchRules.get(rest);
    if (rule && rule.track_specifier.value === track) {
      specification = rest;
      section = undefined;
    }
  }
  const year = Number(yearText);
  const branchIdentifier = specification === undefined
    ? commonBranch(catalogue, { track_specifier: track, year_specifier: year }).identifier
    : branch(catalogue, {
      specialization_specifier: specification,
      year_specifier: year,
      year_semester_specifier: 1
    }).identifier;
  return section === undefined ? branchIdentifier : `${branchIdentifier} ${section}${cohort ?? ''}`;
}

function csvFieldReference(field, catalogue) {
  if (catalogue) {
    const source = sourceFieldReference(field, catalogue);
    if (source) return source;
  }
  const singletonNotation = /^[A-Z][A-Z0-9-]*\d+-[A-Z][A-Z-]*$/i.test(field);
  const normalizedField = (singletonNotation ? field : field.replace(/-([A-Z])/, ' $1'))
    .replace(/\s+GROUPE\s+/i, ' ');
  const match = normalizedField.match(/^(.+?)\s+([A-Z]+)(?:\s+(\d+))?$/);
  return match ? `${match[1]} ${match[2]}${match[3] ?? ''}` : normalizedField;
}

export function fromCsvRecord(record, { catalogue } = {}) {
  const raw = csvRecord(record);
  const errors = [];
  for (const field of ['field', 'subject', 'professor', 'room', 'day', 'time']) {
    if (!raw[field]) errors.push(`${field} is required`);
  }
  let population;
  let reference = raw.field;
  if (raw.field) {
    try {
      reference = csvFieldReference(raw.field, catalogue);
      population = populationReference({ reference, catalogue, session_kind: undefined });
    } catch (error) {
      errors.push(error.message);
    }
  }
  try {
    weekPatternSpecifier(raw.week);
  } catch (error) {
    errors.push(error.message);
  }
  if (errors.length > 0) return freeze({ type: Type.INVALID_CSV_RECORD, record: raw, errors: freeze(errors) });
  return freeze({
    type: Type.PARTIAL_SESSION_RECORD,
    subject: raw.subject,
    teacher: raw.professor,
    room: raw.room,
    day: raw.day.toUpperCase(),
    time: raw.time.toLowerCase(),
    week_pattern_specifier: weekPatternSpecifier(raw.week),
    population,
    reference,
    provenance: provenance(raw),
    missing: freeze(['session_kind'])
  });
}

// ---- publication records filter ----

function publicationRecords(records, syntax, catalogue) {
  const targetBranchIdentifier = syntax.type === Type.BRANCH_REFERENCE
    ? syntax.branch.identifier
    : syntax.class.branch.identifier;
  return (records ?? []).filter((record) => {
    let parsed;
    try {
      const ref = record.reference;
      const pop = record.population;
      if (pop?.type === Type.BRANCH_POPULATION) parsed = branchReference(record.reference, pop.branch);
      else if (pop?.type === Type.SECTION_POPULATION) parsed = classReference(record.reference, pop.class);
      else if (pop?.type === Type.COHORT_POPULATION) parsed = classReference(record.reference, pop.class);
      else parsed = parseReference(record.reference, { catalogue, expected: 'branch' });
    } catch (e) {
      return false;
    }
    switch (parsed.type) {
      case Type.INVALID_REFERENCE:
        return false;
      case Type.BRANCH_REFERENCE:
        return parsed.branch.identifier === targetBranchIdentifier;
      case Type.CLASS_REFERENCE:
        return parsed.class.branch.identifier === targetBranchIdentifier &&
          (syntax.type === Type.BRANCH_REFERENCE || parsed.class.identifier === syntax.class.identifier);
      default:
        return false;
    }
  });
}

// ---- query helpers ----

export function queryBranches(catalogue, predicate = () => true) {
  return catalogue.branches.filter(predicate);
}
export function queryClasses(catalogue, predicate = () => true) {
  return (catalogue.classes ?? []).filter(predicate);
}
export function queryRecords(records, filters = {}) {
  return (records ?? []).filter((record) => Object.entries(filters).every(([key, value]) => record[key] === value));
}

export { DAYS, SLOTS };

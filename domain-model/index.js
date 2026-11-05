const DAYS = new Set(['LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI']);
const SLOTS = new Set(['08h15-09h45', '10h00-11h30', '11h40-13h10', '13h20-14h50', '15h00-16h30', '16h45-18h15']);
const SESSION_KIND_SCOPES = Object.freeze({
  'specialty-lecture': 'specialty',
  'section-seminar': 'section',
  'cohort-lab-work': 'cohort'
});

export const Type = Object.freeze({
  TRACK_SPECIFIER: Symbol('track-specifier'),
  YEAR_SPECIFIER: Symbol('year-specifier'),
  SPECIALTY_SPECIFIER: Symbol('specialty-specifier'),
  YEAR_SEMESTER_SPECIFIER: Symbol('year-semester-specifier'),
  SPECIALTY_SEMESTER_SPECIFIER: Symbol('specialty-semester-specifier'),
  SECTION_SPECIFIER: Symbol('section-specifier'),
  COHORT_SPECIFIER: Symbol('cohort-specifier'),
  YEAR: Symbol('year'),
  COMMON_SPECIALTY: Symbol('common-specialty'),
  SPECIALTY: Symbol('specialty'),
  SECTION_CLASS: Symbol('section-class'),
  COHORT_CLASS: Symbol('cohort-class'),
  SINGLETON_CLASS: Symbol('singleton-class'),
  INVALID_REFERENCE: Symbol('invalid-reference'),
  TRACK_SPECIFIER_REFERENCE: Symbol('track-specifier-reference'),
  SPECIALTY_SPECIFIER_REFERENCE: Symbol('specialty-specifier-reference'),
  YEAR_REFERENCE: Symbol('year-reference'),
  SPECIALTY_REFERENCE: Symbol('specialty-reference'),
  CLASS_REFERENCE: Symbol('class-reference'),
  SPECIALTY_POPULATION: Symbol('specialty-population'),
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
  COMMON_SPECIALTY_RULE: Symbol('common-specialty-rule'),
  SPECIALTY_RULE: Symbol('specialty-rule')
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
function specialtySpecifierValue(value) {
  if (value?.type === Type.SPECIALTY_SPECIFIER) return value;
  const normalized = clean(value).toUpperCase();
  if (!/^[A-Z][A-Z0-9-]*$/.test(normalized)) throw new Error(`Invalid specialty specifier: ${value}`);
  return freeze({ type: Type.SPECIALTY_SPECIFIER, value: normalized });
}
function yearSemesterSpecifierValue(value) {
  if (value?.type === Type.YEAR_SEMESTER_SPECIFIER) return value;
  const number = Number(value);
  if (number !== 1 && number !== 2) throw new Error('Year semester specifier must be 1 or 2');
  return freeze({ type: Type.YEAR_SEMESTER_SPECIFIER, value: number });
}
function specialtySemesterSpecifierValue(value) {
  if (value?.type === Type.SPECIALTY_SEMESTER_SPECIFIER) return value;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) throw new Error('Specialty semester specifier must be positive');
  return freeze({ type: Type.SPECIALTY_SEMESTER_SPECIFIER, value: number });
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
export function specialtySpecifier(value) { return specialtySpecifierValue(value); }
export function yearSemesterSpecifier(value) { return yearSemesterSpecifierValue(value); }
export function specialtySemesterSpecifier(value) { return specialtySemesterSpecifierValue(value); }
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

export function commonSpecialtyRule({ track_specifier, year_specifier, sections } = {}) {
  const ts = trackSpecifierValue(track_specifier);
  const ys = yearSpecifierValue(year_specifier);
  return freeze({
    type: Type.COMMON_SPECIALTY_RULE,
    track_specifier: ts,
    year_specifier: ys,
    sections: normalizeSections(sections ?? [])
  });
}

export function specialtyRule({
  specialty_specifier,
  track_specifier,
  start_year_specifier,
  duration_semesters,
  populations
} = {}) {
  const specialtySpec = specialtySpecifierValue(specialty_specifier);
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
    type: Type.SPECIALTY_RULE,
    specialty_specifier: specialtySpec,
    track_specifier: trackSpec,
    start_year_specifier: startYear,
    duration_semesters: durSem,
    populations: freeze(normalizedPopulations)
  });
}

export function specialtySemesterFor({
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
  if (globalTarget < globalStart) throw new Error('Target semester precedes specialty start semester');

  // In this university's compact naming, the numeral represents the global degree semester
  return specialtySemesterSpecifierValue(globalTarget);
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
    lecture: 'specialty-lecture',
    seminar: 'section-seminar',
    lab: 'cohort-lab-work',
    'specialty-lecture': 'specialty-lecture',
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
    case 'specialty':
      if (parsed.type !== Type.SPECIALTY_REFERENCE) throw new Error('Specialty population must be a specialty');
      return freeze({ type: Type.SPECIALTY_POPULATION, specialty: parsed.specialty });
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
    case Type.SPECIALTY_REFERENCE:
      return freeze({ type: Type.SPECIALTY_POPULATION, specialty: parsed.specialty });
    case Type.CLASS_REFERENCE:
      switch (parsed.class.type) {
        case Type.SECTION_CLASS:
          return freeze({ type: Type.SECTION_POPULATION, class: parsed.class });
        case Type.COHORT_CLASS:
          return freeze({ type: Type.COHORT_POPULATION, class: parsed.class });
        default:
          throw new Error('Singleton classes require specialty scope');
      }
    default:
      throw new Error('Invalid population reference');
  }
}

function inferExpectedReference(reference) {
  const value = clean(reference).toUpperCase();
  return value.includes(' ') || /^[A-Z][A-Z0-9-]*\d+[A-Z]+\d*$/.test(value) ? 'class' : 'specialty';
}

export function populationReference({ reference, session_kind, catalogue } = {}) {
  const scope = session_kind ? SESSION_KIND_SCOPES[sessionKind(session_kind)] : undefined;
  const expected = scope === 'specialty'
    ? 'specialty'
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
function toSpecialtySpecifier(v) {
  if (v?.type === Type.SPECIALTY_SPECIFIER) return v;
  return specialtySpecifierValue(v);
}

export class Catalogue {
  constructor({
    trackSpecifiers = [],
    specialtySpecifiers = [],
    specialtyRules = [],
    commonSpecialtyRules = [],
    records = []
  } = {}) {
    this.trackSpecifiers = new Set(trackSpecifiers.map(toTrackSpecifier).map((s) => s.value));
    this.specialtySpecifiers = new Set(specialtySpecifiers.map(toSpecialtySpecifier).map((s) => s.value));
    this._trackSpecifierObjects = new Map(trackSpecifiers.map((v) => { const s = toTrackSpecifier(v); return [s.value, s]; }));
    this._specialtySpecifierObjects = new Map(specialtySpecifiers.map((v) => { const s = toSpecialtySpecifier(v); return [s.value, s]; }));

    this.specialtyRules = new Map();
    for (const rule of specialtyRules) {
      const specialtyTag = toSpecialtySpecifier(rule.specialty_specifier).value;
      const trackSpec = toTrackSpecifier(rule.track_specifier).value;
      if (!this.specialtySpecifiers.has(specialtyTag)) throw new Error(`Unknown specialty specifier: ${specialtyTag}`);
      if (!this.trackSpecifiers.has(trackSpec)) throw new Error(`Unknown track specifier: ${trackSpec}`);
      if (this.specialtyRules.has(specialtyTag)) throw new Error(`Duplicate specialtyRule for specialty: ${specialtyTag}`);

      this.specialtyRules.set(specialtyTag, {
        specialty_specifier: this._specialtySpecifierObjects.get(specialtyTag),
        track_specifier: this._trackSpecifierObjects.get(trackSpec),
        start_year_specifier: rule.start_year_specifier,
        duration_semesters: rule.duration_semesters,
        populations: new Map(rule.populations.map((p) => [yearSpecifierValue(p.year_specifier).value, p]))
      });
    }

    // Derive track metrics from specialty rules
    this.trackMetrics = new Map();
    for (const ts of this.trackSpecifiers) {
      const ownedSpecialtyRules = [];
      for (const [, rule] of this.specialtyRules) {
        if (rule.track_specifier.value === ts) {
          ownedSpecialtyRules.push(rule);
        }
      }
      if (ownedSpecialtyRules.length === 0) {
        // Track without specialties (all common)
        this.trackMetrics.set(ts, {
          durationYears: 1,
          trunkDepthYears: 1,
          minStartGlobalSemester: Infinity
        });
        continue;
      }
      let minStartGlobalSemester = Infinity;
      let maxEndGlobalSemester = 0;
      for (const rule of ownedSpecialtyRules) {
        const startGlobal = 2 * (rule.start_year_specifier - 1) + 1;
        const endGlobal = startGlobal + rule.duration_semesters - 1;
        if (startGlobal < minStartGlobalSemester) minStartGlobalSemester = startGlobal;
        if (endGlobal > maxEndGlobalSemester) maxEndGlobalSemester = endGlobal;
      }

      const trunkDepthYears = Math.floor((minStartGlobalSemester - 1) / 2);
      const durationYears = Math.ceil(maxEndGlobalSemester / 2);

      // Verify Non-Convergence Invariant: no specialty can start within or before the common trunk
      for (const rule of ownedSpecialtyRules) {
        const startGlobal = 2 * (rule.start_year_specifier - 1) + 1;
        if (startGlobal <= 2 * trunkDepthYears) {
          throw new Error(
            `Specialty ${rule.specialty_specifier.value} starts at semester ${startGlobal} inside common trunk (depth ${trunkDepthYears} years). Specialties never merge or co-exist with a common trunk.`
          );
        }
      }

      this.trackMetrics.set(ts, {
        durationYears,
        trunkDepthYears,
        minStartGlobalSemester
      });
    }

    // Process common specialty rules and validate against derived trunk
    this.commonSpecialtyRules = new Map();
    for (const rule of commonSpecialtyRules) {
      const ts = toTrackSpecifier(rule.track_specifier).value;
      const ys = yearSpecifierValue(rule.year_specifier).value;
      if (!this.trackSpecifiers.has(ts)) throw new Error(`Unknown track specifier: ${ts}`);
      const metrics = this.trackMetrics.get(ts);
      if (!metrics || ys > metrics.trunkDepthYears) {
        if (!metrics || metrics.trunkDepthYears === 0) {
          throw new Error(`Track ${ts} has no common specialty; it starts directly as specialties`);
        }
        throw new Error(`Track ${ts} diverged before year specifier ${ys}; common specialty cannot exist`);
      }
      if (!this.commonSpecialtyRules.has(ts)) this.commonSpecialtyRules.set(ts, new Map());
      this.commonSpecialtyRules.get(ts).set(ys, rule);
    }

    // Verify all derived trunk years have a commonSpecialtyRule
    for (const [ts, metrics] of this.trackMetrics) {
      for (let y = 1; y <= metrics.trunkDepthYears; y++) {
        if (!this.commonSpecialtyRules.get(ts)?.has(y)) {
          throw new Error(`Missing commonSpecialtyRule for ${ts} at year specifier ${y}`);
        }
      }
    }

    this.records = records;
    this._cache = null;
  }

  _buildCache() {
    if (this._cache) return this._cache;
    const years = [];
    const specialties = []; // common and non-common
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

    // specialties (derived from exact semester count)
    for (const [, rule] of this.specialtyRules) {
      const specialtySpec = rule.specialty_specifier;
      const startGlobal = 2 * (rule.start_year_specifier - 1) + 1;

      for (let s = 0; s < rule.duration_semesters; s++) {
        const globalSem = startGlobal + s;
        const curYear = Math.floor((globalSem - 1) / 2) + 1;
        const curSem = ((globalSem - 1) % 2) + 1;
        const node = specialty(this, {
          specialty_specifier: specialtySpec,
          year_specifier: yearSpecifier(curYear),
          year_semester_specifier: yearSemesterSpecifier(curSem)
        });
        specialties.push(node);
      }
    }

    // common specialties (derived from common trunk)
    for (const [tsValue, metrics] of this.trackMetrics) {
      const tsObj = this._trackSpecifierObjects.get(tsValue);
      for (let y = 1; y <= metrics.trunkDepthYears; y++) {
        const commonNode = commonSpecialty(this, { track_specifier: tsObj, year_specifier: yearSpecifierValue(y) });
        specialties.push(commonNode);
      }
    }

    // classes
    const populationSectionsFor = (node) => {
      if (node.type === Type.COMMON_SPECIALTY) {
        const tsValue = node.year.track_specifier.value;
        const ysValue = node.year.year_specifier.value;
        return this.commonSpecialtyRules.get(tsValue)?.get(ysValue)?.sections ?? null;
      }
      const specialtyTag = node.specialty_specifier.value;
      const ysValue = node.year.year_specifier.value;
      const rule = this.specialtyRules.get(specialtyTag);
      const pop = rule?.populations.get(ysValue);
      return pop ? pop.sections : null;
    };

    for (const node of specialties) {
      const sections = populationSectionsFor(node);
      if (sections == null) continue;
      if (sections.length === 0) {
        classes.push(classPopulation(this, { specialty: node }));
      } else {
        for (const sec of sections) {
          const secSpec = sectionSpecifierValue(sec.section_specifier);
          classes.push(classPopulation(this, { specialty: node, section_specifier: secSpec }));
          if (sec.cohorting === twoCohorts) {
            classes.push(classPopulation(this, { specialty: node, section_specifier: secSpec, cohort_specifier: cohortSpecifier(1) }));
            classes.push(classPopulation(this, { specialty: node, section_specifier: secSpec, cohort_specifier: cohortSpecifier(2) }));
          }
        }
      }
    }

    this._cache = { years, specialties, classes };
    return this._cache;
  }

  get years() { return this._buildCache().years; }
  get specialties() { return this._buildCache().specialties; }
  get classes() { return this._buildCache().classes; }

  matches(parsed) {
    const { years, specialties, classes } = this._buildCache();
    switch (parsed.type) {
      case Type.SPECIALTY_REFERENCE:
        return specialties.filter((v) => v.identifier === parsed.specialty.identifier);
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

export function commonSpecialty(catalogue, { track_specifier, year_specifier } = {}) {
  const ts = toTrackSpecifier(track_specifier);
  const ys = yearSpecifierValue(year_specifier);
  const y = year(catalogue, { track_specifier: ts, year_specifier: ys });
  const metrics = catalogue.trackMetrics.get(ts.value);
  if (!metrics) throw new Error(`Unknown track ${ts.value}`);
  if (ys.value > metrics.trunkDepthYears) {
    if (metrics.trunkDepthYears === 0) {
      throw new Error(`Track ${ts.value} has no common specialty; it starts directly as specialties at year specifier 1`);
    }
    throw new Error(`Track ${ts.value} diverged into specialties after year specifier ${metrics.trunkDepthYears}; common specialty ${ts.value}${ys.value} cannot exist because specialties never merge back`);
  }
  const entry = catalogue.commonSpecialtyRules.get(ts.value)?.get(ys.value);
  if (!entry) throw new Error(`No common specialty for ${ts.value}${ys.value}`);
  return freeze({
    type: Type.COMMON_SPECIALTY,
    year: y,
    identifier: y.identifier
  });
}

export function specialty(catalogue, { specialty_specifier, year_specifier, year_semester_specifier } = {}) {
  if (catalogue == null) throw new Error('A specialty requires a catalogue');
  const specialtySpec = toSpecialtySpecifier(specialty_specifier);
  if (!catalogue.specialtySpecifiers.has(specialtySpec.value)) throw new Error(`Unknown specialty specifier: ${specialtySpec.value}`);
  const rule = catalogue.specialtyRules.get(specialtySpec.value);
  if (!rule) throw new Error(`No specialty rule for: ${specialtySpec.value}`);
  const owner = rule.track_specifier.value;
  const ys = yearSpecifierValue(year_specifier);
  const yss = yearSemesterSpecifierValue(year_semester_specifier);

  const globalTarget = 2 * (ys.value - 1) + yss.value;
  const globalStart = 2 * (rule.start_year_specifier - 1) + 1;
  const globalEnd = globalStart + rule.duration_semesters - 1;

  if (globalTarget < globalStart || globalTarget > globalEnd) {
    throw new Error(`Specialty semester ${globalTarget} outside active duration [${globalStart}..${globalEnd}] for ${specialtySpec.value}`);
  }

  const semester = specialtySemesterFor({
    year_specifier: ys.value,
    year_semester_specifier: yss,
    start_year_specifier: rule.start_year_specifier
  });
  const y = year(catalogue, { track_specifier: trackSpecifier(owner), year_specifier: ys });
  return freeze({
    type: Type.SPECIALTY,
    specialty_specifier: specialtySpec,
    specialty_semester_specifier: semester,
    year: y,
    identifier: `${specialtySpec.value}${semester.value}`
  });
}

export function classPopulation(catalogue, { specialty: specialtyValue, section_specifier, cohort_specifier } = {}) {
  // accept string specialty reference
  let node = specialtyValue;
  if (typeof node === 'string') {
    const parsed = parseReference(node, { catalogue, expected: 'specialty' });
    if (parsed.type !== Type.SPECIALTY_REFERENCE) throw new Error('Invalid specialty reference');
    node = parsed.specialty;
  }
  if (!node || (node.type !== Type.COMMON_SPECIALTY && node.type !== Type.SPECIALTY)) throw new Error('Class population needs a specialty');

  // determine population sections for this specialty/year
  let sections = null;
  if (node.type === Type.COMMON_SPECIALTY) {
    const tsValue = node.year.track_specifier.value;
    const ysValue = node.year.year_specifier.value;
    sections = catalogue.commonSpecialtyRules.get(tsValue)?.get(ysValue)?.sections ?? null;
  } else {
    const specialtyTag = node.specialty_specifier.value;
    const ysValue = node.year.year_specifier.value;
    const rule = catalogue.specialtyRules.get(specialtyTag);
    const pop = rule?.populations.get(ysValue);
    sections = pop ? pop.sections : null;
  }
  if (sections == null) throw new Error('No population rule for specialty');

  if (section_specifier === undefined) {
    if (sections.length !== 0) throw new Error('Singleton class only allowed where no sections');
    return freeze({ type: Type.SINGLETON_CLASS, specialty: node, identifier: node.identifier });
  }
  const secSpec = sectionSpecifierValue(section_specifier);
  const sectionDescriptor = sections.find((s) => sectionSpecifierValue(s.section_specifier).value === secSpec.value);
  if (!sectionDescriptor) throw new Error(`Invalid section: ${secSpec.value}`);
  if (cohort_specifier === undefined) {
    return freeze({
      type: Type.SECTION_CLASS,
      specialty: node,
      section_specifier: secSpec,
      identifier: `${node.identifier} ${secSpec.value}`
    });
  }
  const coh = cohortSpecifierValue(cohort_specifier);
  if (sectionDescriptor.cohorting !== twoCohorts) throw new Error('Cohorts not allowed for this section');
  if (coh.value !== 1 && coh.value !== 2) throw new Error('Cohort must be 1 or 2');
  return freeze({
    type: Type.COHORT_CLASS,
    specialty: node,
    section_specifier: secSpec,
    cohort_specifier: coh,
    identifier: `${node.identifier} ${secSpec.value}${coh.value}`
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
  if (expected !== undefined && !['track-specifier','specialty-specifier','year','specialty','class'].includes(expected)) {
    throw new Error(`Invalid expected reference type: ${expected}`);
  }

  const simpleSpecifier = value.match(/^[A-Z][A-Z-]*$/);
  if (simpleSpecifier) {
    const tag = simpleSpecifier[0];
    if (expected === 'track-specifier' || (expected === undefined && commonTracks.has(tag))) {
      if (catalogue && !catalogue.trackSpecifiers.has(tag)) return invalid(original, [`Unknown track specifier: ${tag}`]);
      return trackSpecifierReference(value, trackSpecifierValue(tag));
    }
    if (expected === 'specialty-specifier' || expected === undefined) {
      if (catalogue && !catalogue.specialtySpecifiers.has(tag)) return invalid(original, [`Unknown specifier: ${tag}`]);
      return specialtySpecifierReference(value, specialtySpecifierValue(tag));
    }
    return invalid(original, [`Expected a ${expected} reference, got a specifier reference`]);
  }

  // compact notation GLSI3A2
  const compact = value.match(/^([A-Z][A-Z0-9-]*\d+)([A-Z]+)(\d+)$/);
  const tokens = compact ? [compact[1], compact[2], compact[3]] : value.split(' ');

  // two-token specialty form (verbose specialty): "LCS3 GLSI3"
  if (!compact && tokens.length === 2 &&
      /^[A-Z][A-Z0-9-]*\d+$/.test(tokens[0]) &&
      /^[A-Z][A-Z0-9-]*\d+$/.test(tokens[1]) &&
      tokens[1].match(/^([A-Z][A-Z0-9-]*)\d+$/)[1].length > 1) {
    const valueSpecialty = parseSpecialtyTokens(tokens, { catalogue, commonTracks });
    if (!valueSpecialty) return invalid(original, ['Malformed specialty reference']);
    if (expected === 'class') return invalid(original, ['Expected a class reference, got a specialty reference']);
    return specialtyReference(value, valueSpecialty);
  }

  let specialtyTokens = tokens;
  let sectionValue;
  let cohortValue;

  if (compact) {
    specialtyTokens = [compact[1]];
    sectionValue = compact[2];
    cohortValue = compact[3];
  } else if (tokens.length >= 2 && /^[A-Z]+$/.test(tokens.at(-1))) {
    sectionValue = tokens.at(-1);
    specialtyTokens = tokens.slice(0, -1);
  } else if (tokens.length >= 2 && /^[A-Z]+\d+$/.test(tokens.at(-1))) {
    const match = tokens.at(-1).match(/^([A-Z]+)(\d+)$/);
    sectionValue = match[1];
    cohortValue = match[2];
    specialtyTokens = tokens.slice(0, -1);
  } else if (tokens.length === 2 && /^[A-Z]+\d+$/.test(tokens[1])) {
    const match = tokens[1].match(/^([A-Z]+)(\d+)$/);
    sectionValue = match[1];
    cohortValue = match[2];
    specialtyTokens = [tokens[0]];
  }

  const valueSpecialty = parseSpecialtyTokens(specialtyTokens, { catalogue, commonTracks });
  if (!valueSpecialty) return invalid(original, ['Malformed specialty or class reference']);
  if (sectionValue !== undefined) {
    if (expected === 'specialty') return invalid(original, ['Expected a specialty reference, got a class reference']);
    return classReference(value, classFromSpecialty(valueSpecialty, sectionValue, cohortValue));
  }
  if (expected === 'class') {
    return classReference(value, classFromSpecialty(valueSpecialty));
  }
  if (expected === 'year') {
    if (valueSpecialty.type !== Type.COMMON_SPECIALTY) return invalid(original, ['Expected a year reference, got a specialty reference']);
    return yearReference(value, valueSpecialty.year);
  }
  if (expected === 'track-specifier' || expected === 'specialty-specifier') {
    return invalid(original, [`Expected a ${expected} reference, got a compound reference`]);
  }
  if (expected === 'specialty') return specialtyReference(value, valueSpecialty);
  switch (valueSpecialty.type) {
    case Type.COMMON_SPECIALTY:
      return yearReference(value, valueSpecialty.year);
    default:
      return specialtyReference(value, valueSpecialty);
  }
}

function parseSpecialtyTokens(tokens, options) {
  const catalogue = options.catalogue ?? null;
  const commonTracks = options.commonTracks ?? new Set();
  if (tokens.length === 1) {
    // singleton-style specialty with hyphen: "MP1-EXR" => specialty EXR at year 1
    const singleton = tokens[0].match(/^([A-Z][A-Z0-9-]*)(\d+)-([A-Z][A-Z0-9-]*)$/);
    if (singleton) {
      const trackSpec = singleton[1];
      const year = Number(singleton[2]);
      const specialtyTag = singleton[3];
      if (catalogue) {
        if (!catalogue.trackSpecifiers.has(trackSpec)) return undefined;
        if (!catalogue.specialtySpecifiers.has(specialtyTag)) return undefined;
        const rule = catalogue.specialtyRules.get(specialtyTag);
        if (!rule || rule.track_specifier.value !== trackSpec) return undefined;
      }
      // derive specialty semester at year, semester 1
      let semester = 1;
      if (catalogue) {
        const rule = catalogue.specialtyRules.get(specialtyTag);
        if (!rule) return undefined;
        const globalStart = 2 * (rule.start_year_specifier - 1) + 1;
        const globalTarget = 2 * (year - 1) + 1;
        const globalEnd = globalStart + rule.duration_semesters - 1;
        if (globalTarget < globalStart || globalTarget > globalEnd) return undefined;
        semester = globalTarget;
      }
      const tsObj = trackSpecifier(trackSpec);
      const specialtySpec = specialtySpecifier(specialtyTag);
      const y = { type: Type.YEAR, track_specifier: tsObj, year_specifier: yearSpecifier(year), identifier: `${trackSpec}${year}` };
      const specialtySemester = specialtySemesterSpecifier(semester);
      return freeze({
        type: Type.SPECIALTY,
        specialty_specifier: specialtySpec,
        specialty_semester_specifier: specialtySemester,
        year: y,
        identifier: `${specialtyTag}${specialtySemester.value}`
      });
    }
  }
  if (tokens.length === 2) {
    const prefix = tokens[0].match(/^([A-Z][A-Z0-9-]*)(\d+)$/);
    const specialtyMatch = tokens[1].match(/^([A-Z][A-Z0-9-]*)(\d+)$/);
    if (prefix && specialtyMatch && specialtyMatch[1].length > 1) {
      const trackSpec = prefix[1];
      const yearNum = Number(prefix[2]);
      const specialtyTag = specialtyMatch[1];
      const semester = Number(specialtyMatch[2]);
      if (catalogue) {
        if (!catalogue.trackSpecifiers.has(trackSpec)) return undefined;
        if (!catalogue.specialtySpecifiers.has(specialtyTag)) return undefined;
        const rule = catalogue.specialtyRules.get(specialtyTag);
        if (!rule || rule.track_specifier.value !== trackSpec) return undefined;
        const globalStart = 2 * (rule.start_year_specifier - 1) + 1;
        const globalEnd = globalStart + rule.duration_semesters - 1;
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
        type: Type.SPECIALTY,
        specialty_specifier: specialtySpecifier(specialtyTag),
        specialty_semester_specifier: specialtySemesterSpecifier(semester),
        year: y,
        identifier: `${specialtyTag}${semester}`
      });
    }
    return undefined;
  }
  if (tokens.length !== 1) return undefined;
  const match = tokens[0].match(/^([A-Z][A-Z0-9-]*)(\d+)$/);
  if (!match) return undefined;
  const tag = match[1];
  const semNum = Number(match[2]);
  // compact specialty form: specialty specifier + specialty semester (e.g. GLSI3)
  if (catalogue && catalogue.specialtySpecifiers.has(tag)) {
    const rule = catalogue.specialtyRules.get(tag);
    if (rule) {
      const globalStart = 2 * (rule.start_year_specifier - 1) + 1;
      const globalEnd = globalStart + rule.duration_semesters - 1;
      if (semNum >= globalStart && semNum <= globalEnd) {
        const owner = rule.track_specifier.value;
        const trackYear = Math.floor((semNum - 1) / 2) + 1;
        const tsObj = trackSpecifier(owner);
        const ysObj = yearSpecifier(trackYear);
        const y = { type: Type.YEAR, track_specifier: tsObj, year_specifier: ysObj, identifier: `${owner}${trackYear}` };
        return freeze({
          type: Type.SPECIALTY,
          specialty_specifier: specialtySpecifier(tag),
          specialty_semester_specifier: specialtySemesterSpecifier(semNum),
          year: y,
          identifier: `${tag}${semNum}`
        });
      }
    }
    return undefined;
  }
  if (commonTracks.has(tag)) {
    // common specialty / year (e.g. LCS1)
    if (catalogue && !catalogue.trackSpecifiers.has(tag)) return undefined;
    if (catalogue) {
      const metrics = catalogue.trackMetrics.get(tag);
      if (!metrics || semNum < 1 || semNum > metrics.trunkDepthYears) return undefined;
      const entry = catalogue.commonSpecialtyRules.get(tag)?.get(semNum);
      if (!entry) return undefined;
    }
    const tsObj = trackSpecifier(tag);
    const ysObj = yearSpecifier(semNum);
    const y = { type: Type.YEAR, track_specifier: tsObj, year_specifier: ysObj, identifier: `${tag}${semNum}` };
    return freeze({
      type: Type.COMMON_SPECIALTY,
      year: y,
      identifier: y.identifier
    });
  }
  // unknown single token with digits: rejected (no sectionless fallback)
  return undefined;
}

function classFromSpecialty(specialtyValue, sectionValue, cohortValue) {
  const node = specialtyValue;
  if (sectionValue === undefined) {
    return freeze({ type: Type.SINGLETON_CLASS, specialty: node, identifier: node.identifier });
  }
  const sectionValueObject = sectionSpecifierValue(sectionValue);
  if (cohortValue === undefined) {
    return freeze({
      type: Type.SECTION_CLASS,
      specialty: node,
      section_specifier: sectionValueObject,
      identifier: `${node.identifier} ${sectionValueObject.value}`
    });
  }
  const cohortValueObject = cohortSpecifierValue(cohortValue);
  return freeze({
    type: Type.COHORT_CLASS,
    specialty: node,
    section_specifier: sectionValueObject,
    cohort_specifier: cohortValueObject,
    identifier: `${node.identifier} ${sectionValueObject.value}${cohortValueObject.value}`
  });
}

function invalid(input, diagnostics) {
  return freeze({ type: Type.INVALID_REFERENCE, input, diagnostics: freeze(diagnostics) });
}
function trackSpecifierReference(notation, value) {
  return freeze({ type: Type.TRACK_SPECIFIER_REFERENCE, notation, track_specifier: value });
}
function specialtySpecifierReference(notation, value) {
  return freeze({ type: Type.SPECIALTY_SPECIFIER_REFERENCE, notation, specialty_specifier: value });
}
function yearReference(notation, value) {
  return freeze({ type: Type.YEAR_REFERENCE, notation, year: value });
}
function specialtyReference(notation, value) {
  return freeze({ type: Type.SPECIALTY_REFERENCE, notation, specialty: value });
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
  let specialtyTag = parts[1];
  let section = parts[2];
  if (specialtyTag === undefined) {
    const rule = catalogue.specialtyRules.get(rest);
    if (rule && rule.track_specifier.value === track) {
      specialtyTag = rest;
      section = undefined;
    }
  }
  const year = Number(yearText);
  const specialtyIdentifier = specialtyTag === undefined
    ? commonSpecialty(catalogue, { track_specifier: track, year_specifier: year }).identifier
    : specialty(catalogue, {
      specialty_specifier: specialtyTag,
      year_specifier: year,
      year_semester_specifier: 1
    }).identifier;
  return section === undefined ? specialtyIdentifier : `${specialtyIdentifier} ${section}${cohort ?? ''}`;
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
  const targetSpecialtyIdentifier = syntax.type === Type.SPECIALTY_REFERENCE
    ? syntax.specialty.identifier
    : syntax.class.specialty.identifier;
  return (records ?? []).filter((record) => {
    let parsed;
    try {
      const ref = record.reference;
      const pop = record.population;
      if (pop?.type === Type.SPECIALTY_POPULATION) parsed = specialtyReference(record.reference, pop.specialty);
      else if (pop?.type === Type.SECTION_POPULATION) parsed = classReference(record.reference, pop.class);
      else if (pop?.type === Type.COHORT_POPULATION) parsed = classReference(record.reference, pop.class);
      else parsed = parseReference(record.reference, { catalogue, expected: 'specialty' });
    } catch (e) {
      return false;
    }
    switch (parsed.type) {
      case Type.INVALID_REFERENCE:
        return false;
      case Type.SPECIALTY_REFERENCE:
        return parsed.specialty.identifier === targetSpecialtyIdentifier;
      case Type.CLASS_REFERENCE:
        return parsed.class.specialty.identifier === targetSpecialtyIdentifier &&
          (syntax.type === Type.SPECIALTY_REFERENCE || parsed.class.identifier === syntax.class.identifier);
      default:
        return false;
    }
  });
}

// ---- query helpers ----

export function querySpecialties(catalogue, predicate = () => true) {
  return catalogue.specialties.filter(predicate);
}
export function queryClasses(catalogue, predicate = () => true) {
  return (catalogue.classes ?? []).filter(predicate);
}
export function queryRecords(records, filters = {}) {
  return (records ?? []).filter((record) => Object.entries(filters).every(([key, value]) => record[key] === value));
}

export { DAYS, SLOTS };

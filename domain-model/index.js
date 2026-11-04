const DEFAULT_COMMON_TRACKS = new Set(['LBC', 'LCE', 'LCS', 'MP']);
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
  TRACK: Symbol('track'),
  COMMON_BRANCH: Symbol('common-branch'),
  SPECIALIZATION_BRANCH: Symbol('specialization-branch'),
  SECTIONLESS_BRANCH: Symbol('sectionless-branch'),
  SECTION_CLASS: Symbol('section-class'),
  COHORT_CLASS: Symbol('cohort-class'),
  SINGLETON_CLASS: Symbol('singleton-class'),
  INVALID_REFERENCE: Symbol('invalid-reference'),
  TRACK_SPECIFIER_REFERENCE: Symbol('track-specifier-reference'),
  SPECIALIZATION_SPECIFIER_REFERENCE: Symbol('specialization-specifier-reference'),
  TRACK_REFERENCE: Symbol('track-reference'),
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
  RECORDS: Symbol('records')
});

const freeze = (value) => Object.freeze(value);
const clean = (value) => String(value ?? '').trim().replace(/\s+/g, ' ');
const normalizedSet = (values) => new Set([...values].map((value) => clean(value).toUpperCase()));

/**
 * @typedef {{type: symbol, value: string}} TrackSpecifier
 * @typedef {{type: symbol, value: number}} YearSpecifier
 * @typedef {{type: symbol, value: string}} SpecializationSpecifier
 * @typedef {{type: symbol, value: number}} YearSemesterSpecifier
 * @typedef {{type: symbol, value: number}} BranchSemesterSpecifier
 * @typedef {{type: symbol, value: string}} SectionSpecifier
 * @typedef {{type: symbol, value: number}} CohortSpecifier
 * @typedef {{type: symbol, track_specifier: TrackSpecifier, year_specifier: YearSpecifier, identifier: string}} Track
 * @typedef {{type: symbol, track: Track, identifier: string}} CommonBranch
 * @typedef {{type: symbol, specialization_specifier: SpecializationSpecifier, branch_semester_specifier: BranchSemesterSpecifier, track: Track, identifier: string}} SpecializationBranch
 * @typedef {{type: symbol, specialization_specifier: SpecializationSpecifier, branch_semester_specifier: BranchSemesterSpecifier, identifier: string}} SectionlessBranch
 * @typedef {CommonBranch|SpecializationBranch|SectionlessBranch} Branch
 * @typedef {{type: symbol, branch: Branch, section_specifier: SectionSpecifier, identifier: string}} SectionClass
 * @typedef {{type: symbol, branch: Branch, section_specifier: SectionSpecifier, cohort_specifier: CohortSpecifier, identifier: string}} CohortClass
 * @typedef {{type: symbol, branch: Branch, identifier: string}} SingletonClass
 * @typedef {SectionClass|CohortClass|SingletonClass} ClassPopulation
 * @typedef {{commonTracks?: Array<string>, expected?: 'track-specifier'|'specialization-specifier'|'track'|'branch'|'class'}} ParseOptions
 * @typedef {{type: symbol, input: string, diagnostics: Array<string>}} InvalidReference
 * @typedef {{type: symbol, notation: string, track_specifier: TrackSpecifier}} TrackSpecifierReference
 * @typedef {{type: symbol, notation: string, specialization_specifier: SpecializationSpecifier}} SpecializationSpecifierReference
 * @typedef {{type: symbol, notation: string, track: Track}} TrackReference
 * @typedef {{type: symbol, notation: string, branch: Branch}} BranchReference
 * @typedef {{type: symbol, notation: string, class: ClassPopulation}} ClassReference
 * @typedef {InvalidReference|TrackSpecifierReference|SpecializationSpecifierReference|TrackReference|BranchReference|ClassReference} ParsedReference
 * @typedef {''|'SA'|'SB'} WeekPatternSpecifier
 * @typedef {{type: symbol, branch: Branch}} BranchPopulation
 * @typedef {{type: symbol, class: SectionClass}} SectionPopulation
 * @typedef {{type: symbol, class: CohortClass}} CohortPopulation
 * @typedef {BranchPopulation|SectionPopulation|CohortPopulation} PopulationReference
 * @typedef {{type: symbol, subject: string, teacher: string, room: string, population: PopulationReference, day: string, time: string, week_pattern_specifier: WeekPatternSpecifier, session_kind: string}} SessionSpecifier
 * @typedef {{field: string, professor: string, subject: string, room: string, day: string, time: string, week: string, source: string, color: string}} CsvRecord
 * @typedef {{type: symbol, source: string, color: string}} Provenance
 * @typedef {{type: symbol, subject: string, teacher: string, room: string, day: string, time: string, week_pattern_specifier: WeekPatternSpecifier, population: PopulationReference, reference: string, provenance: Provenance, missing: Array<'session_kind'>}} PartialSessionRecord
 * @typedef {{type: symbol, record: CsvRecord, errors: Array<string>}} InvalidCsvRecord
 * @typedef {PartialSessionRecord|InvalidCsvRecord} CsvConversion
 * @typedef {{type: symbol, syntax: InvalidReference, catalogue: {type: symbol}, publication: {type: symbol}}} InvalidResolution
 * @typedef {{type: symbol, syntax: BranchReference|ClassReference, catalogue: {type: symbol}, publication: {type: symbol|'no-records'|'records', records?: Array<PartialSessionRecord>}}} NotFoundResolution
 * @typedef {{type: symbol, syntax: BranchReference|ClassReference, catalogue: {type: symbol, match: Branch|ClassPopulation}, publication: {type: symbol|'records', records?: Array<PartialSessionRecord>}}} UniqueResolution
 * @typedef {{type: symbol, syntax: BranchReference|ClassReference, catalogue: {type: symbol, matches: Array<Branch|ClassPopulation>}, publication: {type: symbol|'records', records?: Array<PartialSessionRecord>}}} AmbiguousResolution
 * @typedef {InvalidResolution|NotFoundResolution|UniqueResolution|AmbiguousResolution} Resolution
 */

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

function trackValue({ track_specifier, year_specifier } = {}) {
  const normalized_track_specifier = trackSpecifierValue(track_specifier);
  const normalized_year_specifier = yearSpecifierValue(year_specifier);
  return freeze({
    type: Type.TRACK,
    track_specifier: normalized_track_specifier,
    year_specifier: normalized_year_specifier,
    identifier: `${normalized_track_specifier.value}${normalized_year_specifier.value}`
  });
}

function commonBranch(track) {
  if (track?.type !== Type.TRACK) throw new Error('A common branch requires a track object');
  return freeze({ type: Type.COMMON_BRANCH, track, identifier: track.identifier });
}

function specializationBranch(specialization_specifier, branch_semester_specifier, track) {
  const normalized_specialization_specifier = specializationSpecifierValue(specialization_specifier);
  const normalized_branch_semester_specifier = branchSemesterSpecifierValue(branch_semester_specifier);
  if (track?.type !== Type.TRACK) throw new Error('A specialization branch requires a track object');
  return freeze({
    type: Type.SPECIALIZATION_BRANCH,
    specialization_specifier: normalized_specialization_specifier,
    branch_semester_specifier: normalized_branch_semester_specifier,
    track,
    identifier: `${normalized_specialization_specifier.value}${normalized_branch_semester_specifier.value}`
  });
}

function sectionlessBranch(specialization_specifier, branch_semester_specifier, identifier) {
  const normalized_specialization_specifier = specializationSpecifierValue(specialization_specifier);
  const normalized_branch_semester_specifier = branchSemesterSpecifierValue(branch_semester_specifier);
  return freeze({
    type: Type.SECTIONLESS_BRANCH,
    specialization_specifier: normalized_specialization_specifier,
    branch_semester_specifier: normalized_branch_semester_specifier,
    identifier: identifier ?? `${normalized_specialization_specifier.value}${normalized_branch_semester_specifier.value}`
  });
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

function parseOptions(options = {}) {
  const expectedTypes = new Set(['track-specifier', 'specialization-specifier', 'track', 'branch', 'class']);
  if (options.expected !== undefined && !expectedTypes.has(options.expected)) {
    throw new Error(`Invalid expected reference type: ${options.expected}`);
  }
  return {
    commonTracks: options.commonTracks == null ? DEFAULT_COMMON_TRACKS : normalizedSet(options.commonTracks),
    expected: options.expected
  };
}

function invalid(input, diagnostics) {
  return freeze({ type: Type.INVALID_REFERENCE, input, diagnostics: freeze(diagnostics) });
}

function trackSpecifierReference(notation, value) {
  return freeze({ type: Type.TRACK_SPECIFIER_REFERENCE, notation, track_specifier: value });
}

function specializationSpecifierReference(notation, value) {
  return freeze({
    type: Type.SPECIALIZATION_SPECIFIER_REFERENCE,
    notation,
    specialization_specifier: value
  });
}

function trackReference(notation, value) {
  return freeze({ type: Type.TRACK_REFERENCE, notation, track: value });
}

function branchReference(notation, value) {
  return freeze({ type: Type.BRANCH_REFERENCE, notation, branch: value });
}

function classReference(notation, value) {
  return freeze({ type: Type.CLASS_REFERENCE, notation, class: value });
}

function parseBranchTokens(tokens, options) {
  if (tokens.length === 1) {
    const singleton = tokens[0].match(/^([A-Z][A-Z0-9-]*)(\d+)-([A-Z][A-Z0-9-]*)$/);
    if (singleton) return sectionlessBranch(`${singleton[1]}-${singleton[3]}`, singleton[2], tokens[0]);
  }
  if (tokens.length === 2) {
    const prefix = tokens[0].match(/^([A-Z][A-Z0-9-]*)(\d+)$/);
    const specialization = tokens[1].match(/^([A-Z][A-Z0-9-]*)(\d+)$/);
    if (prefix && specialization && specialization[1].length > 1) {
      return specializationBranch(
        specialization[1],
        specialization[2],
        trackValue({ track_specifier: prefix[1], year_specifier: prefix[2] })
      );
    }
    return undefined;
  }
  if (tokens.length !== 1) return undefined;
  const match = tokens[0].match(/^([A-Z][A-Z0-9-]*)(\d+)$/);
  if (!match) return undefined;
  return options.commonTracks.has(match[1])
    ? commonBranch(trackValue({ track_specifier: match[1], year_specifier: match[2] }))
    : sectionlessBranch(match[1], match[2]);
}

export function trackSpecifier(tag) {
  return trackSpecifierValue(tag);
}

export function yearSpecifier(year) {
  return yearSpecifierValue(year);
}

export function specializationSpecifier(value) {
  return specializationSpecifierValue(value);
}

export function yearSemesterSpecifier(value) {
  return yearSemesterSpecifierValue(value);
}

export function branchSemesterSpecifier(value) {
  return branchSemesterSpecifierValue(value);
}

export function track({ track_specifier, year_specifier } = {}) {
  return trackValue({ track_specifier, year_specifier });
}

export function sectionSpecifier(value) {
  return sectionSpecifierValue(value);
}

export function cohortSpecifier(value) {
  return cohortSpecifierValue(value);
}

export function branchSemesterFor({
  year_specifier,
  branch_start_year,
  year_semester_specifier
} = {}) {
  const year_semester = yearSemesterSpecifierValue(year_semester_specifier);
  if (!Number.isInteger(year_specifier) || !Number.isInteger(branch_start_year) || year_specifier < branch_start_year) {
    throw new Error('Year specifier must not precede branch start');
  }
  return branchSemesterSpecifierValue(
    2 * (year_specifier - branch_start_year) + year_semester.value
  );
}

export function singletonBranch(track) {
  return commonBranch(track);
}

export function branch({
  track,
  specialization_specifier,
  branch_semester_specifier,
} = {}) {
  if (track === undefined) throw new Error('A branch requires a track object');
  if (track?.type !== Type.TRACK) throw new Error('A branch requires a track object');
  if (specialization_specifier === undefined) {
    throw new Error('A branch requires a specialization specifier');
  }
  return specializationBranch(specialization_specifier, branch_semester_specifier, track);
}

export function classPopulation({ branch: branch_value, section_specifier, cohort_specifier } = {}) {
  const value = typeof branch_value === 'string'
    ? parseReference(branch_value, { expected: 'branch' }).branch
    : branch_value;
  if (!value || ![Type.COMMON_BRANCH, Type.SPECIALIZATION_BRANCH, Type.SECTIONLESS_BRANCH].includes(value.type)) {
    throw new Error('Class population needs a branch');
  }
  return classFromBranch(value, section_specifier, cohort_specifier);
}

export function parseReference(input, options = {}) {
  const original = String(input ?? '');
  const value = clean(original).toUpperCase();
  if (!value) return invalid(original, ['Reference is empty']);
  const parsedOptions = parseOptions(options);
  const simpleSpecifier = value.match(/^[A-Z][A-Z-]*$/);
  if (simpleSpecifier) {
    const tag = simpleSpecifier[0];
    if (parsedOptions.expected === 'track-specifier' || (
      parsedOptions.expected === undefined && parsedOptions.commonTracks.has(tag)
    )) {
      return trackSpecifierReference(value, trackSpecifierValue(tag));
    }
    if (parsedOptions.expected === 'specialization-specifier' || parsedOptions.expected === undefined) {
      return specializationSpecifierReference(value, specializationSpecifierValue(tag));
    }
    return invalid(original, [`Expected a ${parsedOptions.expected} reference, got a specifier reference`]);
  }
  const compact = value.match(/^([A-Z][A-Z0-9-]*\d+)([A-Z]+)(\d+)$/);
  const tokens = compact ? [compact[1], compact[2], compact[3]] : value.split(' ');
  let branchTokens = tokens;
  let sectionValue;
  let cohortValue;

  if (!compact && tokens.length === 2 &&
      /^[A-Z][A-Z0-9-]*\d+$/.test(tokens[0]) &&
      /^[A-Z][A-Z0-9-]*\d+$/.test(tokens[1]) &&
      tokens[1].match(/^([A-Z][A-Z0-9-]*)\d+$/)[1].length > 1) {
    const valueBranch = parseBranchTokens(tokens, parsedOptions);
    if (!valueBranch) return invalid(original, ['Malformed branch reference']);
    if (parsedOptions.expected === 'class') {
      return invalid(original, ['Expected a class reference, got a branch reference']);
    }
    return branchReference(value, valueBranch);
  }
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

  const valueBranch = parseBranchTokens(branchTokens, parsedOptions);
  if (!valueBranch) return invalid(original, ['Malformed branch or class reference']);
  if (sectionValue !== undefined) {
    if (parsedOptions.expected === 'branch') {
      return invalid(original, ['Expected a branch reference, got a class reference']);
    }
    return classReference(value, classFromBranch(valueBranch, sectionValue, cohortValue));
  }
  if (parsedOptions.expected === 'class') {
    return classReference(value, classFromBranch(valueBranch));
  }
  if (parsedOptions.expected === 'track') {
    if (valueBranch.type !== Type.COMMON_BRANCH) {
      return invalid(original, ['Expected a track reference, got a branch reference']);
    }
    return trackReference(value, valueBranch.track);
  }
  if (parsedOptions.expected === 'track-specifier' || parsedOptions.expected === 'specialization-specifier') {
    return invalid(original, [`Expected a ${parsedOptions.expected} reference, got a compound reference`]);
  }
  if (parsedOptions.expected === 'branch') return branchReference(value, valueBranch);
  switch (valueBranch.type) {
    case Type.COMMON_BRANCH:
      return trackReference(value, valueBranch.track);
    default:
      return branchReference(value, valueBranch);
  }
}

export function weekPatternSpecifier(value = '') {
  const normalized = clean(value).toUpperCase();
  if (normalized === '' || normalized === 'EVERY') return '';
  if (normalized === 'SA' || normalized === 'SB') return normalized;
  throw new Error(`Invalid week pattern: ${value}`);
}

export { SESSION_KIND_SCOPES };

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

function populationForParsed(parsed, sessionKindValue) {
  if (parsed.type === Type.INVALID_REFERENCE) throw new Error(parsed.diagnostics.join('; '));
  const scope = sessionKindValue ? SESSION_KIND_SCOPES[sessionKind(sessionKindValue)] : undefined;
  switch (scope) {
    case 'branch':
      if (parsed.type !== Type.BRANCH_REFERENCE) throw new Error('Branch population must be a branch');
      return freeze({ type: Type.BRANCH_POPULATION, branch: parsed.branch });
    case 'section':
      if (parsed.type !== Type.CLASS_REFERENCE || parsed.class.type !== Type.SECTION_CLASS) {
        throw new Error('Section population must be a section class');
      }
      return freeze({ type: Type.SECTION_POPULATION, class: parsed.class });
    case 'cohort':
      if (parsed.type !== Type.CLASS_REFERENCE || parsed.class.type !== Type.COHORT_CLASS) {
        throw new Error('Cohort population must be a cohort class');
      }
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

export function populationReference({ reference, session_kind } = {}) {
  const expected = !session_kind || SESSION_KIND_SCOPES[sessionKind(session_kind)] === 'branch'
    ? 'branch'
    : 'class';
  const parsed = typeof reference === 'string' ? parseReference(reference, { expected }) : reference;
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
  const population = populationReference({ reference: fields.population, session_kind: normalizedSessionKind });
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

function csvRecord(record = {}) {
  const fields = ['field', 'professor', 'subject', 'room', 'day', 'time', 'week', 'source', 'color'];
  return freeze(Object.fromEntries(fields.map((field) => [field, clean(record[field])])));
}

function provenance(record) {
  if (!record.source && !record.color) return freeze({ type: Type.PROVENANCE, source: '', color: '' });
  return freeze({ type: Type.PROVENANCE, source: record.source, color: record.color });
}

export function fromCsvRecord(record) {
  const raw = csvRecord(record);
  const errors = [];
  for (const field of ['field', 'subject', 'professor', 'room', 'day', 'time']) {
    if (!raw[field]) errors.push(`${field} is required`);
  }
  let population;
  let reference = raw.field;
  if (raw.field) {
    const singletonNotation = /^[A-Z][A-Z0-9-]*\d+-[A-Z][A-Z-]*$/i.test(raw.field);
    const normalizedField = (singletonNotation ? raw.field : raw.field.replace(/-([A-Z])/, ' $1'))
      .replace(/\s+GROUPE\s+/i, ' ');
    const match = normalizedField.match(/^(.+?)\s+([A-Z]+)(?:\s+(\d+))?$/);
    reference = match ? `${match[1]} ${match[2]}${match[3] ?? ''}` : normalizedField;
    try {
      population = populationReference({ reference: parseReference(reference) });
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

function sameIdentifier(value, identifier) {
  return value.identifier === identifier;
}

function publicationRecords(records, syntax, commonTracks) {
  const targetBranchIdentifier = syntax.type === Type.BRANCH_REFERENCE
    ? syntax.branch.identifier
    : syntax.class.branch.identifier;
  return records.filter((record) => {
    const parsed = record.population?.type === Type.BRANCH_POPULATION
      ? branchReference(record.reference, record.population.branch)
      : record.population?.type === Type.SECTION_POPULATION
        ? classReference(record.reference, record.population.class)
        : record.population?.type === Type.COHORT_POPULATION
          ? classReference(record.reference, record.population.class)
          : parseReference(record.reference, { commonTracks, expected: 'branch' });
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

export class Catalogue {
  constructor({ branches = [], classes = [], records = [], commonTracks } = {}) {
    this.commonTracks = commonTracks == null ? DEFAULT_COMMON_TRACKS : normalizedSet(commonTracks);
    this.branches = branches.map((value) => typeof value === 'string'
      ? parseReference(value, { commonTracks: this.commonTracks, expected: 'branch' }).branch
      : value);
    this.classes = classes.map((value) => {
      if (typeof value !== 'string') return value;
      const parsed = parseReference(value, { commonTracks: this.commonTracks, expected: 'class' });
      if (parsed.type === Type.INVALID_REFERENCE) throw new Error(`Invalid catalogue class: ${value}`);
      switch (parsed.type) {
        case Type.CLASS_REFERENCE:
          return parsed.class;
        case Type.BRANCH_REFERENCE:
          return classPopulation({ branch: parsed.branch });
        default:
          throw new Error(`Invalid catalogue class: ${value}`);
      }
    });
    for (const value of this.branches) {
      if (value.type === Type.SECTIONLESS_BRANCH && !this.classes.some((item) => item.identifier === value.identifier)) {
        this.classes.push(classPopulation({ branch: value }));
      }
    }
    this.records = records;
  }

  matches(parsed) {
    switch (parsed.type) {
      case Type.BRANCH_REFERENCE:
        return this.branches.filter((value) => sameIdentifier(value, parsed.branch.identifier));
      case Type.CLASS_REFERENCE:
        return this.classes.filter((value) => sameIdentifier(value, parsed.class.identifier));
      default:
        return [];
    }
  }

  resolve(input, options = {}) {
    const normalizedInput = clean(input).toUpperCase();
    const inferredExpected = normalizedInput.includes(' ') ||
      /^[A-Z][A-Z0-9-]*\d+[A-Z]+\d*$/.test(normalizedInput)
      ? 'class'
      : 'branch';
    const syntax = parseReference(input, {
      commonTracks: this.commonTracks,
      expected: options.expected ?? inferredExpected
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
    const records = publicationRecords(this.records, syntax, this.commonTracks);
    const publication = records.length === 0
      ? freeze({ type: Type.NO_RECORDS })
      : freeze({ type: Type.RECORDS, records: freeze(records) });
    if (matches.length === 0) {
      return freeze({
        type: Type.NOT_FOUND,
        syntax,
        catalogue: freeze({ type: Type.NOT_FOUND }),
        publication: matches.length === 0 && records.length === 0 ? publication : publication
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

export function queryBranches(catalogue, predicate = () => true) {
  return catalogue.branches.filter(predicate);
}

export function queryClasses(catalogue, predicate = () => true) {
  return catalogue.classes.filter(predicate);
}

export function queryRecords(records, filters = {}) {
  return records.filter((record) => Object.entries(filters).every(([key, value]) => record[key] === value));
}

export { DAYS, SLOTS };

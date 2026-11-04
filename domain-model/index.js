const DEFAULT_COMMON_TRACKS = new Set(['LBC', 'LCE', 'LCS', 'MP']);
const DAYS = new Set(['LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI']);
const SLOTS = new Set(['08h15-09h45', '10h00-11h30', '11h40-13h10', '13h20-14h50', '15h00-16h30', '16h45-18h15']);

/**
 * A named educational track such as LCS or MP.
 * @typedef {{type: string, tag: string}} Track
 */
/**
 * A track at a numbered year, such as LCS1.
 * @typedef {{type: string, track: Track, year: number, identifier: string}} TrackYear
 */
/**
 * A branch of a track, either common, non-common, or singleton.
 * @typedef {{type: string, kind: string, identifier: string, specialization: (string|null), programmeSemester: (number|null), trackYear: (TrackYear|null)}} Branch
 */
/**
 * A class population formed from a branch, section, and optional cohort.
 * @typedef {{type: string, level: string, branch: Branch, section: (string|null), cohort: (number|null), identifier: string, singleton: boolean}} ClassPopulation
 */
/**
 * Parser configuration, including institution-specific common track names.
 * @typedef {{commonTracks: (Array<string>|null)}} ParseOptions
 */
/**
 * The result of parsing a branch or class reference.
 * @typedef {{valid: boolean, kind: (string|null), branch: (Branch|null), class: (ClassPopulation|null), singletonClass: (ClassPopulation|null), broad: (boolean|null), specific: (boolean|null), notation: (string|null), diagnostics: Array<string>, input: (string|null)}} ParsedReference
 */
/**
 * A normalized every-week or alternating-week pattern.
 * @typedef {{code: string, name: string}} WeekPattern
 */
/**
 * A reference to the population attending a session.
 * @typedef {{type: string, parsed: ParsedReference, scope: (string|null)}} PopulationReference
 */
/**
 * A recurring session without a specific calendar date.
 * @typedef {{type: string, subject: (string|null), teacher: (string|null), room: (string|null), population: (PopulationReference|null), day: (string|null), time: (string|null), week: WeekPattern, kind: (string|null), scope: (string|null)}} SessionSpecifier
 */
/**
 * A scalar row read from the normalized CSV representation.
 * @typedef {{field: (string|null), professor: (string|null), subject: (string|null), room: (string|null), day: (string|null), time: (string|null), week: (string|null), source: (string|null), color: (string|null)}} CsvRecord
 */
/**
 * A CSV-derived session record whose kind and scope may still be unknown.
 * @typedef {{type: string, subject: (string|null), teacher: (string|null), room: (string|null), day: (string|null), time: (string|null), week: WeekPattern, population: (PopulationReference|null), reference: string, provenance: ({source: (string|null), color: (string|null)}|null), missing: Array<string>}} PartialSessionRecord
 */
/**
 * Catalogue membership and ambiguity information for a resolved reference.
 * @typedef {{type: string, result: string, matches: Array<Branch|ClassPopulation>, branchMatches: Array<Branch>, classMatches: Array<ClassPopulation>, ambiguous: boolean, absent: boolean}} CatalogueResult
 */
/**
 * Publication records matching a resolved reference.
 * @typedef {{present: boolean, records: Array<PartialSessionRecord>}} PublicationResult
 */
/**
 * The complete result of resolving a reference through all three layers.
 * @typedef {{syntax: ParsedReference, catalogue: CatalogueResult, publication: PublicationResult}} Resolution
 */

const freeze = (value) => Object.freeze(value);
const clean = (value) => String(value ?? '').trim().replace(/\s+/g, ' ');

/**
 * Create a normalized track representation.
 * @param {string} tag
 * @returns {Track}
 */
export function track(tag) {
  const value = clean(tag).toUpperCase();
  if (!/^[A-Z][A-Z0-9-]*$/.test(value)) throw new Error(`Invalid track: ${tag}`);
  return freeze({ type: 'track', tag: value });
}

/**
 * Create a track-year representation.
 * @param {string} trackTag
 * @param {number|string} year
 * @returns {TrackYear}
 */
export function trackYear(trackTag, year) {
  const t = track(trackTag);
  const n = Number(year);
  if (!Number.isInteger(n) || n < 1) throw new Error(`Invalid track year: ${year}`);
  return freeze({ type: 'track-year', track: t, year: n, identifier: `${t.tag}${n}` });
}

/**
 * Validate and normalize an academic semester number.
 * @param {number|string} value
 * @returns {number}
 */
export function academicSemester(value) {
  const n = Number(value);
  if (n !== 1 && n !== 2) throw new Error('Academic semester must be 1 or 2');
  return n;
}

/**
 * Validate and normalize a programme-semester number.
 * @param {number|string} value
 * @returns {number}
 */
export function programmeSemester(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw new Error('Programme semester must be positive');
  return n;
}

/**
 * Calculate the programme semester for a track year and current academic half.
 * @param {number} trackYearNumber
 * @param {number} start
 * @param {number} currentHalf
 * @returns {number}
 */
export function programmeSemesterFor(trackYearNumber, start, currentHalf) {
  academicSemester(currentHalf);
  if (!Number.isInteger(trackYearNumber) || !Number.isInteger(start) || trackYearNumber < start) {
    throw new Error('Track year must not precede branch start');
  }
  return 2 * (trackYearNumber - start) + currentHalf;
}

/**
 * Create a branch representation from an identifier or its components.
 *
 * A branch may be common, non-common, or a sectionless singleton branch.
 * @param {{identifier?: string, track?: string, year?: (number|string), specialization?: string, semester?: (number|string), start?: number, currentHalf?: number, commonTracks?: Array<string>}} options
 * @returns {Branch}
 */
export function branch({ identifier, track: trackTag, year, specialization, semester, start, currentHalf, commonTracks } = {}) {
  const id = clean(identifier).toUpperCase();
  if (id) {
    const parsed = parseReference(id, { commonTracks });
    if (!parsed.valid || parsed.kind !== 'branch') throw new Error(`Invalid branch: ${identifier}`);
    return freeze(parsed.branch);
  }
  if (specialization) {
    const spec = clean(specialization).toUpperCase();
    const sem = programmeSemester(semester ?? programmeSemesterFor(Number(year), Number(start), currentHalf ?? 1));
    if (!/^[A-Z][A-Z0-9-]*$/.test(spec)) throw new Error('Invalid specialization');
    return freeze({ type: 'branch', kind: 'non-common', specialization: spec, programmeSemester: sem,
      trackYear: year == null ? null : trackYear(trackTag, year),
      identifier: `${spec}${sem}` });
  }
  if (trackTag == null || year == null) throw new Error('A branch needs a track/year or specialization');
  const ty = trackYear(trackTag, year);
  return freeze({ type: 'branch', kind: 'common', trackYear: ty, identifier: ty.identifier });
}

/**
 * Normalize and validate a section identifier.
 * @param {string} value
 * @returns {string}
 */
export function section(value) {
  const v = clean(value).toUpperCase();
  if (!/^[A-Z]+$/.test(v)) throw new Error(`Invalid section: ${value}`);
  return v;
}

/**
 * Normalize and validate a cohort number.
 * @param {number|string} value
 * @returns {number}
 */
export function cohort(value) {
  const v = String(value);
  if (!/^[0-9]+$/.test(v)) throw new Error(`Invalid cohort: ${value}`);
  return Number(v);
}

/**
 * Create a class population from a branch, section, and optional cohort.
 *
 * Omitting the section creates the branch's singleton class representation.
 * @param {(Branch|string)} branchValue
 * @param {(string|null)} sectionValue
 * @param {(number|string|null)} cohortValue
 * @returns {ClassPopulation}
 */
export function classPopulation(branchValue, sectionValue, cohortValue = null) {
  const b = typeof branchValue === 'string' ? branch({ identifier: branchValue }) : branchValue;
  if (sectionValue == null) {
    return freeze({ type: 'class', level: 'singleton', branch: b, section: null, cohort: null, identifier: b.identifier, singleton: true });
  }
  const s = section(sectionValue);
  const c = cohortValue == null ? null : cohort(cohortValue);
  return freeze({ type: 'class', level: c == null ? 'section' : 'cohort', branch: b, section: s, cohort: c,
    identifier: `${b.identifier} ${s}${c == null ? '' : c}`, singleton: false });
}

/**
 * @param {Array<string>} tokens
 * @param {ParseOptions} options
 * @returns {(Branch|null)}
 */
function parseBranchTokens(tokens, options = {}) {
  if (tokens.length === 1) {
    const singleton = tokens[0].match(/^([A-Z][A-Z0-9-]*)(\d+)-([A-Z][A-Z0-9-]*)$/);
    if (singleton) {
      return freeze({ type: 'branch', kind: 'singleton', identifier: tokens[0],
        specialization: `${singleton[1]}-${singleton[3]}`, programmeSemester: Number(singleton[2]) });
    }
  }
  if (tokens.length === 2 && /^[A-Z][A-Z0-9-]*\d+$/.test(tokens[0]) && /^[A-Z][A-Z0-9-]*\d+$/.test(tokens[1])) {
    const prefix = tokens[0].match(/^([A-Z][A-Z0-9-]*)(\d+)$/);
    const specialization = tokens[1].match(/^([A-Z][A-Z0-9-]*)(\d+)$/);
    if (!prefix || !specialization) return null;
    return branch({ specialization: specialization[1], semester: Number(specialization[2]), track: prefix[1], year: Number(prefix[2]), commonTracks: options.commonTracks });
  }
  if (tokens.length !== 1) return null;
  const match = tokens[0].match(/^([A-Z][A-Z0-9-]*)(\d+)$/);
  if (!match) return null;
  const [, letters, number] = match;
  const commonTracks = options.commonTracks == null
    ? DEFAULT_COMMON_TRACKS
    : new Set([...options.commonTracks].map((value) => clean(value).toUpperCase()));
  if (commonTracks.has(letters)) return branch({ track: letters, year: Number(number), commonTracks });
  return branch({ specialization: letters, semester: Number(number) });
}

/**
 * Parse branch and class notation into a structured reference result.
 *
 * Parsing validates notation only; catalogue membership and publication
 * presence are resolved separately by Catalogue.
 * @param {string} input
 * @param {ParseOptions} options
 * @returns {ParsedReference}
 */
export function parseReference(input, options = {}) {
  const original = String(input ?? '');
  const value = clean(original).toUpperCase();
  const diagnostics = [];
  if (!value) return { valid: false, kind: null, diagnostics: ['Reference is empty'], input: original };
  const compact = value.match(/^([A-Z][A-Z0-9-]*\d+)([A-Z]+)(\d+)$/);
  const tokens = compact ? [compact[1], compact[2], compact[3]] : value.split(' ');
  if (!compact && tokens.length === 2 &&
      /^[A-Z][A-Z0-9-]*\d+$/.test(tokens[0]) && /^[A-Z][A-Z0-9-]*\d+$/.test(tokens[1]) &&
      tokens[1].match(/^([A-Z][A-Z0-9-]*)\d+$/)[1].length > 1) {
    const verboseBranch = parseBranchTokens(tokens, options);
    return { valid: Boolean(verboseBranch), kind: verboseBranch ? 'branch' : null,
      branch: verboseBranch, singletonClass: verboseBranch ? classPopulation(verboseBranch) : null,
      notation: value, diagnostics: verboseBranch ? [] : ['Malformed branch reference'] };
  }
  let branchTokens = tokens;
  let sectionValue = null;
  let cohortValue = null;
  if (compact) {
    branchTokens = [compact[1]];
    sectionValue = compact[2];
    cohortValue = compact[3];
  }
  if (tokens.length >= 2 && /^[A-Z]+$/.test(tokens.at(-1))) {
    sectionValue = tokens.at(-1);
    branchTokens = tokens.slice(0, -1);
  } else if (tokens.length >= 2 && /^[A-Z]+\d+$/.test(tokens.at(-1))) {
    const sc = tokens.at(-1).match(/^([A-Z]+)(\d+)$/);
    sectionValue = sc[1]; cohortValue = sc[2]; branchTokens = tokens.slice(0, -1);
  }
  // Canonical "branch A2" and compact "branchA2".
  if (!sectionValue && tokens.length === 2 && /^[A-Z]+\d+$/.test(tokens[1])) {
    const sc = tokens[1].match(/^([A-Z]+)(\d+)$/);
    sectionValue = sc[1]; cohortValue = sc[2]; branchTokens = [tokens[0]];
  }
  const b = parseBranchTokens(branchTokens, options);
  if (!b) return { valid: false, kind: null, diagnostics: ['Malformed branch or class reference'], input: original };
  if (!sectionValue && tokens.length === 2 && /^[A-Z][A-Z0-9-]*\d+$/.test(tokens[0]) &&
      /^[A-Z][A-Z0-9-]*\d+$/.test(tokens[1]) &&
      tokens[1].match(/^([A-Z][A-Z0-9-]*)\d+$/)[1].length > 1) {
    return { valid: true, kind: 'branch', branch: parseBranchTokens(tokens),
      singletonClass: classPopulation(parseBranchTokens(tokens)), notation: value, diagnostics };
  }
  if (sectionValue) {
    const c = classPopulation(b, sectionValue, cohortValue);
    return { valid: true, kind: 'class', branch: b, class: c, broad: c.level === 'section', specific: c.level === 'cohort',
      notation: value, diagnostics };
  }
  return { valid: true, kind: 'branch', branch: b, singletonClass: classPopulation(b), notation: value, diagnostics };
}

/**
 * Normalize an alternating-week or every-week pattern.
 * @param {string} value
 * @returns {WeekPattern}
 */
export function weekPattern(value = '') {
  const v = clean(value).toUpperCase();
  if (v === '' || v === 'EVERY') return freeze({ code: '', name: 'every' });
  if (v === 'SA') return freeze({ code: 'SA', name: 'A' });
  if (v === 'SB') return freeze({ code: 'SB', name: 'B' });
  throw new Error(`Invalid week pattern: ${value}`);
}

export const SESSION_SCOPES = freeze({ lecture: 'branch', seminar: 'section', lab: 'cohort' });
const SCOPE_KINDS = freeze({ branch: 'lecture', section: 'seminar', cohort: 'lab' });

/**
 * Validate and normalize a session kind and its corresponding scope.
 * @param {string} kind
 * @param {string} scope
 * @returns {{kind: string, scope: string}}
 */
export function sessionKind(kind, scope) {
  let k = clean(kind).toLowerCase();
  let s = clean(scope).toLowerCase();
  if (SCOPE_KINDS[k] && SESSION_SCOPES[SCOPE_KINDS[k]]) [k, s] = [s, k];
  if (!SESSION_SCOPES[k] || SESSION_SCOPES[k] !== s) throw new Error(`Invalid session scope for ${kind}`);
  return freeze({ kind: k, scope: s });
}

/**
 * Create a population reference and optionally enforce its scope.
 * @param {(string|ParsedReference)} reference
 * @param {(string|null)} scope
 * @returns {PopulationReference}
 */
export function populationReference(reference, scope = null) {
  const parsed = typeof reference === 'string' ? parseReference(reference) : reference;
  if (!parsed?.valid) throw new Error('Invalid population reference');
  if (scope === 'branch' && parsed.kind === 'class') throw new Error('Branch population must be a branch');
  if (scope === 'section' && (parsed.kind !== 'class' || parsed.class.level !== 'section')) {
    throw new Error('Section population must be a section class');
  }
  if (scope === 'cohort' && (parsed.kind !== 'class' || parsed.class.level !== 'cohort')) {
    throw new Error('Cohort population must be a cohort class');
  }
  return freeze({ type: 'population-reference', parsed, scope });
}

/**
 * Create a session specifier without assigning it a calendar date.
 *
 * Session kind and scope are synonymous dimensions and may be supplied
 * together or derived from either one.
 * @param {{subject?: string, teacher?: string, room?: string, population?: (string|ParsedReference), day?: string, time?: string, week?: string, kind?: string, scope?: string}} fields
 * @returns {SessionSpecifier}
 */
export function sessionSpecifier(fields = {}) {
  const derivedScope = fields.scope ?? (fields.kind ? SESSION_SCOPES[clean(fields.kind).toLowerCase()] : null);
  const derivedKind = fields.kind ?? (fields.scope ? SCOPE_KINDS[clean(fields.scope).toLowerCase()] : null);
  const result = { type: 'session-specifier', subject: fields.subject ?? null, teacher: fields.teacher ?? null,
    room: fields.room ?? null, population: fields.population ? populationReference(fields.population, derivedScope) : null,
    day: fields.day ?? null, time: fields.time ?? null, week: weekPattern(fields.week), kind: derivedKind, scope: derivedScope };
  if (result.kind || result.scope) sessionKind(result.kind, result.scope);
  return freeze(result);
}

/**
 * Convert one normalized CSV record into a partial session record.
 * @param {CsvRecord} record
 * @returns {PartialSessionRecord}
 */
export function fromCsvRecord(record) {
  const raw = { ...record };
  const rawField = clean(raw.field);
  const singletonNotation = /^[A-Z][A-Z0-9-]*\d+-[A-Z][A-Z0-9-]*$/i.test(rawField);
  const field = (singletonNotation ? rawField : rawField.replace(/-([A-Z])/, ' $1'))
    .replace(/\s+GROUPE\s+/i, ' ');
  const match = field.match(/^(.+?)\s+([A-Z]+)(?:\s+(\d+))?$/);
  const reference = match ? `${match[1]} ${match[2]}${match[3] ?? ''}` : field;
  const parsed = parseReference(reference);
  return freeze({ type: 'partial-session-record', subject: raw.subject ?? null, teacher: raw.professor ?? null,
    room: raw.room ?? null, day: raw.day ?? null, time: raw.time ?? null, week: weekPattern(raw.week),
    population: parsed.valid ? populationReference(parsed) : null, reference: raw.field ?? '', provenance: raw.source || raw.color ? freeze({ source: raw.source ?? null, color: raw.color ?? null }) : null,
    missing: freeze(['kind', 'scope']) });
}

/**
 * Catalogue branches, classes, and published records for reference resolution.
 *
 * Common-track names may be supplied when they differ from the defaults.
 * @param {{branches?: Array<(Branch|string)>, classes?: Array<(ClassPopulation|string)>, records?: Array<PartialSessionRecord>, commonTracks?: Array<string>}} options
 */
export class Catalogue {
  /** @param {{branches?: Array<(Branch|string)>, classes?: Array<(ClassPopulation|string)>, records?: Array<PartialSessionRecord>, commonTracks?: Array<string>}} options */
  constructor({ branches = [], classes = [], records = [], commonTracks } = {}) {
    this.commonTracks = commonTracks == null
      ? DEFAULT_COMMON_TRACKS
      : new Set([...commonTracks].map((value) => clean(value).toUpperCase()));
    this.branches = branches.map((b) => typeof b === 'string'
      ? branch({ identifier: b, commonTracks: this.commonTracks }) : b);
    this.classes = classes.map((c) => {
      if (typeof c !== 'string') return c;
      const parsed = parseReference(c, { commonTracks: this.commonTracks });
      if (!parsed.valid) throw new Error(`Invalid catalogue class: ${c}`);
      return parsed.class ?? parsed.singletonClass;
    }).filter(Boolean);
    for (const b of this.branches) {
      if (b.kind === 'singleton' && !this.classes.some((c) => c.identifier === b.identifier)) {
        this.classes.push(classPopulation(b));
      }
    }
    this.records = records;
  }

  /** @param {ParsedReference} parsed @returns {Array<(Branch|ClassPopulation)>} */
  matches(parsed) {
    const id = parsed.kind === 'branch' ? parsed.branch.identifier : parsed.class.identifier;
    return (parsed.kind === 'branch' ? this.branches : this.classes).filter((x) => x.identifier === id);
  }

  /**
   * Resolve a reference across syntax, catalogue membership, and publication.
   * @param {string} input
   * @returns {Resolution}
   */
  resolve(input) {
    const syntax = parseReference(input, { commonTracks: this.commonTracks });
    if (!syntax.valid) return {
      syntax, catalogue: { result: 'invalid', matches: [], ambiguous: false, absent: true },
      publication: { present: false, records: [] }
    };
    const matches = this.matches(syntax);
    const singleton = syntax.kind === 'branch' && matches.some((item) => item.identifier === syntax.branch.identifier) &&
      this.classes.some((item) => item.identifier === syntax.branch.identifier);
    const records = this.records.filter((r) => {
      const p = r.population?.parsed ?? parseReference(r.reference ?? r.field ?? '', { commonTracks: this.commonTracks });
      return p.valid && (p.branch.identifier === syntax.branch.identifier) &&
        (syntax.kind === 'branch' || p.kind === 'branch' || p.class.identifier === syntax.class.identifier);
    });
    return {
      syntax,
      catalogue: {
        result: singleton ? 'branch-and-singleton-class' : syntax.kind,
        matches,
        branchMatches: this.branches.filter((item) => item.identifier === syntax.branch.identifier),
        classMatches: this.classes.filter((item) => item.identifier === (syntax.kind === 'class' ? syntax.class.identifier : syntax.branch.identifier)),
        ambiguous: singleton || matches.length > 1,
        absent: matches.length === 0 && !singleton
      },
      publication: { present: records.length > 0, records }
    };
  }
}

/**
 * Select catalogue branches matching a predicate.
 * @param {Catalogue} catalogue
 * @param {function(Branch): boolean} predicate
 * @returns {Array<Branch>}
 */
export function queryBranches(catalogue, predicate = () => true) { return catalogue.branches.filter(predicate); }

/**
 * Select catalogue classes matching a predicate.
 * @param {Catalogue} catalogue
 * @param {function(ClassPopulation): boolean} predicate
 * @returns {Array<ClassPopulation>}
 */
export function queryClasses(catalogue, predicate = () => true) { return catalogue.classes.filter(predicate); }

/**
 * Select records whose fields match all supplied filter values.
 * @param {Array<PartialSessionRecord>} records
 * @param {Object<string, string>} filters
 * @returns {Array<PartialSessionRecord>}
 */
export function queryRecords(records, filters = {}) {
  return records.filter((r) => Object.entries(filters).every(([key, value]) => r[key] === value));
}

export { DAYS, SLOTS };

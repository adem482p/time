/*
 * libgroups.js — dependency-free school "groups" model.
 *
 * Domain (fixed vocabulary):
 *   Hierarchy: track -> year -> specialization -> section -> cohort.
 *   Any node in the tree is generically a "class". A "fully specified class"
 *   is a leaf: it has section+cohort when cohorts exist, otherwise it is the
 *   deepest observed node.
 *
 *   Canonical key = specSlot + year + section + cohort.
 *   The track prefix only appears at the track and year levels (`LBC`, `LBC2`);
 *   below that the key drops it: `BI2`, `BI2A`, `BI2A1`.
 *   For a "common branch" year (one with no specialization subfield, e.g.
 *   LBC1/LCE1/LCS1) the specSlot IS the track tag, so the specialization key
 *   equals the year key (`LCS1`, `LBC1`).
 *
 * This file is intentionally platform agnostic: it never touches the DOM, the
 * network, the filesystem, `process`, `require` or `Date`; `Set` and Array
 * methods are used freely.
 *
 * ES module:
 *   Every public member is a named export (the former UMD wrapper and the
 *   `TT.groups` / `Groups` globals are gone).
 */

/* ------------------------------------------------------------------ *
 * Constants
 * ------------------------------------------------------------------ */

/**
 * Known tracks, longest tags first so compact input splits greedily.
 * @type {Array<string>}
 */
export const TRACKS = ['LBC', 'LCE', 'LCS', 'MP'];

/**
 * Section identifiers are always a single uppercase letter. The list below
 * describes the *shape* of a section (A..H is the widest real spread); it is
 * not an authoritative census and is not used to validate data.
 * @type {Array<string>}
 */
export const SECTIONS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

/**
 * Cohorts are single digits 1 and 2 when present.
 * @type {Array<string>}
 */
export const COHORTS = ['1', '2'];

// Known specialization tokens in raw (normalized-uppercase) form, longest
// first. Their canonical spelling is applied via canonicalSpecialization().
const SPEC_TOKENS = ['GLSI', 'IRS', 'IOT', 'EXR', 'BI', 'EB', 'SD'];

const SPEC_START_YEAR = { GLSI: 2, BI: 2, IRS: 2, IOT: 2, EB: 3, SD: 1, EXR: 1 };
const CURRENT_HALF = 1; // all PDFs are "Semestre 1 (du 14/09/26 au 10/01/27)"; flip to 2 for S2 PDFs

// Program semester for a specialization's track year:
// 2 * (trackYear - start) + CURRENT_HALF, where start is the track year in
// which the specialization begins (uppercased lookup, so IoT->IOT works).
// Common branches (slot === track) never call this.
function semOf(spec, trackYear) {
  const u = String(spec == null ? '' : spec).toUpperCase();
  const start = SPEC_START_YEAR[u];
  if (start == null) { return String(trackYear); }
  return String(2 * ((+trackYear) - start) + CURRENT_HALF);
}

/**
 * Level ordering, shallow -> deep.
 * @type {Array<string>}
 */
export const LEVEL_ORDER = ['track', 'year', 'specialization', 'section', 'cohort'];

/**
 * Error codes: a fixed map from error-code name (e.g. MALFORMED,
 * UNKNOWN_YEAR) to the code string carried on `GroupsError.code`.
 */
export const CODES = {
  INVALID_REFERENCE: 'INVALID_REFERENCE',
  AMBIGUOUS_REFERENCE: 'AMBIGUOUS_REFERENCE',
  EMPTY: 'EMPTY',
  MALFORMED: 'MALFORMED',
  UNKNOWN_TRACK: 'UNKNOWN_TRACK',
  UNKNOWN_YEAR: 'UNKNOWN_YEAR',
  UNKNOWN_SPECIALIZATION: 'UNKNOWN_SPECIALIZATION',
  UNKNOWN_SECTION: 'UNKNOWN_SECTION',
  UNKNOWN_COHORT: 'UNKNOWN_COHORT',
  CATALOGUE_COLLISION: 'CATALOGUE_COLLISION'
};

/* ------------------------------------------------------------------ *
 * Errors
 * ------------------------------------------------------------------ */

/**
 * GroupsError extends Error, carries a machine readable `.code` and the
 * offending `.ref` (when there is one). Works with and without `new`.
 *
 * @param {string} code — machine readable error code (a value of CODES).
 * @param {string} message — human readable description.
 * @param ref — the offending reference, stored verbatim; null when omitted.
 * @returns the new GroupsError instance (also when called without `new`).
 */
export function GroupsError(code, message, ref) {
  if (!(this instanceof GroupsError)) {
    return new GroupsError(code, message, ref);
  }
  this.name = 'GroupsError';
  this.code = code || CODES.MALFORMED;
  this.message = message || this.code;
  this.ref = (ref === undefined ? null : ref);
  if (typeof Error.captureStackTrace === 'function') {
    Error.captureStackTrace(this, GroupsError);
  } else {
    this.stack = (new Error(this.message)).stack;
  }
}
GroupsError.prototype = Object.create(Error.prototype);
GroupsError.prototype.constructor = GroupsError;

/* ------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------ */

// Canonical spelling for a specialization token. Case-insensitive; the only
// irregular canonical form is `IoT` (never `IOT`).
function canonicalSpecialization(token) {
  const u = String(token == null ? '' : token).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (u === 'IOT') { return 'IoT'; }
  return u;
}

// True when `t` is one of the known specialization tokens.
function isKnownSpecialization(t) {
  const u = String(t == null ? '' : t).toUpperCase();
  return SPEC_TOKENS.indexOf(u) !== -1;
}

function isKnownTrack(t) {
  return TRACKS.indexOf(String(t == null ? '' : t).toUpperCase()) !== -1;
}

function isDigit(ch) {
  return ch >= '0' && ch <= '9';
}

function uniquePush(arr, value) {
  if (arr.indexOf(value) === -1) { arr.push(value); }
}

function has(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

// Normalize an arbitrary ref into a stable, comparable string:
// trimmed, uppercased, separators collapsed to single spaces.
/**
 * Normalize an arbitrary ref into a stable, comparable string: trimmed,
 * uppercased, separators collapsed to single spaces.
 * @param {string} str — the raw input (null-ish values coerce to '').
 * @returns {string} the normalized form, uppercased, space-separated.
 */
export function normalize(str) {
  if (str == null) { return ''; }
  return String(str)
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^ | $/g, '')
    .toUpperCase();
}

/* ------------------------------------------------------------------ *
 * Tokenizer
 * ------------------------------------------------------------------ */

// Split one compact alphanumeric token into typed atoms. Recognized tracks
// and specializations are matched greedily by longest prefix; every other
// letter becomes a `letter` atom and every digit a `digit` atom.
function splitCompact(token, out) {
  let i = 0;
  while (i < token.length) {
    const rest = token.slice(i);
    let matched = null;

    // try tracks first (no track token overlaps a spec token)
    for (const t of TRACKS) {
      if (rest.indexOf(t) === 0) { matched = { type: 'track', value: t }; break; }
    }
    // then specializations
    if (!matched) {
      for (const s of SPEC_TOKENS) {
        if (rest.indexOf(s) === 0) { matched = { type: 'spec', value: s }; break; }
      }
    }
    if (matched) {
      out.push(matched);
      i += matched.value.length;
      continue;
    }

    const ch = token.charAt(i);
    out.push(isDigit(ch) ? { type: 'digit', value: ch } : { type: 'letter', value: ch });
    i += 1;
  }
}

// Turn a normalized ref into atoms plus an optional out-of-band cohort that
// was written as a word ("Groupe 1" / "GR 1" / "Group 1").
function tokenize(normalized) {
  const atoms = [];
  let cohortWord = null;
  if (!normalized) { return { atoms, cohortWord }; }

  const parts = normalized.split(' ');
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (p === 'GROUPE' || p === 'GROUP' || p === 'GR') {
      if (i + 1 < parts.length && /^[0-9]$/.test(parts[i + 1])) {
        if (cohortWord == null) { cohortWord = parts[i + 1]; }
        i += 1;
      }
      continue;
    }
    splitCompact(p, atoms);
  }
  return { atoms, cohortWord };
}

/* ------------------------------------------------------------------ *
 * Catalogue
 * ------------------------------------------------------------------ */

// Resolve the various things that may be passed as `tokens`/`catalogue`
// into a catalogue-like object (or null for a permissive parse).
function asCatalogue(tokens) {
  if (!tokens) { return null; }
  if (tokens.catalogue) { return tokens.catalogue; }
  if (tokens.byTrackYear) { return tokens; }
  return null;
}

// Build a fresh, empty catalogue accumulator.
function emptyCatalogue() {
  return {
    byTrackYear: {},   // yearKey -> { key, track, year, common, specs: [], specKeys: [] }
    specNodes: {},     // specKey -> { key, specSlot, track, year, specialization, commonBranch }
    tracks: []         // observed track tags, sorted
  };
}

// Register a (track, year) bucket plus its specializations.
// `rawSpecs === null` means "common branch" (no specialization subfield).
function registerBucket(cat, track, year, rawSpecs, strict) {
  track = String(track).toUpperCase();
  year = String(year);
  const yearKey = track + year;
  let bucket = cat.byTrackYear[yearKey];
  if (!bucket) {
    bucket = { key: yearKey, track, year, common: false, specs: [], specKeys: [] };
    cat.byTrackYear[yearKey] = bucket;
    uniquePush(cat.tracks, track);
  }

  const isCommon = (rawSpecs == null || rawSpecs.length === 0);
  let specs;
  if (isCommon) {
    bucket.common = true;
    specs = [track]; // specSlot is the track tag for a common branch
  } else {
    specs = [];
    for (let i = 0; i < rawSpecs.length; i++) {
      const spec = canonicalSpecialization(rawSpecs[i]);
      if (spec) { uniquePush(specs, spec); }
    }
    // A bucket that has explicit specs is not a common branch.
    bucket.common = false;
  }

  for (let j = 0; j < specs.length; j++) {
    const spec = specs[j];
    uniquePush(bucket.specs, spec);
    const slot = isCommon ? track : spec;
    const specKey = isCommon ? slot + year : slot + semOf(spec, year);

    const existing = cat.specNodes[specKey];
    if (existing) {
      // Collision: the same (specialization, year) key would describe two
      // *different* specializations. Identical specializations from different
      // tracks (e.g. SD2) collapse onto one node and are not an error.
      if (existing.specialization !== spec) {
        if (strict) {
          throw new GroupsError(
            CODES.CATALOGUE_COLLISION,
            'specialization key ' + specKey + ' is claimed by ' +
              existing.specialization + ' and ' + spec,
            specKey
          );
        }
        continue;
      }
    } else {
      cat.specNodes[specKey] = {
        key: specKey,
        specSlot: slot,
        track,
        year,
        specialization: spec,
        commonBranch: isCommon
      };
    }
    uniquePush(bucket.specKeys, specKey);
  }
  return bucket;
}

// Derive a catalogue from raw field strings / rows. Buckets by track+year;
// a bucket with no specialization token at all is a common branch.
function deriveCatalogue(inputs) {
  const buckets = {}; // yearKey -> { track, year, specs: [], sawSpec }
  for (let i = 0; i < inputs.length; i++) {
    const item = inputs[i];
    const raw = (item && typeof item === 'object') ? item.field : item;
    if (raw == null) { continue; }
    const p = parseRef(raw, null);
    if (!p.track || !p.year) { continue; }
    const yearKey = p.track + p.year;
    let b = buckets[yearKey];
    if (!b) {
      b = { track: p.track, year: p.year, specs: [], sawSpec: false };
      buckets[yearKey] = b;
    }
    if (p.specialization) {
      const spec = canonicalSpecialization(p.specialization);
      uniquePush(b.specs, spec);
      b.sawSpec = true;
    }
  }

  const cat = emptyCatalogue();
  const keys = Object.keys(buckets).sort();
  for (let k = 0; k < keys.length; k++) {
    const bucket = buckets[keys[k]];
    registerBucket(cat, bucket.track, bucket.year, bucket.sawSpec ? bucket.specs : null, false);
  }
  return cat;
}

// Apply a caller supplied catalogue override. Accepts either a full
// catalogue-like object (has `.byTrackYear`) or a plain map of
// `{ yearKey: [spec, ...] }` such as `{ LCS2: ['GLSI', 'SD'] }`.
function applyCatalogueOverride(cat, override, strict) {
  if (!override) { return cat; }

  if (override.byTrackYear) {
    // Full catalogue replacement.
    const replaced = emptyCatalogue();
    replaced.byTrackYear = override.byTrackYear;
    replaced.specNodes = override.specNodes || {};
    replaced.tracks = override.tracks || Object.keys(override.byTrackYear);
    return replaced;
  }

  const keys = Object.keys(override);
  for (let i = 0; i < keys.length; i++) {
    const yearKey = keys[i];
    const p = parseRef(yearKey, null);
    if (!p.track || !p.year) {
      throw new GroupsError(CODES.MALFORMED, 'invalid catalogue key: ' + yearKey, yearKey);
    }
    let specs = override[yearKey];
    if (specs == null) { specs = []; }
    if (typeof specs === 'string') { specs = [specs]; }
    registerBucket(cat, p.track, p.year, specs.length ? specs : null, strict);
  }
  return cat;
}

/* ------------------------------------------------------------------ *
 * Parsing
 * ------------------------------------------------------------------ */

// Deepest level named by a set of level values.
function deepestLevel(track, year, spec, section, cohort) {
  if (cohort) { return 'cohort'; }
  if (section) { return 'section'; }
  if (spec) { return 'specialization'; }
  if (year) { return 'year'; }
  if (track) { return 'track'; }
  return null;
}

// Core parser. `cat` is a catalogue-like object or null (permissive). Returns
// a ParsedRef-shaped object; the shape is also used internally by the
// catalogue deriver (which only reads track/year/specialization).
function parseRef(ref, tokens) {
  const cat = asCatalogue(tokens);
  const input = (ref == null ? '' : String(ref));
  const normalized = normalize(input);

  const out = {
    valid: false,
    reason: null,
    input,
    normalized,
    track: null,
    year: null,
    specialization: null,
    commonBranch: false,
    section: null,
    cohort: null,
    level: null,
    key: null,
    specKey: null
  };

  const tk = tokenize(normalized);
  const atoms = tk.atoms;
  const cohortWord = tk.cohortWord;

  if (!atoms.length && !cohortWord) {
    // Nothing usable survived normalization (empty or punctuation-only).
    out.reason = CODES.EMPTY;
    return out;
  }

  // Classify atoms.
  let track = null, spec = null;
  const letters = [], letterIdx = [];
  const digits = [], digitIdx = [];
  for (let i = 0; i < atoms.length; i++) {
    const a = atoms[i];
    if (a.type === 'track') {
      if (track !== null) { out.reason = CODES.MALFORMED; return out; }
      track = a.value;
    } else if (a.type === 'spec') {
      if (spec !== null) { out.reason = CODES.MALFORMED; return out; }
      spec = a.value;
    } else if (a.type === 'letter') {
      letters.push(a.value);
      letterIdx.push(i);
    } else {
      digits.push(a.value);
      digitIdx.push(i);
    }
  }

  // Unrecognized standalone letters.
  if (!track && !spec && letters.length) {
    out.reason = (letters.join('').length >= 2) ? CODES.UNKNOWN_TRACK : CODES.MALFORMED;
    return out;
  }
  if (letters.length > 1) {
    // Multiple letters with no clean section interpretation: likely an
    // unknown specialization or malformed token.
    out.reason = (track && digits.length) ? CODES.UNKNOWN_SPECIALIZATION : CODES.MALFORMED;
    return out;
  }

  const section = letters.length === 1 ? letters[0] : null;
  let year = null, cohort = null;

  if (section !== null) {
    const sIdx = letterIdx[0];
    const before = [], after = [];
    for (let d = 0; d < digitIdx.length; d++) {
      if (digitIdx[d] < sIdx) { before.push(digits[d]); } else { after.push(digits[d]); }
    }
    if (before.length > 1 || after.length > 1) { out.reason = CODES.MALFORMED; return out; }
    year = before.length ? before[0] : null;
    cohort = after.length ? after[0] : null;
  } else {
    if (digits.length > 1) { out.reason = CODES.MALFORMED; return out; }
    year = digits.length ? digits[0] : null;
  }

  if (cohortWord != null) {
    if (cohort != null) { out.reason = CODES.MALFORMED; return out; }
    cohort = cohortWord;
  }

  // Structural rules: a section/cohort needs a year context.
  if ((section || cohort) && !year) { out.reason = CODES.MALFORMED; return out; }
  if (!track && !spec) {
    out.reason = CODES.MALFORMED;
    return out;
  }
  if (spec && !isKnownSpecialization(spec)) {
    // defensive; splitCompact only emits known specs
    out.reason = CODES.UNKNOWN_SPECIALIZATION;
    return out;
  }
  let canonSpec = spec ? canonicalSpecialization(spec) : null;

  out.track = track;
  out.year = year;
  out.section = section;
  out.cohort = cohort;

  // Catalogue validation (skipped when no catalogue was supplied).
  let specKey = null;
  let commonBranch = false;

  if (cat) {
    if (track && !has(cat, 'byTrackYear')) {
      out.reason = CODES.MALFORMED;
      return out;
    }

    if (track && year) {
      const yearKey = track + year;
      const entry = cat.byTrackYear[yearKey];
      if (!entry) { out.reason = CODES.UNKNOWN_YEAR; return out; }
      if (entry.common) {
        if (canonSpec && canonSpec !== track) { out.reason = CODES.UNKNOWN_SPECIALIZATION; return out; }
        commonBranch = true;
        specKey = yearKey;
        canonSpec = track;
      } else if (canonSpec) {
        if (entry.specs.indexOf(canonSpec) === -1) { out.reason = CODES.UNKNOWN_SPECIALIZATION; return out; }
        specKey = canonSpec + semOf(canonSpec, year);
      } else if (entry.specKeys.length === 1) {
        specKey = entry.specKeys[0];
        canonSpec = entry.specs[0];
      }
    } else if (track && !year) {
      const under = [];
      const tkeys = Object.keys(cat.specNodes);
      for (let ti = 0; ti < tkeys.length; ti++) {
        const tn = cat.specNodes[tkeys[ti]];
        if (tn.track === track && (!canonSpec || tn.specialization === canonSpec)) { under.push(tn.key); }
      }
      if (!under.length) { out.reason = CODES.UNKNOWN_SPECIALIZATION; return out; }
      if (under.length === 1) {
        specKey = under[0];
        canonSpec = cat.specNodes[under[0]].specialization;
      }
    } else if (canonSpec && year) {
      specKey = canonSpec + year;
      if (!cat.specNodes[specKey]) { out.reason = CODES.UNKNOWN_YEAR; return out; }
    } else if (canonSpec) {
      const matches = [];
      const skeys = Object.keys(cat.specNodes);
      for (let si = 0; si < skeys.length; si++) {
        if (cat.specNodes[skeys[si]].specialization === canonSpec) { matches.push(skeys[si]); }
      }
      if (!matches.length) { out.reason = CODES.UNKNOWN_SPECIALIZATION; return out; }
      if (matches.length === 1) { specKey = matches[0]; }
    }
  } else {
    // Permissive structural parse: build a key when unambiguous.
    // Track-qualified input carries the track year and maps to the program
    // semester; bare spec+digit input already names the semester.
    if (canonSpec && year) {
      specKey = track ? canonSpec + semOf(canonSpec, year) : canonSpec + year;
    } else if (track && year) {
      specKey = track + year;
    }
  }

  out.specialization = canonSpec;
  out.commonBranch = commonBranch || (specKey != null && canonSpec === track && !!commonBranch);
  out.specKey = specKey;
  out.level = deepestLevel(track, year, canonSpec, section, cohort);
  out.key = specKey ? (specKey + (section || '') + (cohort || '')) : null;
  out.valid = true;
  return out;
}

// Public parsers. Both are lenient on input and share one implementation;
// `parseFullName` additionally understands the human "Groupe N" wording,
// which the tokenizer already folds in for both entry points.

/**
 * Parse a reference into levels. Lenient on input; never throws.
 * @param ref — the raw reference (field value, compact key, or similar).
 * @param tokens — optional catalogue-like object; null for a permissive parse.
 * @returns a ParsedRef-shaped object — validity flag, reason code, and
 *   per-level fields — or the invalid shape when the reference fails.
 */
export function parseLevels(ref, tokens) { return parseRef(ref, tokens); }

/**
 * Parse a human full name (e.g. `LBC1-A Groupe 1`) into levels. Same
 * implementation as parseLevels; "Groupe N" wording is understood by both.
 * @param ref — the raw reference.
 * @param tokens — optional catalogue-like object; null for a permissive parse.
 * @returns a ParsedRef-shaped object, as for parseLevels.
 */
export function parseFullName(ref, tokens) { return parseRef(ref, tokens); }

/* ------------------------------------------------------------------ *
 * Formatting
 * ------------------------------------------------------------------ */

/**
 * Human readable full name, e.g. `LBC1-A Groupe 1` or `MP1-SD`.
 * @param levels — a levels-shaped object (track/year/specialization/
 *   commonBranch/section/cohort fields); missing fields fall back to null.
 * @returns {string} the formatted name (possibly empty).
 */
export function formatFull(levels) {
  levels = levels || {};
  const track = levels.track || null;
  const year = levels.year || null;
  const spec = levels.specialization || null;
  const common = !!levels.commonBranch;
  const section = levels.section || null;
  const cohort = levels.cohort || null;

  let s = '';
  if (track && year) { s = String(track) + String(year); }
  else if (track) { s = String(track); }
  else if (year) { s = String(year); }

  let specPrinted = false;
  if (spec && !common && spec !== track) {
    s += (s ? '-' : '') + spec;
    specPrinted = true;
  }
  if (section) { s += (s ? (specPrinted ? '_' : '-') : '') + section; }
  if (cohort) { s += ' Groupe ' + cohort; }
  return s;
}

/**
 * Compact (canonical key) form, e.g. `EB1A`, `LBC1A`, `GLSI3D1`.
 * @param levels — a levels-shaped object, as for formatFull.
 * @returns {string} the compact name (possibly empty).
 */
export function formatCompact(levels) {
  levels = levels || {};
  const slot = levels.commonBranch ? levels.track : (levels.specialization || levels.track);
  const sem = levels.commonBranch ? levels.year :
    (levels.year == null ? '' : semOf(levels.specialization || levels.track, levels.year));
  return (slot || '') + (sem || '') + (levels.section || '') + (levels.cohort || '');
}

// Shortcut heading form (issue 075): the compact name the classes page
// shows in place of a full class name, with the cohort split out so the
// caller can render it as a real <sub> (HTML markup stays out of this
// platform-agnostic file; the caller escapes both parts first):
//   LBC1-H Groupe 2   -> { head: 'H1',    sub: '2' }   -> H1<sub>2</sub>
//   LCS3-GLSI_D Groupe 2 -> { head: 'GLSI3 D', sub: '2' } -> GLSI3 D<sub>2</sub>
//   LBC3-EB_A         -> { head: 'EB3 A', sub: ''  }   -> EB3 A
//   MP1-EXR / MP2-SD  -> { head: 'EXR1' / 'SD2', sub: '' }
//   MP2-SD_A          -> { head: 'SD2 A', sub: ''  }
// Strict whole-string match on the full-name shape (track from the known
// TRACKS vocabulary); anything else — a malformed field from raw CSV
// quoting, a compact key, an interior node name, an unknown future shape —
// returns null so the caller falls back to the full name. A heading is
// never blanked. Pure, no DOM.
const SHORTCUT_RE = new RegExp(
  '^(' + TRACKS.join('|') + ')(\\d{1,2})-([A-Za-z0-9]+?)(?:_([A-Z]))?(?: Groupe (\\d+))?$');

/**
 * Shortcut heading for a full class name; see the LONG comment above for the
 * exact shape and the fallback contract.
 * @param {string} name — the full-name candidate.
 * @returns a { head, sub } pair — head is the pre-subscript text and sub the
 *   cohort subscript (empty when there is none) — or null when the name does
 *   not match the recognized shape.
 */
export function shortcutOf(name) {
  const m = SHORTCUT_RE.exec(name == null ? '' : String(name));
  if (!m) return null;
  return { head: m[3] + m[2] + (m[4] ? ' ' + m[4] : ''), sub: m[5] || '' };
}

/* ------------------------------------------------------------------ *
 * ClassNode
 * ------------------------------------------------------------------ */

/**
 * A node of the class tree (track, year, specialization, section or cohort).
 * Constructed only by Grouping/assemble; do not build manually.
 */
export class ClassNode {
  constructor(data) {
    this.key = data.key;
    this.level = data.level;
    this.track = data.track || null;
    this.year = data.year || null;
    this.specialization = data.specialization || null;
    this.commonBranch = !!data.commonBranch;
    this.section = data.section || null;
    this.cohort = data.cohort || null;
    this.parent = data.parent || null;
    this.children = [];
    this.rawValues = [];
    this.sessions = [];
    this.grouping = data.grouping || null;

    // Internal flags.
    this.isSpec = !!data.isSpec;
    this._isLeaf = false;

    // Levels view, used by fullName()/compactName().
    this._levels = {
      track: this.track,
      year: this.year,
      specialization: this.specialization,
      commonBranch: this.commonBranch,
      section: this.section,
      cohort: this.cohort
    };
  }

  fullName() { return formatFull(this._levels); }

  compactName() { return formatCompact(this._levels); }

  // A leaf is the deepest *observed* node for at least one raw field. Catalogue
  // nodes that were never observed (e.g. an injected specialization with no
  // data) are not leaves.
  isLeaf() { return this._isLeaf === true; }

  ownsTimetable() { return this.isLeaf(); }

  ancestors() {
    const out = [];
    let p = this.parent;
    while (p) { out.unshift(p); p = p.parent; }
    return out;
  }

  descendants() {
    const out = [];
    const stack = this.children.slice();
    while (stack.length) {
      const n = stack.shift();
      out.push(n);
      for (let i = 0; i < n.children.length; i++) { stack.push(n.children[i]); }
    }
    return out;
  }

  leaves() {
    const out = [];
    if (this._isLeaf) { out.push(this); }
    const desc = this.descendants();
    for (let i = 0; i < desc.length; i++) {
      if (desc[i]._isLeaf) { out.push(desc[i]); }
    }
    return out;
  }

  // Strict ancestry: `o` is a proper descendant of this node.
  isAncestorOf(o) {
    if (!o) { return false; }
    let p = o.parent;
    while (p) { if (p === this) { return true; } p = p.parent; }
    return false;
  }

  // Strict: `o` is a proper ancestor of this node.
  isDescendantOf(o) {
    if (!o) { return false; }
    let p = this.parent;
    while (p) { if (p === o) { return true; } p = p.parent; }
    return false;
  }

  // Inclusive: this node is `o`, or an ancestor of `o`.
  contains(o) {
    return o === this || this.isAncestorOf(o);
  }

  toJSON() {
    const childKeys = [];
    for (let i = 0; i < this.children.length; i++) { childKeys.push(this.children[i].key); }
    return {
      key: this.key,
      level: this.level,
      track: this.track,
      year: this.year,
      specialization: this.specialization,
      commonBranch: this.commonBranch,
      section: this.section,
      cohort: this.cohort,
      parent: this.parent ? this.parent.key : null,
      children: childKeys,
      rawValues: this.rawValues.slice(),
      sessions: this.sessions.length,
      isLeaf: this.isLeaf()
    };
  }
}

/* ------------------------------------------------------------------ *
 * Grouping
 * ------------------------------------------------------------------ */

/**
 * The materialised class tree: a lookup of ClassNodes by canonical key plus
 * the roots/leaves index. Built by build/fromFieldValues/fromRows.
 */
export class Grouping {
  /**
   * @param catalogue — the catalogue-like object the tree was materialised
   *   from (byTrackYear/specNodes/tracks), used for lazy lookups.
   */
  constructor(catalogue) {
    this.catalogue = catalogue;
    this.byKey = {};
    this.roots = [];
    this.nodes = [];
    this.leaves = [];
    this.rawToLeaf = {};
  }

  _add(node) {
    this.byKey[node.key] = node;
    this.nodes.push(node);
    if (node.parent && node.parent.children.indexOf(node) === -1) {
      node.parent.children.push(node);
    } else if (!node.parent && this.roots.indexOf(node) === -1) {
      this.roots.push(node);
    }
    return node;
  }

  // Recompute leaf bookkeeping and level-ordered node helpers.
  _finalize() {
    this.leaves = [];
    for (let i = 0; i < this.nodes.length; i++) {
      if (this.nodes[i]._isLeaf) { this.leaves.push(this.nodes[i]); }
    }
    return this;
  }

  // Candidate specKeys from the catalogue for a parsed ref.
  _candidateSpecKeys(p) {
    const cat = this.catalogue;
    const out = [];
    if (!cat) { return out; }

    if (p.track && p.year) {
      const entry = cat.byTrackYear[p.track + p.year];
      if (!entry) { return out; }
      if (entry.common) {
        out.push(entry.key);
      } else if (p.specialization) {
        const sk = p.specialization + semOf(p.specialization, p.year);
        if (cat.specNodes[sk]) { out.push(sk); }
      } else {
        for (let i = 0; i < entry.specKeys.length; i++) { out.push(entry.specKeys[i]); }
      }
    } else if (p.track && !p.year) {
      const keys = Object.keys(cat.specNodes).sort();
      for (let a = 0; a < keys.length; a++) {
        const n = cat.specNodes[keys[a]];
        if (n.track === p.track && (!p.specialization || n.specialization === p.specialization)) {
          out.push(n.key);
        }
      }
    } else if (!p.track && p.specialization) {
      if (p.year) {
        const one = p.specialization + p.year;
        if (cat.specNodes[one]) { out.push(one); }
      } else {
        const all = Object.keys(cat.specNodes).sort();
        for (let b = 0; b < all.length; b++) {
          if (cat.specNodes[all[b]].specialization === p.specialization) { out.push(all[b]); }
        }
      }
    }
    // de-dupe
    const uniq = [];
    for (let u = 0; u < out.length; u++) { uniquePush(uniq, out[u]); }
    return uniq;
  }

  // Descend a spec node to the section/cohort named by `p`. Returns null when
  // the observed index does not contain that section/cohort.
  _descend(specNode, p) {
    let node = specNode;
    if (p.section) {
      let sec = null;
      for (let i = 0; i < node.children.length; i++) {
        if (node.children[i].section === p.section && node.children[i].level === 'section') {
          sec = node.children[i];
          break;
        }
      }
      if (!sec) { return null; }
      node = sec;
    }
    if (p.cohort) {
      if (node.level !== 'section') { return null; }
      let coh = null;
      for (let j = 0; j < node.children.length; j++) {
        if (node.children[j].cohort === p.cohort) { coh = node.children[j]; break; }
      }
      if (!coh) { return null; }
      node = coh;
    }
    return node;
  }

  // Resolve a reference. Never throws.
  resolve(ref) {
    const p = parseRef(ref, this.catalogue);
    const result = {
      input: p.input,
      normalized: p.normalized,
      status: 'invalid',
      ok: false,
      ambiguous: false,
      level: p.level,
      candidates: [],
      node: null,
      reason: p.reason || null
    };

    if (p.reason) { return result; }

    const specKeys = this._candidateSpecKeys(p);
    if (!specKeys.length) {
      result.reason = p.reason || CODES.UNKNOWN_SPECIALIZATION;
      return result;
    }

    const found = [];
    for (let i = 0; i < specKeys.length; i++) {
      const specNode = this.byKey[specKeys[i]];
      if (!specNode) { continue; }
      const node = this._descend(specNode, p);
      if (node) { found.push(node); }
    }

    if (!found.length) {
      if (p.cohort) { result.reason = CODES.UNKNOWN_COHORT; }
      else if (p.section) { result.reason = CODES.UNKNOWN_SECTION; }
      else { result.reason = CODES.UNKNOWN_SPECIALIZATION; }
      return result;
    }

    result.candidates = found;
    result.ambiguous = found.length > 1;
    result.status = found.length > 1 ? 'ambiguous' : 'ok';
    result.ok = true;
    result.node = found[0];
    result.reason = null;
    return result;
  }

  resolveOne(ref) {
    const r = this.resolve(ref);
    if (r.status === 'invalid') {
      throw new GroupsError(CODES.INVALID_REFERENCE, 'invalid reference: ' + r.input, r.input);
    }
    if (r.status === 'ambiguous') {
      throw new GroupsError(CODES.AMBIGUOUS_REFERENCE, 'ambiguous reference: ' + r.input, r.input);
    }
    return r.node;
  }

  /* --- node lookup helpers ------------------------------------------ */

  _nodeOf(x) {
    if (x instanceof ClassNode) { return x; }
    if (x && typeof x === 'object' && x.key && this.byKey[x.key]) { return this.byKey[x.key]; }
    if (typeof x === 'string') {
      if (has(this.byKey, x)) { return this.byKey[x]; }
      const r = this.resolve(x);
      return r.ok ? r.node : null;
    }
    return null;
  }

  /* --- public Grouping API ------------------------------------------ */

  has(x) {
    if (x instanceof ClassNode) { return has(this.byKey, x.key); }
    if (typeof x === 'string' && has(this.byKey, x)) { return true; }
    if (x && typeof x === 'object' && x.key && has(this.byKey, x.key)) { return true; }
    return this.resolve(x).ok;
  }

  isValid(x) {
    return this.resolve(x).status !== 'invalid';
  }

  levelOf(x) {
    const n = this._nodeOf(x);
    if (n) { return n.level; }
    return parseRef(x, this.catalogue).level;
  }

  children(x) {
    const n = this._nodeOf(x);
    return n ? n.children.slice() : [];
  }

  /**
   * Specialization nodes, optionally filtered by track and year.
   * @param {string} track — track tag filter (case-insensitive); null for all.
   * @param {string} year — track-year filter; null for all.
   * @returns {Array<ClassNode>} the matching specialization nodes.
   */
  specializations(track, year) {
    const t = track ? String(track).toUpperCase() : null;
    const y = year != null ? String(year) : null;
    const out = [];
    for (let i = 0; i < this.nodes.length; i++) {
      const n = this.nodes[i];
      if (!n.isSpec) { continue; }
      if (t && n.track !== t) { continue; }
      if (y && n.year !== y) { continue; }
      out.push(n);
    }
    return out;
  }

  sections(specNodeOrRef) {
    let n = this._nodeOf(specNodeOrRef);
    if (!n) { return []; }
    if (n.level === 'section' && n.parent) { n = n.parent; }
    const out = [];
    for (let i = 0; i < n.children.length; i++) {
      if (n.children[i].level === 'section') { out.push(n.children[i]); }
    }
    return out;
  }

  cohorts(sectionNodeOrRef) {
    let n = this._nodeOf(sectionNodeOrRef);
    if (!n) { return []; }
    if (n.level === 'cohort' && n.parent) { n = n.parent; }
    const out = [];
    for (let i = 0; i < n.children.length; i++) {
      if (n.children[i].level === 'cohort') { out.push(n.children[i]); }
    }
    return out;
  }

  leavesOf(ref) {
    const n = this._nodeOf(ref);
    return n ? n.leaves() : [];
  }

  fieldValues(ref) {
    const n = this._nodeOf(ref);
    return n ? n.rawValues.slice() : [];
  }

  sessions(ref) {
    const n = this._nodeOf(ref);
    if (!n) { return []; }
    const out = n.sessions.slice();
    const desc = n.descendants();
    for (let i = 0; i < desc.length; i++) {
      for (let j = 0; j < desc[i].sessions.length; j++) { out.push(desc[i].sessions[j]); }
    }
    return out;
  }

  contains(outer, inner) {
    const o = this._nodeOf(outer);
    const i = this._nodeOf(inner);
    if (!o || !i) { return false; }
    return o.contains(i);
  }

  isAncestorOf(a, b) {
    const o = this._nodeOf(a);
    const i = this._nodeOf(b);
    if (!o || !i) { return false; }
    return o.isAncestorOf(i);
  }

  isDescendantOf(a, b) {
    const o = this._nodeOf(a);
    const i = this._nodeOf(b);
    if (!o || !i) { return false; }
    return o.isDescendantOf(i);
  }

  leafFor(rawField) {
    if (rawField == null) { return null; }
    if (has(this.rawToLeaf, rawField)) { return this.rawToLeaf[rawField]; }
    const trimmed = String(rawField).replace(/^\s+|\s+$/g, '');
    if (has(this.rawToLeaf, trimmed)) { return this.rawToLeaf[trimmed]; }
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * Builders
 * ------------------------------------------------------------------ */

// Determine the specKey for a parsed field, using the catalogue to fill in a
// specialization that was implied (common branch or single-spec year).
function specKeyForField(cat, p) {
  if (!p.track || !p.year) { return null; }
  const entry = cat.byTrackYear[p.track + p.year];
  if (!entry) { return null; }
  if (entry.common) { return entry.key; }
  if (p.specialization) {
    const sk = p.specialization + semOf(p.specialization, p.year);
    return cat.specNodes[sk] ? sk : null;
  }
  if (entry.specKeys.length === 1) { return entry.specKeys[0]; }
  return null;
}

// Materialise the tree from a catalogue and the observed index.
function assemble(cat, catalogue, fields, rows) {
  const g = new Grouping(catalogue);

  const yearKeys = Object.keys(cat.byTrackYear).sort();
  // Track nodes.
  const trackSet = {};
  for (let i = 0; i < yearKeys.length; i++) {
    trackSet[cat.byTrackYear[yearKeys[i]].track] = true;
  }
  const trackNames = Object.keys(trackSet).sort();
  for (let t = 0; t < trackNames.length; t++) {
    g._add(new ClassNode({
      key: trackNames[t],
      level: 'track',
      track: trackNames[t],
      grouping: g
    }));
  }

  // Year + specialization nodes.
  for (let y = 0; y < yearKeys.length; y++) {
    const entry = cat.byTrackYear[yearKeys[y]];
    const trackNode = g.byKey[entry.track];
    const yearNode = g._add(new ClassNode({
      key: entry.key,
      level: 'year',
      track: entry.track,
      year: entry.year,
      parent: trackNode,
      grouping: g
    }));

    if (entry.common) {
      // The year node doubles as the specialization node.
      yearNode.isSpec = true;
      yearNode.commonBranch = true;
      yearNode.specialization = entry.track;
      yearNode._levels.specialization = entry.track;
      yearNode._levels.commonBranch = true;
    } else {
      for (let s = 0; s < entry.specs.length; s++) {
        const spec = entry.specs[s];
        const specKey = spec + semOf(spec, entry.year);
        // A specKey can be claimed by more than one (track, year) bucket when
        // a catalogue override injects a specialization. Materialise it once.
        if (g.byKey[specKey]) { continue; }
        const specNode = g._add(new ClassNode({
          key: specKey,
          level: 'specialization',
          track: entry.track,
          year: entry.year,
          specialization: spec,
          parent: yearNode,
          isSpec: true,
          grouping: g
        }));
        specNode.commonBranch = false;
        specNode._levels.commonBranch = false;
      }
    }
  }

  // Observed index + sessions.
  function observe(rawField, session) {
    const p = parseRef(rawField, catalogue);
    if (p.reason) { return; }
    const sk = specKeyForField(cat, p);
    if (!sk) { return; }
    let node = g.byKey[sk];
    if (!node) { return; }

    if (p.section) {
      const secKey = sk + p.section;
      let sec = g.byKey[secKey];
      if (!sec) {
        sec = new ClassNode({
          key: secKey,
          level: 'section',
          track: node.track,
          year: node.year,
          specialization: node.specialization,
          commonBranch: node.commonBranch,
          section: p.section,
          parent: node,
          grouping: g
        });
        g._add(sec);
      }
      node = sec;
    }
    if (p.cohort) {
      if (node.level !== 'section') { return; }
      const cohKey = node.key + p.cohort;
      let coh = g.byKey[cohKey];
      if (!coh) {
        coh = new ClassNode({
          key: cohKey,
          level: 'cohort',
          track: node.track,
          year: node.year,
          specialization: node.specialization,
          commonBranch: node.commonBranch,
          section: node.section,
          cohort: p.cohort,
          parent: node,
          grouping: g
        });
        g._add(coh);
      }
      node = coh;
    }

    node._isLeaf = true;
    uniquePush(node.rawValues, rawField);
    g.rawToLeaf[rawField] = node;
    if (session) { node.sessions.push(session); }
  }

  for (let f = 0; f < fields.length; f++) {
    observe(fields[f], null);
  }
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    if (row && typeof row === 'object' && row.field != null) { observe(row.field, row); }
  }

  return g._finalize();
}

/**
 * Main builder: derive (or override) a catalogue from raw field values and/or
 * rows, then materialise the Grouping tree.
 * @param opts — { fields, rows, catalogue, strict }; `fields` is an array-ish
 *   list of raw field strings, `rows` an array-ish list of row objects with a
 *   `.field` property, `catalogue` an optional override (full catalogue or
 *   yearKey -> specs map), `strict` defaults to true.
 * @returns the finished Grouping.
 */
export function build(opts) {
  opts = opts || {};
  let fields = opts.fields;
  let rows = opts.rows;
  const strict = opts.strict !== false;

  if (fields != null && !isArrayLike(fields)) {
    throw new GroupsError(CODES.MALFORMED, 'fields must be an array', null);
  }
  if (rows != null && !isArrayLike(rows)) {
    throw new GroupsError(CODES.MALFORMED, 'rows must be an array', null);
  }

  fields = fields ? toArray(fields) : [];
  rows = rows ? toArray(rows) : [];
  const hasOverride = !!opts.catalogue;

  if (!fields.length && !rows.length && !hasOverride) {
    throw new GroupsError(CODES.EMPTY, 'no fields, rows or catalogue supplied', null);
  }

  // Build the catalogue: derive from data first, then apply an override.
  let cat = emptyCatalogue();
  const inputs = fields.slice();
  for (let i = 0; i < rows.length; i++) {
    if (rows[i] && rows[i].field != null) { inputs.push(rows[i]); }
  }
  if (inputs.length) {
    cat = deriveCatalogue(inputs);
  }

  let catalogue = {
    byTrackYear: cat.byTrackYear,
    specNodes: cat.specNodes,
    tracks: cat.tracks,
    canonicalSpecialization,
    spellings: (() => {
      const m = {};
      for (let s = 0; s < SPEC_TOKENS.length; s++) {
        m[SPEC_TOKENS[s]] = canonicalSpecialization(SPEC_TOKENS[s]);
      }
      return m;
    })()
  };

  if (hasOverride) {
    const replaced = applyCatalogueOverride(
      {
        byTrackYear: cat.byTrackYear,
        specNodes: cat.specNodes,
        tracks: cat.tracks
      },
      opts.catalogue,
      strict
    );
    cat = replaced;
    catalogue = {
      byTrackYear: cat.byTrackYear,
      specNodes: cat.specNodes,
      tracks: cat.tracks,
      canonicalSpecialization,
      spellings: catalogue.spellings
    };
  }

  return assemble(cat, catalogue, fields, rows);
}

/**
 * Build a Grouping from raw field values alone.
 * @param fields — array-ish list of raw field strings.
 * @param opts — { catalogue, strict }, as for build.
 * @returns the finished Grouping.
 */
export function fromFieldValues(fields, opts) {
  opts = opts || {};
  return build({ fields, catalogue: opts.catalogue, strict: opts.strict });
}

/**
 * Build a Grouping from rows with `.field` properties alone.
 * @param rows — array-ish list of row objects (only `.field` is read here).
 * @param opts — { catalogue, strict }, as for build.
 * @returns the finished Grouping.
 */
export function fromRows(rows, opts) {
  opts = opts || {};
  return build({ rows, catalogue: opts.catalogue, strict: opts.strict });
}

// Array-likeness without relying on Array.isArray being present.
function isArrayLike(x) {
  return typeof x === 'object' && x !== null && typeof x.length === 'number';
}
function toArray(x) {
  const out = [];
  for (let i = 0; i < x.length; i++) { out.push(x[i]); }
  return out;
}

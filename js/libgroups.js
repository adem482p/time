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
 * network, the filesystem, `process`, `require` or `Date`. It is written in ES5
 * style (`var` / `function` / IIFE); `Set` and Array methods are used freely.
 *
 * UMD wrapper:
 *   - browser  -> attaches the API to `TT.groups` (creating `TT` if absent)
 *                 and also to `Groups`.
 *   - Node     -> `module.exports` (so ESM users can default-import it).
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module && module.exports) {
    module.exports = api;
  } else {
    if (!root.TT) { root.TT = {}; }
    root.TT.groups = api;
    root.Groups = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ------------------------------------------------------------------ *
   * Constants
   * ------------------------------------------------------------------ */

  // Known tracks, longest tags first so compact input splits greedily.
  var TRACKS = ['LBC', 'LCE', 'LCS', 'MP'];

  // Section identifiers are always a single uppercase letter. The list below
  // describes the *shape* of a section (A..H is the widest real spread); it is
  // not an authoritative census and is not used to validate data.
  var SECTIONS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

  // Cohorts are single digits 1 and 2 when present.
  var COHORTS = ['1', '2'];

  // Known specialization tokens in raw (normalized-uppercase) form, longest
  // first. Their canonical spelling is applied via canonicalSpecialization().
  var SPEC_TOKENS = ['GLSI', 'IRS', 'IOT', 'EXR', 'BI', 'EB', 'SD'];

  var SPEC_START_YEAR = { GLSI:2, BI:2, IRS:2, IOT:2, EB:3, SD:1, EXR:1 };
  var CURRENT_HALF = 1; // all PDFs are "Semestre 1 (du 14/09/26 au 10/01/27)"; flip to 2 for S2 PDFs

  // Program semester for a specialization's track year:
  // 2 * (trackYear - start) + CURRENT_HALF, where start is the track year in
  // which the specialization begins (uppercased lookup, so IoT->IOT works).
  // Common branches (slot === track) never call this.
  function semOf(spec, trackYear) {
    var u = String(spec == null ? '' : spec).toUpperCase();
    var start = SPEC_START_YEAR[u];
    if (start == null) { return String(trackYear); }
    return String(2 * ((+trackYear) - start) + CURRENT_HALF);
  }

  // Level ordering, shallow -> deep.
  var LEVEL_ORDER = ['track', 'year', 'specialization', 'section', 'cohort'];

  // Error codes.
  var CODES = {
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

  // GroupsError extends Error, carries a machine readable `.code` and the
  // offending `.ref` (when there is one). Works with and without `new`.
  function GroupsError(code, message, ref) {
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
    var u = String(token == null ? '' : token).toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (u === 'IOT') { return 'IoT'; }
    return u;
  }

  // True when `t` is one of the known specialization tokens.
  function isKnownSpecialization(t) {
    var u = String(t == null ? '' : t).toUpperCase();
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
  function normalize(str) {
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
    var i = 0;
    while (i < token.length) {
      var rest = token.slice(i);
      var matched = null;

      // try tracks first (no track token overlaps a spec token)
      for (var t = 0; t < TRACKS.length; t++) {
        if (rest.indexOf(TRACKS[t]) === 0) { matched = { type: 'track', value: TRACKS[t] }; break; }
      }
      // then specializations
      if (!matched) {
        for (var s = 0; s < SPEC_TOKENS.length; s++) {
          if (rest.indexOf(SPEC_TOKENS[s]) === 0) { matched = { type: 'spec', value: SPEC_TOKENS[s] }; break; }
        }
      }
      if (matched) {
        out.push(matched);
        i += matched.value.length;
        continue;
      }

      var ch = token.charAt(i);
      out.push(isDigit(ch) ? { type: 'digit', value: ch } : { type: 'letter', value: ch });
      i += 1;
    }
  }

  // Turn a normalized ref into atoms plus an optional out-of-band cohort that
  // was written as a word ("Groupe 1" / "GR 1" / "Group 1").
  function tokenize(normalized) {
    var atoms = [];
    var cohortWord = null;
    if (!normalized) { return { atoms: atoms, cohortWord: cohortWord }; }

    var parts = normalized.split(' ');
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (p === 'GROUPE' || p === 'GROUP' || p === 'GR') {
        if (i + 1 < parts.length && /^[0-9]$/.test(parts[i + 1])) {
          if (cohortWord == null) { cohortWord = parts[i + 1]; }
          i += 1;
        }
        continue;
      }
      splitCompact(p, atoms);
    }
    return { atoms: atoms, cohortWord: cohortWord };
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
    var yearKey = track + year;
    var bucket = cat.byTrackYear[yearKey];
    if (!bucket) {
      bucket = { key: yearKey, track: track, year: year, common: false, specs: [], specKeys: [] };
      cat.byTrackYear[yearKey] = bucket;
      uniquePush(cat.tracks, track);
    }

    var isCommon = (rawSpecs == null || rawSpecs.length === 0);
    var specs;
    if (isCommon) {
      bucket.common = true;
      specs = [track]; // specSlot is the track tag for a common branch
    } else {
      specs = [];
      for (var i = 0; i < rawSpecs.length; i++) {
        var spec = canonicalSpecialization(rawSpecs[i]);
        if (spec) { uniquePush(specs, spec); }
      }
      // A bucket that has explicit specs is not a common branch.
      bucket.common = false;
    }

    for (var j = 0; j < specs.length; j++) {
      var spec = specs[j];
      uniquePush(bucket.specs, spec);
      var slot = isCommon ? track : spec;
      var specKey = isCommon ? slot + year : slot + semOf(spec, year);

      var existing = cat.specNodes[specKey];
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
          track: track,
          year: year,
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
    var buckets = {}; // yearKey -> { track, year, specs: {}, sawSpec }
    for (var i = 0; i < inputs.length; i++) {
      var item = inputs[i];
      var raw = (item && typeof item === 'object') ? item.field : item;
      if (raw == null) { continue; }
      var p = parseRef(raw, null);
      if (!p.track || !p.year) { continue; }
      var yearKey = p.track + p.year;
      var b = buckets[yearKey];
      if (!b) {
        b = { track: p.track, year: p.year, specs: [], sawSpec: false };
        buckets[yearKey] = b;
      }
      if (p.specialization) {
        var spec = canonicalSpecialization(p.specialization);
        uniquePush(b.specs, spec);
        b.sawSpec = true;
      }
    }

    var cat = emptyCatalogue();
    var keys = Object.keys(buckets).sort();
    for (var k = 0; k < keys.length; k++) {
      var bucket = buckets[keys[k]];
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
      var replaced = emptyCatalogue();
      replaced.byTrackYear = override.byTrackYear;
      replaced.specNodes = override.specNodes || {};
      replaced.tracks = override.tracks || Object.keys(override.byTrackYear);
      return replaced;
    }

    var keys = Object.keys(override);
    for (var i = 0; i < keys.length; i++) {
      var yearKey = keys[i];
      var p = parseRef(yearKey, null);
      if (!p.track || !p.year) {
        throw new GroupsError(CODES.MALFORMED, 'invalid catalogue key: ' + yearKey, yearKey);
      }
      var specs = override[yearKey];
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
    var cat = asCatalogue(tokens);
    var input = (ref == null ? '' : String(ref));
    var normalized = normalize(input);

    var out = {
      valid: false,
      reason: null,
      input: input,
      normalized: normalized,
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

    var tk = tokenize(normalized);
    var atoms = tk.atoms;
    var cohortWord = tk.cohortWord;

    if (!atoms.length && !cohortWord) {
      // Nothing usable survived normalization (empty or punctuation-only).
      out.reason = CODES.EMPTY;
      return out;
    }

    // Classify atoms.
    var track = null, spec = null;
    var letters = [], letterIdx = [];
    var digits = [], digitIdx = [];
    for (var i = 0; i < atoms.length; i++) {
      var a = atoms[i];
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

    var section = letters.length === 1 ? letters[0] : null;
    var year = null, cohort = null;

    if (section !== null) {
      var sIdx = letterIdx[0];
      var before = [], after = [];
      for (var d = 0; d < digitIdx.length; d++) {
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
    var canonSpec = spec ? canonicalSpecialization(spec) : null;

    out.track = track;
    out.year = year;
    out.section = section;
    out.cohort = cohort;

    // Catalogue validation (skipped when no catalogue was supplied).
    var specKey = null;
    var commonBranch = false;

    if (cat) {
      if (track && !has(cat, 'byTrackYear')) {
        out.reason = CODES.MALFORMED;
        return out;
      }

      if (track && year) {
        var yearKey = track + year;
        var entry = cat.byTrackYear[yearKey];
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
        var under = [];
        var tkeys = Object.keys(cat.specNodes);
        for (var ti = 0; ti < tkeys.length; ti++) {
          var tn = cat.specNodes[tkeys[ti]];
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
        var matches = [];
        var skeys = Object.keys(cat.specNodes);
        for (var si = 0; si < skeys.length; si++) {
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
  function parseLevels(ref, tokens) { return parseRef(ref, tokens); }
  function parseFullName(ref, tokens) { return parseRef(ref, tokens); }

  /* ------------------------------------------------------------------ *
   * Formatting
   * ------------------------------------------------------------------ */

  // Human readable full name, e.g. `LBC1-A Groupe 1` or `MP1-SD`.
  function formatFull(levels) {
    levels = levels || {};
    var track = levels.track || null;
    var year = levels.year || null;
    var spec = levels.specialization || null;
    var common = !!levels.commonBranch;
    var section = levels.section || null;
    var cohort = levels.cohort || null;

    var s = '';
    if (track && year) { s = String(track) + String(year); }
    else if (track) { s = String(track); }
    else if (year) { s = String(year); }

    var specPrinted = false;
    if (spec && !common && spec !== track) {
      s += (s ? '-' : '') + spec;
      specPrinted = true;
    }
    if (section) { s += (s ? (specPrinted ? '_' : '-') : '') + section; }
    if (cohort) { s += ' Groupe ' + cohort; }
    return s;
  }

  // Compact (canonical key) form, e.g. `EB1A`, `LBC1A`, `GLSI3D1`.
  function formatCompact(levels) {
    levels = levels || {};
    var slot = levels.commonBranch ? levels.track : (levels.specialization || levels.track);
    var sem = levels.commonBranch ? levels.year :
      (levels.year == null ? '' : semOf(levels.specialization || levels.track, levels.year));
    return (slot || '') + (sem || '') + (levels.section || '') + (levels.cohort || '');
  }

  /* ------------------------------------------------------------------ *
   * ClassNode
   * ------------------------------------------------------------------ */

  function ClassNode(data) {
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

  ClassNode.prototype.fullName = function () { return formatFull(this._levels); };
  ClassNode.prototype.compactName = function () { return formatCompact(this._levels); };

  // A leaf is the deepest *observed* node for at least one raw field. Catalogue
  // nodes that were never observed (e.g. an injected specialization with no
  // data) are not leaves.
  ClassNode.prototype.isLeaf = function () { return this._isLeaf === true; };
  ClassNode.prototype.ownsTimetable = function () { return this.isLeaf(); };

  ClassNode.prototype.ancestors = function () {
    var out = [];
    var p = this.parent;
    while (p) { out.unshift(p); p = p.parent; }
    return out;
  };

  ClassNode.prototype.descendants = function () {
    var out = [];
    var stack = this.children.slice();
    while (stack.length) {
      var n = stack.shift();
      out.push(n);
      for (var i = 0; i < n.children.length; i++) { stack.push(n.children[i]); }
    }
    return out;
  };

  ClassNode.prototype.leaves = function () {
    var out = [];
    if (this._isLeaf) { out.push(this); }
    var desc = this.descendants();
    for (var i = 0; i < desc.length; i++) {
      if (desc[i]._isLeaf) { out.push(desc[i]); }
    }
    return out;
  };

  // Strict ancestry: `o` is a proper descendant of this node.
  ClassNode.prototype.isAncestorOf = function (o) {
    if (!o) { return false; }
    var p = o.parent;
    while (p) { if (p === this) { return true; } p = p.parent; }
    return false;
  };

  // Strict: `o` is a proper ancestor of this node.
  ClassNode.prototype.isDescendantOf = function (o) {
    if (!o) { return false; }
    var p = this.parent;
    while (p) { if (p === o) { return true; } p = p.parent; }
    return false;
  };

  // Inclusive: this node is `o`, or an ancestor of `o`.
  ClassNode.prototype.contains = function (o) {
    return o === this || this.isAncestorOf(o);
  };

  ClassNode.prototype.toJSON = function () {
    var childKeys = [];
    for (var i = 0; i < this.children.length; i++) { childKeys.push(this.children[i].key); }
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
  };

  /* ------------------------------------------------------------------ *
   * Grouping
   * ------------------------------------------------------------------ */

  function Grouping(catalogue) {
    this.catalogue = catalogue;
    this.byKey = {};
    this.roots = [];
    this.nodes = [];
    this.leaves = [];
    this.rawToLeaf = {};
  }

  Grouping.prototype._add = function (node) {
    this.byKey[node.key] = node;
    this.nodes.push(node);
    if (node.parent && node.parent.children.indexOf(node) === -1) {
      node.parent.children.push(node);
    } else if (!node.parent && this.roots.indexOf(node) === -1) {
      this.roots.push(node);
    }
    return node;
  };

  // Recompute leaf bookkeeping and level-ordered node helpers.
  Grouping.prototype._finalize = function () {
    this.leaves = [];
    for (var i = 0; i < this.nodes.length; i++) {
      if (this.nodes[i]._isLeaf) { this.leaves.push(this.nodes[i]); }
    }
    return this;
  };

  // Candidate specKeys from the catalogue for a parsed ref.
  Grouping.prototype._candidateSpecKeys = function (p) {
    var cat = this.catalogue;
    var out = [];
    if (!cat) { return out; }

    if (p.track && p.year) {
      var entry = cat.byTrackYear[p.track + p.year];
      if (!entry) { return out; }
      if (entry.common) {
        out.push(entry.key);
      } else if (p.specialization) {
        var sk = p.specialization + semOf(p.specialization, p.year);
        if (cat.specNodes[sk]) { out.push(sk); }
      } else {
        for (var i = 0; i < entry.specKeys.length; i++) { out.push(entry.specKeys[i]); }
      }
    } else if (p.track && !p.year) {
      var keys = Object.keys(cat.specNodes).sort();
      for (var a = 0; a < keys.length; a++) {
        var n = cat.specNodes[keys[a]];
        if (n.track === p.track && (!p.specialization || n.specialization === p.specialization)) {
          out.push(n.key);
        }
      }
    } else if (!p.track && p.specialization) {
      if (p.year) {
        var one = p.specialization + p.year;
        if (cat.specNodes[one]) { out.push(one); }
      } else {
        var all = Object.keys(cat.specNodes).sort();
        for (var b = 0; b < all.length; b++) {
          if (cat.specNodes[all[b]].specialization === p.specialization) { out.push(all[b]); }
        }
      }
    }
    // de-dupe
    var uniq = [];
    for (var u = 0; u < out.length; u++) { uniquePush(uniq, out[u]); }
    return uniq;
  };

  // Descend a spec node to the section/cohort named by `p`. Returns null when
  // the observed index does not contain that section/cohort.
  Grouping.prototype._descend = function (specNode, p) {
    var node = specNode;
    if (p.section) {
      var sec = null;
      for (var i = 0; i < node.children.length; i++) {
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
      var coh = null;
      for (var j = 0; j < node.children.length; j++) {
        if (node.children[j].cohort === p.cohort) { coh = node.children[j]; break; }
      }
      if (!coh) { return null; }
      node = coh;
    }
    return node;
  };

  // Resolve a reference. Never throws.
  Grouping.prototype.resolve = function (ref) {
    var p = parseRef(ref, this.catalogue);
    var result = {
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

    var specKeys = this._candidateSpecKeys(p);
    if (!specKeys.length) {
      result.reason = p.reason || CODES.UNKNOWN_SPECIALIZATION;
      return result;
    }

    var found = [];
    for (var i = 0; i < specKeys.length; i++) {
      var specNode = this.byKey[specKeys[i]];
      if (!specNode) { continue; }
      var node = this._descend(specNode, p);
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
  };

  Grouping.prototype.resolveOne = function (ref) {
    var r = this.resolve(ref);
    if (r.status === 'invalid') {
      throw new GroupsError(CODES.INVALID_REFERENCE, 'invalid reference: ' + r.input, r.input);
    }
    if (r.status === 'ambiguous') {
      throw new GroupsError(CODES.AMBIGUOUS_REFERENCE, 'ambiguous reference: ' + r.input, r.input);
    }
    return r.node;
  };

  /* --- node lookup helpers ------------------------------------------ */

  Grouping.prototype._nodeOf = function (x) {
    if (x instanceof ClassNode) { return x; }
    if (x && typeof x === 'object' && x.key && this.byKey[x.key]) { return this.byKey[x.key]; }
    if (typeof x === 'string') {
      if (has(this.byKey, x)) { return this.byKey[x]; }
      var r = this.resolve(x);
      return r.ok ? r.node : null;
    }
    return null;
  };

  /* --- public Grouping API ------------------------------------------ */

  Grouping.prototype.has = function (x) {
    if (x instanceof ClassNode) { return has(this.byKey, x.key); }
    if (typeof x === 'string' && has(this.byKey, x)) { return true; }
    if (x && typeof x === 'object' && x.key && has(this.byKey, x.key)) { return true; }
    return this.resolve(x).ok;
  };

  Grouping.prototype.isValid = function (x) {
    return this.resolve(x).status !== 'invalid';
  };

  Grouping.prototype.levelOf = function (x) {
    var n = this._nodeOf(x);
    if (n) { return n.level; }
    return parseRef(x, this.catalogue).level;
  };

  Grouping.prototype.children = function (x) {
    var n = this._nodeOf(x);
    return n ? n.children.slice() : [];
  };

  Grouping.prototype.specializations = function (track, year) {
    var t = track ? String(track).toUpperCase() : null;
    var y = year != null ? String(year) : null;
    var out = [];
    for (var i = 0; i < this.nodes.length; i++) {
      var n = this.nodes[i];
      if (!n.isSpec) { continue; }
      if (t && n.track !== t) { continue; }
      if (y && n.year !== y) { continue; }
      out.push(n);
    }
    return out;
  };

  Grouping.prototype.sections = function (specNodeOrRef) {
    var n = this._nodeOf(specNodeOrRef);
    if (!n) { return []; }
    if (n.level === 'section' && n.parent) { n = n.parent; }
    var out = [];
    for (var i = 0; i < n.children.length; i++) {
      if (n.children[i].level === 'section') { out.push(n.children[i]); }
    }
    return out;
  };

  Grouping.prototype.cohorts = function (sectionNodeOrRef) {
    var n = this._nodeOf(sectionNodeOrRef);
    if (!n) { return []; }
    if (n.level === 'cohort' && n.parent) { n = n.parent; }
    var out = [];
    for (var i = 0; i < n.children.length; i++) {
      if (n.children[i].level === 'cohort') { out.push(n.children[i]); }
    }
    return out;
  };

  Grouping.prototype.leavesOf = function (ref) {
    var n = this._nodeOf(ref);
    return n ? n.leaves() : [];
  };

  Grouping.prototype.fieldValues = function (ref) {
    var n = this._nodeOf(ref);
    return n ? n.rawValues.slice() : [];
  };

  Grouping.prototype.sessions = function (ref) {
    var n = this._nodeOf(ref);
    if (!n) { return []; }
    var out = n.sessions.slice();
    var desc = n.descendants();
    for (var i = 0; i < desc.length; i++) {
      for (var j = 0; j < desc[i].sessions.length; j++) { out.push(desc[i].sessions[j]); }
    }
    return out;
  };

  Grouping.prototype.contains = function (outer, inner) {
    var o = this._nodeOf(outer);
    var i = this._nodeOf(inner);
    if (!o || !i) { return false; }
    return o.contains(i);
  };

  Grouping.prototype.isAncestorOf = function (a, b) {
    var o = this._nodeOf(a);
    var i = this._nodeOf(b);
    if (!o || !i) { return false; }
    return o.isAncestorOf(i);
  };

  Grouping.prototype.isDescendantOf = function (a, b) {
    var o = this._nodeOf(a);
    var i = this._nodeOf(b);
    if (!o || !i) { return false; }
    return o.isDescendantOf(i);
  };

  Grouping.prototype.leafFor = function (rawField) {
    if (rawField == null) { return null; }
    if (has(this.rawToLeaf, rawField)) { return this.rawToLeaf[rawField]; }
    var trimmed = String(rawField).replace(/^\s+|\s+$/g, '');
    if (has(this.rawToLeaf, trimmed)) { return this.rawToLeaf[trimmed]; }
    return null;
  };

  /* ------------------------------------------------------------------ *
   * Builders
   * ------------------------------------------------------------------ */

  // Determine the specKey for a parsed field, using the catalogue to fill in a
  // specialization that was implied (common branch or single-spec year).
  function specKeyForField(cat, p) {
    if (!p.track || !p.year) { return null; }
    var entry = cat.byTrackYear[p.track + p.year];
    if (!entry) { return null; }
    if (entry.common) { return entry.key; }
    if (p.specialization) {
      var sk = p.specialization + semOf(p.specialization, p.year);
      return cat.specNodes[sk] ? sk : null;
    }
    if (entry.specKeys.length === 1) { return entry.specKeys[0]; }
    return null;
  }

  // Materialise the tree from a catalogue and the observed index.
  function assemble(cat, catalogue, fields, rows) {
    var g = new Grouping(catalogue);

    var yearKeys = Object.keys(cat.byTrackYear).sort();
    // Track nodes.
    var trackSet = {};
    for (var i = 0; i < yearKeys.length; i++) {
      trackSet[cat.byTrackYear[yearKeys[i]].track] = true;
    }
    var trackNames = Object.keys(trackSet).sort();
    for (var t = 0; t < trackNames.length; t++) {
      g._add(new ClassNode({
        key: trackNames[t],
        level: 'track',
        track: trackNames[t],
        grouping: g
      }));
    }

    // Year + specialization nodes.
    for (var y = 0; y < yearKeys.length; y++) {
      var entry = cat.byTrackYear[yearKeys[y]];
      var trackNode = g.byKey[entry.track];
      var yearNode = g._add(new ClassNode({
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
        for (var s = 0; s < entry.specs.length; s++) {
          var spec = entry.specs[s];
          var specKey = spec + semOf(spec, entry.year);
          // A specKey can be claimed by more than one (track, year) bucket when
          // a catalogue override injects a specialization. Materialise it once.
          if (g.byKey[specKey]) { continue; }
          var specNode = g._add(new ClassNode({
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
      var p = parseRef(rawField, catalogue);
      if (p.reason) { return; }
      var sk = specKeyForField(cat, p);
      if (!sk) { return; }
      var node = g.byKey[sk];
      if (!node) { return; }

      if (p.section) {
        var secKey = sk + p.section;
        var sec = g.byKey[secKey];
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
        var cohKey = node.key + p.cohort;
        var coh = g.byKey[cohKey];
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

    for (var f = 0; f < fields.length; f++) {
      observe(fields[f], null);
    }
    for (var r = 0; r < rows.length; r++) {
      var row = rows[r];
      if (row && typeof row === 'object' && row.field != null) { observe(row.field, row); }
    }

    return g._finalize();
  }

  // Main builder.
  function build(opts) {
    opts = opts || {};
    var fields = opts.fields;
    var rows = opts.rows;
    var strict = opts.strict !== false;

    if (fields != null && !isArrayLike(fields)) {
      throw new GroupsError(CODES.MALFORMED, 'fields must be an array', null);
    }
    if (rows != null && !isArrayLike(rows)) {
      throw new GroupsError(CODES.MALFORMED, 'rows must be an array', null);
    }

    fields = fields ? toArray(fields) : [];
    rows = rows ? toArray(rows) : [];
    var hasOverride = !!opts.catalogue;

    if (!fields.length && !rows.length && !hasOverride) {
      throw new GroupsError(CODES.EMPTY, 'no fields, rows or catalogue supplied', null);
    }

    // Build the catalogue: derive from data first, then apply an override.
    var cat = emptyCatalogue();
    var inputs = fields.slice();
    for (var i = 0; i < rows.length; i++) {
      if (rows[i] && rows[i].field != null) { inputs.push(rows[i]); }
    }
    if (inputs.length) {
      cat = deriveCatalogue(inputs);
    }

    var catalogue = {
      byTrackYear: cat.byTrackYear,
      specNodes: cat.specNodes,
      tracks: cat.tracks,
      canonicalSpecialization: canonicalSpecialization,
      spellings: (function () {
        var m = {};
        for (var s = 0; s < SPEC_TOKENS.length; s++) {
          m[SPEC_TOKENS[s]] = canonicalSpecialization(SPEC_TOKENS[s]);
        }
        return m;
      })()
    };

    if (hasOverride) {
      var replaced = applyCatalogueOverride(
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
        canonicalSpecialization: canonicalSpecialization,
        spellings: catalogue.spellings
      };
    }

    return assemble(cat, catalogue, fields, rows);
  }

  function fromFieldValues(fields, opts) {
    opts = opts || {};
    return build({ fields: fields, catalogue: opts.catalogue, strict: opts.strict });
  }

  function fromRows(rows, opts) {
    opts = opts || {};
    return build({ rows: rows, catalogue: opts.catalogue, strict: opts.strict });
  }

  // Array-likeness without relying on Array.isArray being present.
  function isArrayLike(x) {
    return typeof x === 'object' && x !== null && typeof x.length === 'number';
  }
  function toArray(x) {
    var out = [];
    for (var i = 0; i < x.length; i++) { out.push(x[i]); }
    return out;
  }

  /* ------------------------------------------------------------------ *
   * Public surface
   * ------------------------------------------------------------------ */

  return {
    // constants
    TRACKS: TRACKS,
    SECTIONS: SECTIONS,
    COHORTS: COHORTS,
    CODES: CODES,
    LEVEL_ORDER: LEVEL_ORDER,

    // errors + classes
    GroupsError: GroupsError,
    Grouping: Grouping,
    ClassNode: ClassNode,

    // free functions
    normalize: normalize,
    parseLevels: parseLevels,
    parseFullName: parseFullName,
    formatFull: formatFull,
    formatCompact: formatCompact,

    // builders
    build: build,
    fromFieldValues: fromFieldValues,
    fromRows: fromRows
  };
});

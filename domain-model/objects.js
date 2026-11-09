// domain-model/objects.js — Low-level object construction. No methods, no
// catalogue: every factory takes already-built objects (or primitives) and
// returns a frozen plain object. Programmer errors throw; data outcomes
// (unknown label, missing teacher, …) are handled by query.js / csv.js.

export const Type = Object.freeze({
  YEAR: Symbol('year'),
  SPECIALTY: Symbol('specialty'),
  SEMESTER: Symbol('semester'),
  CLASS: Symbol('class'),
  SESSION: Symbol('session')
});

export const DAYS = Object.freeze(['LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI']);
export const SLOTS = Object.freeze(['08h15-09h45', '10h00-11h30', '11h40-13h10', '13h20-14h50', '15h00-16h30', '16h45-18h15']);
export const WEEK_PATTERNS = Object.freeze(['every', 'A', 'B']);
export const SESSION_KINDS = Object.freeze(['lecture', 'seminar', 'lab']);

const freeze = (v) => Object.freeze(v);
const clean = (v) => String(v ?? '').trim().replace(/\s+/g, ' ');

/** Global degree semester for an academic year/semester position. G = 2(Y-1)+S. */
export function globalSemester(yearNumber, withinYear) {
  return 2 * (yearNumber - 1) + withinYear;
}

/** Academic year + semester-within-year for a global degree semester. */
export function yearAndWithinYear(global) {
  return { yearNumber: Math.floor((global - 1) / 2) + 1, withinYear: ((global - 1) % 2) + 1 };
}

/**
 * Track is a specifier: a plain uppercase string, not an entity.
 * `makeYear('LCS', 3)` → {track:'LCS', number:3, label:'LCS3'}.
 */
export function makeYear(track, number) {
  const t = clean(track).toUpperCase();
  if (!/^[A-Z][A-Z0-9-]*$/.test(t)) throw new Error(`Invalid track specifier: ${track}`);
  const n = Number(number);
  if (!Number.isInteger(n) || n < 1) throw new Error(`Invalid year number: ${number}`);
  return freeze({ type: Type.YEAR, track: t, number: n, label: `${t}${n}` });
}

/**
 * Specialty = curricular path identity (GLSI), not a per-semester object.
 */
export function makeSpecialty(code, track, { startsYear, durationSemesters } = {}) {
  const c = clean(code);
  if (!/^[A-Za-z][A-Za-z0-9-]*$/.test(c)) throw new Error(`Invalid specialty code: ${code}`);
  const t = clean(track).toUpperCase();
  if (!/^[A-Z][A-Z0-9-]*$/.test(t)) throw new Error(`Invalid track specifier: ${track}`);
  const sy = Number(startsYear);
  if (!Number.isInteger(sy) || sy < 1) throw new Error('startsYear must be a positive integer');
  const dur = Number(durationSemesters);
  if (!Number.isInteger(dur) || dur < 1) throw new Error('durationSemesters must be a positive integer');
  return freeze({ type: Type.SPECIALTY, code: c, track: t, startsYear: sy, durationSemesters: dur, label: c });
}

/**
 * Semester = one specialty semester, counted from the specialty start.
 * GLSI3 is GLSI's 3rd semester (Y3·S1 when GLSI starts Y2·S1).
 * `year` must be the matching Year object — a wrong one does not type-check.
 */
export function makeSemester(specialty, index, year) {
  if (specialty?.type !== Type.SPECIALTY) throw new Error('makeSemester needs a Specialty');
  if (year?.type !== Type.YEAR) throw new Error('makeSemester needs a Year');
  const i = Number(index);
  if (!Number.isInteger(i) || i < 1 || i > specialty.durationSemesters) {
    throw new Error(`Semester index ${index} outside 1..${specialty.durationSemesters} for ${specialty.code}`);
  }
  const global = globalSemester(specialty.startsYear, 1) + i - 1;
  const expected = yearAndWithinYear(global);
  if (year.track !== specialty.track || year.number !== expected.yearNumber) {
    throw new Error(
      `${specialty.code} semester ${i} is in ${specialty.track}${expected.yearNumber}, not ${year.label}`
    );
  }
  return freeze({
    type: Type.SEMESTER,
    specialty,
    index: i,
    year,
    withinYear: expected.withinYear,
    label: `${specialty.code}${i}`
  });
}

/**
 * Class = a Semester (or trunk Year) qualified by an optional group and an
 * optional cohort. No group/cohort → singleton class, whose label equals the
 * Semester/Year label. A Stage/Semester with groups has NO singleton class.
 */
export function makeClass(semesterOrYear, group = null, cohort = null) {
  if (semesterOrYear?.type !== Type.SEMESTER && semesterOrYear?.type !== Type.YEAR) {
    throw new Error('makeClass needs a Semester or a Year');
  }
  const g = group == null || group === '' ? null : clean(group).toUpperCase();
  if (g != null && !/^[A-Z]+$/.test(g)) throw new Error(`Invalid group: ${group}`);
  const c = cohort == null || cohort === '' ? null : Number(cohort);
  if (c != null && (c !== 1 && c !== 2)) throw new Error(`Invalid cohort: ${cohort}`);
  if (c != null && g == null) throw new Error('A cohort requires a group');
  const label = g == null
    ? semesterOrYear.label
    : `${semesterOrYear.label} ${g}${c == null ? '' : c}`;
  return freeze({ type: Type.CLASS, semester: semesterOrYear, group: g, cohort: c, label });
}

/**
 * Expand a Semester/Year into its classes.
 * groups: [{group:'A', cohorts:2}] → group class + A1 + A2.
 * groups: [] → [singleton class].
 */
export function makeClasses(semesterOrYear, groups = []) {
  if (!Array.isArray(groups)) throw new Error('groups must be an array');
  if (groups.length === 0) return [makeClass(semesterOrYear)];
  const out = [];
  for (const entry of groups) {
    const g = typeof entry === 'string' ? entry : entry?.group;
    const cohorts = typeof entry === 'string' ? 0 : (entry?.cohorts ?? 0);
    if (cohorts !== 0 && cohorts !== 2) throw new Error(`cohorts must be 0 or 2, got ${cohorts}`);
    out.push(makeClass(semesterOrYear, g));
    if (cohorts === 2) {
      out.push(makeClass(semesterOrYear, g, 1), makeClass(semesterOrYear, g, 2));
    }
  }
  return out;
}

/** Granularity is derived from nullability, never stored. */
export function classKind(cls) {
  if (cls?.type !== Type.CLASS) throw new Error('classKind needs a Class');
  if (cls.group == null) return 'singleton';
  return cls.cohort == null ? 'group' : 'cohort';
}

function normalizeWeekPattern(value) {
  const v = clean(value).toUpperCase();
  if (v === '' || v === 'EVERY') return 'every';
  if (v === 'SA') return 'A';
  if (v === 'SB') return 'B';
  if (v === 'S1') throw new Error('week: S1 is a semester label, not a week pattern');
  throw new Error(`Invalid week pattern: ${value}`);
}

/**
 * Session. Required: population, subject, day, slot, source.
 * Optional (null when absent): teacher, room, kind, color.
 */
export function makeSession({
  population,
  subject,
  teacher = null,
  room = null,
  day,
  slot,
  weekPattern = 'every',
  kind = null,
  source,
  color = null
} = {}) {
  if (population?.type !== Type.CLASS && population?.type !== Type.SEMESTER) {
    throw new Error('Session population must be a Class or a Semester');
  }
  const subj = clean(subject);
  if (!subj) throw new Error('subject is required');
  const d = clean(day).toUpperCase();
  if (!DAYS.includes(d)) throw new Error(`Invalid day: ${day}`);
  const s = clean(slot).toLowerCase();
  if (!SLOTS.includes(s)) throw new Error(`Invalid slot: ${slot}`);
  const src = clean(source);
  if (!src) throw new Error('source is required');
  const t = clean(teacher) || null;
  const r = clean(room) || null;
  const wp = normalizeWeekPattern(weekPattern);
  const k = kind == null || kind === '' ? null : clean(kind).toLowerCase();
  if (k != null && !SESSION_KINDS.includes(k)) throw new Error(`Invalid session kind: ${kind}`);
  if (k === 'lecture' && population.type !== Type.SEMESTER) {
    throw new Error('A lecture addresses a Semester');
  }
  if (k === 'seminar' && !(population.type === Type.CLASS && population.group != null && population.cohort == null)) {
    throw new Error('A seminar addresses a group class');
  }
  if (k === 'lab' && !(population.type === Type.CLASS && population.group != null && population.cohort != null)) {
    throw new Error('A lab addresses a cohort class');
  }
  const col = color == null || color === '' ? null : clean(color).toLowerCase();
  if (col != null && !/^#[0-9a-f]{6}$/.test(col)) throw new Error(`Invalid color: ${color}`);
  return freeze({
    type: Type.SESSION,
    population,
    subject: subj,
    teacher: t,
    room: r,
    day: d,
    slot: s,
    weekPattern: wp,
    kind: k,
    source: src,
    color: col
  });
}

// ---- type guards (reflective API) ----
export const isYear = (o) => o?.type === Type.YEAR;
export const isSpecialty = (o) => o?.type === Type.SPECIALTY;
export const isSemester = (o) => o?.type === Type.SEMESTER;
export const isClass = (o) => o?.type === Type.CLASS;
export const isSession = (o) => o?.type === Type.SESSION;

// ---- navigation properties as functions ----
/** Track specifier string of any curricular object (null for sessions). */
export function trackOf(o) {
  if (isYear(o)) return o.track;
  if (isSpecialty(o)) return o.track;
  if (isSemester(o)) return o.specialty.track;
  if (isClass(o)) return trackOf(o.semester);
  return null;
}

/** Year object of any object at/under a level (null for Specialty/Session). */
export function yearOf(o) {
  if (isYear(o)) return o;
  if (isSemester(o)) return o.year;
  if (isClass(o)) return yearOf(o.semester);
  return null;
}

/** Specialty path object, or null for trunk-year objects. */
export function specialtyOf(o) {
  if (isSemester(o)) return o.specialty;
  if (isClass(o)) return specialtyOf(o.semester);
  return null;
}

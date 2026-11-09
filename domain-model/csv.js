// domain-model/csv.js — CSV reader. Owns the publication notation
// (LBC2-BI_A Groupe 1, MP1-EXR, …); the core model only ever sees canonical
// labels. Constructs the catalog's sessions from CSV data.

import { makeSession, globalSemester } from './objects.js';
import { makeCatalog } from './catalog.js';
import { resolve } from './query.js';

/** Parse CSV text (quoted fields, CRLF) into row objects keyed by header. */
export function parseCsvRows(text) {
  const rows = [];
  let row = [], cur = '', inQ = false;
  const src = String(text ?? '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQ) {
      if (c === '"') {
        if (src[i + 1] === '"') { cur += '"'; i++; }
        else inQ = false;
      } else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cur); cur = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  const head = (rows.shift() || []).map((h) => h.trim());
  return rows.map((r) => {
    const o = {};
    head.forEach((h, j) => { o[h] = (r[j] ?? '').trim(); });
    return o;
  });
}

function findSpecialty(catalog, codeUpper) {
  return catalog.specialties.find((s) => s.code.toUpperCase() === codeUpper);
}

function findYear(catalog, track, number) {
  return catalog.years.find((y) => y.track === track && y.number === number);
}

function findSemester(catalog, specialty, index) {
  return catalog.semesters.find((s) => s.specialty === specialty && s.index === index);
}

function findClass(catalog, label) {
  const r = resolve(catalog, label, { as: 'class' });
  return r.type === 'found' ? r.object : null;
}

/**
 * Semester index for a publication field `TRACK<year>-SPEC` at semesterInYear=1
 * (the publication semester). Returns null when outside the specialty's span.
 */
function publicationSemesterIndex(specialty, yearNumber) {
  const index = globalSemester(yearNumber, 1) - globalSemester(specialty.startsYear, 1) + 1;
  return index >= 1 && index <= specialty.durationSemesters ? index : null;
}

/**
 * parsePublicationField(field, catalog)
 * -> {ok:true, population} | {ok:false, errors:[string]}
 * Handles: T-A Groupe 1 · T-BI_A Groupe 1 · T-EB_A · T-EXR · TD (canonical).
 */
export function parsePublicationField(field, catalog) {
  const raw = String(field ?? '').trim().replace(/\s+/g, ' ');
  if (!raw) return { ok: false, errors: ['field is required'] };
  const upper = raw.toUpperCase();

  // 1) TRACK<year>-<SPEC>_<GROUP> [GROUPE <n>]
  let m = upper.match(/^([A-Z]+)(\d+)-([A-Z]+)_([A-Z]+)(?:\s+GROUPE\s+(\d+))?$/);
  if (m) {
    const [, track, yearText, code, group, cohort] = m;
    const specialty = findSpecialty(catalog, code);
    if (!specialty || specialty.track !== track) return { ok: false, errors: [`unknown specialty: ${code} for track ${track}`] };
    const index = publicationSemesterIndex(specialty, Number(yearText));
    if (index == null) return { ok: false, errors: [`${code} has no semester in year ${yearText}`] };
    const semester = findSemester(catalog, specialty, index);
    if (!semester) return { ok: false, errors: [`no semester ${code}${index} in catalog`] };
    const label = `${semester.label} ${group}${cohort ?? ''}`;
    const cls = findClass(catalog, label);
    if (!cls) return { ok: false, errors: [`no class ${label} in catalog`] };
    return { ok: true, population: cls };
  }

  // 2) TRACK<year>-<GROUP> [GROUPE <n>]   (common trunk)
  m = upper.match(/^([A-Z]+)(\d+)-([A-Z]+)(?:\s+GROUPE\s+(\d+))?$/);
  if (m) {
    const [, track, yearText, group, cohort] = m;
    // A bare specialty code (MP1-EXR) also matches this shape — handle it first when catalog-known.
    const asSpecialty = findSpecialty(catalog, group);
    if (asSpecialty && asSpecialty.track === track) {
      const index = publicationSemesterIndex(asSpecialty, Number(yearText));
      if (index == null) return { ok: false, errors: [`${group} has no semester in year ${yearText}`] };
      const semester = findSemester(catalog, asSpecialty, index);
      if (!semester) return { ok: false, errors: [`no semester ${group}${index} in catalog`] };
      const cls = findClass(catalog, semester.label) ?? semester;
      if (cohort) return { ok: false, errors: [`${group}${index} has no cohort classes`] };
      return { ok: true, population: cls };
    }
    if (cohort && !/^\d+$/.test(cohort)) return { ok: false, errors: [`malformed cohort: ${cohort}`] };
    const year = findYear(catalog, track, Number(yearText));
    if (!year) return { ok: false, errors: [`unknown year: ${track}${yearText}`] };
    const label = `${year.label} ${group}${cohort ?? ''}`;
    const cls = findClass(catalog, label);
    if (!cls) return { ok: false, errors: [`no class ${label} in catalog`] };
    return { ok: true, population: cls };
  }

  // 3) Canonical label passthrough (GLSI3 A1, LCS1 A, EXR1, …)
  const asClass = resolve(catalog, raw, { as: 'class' });
  if (asClass.type === 'found') return { ok: true, population: asClass.object };
  const asSemester = resolve(catalog, raw, { as: 'semester' });
  if (asSemester.type === 'found') return { ok: true, population: asSemester.object };
  const asYear = resolve(catalog, raw, { as: 'year' });
  if (asYear.type === 'found') return { ok: true, population: asYear.object };

  return { ok: false, errors: [`unrecognized field notation: ${field}`] };
}

function convertRow(row, catalog) {
  const errors = [];
  const need = (name) => {
    const v = String(row[name] ?? '').trim();
    if (!v) errors.push(`${name} is required`);
    return v;
  };
  const field = need('field');
  const subject = need('subject');
  const day = need('day');
  const slot = need('time');
  const source = need('source');
  let population = null;
  if (field) {
    const parsed = parsePublicationField(field, catalog);
    if (parsed.ok) population = parsed.population;
    else errors.push(...parsed.errors);
  }
  if (errors.length) return { ok: false, errors };
  try {
    return {
      ok: true,
      session: makeSession({
        population,
        subject,
        teacher: String(row.professor ?? '').trim() || null,
        room: String(row.room ?? '').trim() || null,
        day,
        slot,
        weekPattern: String(row.week ?? ''),
        kind: null,
        source,
        color: String(row.color ?? '').trim() || null
      })
    };
  } catch (e) {
    return { ok: false, errors: [e.message] };
  }
}

/**
 * catalogFromCsv({rows | text, catalog})
 * -> {catalog, sessions, rejected:[{row, errors}]}
 * The returned catalog shares every object with the input catalog and adds
 * the sessions (re-indexed), so queries work on either.
 */
export function catalogFromCsv({ rows, text, catalog } = {}) {
  if (!catalog) throw new Error('catalogFromCsv needs a base catalog');
  const list = rows ?? parseCsvRows(text ?? '');
  const sessions = [];
  const rejected = [];
  for (const row of list) {
    const r = convertRow(row, catalog);
    if (r.ok) sessions.push(r.session);
    else rejected.push({ row, errors: r.errors });
  }
  const next = makeCatalog({
    years: catalog.years,
    specialties: catalog.specialties,
    semesters: catalog.semesters,
    classes: catalog.classes,
    sessions: [...catalog.sessions, ...sessions]
  });
  return Object.freeze({ catalog: next, sessions: Object.freeze(sessions), rejected: Object.freeze(rejected) });
}

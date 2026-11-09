// domain-model/catalog.js — The catalog is an index over already-built
// objects. It is assembled from the construction functions in objects.js and
// validates nothing about the curriculum: it only checks label uniqueness
// per kind, so string resolution (query.js) stays total.

import { Type } from './objects.js';

function addTo(map, key, value) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/** kindOf is internal; the public kind names are the `as` values of resolve(). */
const KIND_OF = new Map([
  [Type.YEAR, 'year'],
  [Type.SPECIALTY, 'specialty'],
  [Type.SEMESTER, 'semester'],
  [Type.CLASS, 'class'],
  [Type.SESSION, 'session']
]);
export const kindOf = (o) => KIND_OF.get(o?.type) ?? null;

/**
 * makeCatalog({years, specialties, semesters, classes, sessions})
 * -> frozen {years, specialties, semesters, classes, sessions,
 *            byLabel, byLabelUpper, semestersBySpecialty,
 *            classesBySemester, sessionsByPopulation}
 */
export function makeCatalog({
  years = [],
  specialties = [],
  semesters = [],
  classes = [],
  sessions = []
} = {}) {
  const byLabel = new Map();
  const seen = new Set();
  const indexLabel = (o) => {
    const key = `${kindOf(o)}:${o.label}`;
    if (seen.has(key)) throw new Error(`Duplicate ${kindOf(o)} label: ${o.label}`);
    seen.add(key);
    addTo(byLabel, o.label, o);
  };
  years.forEach(indexLabel);
  specialties.forEach(indexLabel);
  semesters.forEach(indexLabel);
  classes.forEach(indexLabel);

  const byLabelUpper = new Map();
  for (const [label, objs] of byLabel) for (const o of objs) addTo(byLabelUpper, label.toUpperCase(), o);

  const semestersBySpecialty = new Map();
  for (const s of semesters) addTo(semestersBySpecialty, s.specialty, s);

  const classesBySemester = new Map();
  for (const c of classes) addTo(classesBySemester, c.semester, c);

  const sessionsByPopulation = new Map();
  for (const s of sessions) addTo(sessionsByPopulation, s.population, s);

  return Object.freeze({
    years: Object.freeze([...years]),
    specialties: Object.freeze([...specialties]),
    semesters: Object.freeze([...semesters]),
    classes: Object.freeze([...classes]),
    sessions: Object.freeze([...sessions]),
    byLabel,
    byLabelUpper,
    semestersBySpecialty,
    classesBySemester,
    sessionsByPopulation
  });
}

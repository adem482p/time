// domain-model/query.js — Reflective API over a catalog. Every function takes
// the catalog as explicit context (or, for graph walks, just the object).
// Queries return values; they never throw on data outcomes.

import { Type, isYear, isSpecialty, isSemester, isClass } from './objects.js';
import { kindOf } from './catalog.js';

const AS_TO_TYPE = { year: Type.YEAR, specialty: Type.SPECIALTY, semester: Type.SEMESTER, class: Type.CLASS };

// ---- string resolution ----

/**
 * resolve(catalog, string, {as}?) — canonical labels only.
 *  1. normalize: trim, collapse spaces, uppercase for lookup
 *  2. match: byLabelUpper (case-insensitive; canonical label preserved on the object)
 *  3. expect: if `as` given, the match must be of that kind
 * -> {type:'found', object} | {type:'ambiguous', matches}
 *  | {type:'notFound'} | {type:'wrongKind', actual:[kinds]} | {type:'invalid', reason}
 */
export function resolve(catalog, input, { as } = {}) {
  const raw = String(input ?? '').trim().replace(/\s+/g, ' ');
  if (!raw) return Object.freeze({ type: 'invalid', reason: 'empty reference' });
  if (!/^[A-Za-z][A-Za-z0-9-]*\d*( [A-Za-z]+\d*)?$/.test(raw)) {
    return Object.freeze({ type: 'invalid', reason: `malformed reference: ${input}` });
  }
  if (as !== undefined && !(as in AS_TO_TYPE)) throw new Error(`Invalid resolve kind: ${as}`);
  const matches = catalog.byLabelUpper.get(raw.toUpperCase()) ?? [];
  if (matches.length === 0) return Object.freeze({ type: 'notFound' });
  if (as !== undefined) {
    const want = AS_TO_TYPE[as];
    const hit = matches.find((m) => m.type === want);
    if (hit) return Object.freeze({ type: 'found', object: hit });
    return Object.freeze({ type: 'wrongKind', actual: Object.freeze(matches.map(kindOf)) });
  }
  if (matches.length === 1) return Object.freeze({ type: 'found', object: matches[0] });
  return Object.freeze({ type: 'ambiguous', matches: Object.freeze([...matches]) });
}

// ---- graph walks (reflective) ----

/** Direct object references of an object (track specifier strings excluded). */
export function links(o) {
  if (isClass(o)) return [o.semester];
  if (isSemester(o)) return [o.year, o.specialty];
  if (isSession(o)) return [o.population];
  return [];
}

/** Parent in the curricular hierarchy (Year→track string, Class→Semester/Year). */
export function parentOf(o) {
  if (isClass(o)) return o.semester;
  if (isSemester(o)) return o.specialty;
  if (isYear(o)) return o.track;
  return null;
}

/** Ancestors above the object, nearest first (breadth-first). Track appears as a string. */
export function ancestors(o) {
  const out = [];
  const seen = new Set([o]);
  const queue = [o];
  while (queue.length) {
    const cur = queue.shift();
    if (cur == null || typeof cur !== 'object') continue;
    const next = isYear(cur) || isSpecialty(cur) ? [cur.track] : links(cur);
    for (const n of next) {
      if (seen.has(n)) continue;
      seen.add(n);
      out.push(n);
      queue.push(n);
    }
  }
  return out;
}

/** Direct children in the catalog (sessions included under their population). */
export function children(catalog, o) {
  if (isSpecialty(o)) return [...(catalog.semestersBySpecialty.get(o) ?? [])];
  if (isSemester(o) || isYear(o)) return [...(catalog.classesBySemester.get(o) ?? [])];
  if (isClass(o)) return [...(catalog.sessionsByPopulation.get(o) ?? [])];
  return [];
}

/** Everything below an object, depth-first. */
export function descendants(catalog, o) {
  const out = [];
  const seen = new Set();
  const visit = (node) => {
    if (node == null || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    for (const child of children(catalog, node)) {
      out.push(child);
      visit(child);
    }
  };
  if (isYear(o)) {
    for (const s of catalog.semesters) if (s.year === o) { out.push(s); visit(s); }
  }
  visit(o);
  return out;
}

/** Shared objects on the paths from the root to `a` and to `b`. */
export function commonAncestors(a, b) {
  const chain = (o) => [o, ...ancestors(o)];
  const inB = new Set(chain(b));
  return chain(a).filter((x) => inB.has(x));
}

/** True when `a` and `b` share an ancestor of the given kind ('specialty', …). */
export function shareAncestor(a, b, kind) {
  const want = AS_TO_TYPE[kind];
  if (!want) throw new Error(`Invalid ancestor kind: ${kind}`);
  return commonAncestors(a, b).some((x) => x?.type === want);
}

// ---- reduction ----

/**
 * Reduce classes to their broadest complete levels.
 * A node is "covered" when it (or everything below it, decomposed) is in
 * the input: a cohort class needs itself; a group class needs itself or
 * all its cohorts; a Semester/Year needs every catalog class below it
 * (recursively). Returns the minimal covering set of domain objects
 * (Semester | Year | Class) in input order.
 */
export function reduceClasses(catalog, classObjects) {
	const present = new Set(classObjects);
	const childrenOf = (node) => {
		if (isClass(node) && node.group != null && node.cohort == null) {
			return catalog.classes.filter(
				(c) => c.semester === node.semester && c.group === node.group && c.cohort != null
			);
		}
		if (isSemester(node) || isYear(node)) return catalog.classesBySemester.get(node) ?? [];
		return [];
	};
	const covered = (node) => {
		if (present.has(node)) return true;
		const kids = childrenOf(node);
		return kids.length > 0 && kids.every((k) => covered(k));
	};
	const out = [];
	for (const cls of classObjects) {
		// Hoist to the broadest covered ancestor of this class.
		const chain = [cls.semester];
		if (cls.cohort != null) {
			const group = catalog.classes.find(
				(c) => c.semester === cls.semester && c.group === cls.group && c.cohort == null
			);
			if (group) chain.unshift(group);
		}
		let node = null;
		for (const ancestor of [...chain].reverse()) {
			if (covered(ancestor)) { node = ancestor; break; }
		}
		const emit = node ?? cls;
		if (!out.includes(emit)) out.push(emit);
	}
	return out;
}

/**
 * Label-based wrapper: reduce class labels to the labels of their
 * broadest complete levels (e.g. 8 GLSI3 cohort labels -> ['GLSI3']).
 */
export function reduceClassLabels(catalog, labels) {
	const objs = [];
	for (const label of labels) {
		const r = resolve(catalog, label, { as: 'class' });
		if (r.type === 'found') objs.push(r.object);
	}
	return reduceClasses(catalog, objs).map((o) => o.label);
}

// ---- collections ----

export function semestersOf(catalog, specialty) {
  return [...(catalog.semestersBySpecialty.get(specialty) ?? [])].sort((a, b) => a.index - b.index);
}

export function classes(catalog, predicate = () => true) {
  return catalog.classes.filter(predicate);
}

export function sessions(catalog, predicate = () => true) {
  return catalog.sessions.filter(predicate);
}

/** Sessions directly addressed to this exact population object. */
export function sessionsFor(catalog, population) {
  return [...(catalog.sessionsByPopulation.get(population) ?? [])];
}

/** Published = has at least one session (off-semester stages: false, normally). */
export function isPublished(catalog, o) {
  if (isSemester(o) || isYear(o)) {
    return (catalog.classesBySemester.get(o) ?? []).some((c) => sessionsFor(catalog, c).length > 0);
  }
  return sessionsFor(catalog, o).length > 0;
}

/** 'every' overlaps everything; 'A' and 'B' are disjoint. */
export function weeksOverlap(a, b) {
  return a === 'every' || b === 'every' || a === b;
}

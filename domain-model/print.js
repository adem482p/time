// domain-model/print.js — Formatting. Pure functions over model objects.
// Null-safe: missing teacher/room print as '—'.

import { isYear, isSemester, isClass } from './objects.js';

export function formatYear(y) { return y.label; }
export function formatSpecialty(s) { return s.label; }
export function formatSemester(s) { return s.label; }
export function formatClass(c) { return c.label; }

// Domain weekPattern ('every'|'A'|'B') -> display label (''|'SA'|'SB').
export function formatWeekPattern(wp) {
  return wp === 'A' ? 'SA' : wp === 'B' ? 'SB' : '';
}

export function formatPopulation(o) {
  if (isClass(o)) return o.label;
  if (isSemester(o)) return o.label;
  if (isYear(o)) return o.label;
  return '?';
}

export function formatSession(s) {
  const week = s.weekPattern === 'every' ? 'every week' : `week ${s.weekPattern}`;
  return `${s.day} ${s.slot} · ${s.subject} · ${s.teacher ?? '—'} · ${s.room ?? '—'} · ${week} · ${formatPopulation(s.population)}`;
}

/** Indented track → year/semester → class listing, ordered by label. */
export function printTree(catalog, track) {
  const t = String(track ?? '').toUpperCase();
  const lines = [t];
  const years = catalog.years.filter((y) => y.track === t).sort((a, b) => a.number - b.number);
  const semesters = [...catalog.semesters].sort((a, b) =>
    a.specialty.code.localeCompare(b.specialty.code) || a.index - b.index
  );
  const addClasses = (parent, indent) => {
    const cls = (catalog.classesBySemester.get(parent) ?? []).slice().sort((a, b) => a.label.localeCompare(b.label));
    for (const c of cls) lines.push(`${indent}${c.label}`);
  };
  for (const y of years) {
    lines.push(`  ${y.label}`);
    addClasses(y, '    ');
    for (const s of semesters.filter((x) => x.year === y)) {
      lines.push(`    ${s.label}`);
      addClasses(s, '      ');
    }
  }
  return lines.join('\n');
}

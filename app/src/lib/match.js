import { normStr, tokenize, highlightHTML, fuzzyRanges, scoreMatch, mergeRanges } from './search.js';
import { esc } from './data.js';

export function buildIndex(store, modelObjs) {
  const groups = modelObjs.groups;
  const subjects = {};
  store.rows.forEach(r => { if (r.subject) subjects[r.subject] = true; });
  const subjectList = Object.keys(subjects).sort();
  const teachersByNorm = {};
  const subjectsByNorm = {};
  store.teachers.forEach(t => { teachersByNorm[normStr(t)] = t; });
  subjectList.forEach(s => { subjectsByNorm[normStr(s)] = s; });

  return {
    store, groups, teachers: store.teachers, subjects: subjectList,
    teachersByNorm, subjectsByNorm, nodes: groups.byKey,
    entries: []
  };
}

export function classSearch(index, query) {
  const q = String(query == null ? '' : query).trim();
  const entries = Object.keys(index.nodes).map(k => {
    const node = index.nodes[k];
    const sc = index.groups.shortcutOf(node) || { head: node.key, sub: '' };
    const label = node.fullName();
    const displayForm = sc.head + (sc.sub ? ' ' + sc.sub : '');
    return { key: k, label, displayForm, node, sc };
  });

  if (!q) {
    return entries.map(e => ({
      label: e.label, node: e.node, score: 0,
      ranges: null, trackRanges: null, attributeMatches: []
    })).sort((a, b) => a.label.localeCompare(b.label));
  }

  const tokens = tokenize(q);
  const out = [];
  entries.forEach(e => {
    let score = 0;
    let ranges = [];
    let trackRanges = [];
    let ok = true;
    tokens.forEach(t => {
      const sc = scoreMatch(e.displayForm, t);
      if (sc < 0) {
        ok = false;
        return;
      }
      score += sc;
      const r = fuzzyRanges(e.displayForm, t);
      if (r) ranges.push(...r);
      if (e.sc.head && fuzzyRanges(e.sc.head, t)) {
        const tr = fuzzyRanges(e.sc.head, t);
        if (tr) trackRanges.push(...tr);
      }
    });
    if (!ok) return;
    out.push({
      label: e.label, node: e.node, score,
      ranges: ranges.length ? mergeRanges(ranges) : null,
      trackRanges: trackRanges.length ? mergeRanges(trackRanges) : null,
      attributeMatches: []
    });
  });

  return out.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
}

export function liveSearch(index, query, avail) {
  const q = String(query == null ? '' : query).trim();
  const tokens = tokenize(q);
  return index.teachers.map(t => {
    let score = 0;
    let ok = true;
    tokens.forEach(tok => {
      const sc = scoreMatch(t, tok);
      if (sc < 0) ok = false;
      score += sc;
    });
    if (!ok && tokens.length > 0) return null;
    return {
      teacher: t, exact: false, score, relevantSessions: 0,
      nameRanges: null, subjectMatches: [], classMatches: []
    };
  }).filter(Boolean);
}

export function searchSections(index, query, avail) {
  const plain = liveSearch(index, query, avail);
  return { attrs: [], text: query, total: plain.length, sections: [{ key: 'text', label: null, hits: plain }] };
}

export function suggest(index, query) {
  return [];
}

export function shadowText(query, row) {
  return null;
}

export function resolveClass(index, value) {
  const r = index.groups.resolve(value);
  if (r.status === 'ok') return r.node.key;
  return null;
}

export { highlightHTML, nameHTML } from './search.js';

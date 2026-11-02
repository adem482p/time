import { normStr, tokenize, highlightHTML, fuzzyRanges, scoreMatch, mergeRanges } from './search.js';
import { shortcutOf } from './libgroups.js';

export function buildClassIndex(groups) {
  return groups.nodes.map(n => {
    const raws = [];
    n.leaves().forEach(l => l.rawValues.forEach(r => raws.push(r)));
    const sc = shortcutOf(n.fullName()) || { head: n.compactName(), sub: '' };
    const disp = sc.head + (sc.sub ? ' ' + sc.sub : '');
    // Searchable text = display form + attrs + key + fullName + raw values (for exact/prefix matching)
    // Ranges are computed on display form ONLY (per issue 085 algorithm)
    const attrs = [];
    if (n.track) attrs.push(n.track);
    if (n.year) attrs.push(n.year);
    if (n.specialization) attrs.push(n.specialization);
    if (n.section) attrs.push(n.section);
    if (n.cohort) attrs.push(n.cohort);
    const searchableText = [disp, ...attrs, n.key, n.fullName(), ...raws].join(' ');
    return {
      key: n.key, label: n.key, searchableText,
      track: n.track || null, year: n.year || null,
      specialization: n.specialization || null, section: n.section || null, cohort: n.cohort || null,
      sc, node: n
    };
  });
}

export function searchClasses(index, query) {
  const q = String(query == null ? '' : query).trim();

  if (!q) {
    return index.map(e => ({
      label: e.label, node: e.node, score: 0,
      ranges: null, trackRanges: null, attributeMatches: [],
      sc: e.sc
    })).sort((a, b) => cmpByte(a.label, b.label));
  }

  const tokens = tokenize(q);
  const out = [];

  index.forEach(e => {
    // Token-AND: every token must match somewhere in searchable text
    if (!tokens.every(t => e.searchableText.toLowerCase().includes(t.toLowerCase()))) return;

    let score = 0;
    const ranges = [];
    const trackRanges = [];
    const attributeMatches = {};

    // Score own-key bonus first: exact full-name match gets outranking bonus
    const ownFullMatch = e.node.fullName().toLowerCase() === q.toLowerCase();

    tokens.forEach(t => {
      // Score on shortcut display form (head + sub)
      const disp = e.sc.head + (e.sc.sub ? ' ' + e.sc.sub : '');
      const scScore = scoreMatch(disp, t);
      score += Math.max(scScore, 0);

      // Ranges on the DISPLAY FORM (shortcut head + sub) — what the user sees
      const dr = fuzzyRanges(disp, t);
      if (dr) ranges.push(...dr);

      // Track highlight ranges
      if (e.track) {
        const tr = fuzzyRanges(e.track, t);
        if (tr) trackRanges.push(...tr);
      }

      // Attribute matches
      const attrs = [
        ['Track', e.track],
        ['Year', e.year],
        ['Specialty', e.commonBranch ? String(e.track) + String(e.year) : e.specialization],
        ['Groupe', e.section ? String(e.section) + (e.cohort || '') : e.cohort]
      ];
      attrs.forEach(a => {
        if (!a[1]) return;
        const ar = fuzzyRanges(String(a[1]), t);
        if (!ar) return;
        if (!attributeMatches[a[0]])
          attributeMatches[a[0]] = { name: a[0], value: String(a[1]), ranges: [] };
        attributeMatches[a[0]].ranges.push(...ar);
      });
    });

    if (ownFullMatch) score += 1000000;

    out.push({
      label: e.label, node: e.node, score,
      ranges: ranges.length ? mergeRanges(ranges) : null,
      trackRanges: trackRanges.length ? mergeRanges(trackRanges) : null,
      attributeMatches: Object.keys(attributeMatches).map(k => {
        const a = attributeMatches[k];
        a.ranges = mergeRanges(a.ranges);
        return a;
      }),
      sc: e.sc
    });
  });

  return out.sort((a, b) => b.score - a.score || cmpByte(a.label, b.label));
}

export function suggestClasses(index, query) {
  // For suggestions, rank by DISPLAY FORM match only (own-key > alias)
  // Don't use fullName/raw values for scoring - only shortcut head + sub
  const q = String(query == null ? '' : query).trim();
  if (!q) return [];
  
  const tokens = tokenize(q);
  const out = [];
  
  index.forEach(e => {
    // Token-AND on display form only
    const disp = e.sc.head + (e.sc.sub ? ' ' + e.sc.sub : '');
    if (!tokens.every(t => disp.toLowerCase().includes(t.toLowerCase()))) return;
    
    let score = 0;
    const ranges = [];
    tokens.forEach(t => {
      score += Math.max(scoreMatch(disp, t), 0);
      const dr = fuzzyRanges(disp, t);
      if (dr) ranges.push(...dr);
    });
    
    out.push({
      kind: 'class', label: e.key, commit: 'class:' + e.key,
      detail: e.key, score, ranges: ranges.length ? mergeRanges(ranges) : null
    });
  });
  
  return out.sort((a, b) => b.score - a.score || cmpByte(a.label, b.label)).slice(0, 8);
}

function cmpByte(a, b) { return a < b ? -1 : a > b ? 1 : 0; }

export { highlightHTML } from './search.js';

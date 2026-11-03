import { normStr, tokenize, fuzzyRanges, scoreMatch, mergeRanges } from './search.js';
import { esc } from './data.js';

export function buildTeacherIndex(store, groups) {
  const teachers = store.teachers;
  const index = teachers.map(t => {
    const sessions = store.sessionsOf(t);
    const subjects = {};
    const classes = {};
    sessions.forEach(s => {
      if (s.subject) subjects[s.subject] = true;
      if (s.field) {
        const leaf = groups.leafFor(s.field);
        if (leaf) {
          classes[leaf.key] = true;
          leaf.ancestors().forEach(a => classes[a.key] = true);
        }
      }
    });
    return { name: t, subjects: Object.keys(subjects), classes: Object.keys(classes), sessions };
  });
  // The index ships as the flat entries array the page searches; the groups
  // ride along on it as one lookup, the way the merged match.js index used
  // to carry them — the exact-commit relevance below resolves class nodes
  // through index.groups (see covers in searchTeachers), so a committed
  // class key keeps counting "(n relevant)" instead of hitting undefined.
  index.groups = groups;
  return index;
}

export function searchTeachers(index, query, avail) {
  const q = String(query == null ? '' : query).trim();
  if (!q) {
    return index.map(e => ({
      teacher: e.name, exact: false, score: 0, relevantSessions: 0,
      nameRanges: null, subjectMatches: [], classMatches: []
    })).sort((a, b) => a.teacher.localeCompare(b.teacher));
  }

  const tokens = tokenize(q);
  const normQuery = normStr(q);
  const out = [];

  index.forEach(e => {
    let ok = true;
    let total = 0;
    const exactSubjects = {};
    const exactClasses = {};
    const nameRanges = [];
    const subjectMatches = {};
    const classMatches = {};

    tokens.forEach(tok => {
      let best = -1;
      const nr = fuzzyRanges(e.name, tok);
      if (nr) {
        best = tokenScore(e.name, tok);
        nameRanges.push(...nr);
      }
      if (normStr(e.name) === tok) exactSubjects[e.name] = true;

      e.subjects.forEach(s => {
        const sr = fuzzyRanges(s, tok);
        if (!sr) return;
        const sc = tokenScore(s, tok);
        if (sc > best) best = sc;
        if (!subjectMatches[s]) subjectMatches[s] = { label: s, ranges: [], score: 0 };
        subjectMatches[s].ranges.push(...sr);
        subjectMatches[s].score = Math.max(subjectMatches[s].score, sc);
        if (normStr(s) === tok) { exactSubjects[s] = true; }
      });

      e.classes.forEach(c => {
        const cr = fuzzyRanges(c, tok);
        if (!cr) return;
        const sc = tokenScore(c, tok);
        if (sc > best) best = sc;
        if (!classMatches[c]) classMatches[c] = { label: c, ranges: [], score: 0 };
        classMatches[c].ranges.push(...cr);
        classMatches[c].score = Math.max(classMatches[c].score, sc);
      });

      if (best < 0) { ok = false; return; }
      total += best;
    });

    if (!ok) return;

    // Whole-query exact matches
    if (normStr(e.name) === normQuery) exactSubjects[e.name] = true;
    e.subjects.forEach(s => { if (normStr(s) === normQuery) exactSubjects[s] = true; });
    e.classes.forEach(c => { if (c === normQuery || c === q) exactClasses[c] = true; });

    const exact = Object.keys(exactSubjects).length > 0 || Object.keys(exactClasses).length > 0;

    // relevantSessions for exact matches
    let relevantSessions = 0;
    if (exact) {
      const ec = Object.keys(exactClasses);
      const es = Object.keys(exactSubjects);
      e.sessions.forEach(s => {
        let okk = true;
        for (let j = 0; j < ec.length; j++)
          if (!covers(index.groups, ec[j], s.field)) { okk = false; break; }
        if (!okk) return;
        for (let j = 0; j < es.length; j++)
          if (normStr(s.subject) !== normStr(es[j])) { okk = false; break; }
        if (okk) relevantSessions++;
      });
    }

    out.push({
      teacher: e.name, exact, score: total, relevantSessions,
      nameRanges: nameRanges.length ? mergeRanges(nameRanges) : null,
      subjectMatches: Object.values(subjectMatches).map(m => ({ ...m, ranges: mergeRanges(m.ranges) })),
      classMatches: Object.values(classMatches).map(m => ({ ...m, ranges: mergeRanges(m.ranges) }))
    });
  });

  return out.sort((a, b) => {
    if (a.exact !== b.exact) return a.exact ? -1 : 1;
    if (b.score !== a.score) return b.score - a.score;
    if (b.relevantSessions !== a.relevantSessions) return b.relevantSessions - a.relevantSessions;
    return a.teacher.localeCompare(b.teacher);
  });
}

export { searchTeachers as liveSearch };

function covers(groups, nodeKey, field) {
  const leaf = groups.leafFor(field);
  const node = groups.byKey[nodeKey];
  return !!(leaf && node && node.contains(leaf));
}

function tokenScore(s, token) {
  const sl = s.toLowerCase();
  const tl = token.toLowerCase();
  const i = sl.indexOf(tl);
  if (i !== -1) return 1000 - i;
  let pos = 0, first = -1, last = -1;
  for (let k = 0; k < tl.length; k++) {
    const j = sl.indexOf(tl[k], pos);
    if (j === -1) return -1;
    if (first === -1) first = j;
    last = j;
    pos = j + 1;
  }
  return 500 - (last - first);
}

function avRank(avail, t) {
  const v = avail ? avail[t] : null;
  return v === 'today' ? 0 : v === 'tomorrow' ? 1 : 2;
}

export function searchSections(index, query, avail) {
  const q = String(query == null ? '' : query).trim();
  const plain = searchTeachers(index, q, avail);
  if (!q && avail) {
    plain.sort((a, b) => avRank(avail, a.teacher) - avRank(avail, b.teacher) || a.teacher.localeCompare(b.teacher));
  }
  return { attrs: [], text: q, total: plain.length, sections: [{ key: 'text', label: null, hits: plain }] };
}

/** Typed suggestions for the teacher page: every teacher name, every
 * distinct subject string and every distinct class key of the index whose
 * text keeps every query token (token-AND, scored with the shared
 * scoreMatch tiers), score-descending with a byte-order label tiebreak,
 * capped at 8. Commits carry the bare text — a picked row falls straight
 * into searchTeachers' token-AND search (issue 085). Dedupe is first-seen in
 * teacher/subject/class order, so labels stay unique and the sort stays
 * fully deterministic. */
export function suggestTeachers(index, query) {
  const q = String(query == null ? '' : query).trim();
  if (!q) return [];
  const tokens = tokenize(q);
  const seen = {};
  const out = [];
  function cand(kind, text) {
    if (seen[text]) return;
    seen[text] = true;
    let score = 0;
    const rs = [];
    for (let i = 0; i < tokens.length; i++) {
      const r = fuzzyRanges(text, tokens[i]);
      if (!r) return;
      score += Math.max(scoreMatch(text, tokens[i]), 0);
      rs.push(...r);
    }
    out.push({ kind: kind, label: text, commit: text, detail: null,
               score: score, ranges: rs.length ? mergeRanges(rs) : null });
  }
  index.forEach(e => {
    cand('teacher', e.name);
    e.subjects.forEach(s => cand('subject', s));
    e.classes.forEach(c => cand('class', c));
  });
  return out.sort((a, b) => b.score - a.score || cmpByte(a.label, b.label)).slice(0, 8);
}

/** Shadow text: what Enter/Tab completes. The raw typed string (case
 * insensitive, no trim/collapse) must be a proper prefix of the target,
 * otherwise nothing can be completed inline ("machine  " diverges and
 * returns null, issue #2). The bare commit is the target; branch 1 handles
 * commit-prefix completion, branch 3 handles plain label-prefix completion. */
export function shadowText(query, row) {
  const raw = String(query == null ? '' : query);
  if (!raw || !raw.trim() || !row) return null;
  const rl = raw.toLowerCase();
  if (row.commit && row.commit.toLowerCase().indexOf(rl) === 0)
    return { pre: '', rest: row.commit.slice(raw.length) };
  if (row.label && row.label.toLowerCase().indexOf(rl) === 0)
    return { pre: '', rest: row.label.slice(raw.length) };
  return null;
}

// Byte-order tiebreak for suggest labels — the same rule suggestClasses
// applies, kept local like search-classes.js does.
function cmpByte(a, b) { return a < b ? -1 : a > b ? 1 : 0; }

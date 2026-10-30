// app/src/lib/match.js — Layer 3: match module.
// A mini search engine over the store: live fuzzy filtering (one
// heterogeneous, sorted list: exact matches first, then partial), an
// autocomplete with shadow-text completion (including prefix hints like
// `subject:`), and committed exact queries (teacher:/class:/subject:).
// Pure functions: no DOM, no Date — ranking is a deterministic function
// of (rows, query).
import { normStr, cmpByte, localeCmp } from './model.js';
import { esc, redacted, nameHTML as dataNameHTML } from './data.js';

// ---- index -------------------------------------------------------------

function unique(arr) {
  const seen = {};
  const out = [];
  arr.forEach(function (v) { if (!seen[v]) { seen[v] = true; out.push(v); } });
  return out;
}

// Unique descendant raw fields of a node (interior libgroups nodes carry no
// rawValues of their own), sorted for stable display.
function descendantRawValues(node) {
  const seen = {};
  const out = [];
  node.leaves().forEach(function (l) {
    l.rawValues.forEach(function (raw) {
      if (!seen[raw]) { seen[raw] = true; out.push(raw); }
    });
  });
  return out.sort(localeCmp);
}

// Fold a ref to the old issue-010 vocabulary shape (upper-case, no
// separators, no GROUPE keyword). Used only for legacy alias lookup.
function legacyKey(value) {
  return String(value == null ? '' : value).toUpperCase()
    .replace(/GROUPE/g, '').replace(/[-_\s]/g, '');
}

// One index, three typed entry kinds: teacher (exact names), subject
// (exact strings, variants stay distinct), class (one entry per Grouping
// node, track and interior nodes included). Class labels/commits use the
// canonical libgroups key and resolve through the catalogue.
/**
 * Build the search index over `store` (an object with `rows`, `teachers`
 * and `sessionsOf`) and the analysis `modelObjs` — only `modelObjs.groups`
 * (the corpus-wide Grouping) is read. One index entry per teacher and per
 * distinct subject, plus one class entry per Grouping node (byte-sorted)
 * whose `texts` array carries the compact key, the full node name, every
 * ancestor's key and full name, and every descendant raw field plus its
 * section-only form. `subjectList` is the locale-sorted distinct subject
 * strings; `aliasToCanonical` folds legacy issue-010 vocabulary keys to the
 * canonical libgroups keys. Returns the merged index record carrying the
 * store, `groups`, `teachers`, `subjects`, `teachersByNorm`,
 * `subjectsByNorm`, `aliasToCanonical`, `nodes` (a Map-like key -> node
 * lookup) and the flat `entries` array.
 */
export function buildIndex(store, modelObjs) {
  const groups = modelObjs.groups;
  const subjects = {};
  store.rows.forEach(function (r) { if (r.subject) subjects[r.subject] = true; });
  const subjectList = Object.keys(subjects).sort(localeCmp);
  const teachersByNorm = {};
  const subjectsByNorm = {};
  const aliasToCanonical = {};
  store.teachers.forEach(function (t) { teachersByNorm[normStr(t)] = t; });
  subjectList.forEach(function (s) { subjectsByNorm[normStr(s)] = s; });
  const entries = [];
  store.teachers.forEach(function (t) {
    entries.push({ kind: 'teacher', label: t, commit: t, detail: null, texts: [t] });
  });
  subjectList.forEach(function (s) {
    entries.push({ kind: 'subject', label: s, commit: 'subject:' + s, detail: null, texts: [s] });
  });
  // One class entry per node, byte-sorted. texts carry the compact key, the
  // full name, every ancestor's key+full name (the year ancestor is the old
  // "bucket"), and every descendant raw + its section-only form.
  const nodeKeys = Object.keys(groups.byKey).sort(cmpByte);
  nodeKeys.forEach(function (key) {
    const n = groups.byKey[key];
    const raws = descendantRawValues(n);
    const texts = [n.key, n.fullName()];
    n.ancestors().forEach(function (a) { texts.push(a.key); texts.push(a.fullName()); });
    raws.forEach(function (raw) {
      texts.push(raw);
      texts.push(raw.replace(/ Groupe [12]$/, ''));
    });
    entries.push({
      kind: 'class', label: n.key, commit: 'class:' + n.key,
      detail: raws.length
        ? raws[0] + (raws.length > 1 ? ' (+' + (raws.length - 1) + ' more)' : '')
        : null,
      texts: unique(texts)
    });
  });
  // Legacy issue-010 vocabulary: libgroups keeps the track prefix on
  // common-branch year-1 (`LBC1A1`) where the old model dropped it
  // (`BC1A1`). Derived purely from node keys — no field re-parsing.
  groups.nodes.forEach(function (n) {
    if (/^L(?:BC|CE|CS)\d/.test(n.key)) aliasToCanonical[n.key.slice(1)] = n.key;
  });
  return {
    store: store, groups: groups, teachers: store.teachers, subjects: subjectList,
    teachersByNorm: teachersByNorm, subjectsByNorm: subjectsByNorm,
    aliasToCanonical: aliasToCanonical, nodes: groups.byKey, entries: entries
  };
}

// Resolve one class-typed value to a canonical node key (or null).
// `resolve` is catalogue-backed and never throws; it sets node=candidates[0]
// even when ambiguous, so only status==='ok' may be accepted. Ambiguous and
// invalid refs return null (issue-010 boundary: unknown -> zero hits).
/**
 * Resolve one class-typed value to its canonical node key. Returns the
 * node key string, or null when the ref is unknown or ambiguous (the
 * issue-010 boundary: unknown -> zero hits — only a fully-ok resolve is
 * accepted, with a legacy-issue-010 alias fallback first).
 */
export function resolveClass(index, value) {
  const r = index.groups.resolve(value);
  if (r.status === 'ok') return r.node.key;
  const canon = index.aliasToCanonical[legacyKey(value)];
  if (canon) {
    const r2 = index.groups.resolve(canon);
    if (r2.status === 'ok') return r2.node.key;
  }
  return null;
}

// Node keys on a field's path (leaf + ancestors), used for fuzzy class
// matching against what a teacher actually teaches.
function nodesOf(index, field) {
  const leaf = index.groups.leafFor(field);
  return leaf ? [leaf.key].concat(leaf.ancestors().map(function (a) { return a.key; })) : [];
}

// True when `field`'s leaf is covered by the class node `nodeKey`.
function covers(index, nodeKey, field) {
  const leaf = index.groups.leafFor(field);
  const node = index.groups.byKey[nodeKey];
  return !!(leaf && node && node.contains(leaf));
}

// ---- fuzzy primitives ----------------------------------------------------

/**
 * Merge overlapping/adjacent inclusive index ranges into sorted,
 * non-overlapping pairs. Returns the merged range array of
 * Array<Array<number>> (each pair sorted by start).
 */
export function mergeRanges(rs) {
  rs = rs.slice().sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
  const out = [];
  rs.forEach(function (r) {
    const l = out[out.length - 1];
    if (l && r[0] <= l[1]) l[1] = Math.max(l[1], r[1]);
    else out.push(r);
  });
  return out;
}

// Match quality of token against s: contiguous substring scores ~1000
// (earlier is better), scattered subsequence fallback scores <500
// (tighter span is better), no match is -1. Contiguous always wins.
/**
 * Match quality of `token` against `s`: a contiguous substring scores
 * 1000 - offset (earlier is better), a scattered subsequence fallback
 * scores 500 - span (tighter span is better), no match scores -1.
 * Contiguous always wins over subsequence. Returns the numeric score.
 */
export function tokenScore(s, token) {
  const sl = s.toLowerCase();
  const tl = token.toLowerCase();
  const i = sl.indexOf(tl);
  if (i !== -1) return 1000 - i;
  let pos = 0;
  let first = -1;
  let last = -1;
  for (let k = 0; k < tl.length; k++) {
    const ch = tl[k];
    const j = sl.indexOf(ch, pos);
    if (j === -1) return -1;
    if (first === -1) first = j;
    last = j;
    pos = j + 1;
  }
  return 500 - (last - first);
}

// Ranges of s (original indices) matching token: exact substring first,
// else subsequence (fuzzy) fallback. Returns null on no match.
/**
 * Ranges of `s` (original indices) matching `token`: exact substring
 * first, else the subsequence (fuzzy) fallback. Returns the matched
 * Array<Array<number>> pairs merged via mergeRanges, or null on no match
 * (an empty token also yields null).
 */
export function fuzzyRanges(s, token) {
  if (!token) return null;
  const sl = s.toLowerCase();
  const tl = token.toLowerCase();
  const i = sl.indexOf(tl);
  if (i !== -1) return [[i, i + tl.length]];
  let pos = 0;
  const rs = [];
  for (let k = 0; k < tl.length; k++) {
    const j = sl.indexOf(tl[k], pos);
    if (j === -1) return null;
    rs.push([j, j + 1]);
    pos = j + 1;
  }
  return mergeRanges(rs);
}

/**
 * Render `s` as HTML-safe markup with `<mark>` around the matched
 * character ranges. Ranges is either null/empty (plain escaped text) or an
 * Array<Array<number>> of inclusive pairs, merged before slicing. Returns
 * the HTML string.
 */
export function highlightHTML(s, ranges) {
  if (!ranges || !ranges.length) return esc(s);
  let h = '';
  let pos = 0;
  mergeRanges(ranges).forEach(function (r) {
    h += esc(s.slice(pos, r[0])) + '<mark>' + esc(s.slice(r[0], r[1])) + '</mark>';
    pos = r[1];
  });
  return h + esc(s.slice(pos));
}

// The redaction-aware name highlight (issue 061): renders a rectangle instead
// of the teacher name when redaction is on; otherwise the regular highlight.
// highlightHTML stays the generic label renderer (subjects, classes keep marks).
/**
 * The redaction-aware name highlight (issue 061): renders a rectangle
 * instead of the teacher name when redaction mode is on (data.redacted),
 * otherwise the regular `<mark>` highlight of `s` around `ranges` (null or
 * an Array<Array<number>>). Returns the HTML string.
 */
export function nameHTML(s, ranges) { if (redacted()) return dataNameHTML(s); return highlightHTML(s, ranges); }

// ---- live search ----------------------------------------------------------

// Match one teacher against the query. Every whitespace-separated token
// must match the teacher's name, one of their subjects, or one of their
// class nodes (token-AND, issue-010 semantics). `exact` is true when any
// token equals a teacher name, subject, or class by normalized equality.
// relevantSessions counts the teacher's sessions satisfying every exact
// constraint (used to rank the exact block).
function matchTeacher(index, t, q) {
  const tokens = q.toLowerCase().split(/\s+/).filter(Boolean).map(normStr);
  const sessions = index.store.sessionsOf(t);
  const res = { teacher: t, exact: false, score: 0, relevantSessions: 0,
                nameRanges: null, subjectMatches: [], classMatches: [] };
  const sset = {};
  const cset = {};
  let i;
  sessions.forEach(function (s) {
    if (s.subject) sset[s.subject] = true;
    if (s.field) nodesOf(index, s.field).forEach(function (c) { cset[c] = true; });
  });
  const nrAll = [];
  let ok = true;
  let total = 0;
  const exactClasses = {};
  const exactSubjects = {};
  tokens.forEach(function (tok) {
    let best = -1;
    const nr = fuzzyRanges(t, tok);
    if (nr) { best = tokenScore(t, tok); nrAll.push.apply(nrAll, nr); }
    if (normStr(t) === tok) res.exact = true;
    Object.keys(sset).forEach(function (s) {
      const sr = fuzzyRanges(s, tok);
      if (!sr) return;
      const sc = tokenScore(s, tok);
      if (sc > best) best = sc;
      let m = null;
      for (i = 0; i < res.subjectMatches.length; i++)
        if (res.subjectMatches[i].label === s) { m = res.subjectMatches[i]; break; }
      if (!m) { m = { label: s, ranges: [], score: 0 }; res.subjectMatches.push(m); }
      m.ranges = mergeRanges(m.ranges.concat(sr));
      m.score = Math.max(m.score, sc);
      if (normStr(s) === tok) { res.exact = true; exactSubjects[s] = true; }
    });
    Object.keys(cset).forEach(function (c) {
      const cr = fuzzyRanges(c, tok);
      if (!cr) return;
      const sc = tokenScore(c, tok);
      if (sc > best) best = sc;
      let m = null;
      for (i = 0; i < res.classMatches.length; i++)
        if (res.classMatches[i].label === c) { m = res.classMatches[i]; break; }
      if (!m) { m = { label: c, ranges: [], score: 0 }; res.classMatches.push(m); }
      m.ranges = mergeRanges(m.ranges.concat(cr));
      m.score = Math.max(m.score, sc);
    });
    const exactKey = resolveClass(index, tok);
    if (exactKey && cset[exactKey]) { res.exact = true; exactClasses[exactKey] = true; }
    if (best < 0) { ok = false; return; }
    total += best;
  });
  // whole-query exact: the full query equals a teacher name, subject, or
  // class (multi-word subjects would otherwise never be "exact").
  const nq = normStr(q);
  if (normStr(t) === nq) res.exact = true;
  Object.keys(sset).forEach(function (s) {
    if (normStr(s) === nq) { res.exact = true; exactSubjects[s] = true; }
  });
  const exactKeyQ = resolveClass(index, nq);
  if (exactKeyQ && cset[exactKeyQ]) { res.exact = true; exactClasses[exactKeyQ] = true; }
  if (!ok) return null;
  res.score = total;
  res.nameRanges = nrAll.length ? mergeRanges(nrAll) : null;
  if (res.exact) {
    const ec = Object.keys(exactClasses);
    const es = Object.keys(exactSubjects);
    sessions.forEach(function (s) {
      let okk = true;
      let j;
      for (j = 0; j < ec.length; j++)
        if (!covers(index, ec[j], s.field)) { okk = false; break; }
      if (!okk) return;
      for (j = 0; j < es.length; j++)
        if (normStr(s.subject) !== normStr(es[j])) { okk = false; break; }
      if (okk) res.relevantSessions++;
    });
  }
  return res;
}

// Live filtering: one heterogeneous but sorted list. The default
// (empty-query) list raises available-today teachers; filtered lists are
// exact matches first (by subject, name, or class), then partial matches
// ranked by match quality, then relevant hours, then name.
// `avail` is an optional precomputed name -> availability map (the only
// time-dependent input; committed queries never use it).
/**
 * Live filtering: one heterogeneous but sorted hit list. The empty query
 * returns blank result stubs for every teacher, raised by availability
 * (`avail` — an optional precomputed name -> availability map, the only
 * time-dependent input; committed queries never use it). Non-empty
 * queries: exact matches first (by subject, name, or class, with the
 * matching forbidden when any token aligns nothing), then partial matches
 * ranked by match quality (the exact-first tier, then score, then
 * relevantSessions, then name). Returns the sorted hits array — each hit
 * is a result record with teacher (string), exact (boolean), score
 * (number), relevantSessions (number), nameRanges (the range pairs or
 * null), and the subjectMatches / classMatches detail arrays (a Set is
 * never exposed; membership lives in private maps).
 */
export function liveSearch(index, query, avail) {
  const q = String(query == null ? '' : query).trim();
  const avRank = function (t) {
    const v = avail ? avail[t] : null;
    return v === 'today' ? 0 : v === 'tomorrow' ? 1 : 2;
  };
  if (!q) {
    return index.teachers.map(function (t) {
      return { teacher: t, exact: false, score: 0, relevantSessions: 0,
               nameRanges: null, subjectMatches: [], classMatches: [] };
    }).sort(function (a, b) {
      const av = avRank(a.teacher) - avRank(b.teacher);
      return av || a.teacher.localeCompare(b.teacher);
    });
  }
  const hits = [];
  index.teachers.forEach(function (t) {
    const r = matchTeacher(index, t, q);
    if (r) hits.push(r);
  });
  hits.sort(function (a, b) {
    if (a.exact !== b.exact) return a.exact ? -1 : 1;
    if (b.score !== a.score) return b.score - a.score;
    if (b.relevantSessions !== a.relevantSessions)
      return b.relevantSessions - a.relevantSessions;
    return a.teacher.localeCompare(b.teacher);
  });
  return hits;
}

// ---- multi-attribute queries -----------------------------------------------

// A query is a mix of typed constraints (teacher:/class:/subject:) and free
// text. Each constraint resolves to a canonical value; the free text is
// matched fuzzily against name/subject/class, exactly like liveSearch.

// Resolve one constraint to {kind,value,key,label} or null.
function resolveAttr(index, kind, value) {
  const v = String(value == null ? '' : value).trim();
  if (!v) return null;
  if (kind === 'teacher') {
    const t = index.teachersByNorm[normStr(v)];
    return t ? { kind: 'teacher', value: t, key: t, label: t } : null;
  }
  if (kind === 'subject') {
    const s = index.subjectsByNorm[normStr(v)];
    return s ? { kind: 'subject', value: s, key: s, label: s } : null;
  }
  if (kind === 'class') {
    const k = resolveClass(index, v);
    return k ? { kind: 'class', value: k, key: k, label: k } : null;
  }
  return null;
}

// Parse a query into {attrs:[...], text, textTokens}. A constraint's value is
// the longest run of following tokens that resolves in the index; leftover
// tokens fall through to the free text. `+` is an explicit separator (ends
// the current value), and bare tokens resolve class -> subject -> teacher.
/**
 * Parse a query into its typed constraints and free text. A constraint is
 * the longest run of tokens after a teacher:/class:/subject: prefix that
 * resolves in the index; leftover tokens fall through to the free text.
 * `+` is an explicit separator (ends the current value), bare tokens go to
 * the text. Returns the parse record: `attrs` — the resolved constraint
 * records (each with kind, value, key, label; a constraint resolved
 * nowhere keeps key null) — plus `text` and `textTokens` (Array<string>)
 * and the raw `query`.
 */
export function parseQuery(index, text) {
  const src = String(text == null ? '' : text).trim();
  const raw = src ? src.split(/\s+/).filter(Boolean) : [];
  const attrs = [];
  const textTokens = [];
  let i = 0;
  while (i < raw.length) {
    const tok = raw[i];
    if (tok === '+') { i++; continue; }
    const m = /^(teacher|class|subject)\s*:(.*)$/i.exec(tok);
    if (!m) { textTokens.push(tok); i++; continue; }
    const kind = m[1].toLowerCase();
    const run = m[2].trim() ? [m[2].trim()] : [];
    i++;
    while (i < raw.length && raw[i] !== '+' &&
           !/^(teacher|class|subject)\s*:/i.test(raw[i])) { run.push(raw[i]); i++; }
    if (!run.length) continue;
    let picked = null;
    let used = run.length;
    let k;
    for (k = run.length; k >= 1; k--) {
      picked = resolveAttr(index, kind, run.slice(0, k).join(' '));
      if (picked) { used = k; break; }
    }
    if (picked) attrs.push(picked);
    else attrs.push({ kind: kind, value: run.join(' '), key: null, label: run.join(' ') });
    for (k = used; k < run.length; k++) textTokens.push(run[k]);
  }
  return { attrs: attrs, text: textTokens.join(' ').trim(),
           textTokens: textTokens, query: src };
}

// Per-teacher facts reused by every constraint (fields, subjects, sessions).
function teacherAttrCtx(index, t) {
  const sessions = index.store.sessionsOf(t);
  const fields = [];
  const fseen = {};
  const subjects = {};
  sessions.forEach(function (s) {
    if (s.field && !fseen[s.field]) { fseen[s.field] = true; fields.push(s.field); }
    if (s.subject) subjects[normStr(s.subject)] = true;
  });
  return { name: t, fields: fields, subjects: subjects, sessions: sessions };
}

function sessionMatchesAttr(index, attr, s) {
  if (!attr.key) return false;
  if (attr.kind === 'teacher') return true;
  if (attr.kind === 'subject')
    return normStr(s.subject) === normStr(attr.value);
  return covers(index, attr.key, s.field);
}

function attrMatches(index, attr, ctx) {
  if (!attr.key) return false;
  if (attr.kind === 'teacher') return normStr(ctx.name) === normStr(attr.value);
  if (attr.kind === 'subject') return ctx.subjects[normStr(attr.value)] === true;
  return ctx.fields.some(function (f) { return covers(index, attr.key, f); });
}

function attrLabel(attr) { return attr.kind + ' ' + (attr.label || attr.value); }

// Grouped live search. With no typed constraints this is the plain live
// list (one unlabelled section). With constraints the teachers are split
// into ordered sections: matches-all, then each constraint in order, then
// the free-text-only tail. Every teacher lands in exactly one section;
// free text always filters (when present) and ranks within each section.
/**
 * Grouped live search. With no typed constraints this is the plain live
 * list (one unlabelled section). With constraints the teachers are split
 * into ordered sections: matches-all, then each constraint in order, then
 * the free-text-only tail. Every teacher lands in exactly one section;
 * free text always filters (when present) and ranks within each section.
 * `avail` has the same precomputed availability-map shape liveSearch
 * takes. Returns the sections record: `attrs` (the resolved constraint
 * records), `text`, and `sections` — the ordered section records, each
 * with key, label (or null), and `hits` (the same result records
 * liveSearch returns, per section).
 */
export function searchSections(index, query, avail) {
  const parsed = parseQuery(index, query);
  const q = parsed.query;
  if (!parsed.attrs.length) {
    const plain = liveSearch(index, q, avail);
    return { attrs: [], text: q, total: plain.length,
             sections: [{ key: 'text', label: null, hits: plain }] };
  }
  const attrs = parsed.attrs;
  const nAttrs = attrs.length;
  const hasText = parsed.textTokens.length > 0;
  const cache = {};
  function ctxOf(t) {
    if (!cache[t]) cache[t] = teacherAttrCtx(index, t);
    return cache[t];
  }
  const buckets = {};
  function push(k, h) { (buckets[k] = buckets[k] || []).push(h); }
  index.teachers.forEach(function (t) {
    const ctx = ctxOf(t);
    const flags = attrs.map(function (a) { return attrMatches(index, a, ctx); });
    const all = flags.every(Boolean);
    let key = 'all';
    let i;
    if (!all) {
      key = 'text';
      for (i = 0; i < flags.length; i++) if (flags[i]) { key = 'attr:' + i; break; }
      if (key === 'text' && !hasText) return;
    }
    let tr = null;
    if (hasText) {
      tr = matchTeacher(index, t, parsed.text);
      if (!tr) return;
    }
    let rel;
    if (key === 'text') rel = 0;
    else {
      const sel = key === 'all' ? attrs : [attrs[+key.slice(5)]];
      rel = ctx.sessions.filter(function (s) {
        return sel.every(function (a) { return sessionMatchesAttr(index, a, s); });
      }).length;
    }
    push(key, {
      teacher: t, exact: all, score: tr ? tr.score : 0, relevantSessions: rel,
      nameRanges: tr ? tr.nameRanges : null,
      subjectMatches: tr ? tr.subjectMatches : [],
      classMatches: tr ? tr.classMatches : []
    });
  });
  const order = [];
  if (nAttrs >= 2 && buckets['all']) order.push({ key: 'all', label: null });
  if (nAttrs === 1 && buckets['all'])
    order.push({ key: 'all', label: attrLabel(attrs[0]) });
  attrs.forEach(function (a, i) {
    if (buckets['attr:' + i]) order.push({ key: 'attr:' + i, label: attrLabel(a) });
  });
  if (buckets['text']) order.push({ key: 'text', label: 'text match' });
  let total = 0;
  order.forEach(function (sec) {
    sec.hits = buckets[sec.key].sort(function (a, b) {
      return b.score - a.score || b.relevantSessions - a.relevantSessions ||
             a.teacher.localeCompare(b.teacher);
    });
    total += sec.hits.length;
  });
  return { attrs: attrs, text: parsed.text, sections: order, total: total };
}

// ---- autocomplete -----------------------------------------------------------

// The slice of the query the completion replaces. For an open constraint
// (e.g. "class:GLSI3 subject:mach", or a partial multi-word value) it is
// that constraint's value; otherwise it is the whole trailing free-text run
// (so "machine lear" completes to "subject:Machine Learning"). Returns
// {head, kind, value}: head is the untouched prefix the completion appends
// to, kind fixes the candidate kind when inside a constraint.
/**
 * The slice of the query the completion replaces. For an open constraint
 * (e.g. "class:GLSI3 subject:mach", or a partial multi-word value) it is
 * that constraint's value; otherwise it is the whole trailing free-text
 * run (so "machine lear" completes to "subject:Machine Learning"). Returns
 * a record with head, kind and value: head is the untouched prefix the
 * completion appends to, kind fixes the candidate kind when inside a
 * constraint (a string, or null outside one); value is the completion
 * slot's text.
 */
export function completionContext(index, query) {
  const q = String(query == null ? '' : query);
  const re = /\S+/g;
  let m;
  const toks = [];
  while ((m = re.exec(q))) toks.push({ text: m[0], start: m.index });
  if (!toks.length) return { head: q, kind: null, value: '' };
  let i = 0;
  let attrTok = -1;
  let prefixLen = 0;
  let attrEnd = -1;
  let kindLast = null;
  while (i < toks.length) {
    const t = toks[i];
    if (t.text === '+') { i++; continue; }
    const pm = /^(teacher|class|subject)\s*:(.*)$/i.exec(t.text);
    if (!pm) { i++; continue; }
    const kind = pm[1].toLowerCase();
    const runStart = i;
    const run = pm[2].trim() ? [pm[2].trim()] : [];
    i++;
    while (i < toks.length && toks[i].text !== '+' &&
           !/^(teacher|class|subject)\s*:/i.test(toks[i].text)) { run.push(toks[i].text); i++; }
    if (!run.length) continue;
    let used = run.length;
    let k;
    for (k = run.length; k >= 1; k--) {
      if (resolveAttr(index, kind, run.slice(0, k).join(' '))) { used = k; break; }
    }
    attrTok = runStart;
    prefixLen = pm[0].length - pm[2].length;
    attrEnd = runStart + used;
    kindLast = kind;
  }
  if (attrTok >= 0 && attrEnd === toks.length) {
    const start = toks[attrTok].start;
    return { head: q.slice(0, start), kind: kindLast,
             value: q.slice(start + prefixLen).trim() };
  }
  const freeStart = attrTok >= 0 ? toks[attrEnd].start : toks[0].start;
  return { head: q.slice(0, freeStart), kind: null,
           value: q.slice(freeStart).trim() };
}

// Best match of one index entry against a completion value, using the
// issue-029 own/alias tiers: split the entry's texts into OWN identity
// (the entry's own key / own full name) and ALIASES (ancestor key/fullName,
// descendant raw); score each with the prefix > substring > subsequence
// tiers and give own matches a fixed bonus so every own match outranks
// every alias-only match (alias hits are reordered, never filtered).
// Returns {score} or null when no text matches. Shared by suggest() and
// classSearch() so the two never diverge.
function scoreEntry(index, e, value) {
  const lv = value.toLowerCase();
  const node = e.kind === 'class' ? index.nodes[e.label] : null;
  const ownKey = node ? node.key : e.label;
  const ownFull = node ? node.fullName() : null;
  let bestOwn = -1;
  let bestAlias = -1;
  e.texts.forEach(function (t) {
    const tl = t.toLowerCase();
    let s;
    if (tl.indexOf(lv) === 0) s = 2000 - (tl.length - lv.length);
    else if (tl.indexOf(lv) !== -1) s = 1000 - tl.indexOf(lv);
    else s = tokenScore(t, value);
    if (t === ownKey || (ownFull !== null && t === ownFull)) {
      if (s > bestOwn) bestOwn = s;
    } else if (s > bestAlias) bestAlias = s;
  });
  if (bestOwn < 0 && bestAlias < 0) return null;
  return { score: bestOwn >= 0 ? bestOwn + 10000 : bestAlias };
}

// Typed suggestions for the current completion slot: prefix > substring >
// subsequence. Kind is fixed when the slot sits inside a typed constraint,
// otherwise any kind may complete the bare term. Score desc, cap 8.
/**
 * Typed suggestions for the current completion slot: prefix > substring >
 * subsequence tiers (issue-029 own/alias scoring applies underneath). Kind
 * is fixed when the slot sits inside a typed constraint, otherwise any
 * kind may complete the bare term. Returns the suggestion rows array, cap
 * 8, score-descending with a locale-alphabetical tiebreak — each row
 * carries kind (string), label (string), commit (string), detail (string
 * or null), score (number) and ranges (the label's range pairs or null).
 */
export function suggest(index, query) {
  const ctx = completionContext(index, query);
  const value = ctx.value;
  if (!value) return [];
  const out = [];
  index.entries.forEach(function (e) {
    if (ctx.kind && e.kind !== ctx.kind) return;
    const sc = scoreEntry(index, e, value);
    if (!sc) return;
    out.push({ kind: e.kind, label: e.label, commit: ctx.head + e.commit,
               detail: e.detail || null, score: sc.score,
               ranges: fuzzyRanges(e.label, value) });
  });
  return out.sort(function (a, b) {
    return b.score - a.score || a.label.localeCompare(b.label);
  }).slice(0, 8);
}

// ---- class-only live list (classes page, issue 032) -------------------

// Every class node the query touches, ranked with the same own/alias tiers
// as suggest() (via scoreEntry) so the autocomplete and the list never
// diverge. Empty query: the whole catalogue, byte-sorted by key. Ties
// break byte-alphabetically for determinism.
/**
 * Every class node the query touches, ranked with the same own/alias tiers
 * as suggest (via scoreEntry) so the autocomplete and the list never
 * diverge. Empty query: the whole catalogue, byte-sorted by key. Ties
 * break byte-alphabetically for determinism, and a query equal to a
 * canonical full name adds a fixed outranking bonus. Returns the sorted
 * class list rows array — each with label (string), node (its
 * ClassNode-like record), score (number), ranges and trackRanges (merged
 * range pairs or null), and the token-matched attribute records.
 */
export function classSearch(index, query) {
  const q = String(query == null ? '' : query).trim();
  const entries = index.entries.filter(function (e) { return e.kind === 'class'; });
  if (!q) {
    return entries.map(function (e) {
      return { label: e.label, node: index.nodes[e.label], score: 0,
               ranges: null, trackRanges: null, attributeMatches: [] };
    }).sort(function (a, b) { return cmpByte(a.label, b.label); });
  }
  const tokens = q.split(/\s+/).filter(Boolean);
  const out = [];
  entries.forEach(function (e) {
    const node = index.nodes[e.label];
    let score = 0;
    let nameRanges = [];
    let trackRanges = [];
    const attributeMatches = {};
    const attrs = [
      ['Track', node && node.track],
      ['Year', node && node.year],
      ['Specialty', node && (node.commonBranch
        ? String(node.track) + String(node.year) : node.specialization)],
      ['Groupe', node && (node.section
        ? String(node.section) + (node.cohort || '') : node.cohort)]
    ];
    for (let i = 0; i < tokens.length; i++) {
      const sc = scoreEntry(index, e, tokens[i]);
      if (!sc) return;
      score += sc.score;
      const nr = fuzzyRanges(e.label, tokens[i]);
      if (nr) nameRanges = nameRanges.concat(nr);
      if (node && node.track) {
        const tr = fuzzyRanges(node.track, tokens[i]);
        if (tr) trackRanges = trackRanges.concat(tr);
      }
      attrs.forEach(function (a) {
        if (!a[1]) return;
        const ar = fuzzyRanges(String(a[1]), tokens[i]);
        if (!ar) return;
        if (!attributeMatches[a[0]])
          attributeMatches[a[0]] = { name: a[0], value: String(a[1]), ranges: [] };
        attributeMatches[a[0]].ranges =
          attributeMatches[a[0]].ranges.concat(ar);
      });
    }
    // Keep an exact canonical full-name query ahead of entries that only
    // satisfy the same independent tokens through aliases.
    if (node && node.fullName().toLowerCase() === q.toLowerCase()) score += 1000000;
    out.push({ label: e.label, node: node, score: score,
               ranges: nameRanges.length ? mergeRanges(nameRanges) : null,
               trackRanges: trackRanges.length ? mergeRanges(trackRanges) : null,
               attributeMatches: Object.keys(attributeMatches).map(function (k) {
                 const a = attributeMatches[k];
                 a.ranges = mergeRanges(a.ranges);
                 return a;
               }) });
  });
  return out.sort(function (a, b) {
    return b.score - a.score || cmpByte(a.label, b.label);
  });
}

// Shadow text: what Enter/Tab will complete. Returns {pre, rest} where
// pre is an optional prefix hint (e.g. "subject:") shown before the
// remainder, or null when nothing can be completed inline.
//   typed "hass"        -> commit "Hassairi"                  -> rest "airi"
//   typed "glsi"        -> commit "class:GLSI3D1"            -> pre "class:", rest "3D1"
//   typed "algo"        -> commit "subject:Algo Struct…"     -> pre "subject:", rest "o Struct…"
//   typed "subject:al"  -> commit "subject:Algo Struct…"     -> rest "go Struct…"
/**
 * Shadow text: what Enter/Tab will complete. The raw typed string (case
 * insensitive, no trim/collapse) must be a proper prefix of the target
 * commit (or, for typed prefix rows, the label), otherwise nothing can be
 * completed inline ("machine  " diverges and returns null instead of a
 * normalized match, issue #2). Returns a record with pre and rest — pre an
 * optional prefix hint ("subject:") shown before the remainder, or null
 * when nothing can be completed inline.
 */
export function shadowText(query, row) {
  // Space is an ordinary character: the raw typed string (case-insensitive,
  // no trim/collapse) must be a proper prefix of the target, otherwise the
  // ghost disappears (issue #2). E.g. "machine " completes to "Learning"
  // (single space from the user), while "machine  " diverges and returns
  // null instead of a normalized match.
  const raw = String(query == null ? '' : query);
  if (!raw || !raw.trim() || !row) return null;
  const rl = raw.toLowerCase();
  if (row.commit && row.commit.toLowerCase().indexOf(rl) === 0)
    return { pre: '', rest: row.commit.slice(raw.length) };
  const pm = /^(subject|class|teacher):/i.exec(row.commit || '');
  if (pm && row.label && row.label.toLowerCase().indexOf(rl) === 0)
    return { pre: pm[1].toLowerCase() + ':', rest: row.label.slice(raw.length) };
  if (row.label && row.label.toLowerCase().indexOf(rl) === 0)
    return { pre: '', rest: row.label.slice(raw.length) };
  return null;
}

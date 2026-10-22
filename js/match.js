// js/match.js — Layer 3: match module.
// A mini search engine over the store: live fuzzy filtering (one
// heterogeneous, sorted list: exact matches first, then partial), an
// autocomplete with shadow-text completion (including prefix hints like
// `subject:`), and committed exact queries (teacher:/class:/subject:).
// Pure functions: no DOM, no Date — ranking is a deterministic function
// of (rows, query).
var TT = TT || {};
TT.match = (function () {
  var model = TT.model;

  // ---- index -------------------------------------------------------------

  function unique(arr) {
    var seen = {}, out = [];
    arr.forEach(function (v) { if (!seen[v]) { seen[v] = true; out.push(v); } });
    return out;
  }

  // Unique descendant raw fields of a node (interior libgroups nodes carry no
  // rawValues of their own), sorted for stable display.
  function descendantRawValues(node) {
    var seen = {}, out = [];
    node.leaves().forEach(function (l) {
      l.rawValues.forEach(function (raw) {
        if (!seen[raw]) { seen[raw] = true; out.push(raw); }
      });
    });
    return out.sort(model.localeCmp);
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
  function buildIndex(store, modelObjs) {
    var groups = modelObjs.groups;
    var subjects = {};
    store.rows.forEach(function (r) { if (r.subject) subjects[r.subject] = true; });
    var subjectList = Object.keys(subjects).sort(model.localeCmp);
    var teachersByNorm = {}, subjectsByNorm = {}, aliasToCanonical = {};
    store.teachers.forEach(function (t) { teachersByNorm[model.normStr(t)] = t; });
    subjectList.forEach(function (s) { subjectsByNorm[model.normStr(s)] = s; });
    var entries = [];
    store.teachers.forEach(function (t) {
      entries.push({ kind: 'teacher', label: t, commit: t, detail: null, texts: [t] });
    });
    subjectList.forEach(function (s) {
      entries.push({ kind: 'subject', label: s, commit: 'subject:' + s, detail: null, texts: [s] });
    });
    // One class entry per node, byte-sorted. texts carry the compact key, the
    // full name, every ancestor's key+full name (the year ancestor is the old
    // "bucket"), and every descendant raw + its section-only form.
    var nodeKeys = Object.keys(groups.byKey).sort(model.cmpByte);
    nodeKeys.forEach(function (key) {
      var n = groups.byKey[key];
      var raws = descendantRawValues(n);
      var texts = [n.key, n.fullName()];
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
  function resolveClass(index, value) {
    var r = index.groups.resolve(value);
    if (r.status === 'ok') return r.node.key;
    var canon = index.aliasToCanonical[legacyKey(value)];
    if (canon) {
      var r2 = index.groups.resolve(canon);
      if (r2.status === 'ok') return r2.node.key;
    }
    return null;
  }

  // Node keys on a field's path (leaf + ancestors), used for fuzzy class
  // matching against what a teacher actually teaches.
  function nodesOf(index, field) {
    var leaf = index.groups.leafFor(field);
    return leaf ? [leaf.key].concat(leaf.ancestors().map(function (a) { return a.key; })) : [];
  }

  // True when `field`'s leaf is covered by the class node `nodeKey`.
  function covers(index, nodeKey, field) {
    var leaf = index.groups.leafFor(field);
    var node = index.groups.byKey[nodeKey];
    return !!(leaf && node && node.contains(leaf));
  }

  // ---- fuzzy primitives ----------------------------------------------------

  function mergeRanges(rs) {
    rs = rs.slice().sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    var out = [];
    rs.forEach(function (r) {
      var l = out[out.length - 1];
      if (l && r[0] <= l[1]) l[1] = Math.max(l[1], r[1]);
      else out.push(r);
    });
    return out;
  }

  // Match quality of token against s: contiguous substring scores ~1000
  // (earlier is better), scattered subsequence fallback scores <500
  // (tighter span is better), no match is -1. Contiguous always wins.
  function tokenScore(s, token) {
    var sl = s.toLowerCase(), tl = token.toLowerCase();
    var i = sl.indexOf(tl);
    if (i !== -1) return 1000 - i;
    var pos = 0, first = -1, last = -1;
    for (var k = 0; k < tl.length; k++) {
      var ch = tl[k];
      var j = sl.indexOf(ch, pos);
      if (j === -1) return -1;
      if (first === -1) first = j;
      last = j;
      pos = j + 1;
    }
    return 500 - (last - first);
  }

  // Ranges of s (original indices) matching token: exact substring first,
  // else subsequence (fuzzy) fallback. Returns null on no match.
  function fuzzyRanges(s, token) {
    if (!token) return null;
    var sl = s.toLowerCase(), tl = token.toLowerCase();
    var i = sl.indexOf(tl);
    if (i !== -1) return [[i, i + tl.length]];
    var pos = 0, rs = [];
    for (var k = 0; k < tl.length; k++) {
      var j = sl.indexOf(tl[k], pos);
      if (j === -1) return null;
      rs.push([j, j + 1]);
      pos = j + 1;
    }
    return mergeRanges(rs);
  }

  function highlightHTML(s, ranges) {
    if (!ranges || !ranges.length) return TT.data.esc(s);
    var h = '', pos = 0;
    mergeRanges(ranges).forEach(function (r) {
      h += TT.data.esc(s.slice(pos, r[0])) + '<mark>' + TT.data.esc(s.slice(r[0], r[1])) + '</mark>';
      pos = r[1];
    });
    return h + TT.data.esc(s.slice(pos));
  }

  // The redaction-aware name highlight (issue 061): renders a rectangle instead
  // of the teacher name when redaction is on; otherwise the regular highlight.
  // highlightHTML stays the generic label renderer (subjects, classes keep marks).
  function nameHTML(s, ranges) { if (TT.data.redacted()) return TT.data.nameHTML(s); return highlightHTML(s, ranges); }

  // ---- live search ----------------------------------------------------------

  // Match one teacher against the query. Every whitespace-separated token
  // must match the teacher's name, one of their subjects, or one of their
  // class nodes (token-AND, issue-010 semantics). `exact` is true when any
  // token equals a teacher name, subject, or class by normalized equality.
  // relevantSessions counts the teacher's sessions satisfying every exact
  // constraint (used to rank the exact block).
  function matchTeacher(index, t, q) {
    var tokens = q.toLowerCase().split(/\s+/).filter(Boolean).map(model.normStr);
    var sessions = index.store.sessionsOf(t);
    var res = { teacher: t, exact: false, score: 0, relevantSessions: 0,
                nameRanges: null, subjectMatches: [], classMatches: [] };
    var sset = {}, cset = {}, i;
    sessions.forEach(function (s) {
      if (s.subject) sset[s.subject] = true;
      if (s.field) nodesOf(index, s.field).forEach(function (c) { cset[c] = true; });
    });
    var nrAll = [], ok = true, total = 0;
    var exactClasses = {}, exactSubjects = {};
    tokens.forEach(function (tok) {
      var best = -1;
      var nr = fuzzyRanges(t, tok);
      if (nr) { best = tokenScore(t, tok); nrAll.push.apply(nrAll, nr); }
      if (model.normStr(t) === tok) res.exact = true;
      Object.keys(sset).forEach(function (s) {
        var sr = fuzzyRanges(s, tok);
        if (!sr) return;
        var sc = tokenScore(s, tok);
        if (sc > best) best = sc;
        var m = null;
        for (i = 0; i < res.subjectMatches.length; i++)
          if (res.subjectMatches[i].label === s) { m = res.subjectMatches[i]; break; }
        if (!m) { m = { label: s, ranges: [], score: 0 }; res.subjectMatches.push(m); }
        m.ranges = mergeRanges(m.ranges.concat(sr));
        m.score = Math.max(m.score, sc);
        if (model.normStr(s) === tok) { res.exact = true; exactSubjects[s] = true; }
      });
      Object.keys(cset).forEach(function (c) {
        var cr = fuzzyRanges(c, tok);
        if (!cr) return;
        var sc = tokenScore(c, tok);
        if (sc > best) best = sc;
        var m = null;
        for (i = 0; i < res.classMatches.length; i++)
          if (res.classMatches[i].label === c) { m = res.classMatches[i]; break; }
        if (!m) { m = { label: c, ranges: [], score: 0 }; res.classMatches.push(m); }
        m.ranges = mergeRanges(m.ranges.concat(cr));
        m.score = Math.max(m.score, sc);
      });
      var exactKey = resolveClass(index, tok);
      if (exactKey && cset[exactKey]) { res.exact = true; exactClasses[exactKey] = true; }
      if (best < 0) { ok = false; return; }
      total += best;
    });
    // whole-query exact: the full query equals a teacher name, subject, or
    // class (multi-word subjects would otherwise never be "exact").
    var nq = model.normStr(q);
    if (model.normStr(t) === nq) res.exact = true;
    Object.keys(sset).forEach(function (s) {
      if (model.normStr(s) === nq) { res.exact = true; exactSubjects[s] = true; }
    });
    var exactKeyQ = resolveClass(index, nq);
    if (exactKeyQ && cset[exactKeyQ]) { res.exact = true; exactClasses[exactKeyQ] = true; }
    if (!ok) return null;
    res.score = total;
    res.nameRanges = nrAll.length ? mergeRanges(nrAll) : null;
    if (res.exact) {
      var ec = Object.keys(exactClasses), es = Object.keys(exactSubjects);
      sessions.forEach(function (s) {
        var okk = true, j;
        for (j = 0; j < ec.length; j++)
          if (!covers(index, ec[j], s.field)) { okk = false; break; }
        if (!okk) return;
        for (j = 0; j < es.length; j++)
          if (model.normStr(s.subject) !== model.normStr(es[j])) { okk = false; break; }
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
  function liveSearch(index, query, avail) {
    var q = String(query == null ? '' : query).trim();
    var avRank = function (t) {
      var v = avail ? avail[t] : null;
      return v === 'today' ? 0 : v === 'tomorrow' ? 1 : 2;
    };
    if (!q) {
      return index.teachers.map(function (t) {
        return { teacher: t, exact: false, score: 0, relevantSessions: 0,
                 nameRanges: null, subjectMatches: [], classMatches: [] };
      }).sort(function (a, b) {
        var av = avRank(a.teacher) - avRank(b.teacher);
        return av || a.teacher.localeCompare(b.teacher);
      });
    }
    var hits = [];
    index.teachers.forEach(function (t) {
      var r = matchTeacher(index, t, q);
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
    var v = String(value == null ? '' : value).trim();
    if (!v) return null;
    if (kind === 'teacher') {
      var t = index.teachersByNorm[model.normStr(v)];
      return t ? { kind: 'teacher', value: t, key: t, label: t } : null;
    }
    if (kind === 'subject') {
      var s = index.subjectsByNorm[model.normStr(v)];
      return s ? { kind: 'subject', value: s, key: s, label: s } : null;
    }
    if (kind === 'class') {
      var k = resolveClass(index, v);
      return k ? { kind: 'class', value: k, key: k, label: k } : null;
    }
    return null;
  }

  // Parse a query into {attrs:[...], text, textTokens}. A constraint's value is
  // the longest run of following tokens that resolves in the index; leftover
  // tokens fall through to the free text. `+` is an explicit separator (ends
  // the current value), and bare tokens resolve class -> subject -> teacher.
  function parseQuery(index, text) {
    var src = String(text == null ? '' : text).trim();
    var raw = src ? src.split(/\s+/).filter(Boolean) : [];
    var attrs = [], textTokens = [], i = 0;
    while (i < raw.length) {
      var tok = raw[i];
      if (tok === '+') { i++; continue; }
      var m = /^(teacher|class|subject)\s*:(.*)$/i.exec(tok);
      if (!m) { textTokens.push(tok); i++; continue; }
      var kind = m[1].toLowerCase();
      var run = m[2].trim() ? [m[2].trim()] : [];
      i++;
      while (i < raw.length && raw[i] !== '+' &&
             !/^(teacher|class|subject)\s*:/i.test(raw[i])) { run.push(raw[i]); i++; }
      if (!run.length) continue;
      var picked = null, used = run.length, k;
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
    var sessions = index.store.sessionsOf(t);
    var fields = [], fseen = {}, subjects = {};
    sessions.forEach(function (s) {
      if (s.field && !fseen[s.field]) { fseen[s.field] = true; fields.push(s.field); }
      if (s.subject) subjects[model.normStr(s.subject)] = true;
    });
    return { name: t, fields: fields, subjects: subjects, sessions: sessions };
  }

  function sessionMatchesAttr(index, attr, s) {
    if (!attr.key) return false;
    if (attr.kind === 'teacher') return true;
    if (attr.kind === 'subject')
      return model.normStr(s.subject) === model.normStr(attr.value);
    return covers(index, attr.key, s.field);
  }

  function attrMatches(index, attr, ctx) {
    if (!attr.key) return false;
    if (attr.kind === 'teacher') return model.normStr(ctx.name) === model.normStr(attr.value);
    if (attr.kind === 'subject') return ctx.subjects[model.normStr(attr.value)] === true;
    return ctx.fields.some(function (f) { return covers(index, attr.key, f); });
  }

  function attrLabel(attr) { return attr.kind + ' ' + (attr.label || attr.value); }

  // Grouped live search. With no typed constraints this is the plain live
  // list (one unlabelled section). With constraints the teachers are split
  // into ordered sections: matches-all, then each constraint in order, then
  // the free-text-only tail. Every teacher lands in exactly one section;
  // free text always filters (when present) and ranks within each section.
  function searchSections(index, query, avail) {
    var parsed = parseQuery(index, query);
    var q = parsed.query;
    if (!parsed.attrs.length) {
      var plain = liveSearch(index, q, avail);
      return { attrs: [], text: q, total: plain.length,
               sections: [{ key: 'text', label: null, hits: plain }] };
    }
    var attrs = parsed.attrs, nAttrs = attrs.length;
    var hasText = parsed.textTokens.length > 0;
    var cache = {};
    function ctxOf(t) {
      if (!cache[t]) cache[t] = teacherAttrCtx(index, t);
      return cache[t];
    }
    var buckets = {};
    function push(k, h) { (buckets[k] = buckets[k] || []).push(h); }
    index.teachers.forEach(function (t) {
      var ctx = ctxOf(t);
      var flags = attrs.map(function (a) { return attrMatches(index, a, ctx); });
      var all = flags.every(Boolean);
      var key = 'all', i;
      if (!all) {
        key = 'text';
        for (i = 0; i < flags.length; i++) if (flags[i]) { key = 'attr:' + i; break; }
        if (key === 'text' && !hasText) return;
      }
      var tr = null;
      if (hasText) {
        tr = matchTeacher(index, t, parsed.text);
        if (!tr) return;
      }
      var rel;
      if (key === 'text') rel = 0;
      else {
        var sel = key === 'all' ? attrs : [attrs[+key.slice(5)]];
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
    var order = [];
    if (nAttrs >= 2 && buckets['all']) order.push({ key: 'all', label: null });
    if (nAttrs === 1 && buckets['all'])
      order.push({ key: 'all', label: attrLabel(attrs[0]) });
    attrs.forEach(function (a, i) {
      if (buckets['attr:' + i]) order.push({ key: 'attr:' + i, label: attrLabel(a) });
    });
    if (buckets['text']) order.push({ key: 'text', label: 'text match' });
    var total = 0;
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
  function completionContext(index, query) {
    var q = String(query == null ? '' : query);
    var re = /\S+/g, m, toks = [];
    while ((m = re.exec(q))) toks.push({ text: m[0], start: m.index });
    if (!toks.length) return { head: q, kind: null, value: '' };
    var i = 0, attrTok = -1, prefixLen = 0, attrEnd = -1, kindLast = null;
    while (i < toks.length) {
      var t = toks[i];
      if (t.text === '+') { i++; continue; }
      var pm = /^(teacher|class|subject)\s*:(.*)$/i.exec(t.text);
      if (!pm) { i++; continue; }
      var kind = pm[1].toLowerCase();
      var runStart = i, run = pm[2].trim() ? [pm[2].trim()] : [];
      i++;
      while (i < toks.length && toks[i].text !== '+' &&
             !/^(teacher|class|subject)\s*:/i.test(toks[i].text)) { run.push(toks[i].text); i++; }
      if (!run.length) continue;
      var used = run.length, k;
      for (k = run.length; k >= 1; k--) {
        if (resolveAttr(index, kind, run.slice(0, k).join(' '))) { used = k; break; }
      }
      attrTok = runStart; prefixLen = pm[0].length - pm[2].length;
      attrEnd = runStart + used; kindLast = kind;
    }
    if (attrTok >= 0 && attrEnd === toks.length) {
      var start = toks[attrTok].start;
      return { head: q.slice(0, start), kind: kindLast,
               value: q.slice(start + prefixLen).trim() };
    }
    var freeStart = attrTok >= 0 ? toks[attrEnd].start : toks[0].start;
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
    var lv = value.toLowerCase();
    var node = e.kind === 'class' ? index.nodes[e.label] : null;
    var ownKey = node ? node.key : e.label;
    var ownFull = node ? node.fullName() : null;
    var bestOwn = -1, bestAlias = -1;
    e.texts.forEach(function (t) {
      var tl = t.toLowerCase(), s;
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
  function suggest(index, query) {
    var ctx = completionContext(index, query);
    var value = ctx.value;
    if (!value) return [];
    var out = [];
    index.entries.forEach(function (e) {
      if (ctx.kind && e.kind !== ctx.kind) return;
      var sc = scoreEntry(index, e, value);
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
  function classSearch(index, query) {
    var q = String(query == null ? '' : query).trim();
    var entries = index.entries.filter(function (e) { return e.kind === 'class'; });
    if (!q) {
      return entries.map(function (e) {
        return { label: e.label, node: index.nodes[e.label], score: 0,
                 ranges: null, trackRanges: null, attributeMatches: [] };
      }).sort(function (a, b) { return model.cmpByte(a.label, b.label); });
    }
    var tokens = q.split(/\s+/).filter(Boolean);
    var out = [];
    entries.forEach(function (e) {
      var node = index.nodes[e.label];
      var score = 0, nameRanges = [], trackRanges = [], attributeMatches = {};
      var attrs = [
        ['Track', node && node.track],
        ['Year', node && node.year],
        ['Specialty', node && (node.commonBranch
          ? String(node.track) + String(node.year) : node.specialization)],
        ['Groupe', node && (node.section
          ? String(node.section) + (node.cohort || '') : node.cohort)]
      ];
      for (var i = 0; i < tokens.length; i++) {
        var sc = scoreEntry(index, e, tokens[i]);
        if (!sc) return;
        score += sc.score;
        var nr = fuzzyRanges(e.label, tokens[i]);
        if (nr) nameRanges = nameRanges.concat(nr);
        if (node && node.track) {
          var tr = fuzzyRanges(node.track, tokens[i]);
          if (tr) trackRanges = trackRanges.concat(tr);
        }
        attrs.forEach(function (a) {
          if (!a[1]) return;
          var ar = fuzzyRanges(String(a[1]), tokens[i]);
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
                   var a = attributeMatches[k];
                   a.ranges = mergeRanges(a.ranges);
                   return a;
                 }) });
    });
    return out.sort(function (a, b) {
      return b.score - a.score || model.cmpByte(a.label, b.label);
    });
  }

  // Shadow text: what Enter/Tab will complete. Returns {pre, rest} where
  // pre is an optional prefix hint (e.g. "subject:") shown before the
  // remainder, or null when nothing can be completed inline.
  //   typed "hass"        -> commit "Hassairi"                  -> rest "airi"
  //   typed "glsi"        -> commit "class:GLSI3D1"            -> pre "class:", rest "3D1"
  //   typed "algo"        -> commit "subject:Algo Struct…"     -> pre "subject:", rest "o Struct…"
  //   typed "subject:al"  -> commit "subject:Algo Struct…"     -> rest "go Struct…"
  function shadowText(query, row) {
    // Space is an ordinary character: the raw typed string (case-insensitive,
    // no trim/collapse) must be a proper prefix of the target, otherwise the
    // ghost disappears (issue #2). E.g. "machine " completes to "Learning"
    // (single space from the user), while "machine  " diverges and returns
    // null instead of a normalized match.
    var raw = String(query == null ? '' : query);
    if (!raw || !raw.trim() || !row) return null;
    var rl = raw.toLowerCase();
    if (row.commit && row.commit.toLowerCase().indexOf(rl) === 0)
      return { pre: '', rest: row.commit.slice(raw.length) };
    var pm = /^(subject|class|teacher):/i.exec(row.commit || '');
    if (pm && row.label && row.label.toLowerCase().indexOf(rl) === 0)
      return { pre: pm[1].toLowerCase() + ':', rest: row.label.slice(raw.length) };
    if (row.label && row.label.toLowerCase().indexOf(rl) === 0)
      return { pre: '', rest: row.label.slice(raw.length) };
    return null;
  }


  return {
    buildIndex: buildIndex, resolveClass: resolveClass,
    mergeRanges: mergeRanges, tokenScore: tokenScore, fuzzyRanges: fuzzyRanges,
    highlightHTML: highlightHTML, nameHTML: nameHTML, liveSearch: liveSearch, suggest: suggest,
    shadowText: shadowText,
    parseQuery: parseQuery, searchSections: searchSections,
    completionContext: completionContext, classSearch: classSearch
  };
})();

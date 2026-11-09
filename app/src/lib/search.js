// app/src/lib/search.js — pure matching/scoring logic.
// No display concerns (escaping, highlighting, redaction) — those live in display.js.
/**
 * Parse a search query into predicates + free-text terms.
 * `type:class` / `type:teacher` (plurals + case-insensitive) restrict the
 * result kind; unknown `key:value` tokens fall back to literal text.
 * Returns { type: 'class'|'teacher'|null, filters: [{key, value}], terms: [] }.
 * Predicate tokens are excluded from terms, so they never highlight.
 */
export function parseSearchQuery(q) {
	const filters = [];
	let type = null;
	let completing = false; // cursor is inside a bare `type:` being completed
	const terms = [];
	// Quote-aware split: subject:"machine learning" stays one token.
	const rawTokens = (String(q ?? '').match(/[^\s:]+:"[^"]*"|"[^"]*"|\S+/g) || []).map((t) => {
		const quoted = /:"([^"]*)"$/.exec(t);
		return (quoted ? t.slice(0, -quoted[0].length + 1) + quoted[1] : t).toLowerCase();
	});
	for (const tok of rawTokens) {
		if (/^type:(\*|)$/i.test(tok)) {
			completing = true;
			continue;
		}
		// Bare `key:` (like `key:*`) is an inert filter, not a search term.
		const bare = /^([a-z]+):(\*|)$/i.exec(tok);
		if (bare && ['subject', 'room', 'teacher', 'day', 'cohort', 'group', 'track', 'year', 'specialty'].includes(bare[1].toLowerCase())) {
			filters.push({ key: bare[1].toLowerCase(), value: '' });
			continue;
		}
		const m = /^([a-z]+):(.+)$/i.exec(tok);
		if (m) {
			const key = m[1].toLowerCase();
			const value = m[2];
			if (key === 'type') {
				let v = value.toLowerCase();
				if (v === 'classes') v = 'class';
				if (v === 'teachers') v = 'teacher';
				if (v === 'class' || v === 'teacher') {
					type = v;
					continue;
				}
			}
			if (['subject', 'room', 'teacher', 'day', 'cohort', 'group', 'track', 'year', 'specialty'].includes(key)) {
				filters.push({ key, value });
				continue;
			}
		}
		terms.push(tok);
	}
	return { type, filters, terms, completing };
}

export function normStr(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function tokenize(q) {
  return q.toLowerCase().split(/\s+/).filter(Boolean);
}

export function mergeRanges(rs) {
  rs = rs.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const out = [];
  rs.forEach(r => {
    const l = out[out.length - 1];
    if (l && r[0] <= l[1]) l[1] = Math.max(l[1], r[1]);
    else out.push(r);
  });
  return out;
}

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

export function scoreMatch(s, token) {
  const sl = s.toLowerCase();
  const tl = token.toLowerCase();
  const i = sl.indexOf(tl);
  if (i !== -1) return 1000 - i;
  let pos = 0;
  let first = -1;
  let last = -1;
  for (let k = 0; k < tl.length; k++) {
    const j = sl.indexOf(tl[k], pos);
    if (j === -1) return -1;
    if (first === -1) first = j;
    last = j;
    pos = j + 1;
  }
  return 500 - (last - first);
}
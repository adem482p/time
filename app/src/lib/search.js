// app/src/lib/search.js — pure matching/scoring logic.
// Completion-edit helpers removed; parseSearchQuery retained for filtering.
export function parseSearchQuery(q) {
	const filters = [];
	let type = null;
	const terms = [];
	const rawTokens = (String(q ?? '').match(/[^\s:]+:"[^"]*"|"[^"]*"|\S+/g) || []).map((t) => {
		const quoted = /:"([^"]*)"$/.exec(t);
		return (quoted ? t.slice(0, -quoted[0].length + 1) + quoted[1] : t).toLowerCase();
	});
	for (const tok of rawTokens) {
		if (/^type:(\*|)$/i.test(tok)) continue;
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
				const asType = ['class', 'teacher'].find((t) => t.startsWith(v));
				if (asType) { type = asType; continue; }
			}
			if (['subject', 'room', 'teacher', 'day', 'cohort', 'group', 'track', 'year', 'specialty'].includes(key)) {
				filters.push({ key, value });
				continue;
			}
		}
		terms.push(tok);
	}
	return { type, filters, terms };
}

export function normStr(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function tokenize(q) {
  return String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
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
  const sl = String(s || '').toLowerCase();
  const tl = String(token || '').toLowerCase();
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
  const sl = String(s || '').toLowerCase();
  const tl = String(token || '').toLowerCase();
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

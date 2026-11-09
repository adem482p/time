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
				// Partial values behave like their completion: `type:c`
				// already filters to classes (and stays in completion mode).
				const asType = ['class', 'teacher'].find((t) => t.startsWith(v));
				if (asType) {
					type = asType;
					if (v.length < asType.length) completing = true;
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

// ---- Query edits (pure, idempotent) ----
// Completions operate on the LAST token only — never on cursor offsets.
// Invariants (tested): complete(complete(q)) === complete(q), and
// parseSearchQuery(complete(q)) round-trips. No edit can produce a token
// the parser cannot read back identically (e.g. `type:type:teacher`).

function splitTail(query) {
	const trimmed = String(query ?? '').trimEnd();
	const m = /(\S*)$/.exec(trimmed);
	return { head: trimmed.slice(0, trimmed.length - (m?.[1]?.length ?? 0)), token: m?.[1] ?? '' };
}

function replaceTail(query, token) {
	const { head } = splitTail(query);
	return head + token;
}

/** Complete the trailing `type:`-node with a value. Idempotent. */
export function completeType(query, kind) {
	let k = String(kind ?? '').toLowerCase();
	if (k === 'classes') k = 'class';
	if (k === 'teachers') k = 'teacher';
	if (k !== 'class' && k !== 'teacher') throw new Error(`Invalid type value: ${kind}`);
	const done = `type:${k}`;
	const { token } = splitTail(query);
	if (token === done) return query; // already complete: no-op
	if (/^type:/i.test(token)) return replaceTail(query, done + ' ');
	// An earlier complete `type:` anywhere is replaced, never duplicated —
	// there is exactly one type predicate in a query.
	const tokens = String(query ?? '').split(/\s+/).filter(Boolean);
	const idx = tokens.findIndex((t) => /^type:(class|teacher)$/i.test(t));
	if (idx >= 0) {
		tokens[idx] = done;
		return tokens.join(' ') + ' ';
	}
	return replaceTail(query, token ? token + ' ' : '') + done + ' ';
}

/** Complete the trailing `predicate:`-node with a value. Idempotent. */
export function completePredicateValue(query, value) {
	const v = String(value ?? '');
	const { token } = splitTail(query);
	const m = /^([a-z]+):/i.exec(token);
	if (!m) return query;
	const key = m[1].toLowerCase();
	const done = v.includes(' ') ? `${key}:"${v}" ` : `${key}:${v} `;
	if (token === done.trimEnd()) return query;
	return replaceTail(query, done);
}

/** Insert a predicate node at the tail, completing a key prefix. Idempotent. */
export function addPredicate(query, key) {
	const k = String(key ?? '').toLowerCase();
	const { token } = splitTail(query);
	if (token === `${k}:`) return query; // already present: no-op
	if (token && !token.includes(':') && k.startsWith(token.toLowerCase())) {
		return replaceTail(query, `${k}:`);
	}
	return replaceTail(query, token ? token + ' ' : '') + `${k}:`;
}

/** The last whitespace-delimited token ('' at a fresh position). */
export function lastToken(query) {
	return splitTail(query).token;
}

/**
 * Token spanning position `pos` (the token the caret is inside or touching).
 * Returns null at a fresh position (caret on whitespace/boundary).
 * Pure read-only detection — never used to compute edits asynchronously.
 */
export function tokenAt(query, pos) {
	const q = String(query ?? '');
	const p = Math.min(Math.max(pos ?? q.length, 0), q.length);
	// Expand left over non-whitespace.
	let start = p;
	while (start > 0 && !/\s/.test(q[start - 1])) start--;
	// Expand right over non-whitespace.
	let end = p;
	while (end < q.length && !/\s/.test(q[end])) end++;
	if (start === end) return null; // fresh position between tokens
	return { start, end, token: q.slice(start, end) };
}

/**
 * Replace the token spanning `pos`. Pure + idempotent per token content.
 * Returns {query, caret} with the caret after the new token.
 */
export function replaceTokenAt(query, pos, newToken) {
	const q = String(query ?? '');
	const at = tokenAt(q, pos);
	if (!at) {
		// Fresh position: insert with a separating space when needed.
		const before = q.slice(0, Math.min(pos ?? q.length, q.length));
		const sep = before && !before.endsWith(' ') ? ' ' : '';
		return { query: before + sep + newToken + q.slice(before.length), caret: before.length + sep.length + newToken.length };
	}
	return { query: q.slice(0, at.start) + newToken + q.slice(at.end), caret: at.start + newToken.length };
}

// ---- Cursor-position edit variants (default pos = end of query) ----

export function completeTypeAt(query, kind, pos) {
	const k0 = String(kind ?? '').toLowerCase();
	const k = k0 === 'classes' ? 'class' : k0 === 'teachers' ? 'teacher' : k0;
	if (k !== 'class' && k !== 'teacher') throw new Error(`Invalid type value: ${kind}`);
	const done = `type:${k}`;
	const at = tokenAt(query, pos ?? String(query ?? '').length);
	if (at?.token === done) return { query, caret: at.end };
	// Replace an existing type: token at the caret, else insert fresh.
	return replaceTokenAt(query, pos ?? String(query ?? '').length, done);
}

export function addPredicateAt(query, key, pos) {
	const k = String(key ?? '').toLowerCase();
	const p = pos ?? String(query ?? '').length;
	const at = tokenAt(query, p);
	if (at?.token === `${k}:`) return { query, caret: at.end };
	if (at && !at.token.includes(':') && k.startsWith(at.token.toLowerCase())) {
		return replaceTokenAt(query, p, `${k}:`);
	}
	return replaceTokenAt(query, p, `${k}:`);
}

export function completePredicateValueAt(query, value, pos) {
	const v = String(value ?? '');
	const p = pos ?? String(query ?? '').length;
	const at = tokenAt(query, p);
	const m = at && /^([a-z]+):/i.exec(at.token);
	if (!m) return { query, caret: p };
	const key = m[1].toLowerCase();
	const done = v.includes(' ') ? `${key}:"${v}"` : `${key}:${v}`;
	if (at.token === done) return { query, caret: at.end };
	return replaceTokenAt(query, p, done);
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
// app/src/lib/search.js — pure matching/scoring logic.
// No display concerns (escaping, highlighting, redaction) — those live in display.js.
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
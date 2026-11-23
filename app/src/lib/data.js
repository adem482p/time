// app/src/lib/data.js — Layer 1: data layer.
// Vocabulary constants, CSV parsing, and the in-memory Store API.
// No DOM access here; createStore(text) is pure so the whole stack is
// testable in node. Unlike the legacy js/data.js there is no self-located
// fetch helper: the CSV URL is resolved by the caller; see load.js.
// (Redaction mode still reads `?redact=1` from location.search when a
// `location` object exists.)

const DAYS = ['LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI'];
const SLOTS = ['08h15-09h45', '10h00-11h30', '11h40-13h10',
                      '13h20-14h50', '15h00-16h30', '16h45-18h15'];
const HOURS_PER_SESSION = 1.5;

/**
 * Robust CSV parse: quoted fields, embedded commas/quotes/newlines, CRLF.
 * Returns an array of row objects — one object per data row, keyed by the
 * header names, with every cell value trimmed (missing cells become '').
 */
function parseCSV(text) {
  const rows = [];
  let row = [], cur = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; } else inQ = false;
      } else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); cur = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  const head = rows.shift() || [];
  return rows.map(function (r) {
    const o = {};
    head.forEach(function (h, j) { o[h] = (r[j] || '').trim(); });
    return o;
  });
}

/**
 * Build the in-memory store from CSV text. The store object keeps every
 * parsed row (`rows`, including empty-professor ones, which the time page
 * may still show; teacher-oriented APIs skip empty professors) plus the
 * vocabulary: `days` and `slots` mirror DAYS/SLOTS, `hoursPerSession`
 * mirrors HOURS_PER_SESSION, and `teachers`/`fields`/`subjects` are the
 * sorted distinct value lists. `sessionsByTeacher` maps each teacher name
 * to its rows, `size` is the row count, `sessionsOf(name)` returns a
 * teacher's rows (empty array when unknown) and `byDaySlot(day, slot)`
 * filters rows by exact day and slot strings.
 */
export function createStore(text) {
  const rows = parseCSV(text);
  const teacherSet = {}, fieldSet = {}, subjectSet = {};
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r.professor) teacherSet[r.professor] = true;
    if (r.field) fieldSet[r.field] = true;
    if (r.subject) subjectSet[r.subject] = true;
  }
  const byAlpha = function (a, b) { return a.localeCompare(b); };
  const teachers = Object.keys(teacherSet).sort(byAlpha);
  const sessionsByTeacher = {};
  for (let i = 0; i < rows.length; i++) {
    if (!rows[i].professor) continue;
    (sessionsByTeacher[rows[i].professor] =
      sessionsByTeacher[rows[i].professor] || []).push(rows[i]);
  }
  return {
    days: DAYS,
    slots: SLOTS,
    hoursPerSession: HOURS_PER_SESSION,
    rows: rows,
    teachers: teachers,
    sessionsByTeacher: sessionsByTeacher,
    fields: Object.keys(fieldSet).sort(byAlpha),
    subjects: Object.keys(subjectSet).sort(byAlpha),
    size: rows.length,
    sessionsOf: function (name) { return this.sessionsByTeacher[name] || []; },
    byDaySlot: function (day, slot) {
      return this.rows.filter(function (r) {
        return r.day === day && r.time === slot;
      });
    }
  };
}

/**
 * The single HTML escaper used by every rendering path (issue 008: values
 * are escaped exactly once; scaffolding/markup is never escaped).
 */
export function esc(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

// Redaction mode (issue 061): `?redact=1` swaps every rendered teacher name
// for an empty rectangle filled with `background: currentColor` — the text
// foreground — so README captures show the UI without any name in the DOM.
// Parsed once at boot; the `typeof location` guard keeps the mode off in
// vm test sandboxes and Svelte SSR (no `location` object there); if a
// `location` exists but no `window`, reading `location.search` alone is
// fine. `setRedact` lets node tests flip it. Pure string work — no DOM
// access here.
let redactOn = typeof location !== 'undefined' &&
  /(?:\?|&)redact=1(?:&|$)/.test(location.search);

/** True when redaction mode is on (see the module-header note). */
export function redacted() { return redactOn; }

/** Pass true to force redaction on, false to force it off (tests only). */
export function setRedact(on) { redactOn = !!on; }  // tests/harnesses only

function redactHTML(name) {
  const w = Math.max(3, String(name).length) * 0.56;
  return '<span class="redact" aria-hidden="true" style="width:' +
    w.toFixed(2) + 'em"></span>';
}

/**
 * Render a name for display: the escaped `alt` (or '') when `name` itself
 * is empty, the redaction rectangle when redaction mode is on, else the
 * escaped name. Returns HTML-safe string.
 */
export function nameHTML(name, alt) {
  if (!name) return esc(alt || '');
  return redactOn ? redactHTML(name) : esc(name);
}

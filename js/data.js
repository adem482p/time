// js/data.js — Layer 1: data layer.
// Vocabulary constants, CSV parsing, and the in-memory Store API.
// No DOM access here (except the browser loadStore() fetch helper);
// createStore(text) is pure so the whole stack is testable in node.
var TT = TT || {};
TT.data = (function () {
  var DAYS = ['LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI'];
  var SLOTS = ['08h15-09h45', '10h00-11h30', '11h40-13h10',
               '13h20-14h50', '15h00-16h30', '16h45-18h15'];
  var HOURS_PER_SESSION = 1.5;

  // Robust CSV parse: quoted fields, embedded commas/quotes/newlines, CRLF.
  function parseCSV(text) {
    var rows = [], row = [], cur = '', inQ = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
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
    var head = rows.shift() || [];
    return rows.map(function (r) {
      var o = {};
      head.forEach(function (h, j) { o[h] = (r[j] || '').trim(); });
      return o;
    });
  }

  // Build the in-memory store from CSV text. `rows` keeps every parsed row
  // (including empty-professor ones, which the time page may still show);
  // teacher-oriented APIs skip empty professors.
  function createStore(text) {
    var rows = parseCSV(text);
    var teacherSet = {}, fieldSet = {}, subjectSet = {}, i;
    for (i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (r.professor) teacherSet[r.professor] = true;
      if (r.field) fieldSet[r.field] = true;
      if (r.subject) subjectSet[r.subject] = true;
    }
    var byAlpha = function (a, b) { return a.localeCompare(b); };
    var teachers = Object.keys(teacherSet).sort(byAlpha);
    var sessionsByTeacher = {};
    for (i = 0; i < rows.length; i++) {
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

  // The CSV lives at the site root while js/data.js is loaded FROM js/ by pages
  // in any directory — the app pages under teachers/ and classes/ pull it too
  // (issue 072), where a document-relative 'emplois.csv' would 404. Capture
  // THIS script's URL at parse time (classic sync scripts have
  // document.currentScript) and resolve '../emplois.csv' against it: from js/
  // that always lands on the site root, whatever page pulled the script in —
  // one rule, no per-page config, no CSV duplication, no <base>. The fallback
  // keeps the old document-relative path where no script URL exists (vm test
  // sandboxes, async/module loading).
  var SCRIPT_URL = (typeof document !== 'undefined' && document.currentScript &&
                    document.currentScript.src) || null;
  function csvURL() {
    return SCRIPT_URL ? new URL('../emplois.csv', SCRIPT_URL).href : 'emplois.csv';
  }

  // Browser helper: fetch emplois.csv and build the store.
  function loadStore() {
    return fetch(csvURL()).then(function (res) {
      if (!res.ok) throw new Error(res.status + ' ' + res.statusText);
      return res.text();
    }).then(createStore);
  }

  // The single HTML escaper used by every rendering path (issue 008: values
  // are escaped exactly once; scaffolding/markup is never escaped).
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // Redaction mode (issue 061): `?redact=1` swaps every rendered teacher name
  // for an empty rectangle filled with `background: currentColor` — the text
  // foreground — so README captures show the UI without any name in the DOM
  // while the bar still follows all 15 presets × light/dark. Parsed once at
  // boot; the `typeof location` guard keeps the mode off in vm test sandboxes
  // (no `location`) and `setRedact` lets node tests flip it. Pure string work
  // — no DOM access here.
  var redactOn = typeof location !== 'undefined' && /(?:\?|&)redact=1(?:&|$)/.test(location.search);
  function redacted() { return redactOn; }
  function setRedact(on) { redactOn = !!on; }  // tests/harnesses only
  function redactHTML(name) { var w = Math.max(3, String(name).length) * 0.56; return '<span class="redact" aria-hidden="true" style="width:' + w.toFixed(2) + 'em"></span>'; }
  function nameHTML(name, alt) { if (!name) return esc(alt || ''); return redactOn ? redactHTML(name) : esc(name); }

  return {
    DAYS: DAYS, SLOTS: SLOTS, HOURS_PER_SESSION: HOURS_PER_SESSION,
    parseCSV: parseCSV, createStore: createStore, loadStore: loadStore,
    esc: esc, redacted: redacted, setRedact: setRedact, nameHTML: nameHTML
  };
})();

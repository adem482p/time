// js/model.js — Layer 2: analysis layer.
// Domain objects (Teacher / Subject) with their methods, the corpus-wide
// class Grouping (js/libgroups.js), per-teacher class projections, session
// fusion + pill reduction, and schedule helpers (now/next/availability).
// Pure data in, plain values out: everything here is unit-testable in node
// against the real CSV.
var TT = TT || {};
TT.model = (function () {
  var Groups = TT.groups;                 // js/libgroups.js (loaded first)
  var HOURS = TT.data.HOURS_PER_SESSION;
  var DAYS = TT.data.DAYS;
  var SLOTS = TT.data.SLOTS;

  // ---- shared value helpers --------------------------------------------

  // Case/whitespace-insensitive key for teacher names and subjects.
  function normStr(s) {
    return String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, ' ');
  }

  // Byte-order comparison for canonical keys (locale-independent).
  function cmpByte(a, b) { return a < b ? -1 : a > b ? 1 : 0; }

  function localeCmp(a, b) { return a.localeCompare(b); }

  // Sessions -> "57h00"-style label (uniform 90-minute slots).
  function hoursLabel(nSessions) {
    var h = nSessions * HOURS;
    var whole = Math.floor(h + 1e-9);
    return whole + 'h' + ((h - whole) >= 0.5 ? '30' : '00');
  }

  // ---- class hierarchy (js/libgroups.js) --------------------------------
  //
  // Every class/group decision is delegated to ONE corpus-wide `Grouping`
  // built by buildGroups() and owned by buildAll(). The library understands
  // the canonical vocabulary (`GLSI3D1`, `LBC1A1`, `IoT2A`), compact/full/raw
  // spellings, and section/track references; this module never re-parses
  // field strings. Nodes are shared across teachers, so per-teacher counts
  // live in the separate projection built by buildTeacherClasses().

  // ---- Teacher / Subject domain objects ---------------------------------

  function Subject(name, sessions, totalSessions) {
    this.name = name;
    this.sessions = sessions;
    this.hours = sessions * HOURS;
    this.share = totalSessions ? sessions / totalSessions : 0;
  }

  // Per-teacher projection over the shared corpus Grouping. Counts live in
  // local maps (ClassNodes are shared, never mutated); children are ranked by
  // this teacher's sessions, ties byte-alphabetical, exactly like the old
  // buildSubtree. Root children are the study-year nodes (`level === 'year'`),
  // so the tree is ALL -> LBC1/GLSI2/MP1 -> ... (year-1 no longer has the
  // redundant BC1/CE1/CS1 interior level).
  // stats: { node, key, label, sessions, hours, shareOfParent, shareOfTeacher,
  //          rawValues, children }
  function buildTeacherClasses(grouping, sessions) {
    var counts = {}, raws = {};
    function bump(node, raw) {
      counts[node.key] = (counts[node.key] || 0) + 1;
      (raws[node.key] = raws[node.key] || {})[raw] = true;
    }
    sessions.forEach(function (s) {
      var leaf = s.field ? grouping.leafFor(s.field) : null;
      if (!leaf) return;
      bump(leaf, s.field);
      leaf.ancestors().forEach(function (a) { bump(a, s.field); });
    });
    var total = sessions.length;
    function project(node, parentSessions) {
      var n = counts[node.key] || 0;
      var st = {
        node: node, key: node.key, label: node.compactName(),
        sessions: n, hours: n * HOURS,
        rawValues: Object.keys(raws[node.key] || {}).sort(localeCmp),
        shareOfParent: parentSessions ? n / parentSessions : 1,
        shareOfTeacher: total ? n / total : 0,
        children: []
      };
      st.children = node.children
        .filter(function (c) { return counts[c.key]; })
        .sort(function (a, b) {
          return (counts[b.key] - counts[a.key]) || cmpByte(a.key, b.key);
        })
        .map(function (c) { return project(c, n); });
      return st;
    }
    var root = {
      node: null, key: 'ALL', label: 'ALL', sessions: total, hours: total * HOURS,
      rawValues: [], shareOfParent: 1, shareOfTeacher: 1, children: []
    };
    root.children = grouping.nodes
      .filter(function (n) { return n.level === 'year' && counts[n.key]; })
      .sort(function (a, b) {
        return (counts[b.key] - counts[a.key]) || cmpByte(a.key, b.key);
      })
      .map(function (c) { return project(c, total); });
    return root;
  }

  // Teacher's dominant specialization slot: the `isSpec` node (real
  // specialization or a common-branch year such as LBC1) with the most
  // sessions, ties byte-alphabetical. Returns a ClassNode or null.
  function topClass(grouping, sessions) {
    var counts = {};
    sessions.forEach(function (s) {
      var leaf = s.field ? grouping.leafFor(s.field) : null;
      if (!leaf) return;
      [leaf].concat(leaf.ancestors()).forEach(function (n) {
        if (n.isSpec) counts[n.key] = (counts[n.key] || 0) + 1;
      });
    });
    var best = null;
    Object.keys(counts).forEach(function (k) {
      if (!best || counts[k] > counts[best] ||
          (counts[k] === counts[best] && cmpByte(k, best) < 0)) best = k;
    });
    return best ? grouping.byKey[best] : null;
  }

  function Teacher(name, sessions, grouping) {
    this.name = name;
    this.sessions = sessions;
    this.totalSessions = sessions.length;
    this.totalHours = this.totalSessions * HOURS;
    // Issue 053: subject counting is case/whitespace-insensitive —
    // buckets are keyed by normStr(subject) (this file's header
    // contract), one row per subject across all case/whitespace
    // spellings. The displayed label is the byte-smallest spelling this
    // teacher is scheduled under (cmpByte, the locale-independent
    // canonical-key comparator); rankings tie-break on that label,
    // exactly like before.
    var sc = {}, lab = {}, k, i;
    for (i = 0; i < sessions.length; i++) {
      k = normStr(sessions[i].subject);
      sc[k] = (sc[k] || 0) + 1;
      if (!(k in lab) || cmpByte(sessions[i].subject, lab[k]) < 0) lab[k] = sessions[i].subject;
    }
    this.subjectCounts = sc;
    // subjects ranked by hours, ties byte-alphabetical, share of total
    this.subjects = Object.keys(sc).sort(function (a, b) {
      return (sc[b] - sc[a]) || cmpByte(lab[a], lab[b]);
    }).map(function (s) { return new Subject(lab[s], sc[s], this.totalSessions); }, this);
    this.topSubject = this.subjects.length ? this.subjects[0] : null;
    // class summary (libgroups): per-teacher projected tree + top spec slot
    this.classStats = grouping ? buildTeacherClasses(grouping, sessions) : null;
    this.topClass = grouping ? topClass(grouping, sessions) : null;
  }

  // One corpus-wide Grouping (js/libgroups.js) built from the store.
  // `opts.catalogue` is an optional forward-declared offering override.
  function buildGroups(store, opts) {
    return Groups.build({
      fields: store.fields,
      rows: store.rows,
      catalogue: opts && opts.catalogue
    });
  }

  // Build the per-teacher domain objects over a store. Owns the single
  // corpus-wide `groups` used by every consumer.
  function buildAll(store, opts) {
    var groups = buildGroups(store, opts);
    var teachers = {};
    store.teachers.forEach(function (n) {
      teachers[n] = new Teacher(n, store.sessionsOf(n), groups);
    });
    return { store: store, groups: groups, teachers: teachers };
  }

  // ---- session fusion + pill reduction (issue 002 semantics) ------------

  // Rows identical in (professor, day, time, room, subject) are one real
  // event; their field sets reduce to sorted pills (both groups -> one
  // section pill; a full program-year inventory -> one program pill).
  function fusionKey(s) {
    // JSON.stringify makes the tuple unambiguous: quoting and escaping mean
    // no field value can collide with the separator (e.g. fields with spaces).
    return JSON.stringify([s.professor, s.day, s.time, s.room || '', s.subject]);
  }

  // Study-year ancestor of a leaf (the old "bucket"), or null.
  function yearNodeOf(leaf) {
    if (!leaf) return null;
    if (leaf.level === 'year') return leaf;
    var anc = leaf.ancestors();
    for (var i = 0; i < anc.length; i++) if (anc[i].level === 'year') return anc[i];
    return null;
  }

  // Section-level pills: both cohorts present -> one section pill; a lone
  // cohort stays the full "SEC Groupe N"; standalone stays as-is.
  function sectionPillsOf(leaves) {
    var byAnchor = {}, order = [];
    leaves.forEach(function (leaf) {
      var anchor = (leaf.level === 'cohort' && leaf.parent) ? leaf.parent : leaf;
      if (!byAnchor[anchor.key]) {
        byAnchor[anchor.key] = { anchor: anchor, g1: null, g2: null };
        order.push(anchor.key);
      }
      var e = byAnchor[anchor.key];
      if (leaf.level === 'cohort') {
        if (leaf.cohort === '1') e.g1 = leaf;
        else if (leaf.cohort === '2') e.g2 = leaf;
      }
    });
    return order.map(function (k) {
      var e = byAnchor[k];
      if (e.g1 && e.g2) return e.anchor.fullName();
      if (e.g1) return e.g1.fullName();
      if (e.g2) return e.g2.fullName();
      return e.anchor.fullName();
    });
  }

  // Reduce one fused group's raw field values to sorted pill strings, via the
  // corpus Grouping (issue 002 semantics). Fail-safe: a group spanning study
  // years never reduces to a year-spanning program pill (section pills + a
  // console warning).
  function pillsFor(grouping, fields) {
    var leaves = (fields || []).map(function (f) {
      return f ? grouping.leafFor(f) : null;
    });
    if (leaves.some(function (l) { return !l; }))
      return (fields || []).slice().sort(localeCmp);   // defensive: unknown field
    var byYear = {}, order = [];
    leaves.forEach(function (leaf) {
      var y = yearNodeOf(leaf);
      if (!y) return;
      var e = byYear[y.key];
      if (!e) { e = byYear[y.key] = { year: y, leaves: [] }; order.push(y.key); }
      if (e.leaves.indexOf(leaf) === -1) e.leaves.push(leaf);
    });
    var digits = {}, nYears = 0;
    order.forEach(function (k) {
      var y = byYear[k].year.year;
      if (y != null && !digits[y]) { digits[y] = true; nYears++; }
    });
    if (nYears > 1) {
      if (typeof console !== 'undefined' && console.warn)
        console.warn('pillsFor: refusing program reduction across years: ' +
          order.slice().sort().join(', '));
      return sectionPillsOf(leaves.slice()).sort(localeCmp);
    }
    var out = [];
    order.forEach(function (k) {
      var e = byYear[k];
      var full = e.year.leaves();
      var present = e.leaves.map(function (l) { return l.key; });
      if (full.length && present.length === full.length &&
          full.every(function (l) { return present.indexOf(l.key) !== -1; }))
        out.push(e.year.fullName());
      else out.push.apply(out, sectionPillsOf(e.leaves));
    });
    var seen = {}, res = [];
    out.forEach(function (p) { if (!seen[p]) { seen[p] = true; res.push(p); } });
    return res.sort(localeCmp);
  }

  // Fuse sessions on (professor,day,time,room,subject). Deterministic:
  // key-order independent, pills sorted, rows ordered by cmpFusedSession.
  // Pills are reduced via the corpus Grouping (issue 002 semantics).
  //
  // Stage 2 folds stage-1 rows sharing (professor,day,time) — one real
  // event taught in several classrooms — into a single row whose room and
  // subject list every alternative ("A or B"). Singleton groups pass
  // through untouched (no `merged` marker, no `week` field). Merged rows
  // carry the union week ('' when weekly or mixed SA/SB — never 'S1') and
  // `merged: true`. The final output stays sorted by cmpFusedSession.
  function fuseSessions(sessions, grouping) {
    var groups = {};
    var weekSets = {};   // fusionKey -> { raw week value: true } (stage-2 input)
    (sessions || []).forEach(function (s) {
      var k = fusionKey(s);
      if (!groups[k]) {
        groups[k] = { professor: s.professor, day: s.day,
          time: s.time, room: s.room, subject: s.subject, fields: [] };
        weekSets[k] = {};
      }
      groups[k].fields.push(s.field);
      weekSets[k][s.week || ''] = true;
    });
    var stage1 = Object.keys(groups).map(function (k) {
      var g = groups[k];
      g.fields = Object.keys(g.fields.reduce(function (acc, f) {
        acc[f] = true; return acc;
      }, {})).sort(localeCmp);
      g.pills = pillsFor(grouping, g.fields);
      return { row: g, weeks: weekSets[k] };
    });
    stage1.sort(function (a, b) { return cmpFusedSession(a.row, b.row); });
    var buckets = {}, order = [];
    stage1.forEach(function (e) {
      var k = JSON.stringify([e.row.professor, e.row.day, e.row.time]);
      if (!buckets[k]) { buckets[k] = []; order.push(k); }
      buckets[k].push(e);
    });
    var out = order.map(function (k) {
      var members = buckets[k];
      if (members.length === 1) return members[0].row;
      members.sort(function (a, b) { return cmpFusedSession(a.row, b.row); });
      var first = members[0].row;
      var rooms = {}, subjects = {}, fields = {}, weeks = {};
      members.forEach(function (e) {
        var r = e.row;
        var room = r.room || '';
        if (room !== '') rooms[room] = true;
        subjects[r.subject] = true;
        (r.fields || []).forEach(function (f) { fields[f] = true; });
        Object.keys(e.weeks).forEach(function (w) { weeks[w] = true; });
      });
      var roomList = Object.keys(rooms).sort(localeCmp);
      var subjectList = Object.keys(subjects).sort(localeCmp);
      var fieldList = Object.keys(fields).sort(localeCmp);
      var weekKeys = Object.keys(weeks);
      var week = (weekKeys.length === 1 &&
        (weekKeys[0] === 'SA' || weekKeys[0] === 'SB')) ? weekKeys[0] : '';
      return {
        professor: first.professor, day: first.day, time: first.time,
        room: roomList.join(' or '),
        subject: subjectList.join(' or '),
        fields: fieldList,
        pills: pillsFor(grouping, fieldList),
        week: week,
        merged: true
      };
    });
    return out.sort(cmpFusedSession);
  }

  function cmpSession(a, b) {
    return DAYS.indexOf(a.day) - DAYS.indexOf(b.day) ||
           SLOTS.indexOf(a.time) - SLOTS.indexOf(b.time);
  }

  // Day+slot order, tie-broken by subject/room/pills so fused rows sharing
  // a slot sort deterministically (independent of CSV row order).
  function cmpFusedSession(a, b) {
    var c = cmpSession(a, b);
    if (c) return c;
    if (a.subject < b.subject) return -1;
    if (a.subject > b.subject) return 1;
    var ar = a.room || '', br = b.room || '';
    if (ar < br) return -1;
    if (ar > br) return 1;
    var ak = ((a.pills || a.fields || []).join(' '));
    var bk = ((b.pills || b.fields || []).join(' '));
    return ak.localeCompare(bk);
  }

  // ---- classes page week data (issue 032) -------------------------------

  // Week of a class: the union of every timetable beneath the ref, each
  // session labelled with the leaf class it comes from. The ref resolves to
  // one node when it is a known key or an unambiguous reference, or to
  // every candidate when it is an ambiguous interior prefix (e.g. "GLSI"
  // spans years 2 and 3 — the union of both). A fully specified class is
  // its own single leaf, so a single-class view shows one label; the
  // caller tells union views from single-class views by leaves.length.
  // Rows that cannot be placed in the week grid (no day/time) are skipped;
  // identical rows within one leaf collapse to one event (issue-002 fusion
  // semantics). Deterministic: (day, slot, class, subject, room),
  // independent of CSV row order. `name` is the display heading: the node's
  // full name for a single-node ref, the ref itself for a union.
  function classWeek(grouping, ref) {
    var nodes = [];
    if (ref && typeof ref === 'object' && ref.key) {
      nodes = [ref];
    } else if (typeof ref === 'string' && ref) {
      if (grouping.byKey[ref]) {
        nodes = [grouping.byKey[ref]];
      } else {
        var r = grouping.resolve(ref);
        if (r.status === 'ok') nodes = [r.node];
        else if (r.status === 'ambiguous') nodes = r.candidates;
      }
    }
    var leaves = [];
    nodes.forEach(function (n) {
      n.leaves().forEach(function (l) {
        if (leaves.indexOf(l) === -1) leaves.push(l);
      });
    });
    leaves.sort(function (a, b) { return cmpByte(a.key, b.key); });
    var out = [];
    leaves.forEach(function (leaf) {
      var seen = {};
      leaf.sessions.forEach(function (s) {
        if (!s.day || !s.time) return;
        var k = fusionKey(s);
        if (seen[k]) return;
        seen[k] = true;
        out.push({ day: s.day, time: s.time, subject: s.subject,
                   professor: s.professor, room: s.room,
                   classKey: leaf.key, classLabel: leaf.fullName() });
      });
    });
    out.sort(function (a, b) {
      var c = cmpSession(a, b);
      if (c) return c;
      if (a.classKey !== b.classKey) return cmpByte(a.classKey, b.classKey);
      if (a.subject !== b.subject) return a.subject < b.subject ? -1 : 1;
      var ar = a.room || '', br = b.room || '';
      return ar < br ? -1 : ar > br ? 1 : 0;
    });
    var name = ref;
    if (nodes.length === 1) name = nodes[0].fullName();
    return { ref: ref, name: name, leaves: leaves, sessions: out };
  }

  // ---- schedule helpers --------------------------------------------------

  var JS_DAY = ['DIMANCHE', 'LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI'];
  var DAY_IDX = { LUNDI: 1, MARDI: 2, MERCREDI: 3, JEUDI: 4, VENDREDI: 5, SAMEDI: 6 };

  // French day names display lowercase (lundi..samedi); data stays uppercase.
  function frDay(d) { return String(d).toLowerCase(); }

  // "08h15-09h45" -> [495, 585] (minutes since midnight)
  function slotMinutes(slot) {
    var m = /(\d+)h(\d+)-(\d+)h(\d+)/.exec(slot);
    return [+m[1] * 60 + +m[2], +m[3] * 60 + +m[4]];
  }

  // True when `now` (default: current time) falls inside the session's day+slot.
  function isCurrentSession(day, time, now) {
    now = now || new Date();
    if (JS_DAY[now.getDay()] !== day) return false;
    var se = slotMinutes(time);
    var cur = now.getHours() * 60 + now.getMinutes();
    return cur >= se[0] && cur < se[1];
  }

  // Today-only clock for the week grids (issue 032). `now` is injectable so
  // the day boundaries are testable in node with a stubbed clock. Returns
  //   { today, isSunday, phase, visible, cur, next, frac }
  // where `phase` is 'sunday' | 'before' | 'during' | 'after', `cur` is the
  // slot containing now, `next` the earliest slot still starting today (no
  // week wrap), and `frac` now's position inside `cur` (0..1). Nothing is
  // marked at all — visible false, cur/next null — on Sunday, before the
  // first slot begins (08h15), or once the last slot has ended (18h15).
  function dayCursor(now, slots) {
    now = now || new Date();
    slots = slots || SLOTS;
    var today = JS_DAY[now.getDay()];
    var isSunday = DAY_IDX[today] === undefined;
    var out = { today: today, isSunday: isSunday, phase: isSunday ? 'sunday' : 'before',
                visible: false, cur: null, next: null, frac: null };
    if (isSunday) return out;
    var mins = now.getHours() * 60 + now.getMinutes();
    if (mins < slotMinutes(slots[0])[0]) return out;              // before the day begins
    if (mins >= slotMinutes(slots[slots.length - 1])[1]) {        // the day has ended
      out.phase = 'after';
      return out;
    }
    out.phase = 'during';
    out.visible = true;
    for (var i = 0; i < slots.length; i++) {
      var se = slotMinutes(slots[i]);
      if (mins >= se[0] && mins < se[1]) {
        out.cur = slots[i];
        out.frac = (mins - se[0]) / (se[1] - se[0]);
      }
      if (se[0] > mins && out.next === null) out.next = slots[i];
    }
    return out;
  }

  // Minutes from today's midnight until the session's next occurrence start
  // (strictly after `now`; wraps to next week when passed).
  function nextKey(s, now) {
    var st = slotMinutes(s.time)[0];
    var cur = now.getHours() * 60 + now.getMinutes();
    var ahead = (DAY_IDX[s.day] - now.getDay() + 7) % 7;
    if (ahead === 0 && st <= cur) ahead = 7;
    return ahead * 1440 + st;
  }

  // Indices of the session(s) with the earliest next occurrence.
  // Ties (e.g. stacked double sessions) are all marked.
  function nextSessionIdx(sessions, now) {
    now = now || new Date();
    var keys = (sessions || []).map(function (s) { return nextKey(s, now); });
    var best = Math.min.apply(null, keys);
    var out = new Set();
    keys.forEach(function (k, i) { if (k === best) out.add(i); });
    return out;
  }

  // 'today' if the teacher has a session today ending after `now`
  // (includes currently-teaching), else 'tomorrow' if any session tomorrow,
  // else null. Sessions are raw or fused rows ({day,time}).
  function availability(sessions, now) {
    now = now || new Date();
    var cur = now.getHours() * 60 + now.getMinutes();
    var today = JS_DAY[now.getDay()];
    if ((sessions || []).some(function (s) {
      return s.day === today && slotMinutes(s.time)[1] > cur;
    })) return 'today';
    var tomorrow = JS_DAY[(now.getDay() + 1) % 7];
    if ((sessions || []).some(function (s) { return s.day === tomorrow; }))
      return 'tomorrow';
    return null;
  }

  // Issue 050: start-from-today day lists for the day-group listings.
  // `anchorDay` is the unified rule: `today` iff some session today still
  // has an end after `now` (an in-progress session counts); otherwise the
  // first day, scanning forward cyclically through DAYS from the day after
  // today, that has any session. Sunday is not in DAYS and never has
  // sessions, so a Sunday (or post-Saturday) wrap lands on LUNDI. Never
  // DIMANCHE; null for an empty session list.
  function anchorDay(sessions, now) {
    now = now || new Date();
    var mins = now.getHours() * 60 + now.getMinutes();
    var today = JS_DAY[now.getDay()];
    var ss = sessions || [];
    if (ss.some(function (s) {
      return s.day === today && slotMinutes(s.time)[1] > mins;
    })) return today;
    var start = DAY_IDX[today] - 1; // 0-based DAYS position; NaN on Sunday
    for (var k = 1; k <= 6; k++) {
      var d = DAYS[(((start + k) % 6) + 6) % 6];
      if (ss.some(function (s) { return s.day === d; })) return d;
    }
    return null;
  }

  // Rotate a Monday-first distinct-day list so the listing starts at the
  // anchor day (see anchorDay). Pure: the input is never mutated; an empty
  // list or a null anchor returns the days unchanged.
  function startFromToday(days, sessions, now) {
    var a = anchorDay(sessions, now);
    if (a === null) return days.slice();
    var i = days.indexOf(a);
    if (i <= 0) return days.slice();
    return days.slice(i).concat(days.slice(0, i));
  }

  return {
    normStr: normStr, cmpByte: cmpByte, localeCmp: localeCmp, hoursLabel: hoursLabel,
    buildGroups: buildGroups, buildTeacherClasses: buildTeacherClasses,
    topClass: topClass, pillsFor: pillsFor,
    Teacher: Teacher, Subject: Subject, buildAll: buildAll,
    fusionKey: fusionKey,
    fuseSessions: fuseSessions, cmpSession: cmpSession, cmpFusedSession: cmpFusedSession,
    classWeek: classWeek,
    JS_DAY: JS_DAY, DAY_IDX: DAY_IDX, frDay: frDay,
    slotMinutes: slotMinutes, isCurrentSession: isCurrentSession,
    dayCursor: dayCursor,
    nextKey: nextKey, nextSessionIdx: nextSessionIdx, availability: availability,
    startFromToday: startFromToday
  };
})();

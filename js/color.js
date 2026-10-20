// js/color.js — Layer 4: color engine.
// One consistent set of coloring rules for everything in the UI: day
// groups, now/next, availability, dim. Pages never invent
// color-ish class names ad hoc — they map state to class lists here, and
// styles.css is the single visual definition of the vocabulary.
var TT = TT || {};
TT.color = (function () {
  // The canonical class vocabulary. styles.css defines how each looks;
  // nothing else may restyle these states.
  var C = {
    now: 'now',                 // session/slot is live right now
    next: 'next',               // session/slot is the upcoming one
    dim: 'dim',                 // no live stake (past day / non-today group)
    today: 'today',             // today's day group
    dayStart: 'daystart',       // first row of a day block (strong separator)
    active: 'active',           // selected list/detail row
    exact: 'exact',             // exact match (live list)
    partial: 'partial',         // partial match (live list)
    match: 'match'              // highlighted match inside a label
  };

  // Session row in a teacher/slot table.
  // st: {isNow, isNext, dayStart, dimIdle} — dimIdle = the row's day has no
  // now/next stake (all sessions that day are past).
  function sessionRow(st) {
    var c = [];
    if (st.isNow) c.push(C.now);
    else if (st.isNext) c.push(C.next);
    if (st.dayStart) c.push(C.dayStart);
    if (st.dimIdle) c.push(C.dim);
    return c;
  }

  // Day-group header (time page). Sunday: no today marker, no dimming.
  function dayGroup(st) {
    if (st.isSunday) return [];
    return st.isToday ? [C.today] : [C.dim];
  }

  // Slot entry (time page). now/next only occur inside today's section.
  function slotEntry(st) {
    var c = [];
    if (st.isNow) c.push(C.now);
    if (st.isNext) c.push(C.next);
    if (st.dim) c.push(C.dim);
    return c;
  }

  // Teacher list item. Availability no longer colors list rows (it still
  // drives ordering in match.liveSearch, but has no visual encoding here).
  function teacherItem(st) {
    var c = [];
    if (st && st.active) c.push(C.active);
    return c;
  }

  // Class list item (classes page). Mirrors teacherItem: the active
  // selection only — the class list is a catalogue browser, not a ranked
  // result list, so it carries no exact/partial distinction.
  function classItem(st) {
    var c = [];
    if (st && st.active) c.push(C.active);
    return c;
  }

  // Week grid cell (classes page). now/next only occur inside today's
  // column; model.dayCursor() already suppresses both outside the current
  // slot window (Sunday, before 08h15, after 18h15).
  function weekCell(st) {
    var c = [];
    if (st.isNow) c.push(C.now);
    if (st.isNext) c.push(C.next);
    return c;
  }

  // Autocomplete suggestion row. `kind` is part of the identity (teacher /
  // subject / class) and always leads the class list.
  function suggestion(st) {
    var c = [st.kind];
    if (st.active) c.push(C.active);
    return c;
  }

  return {
    CLASSES: C,
    sessionRow: sessionRow, dayGroup: dayGroup, slotEntry: slotEntry,
    teacherItem: teacherItem, classItem: classItem, weekCell: weekCell,
    suggestion: suggestion
  };
})();

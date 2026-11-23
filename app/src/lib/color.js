// app/src/lib/color.js — Layer 4: color engine.
// One consistent set of coloring rules for everything in the UI: day
// groups, now/next, availability, dim. Pages never invent
// color-ish class names ad hoc — they map state to class lists here, and
// the stylesheet is the single visual definition of the vocabulary.

/**
 * The canonical class vocabulary. The stylesheet defines how each looks;
 * nothing else may restyle these states. Keys: now, next, dim, today,
 * dayStart, active, exact, partial, match (values are the CSS class
 * strings, e.g. dayStart -> 'daystart').
 */
export const CLASSES = {
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

/**
 * Session row in a teacher/slot table. The st state object carries
 * isNow/isNext/dayStart/dimIdle booleans — dimIdle = the row's day has no
 * now/next stake (all sessions that day are past). Returns the class
 * strings for the row, in vocabulary order.
 */
export function sessionRow(st) {
  const c = [];
  if (st.isNow) c.push(CLASSES.now);
  else if (st.isNext) c.push(CLASSES.next);
  if (st.dayStart) c.push(CLASSES.dayStart);
  if (st.dimIdle) c.push(CLASSES.dim);
  return c;
}

/**
 * Teacher list item. Availability no longer colors list rows (it still
 * drives ordering in match.liveSearch, but has no visual encoding here).
 */
export function teacherItem(st) {
  const c = [];
  if (st && st.active) c.push(CLASSES.active);
  return c;
}

/**
 * Class list item (classes page). Mirrors teacherItem: the active
 * selection only — the class list is a catalogue browser, not a ranked
 * result list, so it carries no exact/partial distinction.
 */
export function classItem(st) {
  const c = [];
  if (st && st.active) c.push(CLASSES.active);
  return c;
}

/**
 * Week grid cell (classes page). now/next only occur inside today's
 * column; model.dayCursor() already suppresses both outside the current
 * slot window (Sunday, before 08h15, after 18h15).
 */
export function weekCell(st) {
  const c = [];
  if (st.isNow) c.push(CLASSES.now);
  if (st.isNext) c.push(CLASSES.next);
  return c;
}


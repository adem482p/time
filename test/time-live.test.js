// Tests for the time page's live clock wiring (issue 051) — run with
// `node --test test/`. ESM/SvelteKit retarget of the legacy page tests: the
// behavioral battery drives the real lib computations the at page runs
// (isCurrentSession, slotMinutes, fuseSessions — model.js/data.js) directly
// against the real emplois.csv with fixed Dates, and the rendering shape is
// pinned structurally on app/src/routes/at/+page.svelte (the matrix page
// stays time-blind, also structurally). No component runner, no vm DOM stubs.
// The file name stays clear of issue #054's future app.test.js.

import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createStore } from '../app/src/lib/data.js';
import * as model from '../app/src/lib/model.js';
import * as color from '../app/src/lib/color.js';
import { CSV_PATH, readSrc, countTok } from './helpers.js';

var store = createStore(fs.readFileSync(CSV_PATH, 'utf8'));
var modelObjs = model.buildAll(store);

var TIME = readSrc('app', 'src', 'routes', 'at', '+page.svelte');
var ALL = readSrc('app', 'src', 'routes', 'all', '+page.svelte');
var TEACHERS = readSrc('app', 'src', 'routes', 'teachers', '+page.svelte');
var CLOCK = readSrc('app', 'src', 'lib', 'clock.js');

function at(monthDay, hh, mm) { return new Date(2026, 9, monthDay, hh, mm); }

function count(hay, needle) { return hay.split(needle).length - 1; }

// ---- the page's derivation, driven directly on the lib ----------------------

// One render of the slot list at a fixed clock: the at page derives the
// whole thing from (store, activeSlot, now). This mirror walks store.days ×
// store.slots exactly the way the {#each} loops do, and computes entry
// classes the way entryClasses/marksFor do. The structural pins below bind
// this record to the template.
function slotListModel(now, activeSlot) {
  const todayName = model.JS_DAY[now.getDay()];
  const isSunday = model.DAY_IDX[todayName] === undefined;
  const children = [];
  if (isSunday)
    children.push({ info: 'No sessions on Sunday — showing the full week.' });
  let nextSlot = null;
  if (!isSunday) {
    const curMins = now.getHours() * 60 + now.getMinutes();
    for (const slot of store.slots) {
      if (model.slotMinutes(slot)[0] > curMins) { nextSlot = slot; break; }
    }
  }
  const dayOver = !!store && !isSunday && nextSlot === null &&
    !store.slots.some(function (s) { return model.isCurrentSession(todayName, s, now); });
  store.days.forEach(function (d) {
    const isToday = !isSunday && d === todayName;
    const bucketTok = isSunday ? '' : isToday ? color.CLASSES.today : color.CLASSES.dim;
    children.push({
      bucket: d, tok: bucketTok,
      text: d + (isToday ? ' (today) (' : ' (') +
        store.rows.filter(function (r) { return r.day === d; }).length + ')'
    });
    store.slots.forEach(function (slot) {
      const isNow = model.isCurrentSession(d, slot, now);
      const isNext = !isSunday && d === todayName && slot === nextSlot;
      const dim = !isSunday && d !== todayName;
      const cls = color.slotEntry({ isNow: isNow, isNext: isNext, dim: dim });
      if (activeSlot === d + '|' + slot) cls.push(color.CLASSES.active);
      children.push({ day: d, slot: slot, tok: cls.join(' '),
                      now: isNow, next: isNext, dim: dim, active: activeSlot === d + '|' + slot });
    });
    if (isToday && dayOver) children.push({ info: 'Day over — no more sessions today.' });
  });
  return { todayName: todayName, isSunday: isSunday, nextSlot: nextSlot,
           dayOver: dayOver, children: children };
}

function bucketOf(h, day) {
  return h.children.filter(function (c) { return c.bucket === day; })[0];
}
function entryAt(h, day, slot) {
  return h.children.filter(function (c) { return c.day === day && c.slot === slot; })[0];
}
function infoRows(h) {
  return h.children.filter(function (c) { return c.info !== undefined; });
}
function hasTok(el, tok) {
  return (el.tok || '').split(' ').indexOf(tok) !== -1;
}

// ---- structural pins -----------------------------------------------------------

test('the at page drives the list from one clock and leaves the matrix time-blind (issue 051)', function () {
  // the page subscribes once at mount; the clock owns the cadence
  assert.strictEqual(count(TIME, 'clock((t)'), 1, 'one subscription per page');
  assert.ok(TIME.indexOf('now = t;') !== -1, 'the tick hands one fresh Date to the page');
  assert.ok(TIME.indexOf('setInterval') === -1 && TIME.indexOf('visibilitychange') === -1,
    'the page runs no cadence of its own');
  assert.strictEqual(count(TIME, 'new Date()'), 1, 'the mount capture is the page\'s only Date');
  // every live surface re-derives from now: the marks, the next slot, the
  // day-over state, the today bucket
  assert.ok(TIME.indexOf('const todayName = $derived(model.JS_DAY[now.getDay()]);') !== -1,
    'the today bucket derives from the tick');
  assert.ok(TIME.indexOf('const nextSlot = $derived.by(() => {') !== -1,
    'the next-slot derivation exists');
  assert.ok(TIME.indexOf('isNow: model.isCurrentSession(day, slot, now)') !== -1,
    'the NOW mark derives from the tick');
  assert.ok(TIME.indexOf('isNext: !isSunday && day === todayName && slot === nextSlot') !== -1,
    'the NEXT mark derives from the tick');
  assert.ok(TIME.indexOf('const dayOver = $derived(') !== -1, 'the day-over line derives');
  // the boot auto-scroll is the only scroll write
  assert.strictEqual(count(TIME, 'scrollTop'), 1, 'the auto-scroll is the only scroll write');
  assert.ok(TIME.indexOf("slotListEl.querySelector('li.today')") !== -1 &&
    TIME.indexOf("slotListEl.scrollTop = todayBucket.offsetTop - slotListEl.offsetTop;") !== -1,
    'the boot auto-scroll pins the today bucket to the pane top');
  // no gating state on the time page
  assert.ok(TIME.indexOf('listKey') === -1 && TIME.indexOf('lastListKey') === -1,
    'no gating state on the time page');
  // the matrix page runs no timer and reads no clock
  assert.ok(ALL.indexOf("$lib/clock.js") === -1 && ALL.indexOf('clock(') === -1,
    'the matrix page subscribes to no clock');
  assert.ok(ALL.indexOf('new Date') === -1, 'the matrix page reads no clock');
});

test('one clock module serves all three pages (issue 051)', function () {
  // the byte-identical clock block is now a shared module, imported by name
  // on each page — the constancy that was pinned per file
  var pages = { 'at/+page.svelte': TIME, 'teachers/+page.svelte': TEACHERS, 'all/+page.svelte': ALL };
  ['at/+page.svelte', 'teachers/+page.svelte'].forEach(function (name) {
    assert.ok(pages[name].indexOf("import { clock } from '$lib/clock.js';") !== -1,
      name + ' pulls the one clock module');
  });
  // the matrix page stays time-blind (checked in the wiring test above); the
  // cadence lives exactly once, in the module
  assert.ok(CLOCK.indexOf("setInterval(tick, 30000)") !== -1, 'the clock owns the 30 s interval');
  assert.ok(CLOCK.indexOf("addEventListener('visibilitychange'") !== -1,
    'one tab-return catch-up listener');
  assert.ok(CLOCK.indexOf('document.hidden') !== -1, 'only a visible tab catches up');
  assert.strictEqual(CLOCK.split('setInterval(tick').length - 1, 1,
    'the interval is wired exactly once');
  assert.ok(CLOCK.indexOf('tick(); // immediate first hand-off') !== -1,
    'the first hand-off lands on subscription');
});

// ---- behavioral battery ---------------------------------------------------------

test('the time page opens from the page clock and re-renders on every tick (issue 051)', function () {
  var h = slotListModel(at(14, 10, 30), null);
  assert.strictEqual(h.children.length, 42, '6 days x (1 bucket + 6 entries)');
  var nowEntry = entryAt(h, 'MERCREDI', '10h00-11h30');
  assert.ok(hasTok(nowEntry, color.CLASSES.now), '10h00-11h30 is NOW');
  var nextEntry = entryAt(h, 'MERCREDI', '11h40-13h10');
  assert.ok(hasTok(nextEntry, color.CLASSES.next), '11h40-13h10 is NEXT');
  var mb = bucketOf(h, 'MERCREDI');
  assert.strictEqual(mb.text, 'MERCREDI (today) (216)');
  assert.ok(hasTok(mb, color.CLASSES.today), 'the today bucket is marked');
  assert.ok(store.days.filter(function (d) { return d !== 'MERCREDI'; })
    .every(function (d) { return hasTok(bucketOf(h, d), color.CLASSES.dim); }),
    'every other bucket dims');
  // a slot-boundary tick rebuilds the list
  h = slotListModel(at(14, 12, 0), null);
  assert.ok(hasTok(entryAt(h, 'MERCREDI', '11h40-13h10'), color.CLASSES.now), 'NOW moved');
  assert.ok(hasTok(entryAt(h, 'MERCREDI', '13h20-14h50'), color.CLASSES.next), 'NEXT moved');
  assert.ok(hasTok(bucketOf(h, 'MERCREDI'), color.CLASSES.today), 'still the today bucket');
  // a same-state tick re-renders on the hit, not on a diff: the record is
  // computed fresh, tokens identical
  var h2 = slotListModel(at(14, 12, 20), null);
  assert.deepStrictEqual(h2.todayName, 'MERCREDI', 're-renders from the fresh clock');
  assert.deepStrictEqual(
    h2.children.map(function (c) { return c.tok; }).join('|'),
    slotListModel(at(14, 12, 0), null).children.map(function (c) { return c.tok; }).join('|'),
    'same-state ticks produce the same vocabulary');
  // and the template re-derives without any gate between renders
  assert.ok(TIME.indexOf("class={entryClasses(d, slot).join(' ')}") !== -1,
    'entry classes recompute per render');
});

test('the day-over line appears on the evening tick (issue 051)', function () {
  var h = slotListModel(at(14, 18, 30), null);
  assert.strictEqual(h.children.length, 43, '42 rows + the day-over line');
  assert.ok(h.dayOver, 'the derivation turns the day-over line on');
  var nowCount = h.children.filter(function (c) { return hasTok(c, color.CLASSES.now); }).length;
  assert.strictEqual(nowCount, 0, 'nothing is NOW after the day');
  var over = infoRows(h).filter(function (c) {
    return c.info === 'Day over — no more sessions today.';
  });
  assert.strictEqual(over.length, 1, 'exactly one day-over line');
  assert.strictEqual(infoRows(h).length, 1, 'the line is the only info row');
  var mb = bucketOf(h, 'MERCREDI');
  assert.strictEqual(mb.text.indexOf('MERCREDI (today)'), 0, 'the bucket still says today');
  assert.ok(hasTok(mb, color.CLASSES.today));
});

test('midnight moves the today bucket and keeps the selected slot (issue 051)', function () {
  // the slot click: show(day, slot) writes the activeSlot fact
  var sel = 'VENDREDI|10h00-11h30';
  var show = function (day, slot) { sel = day + '|' + slot; };
  show('VENDREDI', '10h00-11h30');
  var h = slotListModel(at(14, 10, 30), sel);
  assert.ok(entryAt(h, 'VENDREDI', '10h00-11h30').active, 'the selection is marked');
  // the click drives the real slot detail: the fused rows of the slot
  var rows = store.byDaySlot('VENDREDI', '10h00-11h30');
  assert.ok(rows.length > 0, 'the slot has rows to show');
  const fused = model.fuseSessions(rows, modelObjs.groups);
  assert.strictEqual(fused.length, 30, 'the detail table shows the fused slot rows');
  // a midnight tick: the facts stay (activeSlot is not clock-driven), the
  // marks move
  h = slotListModel(at(15, 9, 0), sel);
  var jb = bucketOf(h, 'JEUDI');
  assert.strictEqual(jb.text.indexOf('JEUDI (today)'), 0, 'the today bucket moved to Thursday');
  assert.ok(hasTok(jb, color.CLASSES.today));
  assert.ok(hasTok(bucketOf(h, 'MERCREDI'), color.CLASSES.dim), 'yesterday dims');
  assert.ok(model.isCurrentSession('JEUDI', '08h15-09h45', at(15, 9, 0)) &&
    hasTok(entryAt(h, 'JEUDI', '08h15-09h45'), color.CLASSES.now),
    'Thursday 08h15 is NOW');
  assert.ok(entryAt(h, 'VENDREDI', '10h00-11h30').active,
    'the recreated entry carries the selection from state');
  // the detail pane is slot-derived and never clock-driven
  var drAt = TIME.indexOf('const detailRows = $derived.by(() => {');
  var drEnd = TIME.indexOf('function show(day, slot) {', drAt);
  var detailSlice = TIME.slice(drAt, drEnd);
  assert.ok(drAt !== -1 && drEnd !== -1, 'the detail derivation block bounds');
  assert.ok(/now\b/.test(detailSlice) === false || detailSlice.indexOf(' now') === -1,
    'the detail derivation reads no clock');
  assert.ok(detailSlice.indexOf('model.fuseSessions(rows, groups)') !== -1,
    'the detail shows the fused rows of the active slot');
  assert.ok(detailSlice.indexOf('store.byDaySlot(day, slot)') !== -1,
    'the detail reads the active day|slot key');
});

test('Sunday shows the no-sessions note with no today bucket (issue 051)', function () {
  var h = slotListModel(at(18, 10, 0), null);
  assert.ok(h.isSunday, 'the Thursday tick reaches Sunday 2026-10-18');
  assert.strictEqual(h.children.length, 43, '1 info row + 42 list rows');
  var notes = infoRows(h).filter(function (c) {
    return c.info === 'No sessions on Sunday — showing the full week.';
  });
  assert.strictEqual(notes.length, 1, 'exactly the Sunday note');
  var buckets = h.children.filter(function (c) { return c.bucket !== undefined; });
  assert.strictEqual(buckets.length, 6, 'six day buckets, none today');
  buckets.forEach(function (b) {
    assert.ok(b.text.indexOf('(today)') === -1, 'no today bucket on Sunday');
  });
  var marked = h.children.filter(function (c) {
    return [color.CLASSES.now, color.CLASSES.next, color.CLASSES.dim].some(function (tok) {
      return hasTok(c, tok);
    });
  });
  assert.strictEqual(marked.length, 0, 'no now/next/dim marks on Sunday');
  store.days.forEach(function (d) {
    store.slots.forEach(function (slot) {
      assert.strictEqual(model.isCurrentSession(d, slot, at(18, 10, 0)), false,
        'no slot of ' + d + ' can be NOW on Sunday');
    });
  });
});

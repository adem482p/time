// Tests for the time page's live clock wiring (issue 051) — run with
// `node --test test/`. The real initTimePage/renderSlotList/onTick source
// (js/app.js) is driven in a vm sandbox with stubbed DOM elements and a
// swappable clock; the matrix page stays time-blind (structural pin). The
// file name stays clear of issue #054's future app.test.js.

'use strict';

var test = require('node:test');
var assert = require('node:assert');
var fs = require('node:fs');
var path = require('node:path');
var vm = require('node:vm');

var CSV_PATH = path.join(__dirname, '..', 'emplois.csv');
var ROOT = path.join(__dirname, '..');

// load the browser script stack into one shared TT context, like the pages do
function loadStack() {
  var ctx = { console: console };
  vm.createContext(ctx);
  ['js/data.js', 'js/libgroups.js', 'js/model.js', 'js/match.js', 'js/color.js'].forEach(function (f) {
    var src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    vm.runInContext(src, ctx, { filename: f });
  });
  return ctx.TT;
}

var TT = loadStack();
var data = TT.data, model = TT.model, color = TT.color;

var store = data.createStore(fs.readFileSync(CSV_PATH, 'utf8'));
var modelObjs = model.buildAll(store);

var APP_SRC = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
var CLASSES_JS = fs.readFileSync(path.join(ROOT, 'js/classes.js'), 'utf8');
var TEACHERS_JS = fs.readFileSync(path.join(ROOT, 'js/teachers.js'), 'utf8');

var RealDate = Date;
function at(monthDay, hh, mm) { return new RealDate(2026, 9, monthDay, hh, mm); }

function count(hay, needle) { return hay.split(needle).length - 1; }

// ---- source slices -----------------------------------------------------------

function timeSlice() {
  var start = APP_SRC.indexOf('function initTimePage');
  var end = APP_SRC.indexOf('function initTimetablePage', start);
  assert.ok(start !== -1 && end !== -1 && end > start, 'time slice bounds');
  return APP_SRC.slice(start, end);
}

function matrixSlice() {
  var start = APP_SRC.indexOf('function initTimetablePage');
  var end = APP_SRC.indexOf('function boot(store)', start);
  assert.ok(start !== -1 && end !== -1 && end > start, 'matrix slice bounds');
  return APP_SRC.slice(start, end);
}

function clockBlock(src, file) {
  var marker = '// ---- clock (issue 051)';
  var start = src.indexOf(marker);
  assert.ok(start !== -1, file + ': clock marker present');
  var end = src.indexOf('// ---- ', start + marker.length);
  assert.ok(end !== -1, file + ': clock block bounded by the next section marker');
  return src.slice(start, end);
}

// the time entries embed NEXT_ARROW; the harness executes its declaration too
function appArrowStmt() {
  var start = APP_SRC.indexOf('var NEXT_ARROW =');
  var end = APP_SRC.indexOf('</svg>\';', start);
  assert.ok(start !== -1 && end !== -1, 'NEXT_ARROW bounds');
  return APP_SRC.slice(start, end + '</svg>\';'.length);
}

// ---- element + document stubs -------------------------------------------------

function makeClassList(el) {
  function toks() { return el.className ? el.className.split(' ') : []; }
  return {
    add: function (c) {
      var t = toks();
      if (t.indexOf(c) === -1) el.className = t.concat(c).join(' ');
    },
    remove: function (c) {
      el.className = toks().filter(function (t) { return t !== c; }).join(' ');
    },
    toggle: function (c, force) {
      var has = toks().indexOf(c) !== -1;
      var want = force === undefined ? !has : !!force;
      if (want && !has) this.add(c);
      if (!want && has) this.remove(c);
    },
    contains: function (c) { return toks().indexOf(c) !== -1; }
  };
}

function makeEl(offsets) {
  var el = {
    dataset: {},
    className: '',
    textContent: '',
    innerHTML: '',
    onclick: null,
    hidden: false,
    offsetTop: offsets.n++,
    children: []
  };
  el.classList = makeClassList(el);
  return el;
}

function makeUl(offsets) {
  var el = makeEl(offsets);
  var html = '';
  Object.defineProperty(el, 'innerHTML', {
    get: function () { return html; },
    set: function (v) { html = v; if (v === '') el.children = []; }
  });
  el.writes = 0;
  el.appendChild = function (child) { el.children.push(child); el.writes++; };
  el.querySelectorAll = function (sel) {
    if (sel === 'li[data-day]')
      return el.children.filter(function (c) { return c.dataset && c.dataset.day !== undefined; });
    if (sel === 'li.active')
      return el.children.filter(function (c) { return c.classList.contains('active'); });
    return [];
  };
  el.querySelector = function (sel) { return el.querySelectorAll(sel)[0] || null; };
  return el;
}

// One init per harness: the real initTimePage slice runs against the stub
// document; the clock subscriber is captured so tests can drive hits.
function initTimeAt(clockMs) {
  var offsets = { n: 1 };
  var ul = makeUl(offsets);
  ul.offsetTop = 0;
  var detail = { innerHTML: '' };
  var status = { textContent: '' };
  var byId = { slotList: ul, detail: detail, status: status };
  var subscribed = null;
  var sandbox = {
    console: console,
    model: model, color: color, C: color.CLASSES, esc: data.esc,
    nameHTML: data.nameHTML,
    store: store, modelObjs: modelObjs,
    document: {
      createElement: function () { return makeEl(offsets); },
      getElementById: function (id) { return byId[id] || null; },
      addEventListener: function () {},
      hidden: false
    },
    clock: { subscribe: function (fn) { subscribed = fn; } },
    Date: function () { return new RealDate(clockMs); }
  };
  vm.createContext(sandbox);
  vm.runInContext(appArrowStmt() + '\n' + timeSlice() + '\ninitTimePage(store, modelObjs);', sandbox,
    { filename: 'time-live-harness' });
  assert.ok(subscribed, 'the time page subscribes to the clock');
  return {
    sandbox: sandbox, ul: ul, detail: detail, status: status,
    tickTo: function (ms) { subscribed(new RealDate(ms)); },
    children: function () { return ul.children; }
  };
}

function entryAt(h, day, slot) {
  return h.children().filter(function (c) {
    return c.dataset.day === day && c.dataset.slot === slot;
  })[0];
}

function bucketOf(h, day) {
  return h.children().filter(function (c) {
    return c.classList.contains('bucket') && c.textContent.indexOf(day + ' ') === 0;
  })[0];
}

function hasTok(el, tok) { return el.className.split(' ').indexOf(tok) !== -1; }

// ---- structural pins -----------------------------------------------------------

test('js/app.js drives the time page from one clock and leaves the matrix time-blind (issue 051)', function () {
  var head = APP_SRC.slice(0, APP_SRC.indexOf('function initTimePage'));
  ['// ---- clock (issue 051)', 'subscribe: function (fn)', 'subs.indexOf(fn) === -1',
   'setInterval(tick, 30000)', 'visibilitychange', 'document.hidden'].forEach(function (tok) {
    assert.ok(head.indexOf(tok) !== -1, 'shared head: ' + tok);
  });
  assert.strictEqual(count(APP_SRC, 'new Date()'), 2, 'init capture + the clock tick');
  assert.strictEqual(count(APP_SRC, "addEventListener('visibilitychange'"), 1,
    'one tab-return catch-up listener');
  var slice = timeSlice();
  assert.ok(slice.indexOf('function renderSlotList()') !== -1, 'the slot list has one producer');
  assert.ok(slice.indexOf('function onTick(') !== -1, 'the page subscriber exists');
  assert.ok(slice.indexOf('clock.subscribe(onTick);') !== -1, 'the page subscribes at init');
  assert.strictEqual(count(slice, 'scrollTop'), 1, 'the boot auto-scroll is the only scroll write');
  assert.ok(slice.indexOf('listKey') === -1 && slice.indexOf('lastListKey') === -1,
    'no gating state on the time page');
  var matrix = matrixSlice();
  assert.ok(matrix.indexOf('setInterval') === -1 && matrix.indexOf('new Date') === -1,
    'the matrix page runs no timer and reads no clock');
});

test('the clock module is byte-identical in all three page files (issue 051)', function () {
  var classesClock = clockBlock(CLASSES_JS, 'js/classes.js');
  var teachersClock = clockBlock(TEACHERS_JS, 'js/teachers.js');
  var appClock = clockBlock(APP_SRC, 'js/app.js');
  assert.strictEqual(classesClock, teachersClock, 'classes/teachers clock drift');
  assert.strictEqual(teachersClock, appClock, 'teachers/app clock drift');
});

// ---- behavioral battery ---------------------------------------------------------

test('the time page opens from the page clock and re-renders on every tick (issue 051)', function () {
  var h = initTimeAt(at(14, 10, 30).getTime());
  assert.strictEqual(h.children().length, 42, '6 days x (1 bucket + 6 entries)');
  var nowEntry = entryAt(h, 'MERCREDI', '10h00-11h30');
  assert.ok(hasTok(nowEntry, color.CLASSES.now), '10h00-11h30 is NOW');
  assert.ok(nowEntry.innerHTML.indexOf('nowtag') !== -1, 'NOW tag rendered');
  var nextEntry = entryAt(h, 'MERCREDI', '11h40-13h10');
  assert.ok(hasTok(nextEntry, color.CLASSES.next), '11h40-13h10 is NEXT');
  var mb = bucketOf(h, 'MERCREDI');
  assert.strictEqual(mb.textContent, 'MERCREDI (today) (216)');
  assert.ok(hasTok(mb, color.CLASSES.today), 'the today bucket is marked');
  assert.ok(h.ul.scrollTop > 0 && h.ul.scrollTop === mb.offsetTop, 'the boot auto-scroll ran');
  var w0 = h.ul.writes;
  h.tickTo(at(14, 12, 0).getTime());
  assert.ok(h.ul.writes > w0, 'the slot-boundary tick rebuilt the list');
  assert.ok(hasTok(entryAt(h, 'MERCREDI', '11h40-13h10'), color.CLASSES.now), 'NOW moved');
  assert.ok(hasTok(entryAt(h, 'MERCREDI', '13h20-14h50'), color.CLASSES.next), 'NEXT moved');
  assert.ok(hasTok(bucketOf(h, 'MERCREDI'), color.CLASSES.today), 'still the today bucket');
  var w1 = h.ul.writes;
  h.tickTo(at(14, 12, 20).getTime());
  assert.ok(h.ul.writes > w1, 'a same-state tick re-renders on the hit, not on a diff');
});

test('the day-over line appears on the evening tick (issue 051)', function () {
  var h = initTimeAt(at(14, 10, 30).getTime());
  h.tickTo(at(14, 18, 30).getTime());
  assert.strictEqual(h.children().length, 43, '42 rows + the day-over line');
  var nowCount = h.children().filter(function (c) { return hasTok(c, color.CLASSES.now); }).length;
  assert.strictEqual(nowCount, 0, 'nothing is NOW after the day');
  var over = h.children().filter(function (c) {
    return c.textContent === 'Day over — no more sessions today.';
  });
  assert.strictEqual(over.length, 1, 'exactly one day-over line');
  assert.strictEqual(over[0].className, 'info');
  var mb = bucketOf(h, 'MERCREDI');
  assert.ok(mb.textContent.indexOf('MERCREDI (today)') === 0, 'the bucket still says today');
  assert.ok(hasTok(mb, color.CLASSES.today));
});

test('midnight moves the today bucket and keeps the selected slot (issue 051)', function () {
  var h = initTimeAt(at(14, 10, 30).getTime());
  var slotEntry = entryAt(h, 'VENDREDI', '10h00-11h30');
  assert.ok(slotEntry.onclick, 'the entry exposes its click');
  slotEntry.onclick(); // the real show(): slot table + active mark
  assert.ok(h.detail.innerHTML.indexOf('<table>') !== -1, 'show() wrote the slot table');
  assert.ok(hasTok(entryAt(h, 'VENDREDI', '10h00-11h30'), color.CLASSES.active),
    'the selection is marked');
  h.tickTo(at(15, 9, 0).getTime());
  var jb = bucketOf(h, 'JEUDI');
  assert.ok(jb.textContent.indexOf('JEUDI (today)') === 0, 'the today bucket moved to Thursday');
  assert.ok(hasTok(jb, color.CLASSES.today));
  assert.ok(hasTok(bucketOf(h, 'MERCREDI'), color.CLASSES.dim), 'yesterday dims');
  assert.ok(hasTok(entryAt(h, 'JEUDI', '08h15-09h45'), color.CLASSES.now),
    'Thursday 08h15 is NOW');
  assert.ok(hasTok(entryAt(h, 'VENDREDI', '10h00-11h30'), color.CLASSES.active),
    'the recreated entry carries the selection from state');
  assert.ok(h.detail.innerHTML.indexOf('<table>') !== -1, 'the detail pane is untouched by the tick');
});

test('Sunday shows the no-sessions note with no today bucket (issue 051)', function () {
  var h = initTimeAt(at(14, 10, 30).getTime());
  h.tickTo(at(18, 10, 0).getTime());
  assert.strictEqual(h.children().length, 43, '1 info row + 42 list rows');
  assert.strictEqual(h.children()[0].className, 'info');
  assert.strictEqual(h.children()[0].textContent, 'No sessions on Sunday — showing the full week.');
  var buckets = h.children().filter(function (c) { return c.classList.contains('bucket'); });
  assert.strictEqual(buckets.length, 6, 'six day buckets, none today');
  buckets.forEach(function (b) {
    assert.ok(b.textContent.indexOf('(today)') === -1, 'no today bucket on Sunday');
  });
  var marked = h.children().filter(function (c) {
    return [color.CLASSES.now, color.CLASSES.next, color.CLASSES.dim].some(function (tok) {
      return hasTok(c, tok);
    });
  });
  assert.strictEqual(marked.length, 0, 'no now/next/dim marks on Sunday');
});

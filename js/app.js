// js/app.js — page wiring for the time + matrix pages. Boots the store +
// analysis layer and dispatches to the per-page renderers
// (body[data-page]). The teachers and classes pages moved to js/teachers.js
// and js/classes.js (same shared head, self-contained per page); this file
// keeps only what time.html and timetable.html load. All coloring decisions
// go through TT.color; all domain data through TT.model. This file owns
// DOM only.
var TT = TT || {};
TT.app = (function () {
  var model = TT.model;
  var color = TT.color;
  var C = color.CLASSES;
  var esc = TT.data.esc;

  // Mobile gate (issue 007): coarse pointers (touch/soft keyboard) have no
  // Escape key to opt out of the pre-focused first suggestion, so Enter must
  // commit the typed query until the user explicitly picks a row. Guarded
  // like the prefers-reduced-motion query below; defaults to false (desktop)
  // when window/matchMedia is absent (e.g. node tests).
  function isCoarsePointer() {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    try { return !!window.matchMedia('(pointer: coarse)').matches; }
    catch (e) { return false; }
  }

  // Manual right-arrow for the "Next" marker. Drawn as SVG (not the Unicode
  // glyph) so it renders identically across platforms and inherits the tag color.
  var NEXT_ARROW = '<svg class="nextarrow" viewBox="0 0 24 24" aria-hidden="true">' +
    '<path d="M4 12h14M12 6l6 6-6 6"/></svg>';

  // ---- clock (issue 051) ------------------------------------------------
  // One clock per page: a single 30 s interval that hands a fresh Date to
  // every subscribed part of the page; a subscriber re-renders its own
  // region wholesale on every hit — no diffing, no gates (issue 051).
  // The first subscribe wires the interval and the tab-return catch-up; a
  // page that never subscribes (the matrix) runs no timer and no listener.
  var clock = (function () {
    var subs = [];
    var wired = false;
    function tick() {
      var now = new Date();
      for (var i = 0; i < subs.length; i++) subs[i](now);
    }
    return {
      subscribe: function (fn) {
        if (subs.indexOf(fn) === -1) subs.push(fn);
        if (wired) return;
        wired = true;
        setInterval(tick, 30000);
        document.addEventListener('visibilitychange', function () {
          if (!document.hidden) tick();
        });
      }
    };
  })();

  // ---- time page -------------------------------------------------------------

  function initTimePage(store, modelObjs) {
    var ul = document.getElementById('slotList');
    var detail = document.getElementById('detail');
    var status = document.getElementById('status');
    var now = new Date();
    var todayName = model.JS_DAY[now.getDay()];
    var isSunday = model.DAY_IDX[todayName] === undefined;

    function countOf(day) {
      return store.rows.filter(function (r) { return r.day === day; }).length;
    }

    // today-only "next": earliest slot start strictly after now; null on
    // Sunday or when nothing remains today (no week-wrap).
    function todayNextSlot() {
      if (isSunday) return null;
      var cur = now.getHours() * 60 + now.getMinutes();
      for (var i = 0; i < store.slots.length; i++) {
        if (model.slotMinutes(store.slots[i])[0] > cur) return store.slots[i];
      }
      return null;
    }
    var nextSlot = todayNextSlot();
    var activeSlot;  // the selected day|slot, restored on rebuilds (issue 051)

    function marksFor(day, slot) {
      return {
        isNow: model.isCurrentSession(day, slot, now),
        isNext: !isSunday && day === todayName && slot === nextSlot
      };
    }

    function entry(day, slot) {
      var li = document.createElement('li');
      li.dataset.day = day;
      li.dataset.slot = slot;
      var dim = !isSunday && day !== todayName;
      var m = marksFor(day, slot);
      color.slotEntry({ isNow: m.isNow, isNext: m.isNext, dim: dim })
        .forEach(function (c) { li.classList.add(c); });
      if (activeSlot === day + '|' + slot) li.classList.add(C.active);
      li.innerHTML = esc(slot) +
        (m.isNow ? ' <span class="nowtag">● NOW</span>' : '') +
        (m.isNext ? ' <span class="nexttag">' + NEXT_ARROW + 'NEXT</span>' : '');
      li.onclick = function () { show(day, slot); };
      return li;
    }

    function bucket(text, extra) {
      var hb = document.createElement('li');
      hb.className = 'bucket' + (extra ? ' ' + extra : '');
      hb.textContent = text;
      return hb;
    }

    // The slot list's only producer (issue 051): rebuilt wholesale from the
    // current clock state; the boot auto-scroll lives in the init, not here.
    function renderSlotList() {
      ul.innerHTML = '';
      if (isSunday) {
        var info = document.createElement('li');
        info.className = 'info';
        info.textContent = 'No sessions on Sunday — showing the full week.';
        ul.appendChild(info);
      }
      var todayBucket = null;
      store.days.forEach(function (d) {
        var isToday = !isSunday && d === todayName;
        var extra = isSunday ? '' : (isToday ? C.today : C.dim);
        var hb = bucket(d + (isToday ? ' (today) (' : ' (') + countOf(d) + ')', extra);
        ul.appendChild(hb);
        if (isToday) todayBucket = hb;
        store.slots.forEach(function (slot) { ul.appendChild(entry(d, slot)); });
        if (isToday && nextSlot === null &&
            !store.slots.some(function (s) { return model.isCurrentSession(todayName, s, now); })) {
          var ov = document.createElement('li');
          ov.className = 'info';
          ov.textContent = 'Day over — no more sessions today.';
          ul.appendChild(ov);
        }
      });
      return todayBucket;
    }

    // The page's subscriber to the one clock (issue 051): the whole slot
    // list re-renders from the clock's Date on every hit; the detail pane
    // is slot-derived and never touched.
    function onTick(t) {
      now = t;
      todayName = model.JS_DAY[now.getDay()];
      isSunday = model.DAY_IDX[todayName] === undefined;
      nextSlot = todayNextSlot();
      renderSlotList();
    }

    function show(day, slot) {
      activeSlot = day + '|' + slot;
      ul.querySelectorAll('li[data-day]').forEach(function (li) {
        li.classList.toggle(C.active,
          li.dataset.day === day && li.dataset.slot === slot);
      });
      var rows = store.byDaySlot(day, slot);
      if (!rows.length) {
        detail.innerHTML = '<p class="empty">No sessions ' + esc(day) + ' ' + esc(slot) + '.</p>';
        return;
      }
      var fused = model.fuseSessions(rows, modelObjs.groups);
      var h = '<table><tr><th>Teacher</th><th>Room</th><th>Subject</th><th>Students</th></tr>';
      fused.forEach(function (s) {
        h += '<tr><td>' + esc(s.professor || '—') + '</td><td>' + esc(s.room || '—') +
          '</td><td>' + esc(s.subject) + '</td><td>' +
          s.pills.map(function (p) { return '<span class="pill">' + esc(p) + '</span>'; }).join(' ') +
          '</td></tr>';
      });
      detail.innerHTML = h + '</table>';
    }

    var todayBucket = renderSlotList();
    // auto-scroll the pane so today's bucket header lands at the pane top
    if (todayBucket) ul.scrollTop = todayBucket.offsetTop - ul.offsetTop;
    status.textContent = store.size + ' sessions · ' + store.teachers.length + ' teachers';
    // the page subscribes once at init; the clock owns the cadence (issue 051)
    clock.subscribe(onTick);
  }

  // ---- matrix page -----------------------------------------------------------

  function initTimetablePage(store, modelObjs) {
    var table = document.getElementById('matrix');
    var dayFilter = document.getElementById('dayFilter');
    var search = document.getElementById('search');
    var status = document.getElementById('status');
    status.textContent = store.teachers.length + ' teachers × ' + store.slots.length + ' time slots.';

    function render() {
      var day = dayFilter.value;
      var q = search.value.trim().toLowerCase();
      var h = '<tr><th>Teacher</th>' +
        store.slots.map(function (s) { return '<th>' + esc(s) + '</th>'; }).join('') + '</tr>';
      store.teachers.forEach(function (n) {
        if (q && n.toLowerCase().indexOf(q) === -1) return;
        h += '<tr><td>' + esc(n) + '</td>';
        store.slots.forEach(function (slot) {
          var ss = store.sessionsOf(n).filter(function (s) {
            return s.time === slot && (!day || s.day === day);
          });
          ss.sort(model.cmpSession);
          h += '<td>' + ss.map(function (s) {
            return '<div class="cell"><span class="room">' + esc(s.room || '—') + '</span><br>' +
              '<span class="day">' + esc(model.frDay(s.day)) + '</span> ' + esc(s.subject) + '</div>';
          }).join('') + '</td>';
        });
        h += '</tr>';
      });
      table.innerHTML = h;
    }
    dayFilter.onchange = render;
    search.oninput = render;
    render();
  }

  // ---- boot --------------------------------------------------------------------

  // Dispatch: this file serves the time and matrix pages only. Teachers
  // and classes boot from js/teachers.js / js/classes.js (see header).
  function boot(store) {
    var modelObjs = model.buildAll(store);
    var page = document.body.getAttribute('data-page');
    if (page === 'time') initTimePage(store, modelObjs);
    else if (page === 'matrix') initTimetablePage(store, modelObjs);
  }

  document.addEventListener('DOMContentLoaded', function () {
    TT.data.loadStore().then(boot).catch(function (err) {
      var st = document.getElementById('status');
      if (st) st.textContent = 'Failed to load emplois.csv: ' + err;
    });
  });

  return { boot: boot };
})();

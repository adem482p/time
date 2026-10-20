// js/classes.js — classes page wiring. Self-contained per page: the shared
// head (TT.app IIFE + model/match/color aliases + coarse-pointer gate +
// NEXT_ARROW) is duplicated from js/app.js by design, not imported — zero
// coupling, no load-order constraints. All coloring decisions go through
// TT.color; all matching through TT.match; all domain data through TT.model.
// This file owns DOM only.
var TT = TT || {};
TT.app = (function () {
  var model = TT.model;
  var match = TT.match;
  var color = TT.color;
  var C = color.CLASSES;
  var esc = TT.data.esc;
  var nameHTML = TT.data.nameHTML;

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

  // ---- classes page -----------------------------------------------------------

  // Student-facing class timetable (issue 032). The class is chosen through a
  // live search over the leaf classes only (match.classSearch + the class
  // entries of match.suggest, both filtered to groups.leaves); selecting one
  // draws its week as a grid — days as columns, the six slots as rows — with
  // a semi-transparent red cursor at the current time and the current/next
  // slot cells highlighted. Broader classes (interior nodes) are not
  // selectable: they never appear in the catalogue and exact references to
  // them take the no-match path. On narrow screens the grid is replaced by a
  // teacher-style session card list (table.c-sessions).
  function initClassesPage(store, modelObjs, index) {
    var search = document.getElementById('search');
    var searchBack = document.getElementById('searchBack');
    var searchOverlay = document.getElementById('searchOverlay');
    var overlayName = document.getElementById('overlayName');
    var overlayClear = document.getElementById('overlayClear');
    var searchClear = document.getElementById('searchClear');
    var searchDeselect = document.getElementById('searchDeselect');
    var ghost = document.getElementById('ghost');
    var ghostTyped = document.getElementById('ghostTyped');
    var ghostPre = document.getElementById('ghostPre');
    var ghostRest = document.getElementById('ghostRest');
    var suggest = document.getElementById('suggest');
    var list = document.getElementById('classList');
    var detail = document.getElementById('detail');
    var status = document.getElementById('status');
    var layout = document.getElementById('layout');
    var groups = modelObjs.groups;
    var now = new Date();
    var suggestIdx = -1;
    // Leaf-only selection: the catalogue, the autocomplete and the commit
    // gate only ever offer the leaf classes (one timetable each). Interior
    // nodes (broader classes) are excluded everywhere below.
    var leafSet = {};
    groups.leaves.forEach(function (n) { leafSet[n.key] = true; });
    function isLeafRow(r) {
      var k = (r.node && r.node.key) || r.label;
      return !!leafSet[k];
    }
    function leafRows(rows) { return rows.filter(isLeafRow); }
    var suggestRows = [];
    // mobile nav machine (issue 058): two facts, three named states —
    //   menuOpen                    -> 'list'  (filterable list + back arrow)
    //   !menuOpen && selectedClass  -> 'class' (week view + name overlay)
    //   !menuOpen && !selectedClass -> 'empty' (kaomoji; the default)
    // Blur writes neither fact (a press in flight must never lose its row);
    // only openMenu/closeMenu (menu edges), selectClass and showEmpty write.
    var menuOpen = false;
    var selectedClass = null;
    var activeKey = null;
    var currentWeek; // the class view the clock refreshes until cleared (issue 051)

    status.textContent = store.size + ' sessions · ' + groups.leaves.length + ' classes';

    // List/detail swap state: `is-list` is present iff the menu is open.
    // syncList is the SOLE writer of `is-list`, deriving from the menuOpen
    // fact (issue 058) — no other code may touch the flag. Only narrow CSS
    // reads it (one pane at a time); wider screens keep both panes visible
    // and this only toggles state.
    function syncList() {
      if (!layout) return;
      if (menuOpen) layout.classList.add('is-list');
      else layout.classList.remove('is-list');
    }
    // clear "x" (issue 060), every viewport: shown only while the filter holds
    // text. Called wherever search.value can change (typing, commit, selection,
    // clear, boot). The X only ever erases (eraseFilter) — it never deselects.
    function syncClear() {
      if (searchClear) searchClear.hidden = !search.value;
      syncDeselect();
    }

    // deselect back arrow (issues 060, 064): while a class is selected and
    // the filter is empty, the whole box becomes this button (desktop CSS only;
    // narrow armours it off — its deselect chrome is #overlayClear). Facts-only
    // derivation: no menuOpen, no focus, no viewport test — CSS alone picks
    // the rendering. Keyboard emptying still deselects (pinned 058); the
    // clear X does not (pinned 060).
    function syncDeselect() {
      if (searchDeselect) searchDeselect.hidden = !(selectedClass !== null && search.value === '');
    }

    // The name overlay belongs to the 'class' state: hidden unless a
    // class is selected AND the menu is closed (issue 058).
    function syncOverlay() {
      searchOverlay.hidden = selectedClass === null || menuOpen;
      if (selectedClass !== null) overlayName.textContent = selectedClass;
      syncDeselect();
    }

    // menu edges: the list is open or not — blur writes neither fact
    function openMenu() {
      menuOpen = true;
      syncList();
      syncOverlay();
    }
    function closeMenu() {
      menuOpen = false;
      search.blur();
      syncList();
      syncOverlay();
    }

    // every deselect funnels through here; the filter text is preserved.
    // dropping currentWeek here (not at each caller) means no deselect path
    // can leave tick ownership behind and repaint over the empty page
    function showEmpty() {
      selectedClass = null;
      currentWeek = null;
      detail.innerHTML = emptyStateHTML();
      markActive(null);
      syncOverlay();
    }

    // the single selection funnel: every path that picks a class lands
    // here; blurs because the overlay owns the box in state=class
    function selectClass(ref) {
      selectedClass = ref;
      showClass(ref);
      search.blur();
      menuOpen = false;
      syncList();
      syncOverlay();
    }

    // A giant, faint emoticon fills the detail area whenever no class is
    // selected (initial load, or the filter cleared back to empty). The faces
    // come from the vendored kaomoji library (vendor/kaomoji.js, CC BY 4.0);
    // one is drawn per page load. The library spans short faces to very wide
    // ones, so the decoration only uses the ones that comfortably fit the
    // detail column, with a lone face as a no-library fallback. Pressing the
    // empty area makes the face hop and land on a different one (decorative,
    // mouse/tap-only easter egg — see the listener below).
    var HOP_MS = 240; // keep in sync with the empty-hop duration in styles.css
    var reducedMotion = (typeof window !== 'undefined' && window.matchMedia)
      ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

    function facePool() {
      if (!(TT.kaomoji && TT.kaomoji.all)) return [];
      return TT.kaomoji.all().filter(function (f) { return f.length <= 12; });
    }
    var emptyFace = (function () {
      var pool = facePool();
      if (!pool.length) return TT.kaomoji && TT.kaomoji.random ? TT.kaomoji.random() : '(＾▽＾)';
      return pool[Math.floor(Math.random() * pool.length)];
    })();

    // pick a face from the same pool that differs from the current one; the
    // filter bounds the choice, so the selection always terminates (and a
    // ≤1-entry pool simply returns the unchanged face).
    function nextFace() {
      var pool = facePool().filter(function (f) { return f !== emptyFace; });
      if (!pool.length) return emptyFace;
      return pool[Math.floor(Math.random() * pool.length)];
    }

    // Decorative easter egg: every press on the empty area immediately swaps in
    // a different face and restarts the hop from 0%, so the interaction keeps up
    // with however fast the user taps (no press is swallowed, no face is
    // coalesced). The restart is remove-class -> forced reflow
    // -> re-add-class (re-adding a live class alone does not replay a CSS
    // animation); the single listener below clears the class when the hop ends.
    // Reduced motion swaps instantly with no hop or `hopping` class.
    detail.addEventListener('click', function (e) {
      var empty = e.target && e.target.closest && e.target.closest('.empty-state');
      if (!empty) return;
      var face = empty.querySelector('.empty-face');
      if (!face) return;
      emptyFace = nextFace();
      face.textContent = emptyFace;
      if (reducedMotion && reducedMotion.matches) return;
      var angle = (Math.random() < .5 ? -1 : 1) * (8 + Math.random() * 12);
      empty.style.setProperty('--hop-rot', angle + 'deg');
      var transX = (Math.random() - 0.5) * 1.2;
      var transY = (Math.random() - 0.5) * 1.2;
      empty.style.setProperty('--hop-trans-x', transX + 'em');
      empty.style.setProperty('--hop-trans-y', transY + 'em');
      // overshoot: ~15% of throw distance, opposite direction (spring-back)
      empty.style.setProperty('--hop-overshoot-x', (-transX * 0.15) + 'em');
      empty.style.setProperty('--hop-overshoot-y', (-transY * 0.15) + 'em');
      empty.classList.remove('hopping');
      void empty.offsetWidth;
      empty.classList.add('hopping');
    });
    // One persistent listener (added once, not per press) clears the hop class
    // when the animation ends; it is delegated on #detail so it survives the
    // detail innerHTML re-renders.
    detail.addEventListener('animationend', function (e) {
      var empty = e.target && e.target.closest && e.target.closest('.empty-state');
      if (empty) empty.classList.remove('hopping');
    });

    function emptyStateHTML() {
      // heading first, face below it: the empty-state flex `gap` separates the
      // two, so the heading reads on top of the emoticon.
      return '<div class="empty-state" aria-hidden="true">' +
        '<div class="no-class-selected">No Class Selected</div>' +
        '<div class="empty-face">' + esc(emptyFace) + '</div>' +
      '</div>';
    }

    // ---- class list -----------------------------------------------------

    function renderList(rows) {
      var active = String(activeKey).toUpperCase();
      list.innerHTML = '';
      if (!rows.length) {
        var li0 = document.createElement('li');
        li0.className = 'empty';
        li0.textContent = 'No classes match.';
        list.appendChild(li0);
        return;
      }
      rows.forEach(function (r) {
        var li = document.createElement('li');
        li.className = color.classItem({
          active: String(r.label).toUpperCase() === active
        }).join(' ');
        li.dataset.key = r.label;
        var h = match.highlightHTML(r.label, r.ranges);
        if (r.node && r.node.fullName() !== r.label)
          h += ' <span class="alias">— ' + esc(r.node.fullName()) + '</span>';
        li.innerHTML = h;
        // The filter is the source of truth for the list: selecting a row must
        // not rewrite it, so the result list stays as-is and the user can move
        // to the next hit.
        li.onclick = function () { selectClass(r.label); };
        list.appendChild(li);
      });
    }

    function markActive(key) {
      activeKey = key;
      // the ref may reach here in any spelling the user typed
      // (classSearch is case-insensitive); node keys are uppercase
      list.querySelectorAll('li[data-key]').forEach(function (li) {
        li.classList.toggle(C.active,
          String(li.dataset.key).toUpperCase() === String(key).toUpperCase());
      });
    }

    // ---- week grid -------------------------------------------------------

    // Group the week's sessions by day|slot once, so each grid cell just
    // looks up its own list.
    function indexByDaySlot(week) {
      var by = {};
      week.sessions.forEach(function (s) {
        var k = s.day + '|' + s.time;
        (by[k] = by[k] || []).push(s);
      });
      return by;
    }

    function renderWeek(week, tickNow) {
      now = tickNow || new Date();   // one fresh clock per render pass (issue 051)
      currentWeek = week;            // the view the clock refreshes until cleared
      var cursor = model.dayCursor(now, store.slots);
      var by = indexByDaySlot(week);
      var h = '<h2>' + esc(week.name) + '</h2>';
      // Per-day session groups, rendered on every viewport: desktop shows the
      // sections above the week grid, narrow screens shape them into cards
      // (teacher-style, via the generic mobile table rules; the whole-week
      // label and grid below are display:none on narrow). One day-group section
      // per non-empty day, cyclic from today (issue 050), mirroring showTeacher
      // — the day lives in the heading once, so there is no Day column and
      // `dim` moves to the section. Row marking mirrors showTeacher with
      // today-only semantics: the same `now` and the computed `cursor` keep
      // the grid and the lists consistent; never nextSessionIdx (it wraps
      // into the coming days).
      // days with no live stake (no now/next session) render dimmed
      var liveDays = {};
      week.sessions.forEach(function (s) {
        if (model.isCurrentSession(s.day, s.time, now) ||
            (cursor.visible && s.day === cursor.today && s.time === cursor.next))
          liveDays[s.day] = true;
      });
      // One session row for the day-group tables: the first cell is the
      // NOW/NEXT tag when marked (the heading already names the day).
      function sessionRow(s) {
        var isNow = model.isCurrentSession(s.day, s.time, now);
        var isNext = !isNow && cursor.visible && s.day === cursor.today && s.time === cursor.next;
        var cls = color.sessionRow({
          isNow: isNow, isNext: isNext,
          dimIdle: false
        });
        return '<tr' + (cls.length ? ' class="' + cls.join(' ') + '"' : '') + '><td>' +
          (isNow ? '<span class="nowtag">● NOW</span>' : '') +
          (isNext ? '<span class="nexttag">' + NEXT_ARROW + 'NEXT</span>' : '') +
          '</td><td class="c-time">' + esc(s.time) +
          '</td><td class="c-teacher">' + nameHTML(s.professor, '—') +
          '</td><td class="c-subject">' + esc(s.subject) +
          '</td><td class="c-room">' + esc(s.room || '—') +
          '</td></tr>';
      }
      // one section per non-empty day, cyclic from today (issue 050: the
      // first-seen Monday-first day order is rotated to the anchor day)
      var dayOrder = [];
      var byDay = {};
      week.sessions.forEach(function (s) {
        if (!byDay[s.day]) { byDay[s.day] = []; dayOrder.push(s.day); }
        byDay[s.day].push(s);
      });
      dayOrder = model.startFromToday(dayOrder, week.sessions, now);
      dayOrder.forEach(function (day) {
        h += '<h3 class="day-head">' + esc(model.frDay(day)) + '</h3>';
        h += '<section class="day-group' + (liveDays[day] ? '' : ' dim') + '">';
        h += '<table class="c-sessions"><tr><th></th><th>Time</th>' +
          '<th>Teacher</th><th>Subject</th><th>Room</th></tr>';
        byDay[day].forEach(function (s) {
          h += sessionRow(s);
        });
        h += '</table></section>';
      });
      // the week grid <div class="weekwrap"> + red cursor (days as columns),
      // after the day sections (issue 048). Desktop labels it WHOLE WEEK below;
      // on narrow screens the label and this grid are display:none — the day
      // cards are the whole narrow view.
      h += '<h3 class="day-head week-head">WHOLE WEEK</h3>';
      h += '<div class="weekwrap"><table class="week"><thead><tr>';
      h += '<th class="cgutter"></th><th class="timecol"></th>';
      store.days.forEach(function (d) {
        var isToday = cursor.visible && d === cursor.today;
        h += '<th class="c-day' + (isToday ? ' ' + C.today : '') +
          '" data-day="' + esc(d) + '">' + esc(model.frDay(d)) + '</th>';
      });
      h += '</tr></thead><tbody>';
      store.slots.forEach(function (slot) {
        h += '<tr data-slot="' + esc(slot) + '"><td class="cgutter"></td>' +
          '<td class="c-time">' + esc(slot) + '</td>';
        store.days.forEach(function (d) {
          var isNow = cursor.visible && d === cursor.today && slot === cursor.cur;
          var isNext = cursor.visible && d === cursor.today && slot === cursor.next;
          var cls = color.weekCell({ isNow: isNow, isNext: isNext });
          if (cursor.visible && d === cursor.today) cls.push(C.today);
          var sessions = by[d + '|' + slot] || [];
          h += '<td class="c-cell' + (cls.length ? ' ' + cls.join(' ') : '') +
            '" data-day="' + esc(d) + '" data-slot="' + esc(slot) + '">';
          sessions.forEach(function (s) {
            h += '<div class="sess">' +
              '<span class="s-subject">' + esc(s.subject) + '</span>' +
              '<span class="s-teacher">' + nameHTML(s.professor, '—') + '</span>' +
              '<span class="s-room">' + esc(s.room || '—') + '</span>' +
              '</div>';
          });
          h += '</td>';
        });
        h += '</tr>';
      });
      h += '</tbody></table>';
      h += '<div class="cursor" aria-hidden="true"' +
        (cursor.visible ? '' : ' style="display:none"') +
        '><div class="cursor-arrow"></div></div>';
      h += '</div>';
      detail.innerHTML = h;          // unconditional: no gating (issue 051)
      if (!tickNow) {
        if (layout) layout.classList.remove('is-list');
        syncClear();
      }
      applyCursor(cursor);
    }

    // Move the red cursor line and toggle the now/next + today-header marks to
    // `cursor`. Idempotent: every tick clears the old marks and sets the new
    // ones, and shows/hides the cursor line, without a full re-render.
    function applyCursor(cursor) {
      detail.querySelectorAll('td.c-cell').forEach(function (td) {
        var isNow = cursor.visible && td.dataset.day === cursor.today && td.dataset.slot === cursor.cur;
        var isNext = cursor.visible && td.dataset.day === cursor.today && td.dataset.slot === cursor.next;
        td.classList.toggle(C.now, isNow);
        td.classList.toggle(C.next, isNext);
        td.classList.toggle(C.today, cursor.visible && td.dataset.day === cursor.today);
      });
      detail.querySelectorAll('th.c-day').forEach(function (th) {
        th.classList.toggle(C.today, cursor.visible && th.dataset.day === cursor.today);
      });
      var cursorEl = detail.querySelector('.cursor');
      if (!cursorEl) return;
      if (!cursor.visible) {
        cursorEl.style.display = 'none';
        return;
      }
      cursorEl.style.display = '';
      var wrap = detail.querySelector('.weekwrap');
      if (!wrap) return;
      var rows = wrap.querySelectorAll('tbody tr');
      // In the short gaps between slots no slot is current; the line
      // then rests on the boundary — the next row's top edge (frac is
      // null there, hence the || 0).
      var slot = cursor.cur || cursor.next;
      var idx = slot ? store.slots.indexOf(slot) : -1;
      if (idx < 0 || idx >= rows.length) return;
      var tr = rows[idx];
      var wrapRect = wrap.getBoundingClientRect();
      var trRect = tr.getBoundingClientRect();
      cursorEl.style.top = (trRect.top - wrapRect.top + (cursor.frac || 0) * trRect.height) + 'px';
      // Span the full (possibly scrollable) grid: on narrow screens the
      // grid scrolls horizontally inside .weekwrap, and the absolutely
      // positioned line must keep crossing it at every scroll offset.
      cursorEl.style.width = wrap.scrollWidth + 'px';
    }

    // The page's subscriber to the one clock (issue 051): the whole week
    // view re-renders from the clock's Date on every hit; with no owned week
    // the tick is a no-op, so a cleared view can never be resurrected.
    function onTick(t) {
      if (currentWeek) renderWeek(currentWeek, t);
    }

    function showClass(ref) {
      var week = model.classWeek(groups, ref);
      if (week.leaves.length !== 1) {
        detail.innerHTML = '<p class="nomatch">No class matches "' + esc(ref) + '".</p>';
        markActive(null);
        if (layout) layout.classList.remove('is-list');
        syncClear();
        currentWeek = null;
        return;
      }
      renderWeek(week);
      markActive(ref);
    }

    // ---- autocomplete overlay + shadow text ----------------------------

    function renderSuggest(rows) {
      suggestRows = rows;
      suggest.innerHTML = '';
      suggest.hidden = !rows.length;
      // Mobile (coarse pointer): no pre-focus, so Enter commits the typed
      // query until the user explicitly arrows/taps (issue 007). Desktop
      // keeps the pre-focused first row. Ghost derives from suggestIdx,
      // so -1 also means no ghost.
      suggestIdx = rows.length ? (isCoarsePointer() ? -1 : 0) : -1; // desktop pre-focuses row 0; mobile starts unselected
      rows.forEach(function (r, i) {
        var li = document.createElement('li');
        li.className = color.suggestion({ kind: r.kind, active: i === suggestIdx }).join(' ');
        var node = index.nodes[r.label];
        var body = match.highlightHTML(r.label, r.ranges) +
          (node ? ' <span class="alias">— ' + esc(node.fullName()) + '</span>' : '');
        li.innerHTML = '<span class="kind kind-' + r.kind + '">' + r.kind + '</span>' + body;
        li.addEventListener('mousedown', function (e) {
          e.preventDefault();
          acceptSuggest(r);
        });
        suggest.appendChild(li);
      });
      paintActive();
    }

    function paintActive() {
      suggest.querySelectorAll('li').forEach(function (li, i) {
        li.classList.toggle(C.active, i === suggestIdx);
      });
    }

    // Class-scoped ghost completion: completes to the bare class key with no
    // "class:" prefix hint (the whole page is class-scoped). Adapts the
    // shadowText prefix rule without forking match.js.
    function classGhost(q, row) {
      // Same strict rule as match.shadowText (issue #2): raw typed string,
      // case-insensitive, space like any other character.
      var raw = String(q == null ? '' : q);
      if (!raw || !raw.trim() || !row) return null;
      var rl = raw.toLowerCase();
      if (row.label && row.label.toLowerCase().indexOf(rl) === 0)
        return { pre: '', rest: row.label.slice(raw.length) };
      return null;
    }

    function renderGhost() {
      var row = suggestRows[suggestIdx];
      var sh = row ? classGhost(search.value, row) : null;
      if (sh) {
        ghost.hidden = false;
        ghostPre.textContent = sh.pre;
        ghostTyped.textContent = search.value;
        ghostRest.textContent = sh.rest;
        var preW = sh.pre ? ghostPre.getBoundingClientRect().width : 0;
        if (preW) search.style.setProperty('--ghost-pre', preW + 'px');
        else search.style.removeProperty('--ghost-pre');
      } else {
        ghost.hidden = true;
        ghostPre.textContent = '';
        ghostTyped.textContent = '';
        ghostRest.textContent = '';
        search.style.removeProperty('--ghost-pre');
      }
    }

    function acceptSuggest(row) {
      search.value = row.label;
      syncClear();
      renderSuggest([]);
      renderGhost();
      commit();
    }

    // ---- grouped live search ---------------------------------------------

    function classSuggestions(q) {
      // the page is class-scoped: keep only the class entries of the shared
      // autocomplete, so teachers/subjects never appear here — and leaf-only,
      // so broader classes are never offered.
      return match.suggest(index, q).filter(function (r) {
        return r.kind === 'class' && leafSet[r.label];
      });
    }

    // erase-only funnel (issue 060): the clear X lands here, never in
    // onInput()/commit() — emptying the box this way must NOT deselect. The
    // body is commit's empty branch minus showEmpty(): full leaf catalogue
    // from the empty query, suggest/ghost dropped, pane flag re-synced, no
    // selection fact written (renderList re-applies the active mark from
    // activeKey — unlike teachers' renderItem, hence no markActive here).
    // Keyboard emptying still deselects through onInput (pinned 058 ruling 5)
    // — a deliberate divergence: the keyboard runs the live-search derivation
    // (empty filter derives no selection), the X is an explicit erase-only
    // command whose landing state (selected + empty) presents the deselect arrow.
    function eraseFilter() {
      search.value = '';
      syncClear();
      renderSuggest([]);
      renderGhost();
      renderList(leafRows(match.classSearch(index, '')));
      syncList();
    }

    function onInput() {
      var q = search.value;
      syncClear();
      var rows = leafRows(match.classSearch(index, q));
      renderList(rows);
      renderSuggest(classSuggestions(q));
      renderGhost();
      // an empty filter means nothing is selected: back to the empty state
      if (!q.trim()) showEmpty();
      // exactly one result left -> auto-jump to the week view
      else if (rows.length === 1) { selectClass(rows[0].label); }
      syncList();
    }

    // An exact class label selects even among partial matches (mirror of
    // exactTeacher): tapping a suggest row commits its text, which may
    // still match others — the exact leaf wins.
    function exactClass(rows, q) {
      var want = model.normStr(q.trim());
      for (var i = 0; i < rows.length; i++) {
        if (model.normStr(rows[i].label) === want) return rows[i].label;
      }
      return null;
    }

    function commit() {
      var q = search.value;
      syncClear();
      renderSuggest([]);
      renderGhost();
      var rows = leafRows(match.classSearch(index, q));
      renderList(rows);
      var like = exactClass(rows, q);
      if (!q.trim()) {
        showEmpty();
        syncList();
        return;
      }
      if (model.classWeek(groups, q).leaves.length === 1) {
        selectClass(q);
      } else if (like) {
        selectClass(like);
      } else if (rows.length === 1) {
        selectClass(rows[0].label);
      } else if (!rows.length) {
        detail.innerHTML = '<p class="nomatch">No match for "' + esc(q) + '".</p>';
        currentWeek = null;
      }
      // no trailing syncList: a selection closes the menu and syncList
      // cannot resurrect a closed one
    }

    search.addEventListener('input', onInput);
    search.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        // <input type="search"> clears the field on Esc by default; cancel
        // that so Esc keeps the typed filter: it drops the suggest overlay
        // if open, else closes the menu — it never deselects.
        e.preventDefault();
        if (!suggest.hidden) { renderSuggest([]); renderGhost(); return; }
        closeMenu();
      }
      if (e.key === 'Tab') {
        // Issue 007: Tab must not accept an implicit (non-explicit)
        // selection on mobile (suggestIdx -1) — same gate as Enter.
        // Desktop is unchanged (fresh idx is 0, still accepts).
        if (!suggest.hidden && suggestRows.length && suggestIdx >= 0) {
          e.preventDefault();
          acceptSuggest(suggestRows[suggestIdx]);
        }
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (suggest.hidden) return;
        e.preventDefault();
        var items = suggest.querySelectorAll('li');
        if (!items.length) return;
        suggestIdx = e.key === 'ArrowDown'
          ? (suggestIdx + 1) % items.length
          : (suggestIdx - 1 + items.length) % items.length;
        paintActive();
        renderGhost();
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (!suggest.hidden && suggestRows.length && suggestIdx >= 0)
          acceptSuggest(suggestRows[suggestIdx]);
        else commit();
      }
    });
    search.addEventListener('focus', function () {
      openMenu();
    });
    // tapping the filter box always brings the menu back: focus alone does
    // not refire while the box never lost focus (row taps keep it focused),
    // but click fires on every tap.
    search.addEventListener('click', function () {
      openMenu();
    });
    // blur only drops the autocomplete overlay: menu visibility is
    // selection/back-driven, never blur-driven, so losing focus must never
    // hide the row a press is about to land on.
    search.addEventListener('blur', function () {
      renderSuggest([]);
      renderGhost();
    });

    // back dismisses the open list + focus and hides itself; a selected
    // class stays selected ("back to the earlier state" by construction)
    if (searchBack) searchBack.addEventListener('click', function () { closeMenu(); });
    // in state=class the overlay IS the box: the whole surface (name,
    // chevron, background) is one click target that reopens the list; its
    // left X (#overlayClear) is the separate deselect control
    if (searchOverlay) searchOverlay.addEventListener('click', function () {
      openMenu();
      search.focus();
    });
    if (overlayClear) overlayClear.addEventListener('click', function (e) {
      e.stopPropagation();
      showEmpty();
    });

    // the clear X erases the filter only — every viewport, every state
    // (issue 060): it never deselects and never arms the menu. Deselect is a
    // dedicated control: #searchDeselect (desktop, selected + empty filter),
    // #overlayClear (narrow class state); keyboard emptying keeps its
    // pinned deselect through onInput. mousedown is prevented so the button
    // never takes focus.
    if (searchClear) {
      searchClear.addEventListener('mousedown', function (e) { e.preventDefault(); });
      searchClear.addEventListener('click', function () {
        eraseFilter();
      });
    }
    // the deselect back arrow (issues 060, 064): shows while selected ∧
    // filter empty (state-gated, never hover-gated), covers the whole box;
    // one press funnels through the one empty funnel, never focuses the box,
    // never erases
    if (searchDeselect) {
      searchDeselect.addEventListener('mousedown', function (e) { e.preventDefault(); });
      searchDeselect.addEventListener('click', function () { showEmpty(); });
    }

    // initial paint: full leaf catalogue, empty detail
    renderList(leafRows(match.classSearch(index, '')));
    showEmpty();
    syncList();
    syncClear();
    // the page subscribes once at init; the clock owns the cadence (issue 051)
    clock.subscribe(onTick);
  }

  // ---- boot --------------------------------------------------------------------

  function bootClassesPage(store) {
    var modelObjs = model.buildAll(store);
    var index = match.buildIndex(store, modelObjs);
    initClassesPage(store, modelObjs, index);
  }

  document.addEventListener('DOMContentLoaded', function () {
    TT.data.loadStore().then(bootClassesPage).catch(function (err) {
      var st = document.getElementById('status');
      if (st) st.textContent = 'Failed to load emplois.csv: ' + err;
    });
  });

  return { boot: bootClassesPage };
})();

// js/teachers.js — teachers page wiring. Self-contained per page: the shared
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
  var redacted = TT.data.redacted;

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

  // ---- teachers page ---------------------------------------------------------

  function initTeachersPage(store, modelObjs, index) {
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
    var list = document.getElementById('teacherList');
    var detail = document.getElementById('detail');
    var status = document.getElementById('status');
    var layout = document.getElementById('layout');
    var now = new Date();
    var suggestIdx = -1;
    var suggestRows = [];
    // mobile nav machine (issue 056): two facts, three named states —
    //   menuOpen                 -> 'list'   (filterable list + back arrow)
    //   !menuOpen && selected    -> 'teacher' (timeline + name overlay)
    //   !menuOpen && !selected   -> 'empty'  (kaomoji; the default)
    // Blur writes neither fact (a press in flight must never lose its row);
    // only openMenu/closeMenu (menu edges), selectTeacher and showEmpty write.
    var menuOpen = false;
    var selectedTeacher = null;

    // A giant, faint emoticon fills the detail area whenever no teacher is
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
    function emptyStateHTML() {
      // heading first, face below it: the empty-state flex `gap` separates the
      // two, so the heading reads on top of the emoticon.
      return '<div class="empty-state" aria-hidden="true">' +
        '<div class="no-teacher-selected">No Teacher Selected</div>' +
        '<div class="empty-face">' + esc(emptyFace) + '</div>' +
      '</div>';
    }

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

    // availability is time-dependent: rebuilt on every clock tick (issue 051),
    // for list ordering only (never a committed-query key, no visual encoding).
    var avail;
    var currentTeacher;  // the teacher whose detail this page owns (null = none)
    function buildAvail() {
      avail = {};
      store.teachers.forEach(function (n) {
        avail[n] = model.availability(store.sessionsOf(n), now);
      });
    }
    buildAvail();
    status.textContent = store.size + ' sessions · ' + store.teachers.length + ' teachers';

    // List/detail swap state: `is-list` is present iff the menu is open.
    // syncList is the SOLE writer of `is-list`, deriving from the menuOpen
    // fact (issue 056) — no other code may touch the class. Only narrow CSS
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
    // Issue 078: this same derivation (and its same call sites) also drives the
    // count line's .count-away class — the numbers show only while the box is
    // empty, one derivation, one writer, no timers and no flags.
    function syncClear() {
      if (searchClear) searchClear.hidden = !search.value;
      status.classList.toggle('count-away', !!search.value);
      syncDeselect();
    }

    // deselect back arrow (issues 060, 064): while a teacher is selected and
    // the filter is empty, the whole box becomes this button (desktop CSS only;
    // narrow armours it off — its deselect chrome is #overlayClear). Facts-only
    // derivation: no menuOpen, no focus, no viewport test — CSS alone picks
    // the rendering. Keyboard emptying still deselects (pinned 056); the
    // clear X does not (pinned 060).
    function syncDeselect() {
      if (searchDeselect) searchDeselect.hidden = !(selectedTeacher !== null && search.value === '');
    }

    // The name overlay belongs to the 'teacher' state: hidden unless a
    // teacher is selected AND the menu is closed (issue 056).
    function syncOverlay() {
      searchOverlay.hidden = selectedTeacher === null || menuOpen;
      if (selectedTeacher !== null) {
        if (redacted()) overlayName.innerHTML = nameHTML(selectedTeacher);
        else overlayName.textContent = selectedTeacher;
      }
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
    // dropping currentTeacher here (not at each caller) means no deselect
    // path can leave tick ownership behind and repaint over the empty page
    function showEmpty() {
      selectedTeacher = null;
      currentTeacher = null;
      detail.innerHTML = emptyStateHTML();
      markActive(null);
      syncOverlay();
    }

    // the single selection funnel: every path that picks a teacher lands
    // here; blurs because the overlay owns the box in state=teacher
    function selectTeacher(name) {
      selectedTeacher = name;
      showTeacher(name);
      search.blur();
      menuOpen = false;
      syncList();
      syncOverlay();
    }

    // ---- list rendering (sections, identical on all viewports) ----

    function renderList(sections) {
      var total = 0;
      sections.forEach(function (s) { total += s.hits.length; });
      list.innerHTML = '';
      if (!total) {
        var li0 = document.createElement('li');
        li0.className = 'empty';
        li0.textContent = 'No teachers match.';
        list.appendChild(li0);
        return;
      }
      // a header row introduces each fallback section; the primary
      // matches-all block stays unlabelled, and a lone section needs none
      var many = sections.length > 1;
      sections.forEach(function (sec) {
        if (many && sec.key !== 'all' && sec.label) {
          var head = document.createElement('li');
          head.className = 'group-head';
          head.textContent = sec.label;
          list.appendChild(head);
        }
        sec.hits.forEach(renderItem);
      });
    }

    function renderItem(r) {
      var li = document.createElement('li');
      var cls = color.teacherItem({});
      cls.push(r.exact ? C.exact : C.partial);
      li.className = cls.join(' ');
      li.dataset.name = r.teacher;
      var h = match.nameHTML(r.teacher, r.nameRanges);
      if (r.relevantSessions > 0)
        h += ' <span class="relevant">(' + model.hoursLabel(r.relevantSessions) + ' relevant)</span>';
      r.subjectMatches.slice(0, 3).forEach(function (m) {
        h += '<br><span class="fmatch">' + match.highlightHTML(m.label, m.ranges) + '</span>';
      });
      r.classMatches.slice(0, 3).forEach(function (m) {
        h += '<br><span class="cmatch">' + match.highlightHTML(m.label, m.ranges) + '</span>';
      });
      li.innerHTML = h;
      // The filter is the source of truth for the list: selecting a row must
      // not rewrite it, so the result list stays as-is and the user can move
      // to the next hit.
      li.onclick = function () { selectTeacher(r.teacher); };
      list.appendChild(li);
    }

    // the single hit of a one-result section (used for auto-jump)
    function onlyHit(res) {
      var hit = null;
      res.sections.forEach(function (sec) {
        if (sec.hits.length === 1) hit = sec.hits[0];
      });
      return hit;
    }

    // An exact teacher name selects even among partial matches: tapping a
    // suggest row commits its text, and that text may still match others
    // (e.g. "Ben Haj" also matches "Ben Hadj Belkacem") — the exact hit
    // wins so every selection dismisses the menu.
    function exactTeacher(res, q) {
      var want = model.normStr(q.trim());
      var found = null;
      res.sections.forEach(function (sec) {
        (sec.hits || []).forEach(function (h) {
          if (!found && h.teacher && model.normStr(h.teacher) === want) found = h.teacher;
        });
      });
      return found;
    }

    // The page's subscriber to the one clock (issue 051): the list re-ranks
    // from the fresh availability and the open detail re-renders; with
    // nothing open only the list is touched. Never selects, never writes the
    // filter, never touches the suggest/ghost overlays.
    function onTick(t) {
      now = t;
      buildAvail();
      renderList(match.searchSections(index, search.value, avail).sections);
      if (currentTeacher) showTeacher(currentTeacher, t);
    }

    // ---- teacher detail -------------------------------------------------

    function breakdownHTML(t) {
      var h = '<h3>Subjects (ranked by hours)</h3><ul class="subjlist">';
      t.subjects.forEach(function (s) {
        h += '<li>' + esc(s.name) + ' <span class="hours">' + model.hoursLabel(s.sessions) +
          ' (' + (s.share * 100).toFixed(1) + '%)</span></li>';
      });
      h += '</ul><h3>Classes (ranked by hours)</h3><ul class="ctree">';
      t.classStats.children.forEach(function (b) { h += treeHTML(b); });
      return h + '</ul>';
    }

    function treeHTML(nd) {
      var h = '<li>' + esc(nd.key) + ' <span class="hours">' +
        model.hoursLabel(nd.sessions) + ' (' +
        (nd.shareOfParent * 100).toFixed(1) + '%)</span>';
      if (nd.children.length) {
        h += '<ul>';
        nd.children.forEach(function (k) { h += treeHTML(k); });
        h += '</ul>';
      }
      return h + '</li>';
    }

    // The single detail renderer: `function showTeacher(name)` gained the
    // clock's payload (issue 051) — a selection (no tickNow) grades against
    // a fresh read, a tick against the clock's Date; the selection-only
    // side effects stay behind !tickNow.
    function showTeacher(name, tickNow) {
      var t = modelObjs.teachers[name];
      if (!t) return;
      currentTeacher = name;      // this page owns the detail from here (issue 051)
      // NB: showTeacher never writes search.value — neither the automatic
      // single-result jump (onInput/commit) nor an explicit list selection
      // may rewrite the user's filter; only an autocomplete accept
      // (acceptSuggest) commits a new filter value.
      if (!tickNow) {
        renderSuggest([]);
        renderGhost();
      }
      var ss = model.fuseSessions(store.sessionsOf(name), modelObjs.groups);
      var now2 = tickNow || new Date();
      var h = '<h2>' + nameHTML(name) + '</h2>' +
        '<p class="mostly">Mostly teaches ' +
        esc(t.topSubject ? t.topSubject.name : '—') + '</p>' +
        '<p class="mostly">Mostly teaches ' +
        esc(t.topClass ? t.topClass.compactName() : '—') + '</p>';
      var upcoming = model.nextSessionIdx(ss, now2);
      // days with no live stake (no now/next session) render dimmed
      var liveDays = {};
      ss.forEach(function (s, i) {
        if (model.isCurrentSession(s.day, s.time, now2) || upcoming.has(i))
          liveDays[s.day] = true;
      });
      // one section per non-empty day, cyclic from today (issue 050: the
      // first-seen Monday-first day order is rotated to the anchor day)
      var dayOrder = [];
      var byDay = {};
      ss.forEach(function (s, i) {
        if (!byDay[s.day]) { byDay[s.day] = []; dayOrder.push(s.day); }
        byDay[s.day].push({ s: s, i: i });
      });
      dayOrder = model.startFromToday(dayOrder, ss, now2);
      dayOrder.forEach(function (day) {
        h += '<h3 class="day-head">' + esc(model.frDay(day)) + '</h3>';
        h += '<section class="day-group' + (liveDays[day] ? '' : ' dim') + '">';
        h += '<table class="t-sessions"><tr><th></th><th>Time</th><th>Room</th><th>Subject</th><th>Class</th></tr>';
        byDay[day].forEach(function (entry) {
          var s = entry.s;
          var isNow = model.isCurrentSession(s.day, s.time, now2);
          var isNext = !isNow && upcoming.has(entry.i);
          var cls = color.sessionRow({
            isNow: isNow, isNext: isNext,
            dimIdle: false
          });
          h += '<tr' + (cls.length ? ' class="' + cls.join(' ') + '"' : '') + '><td>' +
            (isNow ? '<span class="nowtag">● NOW</span>' : '') +
            (isNext ? '<span class="nexttag">' + NEXT_ARROW + 'NEXT</span>' : '') +
            '</td><td class="c-time">' + esc(s.time) +
            '</td><td class="c-room">' + esc(s.room || '—') +
            '</td><td class="c-subject">' + esc(s.subject) +
            '</td><td class="c-class">' +
            s.pills.map(function (p) { return '<span class="pill">' + esc(p) + '</span>'; }).join(' ') +
            '</td></tr>';
        });
        h += '</table></section>';
      });
      h += breakdownHTML(t);
      detail.innerHTML = h;      // unconditional: no gating (issue 051)
      markActive(name);
      // state transition lives in selectTeacher — this function only renders;
      // the selection side effects (pane swap, clear "x") stay off the live path
      if (!tickNow) {
        if (layout) layout.classList.remove('is-list');
        syncClear();
      }
    }

    function markActive(name) {
      list.querySelectorAll('li[data-name]').forEach(function (li) {
        li.classList.toggle(C.active, li.dataset.name === name);
      });
    }

    // ---- autocomplete overlay + shadow text ------------------------------

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
        var body;
        if (r.kind === 'class') {
          body = match.highlightHTML(r.label, r.ranges) +
            (r.detail ? ' <span class="alias">— ' + esc(r.detail) + '</span>' : '');
        } else if (r.kind === 'teacher') {
          // stays its own branch: teacher names redact via nameHTML (issue 061),
          // subjects stay highlighted — the count badge was removed (issue 062)
          body = match.nameHTML(r.label, r.ranges);
        } else {
          body = match.highlightHTML(r.label, r.ranges);
        }
        li.innerHTML = '<span class="kind kind-' + r.kind + '">' + r.kind + '</span>' + body;
        // mousedown guard: accept before input blur can hide the overlay.
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

    function renderGhost() {
      // No ghost under redaction (issue 061): the faint completion would leak
      // the rest of a teacher name, so the guard funnels into the hidden path.
      var row = redacted() ? null : suggestRows[suggestIdx];
      var sh = row ? match.shadowText(search.value, row) : null;
      if (sh) {
        ghost.hidden = false;
        ghostPre.textContent = sh.pre;
        ghostTyped.textContent = search.value;
        ghostRest.textContent = sh.rest;
        // The prefix hint renders before the typed run, so the real input's
        // text origin (and caret) must move right by the hint's width; the
        // transparent typed run then sits exactly under the real text.
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
      search.value = row.commit;
      syncClear();
      renderSuggest([]);
      renderGhost();
      commit();
    }

    // ---- grouped live search ------------------------------------------------

    // erase-only funnel (issue 060): the clear X lands here, never in
    // onInput()/commit() — emptying the box this way must NOT deselect. The
    // body is commit's empty branch minus showEmpty(), plus re-marking the
    // selection: full list from the empty query, suggest/ghost dropped, pane
    // flag re-synced, no selection fact written. Keyboard emptying still
    // deselects through onInput (pinned 056 ruling 5) — a deliberate
    // divergence: the keyboard runs the live-search derivation (empty filter
    // derives no selection), the X is an explicit erase-only command whose
    // landing state (selected + empty) immediately presents the deselect arrow.
    function eraseFilter() {
      search.value = '';
      syncClear();
      renderSuggest([]);
      renderGhost();
      renderList(match.searchSections(index, '', avail).sections);
      markActive(selectedTeacher);
      syncList();
    }

    function onInput() {
      var q = search.value;
      syncClear();
      var res = match.searchSections(index, q, avail);
      renderList(res.sections);
      renderSuggest(match.suggest(index, q));
      renderGhost();
      // an empty filter means nothing is selected: back to the empty state
      if (!q.trim()) showEmpty();
      // exactly one result left -> auto-jump to the table view
      if (res.total === 1) {
        var only = onlyHit(res);
        if (only) selectTeacher(only.teacher);
      }
      syncList();
    }

    function commit() {
      var q = search.value;
      syncClear();
      renderSuggest([]);
      renderGhost();
      if (!q.trim()) {
        renderList(match.searchSections(index, '', avail).sections);
        showEmpty();
        syncList();
        return;
      }
      var res = match.searchSections(index, q, avail);
      renderList(res.sections);
      var exact = exactTeacher(res, q);
      if (exact) {
        selectTeacher(exact);
      } else if (!res.total) {
        detail.innerHTML = '<p class="nomatch">No match for "' + esc(q) + '".</p>';
        currentTeacher = null;
      } else if (res.total === 1) {
        var only = onlyHit(res);
        if (only) selectTeacher(only.teacher);
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
    // teacher stays selected ("back to the earlier state" by construction)
    if (searchBack) searchBack.addEventListener('click', function () { closeMenu(); });
    // in state=teacher the overlay IS the box: the whole surface (name,
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
    // #overlayClear (narrow teacher state); keyboard emptying keeps its
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

    // initial paint: full list (available-today raised), faint emoticon detail
    renderList(match.searchSections(index, '', avail).sections);
    showEmpty();
    syncList();
    syncClear();
    // the page subscribes once at init; the clock owns the cadence (issue 051)
    clock.subscribe(onTick);
  }

  // ---- boot --------------------------------------------------------------------

  function bootTeachersPage(store) {
    var modelObjs = model.buildAll(store);
    var index = match.buildIndex(store, modelObjs);
    initTeachersPage(store, modelObjs, index);
  }

  document.addEventListener('DOMContentLoaded', function () {
    TT.data.loadStore().then(bootTeachersPage).catch(function (err) {
      var st = document.getElementById('status');
      if (st) st.textContent = 'Failed to load emplois.csv: ' + err;
    });
  });

  return { boot: bootTeachersPage };
})();

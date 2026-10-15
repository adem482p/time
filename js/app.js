// js/app.js — page wiring. Boots the store + analysis + match layers and
// dispatches to the per-page renderers (body[data-page]). All coloring
// decisions go through TT.color; all matching through TT.match; all
// domain data through TT.model. This file owns DOM only.
var TT = TT || {};
TT.app = (function () {
  var model = TT.model;
  var match = TT.match;
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

  // ---- teachers page ---------------------------------------------------------

  function initTeachersPage(store, modelObjs, index) {
    var search = document.getElementById('search');
    var searchDone = document.getElementById('searchDone');
    var searchClear = document.getElementById('searchClear');
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
    // mobile state machine: one class `is-list` on #layout, absent = cards.
    // Derived at focus/blur/onInput/commit; showTeacher forces cards.
    var searchFocused = false;
    var lastResultCount = -1;

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

    // availability is time-dependent: compute once per page load, reuse for
    // list ordering only (never a committed-query key, no visual encoding).
    var avail = {};
    store.teachers.forEach(function (n) {
      avail[n] = model.availability(store.sessionsOf(n), now);
    });
    status.textContent = store.size + ' sessions · ' + store.teachers.length + ' teachers';

    // Mobile rule: `is-list` is present iff the search box is focused and the
    // most recent render did not leave exactly one result. Desktop CSS ignores
    // the class entirely; this only toggles state.
    function syncList() {
      if (!layout) return;
      layout.classList.toggle('is-list', searchFocused && lastResultCount !== 1);
    }

    // Mobile clear "x": it is shown only while the filter holds text. Called
    // wherever search.value can change (typing, commit, selection, clear, boot).
    function syncClear() {
      if (searchClear) searchClear.hidden = !search.value;
    }

    // ---- list rendering (sections, identical on all viewports) ----

    function renderList(sections) {
      var total = 0;
      sections.forEach(function (s) { total += s.hits.length; });
      lastResultCount = total;
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
      var h = match.highlightHTML(r.teacher, r.nameRanges) +
        ' <span class="n">(' + store.sessionsOf(r.teacher).length + ')</span>';
      if (r.relevantSessions > 0)
        h += ' <span class="n">(' + model.hoursLabel(r.relevantSessions) + ' relevant)</span>';
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
      li.onclick = function () { showTeacher(r.teacher); };
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

    function showTeacher(name) {
      var t = modelObjs.teachers[name];
      if (!t) return;
      // NB: showTeacher never writes search.value — neither the automatic
      // single-result jump (onInput/commit) nor an explicit list selection
      // may rewrite the user's filter; only an autocomplete accept
      // (acceptSuggest) commits a new filter value.
      renderSuggest([]);
      renderGhost();
      var ss = model.fuseSessions(store.sessionsOf(name), modelObjs.groups);
      var now2 = new Date();
      var h = '<h2>' + esc(name) + '</h2>' +
        '<p class="mostly">Mostly teaches ' +
        esc(t.topSubject ? t.topSubject.name : '—') + '</p>' +
        '<p class="mostly">Mostly teaches ' +
        esc(t.topClass ? t.topClass.compactName() : '—') + '</p>';
      h += '<p class="count">' + ss.length + ' session(s).</p>';
      var upcoming = model.nextSessionIdx(ss, now2);
      // days with no live stake (no now/next session) render dimmed
      var liveDays = {};
      ss.forEach(function (s, i) {
        if (model.isCurrentSession(s.day, s.time, now2) || upcoming.has(i))
          liveDays[s.day] = true;
      });
      // one section per non-empty day, Monday-first (fused output is already
      // in cmpSession order, so first-seen day order is the week order)
      var dayOrder = [];
      var byDay = {};
      ss.forEach(function (s, i) {
        if (!byDay[s.day]) { byDay[s.day] = []; dayOrder.push(s.day); }
        byDay[s.day].push({ s: s, i: i });
      });
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
      detail.innerHTML = h;
      markActive(name);
      // a selection always shows the detail/card view
      if (layout) layout.classList.remove('is-list');
      // the filter is untouched by selection; keep the clear "x" in step
      syncClear();
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
          body = match.highlightHTML(r.label, r.ranges) +
            ' <span class="n">(' + store.sessionsOf(r.label).length + ')</span>';
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
      var row = suggestRows[suggestIdx];
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

    function onInput() {
      var q = search.value;
      syncClear();
      var res = match.searchSections(index, q, avail);
      renderList(res.sections);
      renderSuggest(match.suggest(index, q));
      renderGhost();
      // an empty filter means nothing is selected: blank the detail area
      if (!q.trim()) { detail.innerHTML = emptyStateHTML(); markActive(null); }
      // exactly one result left -> auto-jump to the table view
      if (res.total === 1) {
        var only = onlyHit(res);
        if (only) showTeacher(only.teacher);
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
        detail.innerHTML = emptyStateHTML();
        markActive(null);
        syncList();
        return;
      }
      var res = match.searchSections(index, q, avail);
      renderList(res.sections);
      if (!res.total) {
        detail.innerHTML = '<p class="nomatch">No match for "' + esc(q) + '".</p>';
      } else if (res.total === 1) {
        var only = onlyHit(res);
        if (only) showTeacher(only.teacher);
      }
      syncList();
    }

    search.addEventListener('input', onInput);
    search.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        // <input type="search"> clears the field on Esc by default; cancel
        // that so Esc only dismisses the menu and keeps the typed filter.
        e.preventDefault();
        if (!suggest.hidden) { renderSuggest([]); renderGhost(); }
        return;
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
      searchFocused = true;
      syncList();
    });
    search.addEventListener('blur', function () {
      // delayed so a mousedown accept / list-item click lands before the
      // overlay hides and before the mobile list swaps back to cards
      setTimeout(function () {
        if (document.activeElement !== search) {
          searchFocused = false;
          renderSuggest([]);
          renderGhost();
          syncList();
        }
      }, 120);
    });

    // the mobile V-chevron button beside the input removes focus (hides the
    // on-screen keyboard and drops out of list mode); it blurs itself too so
    // the #searchWrap:focus-within glow clears and the button hides again
    if (searchDone) searchDone.addEventListener('click', function () {
      search.blur();
      searchDone.blur();
    });

    // the always-visible mobile X clears the filter exactly like a manual
    // clear (empty query -> full list + emoticon detail). mousedown is
    // prevented so the button never takes focus; search.focus() keeps the
    // keyboard, the V and mobile list mode available and stops the blur
    // handler from firing.
    if (searchClear) {
      searchClear.addEventListener('mousedown', function (e) { e.preventDefault(); });
      searchClear.addEventListener('click', function () {
        search.value = '';
        syncClear();
        search.focus();
        commit();
      });
    }

    // initial paint: full list (available-today raised), faint emoticon detail
    renderList(match.searchSections(index, '', avail).sections);
    detail.innerHTML = emptyStateHTML();
    syncList();
    syncClear();
  }

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

    function show(day, slot) {
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

    // auto-scroll the pane so today's bucket header lands at the pane top
    if (todayBucket) ul.scrollTop = todayBucket.offsetTop - ul.offsetTop;
    status.textContent = store.size + ' sessions · ' + store.teachers.length + ' teachers';
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
    var searchDone = document.getElementById('searchDone');
    var searchClear = document.getElementById('searchClear');
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
    var searchFocused = false;
    var lastResultCount = -1;
    var activeKey = null;
    var cursorTimer = null;

    status.textContent = store.size + ' sessions · ' + groups.leaves.length + ' classes';

    // mobile state machine: one class `is-list` on #layout, absent = cards.
    function syncList() {
      if (!layout) return;
      layout.classList.toggle('is-list', searchFocused && lastResultCount !== 1);
    }
    function syncClear() {
      if (searchClear) searchClear.hidden = !search.value;
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

    // Union session count of a node's whole subtree, memoized. The
    // grouping is immutable for the page's lifetime, so each node's
    // count is computed once (the full-catalogue paint touches every
    // node) and every later keystroke is an O(1) lookup. Mirrors the
    // teacher list's "(N)" badge; node.sessions alone would show (0)
    // for every interior node, whose timetable lives beneath it.
    var countCache = {};
    function weekCount(node) {
      if (!(node.key in countCache))
        countCache[node.key] = model.classWeek(groups, node).sessions.length;
      return countCache[node.key];
    }

    function renderList(rows) {
      lastResultCount = rows.length;
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
        if (r.node) h += ' <span class="n">(' + weekCount(r.node) + ')</span>';
        li.innerHTML = h;
        li.onclick = function () { search.value = r.label; showClass(r.label); };
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

    function renderWeek(week) {
      var cursor = model.dayCursor(now, store.slots);
      var by = indexByDaySlot(week);
      var h = '<h2>' + esc(week.name) + '</h2>';
      h += '<p class="mostly">' + week.leaves.length + ' class(es) · ' +
        week.sessions.length + ' session(s)</p>';
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
              '<span class="s-teacher">' + esc(s.professor || '—') + '</span>' +
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
      // Session card list for narrow screens (teacher-style cards via the
      // generic mobile table rules; hidden on desktop by CSS). Row marking
      // mirrors showTeacher with today-only semantics: the same `now` and the
      // computed `cursor` keep the grid and the list consistent; never
      // nextSessionIdx (it wraps into the coming days).
      h += '<p class="count">' + week.sessions.length + ' session(s).</p>';
      h += '<table class="c-sessions"><tr><th></th><th>Day</th><th>Time</th>' +
        '<th>Teacher</th><th>Subject</th><th>Room</th></tr>';
      var liveDays = {};
      week.sessions.forEach(function (s) {
        if (model.isCurrentSession(s.day, s.time, now) ||
            (cursor.visible && s.day === cursor.today && s.time === cursor.next))
          liveDays[s.day] = true;
      });
      var prevDay = null;
      week.sessions.forEach(function (s) {
        var isNow = model.isCurrentSession(s.day, s.time, now);
        var isNext = !isNow && cursor.visible && s.day === cursor.today && s.time === cursor.next;
        var dayStart = prevDay !== null && s.day !== prevDay;
        prevDay = s.day;
        var cls = color.sessionRow({
          isNow: isNow, isNext: isNext, dayStart: dayStart,
          dimIdle: !liveDays[s.day]
        });
        h += '<tr' + (cls.length ? ' class="' + cls.join(' ') + '"' : '') + '><td>' +
          (isNow ? '<span class="nowtag">● NOW</span>' : '') +
          (isNext ? '<span class="nexttag">' + NEXT_ARROW + 'NEXT</span>' : '') +
          '</td><td class="c-day">' + esc(model.frDay(s.day)) +
          '</td><td class="c-time">' + esc(s.time) +
          '</td><td class="c-teacher">' + esc(s.professor || '—') +
          '</td><td class="c-subject">' + esc(s.subject) +
          '</td><td class="c-room">' + esc(s.room || '—') +
          '</td></tr>';
      });
      h += '</table>';
      detail.innerHTML = h;
      if (layout) layout.classList.remove('is-list');
      syncClear();
      applyCursor(cursor);
      startCursor();
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

    function startCursor() {
      stopCursor();
      cursorTimer = setInterval(function () {
        applyCursor(model.dayCursor(new Date(), store.slots));
      }, 30000);
    }
    function stopCursor() {
      if (cursorTimer) { clearInterval(cursorTimer); cursorTimer = null; }
    }

    function showClass(ref) {
      var week = model.classWeek(groups, ref);
      if (week.leaves.length !== 1) {
        detail.innerHTML = '<p class="nomatch">No class matches "' + esc(ref) + '".</p>';
        markActive(null);
        if (layout) layout.classList.remove('is-list');
        syncClear();
        stopCursor();
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

    function onInput() {
      var q = search.value;
      syncClear();
      var rows = leafRows(match.classSearch(index, q));
      renderList(rows);
      renderSuggest(classSuggestions(q));
      renderGhost();
      if (!q.trim()) { detail.innerHTML = emptyStateHTML(); markActive(null); }
      else if (rows.length === 1) { showClass(rows[0].label); }
      syncList();
    }

    function commit() {
      var q = search.value;
      syncClear();
      renderSuggest([]);
      renderGhost();
      var rows = leafRows(match.classSearch(index, q));
      renderList(rows);
      if (!q.trim()) {
        detail.innerHTML = emptyStateHTML();
        markActive(null);
      } else if (model.classWeek(groups, q).leaves.length === 1) {
        showClass(q);
      } else if (rows.length === 1) {
        showClass(rows[0].label);
      } else if (!rows.length) {
        detail.innerHTML = '<p class="nomatch">No match for "' + esc(q) + '".</p>';
      }
      syncList();
    }

    search.addEventListener('input', onInput);
    search.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        // <input type="search"> clears the field on Esc by default; cancel
        // that so Esc only dismisses the menu and keeps the typed filter.
        e.preventDefault();
        if (!suggest.hidden) { renderSuggest([]); renderGhost(); }
        return;
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
      searchFocused = true;
      syncList();
    });
    search.addEventListener('blur', function () {
      setTimeout(function () {
        if (document.activeElement !== search) {
          searchFocused = false;
          renderSuggest([]);
          renderGhost();
          syncList();
        }
      }, 120);
    });

    if (searchDone) searchDone.addEventListener('click', function () {
      search.blur();
      searchDone.blur();
    });

    if (searchClear) {
      searchClear.addEventListener('mousedown', function (e) { e.preventDefault(); });
      searchClear.addEventListener('click', function () {
        search.value = '';
        syncClear();
        search.focus();
        commit();
      });
    }

    // initial paint: full leaf catalogue, empty detail
    renderList(leafRows(match.classSearch(index, '')));
    detail.innerHTML = emptyStateHTML();
    syncList();
    syncClear();
  }

  // ---- boot --------------------------------------------------------------------

  function boot(store) {
    var modelObjs = model.buildAll(store);
    var index = match.buildIndex(store, modelObjs);
    var page = document.body.getAttribute('data-page');
    if (page === 'teachers') initTeachersPage(store, modelObjs, index);
    else if (page === 'time') initTimePage(store, modelObjs);
    else if (page === 'matrix') initTimetablePage(store, modelObjs);
    else if (page === 'classes') initClassesPage(store, modelObjs, index);
  }

  document.addEventListener('DOMContentLoaded', function () {
    TT.data.loadStore().then(boot).catch(function (err) {
      var st = document.getElementById('status');
      if (st) st.textContent = 'Failed to load emplois.csv: ' + err;
    });
  });

  return { boot: boot };
})();

# 075: Classes page loses its nav bar and its autocomplete; the detail heading becomes a shortcut

- Status: Fixed
- Date: 2026-10-22, Reporter: user

## Description

Three changes to the classes page (`classes/index.html` + `js/classes.js`),
requested verbatim:

> - remove the navigation links from the classes page
> - remove autocompletion support from the classes page
> - in the classes page, replace the long heading that contains the full specified name of the class (such as LCS3-GLSI_D Groupe 2) with the shortcut "GLSI3 D2" where the number 2 is a subscript

Observed (main @ a39837f):

1. `classes/index.html` ships `<nav><a href="../teachers/">Teachers</a><a
   href="index.html"><strong>Classes</strong></a></nav>` — a cross-page
   navigation bar above `#layout`.
2. The classes page ships full autocompletion: `<ul id="suggest" hidden></ul>`
   in the search wrap, an inline ghost/shadow completion line
   (`#ghost` + `#ghostPre`/`#ghostTyped`/`#ghostRest`), and in `js/classes.js`
   the whole suggest machinery — `renderSuggest`/`paintActive`, `classGhost`/
   `renderGhost`, `acceptSuggest`, `classSuggestions` (the `match.suggest`
   call), the `suggestIdx`/`suggestRows` state, the Arrow/Tab/Enter
   suggestion-key handling, and the blur handler that drops the overlay.
3. The detail heading renders the full field name verbatim:
   `renderWeek` emits `<h2>` + `esc(week.name)` (e.g. `<h2>LCS3-GLSI_D Groupe
   2</h2>`), and the narrow selected-class overlay (`#overlayName`) repeats the
   same raw name.

Expected:

1. No navigation links on the classes page.
2. No autocomplete on the classes page — typing still filters `#classList`,
   but no suggestion dropdown, no inline ghost completion and no
   suggestion-key handling ever appear. All non-suggest behaviors of the input
   stay: live filtering, the erase-only clear X (issues 060/064/074), the
   deselect back arrow, `?redact=1`, and the issue-065 last-class restore.
3. The heading shows the compact shortcut with the group number as a real
   `<sub>`: `LCS3-GLSI_D Groupe 2` → `GLSI3 D<sub>2</sub>`.

The teachers page keeps **all** of its features: it is nav-free already, and
its own autocomplete (list suggestions + ghost line, `js/teachers.js` +
`teachers/index.html`) must stay untouched.

## Root cause

Not a defect — a deliberate feature request against the classes app. The three
parts and the approach taken:

1. **Nav removal.** Delete the whole `<nav>` element from
   `classes/index.html`. Honest consequence, recorded here as the reporter's
   call: the classes app becomes a **dead-end** — after this change no page on
   the site links to it (the teachers page carries no nav either, the root
   landing redirects to `teachers/`, and `at/`/`all/` are unlisted since issue
   073). It stays reachable only by URL and through the root `classes.html`
   redirect stub. We state it and do not fight it.

2. **Autocomplete removal (classes page only).** `#suggest` and every piece of
   suggest machinery leave `classes/index.html` and `js/classes.js`. The ghost
   line goes with them: it is autocompletion too (an inline completion of the
   pre-focused first suggestion), and it derives *solely* from
   `suggestRows[suggestIdx]`, so it cannot outlive suggest — keeping the
   element and its handlers would be dead code (house rule, issue 055).
   Consequently `isCoarsePointer()` (issue 007's mobile pre-focus gate), the
   blur handler, and the Arrow/Tab suggestion branches are deleted as well —
   every one of them existed only to serve suggest. `js/teachers.js`,
   `teachers/index.html` and `styles.css` are **not** touched: the shared
   stylesheet's `#suggest`/`#ghost` rules still serve the teachers page (what
   stays and why is reported in the fix entry).

3. **Shortcut heading.** The mapping is a pure function in the place this
   codebase keeps field-string parsing/formatting — `js/libgroups.js`, next to
   `formatFull`/`parseFullName` (it is the field-string authority;
   `js/classes.js` stays page glue, `js/model.js` stays "never re-parses field
   strings"). Shape, matched strictly against the whole name:

   `^(TRACK)(YEAR)-(SPEC)(?:_(SECTION))?(?: Groupe (COHORT))?$`
   → `head = SPEC + YEAR [+ " " + SECTION]`, `sub = COHORT`, else **no match →
   the caller falls back to the full escaped name** (never a blank heading).

   Enumerated from `emplois.csv` myself: **94 distinct `field` values** (both
   `python3 csv.DictReader` and the site's own `js/data.js` parser agree; the
   brief said 95 — the file carries 94), all well-formed, in these shapes:

   | field shape | example | shortcut rendered |
   |---|---|---|
   | spec + section + cohort | `LCS3-GLSI_D Groupe 2` (reporter's example) | `GLSI3 D<sub>2</sub>` |
   | common branch, single letter + cohort | `LBC1-H Groupe 2` | `H1<sub>2</sub>` |
   | spec + section, no cohort | `LBC3-EB_A` | `EB3 A` (no subscript) |
   | spec, no section, no cohort | `MP1-EXR` / `MP2-SD` | `EXR1` / `SD2` |
   | spec + section, no cohort (MP) | `MP2-SD_A` | `SD2 A` |
   | spec + section + cohort (other) | `LBC2-BI_A Groupe 1` / `LCE2-IoT_A Groupe 1` | `BI2 A<sub>1</sub>` / `IoT2 A<sub>1</sub>` |
   | common branch + cohort (other) | `LCS1-A Groupe 1` | `A1<sub>1</sub>` |
   | anything not matching (defensive: a malformed value from raw CSV quoting, a future CSV, a compact key or an interior node name) | `LCS3-GLSI_D Groupe X`, `GLSI3D1`, `LCS1`, `""` | the full name, unchanged |

   The renderer escapes both parts **before** appending `<sub>`, so a hostile
   `field` can never inject markup.

   Where the rule applies: every place the classes page renders that heading —
   `#detail > h2` (same element on desktop and narrow) **and** the narrow
   selected-class `#overlayName` (issues 056/058 mobile chrome).

   Where the **full** name deliberately stays: the list rows (`#classList`
   identity + alias span), the filter/matching layer (`match.classSearch`), the
   no-match echo (`No class matches "…"` — it repeats what the user typed), the
   issue-065 persistence (`emplois-class` stores the raw ref, the exact
   selection input), `markActive`, and `?redact=1` (redaction covers teacher
   names through `nameHTML`; class names are not personal data and were never
   redacted). `document.title` never carried the class name, so it is
   untouched. The user asked for the *heading*, and that is the only surface
   that changes.

## Repro steps

```
python3 -m http.server 8123          # from the repo root
node --test test/*.test.js           # baseline on main: 180 pass / 0 fail
```

1. Nav: open `http://localhost:8123/classes/` → observed `<nav>` with
   Teachers/Classes links above the layout; expected: no nav element at all.
2. Autocomplete: type a partial class name (e.g. `LCS3-G`) → observed a
   `#suggest` dropdown under the box plus an inline ghost completion inside
   it, arrows walk the rows; expected: only `#classList` filters, nothing
   appears, arrows/Tab do nothing suggestion-like. Confirm the teachers page
   (`http://localhost:8123/teachers/`) still shows its dropdown.
3. Heading: click the `LCS3-GLSI_D Groupe 2` row → observed
   `<h2>LCS3-GLSI_D Groupe 2</h2>` (desktop) and the same raw name in the
   narrow overlay; expected `<h2>GLSI3 D<sub>2</sub></h2>` and the same
   shortcut in the overlay (also at a 390 px viewport).
4. Regressions to watch: clear X erases only, deselect arrow returns to the
   list, `?redact=1` still blanks teacher names, and a previously selected
   class still restores after reload (issue 065).

## Discussion

### Fix implemented (2026-10-22)

**What changed — the three requirements, 7 files (+ this issue file):**

1. **Navigation links removed.** `classes/index.html` loses its `<nav>` block;
   that element held the whole of the page's link-out (`../teachers/` + the self
   link `index.html`). The author credit (`github.com/adem482p`) stays: it is
   content, not navigation. The classes app is now a dead-end — the reporter's
   call, flagged as such below.
2. **Autocompletion removed.** The suggestion list (`#suggest`), the inline
   ghost line (`#ghost` / `#ghostPre` / `#ghostTyped` / `#ghostRest`) and every
   piece of machinery that only ever fed them go with them: `renderSuggest`,
   `paintActive`, `classGhost`, `renderGhost`, `acceptSuggest`,
   `classSuggestions`, `suggestIdx`/`suggestRows`, the `blur` handler (dropping
   the overlay was its sole job), the Tab / ArrowDown / ArrowUp keydown
   branches, and `isCoarsePointer` (its only caller was the suggestion pre-focus
   gate). **Kept untouched**: filtering (typing narrows `#classList`), the
   erase-only clear X (060/064/074), deselect, Enter-commits-the-typed-query
   (issue 007's rule, which never depended on a pre-selected row), `?redact=1`,
   the 065 restore, and the single-exact-hit auto-jump.
3. **Shortcut heading.** `shortcutOf(name)` lives in `js/libgroups.js` — the
   field-string authority, UMD-wrapped so node tests load it directly, header
   comment citing issue 075 — and returns `{head, sub}` or `null`. The page
   renders it through `headingHTML(name)`, which escapes **both** parts *before*
   appending `<sub>`, and falls back to the escaped full name for any shape
   `shortcutOf` does not know (never a blank heading). Both heading surfaces use
   it: the detail `<h2>` (desktop *and* narrow — one element, fed `week.name`,
   a canonical full name) and the narrow `#overlayName`, whose input is the
   compact *selection key* (`GLSI1A1`), so `overlayHeading(groups, ref)` first
   resolves it back through `model.classWeek(...).name` and falls back to the
   raw ref if that throws or yields nothing.

**The rule** (strict, whole-string, on the full field name):

```
^(LBC|LCE|LCS|MP)(\d{1,2})-([A-Za-z0-9]+?)(?:_([A-Z]))?(?: Groupe (\d+))?$
        →  head = spec + year [ + " " + section ] ,  sub = cohort
```

| field | heading rendered |
|---|---|
| `LCS3-GLSI_D Groupe 2` (the reporter's example) | `GLSI3 D<sub>2</sub>` |
| `LBC1-H Groupe 2` | `H1<sub>2</sub>` |
| `LCS1-A Groupe 1` | `A1<sub>1</sub>` |
| `LBC2-BI_A Groupe 1` / `LCE2-IoT_A Groupe 1` | `BI2 A<sub>1</sub>` / `IoT2 A<sub>1</sub>` |
| `LBC3-EB_A` | `EB3 A` (no subscript) |
| `MP1-EXR` / `MP2-SD` / `MP2-SD_A` | `EXR1` / `SD2` / `SD2 A` |
| `LCS1`, `GLSI3D1` (compact key), `LCS3-GLSI_D Groupe X`, `""` | full name, unchanged |

Swept over **every distinct `field` value in `emplois.csv` — 94 of them, not
95** (the CSV read by python's `csv` module and by `js/data.js` agree on 94):
all 94 shorten, each one byte-identical to its own grouping-leaf identity
(`groups.leaves[i].fullName()`), 0 mismatches; the `null` fallback was
exercised separately because no malformed field exists in the real data.

**Full names deliberately kept** where correctness needs the raw identity: list
rows and their `alias` spans, the `match.classSearch` filter, the no-match echo
(`No match for "…"`), `markActive`, and the issue-065 stored ref (still the raw
compact key — 065's contract did not move). Class names are not personal data,
so `?redact=1` is untouched by this issue.

**Exact diff (7 files; plus this issue file, which is new on this branch — its
own content is not self-diffed):**

```diff
--- a/classes/index.html
+++ b/classes/index.html
@@ -51,7 +51,6 @@
 <link rel="stylesheet" href="../styles.css">
 </head>
 <body data-page="classes">
-<nav><a href="../teachers/">Teachers</a><a href="index.html"><strong>Classes</strong></a></nav>
 <div id="layout">
   <div id="listPane">
     <button type="button" id="themeCycle" title="Cycle color preset" aria-label="Cycle color preset"></button>
@@ -59,7 +58,6 @@
     <p id="status">Loading emplois.csv…</p>
     <p class="author-credit"><span>By </span><a href="https://github.com/adem482p" target="_blank" rel="noopener">Adem Moussa</a></p>
     <div id="searchWrap">
-      <div id="ghost" aria-hidden="true"><span id="ghostPre"></span><span id="ghostTyped"></span><span id="ghostRest"></span></div>
       <input id="search" type="search" placeholder="Search class (LCS, GLSI3D1…)" autocomplete="off">
       <button type="button" id="searchBack" aria-label="Back">
         <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>
@@ -77,7 +75,6 @@
         <span id="overlayName"></span>
         <svg class="overlay-drop" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
       </div>
-      <ul id="suggest" hidden></ul>
     </div>
     <ul id="classList"></ul>
   </div>
--- a/js/classes.js
+++ b/js/classes.js
@@ -1,6 +1,6 @@
 // js/classes.js — classes page wiring. Self-contained per page: the shared
-// head (TT.app IIFE + model/match/color aliases + coarse-pointer gate +
-// NEXT_ARROW) is duplicated from js/app.js by design, not imported — zero
+// head (TT.app IIFE + model/match/color aliases + NEXT_ARROW) is duplicated
+// from js/app.js by design, not imported — zero
 // coupling, no load-order constraints. All coloring decisions go through
 // TT.color; all matching through TT.match; all domain data through TT.model.
 // This file owns DOM only.
@@ -12,23 +12,30 @@
   var C = color.CLASSES;
   var esc = TT.data.esc;
   var nameHTML = TT.data.nameHTML;
-
-  // Mobile gate (issue 007): coarse pointers (touch/soft keyboard) have no
-  // Escape key to opt out of the pre-focused first suggestion, so Enter must
-  // commit the typed query until the user explicitly picks a row. Guarded
-  // like the prefers-reduced-motion query below; defaults to false (desktop)
-  // when window/matchMedia is absent (e.g. node tests).
-  function isCoarsePointer() {
-    if (typeof window === 'undefined' || !window.matchMedia) return false;
-    try { return !!window.matchMedia('(pointer: coarse)').matches; }
-    catch (e) { return false; }
-  }
+  // Field-string labels live in js/libgroups.js (the field-string authority);
+  // the classes page only asks it for the heading shortcut (issue 075).
+  var shortcutOf = TT.groups.shortcutOf;
 
   // Manual right-arrow for the "Next" marker. Drawn as SVG (not the Unicode
   // glyph) so it renders identically across platforms and inherits the tag color.
   var NEXT_ARROW = '<svg class="nextarrow" viewBox="0 0 24 24" aria-hidden="true">' +
     '<path d="M4 12h14M12 6l6 6-6 6"/></svg>';
 
+  // ---- detail heading shortcut (issue 075) ---------------------------------
+  // The class heading shows the compact shortcut instead of the full field
+  // name: `LCS3-GLSI_D Groupe 2` renders as `GLSI3 D<sub>2</sub>` — the group
+  // number is a real subscript. Both parts are escaped BEFORE the markup is
+  // appended, so a malformed field can never inject HTML; a shape
+  // shortcutOf() does not know falls back to the full escaped name, so the
+  // heading is never blank. This is the only surface that shortens: the list
+  // rows, the filter, the no-match echo and the stored selection (issue 065)
+  // keep the raw full name as their identity.
+  function headingHTML(name) {
+    var sc = shortcutOf(name);
+    if (!sc) return esc(name);
+    return esc(sc.head) + (sc.sub ? '<sub>' + esc(sc.sub) + '</sub>' : '');
+  }
+
   // ---- clock (issue 051) ------------------------------------------------
   // One clock per page: a single 30 s interval that hands a fresh Date to
   // every subscribed part of the page; a subscriber re-renders its own
@@ -100,17 +107,32 @@
     catch (e) { return false; }
   }
 
+  // The narrow-screen overlay (#overlayName) heads the selected class, but the
+  // selection itself is a compact key (`GLSI3D2`), not a field name —
+  // shortcutOf only understands field shapes, so the key has to be resolved
+  // back to the canonical class name first (model.classWeek → the week's
+  // fullName, same source the detail <h2> heads). An unresolvable ref (removed
+  // data, tampered storage) falls back to the raw ref, which headingHTML then
+  // escapes verbatim — never a blank heading.
+  function overlayHeading(groups, ref) {
+    try {
+      var week = model.classWeek(groups, ref);
+      if (week && week.name) return week.name;
+    } catch (e) { /* fall through to the raw ref */ }
+    return ref;
+  }
+
   // ---- classes page -----------------------------------------------------------
 
   // Student-facing class timetable (issue 032). The class is chosen through a
-  // live search over the leaf classes only (match.classSearch + the class
-  // entries of match.suggest, both filtered to groups.leaves); selecting one
-  // draws its week as a grid — days as columns, the six slots as rows — with
-  // a semi-transparent red cursor at the current time and the current/next
-  // slot cells highlighted. Broader classes (interior nodes) are not
-  // selectable: they never appear in the catalogue and exact references to
-  // them take the no-match path. On narrow screens the grid is replaced by a
-  // teacher-style session card list (table.c-sessions).
+  // live search over the leaf classes only (match.classSearch filtered to
+  // groups.leaves; issue 075: no autocomplete — typing filters the list, it
+  // never opens suggestions); selecting one draws its week as a grid — days as
+  // columns, the six slots as rows — with a semi-transparent red cursor at the
+  // current time and the current/next slot cells highlighted. Broader classes
+  // (interior nodes) are not selectable: they never appear in the catalogue and
+  // exact references to them take the no-match path. On narrow screens the grid
+  // is replaced by a teacher-style session card list (table.c-sessions).
   function initClassesPage(store, modelObjs, index) {
     var search = document.getElementById('search');
     var searchBack = document.getElementById('searchBack');
@@ -119,21 +141,15 @@
     var overlayClear = document.getElementById('overlayClear');
     var searchClear = document.getElementById('searchClear');
     var searchDeselect = document.getElementById('searchDeselect');
-    var ghost = document.getElementById('ghost');
-    var ghostTyped = document.getElementById('ghostTyped');
-    var ghostPre = document.getElementById('ghostPre');
-    var ghostRest = document.getElementById('ghostRest');
-    var suggest = document.getElementById('suggest');
     var list = document.getElementById('classList');
     var detail = document.getElementById('detail');
     var status = document.getElementById('status');
     var layout = document.getElementById('layout');
     var groups = modelObjs.groups;
     var now = new Date();
-    var suggestIdx = -1;
-    // Leaf-only selection: the catalogue, the autocomplete and the commit
-    // gate only ever offer the leaf classes (one timetable each). Interior
-    // nodes (broader classes) are excluded everywhere below.
+    // Leaf-only selection: the catalogue and the commit gate only ever offer
+    // the leaf classes (one timetable each). Interior nodes (broader classes)
+    // are excluded everywhere below.
     var leafSet = {};
     groups.leaves.forEach(function (n) { leafSet[n.key] = true; });
     function isLeafRow(r) {
@@ -141,7 +157,6 @@
       return !!leafSet[k];
     }
     function leafRows(rows) { return rows.filter(isLeafRow); }
-    var suggestRows = [];
     // mobile nav machine (issue 058): two facts, three named states —
     //   menuOpen                    -> 'list'  (filterable list + back arrow)
     //   !menuOpen && selectedClass  -> 'class' (week view + name overlay)
@@ -184,10 +199,14 @@
     }
 
     // The name overlay belongs to the 'class' state: hidden unless a
-    // class is selected AND the menu is closed (issue 058).
+    // class is selected AND the menu is closed (issue 058). It carries the
+    // same heading the detail pane does — the issue-075 shortcut, rendered as
+    // markup (headingHTML escapes both parts) instead of raw text. The stored
+    // selection is a compact key, so overlayHeading resolves it back to the
+    // canonical class name before shortening it.
     function syncOverlay() {
       searchOverlay.hidden = selectedClass === null || menuOpen;
-      if (selectedClass !== null) overlayName.textContent = selectedClass;
+      if (selectedClass !== null) overlayName.innerHTML = headingHTML(overlayHeading(groups, selectedClass));
       syncDeselect();
     }
 
@@ -362,7 +381,10 @@
       currentWeek = week;            // the view the clock refreshes until cleared
       var cursor = model.dayCursor(now, store.slots);
       var by = indexByDaySlot(week);
-      var h = '<h2>' + esc(week.name) + '</h2>';
+      // the detail heading: the issue-075 shortcut for a full field name
+      // (`LCS3-GLSI_D Groupe 2` -> `GLSI3 D<sub>2</sub>`), anything else
+      // (an interior node name) falls back inside headingHTML
+      var h = '<h2>' + headingHTML(week.name) + '</h2>';
       // Per-day session groups, rendered on every viewport: desktop shows the
       // sections above the week grid, narrow screens shape them into cards
       // (teacher-style, via the generic mobile table rules; the whole-week
@@ -526,96 +548,12 @@
       markActive(ref);
     }
 
-    // ---- autocomplete overlay + shadow text ----------------------------
-
-    function renderSuggest(rows) {
-      suggestRows = rows;
-      suggest.innerHTML = '';
-      suggest.hidden = !rows.length;
-      // Mobile (coarse pointer): no pre-focus, so Enter commits the typed
-      // query until the user explicitly arrows/taps (issue 007). Desktop
-      // keeps the pre-focused first row. Ghost derives from suggestIdx,
-      // so -1 also means no ghost.
-      suggestIdx = rows.length ? (isCoarsePointer() ? -1 : 0) : -1; // desktop pre-focuses row 0; mobile starts unselected
-      rows.forEach(function (r, i) {
-        var li = document.createElement('li');
-        li.className = color.suggestion({ kind: r.kind, active: i === suggestIdx }).join(' ');
-        var node = index.nodes[r.label];
-        var body = match.highlightHTML(r.label, r.ranges) +
-          (node ? ' <span class="alias">— ' + esc(node.fullName()) + '</span>' : '');
-        li.innerHTML = '<span class="kind kind-' + r.kind + '">' + r.kind + '</span>' + body;
-        li.addEventListener('mousedown', function (e) {
-          e.preventDefault();
-          acceptSuggest(r);
-        });
-        suggest.appendChild(li);
-      });
-      paintActive();
-    }
-
-    function paintActive() {
-      suggest.querySelectorAll('li').forEach(function (li, i) {
-        li.classList.toggle(C.active, i === suggestIdx);
-      });
-    }
-
-    // Class-scoped ghost completion: completes to the bare class key with no
-    // "class:" prefix hint (the whole page is class-scoped). Adapts the
-    // shadowText prefix rule without forking match.js.
-    function classGhost(q, row) {
-      // Same strict rule as match.shadowText (issue #2): raw typed string,
-      // case-insensitive, space like any other character.
-      var raw = String(q == null ? '' : q);
-      if (!raw || !raw.trim() || !row) return null;
-      var rl = raw.toLowerCase();
-      if (row.label && row.label.toLowerCase().indexOf(rl) === 0)
-        return { pre: '', rest: row.label.slice(raw.length) };
-      return null;
-    }
-
-    function renderGhost() {
-      var row = suggestRows[suggestIdx];
-      var sh = row ? classGhost(search.value, row) : null;
-      if (sh) {
-        ghost.hidden = false;
-        ghostPre.textContent = sh.pre;
-        ghostTyped.textContent = search.value;
-        ghostRest.textContent = sh.rest;
-        var preW = sh.pre ? ghostPre.getBoundingClientRect().width : 0;
-        if (preW) search.style.setProperty('--ghost-pre', preW + 'px');
-        else search.style.removeProperty('--ghost-pre');
-      } else {
-        ghost.hidden = true;
-        ghostPre.textContent = '';
-        ghostTyped.textContent = '';
-        ghostRest.textContent = '';
-        search.style.removeProperty('--ghost-pre');
-      }
-    }
-
-    function acceptSuggest(row) {
-      search.value = row.label;
-      syncClear();
-      renderSuggest([]);
-      renderGhost();
-      commit();
-    }
-
     // ---- grouped live search ---------------------------------------------
 
-    function classSuggestions(q) {
-      // the page is class-scoped: keep only the class entries of the shared
-      // autocomplete, so teachers/subjects never appear here — and leaf-only,
-      // so broader classes are never offered.
-      return match.suggest(index, q).filter(function (r) {
-        return r.kind === 'class' && leafSet[r.label];
-      });
-    }
-
     // erase-only funnel (issue 060): the clear X lands here, never in
     // onInput()/commit() — emptying the box this way must NOT deselect. The
     // body is commit's empty branch minus showEmpty(): full leaf catalogue
-    // from the empty query, suggest/ghost dropped, pane flag re-synced, no
+    // from the empty query, pane flag re-synced, no
     // selection fact written (renderList re-applies the active mark from
     // activeKey — unlike teachers' renderItem, hence no markActive here).
     // Keyboard emptying still deselects through onInput (pinned 058 ruling 5)
@@ -625,8 +563,6 @@
     function eraseFilter() {
       search.value = '';
       syncClear();
-      renderSuggest([]);
-      renderGhost();
       renderList(leafRows(match.classSearch(index, '')));
       syncList();
     }
@@ -636,8 +572,6 @@
       syncClear();
       var rows = leafRows(match.classSearch(index, q));
       renderList(rows);
-      renderSuggest(classSuggestions(q));
-      renderGhost();
       // an empty filter means nothing is selected: back to the empty state
       if (!q.trim()) showEmpty();
       // exactly one result left -> auto-jump to the week view
@@ -646,8 +580,8 @@
     }
 
     // An exact class label selects even among partial matches (mirror of
-    // exactTeacher): tapping a suggest row commits its text, which may
-    // still match others — the exact leaf wins.
+    // exactTeacher): the committed text may still match others — the exact
+    // leaf wins.
     function exactClass(rows, q) {
       var want = model.normStr(q.trim());
       for (var i = 0; i < rows.length; i++) {
@@ -659,8 +593,6 @@
     function commit() {
       var q = search.value;
       syncClear();
-      renderSuggest([]);
-      renderGhost();
       var rows = leafRows(match.classSearch(index, q));
       renderList(rows);
       var like = exactClass(rows, q);
@@ -684,42 +616,22 @@
     }
 
     search.addEventListener('input', onInput);
+    // Only Escape and Enter are handled. Tab and the arrow keys were pure
+    // suggestion-row navigation (issue 075 removed the autocomplete), so they
+    // fall back to their native input behavior.
     search.addEventListener('keydown', function (e) {
       if (e.key === 'Escape') {
         // <input type="search"> clears the field on Esc by default; cancel
-        // that so Esc keeps the typed filter: it drops the suggest overlay
-        // if open, else closes the menu — it never deselects.
+        // that so Esc keeps the typed filter: it closes the menu — it never
+        // deselects. (Issue 075: no suggest overlay to drop any more.)
         e.preventDefault();
-        if (!suggest.hidden) { renderSuggest([]); renderGhost(); return; }
         closeMenu();
       }
-      if (e.key === 'Tab') {
-        // Issue 007: Tab must not accept an implicit (non-explicit)
-        // selection on mobile (suggestIdx -1) — same gate as Enter.
-        // Desktop is unchanged (fresh idx is 0, still accepts).
-        if (!suggest.hidden && suggestRows.length && suggestIdx >= 0) {
-          e.preventDefault();
-          acceptSuggest(suggestRows[suggestIdx]);
-        }
-        return;
-      }
-      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
-        if (suggest.hidden) return;
-        e.preventDefault();
-        var items = suggest.querySelectorAll('li');
-        if (!items.length) return;
-        suggestIdx = e.key === 'ArrowDown'
-          ? (suggestIdx + 1) % items.length
-          : (suggestIdx - 1 + items.length) % items.length;
-        paintActive();
-        renderGhost();
-        return;
-      }
       if (e.key === 'Enter') {
+        // Enter commits the typed query (issue 007's rule, kept after the
+        // autocomplete left in issue 075): nothing pre-selects on this page.
         e.preventDefault();
-        if (!suggest.hidden && suggestRows.length && suggestIdx >= 0)
-          acceptSuggest(suggestRows[suggestIdx]);
-        else commit();
+        commit();
       }
     });
     search.addEventListener('focus', function () {
@@ -731,13 +643,9 @@
     search.addEventListener('click', function () {
       openMenu();
     });
-    // blur only drops the autocomplete overlay: menu visibility is
-    // selection/back-driven, never blur-driven, so losing focus must never
-    // hide the row a press is about to land on.
-    search.addEventListener('blur', function () {
-      renderSuggest([]);
-      renderGhost();
-    });
+    // No blur handler (issue 075): its only job was dropping the suggest
+    // overlay. Menu visibility stays selection/back-driven, never
+    // blur-driven, by construction — losing focus writes nothing.
 
     // back dismisses the open list + focus and hides itself; a selected
     // class stays selected ("back to the earlier state" by construction)
--- a/js/libgroups.js
+++ b/js/libgroups.js
@@ -594,6 +594,28 @@
     return (slot || '') + (sem || '') + (levels.section || '') + (levels.cohort || '');
   }
 
+  // Shortcut heading form (issue 075): the compact name the classes page
+  // shows in place of a full class name, with the cohort split out so the
+  // caller can render it as a real <sub> (HTML markup stays out of this
+  // platform-agnostic file; the caller escapes both parts first):
+  //   LBC1-H Groupe 2   -> { head: 'H1',    sub: '2' }   -> H1<sub>2</sub>
+  //   LCS3-GLSI_D Groupe 2 -> { head: 'GLSI3 D', sub: '2' } -> GLSI3 D<sub>2</sub>
+  //   LBC3-EB_A         -> { head: 'EB3 A', sub: ''  }   -> EB3 A
+  //   MP1-EXR / MP2-SD  -> { head: 'EXR1' / 'SD2', sub: '' }
+  //   MP2-SD_A          -> { head: 'SD2 A', sub: ''  }
+  // Strict whole-string match on the full-name shape (track from the known
+  // TRACKS vocabulary); anything else — a malformed field from raw CSV
+  // quoting, a compact key, an interior node name, an unknown future shape —
+  // returns null so the caller falls back to the full name. A heading is
+  // never blanked. Pure, no DOM.
+  var SHORTCUT_RE = new RegExp(
+    '^(' + TRACKS.join('|') + ')(\\d{1,2})-([A-Za-z0-9]+?)(?:_([A-Z]))?(?: Groupe (\\d+))?$');
+  function shortcutOf(name) {
+    var m = SHORTCUT_RE.exec(name == null ? '' : String(name));
+    if (!m) return null;
+    return { head: m[3] + m[2] + (m[4] ? ' ' + m[4] : ''), sub: m[5] || '' };
+  }
+
   /* ------------------------------------------------------------------ *
    * ClassNode
    * ------------------------------------------------------------------ */
@@ -1250,6 +1272,7 @@
     parseFullName: parseFullName,
     formatFull: formatFull,
     formatCompact: formatCompact,
+    shortcutOf: shortcutOf,
 
     // builders
     build: build,
--- a/test/classes.test.js
+++ b/test/classes.test.js
@@ -441,37 +441,168 @@
   assert.ok(html.indexOf('rel="canonical"') !== -1, 'missing canonical');
   assert.ok(html.indexOf('https://adem482p.github.io/time/classes/') !== -1,
     'canonical/og:url must use the classes app URL (issue 072: the page moved to classes/)');
-  ['id="searchWrap"', 'id="search"', 'id="suggest"', 'id="classList"',
+  ['id="searchWrap"', 'id="search"', 'id="classList"',
    'id="detail"', 'id="status"', 'id="themeCycle"',
    'id="searchBack"', 'id="searchOverlay"', 'id="overlayClear"', 'id="overlayName"',
    'id="searchClear"'].forEach(function (id) {
     assert.ok(html.indexOf(id) !== -1, 'missing element ' + id);
   });
   assert.ok(html.indexOf('id="searchDone"') === -1, 'the V-chevron is gone from the classes page');
+  // issue 075: the suggestion list and the ghost line left the classes page
+  // (their absence is pinned positively in the "no autocomplete" test below)
+  ['id="suggest"', 'id="ghost"'].forEach(function (id) {
+    assert.ok(html.indexOf(id) === -1, 'element must stay gone from classes: ' + id);
+  });
   // the theme control is ONE element: no #themeBar wrapper, no .theme-dot span
   assert.ok(html.indexOf('theme-dot') === -1, 'theme square must not use a .theme-dot span');
   assert.ok(html.indexOf('id="themeBar"') === -1, 'theme square must not use a #themeBar wrapper');
 });
 
-test('the classes nav pins the two links, and no page references the unlisted utility views (issue 073)', function () {
-  // the root landing is now a pure redirect to the teachers app (issue 073);
-  // the classes app's own nav addresses itself via index.html and its sibling
-  // app via its directory — the utility views are unlisted, reachable only by
-  // their URL (at/, all/), so their links left the nav.
+test('the classes page carries no navigation links, and still references no unlisted utility view (issues 075, 073)', function () {
+  // Issue 075 removed the nav bar outright — the classes app is now a
+  // dead-end reachable only by URL (the root classes.html stub remains the
+  // other way in). That is the reporter's call; what must stay true is
+  // issue 073's: no page references the unlisted utility views.
   var html = readPage('classes/index.html');
+  assert.strictEqual(html.indexOf('<nav'), -1,
+    'classes/index.html ships no nav element at all (issue 075)');
+  assert.strictEqual(html.indexOf('</nav>'), -1, 'no closing tag without an opener');
   ['href="../teachers/"', 'href="index.html"'].forEach(function (a) {
-    assert.ok(html.indexOf(a) !== -1, 'classes/index.html nav missing ' + a);
+    assert.strictEqual(html.indexOf(a), -1,
+      'classes/index.html must carry no nav link ' + a + ' (issue 075)');
   });
-  var nav = /<nav>[\s\S]*?<\/nav>/.exec(html);
-  assert.ok(nav, 'classes/index.html keeps its nav');
-  assert.strictEqual((nav[0].match(/<a /g) || []).length, 2,
-    'the classes nav pins exactly two links (Teachers + Classes)');
   [/time\.html/, /timetable\.html/].forEach(function (old) {
     assert.strictEqual(old.test(html), false,
       'classes/index.html must not reference the unlisted old URL ' + old + ' (issue 073)');
   });
 });
 
+// ---- issue 075: nav out, autocomplete out, shortcut heading in --------------
+
+// The real heading renderer, sliced from js/classes.js and driven with the
+// real shortcutOf + esc, exactly as the page runs it.
+function classesHeadingHarness() {
+  var sandbox = { console: console, esc: data.esc, shortcutOf: TT.groups.shortcutOf };
+  vm.createContext(sandbox);
+  vm.runInContext(classesHeadingFn(), sandbox, { filename: 'classes-heading-harness' });
+  return function (name) {
+    return vm.runInContext('headingHTML(' + JSON.stringify(name) + ');', sandbox,
+      { filename: 'classes-heading-call' });
+  };
+}
+
+test('the class heading renders the shortcut with a real <sub> (issue 075)', function () {
+  var heading = classesHeadingHarness();
+  // the reporter's exact example, byte for byte
+  assert.strictEqual(heading('LCS3-GLSI_D Groupe 2'), 'GLSI3 D<sub>2</sub>');
+  assert.strictEqual(heading('LCS3-GLSI_D Groupe 1'), 'GLSI3 D<sub>1</sub>');
+  // the documented shapes
+  assert.strictEqual(heading('LBC1-H Groupe 2'), 'H1<sub>2</sub>');
+  assert.strictEqual(heading('LCS1-A Groupe 1'), 'A1<sub>1</sub>');
+  assert.strictEqual(heading('LBC2-BI_A Groupe 1'), 'BI2 A<sub>1</sub>');
+  assert.strictEqual(heading('LCE2-IoT_A Groupe 1'), 'IoT2 A<sub>1</sub>');
+  assert.strictEqual(heading('LBC3-EB_A'), 'EB3 A');
+  assert.strictEqual(heading('MP1-EXR'), 'EXR1');
+  assert.strictEqual(heading('MP2-SD'), 'SD2');
+  assert.strictEqual(heading('MP2-SD_A'), 'SD2 A');
+  // fallbacks: an unrecognized shape keeps the full name, never a blank
+  assert.strictEqual(heading('LCS1'), 'LCS1');
+  assert.strictEqual(heading('GLSI3D1'), 'GLSI3D1');
+  assert.strictEqual(heading(''), '');
+  assert.strictEqual(heading('LCS3-GLSI_D Groupe X'), 'LCS3-GLSI_D Groupe X');
+  // markup safety: input HTML in a name is escaped, and the only literal
+  // tags the renderer can emit are the <sub>/</sub> pair
+  assert.strictEqual(heading('LCS3-GLSI_D Groupe <b>2</b>'),
+    'LCS3-GLSI_D Groupe &lt;b&gt;2&lt;/b&gt;');
+  var src = classesHeadingFn();
+  assert.ok(src.indexOf('esc(sc.head)') !== -1 && src.indexOf('esc(sc.sub)') !== -1,
+    'both shortcut parts are escaped before the <sub> is appended');
+  assert.ok(src.indexOf('esc(name)') !== -1, 'the fallback escapes the full name');
+});
+
+test('the narrow overlay resolves the stored key before shortcutting it (issue 075)', function () {
+  // overlayHeading + headingHTML, sliced from js/classes.js and driven with
+  // the real model/libgroups, exactly as syncOverlay runs them.
+  var sandbox = {
+    console: console, esc: data.esc, shortcutOf: TT.groups.shortcutOf,
+    model: model, groups: groups
+  };
+  vm.createContext(sandbox);
+  vm.runInContext(classesHeadingFn() + classesOverlayFn(), sandbox,
+    { filename: 'classes-overlay-harness' });
+  function overlay(ref) {
+    return vm.runInContext('headingHTML(overlayHeading(groups, ' +
+      JSON.stringify(ref) + '));', sandbox, { filename: 'classes-overlay-call' });
+  }
+  // the stored ref (issue 065 writes the compact key) resolves to the
+  // canonical name and then shortens, byte-identical to the detail <h2>
+  assert.strictEqual(overlay('GLSI3D2'), 'GLSI3 D<sub>2</sub>');
+  assert.strictEqual(overlay('GLSI3D1'), 'GLSI3 D<sub>1</sub>');
+  assert.strictEqual(overlay('EB1A'), 'EB3 A');
+  // an unresolvable ref (removed data, tampered storage) falls back to the
+  // raw ref — escaped by headingHTML, never blank
+  assert.strictEqual(overlay('no-such-class'), 'no-such-class');
+  assert.strictEqual(overlay('LCS1'), 'LCS1');
+  assert.ok(!/undefined|null/.test(overlay('GLSI3D2')), 'no leak of undefined/null');
+});
+
+test('the shortcut heads every class-name heading surface of the page (issue 075)', function () {
+  var src = CLASSES_SRC;
+  // the detail heading (same element on desktop and narrow)…
+  assert.ok(src.indexOf("<h2>' + headingHTML(week.name) + '</h2>'") !== -1,
+    'renderWeek heads the detail with the shortcut');
+  assert.ok(src.indexOf('esc(week.name)') === -1,
+    'the detail heading no longer renders the raw field name');
+  // …and the narrow selected-class overlay (issues 056/058 mobile chrome).
+  // The stored selection is a compact key, so the overlay resolves it back to
+  // the canonical class name before shortcutting it.
+  assert.ok(src.indexOf('overlayName.innerHTML = headingHTML(overlayHeading(groups, selectedClass))') !== -1,
+    'the overlay heads the narrow view with the shortcut of the resolved name');
+  assert.ok(src.indexOf('model.classWeek(groups, ref)') !== -1,
+    'overlayHeading resolves the compact selection key to its canonical name');
+  assert.ok(src.indexOf('overlayName.textContent') === -1,
+    'the overlay no longer paints the raw name as text');
+  // the raw name stays where correctness needs it: list identity, the
+  // leaf-set mark, the no-match echo, and the issue-065 stored ref
+  ['li.dataset.key = r.label', 'markActive', 'No match for "', 'writeStoredClass(ref)']
+    .forEach(function (tok) {
+      assert.ok(src.indexOf(tok) !== -1, 'the full name stays at: ' + tok);
+    });
+});
+
+test('the classes page ships no autocomplete machinery; the teachers page keeps its own (issue 075)', function () {
+  // classes markup: no suggestion list, no inline ghost completion
+  var html = readPage('classes/index.html');
+  ['id="suggest"', 'id="ghost"', 'id="ghostPre"', 'id="ghostTyped"', 'id="ghostRest"']
+    .forEach(function (tok) {
+      assert.ok(html.indexOf(tok) === -1, 'classes markup must not carry ' + tok + ' (issue 075)');
+    });
+  // classes source: every piece of suggest machinery is gone
+  var src = CLASSES_SRC;
+  ['renderSuggest', 'paintActive', 'classGhost', 'renderGhost', 'acceptSuggest',
+   'classSuggestions', 'suggestIdx', 'suggestRows', 'isCoarsePointer',
+   'match.suggest', 'color.suggestion', "getElementById('suggest'",
+   "getElementById('ghost'", '--ghost-pre'].forEach(function (tok) {
+    assert.ok(src.indexOf(tok) === -1, 'js/classes.js must not carry ' + tok + ' (issue 075)');
+  });
+  // the input keeps every non-suggest behavior: live filtering (060), the
+  // erase-only X (060/064/074), deselection, redaction and the 065 restore
+  ['function eraseFilter()', 'function syncDeselect()', 'match.classSearch',
+   'nameHTML(', 'readStoredClass', 'function restorable', "addEventListener('input'"]
+    .forEach(function (tok) {
+      assert.ok(src.indexOf(tok) !== -1, 'classes keeps ' + tok);
+    });
+  // teachers: markup ships its suggest hidden, JS renders it — untouched
+  var thtml = readPage('teachers/index.html');
+  assert.ok(/<ul id="suggest" hidden>/.test(thtml), 'teachers keeps its suggest element');
+  assert.ok(/<div id="ghost"/.test(thtml), 'teachers keeps its ghost line');
+  var tsrc = readPage('js/teachers.js');
+  ['function renderSuggest', 'function renderGhost', 'function acceptSuggest',
+   'match.suggest', "addEventListener('blur'"].forEach(function (tok) {
+    assert.ok(tsrc.indexOf(tok) !== -1, 'teachers keeps ' + tok);
+  });
+});
+
 test('styles.css gains a classes section without touching the mobile block', function () {
   var css = readPage('styles.css');
   assert.ok(css.indexOf('classes page') !== -1);
@@ -520,10 +651,14 @@
   kept.forEach(function (r) {
     assert.ok(groups.byKey[r.label].isLeaf(), r.label + ' must be a leaf');
   });
-  // class autocomplete entries resolve through the same leaf set
+  // the shared suggest layer still offers interior classes; the classes page
+  // no longer consumes it at all (issue 075: it never calls match.suggest —
+  // asserted in "classes.js selects leaves only" below), so the leaf-set
+  // filter here is the layer contract itself, not the page's.
   var sug = match.suggest(index, 'lcs1').filter(function (r) { return r.kind === 'class'; });
   var sugKept = sug.filter(function (r) { return set[r.label]; });
-  assert.ok(sug.length > sugKept.length, 'suggest still offers interior classes (classes.js filters them)');
+  assert.ok(sug.length > sugKept.length,
+    'match.suggest still offers interior classes (only the leaf set keeps them)');
   sugKept.forEach(function (r) {
     assert.ok(groups.byKey[r.label].isLeaf(), r.label + ' must be a leaf');
   });
@@ -568,8 +703,8 @@
     'onInput/commit must leaf-filter classSearch rows');
   assert.ok(sec.indexOf('leafRows(match.classSearch(index, \'\'))') !== -1,
     'initial paint must leaf-filter the catalogue');
-  assert.ok(sec.indexOf('leafSet[r.label]') !== -1,
-    'classSuggestions must leaf-filter suggest rows');
+  assert.ok(sec.indexOf('match.suggest') === -1,
+    'classes.js never calls the suggest layer (issue 075: no autocomplete)');
   // single-leaf gates: exact refs and showClass take the nomatch path otherwise
   assert.ok(sec.indexOf('leaves.length === 1') !== -1, 'missing single-leaf commit gate');
   assert.ok(sec.indexOf('week.leaves.length !== 1') !== -1, 'missing single-leaf showClass gate');
@@ -609,10 +744,15 @@
   var handler = sec.slice(at, sec.indexOf('};', at) + 2);
   assert.ok(handler.indexOf('selectClass(r.label)') !== -1, 'row click selects through the funnel');
   assert.ok(handler.indexOf('search.value =') === -1, 'row click must not rewrite the filter');
-  // the sanctioned commit path still writes the filter
-  var accept = sec.slice(sec.indexOf('function acceptSuggest(row)'));
-  assert.ok(accept.indexOf('search.value = row.label') !== -1,
-    'acceptSuggest keeps the commit write');
+  // with the autocomplete gone (issue 075) nothing rewrites the box except
+  // the one erase-only funnel — the old acceptSuggest commit write left with it
+  var writes = sec.match(/search\.value = /g) || [];
+  assert.strictEqual(writes.length, 1,
+    'exactly one programmatic filter write is left (eraseFilter), got ' + writes.length);
+  assert.ok(sec.indexOf("search.value = '';") !== -1,
+    'that one write is the erase funnel emptying the box');
+  assert.ok(sec.indexOf('function acceptSuggest') === -1,
+    'the suggest commit writer stays removed (issue 075)');
 });
 
 test('classes card list groups by day with no Day column (G2)', function () {
@@ -699,6 +839,24 @@
   return CLASSES_SRC.slice(start, end + '</svg>\';'.length);
 }
 
+// The real heading shortcut renderer (issue 075), sliced from source: it sits
+// at module scope between NEXT_ARROW and the clock section.
+function classesHeadingFn() {
+  var start = CLASSES_SRC.indexOf('function headingHTML(name)');
+  var end = CLASSES_SRC.indexOf('// ---- clock (issue 051)', start);
+  assert.ok(start !== -1 && end !== -1 && end > start, 'headingHTML bounds');
+  return CLASSES_SRC.slice(start, end);
+}
+
+// The real ref→name resolver the narrow overlay heads with (issue 075), sliced
+// from source: it sits at module scope right after restorable().
+function classesOverlayFn() {
+  var start = CLASSES_SRC.indexOf('function overlayHeading(groups, ref)');
+  var end = CLASSES_SRC.indexOf('// ---- classes page', start);
+  assert.ok(start !== -1 && end !== -1 && end > start, 'overlayHeading bounds');
+  return CLASSES_SRC.slice(start, end);
+}
+
 function runClassesList(week, now) {
   var cursor = model.dayCursor(now, store.slots);
   var sandbox = {
@@ -958,6 +1116,7 @@
     console: console,
     model: model, color: color, C: color.CLASSES, esc: data.esc,
     nameHTML: data.nameHTML,
+    shortcutOf: TT.groups.shortcutOf,   // real heading shortcut (issue 075)
     store: store,
     week: model.classWeek(groups, 'GLSI3D1'),
     detail: detail,
@@ -967,7 +1126,7 @@
     Date: FakeDate
   };
   vm.createContext(sandbox);
-  vm.runInContext(classesArrow() + '\n' + classesWeekSlice(), sandbox,
+  vm.runInContext(classesHeadingFn() + '\n' + classesArrow() + '\n' + classesWeekSlice(), sandbox,
     { filename: 'classes-week-harness' });
   return {
     sandbox: sandbox,
@@ -1172,7 +1331,15 @@
   assert.ok(handlerSlice("searchClear.addEventListener('click'").indexOf('search.focus()') === -1,
     'the X no longer re-focuses the box');
   assert.ok(handlerSlice("addEventListener('keydown'").indexOf('closeMenu();') !== -1,
-    'Escape without an open suggest closes the menu');
+    'Escape closes the menu (issue 075: no suggest overlay to drop first)');
+  // issue 075: the suggestion-key navigation is gone with the autocomplete —
+  // Tab and the arrows fall back to their native input behavior
+  ['e.key === \'Tab\'', '\'ArrowDown\'', '\'ArrowUp\''].forEach(function (tok) {
+    assert.ok(CLASSES_SRC.indexOf(tok) === -1,
+      'classes keydown must not handle ' + tok + ' (issue 075)');
+  });
+  assert.ok(CLASSES_SRC.indexOf("addEventListener('blur'") === -1,
+    'classes has no blur handler left (issue 075: it only dropped the overlay)');
   var bootTail = src.slice(src.indexOf('// initial paint'), src.indexOf('clock.subscribe(onTick);'));
   assert.ok(bootTail.indexOf('showEmpty();') !== -1, 'boot paints through the empty funnel');
 });
@@ -1291,10 +1458,15 @@
     'syncOverlay composes syncDeselect');
   // eraseFilter: commit's empty branch minus showEmpty, no funnel writes (I5)
   var ef = body('function eraseFilter()');
-  ["search.value = '';", 'syncClear();', 'renderSuggest([])', 'renderGhost();',
+  ["search.value = '';", 'syncClear();',
    'syncList();'].forEach(function (tok) {
     assert.ok(ef.indexOf(tok) !== -1, 'eraseFilter: ' + tok);
   });
+  // issue 075: the erase funnel dropped the suggest/ghost clears with the
+  // autocomplete itself — nothing suggest-shaped may survive in it
+  ['renderSuggest', 'renderGhost', 'classGhost'].forEach(function (tok) {
+    assert.ok(ef.indexOf(tok) === -1, 'eraseFilter must not touch ' + tok + ' (issue 075)');
+  });
   assert.ok(ef.indexOf("leafRows(match.classSearch(index, ''))") !== -1,
     'eraseFilter re-renders the full leaf catalogue from the empty query');
   assert.ok(ef.indexOf('markActive') === -1,
--- a/test/deadcode.test.js
+++ b/test/deadcode.test.js
@@ -2,7 +2,10 @@
 //
 // The committed exact-query machinery (js/match.js) and the shared-boot
 // match index (js/app.js) had zero callers when they were deleted; these
-// source-level pins keep them from creeping back unnoticed.
+// source-level pins keep them from creeping back unnoticed. Later removals
+// join the same file: the dead #themeName label path (issue 059) and the
+// classes page's nav bar + autocomplete (issue 075) — each gone on purpose,
+// each pinned so it cannot silently return.
 
 'use strict';
 
@@ -33,3 +36,26 @@
   assert.ok(src.indexOf('themeName') === -1, 'themeName must stay removed');
   assert.ok(src.indexOf('labelEl') === -1, 'labelEl must stay removed');
 });
+
+test('the classes page navigation stays removed (issue 075)', function () {
+  var html = readSrc('classes/index.html');
+  assert.ok(html.indexOf('<nav') === -1, 'the classes nav bar must stay removed');
+  assert.ok(html.indexOf('href="../teachers/"') === -1,
+    'the classes page must stay linked-out-free (dead-end by the reporter\'s call)');
+  assert.ok(html.indexOf('href="index.html"') === -1, 'no self nav link either');
+});
+
+test('the classes page autocomplete stays removed (issue 075)', function () {
+  var html = readSrc('classes/index.html');
+  assert.ok(html.indexOf('id="suggest"') === -1, '#suggest must stay removed');
+  assert.ok(html.indexOf('id="ghost"') === -1, 'the ghost completion line must stay removed');
+  var src = readSrc('js/classes.js');
+  ['renderSuggest', 'renderGhost', 'acceptSuggest', 'suggestIdx', 'suggestRows',
+   'isCoarsePointer', 'match.suggest'].forEach(function (tok) {
+    assert.ok(src.indexOf(tok) === -1, tok + ' must stay removed from js/classes.js');
+  });
+  // the teachers page is the other side of the same line: its autocomplete
+  // must survive (the shared machinery lives there now)
+  assert.ok(readSrc('js/teachers.js').indexOf('function renderSuggest') !== -1,
+    'the teachers autocomplete must stay');
+});
--- a/test/libgroups.test.js
+++ b/test/libgroups.test.js
@@ -60,6 +60,7 @@
 test('exports the documented surface', function () {
   ['TRACKS', 'SECTIONS', 'COHORTS', 'GroupsError', 'Grouping', 'ClassNode',
    'normalize', 'parseLevels', 'parseFullName', 'formatFull', 'formatCompact',
+   'shortcutOf',
    'build', 'fromFieldValues', 'fromRows'].forEach(function (name) {
     assert.ok(name in Groups, 'missing export: ' + name);
   });
@@ -83,6 +84,94 @@
   });
 });
 
+// ---- shortcut heading form (issue 075) --------------------------------------
+//
+// `shortcutOf(fullName)` is the pure mapping behind the classes detail
+// heading: it splits a full field name into the plain head and the cohort
+// (rendered by the page as a real <sub> — `LCS3-GLSI_D Groupe 2` displays as
+// `GLSI3 D<sub>2</sub>`). Table over the documented shapes, a sweep over
+// every distinct field actually in emplois.csv, then the null fallbacks.
+
+test('shortcutOf maps the documented shapes (issue 075)', function () {
+  var table = [
+    // [field, head, sub] — the first row is the reporter's exact example
+    ['LCS3-GLSI_D Groupe 2', 'GLSI3 D', '2'],
+    ['LCS3-GLSI_D Groupe 1', 'GLSI3 D', '1'],
+    ['LBC1-H Groupe 2', 'H1', '2'],            // single-letter section, no _X
+    ['LCS1-A Groupe 1', 'A1', '1'],            // common branch, same rule
+    ['LBC2-BI_A Groupe 1', 'BI2 A', '1'],
+    ['LCE2-IoT_A Groupe 1', 'IoT2 A', '1'],    // canonical case kept verbatim
+    ['LCE3-IRS_B Groupe 2', 'IRS3 B', '2'],
+    ['LBC3-EB_A', 'EB3 A', ''],                // no "Groupe": no subscript
+    ['MP2-SD_A', 'SD2 A', ''],
+    ['MP1-EXR', 'EXR1', ''],
+    ['MP1-SD', 'SD1', ''],
+    ['MP2-EXR', 'EXR2', ''],
+    ['MP2-SD', 'SD2', '']                      // brief's shape, absent from this CSV
+  ];
+  table.forEach(function (row) {
+    assert.deepStrictEqual(Groups.shortcutOf(row[0]), { head: row[1], sub: row[2] },
+      'shortcut of ' + row[0]);
+  });
+  // the plain text the reporter asked for, sub digits included
+  var ex = Groups.shortcutOf('LCS3-GLSI_D Groupe 2');
+  assert.strictEqual(ex.head + ex.sub, 'GLSI3 D2');
+});
+
+test('shortcutOf maps every distinct field in the real CSV (issue 075)', function () {
+  var distinct = {};
+  rows.forEach(function (r) { distinct[r.field] = true; });
+  var fields = Object.keys(distinct);
+  assert.strictEqual(fields.length, 94);
+  var fams = {};
+  fields.forEach(function (f) {
+    var leaf = grouping.leafFor(f);
+    assert.ok(leaf, 'no leaf for ' + f);
+    var sc = Groups.shortcutOf(f);
+    assert.ok(sc, 'shortcutOf must map the real field ' + f);
+    // the subscript is exactly the real cohort — nothing else can ever land
+    // under the <sub>; cohort-less fields carry no subscript
+    assert.strictEqual(sc.sub, leaf.cohort || '', f + ': subscript is the real cohort');
+    // the head is the identity of the same leaf: section + year for a common
+    // branch, specialization + year [+ " " + section] otherwise
+    var want = leaf.commonBranch
+      ? leaf.section + leaf.year
+      : leaf.specialization + leaf.year + (leaf.section ? ' ' + leaf.section : '');
+    assert.strictEqual(sc.head, want, f + ': head is the leaf identity');
+    // plain text by construction (alnum + the one section space), so the
+    // page's escaping before <sub> is belt-and-braces — never load-bearing
+    assert.ok(/^[A-Za-z0-9]+(?: [A-Za-z0-9]+)?$/.test(sc.head), f + ': plain head ' + sc.head);
+    assert.ok(!sc.sub || /^\d+$/.test(sc.sub), f + ': digit subscript ' + sc.sub);
+    var fam = (leaf.commonBranch ? 'common' : 'spec') +
+      (leaf.section ? '+section' : '') + (leaf.cohort ? '+cohort' : '');
+    fams[fam] = (fams[fam] || 0) + 1;
+  });
+  // every documented family is really present in the data
+  assert.deepStrictEqual(fams, {
+    'common+section+cohort': 38,
+    'spec': 3,
+    'spec+section': 3,
+    'spec+section+cohort': 50
+  });
+});
+
+test('shortcutOf returns null for anything it does not recognize (issue 075)', function () {
+  [
+    null, undefined, '',
+    'LCS1', 'LCS', 'GLSI',       // interior node names (unions keep their name)
+    'GLSI3D1',                    // compact key, not a full name
+    'LCS3-GLSI_D Groupe',         // malformed cohort wording
+    'LCS3-GLSI_D Groupe X',       // non-digit cohort
+    'LCS3_GLSI_D Groupe 2',       // no year/track separator
+    'LBC1-A Groupe 1 ', ' LCS1-A Groupe 1',  // strict: whitespace is not trimmed
+    'X9-YY_Z Groupe 1',           // unknown track
+    'no track at all', 'LCS3-GLSI_D Groupe <b>2</b>'
+  ].forEach(function (name) {
+    assert.strictEqual(Groups.shortcutOf(name), null,
+      'must fall back to the full name for ' + JSON.stringify(name));
+  });
+});
+
 test('section and cohort sets are read from the data', function () {
   assert.strictEqual(keys(grouping.sections('LBC1')), 'LBC1A,LBC1B,LBC1C,LBC1D,LBC1E,LBC1F,LBC1G,LBC1H');
   assert.strictEqual(keys(grouping.cohorts('LBC1A')), 'LBC1A1,LBC1A2');
--- a/test/teacher-daygroups.test.js
+++ b/test/teacher-daygroups.test.js
@@ -430,27 +430,24 @@
     assert.ok(at !== -1, sig + ' handler found');
     return sec.slice(at, sec.indexOf('});', at) + 3);
   }
-  // blur stays pure on both pages: it drops the suggest overlay and nothing
-  // else (3909bd9 — a press in flight must never lose its row)
-  [teachers, classes].forEach(function (sec, i) {
-    var tag = i ? 'classes' : 'teachers';
-    var blur = handlerSlice(sec, "addEventListener('blur'");
-    assert.ok(blur.indexOf('renderSuggest([])') !== -1, tag + ': blur drops the overlay');
-    assert.ok(blur.indexOf('syncList()') === -1, tag + ': blur must not toggle panes');
-    assert.ok(blur.indexOf('setTimeout') === -1, tag + ': no deferred blur');
-    assert.ok(sec.indexOf("layout.classList.remove('is-list')") !== -1,
-      tag + ': selection dismisses the menu');
-  });
-  // teachers: blur writes neither nav fact nor any menu-edge function
+  // blur stays pure: it drops the suggest overlay and nothing else
+  // (3909bd9 — a press in flight must never lose its row). Issue 075 removed
+  // the classes autocomplete, and with it the classes blur handler itself —
+  // dropping the overlay was its only job — so the classes side is pinned by
+  // absence: no handler can ever write anything.
+  assert.ok(teachers.indexOf("layout.classList.remove('is-list')") !== -1,
+    'teachers: selection dismisses the menu');
+  assert.ok(classes.indexOf("layout.classList.remove('is-list')") !== -1,
+    'classes: selection dismisses the menu');
   var teachersBlur = handlerSlice(teachers, "addEventListener('blur'");
+  assert.ok(teachersBlur.indexOf('renderSuggest([])') !== -1, 'teachers: blur drops the overlay');
+  assert.ok(teachersBlur.indexOf('syncList()') === -1, 'teachers: blur must not toggle panes');
+  assert.ok(teachersBlur.indexOf('setTimeout') === -1, 'teachers: no deferred blur');
   ['menuOpen', 'openMenu', 'closeMenu'].forEach(function (tok) {
     assert.ok(teachersBlur.indexOf(tok) === -1, 'teachers: blur must not touch ' + tok);
   });
-  // classes: blur writes neither nav fact nor any menu-edge function
-  var classesBlur = handlerSlice(classes, "addEventListener('blur'");
-  ['menuOpen', 'openMenu', 'closeMenu'].forEach(function (tok) {
-    assert.ok(classesBlur.indexOf(tok) === -1, 'classes: blur must not touch ' + tok);
-  });
+  assert.ok(CLASSES_SRC.indexOf("addEventListener('blur'") === -1,
+    'classes: no blur handler at all (issue 075 — it only ever dropped the overlay)');
   function fnSlice(sec, sig) {
     var start = sec.indexOf(sig);
     assert.ok(start !== -1, sig + ' found');
@@ -868,10 +865,22 @@
       tag + ': syncOverlay composes syncDeselect');
     // eraseFilter: commit's empty branch minus showEmpty, no funnel writes (I5)
     var ef = body('function eraseFilter()');
-    ["search.value = '';", 'syncClear();', 'renderSuggest([])', 'renderGhost();',
+    ["search.value = '';", 'syncClear();',
      'syncList();'].forEach(function (tok) {
       assert.ok(ef.indexOf(tok) !== -1, tag + ': eraseFilter: ' + tok);
     });
+    if (i) {
+      // issue 075: the classes erase funnel dropped the suggest/ghost clears
+      // along with the autocomplete itself
+      ['renderSuggest', 'renderGhost'].forEach(function (tok) {
+        assert.ok(ef.indexOf(tok) === -1,
+          tag + ': eraseFilter must not touch ' + tok + ' (issue 075)');
+      });
+    } else {
+      ['renderSuggest([])', 'renderGhost();'].forEach(function (tok) {
+        assert.ok(ef.indexOf(tok) !== -1, tag + ': eraseFilter: ' + tok);
+      });
+    }
     assert.ok(ef.indexOf(i ? "leafRows(match.classSearch(index, ''))"
       : "match.searchSections(index, '', avail).sections") !== -1,
       tag + ': eraseFilter re-renders the full list from the empty query');
@@ -934,11 +943,15 @@
     // geometry) outranks the UA [hidden] default, so the base armour must stay
     assert.ok(base.indexOf('#searchClear[hidden] { display: none; }') !== -1,
       tag + ': base CSS honours #searchClear[hidden] so the markup default renders');
-    // every sibling chrome node in the wrap ships hidden or base armour too —
+    // every other chrome node in the wrap ships hidden or base armour too —
     // no other node in #searchWrap can paint before boot writes its state
     assert.ok(/<div id="searchOverlay" hidden>/.test(src), tag + ': overlay ships hidden');
-    assert.ok(/<ul id="suggest" hidden>/.test(src), tag + ': suggest ships hidden');
     assert.ok(/id="searchDeselect"[^>]*\shidden>/.test(src), tag + ': deselect ships hidden');
+    // issue 075: the classes page lost its suggest element entirely; the
+    // teachers one still ships hidden (its autocomplete is untouched)
+    if (i) assert.ok(!/<ul id="suggest"/.test(src),
+      'classes: no suggest element at all (issue 075)');
+    else assert.ok(/<ul id="suggest" hidden>/.test(src), 'teachers: suggest ships hidden');
   });
   // JS keeps exactly one visibility writer for the X — no second mechanism
   [APP_SRC, CLASSES_SRC].forEach(function (src, i) {

```

**Verification (all in place, no commit — no git of any kind was used; the
"before" copies are in `/tmp/opencode/075-orig/` and the diff above was
produced with `diff -u` against them):**

1. `node --test test/*.test.js` → **189 pass / 0 fail** (baseline run on `main`
   before the edit: **180 pass / 0 fail**; +9 tests, **none deleted and none
   weakened** — every invalidated pin was re-authored to pin the new truth, with
   a stronger assertion where one was dropped).
   Per-file final: classes 70 · deadcode 5 · fusion 16 · libgroups 22 ·
   offline 11 · pwa 11 · redact 10 · teacher-daygroups 26 · teacher-subjects 5
   · theme-boot 7 · time-live 6.
   Baseline per-file: classes 66 · deadcode 3 · libgroups 19 · fusion 16 ·
   offline 11 · pwa 11 · redact 10 · teacher-daygroups 26 · teacher-subjects 5
   · theme-boot 7 · time-live 6. → Deltas: **classes +4, deadcode +2,
   libgroups +3**, everything else identical.
2. `curl` from `python3 -m http.server 8175` (PID **1575809**, recorded in
   `/tmp/opencode/075-http.pid`, killed by that PID alone at the end):
   `/classes/` **200**, `/teachers/` **200**, `/emplois.csv` **200**,
   `/classes.html` **200**.
3. **Playwright — 43 checks over 3 runs** (fresh page loads, 1280×900 and
   390×780, `console`+`pageerror` listeners installed on every run):
   run 1 = 23 checks, 20 pass / 3 fail **on my own expectations** (C5/D7
   assumed the clicked row was `GLSI3D2` when it was `GLSI1A1`; E1 ran before
   a class was selected, so no teacher cells existed yet); run 2 = re-ran those
   corrected plus the teachers battery, **15/15**; run 3 = the redact markup
   probe, **5/5**. Net: **43/43 once the three wrong expectations were fixed —
   no application defect was found.**

   | requirement | evidence |
   |---|---|
   | no navigation | A1 `nav` count **0**; A2 the page's only link is `https://github.com/adem482p` (author credit); A3 no `#suggest`, no `#ghost` in the DOM |
   | no dropdown, ever | B2 after typing `GLSI`: **0** suggestion/ghost nodes; B5 after ArrowDown+Tab: **0**; D5 at 390 px: **0** |
   | filtering kept | B1 `GLSI` → **16 rows** (of 94) |
   | no text completion | B3 ArrowDown leaves `GLSI / GLSI`; B4 Tab leaves `GLSI`; input value never changes |
   | heading, desktop | C1 exactly one `#detail h2`; C2/C4 `GLSI2 A<sub>1</sub>` with **1 real `<sub>`** (clicked key `GLSI1A1`); C3 no `LCS\d-`/`LBC\d-`/`LCE\d-`/`MP\d-` prefix and length < 30 |
   | heading, narrow 390 px | D1 `#overlayName` visible; D2 carries a real `<sub>`; D3 **byte-identical** to the desktop `<h2>`; D4 is not the raw key |
   | issue 065 restore | C5 `localStorage['emplois-class'] === data-key` (`GLSI1A1`, raw, un-shortcut); C5b not the shortcut; D7 survives reload; D7b/D6 restored heading is the shortcut again (`GLSI2 A<sub>1</sub>`) at 390 px |
   | deselect / clear | D8 back arrow visible → click → `.empty-state`, overlay hidden (060/064 path intact); erase-only X untouched (074's pins still green) |
   | `?redact=1` | R1 plain view shows real names (`Bayoudhi`, `Zbidi N.`, `Sghaier S`); R2 **42/42** teacher cells (21 `td.c-teacher` + 21 `.s-teacher`) carry a `.redact` mask, 0 unmasked; R3 each mask has an inline width (`width:4.48em`) so it paints as a bar, not an invisible hole; R4 **0** teacher-name characters survive; R5 the class heading is *not* redacted (`BI2 A<sub>1</sub>`, same in the overlay); E5 065 restore still works under redact |
   | teachers autocomplete intact | F1 `/teachers/` loads with its own `#search`; F2 typing `ben` → **8** suggestion rows; F3 ghost completion `"ben Haj"`; F4 ArrowDown → exactly 1 `.active`; F5 Escape → `suggest.hidden === true`, 0 rows |
   | console | G1 (run 1) and G1 (run 2): **0 console errors, 0 page errors** |
4. **Scope:** an mtime audit of the worktree (checkout stamped every file at
   00:28) shows exactly **8** files written afterwards: `classes/index.html`,
   `js/classes.js`, `js/libgroups.js`, `test/classes.test.js`,
   `test/deadcode.test.js`, `test/libgroups.test.js`,
   `test/teacher-daygroups.test.js`, `issues/075-classes-nav-autocomplete-shortcut.md`.
   Nothing else in the tree was touched — no `data/`, `vendor/`, `assets/`,
   `emplois.csv`, `styles.css`, `README.md`, `CONTEXT.md`, `FEATURES.md`,
   `js/teachers.js`, `js/app.js`, `js/data.js`, `js/model.js`, `js/match.js`,
   `js/theme.js`, `js/color.js`, `js/register.js`, `teachers/*`, `at/`, `all/`,
   root stubs or sibling issues.

**Not done (deliberately):**

- **`styles.css` untouched** (report-only as briefed): the `#suggest`,
  `#ghost`, `--ghost-pre` and `mark` rules remain — they serve the teachers
  page, which still runs the autocomplete. They are now dead CSS *for
  /classes/* only, which is the right trade: deleting them would either break
  teachers or force a page-splitting hack in shared CSS.
- **`FEATURES.md` untouched** (report-only): its nav-bar line, the
  "offered by autocomplete" wording, the ghost/inline-completion passages, the
  classes-autocomplete paragraph and the issue-007 "first suggestion" rule now
  describe /classes/ inaccurately. They are documentation drift, not code —
  left for a docs pass rather than folded into this fix.
- **`autocomplete="off"` kept** on the classes input on purpose: it suppresses
  *browser* autofill, which is unrelated to the suggestion dropdown removed
  here, and dropping it would re-introduce browser completion UI.
- The classes app is now a **dead-end** (its only nav link was the teachers
  one). That is the reporter's explicit call for this issue; a maintainer may
  still want a link back to the root/teachers elsewhere — flagged, not decided
  here.
- Class names were **not** put under `?redact=1`: they are not personal data
  and the issue scope says the redaction path is out of scope.
- The **95 → 94** field-count correction in the description is a fact fix about
  the data, not a scope change.
- No `document.title`, service-worker cache list, manifest or CSV/parser change
  (the shortcut is display-only).

**Risks for review:**

- The shortcut is **presentation only**: it is computed at render time from the
  canonical name, so every keyed path (filter matching, `data-key`, active
  marking, the 065 stored ref, the no-match echo) still sees the raw value.
  060/064/065/074 invariants were re-pinned and are green.
- `overlayHeading` adds one `model.classWeek` lookup per overlay sync — an
  object lookup — and is wrapped in `try/catch` so a prototype-key or tampered
  stored ref degrades to showing the raw ref rather than breaking boot (the
  same posture as `restorable`, which already guards it).
- HTML safety: both shortcut parts are escaped **before** `<sub>` is appended
  (pinned in `classes.test.js`), and a name containing markup falls back to a
  fully escaped full name — a hostile `field` cannot inject HTML.
- If a future `field` ever matches the regex by accident (e.g. a track literally
  named `LCS` with a two-digit number), the heading would shorten it. The
  whole-string anchors, the known-`TRACKS` vocabulary and the `null`-fallback
  keep that safe (wrong-but-short rather than blank or broken) — the sweep over
  all 94 real values is the guard rail.
- Removing the classes `blur` handler leaves menu visibility derived from
  selection/back only; `test/teacher-daygroups.test.js` pins that the classes
  side has **no** blur handler at all, so it cannot creep back.

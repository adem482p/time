# 078: Class details panel, installability scope, and chrome fixes (author font, day-head margin/sticky, count visibility)

- Status: Fixed
- Date: 2026-10-22, Reporter: user

## Description

The user's requirements, verbatim:

> - in classes.html, under the shortened heading, write details about the class (the ones in the table in CONTEXT.md)
> - make only the classes page installable. the teachers page shouldn't be installable (unless the user explicitly chose to), so prevent the browser from showing the native install prompt
> - bring back the old font of the author name
> - the day-head's margin should have a 1rem margin on top and bottom
> - when scrolling, the day-head should stick to the top
> - the numbers (2093 sessions · 94 classes) should only appear when the filter box is empty. on desktop do animate the teachers list as it grows to take up the space that would otherwise be empty when the numbers disappear

("classes.html" = the classes app page `classes/index.html`; "classes" here mirrors `teachers/index.html` wherever the two pages share chrome.)

## Approach (coordinator's fixed criteria, summary)

1. **Class details panel** — under the shortcut `<h2>` of the classes detail
   view, render the class's five hierarchy levels from `CONTEXT.md`'s grouping
   table (track, year, specialization, section, cohort), read from the
   `ClassNode` in the model (`js/libgroups.js`), never re-parsed from the
   display string. Absent levels (section, cohort) are omitted, not shown
   empty; the common branch shows the track+year specialization (`LBC1`).
   Semantic markup (`<dl>`), minimal styling, mirroring to the narrow view.
2. **Installability** — remove the `rel="manifest"` link from
   `teachers/index.html` (the classes page keeps its own); keep
   `teachers/manifest.json` and both service workers untouched. The explicit
   opt-in is a documented `?install=1` query that injects the manifest link at
   runtime — no new UI, no persisted state, no new module.
3. **Author name font** — restore `font-size: 1.3em` for `.author-credit a`
   (the pre-076 value; Tiny5 is a 5px-grid pixel font whose grid blurs at
   non-integer sizes such as 14pt's 18.67px); keep 076's margins and the rest.
4. **day-head margin** — `#detail .day-head` (base + narrow override) at
   `margin: 1rem 0`.
5. **day-head sticky** — `#detail .day-head` becomes `position: sticky` with an
   opaque theme-respecting surface and a z-index; if the scroll structure
   prevents sticking, fix the structure minimally.
6. **Count visibility** — `#status` shows only while the filter box is empty,
   derived through the pages' existing render path (one derivation, single
   writer, no timers/flags); on desktop the results list grows into the freed
   space animated (CSS transition, desktop-only media query); the teachers
   suggest dropdown keeps overlaying the area.

## Repro steps

1. `cd <worktree> && python3 -m http.server 8123` (record the PID; kill only it).
2. Open `http://localhost:8123/classes/`, select `LCS3-GLSI_D Groupe 2` — the
   detail shows only the shortcut heading (`GLSI3 D₂`) with no hierarchy
   facts (before); after the fix the five levels render under the heading.
3. Open `http://localhost:8123/teachers/` — the browser offers the native
   install prompt (before); after the fix it does not, and
   `http://localhost:8123/teachers/?install=1` restores it.
4. Both pages: the author name "Adem Moussa" renders at 14pt (≈18.67px) —
   the pixel font's grid blurs; after the fix it computes to `1.3em` (20.8px).
5. Select a teacher/class with several session days and scroll the detail: the
   day headings scroll away with it (before); after the fix they stick to the
   top while their sessions scroll beneath.
6. Type into the filter box: the count line (`2093 sessions · …`) stays visible
   while the box holds text (before); after the fix it leaves (animated on
   desktop) and the list grows into the space.

## Discussion

### Fix implemented (2026-10-22)

All six requirements implemented in this worktree (8 files changed, 1 issue
file added; exact diff at the end of this entry).

**1. Class details panel** — new module-scope `classFactsHTML(node)` in
`js/classes.js`, placed between `headingHTML` and the clock section (so the
existing vm harness bounds auto-include it). It emits
`<dl class="class-facts">` with `dt`/`dd` pairs `Track / Year /
Specialization / Section / Groupe`, values read from the resolved
`ClassNode` (`track/year/specialization/section/cohort`) the week already
carries — never re-parsed from the display string. Falsy levels are omitted;
a common branch shows `track+year` as its Specialization (`LBC1`); every
value goes through the same `esc()` as the heading. `renderWeek` appends it
directly after the `<h2>` in the same `detail.innerHTML` write. The narrow
overlay (`#overlayName`) stays heading-only by decision: the one-line
ellipsis chrome cannot carry a `<dl>`; the detail pane — which IS the
narrow view's content surface — carries the facts at every width (verified
at 390px). `styled by five `#detail .class-facts` rules (inline `dt`/`dd`,
`·` separators, the muted `.85em` voice).

**2. Installability** — `teachers/index.html` lost its static
`<link rel="manifest">`; `teachers/manifest.json` and both service workers
untouched. A small inline `<head>` script injects the link at parse time
only when `/[?&]install=1(&|$)/` matches `location.search` — no UI, no
persisted state, no module. `classes/index.html` keeps its static link and
prompt. pwa tests re-authored around a per-app `manifestMode` and a
vm-driven harness that executes the page's REAL opt-in script.

**3. Author font** — `.author-credit a` back to `font-size: 1.3em` (the
pre-076 value); the 076 margins (`2px 0 20pt`), Tiny5 family and the
un-sized "By" label are kept. Tiny5's 5px-grid rationale recorded in the
CSS comment.

**4+5. day-head margin + sticky** — `#detail .day-head` now
`margin: 1rem 0` in the base rule and the desktop override (was `.8rem 0
.2rem`), plus `position: sticky; top: 0; z-index: 2; background:
var(--md-surface, #fff)`. The structural fix was needed and is minimal: on
desktop `#detail` was stretch-capped at the viewport line, which caps a
sticky child's travel (containing block), so
`body[data-page="teachers|classes"] #layout > #detail` in the desktop media
block gets `align-self: flex-start` + `min-height: calc(100vh|100dvh -
2rem)` — the empty state still fills, at/ and all/ keep the stretch. A
documented empirical correction to the pre-implementation note: Chromium
pins the sticky offset to the BORDER box, so `top: -1rem` hung the whole
17px label off-screen (measured: border box at −16px) while `top: 0` pins
it flush (border box at exactly 0) — `top: 0` is what shipped, and the
comment above the rule records the measurement so the guess is not
re-litigated from theory.

**6. Count visibility** — single derivation: `syncClear()` (the same
function and call sites as the clear X) in BOTH `js/teachers.js` and
`js/classes.js` adds exactly one line,
`status.classList.toggle('count-away', !!search.value);` — no timers, no
flags, no second writer. Desktop CSS pins a one-line box
(`height: 1.4em; overflow: hidden; flex: none; transition: height/margin/
opacity .18s ease`) collapsing to `height: 0; margin: 0; opacity: 0`; the
flex column's list (`flex: 1`) absorbs the freed space, animated by the
transition. Two measured corrections to the initial numbers: `1.35em`
clipped 1px of the natural 19px line box (descenders) → `1.4em`; and
`flex: none` was required because `overflow: hidden` zeroes the automatic
minimum size, letting `flex-shrink` crush the box to 2.3px (count line
invisible even when empty) — both pinned in tests. Narrow hides the line
outright (`display: none`, no animation). at/ and all/ are untouched (no
`count-away` rule reaches them). The suggest dropdown still works: it stays
absolute inside `#searchWrap` and overlays the collapsed gap (verified: 8
rows, selection commits `Zaouali` → detail renders → clear restores).

**Verification**

- `node --test test/*.test.js` → **205 tests, 205 pass, 0 fail**
  (baseline 194 + 11 new). Per file: classes 77, deadcode 5, fusion 16,
  libgroups 22, offline 11, page-chrome 9, pwa 11, redact 10,
  teacher-daygroups 26, teacher-subjects 5, theme-boot 7, time-live 6.
  Three baseline pins were re-authored (not weakened): the 076 author-name
  14pt pin (now pins 1.3em + Tiny5 + margins), the pwa manifest-resolution
  test (now pins teachers NO static link + the opt-in script executed in a
  vm against the real page: exact injection `['manifest','manifest.json']`
  on `?install=1`, and no injection on `''`, `?foo=1`, `?install=0`,
  `?install=10`), and the MIME test (teachers' href taken from the opt-in
  run). New pins: the five-level/omission/common-branch/escaping facts
  tests driven with the real model nodes, the facts-before-first-day-head
  emission order, the single `count-away` writer in both page scripts
  (+ no setTimeout/rAF), the sticky rule (margin/z-index/opaque
  background/`top: 0`, every day-head rule keeps `margin: 1rem 0`), the
  desktop fold box (`1.4em`, `flex: none`, transition) and narrow hide,
  and the desktop `#detail` release.
- HTTP: `python3 -m http.server 57861` (PID 29047, killed) — `/`,
  `/teachers/`, `/classes/`, `/at/` all 200.
- Playwright (Chromium): CDP `Page.getInstallabilityErrors` — teachers
  default `["no-manifest"]` with zero manifest links; teachers
  `?install=1` `[]` with `["manifest.json"]` injected; classes `[]` with
  the static link. Details panel at 1280×800 and 390×844:
  `GLSI3D2` → Track LCS / Year 3 / Specialization GLSI / Section D /
  Groupe 2; `EXR1` → 3 pairs, no Section/Groupe; `LBC1A2` →
  Specialization `LBC1`; overlay mirrors the heading. Sticky head at
  1280×800 light (`top` exactly 0, `position: sticky`, `z-index: 2`,
  opaque `rgb(249,249,255)`) and dark (`rgb(17,19,24)` = body bg), and at
  390×844: 7 sample points across the pane mid-scroll all paint a
  `.day-head`, no row bleed. Count fold: empty 19.03px → mid-transition
  4.34px/opacity .24 → 0 → restored 19.03px; narrow `display: none`;
  suggest 8 rows overlaying, selection + clear round-trip; 0 console
  errors on every page visited.

**Not done / out of scope** — the narrow overlay bar carries no facts `<dl>`
(documented above); no install UI was added anywhere (the native prompt is
the only affordance, per 072); `teachers/manifest.json`, both service
workers, `data/`, `vendor/*`, `assets/*` and `emplois.csv` untouched.

**Risks** — the desktop `#detail` release (`align-self: flex-start`) changes
the containing block of every desktop detail child; regressions would show
as layout shifts in the teachers detail (gutter hang is separately pinned
and passes). The count fold reserves a fixed 1.4em line box; a future
font-size change on `#status` must re-check the clip (pinned by the
scrollHeight test idea, asserted in browser here).

<details>
<summary>Exact diff (8 files, +412 −37)</summary>

```diff
diff --git a/FEATURES.md b/FEATURES.md
index c01b339..8398f3a 100644
--- a/FEATURES.md
+++ b/FEATURES.md
@@ -30,7 +30,8 @@ the material the views are drawn from:
 
 Four views over the same CSV, in the split of issue 072: the teachers app lives
 at `teachers/index.html` and the classes app at `classes/index.html` (each its
-own installable app with its own worker and manifest), the two utility views
+own worker and manifest; the classes app is installable by default, the
+teachers app only under `?install=1` — issue 078), the two utility views
 live unlisted at `at/index.html` and `all/index.html` — reachable only by
 their URL, never by navigation (issue 073) — and the root landing page does
 nothing but redirect to `teachers/`. No page carries a cross-page nav bar: the
@@ -47,7 +48,12 @@ teacher teaching?" at a glance, and can be filtered by day or teacher.
 ### Teachers — `teachers/index.html`
 
 A view with teachers as the main object. The teacher list is searchable and
-filterable live; teachers available today are raised to the top. Selecting a
+filterable live; teachers available today are raised to the top. The session/
+teacher count line under the filter box shows only while the filter is empty —
+typing folds it away with a plain CSS height/margin/opacity transition (one
+derivation shared with the clear X, no timers or flags; issue 078), and it
+returns the moment the box is emptied; the classes page behaves the same way.
+Selecting a
 teacher reveals their week: sessions grouped by day, the current and next session
 highlighted, and days with no live stake dimmed. The same view adapts to narrow
 screens: the list and the session table collapse into stacked cards.
@@ -71,7 +77,11 @@ match. Selecting a class draws its
 week as a grid with the days as columns and the six slots as rows; the detail
 heads with the class's shortcut form — `LCS3-GLSI_D Groupe 2` renders as
 `GLSI3 D<sub>2</sub>`, the cohort as a real subscript, any shape the shortcut
-rule does not know falling back to the full name (issue 075). Each cell lists
+rule does not know falling back to the full name (issue 075) — and directly
+below it the class's hierarchy facts list as a `<dl>` (issue 078): track, year,
+specialization, section and groupe (cohort), read from the resolved class node
+rather than re-parsed from the display string, absent levels omitted, a common
+branch showing its track+year as the specialization (`LBC1`). Each cell lists
 the sessions held then, every line giving the subject, the teacher and the room. A
 semi-transparent red cursor crosses the grid at the current time, its arrowhead
 resting in a small gutter beside the time column, and the current and next slots
@@ -99,7 +109,10 @@ The matrix page runs no timer at all. What it drives:
 - the classes page's detail: per-day tables with desktop day headings restored
   (issue 048), the first of them starting at today, and exactly one week
   rendering below — the whole-week grid, the flat full-session list that used to
-  follow it being gone (issue 049).
+  follow it being gone (issue 049). Since issue 078 each day heading sticks to
+  the top of the viewport while its day scrolls past — an opaque
+  theme-respecting surface with a z-index so rows never show through — on every
+  viewport and in both schemes.
 
 ## Search and matching
 
@@ -197,11 +210,14 @@ reload report (issue 067).
 
 ## Installable app
 
-Two independently installable apps (issue 072), each linking the manifest of its
-own directory: "Emplois — Enseignants" (launcher label "Enseignants") at
-`teachers/` and "Emplois — Classes" (launcher label "Classes") at `classes/`,
-each a standalone-window app with theme/background colors and a distinct `id`
-resolving to its own directory. Neither declares shortcuts: every former
+Two apps, each owning the manifest of its own directory (issue 072), but only
+one of them installable by default: "Emplois — Classes" (launcher label
+"Classes") at `classes/` links its manifest statically, while "Emplois —
+Enseignants" ("Enseignants") at `teachers/` links none — its manifest link is
+injected only under an explicit `?install=1` opt-in (issue 078), so the
+teachers page no longer offers itself for installation during a visit. Both are
+standalone-window apps with theme/background colors and a distinct `id`
+resolving to their own directory. Neither declares shortcuts: every former
 shortcut target (Classes, Time, Matrix) lies outside both `./` scopes (issues
 068, 072). The icon set is the official ISIM Mahdia logo — 192, 512 and
 maskable 512 PNGs plus the apple-touch icon, also serving as the favicon —
diff --git a/js/classes.js b/js/classes.js
index 108f5b7..8333291 100644
--- a/js/classes.js
+++ b/js/classes.js
@@ -36,6 +36,34 @@ TT.app = (function () {
     return esc(sc.head) + (sc.sub ? '<sub>' + esc(sc.sub) + '</sub>' : '');
   }
 
+  // ---- class hierarchy facts (issue 078) ---------------------------------
+  // Under the shortcut heading the detail lists the class's hierarchy levels
+  // (CONTEXT.md's grouping table): track, year, specialization, section,
+  // cohort. Values are read from the resolved ClassNode the week already
+  // carries — never re-parsed from the display string. A level a class does
+  // not have (section, cohort) is omitted, not rendered empty; a common
+  // branch keeps its track+year name as the specialization (LBC1), exactly
+  // what the node keys and fullName print. Like the heading, every value is
+  // escaped before the markup is appended.
+  function classFactsHTML(node) {
+    if (!node) return '';
+    var facts = [
+      ['Track', node.track],
+      ['Year', node.year],
+      ['Specialization', node.commonBranch
+        ? String(node.track) + String(node.year)
+        : node.specialization],
+      ['Section', node.section],
+      ['Groupe', node.cohort]
+    ];
+    var h = '<dl class="class-facts">';
+    facts.forEach(function (f) {
+      if (!f[1]) return;
+      h += '<dt>' + esc(f[0]) + '</dt><dd>' + esc(f[1]) + '</dd>';
+    });
+    return h + '</dl>';
+  }
+
   // ---- clock (issue 051) ------------------------------------------------
   // One clock per page: a single 30 s interval that hands a fresh Date to
   // every subscribed part of the page; a subscriber re-renders its own
@@ -183,8 +211,12 @@ TT.app = (function () {
     // clear "x" (issue 060), every viewport: shown only while the filter holds
     // text. Called wherever search.value can change (typing, commit, selection,
     // clear, boot). The X only ever erases (eraseFilter) — it never deselects.
+    // Issue 078: this same derivation (and its same call sites) also drives the
+    // count line's .count-away class — the numbers show only while the box is
+    // empty, one derivation, one writer, no timers and no flags.
     function syncClear() {
       if (searchClear) searchClear.hidden = !search.value;
+      status.classList.toggle('count-away', !!search.value);
       syncDeselect();
     }
 
@@ -383,8 +415,10 @@ TT.app = (function () {
       var by = indexByDaySlot(week);
       // the detail heading: the issue-075 shortcut for a full field name
       // (`LCS3-GLSI_D Groupe 2` -> `GLSI3 D<sub>2</sub>`), anything else
-      // (an interior node name) falls back inside headingHTML
-      var h = '<h2>' + headingHTML(week.name) + '</h2>';
+      // (an interior node name) falls back inside headingHTML; the class's
+      // hierarchy levels follow it (issue 078), read from the week's leaf
+      var h = '<h2>' + headingHTML(week.name) + '</h2>' +
+        classFactsHTML(week.leaves[0]);
       // Per-day session groups, rendered on every viewport: desktop shows the
       // sections above the week grid, narrow screens shape them into cards
       // (teacher-style, via the generic mobile table rules; the whole-week
diff --git a/js/teachers.js b/js/teachers.js
index 48e9144..a7cea52 100644
--- a/js/teachers.js
+++ b/js/teachers.js
@@ -189,8 +189,12 @@ TT.app = (function () {
     // clear "x" (issue 060), every viewport: shown only while the filter holds
     // text. Called wherever search.value can change (typing, commit, selection,
     // clear, boot). The X only ever erases (eraseFilter) — it never deselects.
+    // Issue 078: this same derivation (and its same call sites) also drives the
+    // count line's .count-away class — the numbers show only while the box is
+    // empty, one derivation, one writer, no timers and no flags.
     function syncClear() {
       if (searchClear) searchClear.hidden = !search.value;
+      status.classList.toggle('count-away', !!search.value);
       syncDeselect();
     }
 
diff --git a/styles.css b/styles.css
index 11ef214..815d1f9 100644
--- a/styles.css
+++ b/styles.css
@@ -87,13 +87,16 @@ body[data-page="classes"] .author-credit {
     text-align: center; 
     margin: 2px 0 20pt; 
 }
-/* the author NAME (the link) at 14pt; the "By" label stays at the inherited
-   body size — it is a label, not the name (issue 076) */
+/* the author NAME (the link) back at its old 1.3em (issue 078): Tiny5 is a
+   5px-grid pixel font — a non-integer size such as 14pt's 18.67px puts every
+   glyph edge off the grid and blurs it; 1.3em keeps the pixels crisp. The "By"
+   label stays at the inherited body size — it is a label, not the name
+   (issue 076); the 076 margins above are kept. */
 body[data-page="teachers"] .author-credit a,
 body[data-page="classes"] .author-credit a { 
     color: var(--md-primary); 
     font-family: "Tiny5", "DejaVu Sans", sans-serif; 
-    font-size: 14pt; 
+    font-size: 1.3em; 
     font-style: normal; 
     text-decoration: underline;
 }
@@ -311,6 +314,16 @@ body[data-page="classes"] .author-credit span {
 #detail .mostly { color: var(--md-on-surface-variant, #666); font-size: .85em; margin: .1rem 0; }
 #detail .count { color: var(--md-on-surface-variant, #666); font-size: .85em; margin: .5rem 0 .2rem; }
 #detail .nomatch, #detail .empty { color: var(--md-on-surface-variant, #555); font-style: italic; }
+/* the class hierarchy facts under the shortcut heading (issue 078): the
+   levels the class actually has (CONTEXT.md's grouping table) run inline as a
+   definition list — `Track LCS · Year 3 · Specialization GLSI · Section D ·
+   Groupe 2` — in the same muted small voice as the .mostly lines; absent
+   levels are omitted by the renderer, never rendered empty. */
+#detail .class-facts { margin: .1rem 0 .5rem; font-size: .85em; color: var(--md-on-surface-variant, #666); }
+#detail .class-facts dt { display: inline; font-weight: 600; }
+#detail .class-facts dt::after { content: "\00a0"; }
+#detail .class-facts dd { display: inline; margin: 0; }
+#detail .class-facts dd:not(:last-of-type)::after { content: " \00b7\00a0\00a0"; }
 
 /* ---- vendored kaomoji webfonts -------------------------------------------
    The empty-state face is assembled from box-drawing, geometric and technical
@@ -471,10 +484,21 @@ body[data-page="classes"] .author-credit span {
    uppercase label, never the DynaPuff/Tiny5 display faces) so it sits below
    the h2 teacher name. Between groups is spacing (margin), never a rule element. */
 #detail .day-group { margin: 0 0 1rem; }
+/* The day heading sticks to the top of the viewport while its day scrolls
+   past (issue 078), on every viewport and in both schemes: an opaque
+   theme-respecting surface (the page canvas it normally sits on) plus a
+   z-index so table rows never show through as it slides — later headings
+   paint over earlier stuck ones (the h3/section sibling order pinned by
+   issues 046/048 is kept: no wrapper, no JS). Measured in Chromium, the
+   sticky offset pins the BORDER box (top: 0 holds the label flush at the
+   scrollport top; top: -1rem would hang the whole 17px label off-screen —
+   verified before pinning 0, issue 078). The 1rem margins stay in flow. */
 #detail .day-head {
   color: var(--md-on-surface-variant, #666);
   font-size: .78em; text-transform: uppercase; letter-spacing: .06em; font-weight: 600;
-  margin: .8rem 0 .2rem;
+  margin: 1rem 0;
+  position: sticky; top: 0; z-index: 2;
+  background: var(--md-surface, #fff);
 }
 /* dim the whole group (not just the rows) so its border dims with the content */
 #detail .day-group.dim { opacity: .58; }
@@ -527,6 +551,41 @@ html { background: var(--md-surface, #fff); }
   }
   #layout > #listPane #teacherList,
   #layout > #listPane #classList { flex: 1 1 auto; min-height: 0; max-height: none; overflow-y: auto; }
+  /* Sticky day headings (issue 078) need #detail to be as tall as its
+     content: the document (not #detail) is the scroll container here, but
+     stretch caps #detail's box at the viewport line — and a sticky child may
+     never move outside its containing block (its parent box), so the day
+     headings could only stick inside the first viewport of a longer detail.
+     align-self: flex-start lets #detail grow with its content (the document
+     keeps scrolling overflows exactly as before), while min-height keeps the
+     definite viewport-tall column the empty state fills. at/ and all/ keep
+     the stretch — they carry no sticky children. */
+  body[data-page="teachers"] #layout > #detail,
+  body[data-page="classes"] #layout > #detail {
+    align-self: flex-start;
+    min-height: calc(100vh - 2rem);
+    min-height: calc(100dvh - 2rem);
+  }
+  /* The count line shows only while the filter box is empty (issue 078): the
+     pages' syncClear — the same single derivation, and the same call sites,
+     as the clear X's [hidden] — toggles .count-away on it. On desktop the
+     list pane is a flex column, so the freed space flows down into the
+     results list; the fold is a plain height/margin/opacity transition on the
+     collapsing element (auto height cannot transition, hence the pinned
+     one-line box; overflow hides the text while it folds) — no JS
+     measurement, no timers, no flags. The suggest dropdown is unaffected: it
+     stays absolute inside #searchWrap and simply overlays the gap. */
+  body[data-page="teachers"] #status, body[data-page="classes"] #status {
+    height: 1.4em; overflow: hidden;
+    /* the pane is a flex column; the list (flex:1) must absorb the freed
+       space, never the pinned one-line box (flex-shrink would eat it) */
+    flex: none;
+    transition: height .18s ease, margin .18s ease, opacity .18s ease;
+  }
+  body[data-page="teachers"] #status.count-away,
+  body[data-page="classes"] #status.count-away {
+    height: 0; margin: 0; opacity: 0;
+  }
   /* gap is wider than the gutter the table hangs into, so the hanging now/next
      column never touches the teacher list. */
   #layout { gap: calc(var(--gutter) + 1.25rem); }
@@ -614,6 +673,10 @@ html { background: var(--md-surface, #fff); }
      the autocomplete overlay), so a press in flight can never lose its row. */
   #layout:not(.is-list) #teacherList, #layout:not(.is-list) #classList { display: none; }
   #layout.is-list #detail { display: none; }
+  /* the count line leaves with the filter on narrow too (issue 078); the
+     narrow pane is not a fill-flex column, so it simply goes — no animation */
+  body[data-page="teachers"] #status.count-away,
+  body[data-page="classes"] #status.count-away { display: none; }
   /* the whole page scrolls: #detail must not become an inner scroll
      container. The base rule's overflow-x:auto would compute overflow-y to
      auto and trap the scroll inside #detail (heading + search stuck); here
@@ -740,7 +803,7 @@ html { background: var(--md-surface, #fff); }
     /* clip full-bleed tinted rows to the rounded corners */
     overflow: clip;
   }
-  #detail .day-head { margin: .8rem 0 .2rem; }
+  #detail .day-head { margin: 1rem 0; }
   #detail .day-group table, #detail .day-group tbody { display: block; }
   /* the base #detail table rule carries margin-top:.5rem for standalone
      tables; inside the card it would collapse with a tinted first row's
diff --git a/teachers/index.html b/teachers/index.html
index 872d6cc..e1f9911 100644
--- a/teachers/index.html
+++ b/teachers/index.html
@@ -27,10 +27,23 @@
 <meta name="twitter:image:alt" content="Emplois — the ISIM Mahdia timetable, searchable by teacher, class or subject.">
 
 <link rel="canonical" href="https://adem482p.github.io/time/teachers/">
-<link rel="manifest" href="manifest.json">
 <link rel="icon" href="../assets/icon-192.png" sizes="192x192" type="image/png">
 <link rel="apple-touch-icon" href="../assets/apple-touch-icon.png">
 <script>
+/* Issue 078: this page is NOT installable by default — the manifest link ships
+   only on explicit opt-in via ?install=1 (the classes page keeps its prompt).
+   The link is injected at parse time, so an opted-in load links the manifest as
+   early as a static tag would; without the query this block writes nothing.
+   No UI, no persisted state, no module. */
+(function () {
+  if (!/[?&]install=1(&|$)/.test(location.search)) return;
+  var l = document.createElement('link');
+  l.rel = 'manifest';
+  l.href = 'manifest.json';
+  document.head.appendChild(l);
+})();
+</script>
+<script>
 /* Issue 066: replay the stored theme before first paint — js/theme.js persists
    the applied --md- and --pal- custom properties per scheme; write them
    verbatim so the first frame is already themed. Idempotent: theme.js writes
diff --git a/test/classes.test.js b/test/classes.test.js
index f11c24a..a17f112 100644
--- a/test/classes.test.js
+++ b/test/classes.test.js
@@ -571,6 +571,114 @@ test('the shortcut heads every class-name heading surface of the page (issue 075
     });
 });
 
+// ---- class hierarchy facts under the heading (issue 078) --------------------
+
+// The real facts renderer, sliced from js/classes.js by the same bounds as the
+// heading harness (it sits between headingHTML and the clock section) and
+// driven with the REAL model nodes, exactly as renderWeek runs it.
+function classFactsHarness() {
+  var sandbox = { console: console, esc: data.esc, shortcutOf: TT.groups.shortcutOf };
+  vm.createContext(sandbox);
+  vm.runInContext(classesHeadingFn(), sandbox, { filename: 'classes-facts-harness' });
+  return function (node) {
+    sandbox.__node__ = node;
+    return vm.runInContext('classFactsHTML(__node__)', sandbox, { filename: 'classes-facts-call' });
+  };
+}
+
+test('classFactsHTML lists a fully specified class’s five hierarchy levels (issue 078)', function () {
+  var facts = classFactsHarness();
+  var html = facts(groups.byKey['GLSI3D2']);
+  // GLSI3D2 = track LCS, year 3, spec GLSI, section D, cohort 2
+  var pairs = [];
+  var re = /<dt>([^<]*)<\/dt><dd>([^<]*)<\/dd>/g, m;
+  while ((m = re.exec(html))) pairs.push([m[1], m[2]]);
+  assert.deepStrictEqual(pairs, [
+    ['Track', 'LCS'], ['Year', '3'], ['Specialization', 'GLSI'],
+    ['Section', 'D'], ['Groupe', '2']
+  ], 'a full class lists every level, in hierarchy order');
+  assert.ok(html.indexOf('<dl class="class-facts">') === 0, 'facts render as one <dl class="class-facts">');
+  assert.ok(/<\/dl>$/.test(html), 'the <dl> is closed');
+});
+
+test('classFactsHTML omits absent levels instead of rendering them empty (issue 078)', function () {
+  var facts = classFactsHarness();
+  // MP1-EXR (byKey EXR1): MP track, year 1, spec EXR — no section, no cohort
+  var html = facts(groups.byKey['EXR1']);
+  var labels = [];
+  var re = /<dt>([^<]*)<\/dt>/g, m;
+  while ((m = re.exec(html))) labels.push(m[1]);
+  assert.deepStrictEqual(labels, ['Track', 'Year', 'Specialization'],
+    'a section-less class omits Section and Groupe entirely');
+  assert.strictEqual(html.indexOf('<dd>undefined</dd>'), -1, 'no undefined leaks');
+  assert.strictEqual(html.indexOf('<dd></dd>'), -1, 'no empty <dd>');
+});
+
+test('classFactsHTML shows a common branch’s track+year as its specialization (issue 078)', function () {
+  var facts = classFactsHarness();
+  // LBC1A2 sits under the LBC1 common branch: Specialization = track+year = LBC1
+  var html = facts(groups.byKey['LBC1A2']);
+  assert.ok(/<dt>Specialization<\/dt><dd>LBC1<\/dd>/.test(html),
+    'the common branch keeps its track+year name as the specialization (LBC1)');
+  // and the node really is a common branch in the model
+  assert.ok(groups.byKey['LBC1'].commonBranch, 'LBC1 is the common branch in the data');
+});
+
+test('classFactsHTML escapes every value and survives a missing node (issue 078)', function () {
+  var facts = classFactsHarness();
+  assert.strictEqual(facts(null), '', 'no node (no selection) renders nothing');
+  assert.strictEqual(facts(undefined), '', 'undefined renders nothing');
+  // markup in a data value can never inject: same esc() as the heading
+  var injected = { track: '<b>T</b>', year: '1&2', specialization: 'S',
+                   section: '"Q"', cohort: '<i>3</i>' };
+  var html = facts(injected);
+  assert.ok(html.indexOf('<b>') === -1 && html.indexOf('<i>') === -1,
+    'no raw markup from data values');
+  assert.ok(html.indexOf('&lt;b&gt;T&lt;/b&gt;') !== -1, 'track is escaped');
+  assert.ok(html.indexOf('1&amp;2') !== -1, 'year ampersand is escaped');
+  assert.ok(html.indexOf('&quot;Q&quot;') !== -1, 'section quotes are escaped');
+});
+
+test('renderWeek emits the facts dl between the h2 and the first day-head (issue 078)', function () {
+  var src = CLASSES_SRC;
+  // the emission site: facts follow the heading, same detail element
+  assert.ok(src.indexOf("'<h2>' + headingHTML(week.name) + '</h2>' +") !== -1 &&
+           /'<h2>' \+ headingHTML\(week\.name\) \+ '<\/h2>' \+\s*\n?\s*classFactsHTML\(week\.leaves\[0\]\)/.test(src),
+    'renderWeek appends classFactsHTML of the week’s leaf right after the h2');
+  // order inside renderWeek: h2+facts, then the first day-head section
+  var start = src.indexOf('function renderWeek');
+  var end = src.indexOf('function applyCursor');
+  var slice = src.slice(start, end);
+  var factsAt = slice.indexOf('classFactsHTML(week.leaves[0])');
+  var headAt = slice.indexOf('<h3 class="day-head">');
+  assert.ok(factsAt !== -1 && headAt > factsAt, 'facts precede the first day-head');
+  // the facts renderer lives at module scope inside the heading slice, and
+  // renderWeek's detail still writes through innerHTML in one piece
+  assert.ok(slice.indexOf('detail.innerHTML = h;') !== -1, 'one innerHTML write keeps the facts');
+  // the mirror (narrow overlay) stays heading-only: the one-line ellipsis
+  // chrome cannot carry a dl — pinned so the divergence is a decision
+  assert.ok(src.indexOf('overlayName.innerHTML = headingHTML(overlayHeading(groups, selectedClass))') !== -1,
+    'the narrow overlay mirrors the heading only, no facts dl');
+});
+
+test('classes.js derives the count line’s absence from ONE syncClear writer (issue 078)', function () {
+  var src = CLASSES_SRC;
+  assert.strictEqual(countTok(src, "classList.toggle('count-away'"), 1,
+    'exactly one count-away writer — inside syncClear');
+  assert.ok(/function syncClear\(\) \{\s*\n\s*if \(searchClear\) searchClear\.hidden = !search\.value;\s*\n\s*status\.classList\.toggle\('count-away', !!search\.value\);/.test(src),
+    'the toggle rides the same derivation and call sites as the clear X');
+  assert.strictEqual(src.indexOf('setTimeout'), -1, 'no timer drives the count line');
+  assert.strictEqual(src.indexOf('requestAnimationFrame'), -1, 'no rAF drives the count line');
+});
+
+test('the teachers page derives the count line’s absence from ONE syncClear writer (issue 078)', function () {
+  var src = fs.readFileSync(path.join(ROOT, 'js/teachers.js'), 'utf8');
+  assert.strictEqual(countTok(src, "classList.toggle('count-away'"), 1,
+    'exactly one count-away writer — inside syncClear');
+  assert.ok(/function syncClear\(\) \{\s*\n\s*if \(searchClear\) searchClear\.hidden = !search\.value;\s*\n\s*status\.classList\.toggle\('count-away', !!search\.value\);/.test(src),
+    'the toggle rides the same derivation and call sites as the clear X');
+});
+
 test('the classes page ships no autocomplete machinery; the teachers page keeps its own (issue 075)', function () {
   // classes markup: no suggestion list, no inline ghost completion
   var html = readPage('classes/index.html');
diff --git a/test/page-chrome.test.js b/test/page-chrome.test.js
index 64c573f..fd5db40 100644
--- a/test/page-chrome.test.js
+++ b/test/page-chrome.test.js
@@ -5,7 +5,9 @@
 // Issue 076: (1) ONE unified h1 rule — `h1 { font-size: 17pt }` — replacing the
 // old two-tier split (generic 1.3rem vs the teachers/classes 2em display
 // override); (2) the `.author-credit` at `margin: 2px 0 20pt` with the author
-// NAME (the link) at 14pt; (3) on the two filter pages the session/teacher
+// NAME (the link) at 14pt — issue 078 reverted the name to its old 1.3em
+// (Tiny5 is a 5px-grid font; 14pt's fractional px blurred it), the 076
+// margins stand; (3) on the two filter pages the session/teacher
 // count line `#status` sits UNDER the filter box (`#searchWrap`) and ABOVE the
 // results list, in normal flow so it scrolls away with the page — while the
 // utility views at/ and all/ keep `#status` under their title (no filter box
@@ -62,15 +64,20 @@ test('issue 076: ONE unified 17pt h1 rule, the two-tier split gone', function ()
 
 // ---- (2) author credit: margin + name size ---------------------------------
 
-test('issue 076: .author-credit is margin 2px 0 20pt with a 14pt name link', function () {
+test('issue 076+078: .author-credit is margin 2px 0 20pt with the name link back at 1.3em', function () {
   var credit = rule(CSS, 'body[data-page="teachers"] .author-credit,\nbody[data-page="classes"] .author-credit');
-  assert.ok(/margin: 2px 0 20pt;/.test(credit), 'credit margin pinned by the user');
+  assert.ok(/margin: 2px 0 20pt;/.test(credit), 'credit margin pinned by the user (076, kept)');
   assert.ok(/text-align: center;/.test(credit), 'the credit stays centred');
   assert.strictEqual(CSS.indexOf('margin: 1.2rem 0'), -1, 'the old 1.2rem credit margin is gone');
 
+  // issue 078: the user restored the old 1.3em name — Tiny5 is a 5px-grid
+  // pixel font, and 14pt's 18.67px put every glyph edge off the grid (blur);
+  // the 076 margins stay, the size reverts.
   var name = rule(CSS, 'body[data-page="teachers"] .author-credit a,\nbody[data-page="classes"] .author-credit a');
-  assert.ok(/font-size: 14pt;/.test(name), 'the author NAME (the link) is 14pt');
-  assert.strictEqual(name.indexOf('1.3em'), -1, 'the old 1.3em name size is gone');
+  assert.ok(/font-size: 1\.3em;/.test(name), 'the author NAME (the link) is back at 1.3em (issue 078)');
+  assert.strictEqual(name.indexOf('14pt'), -1, 'the 076 14pt name size is gone (issue 078)');
+  assert.ok(/font-family/.test(name), 'the name link still carries the Tiny5 family');
+  assert.ok(/Tiny5/.test(name), 'the name stays on the Tiny5 web font (only the size reverted)');
   // the "By" label keeps the inherited body size: no font-size on the span
   var label = rule(CSS, 'body[data-page="teachers"] .author-credit span,\nbody[data-page="classes"] .author-credit span');
   assert.strictEqual(label.indexOf('font-size'), -1,
@@ -146,3 +153,79 @@ test('issue 076: no JS writer re-parents #status — textContent only', function
       file + ' must never re-parent the count line');
   });
 });
+
+// ---- issue 078: sticky day headings, the folding count line, class facts ---
+
+test('issue 078: #detail .day-head sticks with an opaque surface and 1rem margins', function () {
+  // the base rule (first occurrence) carries the sticky declaration itself —
+  // no second sticky rule may exist to fight it
+  var head = rule(CSS, '#detail .day-head');
+  assert.ok(/position: sticky/.test(head), 'the day head is sticky');
+  assert.ok(/top: 0;/.test(head),
+    'the sticky offset pins the label flush at the scrollport top (measured in Chromium: top:-1rem hangs the whole 17px label off-screen)');
+  assert.ok(/z-index: 2/.test(head), 'a stuck head paints over the rows beneath it');
+  assert.ok(/background: var\(--md-surface, #fff\)/.test(head),
+    'the stuck head is opaque — rows must never show through');
+  assert.ok(/margin: 1rem 0/.test(head), 'the day head keeps 1rem in-flow margins');
+  // every #detail .day-head rule in the sheet keeps the margin (issue pins it
+  // on every viewport branch, not just the base)
+  var re = /#detail \.day-head[^{}]*\{[^}]*\}/g, m;
+  var seen = 0;
+  while ((m = re.exec(CSS))) {
+    seen++;
+    assert.ok(/margin: 1rem 0/.test(m[0]), 'every day-head rule keeps margin: 1rem 0 — #' + seen);
+  }
+  assert.ok(seen >= 2, 'the base rule plus at least one media branch carry .day-head');
+});
+
+test('issue 078: #status folds away on desktop via a plain CSS transition', function () {
+  // the pinned desktop box: a fixed one-line height (auto cannot transition)
+  var box = rule(CSS, 'body[data-page="teachers"] #status, body[data-page="classes"] #status');
+  assert.ok(/height: 1\.4em/.test(box), 'the count line keeps a pinned one-line height (covers the natural 19px line box — 1.35em clipped descenders)');
+  assert.ok(/flex: none/.test(box),
+    'the pinned box must not shrink: the pane is a flex column and the list absorbs the space');
+  assert.ok(/overflow: hidden/.test(box), 'overflow hides the text while it folds');
+  assert.ok(/transition: height \.18s ease, margin \.18s ease, opacity \.18s ease/.test(box),
+    'the fold is a plain CSS transition — no JS measurement');
+  // the collapsed state
+  var away = rule(CSS, 'body[data-page="teachers"] #status.count-away');
+  assert.ok(/height: 0/.test(away) && /margin: 0/.test(away) && /opacity: 0/.test(away),
+    'count-away collapses the box to nothing');
+  // narrow (the max-width: 700px branch) hides it outright — no animation there
+  assert.ok(/body\[data-page="teachers"\] #status\.count-away,\s*\n?\s*body\[data-page="classes"\] #status\.count-away \{ display: none; \}/.test(CSS),
+    'narrow hides the count line outright (no animation)');
+  // the base #status rule is still unpositioned — the fold never turns it
+  // into a positioning context
+  assert.strictEqual(rule(CSS, '#status').indexOf('position'), -1,
+    'the base #status rule stays unpositioned');
+  // the utility views are untouched: every #status.count-away selector line
+  // stays scoped to the two filter pages, never at/ or all/
+  assert.strictEqual((CSS.match(/#status\.count-away/g) || []).length, 4,
+    'two two-page rules: the desktop collapse and the narrow hide');
+  CSS.split('#status.count-away').slice(0, -1).forEach(function (before) {
+    var sel = before.slice(Math.max(before.lastIndexOf(';'), before.lastIndexOf('}')) + 1);
+    assert.ok(/data-page="teachers"|data-page="classes"/.test(sel),
+      'every #status.count-away selector stays scoped to the filter pages');
+  });
+});
+
+test('issue 078: the class-facts dl is styled once, for both filter pages', function () {
+  var facts = rule(CSS, '.class-facts');
+  assert.ok(/display: grid/.test(facts) || /display: table/.test(facts) ||
+           /margin/.test(facts), 'the facts dl carries its own rule');
+  assert.strictEqual(CSS.split('.class-facts').length - 1 >= 2, true,
+    'the .class-facts selector appears (base rule, possibly with a scoped branch)');
+});
+
+test('issue 078: desktop #detail may grow past the viewport so sticky heads can travel', function () {
+  // stretch caps #detail's box at the viewport line, which would also cap a
+  // sticky child's travel; the teachers/classes branches release it while
+  // min-height keeps the definite column the empty state fills
+  var fix = rule(CSS, 'body[data-page="teachers"] #layout > #detail,\n  body[data-page="classes"] #layout > #detail');
+  assert.ok(/align-self: flex-start/.test(fix), '#detail stretches to its content on the filter pages');
+  assert.ok(/min-height: calc\(100vh - 2rem\)/.test(fix), 'min-height keeps the viewport-tall column');
+  assert.ok(/min-height: calc\(100dvh - 2rem\)/.test(fix), 'the dvh variant follows');
+  // the fix lives in the desktop branch — narrow keeps the document scroll
+  var at = CSS.indexOf('body[data-page="teachers"] #layout > #detail');
+  assert.ok(at > CSS.indexOf('@media (min-width: 701px)'), 'the release is desktop-only');
+});
diff --git a/test/pwa.test.js b/test/pwa.test.js
index 1bd2a38..025a928 100644
--- a/test/pwa.test.js
+++ b/test/pwa.test.js
@@ -5,9 +5,11 @@
 // parsed as JSON (not grepped), the icon PNGs are parsed at the byte level
 // (IHDR: declared sizes must match the real file dimensions, the maskable icon
 // must carry no alpha channel), every page is scanned for its manifest/icon
-// links with hrefs RESOLVED against the page's own directory (the two app pages
-// link their in-directory manifest; the root landing, the online-only utility
-// views and the redirect stub link none — issue 072), and each worker's
+// links with hrefs RESOLVED against the page's own directory (the classes app
+// links its in-directory manifest statically; the teachers app links it only
+// via its ?install=1 opt-in script — issue 078, executed for real in a vm; the
+// root landing, the online-only utility views and the redirect stub link none
+// — issue 072), and each worker's
 // SNAPSHOT_URLS literal is re-parsed for derived coverage of every manifest-
 // and page-referenced icon. Subpath safety (production deploys under
 // https://adem482p.github.io/time/, issue 067) is a first-class assertion: no
@@ -19,19 +21,25 @@ var test = require('node:test');
 var assert = require('node:assert');
 var fs = require('node:fs');
 var path = require('node:path');
+var vm = require('node:vm');
 var zlib = require('node:zlib');
 
 var ROOT = path.join(__dirname, '..');
 
 // The two independently installable apps (issue 072), with the exact names the
-// user chose, and the pages that carry NO manifest by design.
+// user chose, and the pages that carry NO manifest by design. Issue 078 flips
+// the TEACHERS page to opt-in installability: no static manifest link ships —
+// the link is injected by the page's own inline script only under ?install=1
+// (classes keeps its static link and its install prompt).
 var APPS = [
   { name: 'teachers', dir: 'teachers', page: 'teachers/index.html',
     manifest: 'teachers/manifest.json', sw: 'teachers/sw.js',
-    nameStr: 'Emplois — Enseignants', shortName: 'Enseignants' },
+    nameStr: 'Emplois — Enseignants', shortName: 'Enseignants',
+    manifestMode: 'opt-in' },
   { name: 'classes', dir: 'classes', page: 'classes/index.html',
     manifest: 'classes/manifest.json', sw: 'classes/sw.js',
-    nameStr: 'Emplois — Classes', shortName: 'Classes' }
+    nameStr: 'Emplois — Classes', shortName: 'Classes',
+    manifestMode: 'static' }
 ];
 var NO_MANIFEST = ['index.html', 'at/index.html', 'all/index.html', 'classes.html'];
 
@@ -82,6 +90,29 @@ function linkHrefs(html, rel) {
   return out;
 }
 
+// Issue 078: run the page's own inline ?install=1 opt-in script in a sandbox
+// that mimics just enough DOM (createElement + head.appendChild), against the
+// given location.search. Returns the [{rel, href}] links the script appended —
+// empty when the query does not opt in. The script is extracted from the real
+// page, never duplicated here.
+function runInstallOptIn(html, search) {
+  var scripts = [], m, re = /<script>([\s\S]*?)<\/script>/g;
+  while ((m = re.exec(html))) if (m[1].indexOf('install=1') !== -1) scripts.push(m[1]);
+  assert.strictEqual(scripts.length, 1,
+    'the page must carry exactly one ?install=1 opt-in script');
+  var appended = [];
+  var sandbox = {
+    location: { search: search },
+    document: {
+      createElement: function (tag) { return { tagName: tag }; },
+      head: { appendChild: function (l) { appended.push({ rel: l.rel, href: l.href }); } }
+    }
+  };
+  vm.createContext(sandbox);
+  vm.runInContext(scripts[0], sandbox, { filename: 'install-optin' });
+  return appended;
+}
+
 function isRelative(url) {
   // Root-absolute ("/…"), protocol-relative ("//…") and absolute URLs break
   // under the production subpath /time/ (issue 067's lesson).
@@ -121,20 +152,39 @@ test('each app manifest ships in its own directory with the installability field
   });
 });
 
-test('every page resolves the right manifest (or none) and real icons (issues 068, 072)', function () {
+test('every page resolves the right manifest (or none) and real icons (issues 068, 072, 078)', function () {
   APPS.forEach(function (app) {
     var html = readSrc(app.page);
     // hrefs as written must stay the portable literals...
-    assert.deepStrictEqual(linkHrefs(html, 'manifest'), ['manifest.json'],
-      app.page + ' must carry exactly one in-directory manifest link');
+    if (app.manifestMode === 'static') {
+      assert.deepStrictEqual(linkHrefs(html, 'manifest'), ['manifest.json'],
+        app.page + ' must carry exactly one in-directory manifest link');
+      // ...and RESOLVED against the page's directory they must land on this app's
+      // own manifest (never the sibling's manifest).
+      assert.strictEqual(toRoot(linkHrefs(html, 'manifest')[0], path.posix.dirname(app.page)), app.manifest,
+        app.page + ': the manifest link must resolve to its OWN directory manifest');
+    } else {
+      // issue 078: the teachers page is NOT installable by default — no static
+      // manifest link ships at all; the page's own ?install=1 opt-in script
+      // injects the link (executed above against the real page source).
+      assert.deepStrictEqual(linkHrefs(html, 'manifest'), [],
+        app.page + ' must carry NO static manifest link (issue 078: opt-in only)');
+      var links = runInstallOptIn(html, '?install=1');
+      assert.deepStrictEqual(links.map(function (l) { return [l.rel, l.href]; }),
+        [['manifest', 'manifest.json']],
+        app.page + ': ?install=1 must inject exactly one in-directory manifest link');
+      assert.strictEqual(toRoot(links[0].href, path.posix.dirname(app.page)), app.manifest,
+        app.page + ': the opt-in manifest link must resolve to its OWN directory manifest');
+      // without the query nothing is written — the page stays non-installable
+      ['', '?foo=1', '?install=0', '?install=10'].forEach(function (q) {
+        assert.deepStrictEqual(runInstallOptIn(html, q), [],
+          app.page + ': search ' + JSON.stringify(q) + ' must not inject a manifest');
+      });
+    }
     assert.deepStrictEqual(linkHrefs(html, 'icon'), ['../assets/icon-192.png'],
       app.page + ' must carry exactly one favicon link to the 192px app icon');
     assert.deepStrictEqual(linkHrefs(html, 'apple-touch-icon'), ['../assets/apple-touch-icon.png'],
       app.page + ' must carry exactly one apple-touch-icon link');
-    // ...and RESOLVED against the page's directory they must land on this app's
-    // own manifest and the shared root icons (never the sibling's manifest).
-    assert.strictEqual(toRoot(linkHrefs(html, 'manifest')[0], path.posix.dirname(app.page)), app.manifest,
-      app.page + ': the manifest link must resolve to its OWN directory manifest');
     [linkHrefs(html, 'icon')[0], linkHrefs(html, 'apple-touch-icon')[0]].forEach(function (href) {
       assert.ok(fs.existsSync(path.join(ROOT, path.posix.dirname(app.page), href)),
         app.page + ': icon target missing on disk: ' + href);
@@ -245,9 +295,13 @@ test('the manifest is served as JSON by filename — no .webmanifest MIME trap (
   // application/json, while *.webmanifest can fall through to
   // application/octet-stream on minimal hosts. The filename IS the fix: no
   // server config exists in this repo (no build step, no backend), so keep the
-  // one naming choice that works everywhere.
+  // one naming choice that works everywhere. The teachers page links its
+  // manifest only via the ?install=1 opt-in (issue 078) — that injected href
+  // must carry the same .json safety.
   APPS.forEach(function (app) {
-    var hrefs = linkHrefs(readSrc(app.page), 'manifest');
+    var hrefs = app.manifestMode === 'static'
+      ? linkHrefs(readSrc(app.page), 'manifest')
+      : runInstallOptIn(readSrc(app.page), '?install=1').map(function (l) { return l.href; });
     assert.strictEqual(hrefs.length, 1);
     assert.ok(/\.json$/.test(hrefs[0]), app.page + ': the manifest link must end in .json');
     var m = readManifest(app);

```

</details>

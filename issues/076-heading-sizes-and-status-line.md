# 076: Heading sizes, author credit sizing, and the session-count line under the filter box

- Status: Fixed
- Date: 2026-10-22, Reporter: user

## Description

The user's requirements, verbatim:

> - big page heading: font-size: 17pt;
> - .author-credit: margin: 2px 0 20pt;
> - author name: font-size: 14pt;
> - render the number of sessions and teachers (2093 sessions · 132 teachers) under the filter box, let this data be scrolled away when users scroll on desktop. same on mobile, just put it between the filter box and the list of results

Clarifications answered by the user since:

- **(a)** The count move applies to **both filter pages** — `teachers/index.html`
  (`2093 sessions · 132 teachers`) and `classes/index.html` (`2093 sessions · 94
  classes`); `at/` and `all/` have no filter box and keep their `#status` where
  it is.
- **(b)** The 17pt h1 applies to **every page's h1, unified** — one rule
  replacing today's two-tier split (`h1 { font-size: 1.3rem }` generic vs
  `body[data-page=teachers/classes] h1 { font-size: 2em }`).

Observed (before this fix):

- `styles.css` carries two h1 font sizes: the generic `h1 { font-size: 1.3rem }`
  and a teachers/classes display override `font-size: 2em; margin: .8rem 0
  .6rem` — three different heading sizes across the four pages (2em = 32px on
  teachers/classes, 1.3rem ≈ 20.8px on at/all).
- `.author-credit` (teachers + classes only) sits at `margin: 1.2rem 0` and its
  name link at `font-size: 1.3em`.
- `#status` (the `Loading emplois.csv…` → `2093 sessions · 132 teachers` line)
  sits **above** the filter box on both filter pages — between the author credit
  and `#searchWrap` — while the user wants the count rendered *under* the filter
  box, above the results list, in normal flow so it scrolls away with the page.

Expected:

- One unified `h1 { font-size: 17pt }` rule on every page (~22.7px at the
  default root — a deliberate shrink of the big display titles, intended).
- `.author-credit` margin `2px 0 20pt`; the author name (the `<a>`) at `14pt`.
- On `teachers/` and `classes/`, `<p id="status">` moved in the DOM to sit below
  `#searchWrap` and above the results list (`#teacherList` / `#classList`) —
  same element, same text writers, purely a position change. `at/` and `all/`
  keep `#status` where it is.

## Root cause

No defect in logic — a design change. The relevant facts found in the tree:

- `styles.css:72` generic `h1 { font-size: 1.3rem; margin: .6rem 0 .2rem; }`;
  `styles.css:81-82` the teachers/classes display override (`2em`, bigger
  margins).
- `styles.css:83-100` the `.author-credit` blocks, scoped to
  `body[data-page=teachers/classes]` (only those two pages carry the class;
  `at/`, `all/` and the root stub have no `.author-credit`).
- `#status` is a static `<p>` in normal flow on all four pages; no rule pins it
  (no position/sticky/fixed anywhere for it), and every JS writer
  (`js/teachers.js`, `js/classes.js`, `js/app.js`) only sets `textContent` —
  never its position. So the count move is markup-only: relocate the `<p>` in
  `teachers/index.html` and `classes/index.html`; no JS change is needed.
- On `teachers/index.html` the autocomplete dropdown `#suggest` lives **inside**
  `#searchWrap` and is `position: absolute; top: 100%; z-index: 10` — after the
  move an open dropdown overlays the count line instead of pushing it, which is
  the desired behaviour.

## Repro steps

1. `cd <repo> && python3 -m http.server 8765`
2. Open `http://localhost:8765/teachers/` and `http://localhost:8765/classes/`
   at 1280×800: the count line currently renders **above** the filter box, the
   h1 is 32px (2em), and the author credit hugs with `1.2rem` margins.
3. Open `http://localhost:8765/at/` and `http://localhost:8765/all/`: the h1 is
   1.3rem — a different size again.
4. After the fix: every h1 computes to 17pt; the credit reads `2px 0 20pt` with
   a 14pt name; on teachers/classes the count line sits below the filter box
   and above the list, and scrolls away with the page on desktop.

## Discussion

### Fix implemented (2026-10-22)

Layout decisions (the judgement calls the brief left to the implementer):

- **Unified h1 margins**: the one rule is
  `h1 { font-size: 17pt; margin: .6rem 0 .2rem; }` — the *generic* margins
  win, and the teachers/classes override's larger margins (`.8rem 0 .6rem`)
  are dropped with the 2em title they existed to balance. At 17pt (≈22.67px)
  the generic rhythm is right, and the user-pinned `2px` top margin on
  `.author-credit` signals the credit should hug the title: measured gap
  h1→credit is 5.19px on desktop (flex, margins add) and 3.19px on mobile
  (block, margins collapse) — verified in the screenshots, reads as intended.
- **"By" label size**: the user pinned "author name" — the `<a>` ("Adem
  Moussa") — at 14pt; the `<span>By </span>` label keeps the inherited body
  size (16px). The label carries no `font-size` (pinned in the new test).
- **No spacing adjustment was needed for `#status`** after the move: on
  desktop (flex column) the gap searchWrap→count is 12.8px + 3.2px = 16px and
  count→list 9.6px; on mobile (block flow, collapsing margins) 12.8px and
  9.6px. Its existing alignment/color/font-size rules were kept verbatim.
- **`#suggest` stays inside `#searchWrap`** (teachers): it is
  `position: absolute; top: 100%; z-index: 10`, so the open dropdown overlays
  the moved count line (measured: suggest spans y 162.6→437.1 over the count
  line at y 179.6→198.6) instead of pushing it — no markup/CSS change needed
  for the dropdown.
- **at/ and all/ need no markup change**: their h1 change is pure CSS (both
  compute to 22.6667px = 17pt) and their `#status` stays directly under the
  title (measured: h1 bottom 56.59 → status top 59.78 on desktop).

Exact diff:

```diff
--- a/styles.css
+++ b/styles.css
@@ -69,7 +69,11 @@
 nav a { margin-right: 1rem; color: var(--md-primary, #0b4da2); }
 /* keep the top-right theme square clear of the nav links */
 nav { padding-right: 2.4rem; }
-h1 { font-size: 1.3rem; margin: .6rem 0 .2rem; }
+/* the one h1 rule for every page (issue 076): 17pt display headings, unified —
+   the former two-tier split (generic 1.3rem vs the teachers/classes 2em
+   display override) is gone, and so are the override's larger margins, which
+   existed only to balance the 32px title. */
+h1 { font-size: 17pt; margin: .6rem 0 .2rem; }
 #status { color: var(--md-on-surface-variant, #555); font-size: .85em; margin: .2rem 0 .6rem; }
-/* teachers + classes pages: centre the title and the session/teacher count line under it */
+/* teachers + classes pages: centre the title and the session/teacher count line */
 body[data-page="teachers"] h1,
 body[data-page="teachers"] #status,
 body[data-page="classes"] h1,
 body[data-page="classes"] #status { text-align: center; }
-/* the teachers + classes titles read as display text: bigger than the generic h1 chrome
-   (2em = twice the 16px body size) and given room above the credit line */
-body[data-page="teachers"] h1,
-body[data-page="classes"] h1 { font-size: 2em; margin: .8rem 0 .6rem; }
+/* the author credit (teachers + classes only) hugs the title above it (2px) and
+   leaves room before the filter box below (20pt); issue 076 pins both margins */
 body[data-page="teachers"] .author-credit,
 body[data-page="classes"] .author-credit { 
     text-align: center; 
-    margin: 1.2rem 0; 
+    margin: 2px 0 20pt; 
 }
+/* the author NAME (the link) at 14pt; the "By" label stays at the inherited
+   body size — it is a label, not the name (issue 076) */
 body[data-page="teachers"] .author-credit a,
 body[data-page="classes"] .author-credit a { 
     color: var(--md-primary); 
     font-family: "Tiny5", "DejaVu Sans", sans-serif; 
-    font-size: 1.3em; 
+    font-size: 14pt; 
     font-style: normal; 
     text-decoration: underline;
 }
--- a/teachers/index.html
+++ b/teachers/index.html
@@ -55,8 +55,7 @@
     <button type="button" id="themeCycle" title="Cycle color preset" aria-label="Cycle color preset"></button>
     <h1>Find Teachers</h1>
-    <p id="status">Loading emplois.csv…</p>
     <p class="author-credit"><span>By </span><a href="https://github.com/adem482p" target="_blank" rel="noopener">Adem Moussa</a></p>
     <div id="searchWrap">
@@ -78,6 +77,7 @@
       </div>
       <ul id="suggest" hidden></ul>
     </div>
+    <p id="status">Loading emplois.csv…</p>
     <ul id="teacherList"></ul>
--- a/classes/index.html
+++ b/classes/index.html
@@ -55,8 +55,7 @@
     <button type="button" id="themeCycle" title="Cycle color preset" aria-label="Cycle color preset"></button>
     <h1>Find Classes</h1>
-    <p id="status">Loading emplois.csv…</p>
     <p class="author-credit"><span>By </span><a href="https://github.com/adem482p" target="_blank" rel="noopener">Adem Moussa</a></p>
     <div id="searchWrap">
@@ -75,6 +74,7 @@
         <svg class="overlay-drop" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
       </div>
     </div>
+    <p id="status">Loading emplois.csv…</p>
     <ul id="classList"></ul>
```

Test files (not part of the site diff):

- `test/page-chrome.test.js` — **new**, 5 tests pinning issue 076: the single
  17pt h1 rule (and that `font-size: 1.3rem` / `font-size: 2em` / any
  page-scoped h1 font-size are gone); `.author-credit` at `2px 0 20pt` with the
  name link at 14pt and the "By" span carrying no font-size; `#status` directly
  between the `</div>` of `#searchWrap` and the list `<ul>` on both filter
  pages (and out of the header block), `#status`'s rule carrying no
  `position`; `at/` and `all/` keeping `#status` under the title with no
  `#searchWrap`; and no JS writer re-parenting `#status` (textContent only).
- `test/classes.test.js` — one stale comment re-authored ("right after the
  status line" → "under the title") and its existence pin strengthened to the
  position pin `</h1>\n    <p class="author-credit">`. No pin weakened.

Verification:

- `node --test test/*.test.js` → **194 pass / 0 fail** (baseline on main was
  189/0; +5 new). Per file: classes 70, deadcode 5, fusion 16, libgroups 22,
  offline 11, page-chrome 5, pwa 11, **redact 10 (untouched)**,
  teacher-daygroups 26, teacher-subjects 5, theme-boot 7, time-live 6.
- `python3 -m http.server 8765` (PID 1581177, killed after the run): teachers/
  classes/ at/ all/ all → HTTP 200.
- Playwright, all four pages at 1280×800 and 390×844:
  - h1 computes to **22.6667px = 17pt** on every page and viewport;
  - `.author-credit` resolves `margin-top: 2px; margin-bottom: 26.6667px`
    (= 20pt), name link **18.6667px = 14pt**, on both pages/viewport;
  - teachers + classes desktop rect ordering:
    `#searchWrap.bottom 163.61 → #status.top 179.59 → #status.bottom 198.59 →
    list.top 208.19` — count under the filter box, above the list;
  - scrolls away on desktop: with a teacher selected the document is 1337px
    tall; after `scrollTo(0, bottom)` (scrollY 537) the count line's rect top
    moves 179.59 → **-357.41** (fully off-screen), computed position `static`;
  - mobile 390×844 with the list open: `wrap.bottom 145.61 → status 158.41–177.41
    → list.top 187` on both pages — between filter box and results;
  - teachers suggest dropdown: typing `abe` opens 8 suggestions at
    top 162.61 (overlaying the count line, `position: absolute; z-index: 10`),
    selecting the first commits the teacher (`overlayName: Abdelhafidh`,
    detail rendered, count line unchanged);
  - **0 console errors / 0 page errors** on every page and viewport.

Stale doc passages for the docs sibling: **none in `FEATURES.md`** — it
describes neither heading sizes, the author credit, nor the count line's
position, so this change stales nothing there. (Pre-existing, unrelated
staleness noticed in passing: `FEATURES.md:37-38` still says "Only the classes
app carries the cross-page nav bar (Teachers / Classes)" — issue 075 removed
that nav; belongs to the docs sibling's 075 pass, not to this fix.)

Changed files: `styles.css`, `teachers/index.html`, `classes/index.html`,
`test/page-chrome.test.js` (new), `test/classes.test.js` (comment + stronger
pin), this issue file. `at/index.html` and `all/index.html` were **not**
touched (pure-CSS change), `js/*` untouched, `test/redact.test.js` untouched.
Status stays `Open` until the coordinator merges.

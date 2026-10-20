# 061: Redacted screenshots of the UIs and color schemes for the README

- Status: Fixed
- Date: 2026-10-20, Reporter: user

## Description

Expected (user request, verbatim):

> Capture Screenshots on different UIs and different color schemes and present them on the readme. don't include teacher names in the captures, have the ui render rectangles in the place of names, the background of the rectangle is the text foreground.

Observed (all verified live in Chromium via Playwright against a local
`python3 -m http.server`, and against the source, on 2026-10-20):

1. **README has no screenshots.** `README.md` is 13 lines of plain prose
   (structure below); `assets/` holds only the OG-card image `preview.png`
   (1200×630) and `preview.svg`.
2. **Teacher names render as plain text at 9 visible sites** across the four
   pages (inventory below). Nothing in the codebase renders a placeholder or
   rectangle in place of a name; grep for `redact|location|URLSearchParams`
   in `js/` finds **no matches** — there is no redaction mode and no URL-param
   mechanism of any kind today.
3. **The color-theme machinery exists and is capturable**, but the site has
   15 named presets + light/dark from `prefers-color-scheme` and no way to
   force a scheme by URL; captures must drive `localStorage`/media emulation
   (scheme inventory below).

### Teacher-name render-site inventory (page × site × code)

Visible = leaks into a screenshot. Attribute = present in DOM only (screenshots
can't leak it, but a redaction mechanism may still want it gone).

| # | Page | Site | File:line (verified) | How the name flows | Visible? |
|---|------|------|----------------------|--------------------|----------|
| 1 | index (teachers) | List rows (`#teacherList li`) — name text + `(count)` + subject/class sub-lines | `js/teachers.js:261-283` (`renderItem`); name at `:267` via `match.highlightHTML(r.teacher, …)`; sub-lines `:271-276` | `match.highlightHTML` → `TT.data.esc` (`js/match.js:170-177`) | **visible**; `li.dataset.name` attribute at `js/teachers.js:266` |
| 2 | index | `#overlayName` — the name shown in the search box in the selected-teacher state | `js/teachers.js:194-197` (`syncOverlay`, `overlayName.textContent = selectedTeacher` at `:196`); element `index.html:52` | plain `textContent` (no esc) | **visible on mobile ≤700px** when a teacher is selected; hidden on desktop by CSS armour `#searchOverlay { display: none; }` (`styles.css:130`) |
| 3 | index | Detail heading `<h2>` | `js/teachers.js:363` (`'<h2>' + esc(name) + '</h2>'`) | direct `esc` | **visible** |
| 4 | index | Suggest rows (`#suggest li`, kind `teacher`) | `js/teachers.js:436-456`; teacher kind at `:443-445` (`match.highlightHTML(r.label, …)` + `(count)`) | `highlightHTML` → `esc` | **visible** while typing (verified: typing "barb" renders "teacherBarboura (18)…") |
| 5 | index | Ghost completion (`#ghostPre/#ghostTyped/#ghostRest`) — faint completion of the typed name | `js/teachers.js:466-487` (`renderGhost`; `sh.rest` at `:473`); completion source `js/match.js:577-594` (`shadowText`) | plain `textContent` | **visible** while typing (verified: "barb" → ghost "barboura", rest color `--md-on-surface-variant`); `#ghost` is `aria-hidden` (`index.html:40`) but **not** visually hidden |
| 6 | index | Search input value + no-match line `No match for "X"` | input `index.html:41`; nomatch at `js/teachers.js:533` (`esc(q)`) | user-typed query text | visible only if the capture types a teacher name — a trap for state captures, not a render site |
| 7 | classes | Day-group session tables, `td.c-teacher` cells | `js/classes.js:321-336` (`sessionRow`), name at `:332` (`esc(s.professor ‖ '—')`); table header `<th>Teacher</th>` at `:349-350` (static label) | direct `esc` | **visible** (verified: GLSI3D1 detail has 22 such cells, first "Abbassi") |
| 8 | classes | Whole-week grid cells, `span.s-teacher` | `js/classes.js:380-386`, name at `:383` (`esc(s.professor ‖ '—')`) | direct `esc` | **visible on desktop** (verified: 22 `.s-teacher` spans); display:none ≤700px (`#detail .weekwrap { display: none; }` pinned in `styles.css`, see tests) |
| 9 | time | Slot detail table, `Teacher` column | `js/app.js:154-174` (`show`); name at `:168` (`esc(s.professor ‖ '—')`); header at `:166` | direct `esc` | **visible** once a slot is clicked (verified: "Omezzine …"); the slot list itself carries **no names** (`js/app.js:91-105`: slot text + NOW/NEXT only; bucket headers `:128`: day + count) |
| 10 | timetable (matrix) | Row axis, first sticky `<td>` per teacher | `js/app.js:193-214` (`render`); name at `:200` (`esc(n)`); header `Teacher` at `:196` (static) | direct `esc` | **visible** (verified: 132 teacher rows, first axis cell "Abbassi"); matrix cells contain room/day/subject only (`:206-209`) — no names |

Non-leaking surfaces verified: `#status` lines on all pages are counts only
(`js/teachers.js:173`, `js/classes.js:109`, `js/app.js:179`, `js/app.js:191`);
`<title>`/og/meta on all four HTML files contain no names; the
`#themeCycle` tooltip is `Theme: <preset> — click to change`
(`js/theme.js:934-938`); kaomoji empty states ("No Teacher Selected" + face,
`js/teachers.js:108-115`, `js/classes.js:236-240`) contain no names and are
unaffected by redaction; classes-page list/suggest/ghost/overlay carry class
names only (`js/match.js:550-552` filters `kind === 'class'`, comment
`js/classes.js:544`).

### Name-leakage traps

- **Subjects and rooms are clean** (verified): 2,093 CSV rows, 176 unique
  subject strings, 132 professors; an accent-normalized substring test of every
  professor token (≥4 chars) against every subject and room yielded **0 hits**.
  Class names/pills are not teacher names. (Re-verify after data updates.)
- **Ghost completion** (#5) renders the *faint remainder of a teacher name*
  while typing — it must be redacted or suppressed in redaction mode, otherwise
  a search-state capture leaks.
- **The typed query itself** (input value, and the `No match for "…"` line)
  contains whatever the capturer typed — capture states must either avoid
  typing names or rely on redaction of the input/ghost.
- **DOM attributes**: `li.dataset.name` (`js/teachers.js:266`, read at `:420-423`)
  and `data-day`/`data-slot`/`data-key` elsewhere. Not visible in pixels.
- **Transparent text is still text** (screenshot-safe, source-visible):
  `#ghostTyped` is `color: transparent` (`styles.css:106`) — the same
  technique could size a rectangle, but the strictest reading of the request
  ("render rectangles in the place of names") is to not emit the name at all.
- Mobile card labels `content: "Teacher: "` (`styles.css:629,637`) are static
  text, not names — keep them (tests pin them, see below).

### Color-scheme inventory (how to force them for captures)

- Engine: `js/theme.js` (Material-3 HCT port). The switcher is the single
  `#themeCycle` button on all four pages (`index.html:35`, `classes.html:36`,
  `time.html:11`, `timetable.html:11`); it cycles the preset list.
- **15 named presets** (`js/theme.js:691-707`): Monochrome, ISIM Blue
  (default, `:690,962-964`), Indigo, Green, Ember, Teal, Tachiyomi Blue,
  Minus Purple, Minus Pink, Strawberry, Green Apple, Minus Orange, Minus Cyan,
  Minus Yellow, Neutral Blue. A 16th **"System"** preset is prepended when a
  platform accent is detectable (`js/theme.js:858-866`); on this site it
  always resolves to `#0b4da2` from the author `<meta name="theme-color">`
  (`index.html:8`, detected live via `TT.theme.detectSystemSeed()`).
- **Application**: no body class / data-theme. Roles are written as CSS custom
  properties `--md-*` on `<html>` (`js/theme.js:769-792`) plus the `color-scheme`
  property. Every text color in `styles.css` reads `var(--md-…)` with fallbacks
  (e.g. `styles.css:27,33,106-108,157,179,209`) — so a `background: currentColor`
  rectangle automatically inherits "the text foreground" and follows both the
  preset and the light/dark scheme, including state colors (now/next rows
  swap foregrounds, `styles.css:326-327`).
- **Light/dark** comes from `prefers-color-scheme` only (no in-site toggle):
  `js/theme.js:799-806`, re-applied on system change `:966-972`. Fresh-visitor
  default is light unless the OS asks for dark.
- **Persistence**: `localStorage['emplois-theme'] = {"preset":"<name>"}`
  (`js/theme.js:749,886-903`). Verified live: setting it and reloading forces
  the preset (Monochrome → `--md-primary #C6C6C6`, surface `#131313`; dark
  ISIM Blue → surface `#111318`; Minus Pink dark → verified capture).
- **Deterministic capture recipe (verified)**: `page.emulateMedia({colorScheme})`
  for light/dark + `localStorage.setItem('emplois-theme',
  JSON.stringify({preset:'…'}))` then reload. There is **no URL param** for the
  scheme today; runtime `TT.theme.apply({primary, dark:true, …})` also works
  (`js/theme.js:982-1009`) but a later button press/system event re-applies
  state, so the localStorage route is the stable one.
- **Clock caveat**: NOW/NEXT markers and today's bucket follow the real clock
  (`js/teachers.js:37-55`, `js/app.js:37-55`, issue 051) — captures made at
  different times differ; the kaomoji face is random per load
  (`js/teachers.js:103-107`).

### Redaction-mechanism surface (for the Maintainer)

- **Choke points**: teacher-name text reaches the DOM via three paths:
  (a) direct `esc(name)` — 5 sites (`js/teachers.js:363`, `js/classes.js:332`,
  `js/classes.js:383`, `js/app.js:168`, `js/app.js:200`);
  (b) `match.highlightHTML(name, ranges)` — 2 sites (`js/teachers.js:267`,
  `js/teachers.js:444`), but the same helper also renders subject/class labels
  (`js/teachers.js:271-276`, `:441-447`) so hooking it globally would redact
  subjects too — the hook must be call-site- or kind-aware;
  (c) plain `textContent` assignments — 2 sites (`js/teachers.js:196` overlay,
  `:471-473` ghost). A single name-helper (e.g. `TT.data.name()` returning a
  rectangle span when redaction is on) plus a DOM-side twin for the
  textContent sites covers all 10 sites; `TT.data.esc` itself
  (`js/data.js:88-92`) must stay a pure escaper (tests pin its behavior).
- **Trigger**: a URL param (`?redact=1`) read once at boot fits — no
  `location`/`URLSearchParams` code exists anywhere in `js/` today (grep-verified),
  so the convention would be new. Rectangle styling: an `inline-block` span
  sized to the name length with `background: currentColor` and transparent/no
  text — it inherits the scheme via the context's `--md-*` foreground, per the
  user's "background of the rectangle is the text foreground".
- **vm-sandbox test traps** (see pin inventory): any redaction code placed
  *inside* the sliced regions runs in sandboxes **without `window`,
  `location`, or `TT`** — guards must be `typeof`-safe and helpers must live
  inside the slice or be passed in via the sandbox's provided names (`esc`,
  `model`, `color`, …).

### Capture-matrix inputs (raw inventory, not the decision)

- **Viewports that matter**: desktop 1280×800; mobile 390×844. The responsive
  breakpoint is 700px (`styles.css:392` `@media (min-width: 701px)`,
  `styles.css:486` and `:750` `@media (max-width: 700px)`); ≤700px the
  teachers/classes pages become single-pane state machines (`is-list` class,
  `js/teachers.js:180-184`), the classes week grid is replaced by day cards,
  and the `#overlayName` box appears (only page chrome difference: `classes.html:33`
  carries the site `<nav>`; index/time/timetable have none).
- **Meaningful states per page (all verified live)**:
  - index: empty state (list + kaomoji), list + click-through detail (h2 +
    day-group tables + subject/class breakdown), suggest+ghost open while
    typing; mobile: list state, teacher state (overlay + detail).
  - classes: class list (with alias sub-lines), class detail (day cards +
    WHOLE WEEK grid on desktop).
  - time: slot list, slot detail (Teacher/Room/Subject/Students table).
  - timetable: full matrix (133 rows incl. header; sticky first column).
- **Suggested minimum set (Maintainer decides final)**: teachers desktop
  list+detail in light ISIM Blue; same detail in dark; teachers mobile
  state-teacher (shows the redaction in the overlay); classes desktop week
  grid; time slot detail; matrix — 6 shots across 2 schemes; optionally one
  Monochrome shot to show a third scheme.

### README and assets

- `README.md` (13 lines): H1 "Teacher Time" intro (lines 1-4), H1 "# Data
  Pipeline" (6-9), H1 "# Disclaimer" (11-13). No images anywhere. A
  "# Screenshots" section fits naturally between the intro and Data Pipeline
  (or before Disclaimer); images referenced relatively (`assets/…png`).
- `assets/` exists with `preview.png` (1200×630 OG image, 130 KB) and
  `preview.svg` — a natural home for the new captures (naming left to the
  Maintainer/Implementer).

### Pinned tests (what a redaction hook could disturb)

Baseline re-verified today:
`node --test test/classes.test.js test/libgroups.test.js test/fusion.test.js test/deadcode.test.js test/teacher-daygroups.test.js test/teacher-subjects.test.js test/time-live.test.js`
→ **129 tests, 129 pass, 0 fail**. (The directory form `node --test test/`
fails; files must be listed.)

Pins on the surfaces above:

- **Sliced-source pins** — edits must keep exact markers/order:
  - `test/teacher-daygroups.test.js:46-58` slices `js/teachers.js` between
    `function breakdownHTML(t)` and `function markActive(name)` and *executes*
    `showTeacher` in a sandbox with only `model, color, esc, modelObjs, store,
    detail, markActive, layout, syncClear, renderSuggest, renderGhost, Date`
    (`:71-92`) — no `window`/`location`/`TT`. Pins on the slice content at
    `:123-153` (`<section class="day-group`, `<h3 class="day-head">`,
    `<table class="t-sessions">`, exact header row, no `<hr`, no `c-day`,
    `liveDays`/`color.sessionRow(`/`NEXT_ARROW` tokens, `breakdownHTML(t)`).
  - `test/teacher-daygroups.test.js:529` pins `commit` internals of teachers.js.
  - `test/time-live.test.js:46-58` slices `js/app.js`
    `initTimePage→initTimetablePage→boot` and runs it with a sandbox lacking
    `window`/`location` (`:144-156`); shared-head pin `:184-189`; head-slice
    token pins (`// ---- clock (issue 051)`, `setInterval(tick, 30000)`…).
  - `test/time-live.test.js:60-67` + `test/teacher-daygroups.test.js` clock
    block: the `// ---- clock (issue 051)` … next-`// ----` block must stay
    contiguous in all of `js/app.js`, `js/classes.js`, `js/teachers.js`.
  - `test/deadcode.test.js:20-28`: `js/match.js` must not contain
    `parseExactQuery`/`exactQuery`; **`js/app.js` must not contain
    `buildIndex`** — a redaction helper's name/comments must avoid these tokens.
  - `test/classes.test.js:534,571-665,862-914`: pins on `js/classes.js`
    internals — `'detail.innerHTML = h;'` (once), `c-all` absent, liveDays
    before first day-head, session-row helper between them, week-grid marker
    strings.
- **HTML pins**: `classes.html` must keep the script stack, kaomoji vendor,
  author-credit, and element ids incl. `themeCycle`/`overlayName`
  (`test/classes.test.js:426-454`); `index.html` must keep
  `searchBack`/`searchOverlay`/`overlayClear`/`overlayName` ids and no
  `searchDone` (`test/teacher-daygroups.test.js:536-541`); adding a
  `<script>` or element to these pages needs the pin lists updated (or choose
  markers they don't scan).
- **CSS pins**: exact strings `#detail td.c-teacher { order: 4; }`,
  `td.c-teacher::before`, `content: "Teacher: ";`, `#detail .weekwrap {
  display: none; }`, `#detail .week-head { display: none; }`, `#search {
  padding-right: 2.7rem; }`, `td.c-cell.today` before `td.c-cell.now`,
  `#detail table.t-sessions` **absent**, `c-all` **absent**,
  `#searchWrap:focus-within #searchBack` **absent** —
  (`test/teacher-daygroups.test.js:302-348,412-421,542-565`,
  `test/classes.test.js:463-479,637-667,1056-1085`); the `#detail .day-head`
  block is sliced to its first `}` (`test/teacher-daygroups.test.js:305-306`).
  New redaction CSS appended elsewhere in `styles.css` is safe from these.
- **Behavioral pins using real names**: `Barboura`/`Dlima` fixtures
  (`test/teacher-daygroups.test.js:268-298`), `Barboura` fusion counts
  (`test/fusion.test.js:63,236-251`), `data.esc` exact output + no
  double-escape (`test/fusion.test.js:277-278`). These run against default
  (unredacted) render paths — a URL-param-gated mode leaves them untouched;
  a default-on mode would break them.

## Root cause

What stands in the way, rather than a single bug:

1. **No redaction mode exists.** Teacher names are interpolated straight into
   HTML/text at 10 render sites (inventory above) through three different
   mechanisms (`esc`, `highlightHTML`, `textContent`); there is no
   name-placeholder rendering, no rectangle vocabulary in `styles.css`, and no
   flag/URL-param mechanism anywhere in `js/` to turn one on.
2. **No capture artifacts or README section.** The README has no Screenshots
   section and `assets/` holds only the OG preview; nothing documents or
   scripts the scheme-forcing (`localStorage` + `prefers-color-scheme`) needed
   for deterministic multi-scheme captures.

## Repro steps

1. `cd /home/user/.local/share/opencode/worktree/1de5bb/061-redact-screenshots`
2. `python3 -m http.server 8611` and open `http://localhost:8611/`.
3. Observe: the teacher list renders names as text (first row `Abbassi (26)`);
   click a row — the detail `<h2>` shows the name; at a ≤700px viewport with a
   teacher selected, `#overlayName` shows the name in the search box.
4. Type `barb` in the search box — the suggest rows show full teacher names and
   the faint ghost completes the name after the caret.
5. Open `classes.html`, pick a class — `td.c-teacher` cells (day cards) and
   `span.s-teacher` spans (week grid) show teacher names. Open `time.html`,
   click any slot — the detail table's Teacher column shows names. Open
   `timetable.html` — the first column lists all 132 teacher names.
6. Try to view screenshots in `README.md`: there are none.
7. Try to force a color scheme by URL: no parameter exists; the only route is
   clicking `#themeCycle` (15 presets + System) or setting
   `localStorage['emplois-theme']` / emulating `prefers-color-scheme`.
8. Baseline: `node --test test/classes.test.js test/libgroups.test.js
   test/fusion.test.js test/deadcode.test.js test/teacher-daygroups.test.js
   test/teacher-subjects.test.js test/time-live.test.js` → 129/129 pass.

## Discussion

### Maintainer decision (2026-10-20)

**Verdict**: valid, in scope, ready for implementation as specified below. The
user wants README screenshots across UIs and color schemes with teacher names
replaced by rectangles filled with the text foreground. The Reporter's
inventory (3 render mechanisms across 4 pages, 15 presets + System, no URL-param
machinery anywhere) is confirmed against the source; the design below adds one
redaction mode at the data layer, keeps default rendering byte-identical, and
makes 7 committed captures.

**Architectural direction**

*Redaction mode — one flag, read once, at the bottom layer.*

- Trigger: `?redact=1` URL param, parsed once at boot inside `js/data.js`.
  Rejected alternatives: (a) **localStorage flag** — persists invisibly,
  contaminates later visits and other captures, needs an extra reset step per
  capture; (b) **body/html class set per page** — 4 wirings of the same parse,
  and no page owns the boot order; (c) **runtime `TT.theme.apply`-style hook** —
  redaction is not a theme concern and must not ride the theme state machine
  (a preset cycle would drop it). The URL param is shareable ("open any page
  with `?redact=1`"), self-cleaning, and orthogonal to the theme machinery that
  issues 059 owns.
- The flag lives in `js/data.js` (Layer 1), next to `esc` — the "single HTML
  escaper" from issue 008 gains a sibling: the single *name renderer*. Every
  page already loads `js/data.js` first, and every page file already does
  `var esc = TT.data.esc;`, so the aliases `var nameHTML = TT.data.nameHTML;`
  / `var redacted = TT.data.redacted;` land in the same idiom. Rejected:
  per-page helper copies (4 flag parses, drift risk) and putting the helper in
  `js/model.js` (model/fusion layer; the escaper's home is data.js and that is
  where a contributor looks when rendering a value).
- The parse must be `typeof location !== 'undefined'`-guarded: the sliced-source
  vm harnesses (teacher-daygroups, classes, time-live) execute real page code in
  sandboxes with no `location`/`window`/`TT`; the guard makes the mode simply
  *off* there, and `setRedact(true)` exists only so node tests can flip it.
- Choke points, per the Reporter's 3 mechanisms:
  1. **`TT.data.nameHTML(name, alt)`** — returns exactly `esc(name)` when
     redaction is off (default: byte-identical output, all 129 pins pass
     untouched), a rectangle when on; `alt` (the `'—'` placeholder call sites
     pass) is never redacted — it is not a name. Used at the 5 plain-`esc`
     sites: teachers detail `<h2>` (`js/teachers.js:363`), classes `td.c-teacher`
     (`js/classes.js:332`), classes `span.s-teacher` (`js/classes.js:383`),
     time detail Teacher column (`js/app.js:168`), matrix sticky axis
     (`js/app.js:200`).
  2. **`TT.match.nameHTML(name, ranges)`** — the redaction-aware twin of
     `highlightHTML` for the 2 teacher-label sites (list rows
     `js/teachers.js:267`, suggest teacher kind `js/teachers.js:444`):
     `TT.data.redacted()` ? rectangle : `highlightHTML(name, ranges)`. Hooking
     `highlightHTML` itself is rejected — it also renders subject/class labels,
     which must keep their highlights. Both entry points being redaction-aware
     means there is no redaction-*free* name path left except raw `esc`, which
     the negative-token pins below forbid on professor tokens.
  3. **The two `textContent` sites**: the mobile `#overlayName`
     (`js/teachers.js:196`) gains an explicit `if (redacted()) …innerHTML =
     nameHTML(…) else …textContent = selectedTeacher` branch (default path
     unchanged); the **ghost completion** (`js/teachers.js:466-487`) is
     *suppressed* under redaction — one guard `var row = redacted() ? null :
     suggestRows[suggestIdx];` funnels into the existing hidden path. Rejected:
     redacting `sh.rest` with a rectangle (the ghost is a caret-aligned
     overlay with pixel-offset machinery — complexity for a state we do not
     even capture) and leaving it on (it renders the faint remainder of a
     teacher name — the Reporter's leakage trap).
  4. **Typed query + `No match for "X"`** (`js/teachers.js:533`) are out of
     redaction scope by design: the input shows *user-typed* text, not a
     rendered name, and redacting it would break caret/ghost math. Mitigation
     is procedural: no capture state types anything (see matrix).
  5. `li.dataset.name` (`js/teachers.js:266`) stays: it is invisible in
     pixels, and dropping it would break `markActive`'s active-row highlight in
     redaction mode. Same for `data-day`/`data-slot`/`data-key`.
- Containment against future forgetfulness: `test/redact.test.js` carries
  negative-token pins encoding the Reporter's site inventory — `js/classes.js`
  and `js/app.js` may not contain `esc(s.professor`, `js/app.js` may not
  contain `'<td>' + esc(n)`, `js/teachers.js` may not contain
  `highlightHTML(r.teacher` or `'<h2>' + esc(name)` — so a new raw-esc name
  site fails CI-style exactly like `deadcode.test.js` does today.

*The rectangle (per the user: "the background … is the text foreground").*

- Emitted by `js/data.js` as
  `<span class="redact" aria-hidden="true" style="width:NN.NNem"></span>` —
  empty (no name text ever enters the DOM), width proportional to the name
  length: `Math.max(3, name.length) * 0.56` em, so rows keep a readable
  rhythm and short names still read as a bar.
- Styled by one block appended to the end of `styles.css` (the CSS pins slice
  earlier blocks; appended text is safe):
  `.redact { display: inline-block; height: 0.78em; border-radius: 0.18em;
  vertical-align: -0.08em; background: currentColor; }`.
- `background: currentColor` is exactly "the text foreground": every text
  color in `styles.css` reads `var(--md-…)` (Reporter-verified), so the bar
  automatically follows all 15 presets × light/dark, including state colors
  (now/next rows, active suggest). No per-theme or per-preset code exists or
  is needed.

*Capture matrix — final set: 7 PNGs.*

All shots: `?redact=1`, clock fixed via `page.clock.install` *before
navigation* to **Wed 2026-10-14 10:05** (in-worktree fixture date; NOW/NEXT
and today=MERCREDI become deterministic; the kaomoji face stays random —
accepted, non-data pixels), viewport screenshot (`fullPage: false`,
scale css, PNG), active element blurred, `localStorage['emplois-theme']`
set explicitly before each navigation:

| # | URL | Viewport | Scheme (emulateMedia × localStorage preset) | State | File |
|---|-----|----------|----------------------------------------------|-------|------|
| 1 | `index.html?redact=1` | 1280×800 | light × ISIM Blue | boot list (rows = rects + counts) | `assets/screens/teachers-list-light.png` |
| 2 | `index.html?redact=1` | 1280×800 | light × ISIM Blue | first row clicked → detail (`<h2>` rect + day tables) | `assets/screens/teachers-detail-light.png` |
| 3 | `index.html?redact=1` | 1280×800 | dark × ISIM Blue | same detail, dark | `assets/screens/teachers-detail-dark.png` |
| 4 | `index.html?redact=1` | 390×844 | light × ISIM Blue | row clicked → mobile teacher state (`#overlayName` rect + cards) | `assets/screens/teachers-mobile-light.png` |
| 5 | `classes.html?redact=1` | 1280×800 | light × ISIM Blue | first class clicked → day groups + WHOLE WEEK grid (`c-teacher` + `s-teacher` rects) | `assets/screens/classes-week-light.png` |
| 6 | `time.html?redact=1` | 1280×800 | dark × ISIM Blue | click MERCREDI 10h00-11h30 → detail table (Teacher column rects) | `assets/screens/time-detail-dark.png` |
| 7 | `timetable.html?redact=1` | 1280×800 | light × Monochrome | full matrix (sticky axis = rects; Monochrome proves a third preset) | `assets/screens/matrix-mono-light.png` |

Coverage rationale: desktop+mobile × light+dark × 2 presets (default ISIM
Blue + Monochrome) × every page × every state that shows names (list, detail,
mobile overlay, week grid, slot detail, matrix). Excluded: suggest/ghost
typing states (the typed-query trap — nothing typed is captured at all),
mobile dark and a third preset (diminishing returns, README bloat; ~7
1280×800 PNGs ≈ well under 1.5 MB total).

*Script or one-off: one-off.* No `package.json`/npm deps exist in the repo
(verified) — a committed `data/capture.mjs` requiring a `playwright` npm
package would be dead weight that cannot even run in this environment (the
Playwright MCP browser is the guaranteed tool). The repo philosophy is "no
build step"; `preview.png` was likewise a one-off artifact. The repeatable
part is the *mechanism* (`?redact=1` + the localStorage/emulateMedia/clock
recipe), which is (a) discoverable from the `js/data.js` comment, and
(b) documented verbatim in this issue's `Fix implemented` entry as the
re-capture recipe. Do not add a capture script, package.json, or any
dependency.

*README layout.* New H1 section `# Screenshots` (matching the README's H1-every
section style) inserted between the intro (line 4) and `# Data Pipeline`
(line 6): one intro sentence explaining the rectangles + `?redact=1`, then the
7 images in matrix order, each preceded by a one-line plain-prose caption
where the state is not obvious from its neighbors. Alt texts describe
page/state/scheme only (e.g. "Teachers list — desktop, ISIM Blue light") —
never a name.

*Tests.* One new file `test/redact.test.js`, **10 tests** → expected total
**129 + 10 = 139** (run line gains `test/redact.test.js`; the directory form
still fails, files stay listed). The 5 sandbox provider lines below add no
tests. What tests do NOT cover: visual fidelity of the rectangle and the PNG
contents (binaries) — pixels are only guaranteed by the capture-time no-leak
assertion; re-capture is manual per the documented recipe. Exact test list:

1. `js/data.js` wiring: source contains the `typeof location` guard, the
   `redact=1` parse, `setRedact` (token pins).
2. `nameHTML('Barboura')` (real CSV — assert the store knows the name)
   equals `data.esc('Barboura')` exactly, with no `<span`, when redaction is
   off.
3. `setRedact(true)`: `nameHTML('Barboura')` returns a `class="redact"` span
   with an `…em` width and contains no `Barboura`; `setRedact(false)` restores
   test 2's exact output.
4. `nameHTML('', '—')` returns `esc('—')` in both modes (placeholder is not a
   name).
5. `match.nameHTML` with ranges: default output identical to
   `match.highlightHTML` (`<mark>` present); redacted → rectangle, no
   `<mark>`, no name.
6. Site-inventory pins: the negative tokens listed above + positive
   `nameHTML(` present in each of `js/teachers.js`, `js/classes.js`,
   `js/app.js`.
7. Ghost suppression: the `renderGhost` slice (`function renderGhost()` →
   `function acceptSuggest`) contains the `redacted()` guard.
8. CSS: `.redact` block in `styles.css` pins `background: currentColor` and
   `display: inline-block`.
9. README: every `](assets/…)` image link resolves to an existing file.
10. README: every image has non-empty alt text and no alt contains any
    professor token ≥4 chars (accent-normalized, against the real CSV —
    reusing the Reporter's methodology).

**Acceptance criteria (blind Implementer)**

1. `js/data.js`: after the existing `esc` function, add the redaction block —
   `var redactOn = typeof location !== 'undefined' && /(?:\?|&)redact=1(?:&|$)/.test(location.search);`,
   `function redacted() { return redactOn; }`,
   `function setRedact(on) { redactOn = !!on; }  // tests/harnesses only`,
   `function redactHTML(name) { var w = Math.max(3, String(name).length) * 0.56; return '<span class="redact" aria-hidden="true" style="width:' + w.toFixed(2) + 'em"></span>'; }`,
   `function nameHTML(name, alt) { if (!name) return esc(alt || ''); return redactOn ? redactHTML(name) : esc(name); }`,
   with a comment naming issue 061 and the `background: currentColor`
   rationale; export `redacted, setRedact, nameHTML` from `TT.data`
   (`redactHTML` stays internal). Keep the file's "No DOM access here" claim
   true — everything above is pure string work.
2. `js/match.js`: next to `highlightHTML`, add
   `function nameHTML(s, ranges) { if (TT.data.redacted()) return TT.data.nameHTML(s); return highlightHTML(s, ranges); }`
   with a comment: the redaction-aware name highlight; `highlightHTML` stays
   the generic label renderer. Export it from `TT.match`. Avoid the deadcode
   tokens (`parseExactQuery`, `exactQuery`, `buildIndex`).
3. Page aliases: in `js/teachers.js` after `var esc = TT.data.esc;` (line 13)
   add `var nameHTML = TT.data.nameHTML;` and `var redacted = TT.data.redacted;`;
   in `js/classes.js` and `js/app.js` after their line-13 `esc` alias add
   `var nameHTML = TT.data.nameHTML;` only. Do not reorder or reformat the
   heads (app.js's clock-head tokens are pinned; issue 059 touches HTML heads
   and theme.js — touch neither).
4. Convert exactly the 10 render sites, nothing nearby:
   `js/teachers.js:196` overlay (explicit `redacted()`/`textContent` branch as
   specified above); `:267` `match.highlightHTML(r.teacher, r.nameRanges)` →
   `match.nameHTML(r.teacher, r.nameRanges)`; `:363` `esc(name)` →
   `nameHTML(name)` in the `<h2>`; `:444` suggest teacher kind
   `match.highlightHTML(r.label, r.ranges)` → `match.nameHTML(r.label, r.ranges)`
   (the class/subject branches at `:441`, `:447`, `:271-276` stay
   `highlightHTML`); `renderGhost` first line gains the `redacted() ? null :`
   guard; `js/classes.js:332` and `:383` `esc(s.professor || '—')` →
   `nameHTML(s.professor, '—')`; `js/app.js:168` `esc(s.professor || '—')` →
   `nameHTML(s.professor, '—')`; `js/app.js:200` `esc(n)` → `nameHTML(n)`.
   Search logic, commit/blur/arrow semantics, `dataset.name`, counts,
   `No match`, and the input value are untouched. Keep each hunk minimal
   (issues 059/060 run in parallel and touch neighbouring machinery — no
   reformatting, no comment rewrites outside the added lines).
5. `styles.css`: append the `.redact` block (specified above) at end of file.
6. Sandbox provider lines (no other test edits, no count changes):
   `test/teacher-daygroups.test.js` sandbox at ~line 77 and the live sandbox
   at ~line 627 add `nameHTML: data.nameHTML,`; `test/classes.test.js`
   sandboxes at ~line 694 and ~line 947 add the same; `test/time-live.test.js`
   sandbox at ~line 146 adds the same. The pre-existing Barboura/Dlima and
   structural pins must pass unmodified.
7. Add `test/redact.test.js` with exactly the 10 tests enumerated above.
   Verify: `node --test test/classes.test.js test/libgroups.test.js
   test/fusion.test.js test/deadcode.test.js test/teacher-daygroups.test.js
   test/teacher-subjects.test.js test/time-live.test.js test/redact.test.js`
   → **139/139**. Also `curl -s -o /dev/null -w '%{http_code}'` each of the
   four pages plus `index.html?redact=1` → 200 from a local
   `python3 -m http.server` (kill it by PID afterwards — never `pkill -f`).
8. Capture the 7 PNGs per the matrix (exact URLs/viewports/schemes/states;
   clock installed before navigation; theme localStorage set per shot).
   **No-leak verification, mandatory per shot, immediately before its
   screenshot with no intervening state change**: (a)
   `document.querySelectorAll('.redact').length >= 1`, and (b) no professor
   name (≥4 chars, accent-normalized, from `emplois.csv`) occurs in
   `document.body.innerText`. Record the two numbers per shot in the
   `Fix implemented` entry — this DOM assertion, made on the same page state,
   is the proof that no committed PNG contains a name; there is no OCR step.
   Assert shot 4's overlay rect specifically (its `.redact` lives in
   `#overlayName`).
9. Commit binaries only at `assets/screens/teachers-list-light.png`,
   `teachers-detail-light.png`, `teachers-detail-dark.png`,
   `teachers-mobile-light.png`, `classes-week-light.png`,
   `time-detail-dark.png`, `matrix-mono-light.png`. `assets/preview.png` /
   `preview.svg` untouched.
10. `README.md` diff: insert `# Screenshots` + intro sentence + 7 images with
    captions between line 4 and `# Data Pipeline`, exactly the file names of
    criterion 9, alt texts as specified (no names). No other README change.
11. In the `Fix implemented` entry, document the re-capture recipe (clock
    stamp, per-shot localStorage preset, emulateMedia, viewport, interaction,
    no-leak assertion) — this replaces a committed capture script.
12. Diff hygiene: the full file list is `js/data.js`, `js/match.js`,
    `js/teachers.js`, `js/classes.js`, `js/app.js`, `styles.css`,
    `README.md`, `test/redact.test.js` (new), `test/teacher-daygroups.test.js`,
    `test/classes.test.js`, `test/time-live.test.js` (provider lines only),
    `issues/061-redacted-readme-screenshots.md` (discussion entries), plus the
    7 PNGs. No-gos: no changes to `emplois.csv`, `data/pdfs/`, `data/extract.py`,
    the four HTML files, `js/theme.js`, `js/model.js`; no new dependencies,
    no `package.json`, no capture script; no teacher name in any committed
    PNG; default (no-param) rendering must stay byte-identical.

**Risks / constraints**

- *Containment is social + pinned, not enforced*: a future contributor can
  still call raw `esc` for a name; the negative-token pins make it fail loudly
  instead of silently leaking — keep them in sync with any new render site.
- *em-width geometry is approximate*: similar-length names look similar by
  design (privacy over vanity); do not "improve" it with DOM measurement —
  determinism beats fidelity.
- *Merge conflicts*: issues 059 (HTML heads, theme.js) and 060 (search/X
  machinery, i.e. teachers.js suggest/commit neighbourhood and possibly
  match.js) run in parallel worktrees. Keep hunks small and line-local; 061
  must not alter search behaviour — only the teacher-label expression inside
  `renderItem`/`renderSuggest`.
- *Sandbox drift*: any future test that executes a redacted site in a vm
  sandbox must add `nameHTML: data.nameHTML` to its provided names, exactly
  like `esc` today; criterion 6 covers all five current harnesses.
- *Pixel determinism*: fixed clock + fixed viewports make re-captures stable
  on one machine; fonts differ across machines, so a re-capture elsewhere will
  shift pixels (never names). The random kaomoji face in shot 1 is accepted.
- *Theme persistence in the capture browser*: localStorage survives
  navigations — every shot sets its preset explicitly before loading, and the
  no-leak/no-name assertion is per shot, so a missed preset degrades a color,
  never privacy.


### Fix implemented (2026-10-20)

Implemented per the decision above: the `?redact=1` mode parsed once in
`js/data.js` behind the `typeof location` guard, both redaction-aware entry
points (`TT.data.nameHTML`, `TT.match.nameHTML`), the ten render-site
conversions, the appended `.redact` CSS, the five sandbox provider lines,
`test/redact.test.js` (exactly the 10 enumerated tests), the README section,
and the 7 committed captures — each preceded by the mandatory no-leak
assertion, recorded below.

**Changed files**: `js/data.js`, `js/match.js`, `js/teachers.js`,
`js/classes.js`, `js/app.js`, `styles.css`, `README.md`,
`test/redact.test.js` (new), `test/teacher-daygroups.test.js`,
`test/classes.test.js`, `test/time-live.test.js` (provider lines only),
this issue's `Discussion` (this entry), plus the 7 PNGs listed after the diff.

**Exact unified diff.** The "old" sides were reconstructed by reverse-applying
each edit to the working file (every reverse replacement matched exactly once
or the reconstruction aborted) and the reconstruction reproduces the
pre-change **129/129/0** test run — the correctness check for the old sides:

```diff
--- a/js/data.js
+++ b/js/data.js
@@ -91,9 +91,22 @@
     });
   }
 
+  // Redaction mode (issue 061): `?redact=1` swaps every rendered teacher name
+  // for an empty rectangle filled with `background: currentColor` — the text
+  // foreground — so README captures show the UI without any name in the DOM
+  // while the bar still follows all 15 presets × light/dark. Parsed once at
+  // boot; the `typeof location` guard keeps the mode off in vm test sandboxes
+  // (no `location`) and `setRedact` lets node tests flip it. Pure string work
+  // — no DOM access here.
+  var redactOn = typeof location !== 'undefined' && /(?:\?|&)redact=1(?:&|$)/.test(location.search);
+  function redacted() { return redactOn; }
+  function setRedact(on) { redactOn = !!on; }  // tests/harnesses only
+  function redactHTML(name) { var w = Math.max(3, String(name).length) * 0.56; return '<span class="redact" aria-hidden="true" style="width:' + w.toFixed(2) + 'em"></span>'; }
+  function nameHTML(name, alt) { if (!name) return esc(alt || ''); return redactOn ? redactHTML(name) : esc(name); }
+
   return {
     DAYS: DAYS, SLOTS: SLOTS, HOURS_PER_SESSION: HOURS_PER_SESSION,
     parseCSV: parseCSV, createStore: createStore, loadStore: loadStore,
-    esc: esc
+    esc: esc, redacted: redacted, setRedact: setRedact, nameHTML: nameHTML
   };
 })();
--- a/js/match.js
+++ b/js/match.js
@@ -177,6 +177,11 @@
     return h + TT.data.esc(s.slice(pos));
   }
 
+  // The redaction-aware name highlight (issue 061): renders a rectangle instead
+  // of the teacher name when redaction is on; otherwise the regular highlight.
+  // highlightHTML stays the generic label renderer (subjects, classes keep marks).
+  function nameHTML(s, ranges) { if (TT.data.redacted()) return TT.data.nameHTML(s); return highlightHTML(s, ranges); }
+
   // ---- live search ----------------------------------------------------------
 
   // Match one teacher against the query. Every whitespace-separated token
@@ -597,7 +602,7 @@
   return {
     buildIndex: buildIndex, resolveClass: resolveClass,
     mergeRanges: mergeRanges, tokenScore: tokenScore, fuzzyRanges: fuzzyRanges,
-    highlightHTML: highlightHTML, liveSearch: liveSearch, suggest: suggest,
+    highlightHTML: highlightHTML, nameHTML: nameHTML, liveSearch: liveSearch, suggest: suggest,
     shadowText: shadowText,
     parseQuery: parseQuery, searchSections: searchSections,
     completionContext: completionContext, classSearch: classSearch
--- a/js/teachers.js
+++ b/js/teachers.js
@@ -11,6 +11,8 @@
   var color = TT.color;
   var C = color.CLASSES;
   var esc = TT.data.esc;
+  var nameHTML = TT.data.nameHTML;
+  var redacted = TT.data.redacted;
 
   // Mobile gate (issue 007): coarse pointers (touch/soft keyboard) have no
   // Escape key to opt out of the pre-focused first suggestion, so Enter must
@@ -193,7 +195,10 @@
     // teacher is selected AND the menu is closed (issue 056).
     function syncOverlay() {
       searchOverlay.hidden = selectedTeacher === null || menuOpen;
-      if (selectedTeacher !== null) overlayName.textContent = selectedTeacher;
+      if (selectedTeacher !== null) {
+        if (redacted()) overlayName.innerHTML = nameHTML(selectedTeacher);
+        else overlayName.textContent = selectedTeacher;
+      }
     }
 
     // menu edges: the list is open or not — blur writes neither fact
@@ -264,7 +269,7 @@
       cls.push(r.exact ? C.exact : C.partial);
       li.className = cls.join(' ');
       li.dataset.name = r.teacher;
-      var h = match.highlightHTML(r.teacher, r.nameRanges) +
+      var h = match.nameHTML(r.teacher, r.nameRanges) +
         ' <span class="n">(' + store.sessionsOf(r.teacher).length + ')</span>';
       if (r.relevantSessions > 0)
         h += ' <span class="n">(' + model.hoursLabel(r.relevantSessions) + ' relevant)</span>';
@@ -360,7 +365,7 @@
       }
       var ss = model.fuseSessions(store.sessionsOf(name), modelObjs.groups);
       var now2 = tickNow || new Date();
-      var h = '<h2>' + esc(name) + '</h2>' +
+      var h = '<h2>' + nameHTML(name) + '</h2>' +
         '<p class="mostly">Mostly teaches ' +
         esc(t.topSubject ? t.topSubject.name : '—') + '</p>' +
         '<p class="mostly">Mostly teaches ' +
@@ -441,7 +446,7 @@
           body = match.highlightHTML(r.label, r.ranges) +
             (r.detail ? ' <span class="alias">— ' + esc(r.detail) + '</span>' : '');
         } else if (r.kind === 'teacher') {
-          body = match.highlightHTML(r.label, r.ranges) +
+          body = match.nameHTML(r.label, r.ranges) +
             ' <span class="n">(' + store.sessionsOf(r.label).length + ')</span>';
         } else {
           body = match.highlightHTML(r.label, r.ranges);
@@ -464,7 +469,9 @@
     }
 
     function renderGhost() {
-      var row = suggestRows[suggestIdx];
+      // No ghost under redaction (issue 061): the faint completion would leak
+      // the rest of a teacher name, so the guard funnels into the hidden path.
+      var row = redacted() ? null : suggestRows[suggestIdx];
       var sh = row ? match.shadowText(search.value, row) : null;
       if (sh) {
         ghost.hidden = false;
--- a/js/classes.js
+++ b/js/classes.js
@@ -11,6 +11,7 @@
   var color = TT.color;
   var C = color.CLASSES;
   var esc = TT.data.esc;
+  var nameHTML = TT.data.nameHTML;
 
   // Mobile gate (issue 007): coarse pointers (touch/soft keyboard) have no
   // Escape key to opt out of the pre-focused first suggestion, so Enter must
@@ -329,7 +330,7 @@
           (isNow ? '<span class="nowtag">● NOW</span>' : '') +
           (isNext ? '<span class="nexttag">' + NEXT_ARROW + 'NEXT</span>' : '') +
           '</td><td class="c-time">' + esc(s.time) +
-          '</td><td class="c-teacher">' + esc(s.professor || '—') +
+          '</td><td class="c-teacher">' + nameHTML(s.professor, '—') +
           '</td><td class="c-subject">' + esc(s.subject) +
           '</td><td class="c-room">' + esc(s.room || '—') +
           '</td></tr>';
@@ -380,7 +381,7 @@
           sessions.forEach(function (s) {
             h += '<div class="sess">' +
               '<span class="s-subject">' + esc(s.subject) + '</span>' +
-              '<span class="s-teacher">' + esc(s.professor || '—') + '</span>' +
+              '<span class="s-teacher">' + nameHTML(s.professor, '—') + '</span>' +
               '<span class="s-room">' + esc(s.room || '—') + '</span>' +
               '</div>';
           });
--- a/js/app.js
+++ b/js/app.js
@@ -11,6 +11,7 @@
   var color = TT.color;
   var C = color.CLASSES;
   var esc = TT.data.esc;
+  var nameHTML = TT.data.nameHTML;
 
   // Mobile gate (issue 007): coarse pointers (touch/soft keyboard) have no
   // Escape key to opt out of the pre-focused first suggestion, so Enter must
@@ -165,7 +166,7 @@
       var fused = model.fuseSessions(rows, modelObjs.groups);
       var h = '<table><tr><th>Teacher</th><th>Room</th><th>Subject</th><th>Students</th></tr>';
       fused.forEach(function (s) {
-        h += '<tr><td>' + esc(s.professor || '—') + '</td><td>' + esc(s.room || '—') +
+        h += '<tr><td>' + nameHTML(s.professor, '—') + '</td><td>' + esc(s.room || '—') +
           '</td><td>' + esc(s.subject) + '</td><td>' +
           s.pills.map(function (p) { return '<span class="pill">' + esc(p) + '</span>'; }).join(' ') +
           '</td></tr>';
@@ -197,7 +198,7 @@
         store.slots.map(function (s) { return '<th>' + esc(s) + '</th>'; }).join('') + '</tr>';
       store.teachers.forEach(function (n) {
         if (q && n.toLowerCase().indexOf(q) === -1) return;
-        h += '<tr><td>' + esc(n) + '</td>';
+        h += '<tr><td>' + nameHTML(n) + '</td>';
         store.slots.forEach(function (slot) {
           var ss = store.sessionsOf(n).filter(function (s) {
             return s.time === slot && (!day || s.day === day);
--- a/styles.css
+++ b/styles.css
@@ -765,3 +765,15 @@
   #classList li:last-child { border-bottom: 0; }
 }
 
+
+/* ---- redaction rectangles (issue 061) ----
+   Rendered in place of teacher names when the page is opened with ?redact=1.
+   background: currentColor makes the bar "the text foreground" — it follows
+   every --md-* preset and the light/dark scheme with no per-theme code. */
+.redact {
+  display: inline-block;
+  height: 0.78em;
+  border-radius: 0.18em;
+  vertical-align: -0.08em;
+  background: currentColor;
+}
--- a/README.md
+++ b/README.md
@@ -3,6 +3,38 @@
 See the complete timetable of any teacher, find teachers by name, subjects they teach and their classes of students.
 Data is scraped from student timetables on the official university website.
 
+# Screenshots
+
+Opening any page with `?redact=1` renders every teacher name as a rectangle filled with the text foreground, so the UI can be shown without any name in it; the captures below use that mode across pages, viewports and color schemes.
+
+The teachers page on desktop: each list row shows a rectangle and a session count instead of the name.
+
+![Teachers list — desktop, ISIM Blue light](assets/screens/teachers-list-light.png)
+
+A teacher's detail view on desktop: rectangle heading above the day-group tables.
+
+![Teachers detail — desktop, ISIM Blue light](assets/screens/teachers-detail-light.png)
+
+The same detail view in dark mode — the rectangles pick up the dark foreground color.
+
+![Teachers detail — desktop, ISIM Blue dark](assets/screens/teachers-detail-dark.png)
+
+The teachers page on a phone-sized viewport: the selected-teacher search overlay shows a rectangle.
+
+![Teachers page — mobile, ISIM Blue light](assets/screens/teachers-mobile-light.png)
+
+The classes page detail: day-group tables and the whole-week grid, teacher cells redacted.
+
+![Classes detail — desktop, ISIM Blue light](assets/screens/classes-week-light.png)
+
+The time page's slot detail table with the Teacher column rendered as rectangles.
+
+![Time slot detail — desktop, ISIM Blue dark](assets/screens/time-detail-dark.png)
+
+The full timetable matrix in the Monochrome preset: the sticky first column is all rectangles.
+
+![Timetable matrix — desktop, Monochrome light](assets/screens/matrix-mono-light.png)
+
 # Data Pipeline
 
 raw timetable PDFs -> Python parser + scraper -> .csv source of truth
--- a/test/teacher-daygroups.test.js
+++ b/test/teacher-daygroups.test.js
@@ -74,7 +74,7 @@
   var detail = { innerHTML: '' };
   var sandbox = {
     console: console,
-    model: model, color: color, esc: data.esc,
+    model: model, color: color, esc: data.esc, nameHTML: data.nameHTML,
     modelObjs: modelObjs, store: store,
     detail: detail,
     markActive: function () {},
@@ -624,7 +624,7 @@
   var layout = { classList: { remove: function () { counts.layout++; } } };
   var sandbox = {
     console: console,
-    model: model, color: color, esc: data.esc,
+    model: model, color: color, esc: data.esc, nameHTML: data.nameHTML,
     modelObjs: modelObjs, store: store,
     detail: detail,
     markActive: function () {},
--- a/test/classes.test.js
+++ b/test/classes.test.js
@@ -691,7 +691,7 @@
   var cursor = model.dayCursor(now, store.slots);
   var sandbox = {
     console: console,
-    model: model, color: color, esc: data.esc,
+    model: model, color: color, esc: data.esc, nameHTML: data.nameHTML,
     week: week, cursor: cursor, now: now
   };
   vm.createContext(sandbox);
@@ -945,6 +945,7 @@
   var sandbox = {
     console: console,
     model: model, color: color, C: color.CLASSES, esc: data.esc,
+    nameHTML: data.nameHTML,
     store: store,
     week: model.classWeek(groups, 'GLSI3D1'),
     detail: detail,
--- a/test/time-live.test.js
+++ b/test/time-live.test.js
@@ -144,6 +144,7 @@
   var sandbox = {
     console: console,
     model: model, color: color, C: color.CLASSES, esc: data.esc,
+    nameHTML: data.nameHTML,
     store: store, modelObjs: modelObjs,
     document: {
       createElement: function () { return makeEl(offsets); },
--- /dev/null
+++ b/test/redact.test.js
@@ -0,0 +1,217 @@
+// Tests for the redaction mode (issue 061) — run with the other suites:
+// `node --test test/classes.test.js … test/redact.test.js` (the directory form
+// `node --test test/` still fails; files stay listed).
+//
+// `?redact=1` swaps every rendered teacher name for an empty rectangle filled
+// with the text foreground (`background: currentColor`). These tests pin the
+// boot wiring, both redaction-aware entry points, the site inventory (negative
+// tokens so a future raw-esc name site fails loudly, like deadcode.test.js),
+// the ghost suppression, the appended CSS block, and the README captures.
+
+'use strict';
+
+var test = require('node:test');
+var assert = require('node:assert');
+var fs = require('node:fs');
+var path = require('node:path');
+var vm = require('node:vm');
+
+var ROOT = path.join(__dirname, '..');
+var CSV_PATH = path.join(ROOT, 'emplois.csv');
+
+function readSrc(rel) {
+  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
+}
+
+// Load the browser script stack (data, libgroups, model, match) into one shared
+// TT context, exactly like the pages' <script> tags do. The context has no
+// `location`, so js/data.js's boot parse leaves redaction off (issue 061's
+// typeof-guard contract) and setRedact flips it for a test body only.
+function loadStack() {
+  var ctx = { console: console };
+  vm.createContext(ctx);
+  ['js/data.js', 'js/libgroups.js', 'js/model.js', 'js/match.js'].forEach(function (f) {
+    vm.runInContext(readSrc(f), ctx, { filename: f });
+  });
+  return ctx.TT;
+}
+
+var TT = loadStack();
+var data = TT.data;
+var match = TT.match;
+var store = data.createStore(fs.readFileSync(CSV_PATH, 'utf8'));
+
+// accent-normalized substring helper — the Reporter's leak methodology
+function norm(s) {
+  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
+}
+
+// every professor token >= 4 chars, from the real CSV
+var profTokens = (function () {
+  var set = {};
+  store.teachers.forEach(function (t) {
+    norm(t).split(/[^a-z0-9]+/).forEach(function (w) {
+      if (w.length >= 4) set[w] = true;
+    });
+  });
+  return Object.keys(set);
+})();
+
+// ---- 1. wiring -------------------------------------------------------------
+
+test('data.js wiring: typeof location guard, redact=1 parse, setRedact (issue 061)', function () {
+  var src = readSrc('js/data.js');
+  assert.ok(src.indexOf("typeof location !== 'undefined'") !== -1,
+    'the boot parse must be location-guarded (vm sandboxes have no location)');
+  assert.ok(/redact=1/.test(src), 'the redact=1 URL param parse must be present');
+  assert.ok(src.indexOf('function setRedact(') !== -1, 'the setRedact test hook must exist');
+  ['redacted: redacted', 'setRedact: setRedact', 'nameHTML: nameHTML'].forEach(function (tok) {
+    assert.ok(src.indexOf(tok) !== -1, 'TT.data must export ' + tok);
+  });
+  assert.strictEqual(data.redacted(), false,
+    'booting without location leaves the mode off (default rendering)');
+});
+
+// ---- 2. default output is byte-identical esc -------------------------------
+
+test("nameHTML('Barboura') is exactly esc('Barboura') when redaction is off", function () {
+  assert.ok(store.teachers.indexOf('Barboura') !== -1, 'the store knows Barboura');
+  var out = data.nameHTML('Barboura');
+  assert.strictEqual(out, data.esc('Barboura'), 'byte-identical to the plain escaper');
+  assert.strictEqual(out, 'Barboura');
+  assert.ok(out.indexOf('<span') === -1, 'no rectangle span while off');
+});
+
+// ---- 3. setRedact(true) emits the rectangle --------------------------------
+
+test('setRedact(true) renders a class="redact" span with an em width, no name', function () {
+  var off = data.nameHTML('Barboura');
+  try {
+    data.setRedact(true);
+    assert.strictEqual(data.redacted(), true);
+    var rect = data.nameHTML('Barboura');
+    assert.ok(rect.indexOf('class="redact"') !== -1, 'the rectangle span is emitted');
+    assert.ok(rect.indexOf('aria-hidden="true"') !== -1, 'the span is aria-hidden');
+    assert.ok(/width:\d+\.\d{2}em/.test(rect), 'the width is an NN.NNem inline style');
+    assert.ok(rect.indexOf('Barboura') === -1, 'the name never enters the DOM');
+  } finally {
+    data.setRedact(false);
+  }
+  assert.strictEqual(data.redacted(), false);
+  assert.strictEqual(data.nameHTML('Barboura'), off, 'setRedact(false) restores the exact output');
+});
+
+// ---- 4. the placeholder is not a name --------------------------------------
+
+test("nameHTML('', '—') returns esc('—') in both modes", function () {
+  assert.strictEqual(data.nameHTML('', '—'), data.esc('—'), 'placeholder untouched while off');
+  try {
+    data.setRedact(true);
+    assert.strictEqual(data.nameHTML('', '—'), data.esc('—'), 'placeholder untouched while on');
+  } finally {
+    data.setRedact(false);
+  }
+  assert.strictEqual(data.nameHTML(undefined, '—'), data.esc('—'), 'missing name falls back too');
+});
+
+// ---- 5. match.nameHTML: highlight off, rectangle on ------------------------
+
+test('match.nameHTML highlights by default and redacts when on', function () {
+  var ranges = [[0, 4]];
+  var def = match.nameHTML('Barboura', ranges);
+  assert.strictEqual(def, match.highlightHTML('Barboura', ranges), 'identical to highlightHTML');
+  assert.ok(def.indexOf('<mark>') !== -1, 'the default keeps the match highlight');
+  try {
+    data.setRedact(true);
+    var rect = match.nameHTML('Barboura', ranges);
+    assert.ok(rect.indexOf('class="redact"') !== -1, 'rectangle instead of the label');
+    assert.ok(rect.indexOf('<mark>') === -1, 'no highlight marks in redacted output');
+    assert.ok(rect.indexOf('Barboura') === -1, 'no name in redacted output');
+  } finally {
+    data.setRedact(false);
+  }
+  // highlightHTML itself stays the generic label renderer for subjects/classes
+  assert.ok(readSrc('js/match.js').indexOf('function highlightHTML(') !== -1);
+});
+
+// ---- 6. site-inventory pins ------------------------------------------------
+
+test('site inventory: no raw-esc name sites left; every page wires nameHTML(', function () {
+  var teachers = readSrc('js/teachers.js');
+  var classes = readSrc('js/classes.js');
+  var app = readSrc('js/app.js');
+  // negative tokens: a future unredacted name site fails exactly like deadcode
+  assert.ok(classes.indexOf('esc(s.professor') === -1,
+    'classes.js must not raw-esc a professor (use nameHTML)');
+  assert.ok(app.indexOf('esc(s.professor') === -1,
+    'app.js must not raw-esc a professor (use nameHTML)');
+  assert.ok(app.indexOf("'<td>' + esc(n)") === -1,
+    'the matrix axis must not raw-esc n (use nameHTML)');
+  assert.ok(teachers.indexOf('highlightHTML(r.teacher') === -1,
+    'list rows must go through match.nameHTML, not raw highlightHTML');
+  assert.ok(teachers.indexOf("'<h2>' + esc(name)") === -1,
+    'the detail heading must go through nameHTML, not raw esc');
+  // positive: each page renders names through the data-layer helper
+  ['js/teachers.js', 'js/classes.js', 'js/app.js'].forEach(function (f) {
+    assert.ok(readSrc(f).indexOf('nameHTML(') !== -1, f + ' must call nameHTML(');
+  });
+});
+
+// ---- 7. ghost suppression --------------------------------------------------
+
+test('renderGhost carries the redacted() guard (slice to acceptSuggest)', function () {
+  var src = readSrc('js/teachers.js');
+  var start = src.indexOf('function renderGhost()');
+  var end = src.indexOf('function acceptSuggest', start);
+  assert.ok(start !== -1 && end !== -1 && end > start, 'renderGhost slice bounds');
+  var slice = src.slice(start, end);
+  assert.ok(slice.indexOf('redacted()') !== -1, 'the guard lives inside renderGhost');
+  assert.ok(slice.indexOf('redacted() ? null : suggestRows[suggestIdx]') !== -1,
+    'the guard funnels into the existing hidden path');
+});
+
+// ---- 8. CSS block ----------------------------------------------------------
+
+test('.redact CSS block pins background: currentColor and display: inline-block', function () {
+  var css = readSrc('styles.css');
+  var at = css.indexOf('.redact {');
+  assert.ok(at !== -1, 'the .redact rule must exist');
+  var close = css.indexOf('}', at);
+  assert.ok(close !== -1, 'the .redact rule must close');
+  var block = css.slice(at, close);
+  assert.ok(block.indexOf('background: currentColor') !== -1,
+    'the rectangle is the text foreground');
+  assert.ok(block.indexOf('display: inline-block') !== -1, 'the rectangle sizes inline');
+  assert.ok(css.slice(close + 1).trim() === '', 'the block is appended at the end of styles.css');
+});
+
+// ---- 9. README image links resolve -----------------------------------------
+
+test('README image links resolve to committed files', function () {
+  var md = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
+  var re = /\]\((assets\/[^)]+)\)/g;
+  var m, n = 0;
+  while ((m = re.exec(md))) {
+    n++;
+    assert.ok(fs.existsSync(path.join(ROOT, m[1])), 'missing README image: ' + m[1]);
+  }
+  assert.ok(n >= 7, 'the README links the 7 captures, found ' + n);
+});
+
+// ---- 10. README alts carry no professor token ------------------------------
+
+test('README image alts are non-empty and contain no professor token (>=4 chars)', function () {
+  var md = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
+  var re = /!\[([^\]]*)\]\((assets\/[^)]+)\)/g;
+  var m, n = 0;
+  while ((m = re.exec(md))) {
+    var alt = m[1], file = m[2];
+    assert.ok(alt.trim().length > 0, 'empty alt text for ' + file);
+    var nAlt = norm(alt);
+    profTokens.forEach(function (t) {
+      assert.ok(nAlt.indexOf(t) === -1, 'alt of ' + file + ' leaks professor token "' + t + '"');
+    });
+    n++;
+  }
+  assert.ok(n >= 7, 'every capture carries an alt, found ' + n);
+});
```

The diff of `issues/061-redacted-readme-screenshots.md` is this entry itself
(appended after the `### Maintainer decision (2026-10-20)` block, nothing
else changed; `Status:` untouched).

**Binary artifacts** (committed at exactly criterion 9's paths; viewport PNG,
`scale: css`):

| File | Dimensions | Bytes |
|------|-----------|-------|
| `assets/screens/teachers-list-light.png` | 1280×800 | 43 083 |
| `assets/screens/teachers-detail-light.png` | 1280×800 | 141 441 |
| `assets/screens/teachers-detail-dark.png` | 1280×800 | 141 628 |
| `assets/screens/teachers-mobile-light.png` | 390×844 | 59 541 |
| `assets/screens/classes-week-light.png` | 1280×800 | 142 924 |
| `assets/screens/time-detail-dark.png` | 1280×800 | 71 287 |
| `assets/screens/matrix-mono-light.png` | 1280×800 | 94 974 |

Total 694 878 bytes (~679 KB). `assets/preview.png` / `assets/preview.svg`
untouched.

**Acceptance criteria → met**

1. **`js/data.js` block** — exactly the five specified functions after `esc`
   (`redactOn` with the verbatim `typeof location !== 'undefined' && /(?:\?|&)redact=1(?:&|$)/`
   guard, `redacted()`, `setRedact(on) // tests/harnesses only`, `redactHTML`
   with `max(3, len) × 0.56` → `NN.NNem`, `nameHTML(name, alt)` never
   redacting `alt`), an issue-061 comment naming the `background: currentColor`
   rationale, `redacted`/`setRedact`/`nameHTML` exported (`redactHTML`
   internal), all pure string work — the "No DOM access here" claim stays
   true. ✓
2. **`js/match.js`** — `nameHTML(s, ranges)` sits directly after
   `highlightHTML`, comment states it is the redaction-aware name highlight and
   that `highlightHTML` stays the generic label renderer; exported from
   `TT.match`; contains none of `parseExactQuery`/`exactQuery`/`buildIndex`
   (deadcode tests green). ✓
3. **Aliases** — `js/teachers.js` gains `nameHTML` + `redacted` right after its
   line-13 `esc`; `js/classes.js` and `js/app.js` gain `nameHTML` only; no
   head reordering/reformatting; `js/theme.js` and the HTML files untouched
   (issue 059's surfaces). ✓
4. **Exactly the 10 sites** — `js/teachers.js` overlay (`redacted()`/`innerHTML`
   vs `textContent` branch, default path unchanged), list row
   (`match.nameHTML(r.teacher, r.nameRanges)`), detail `<h2>`
   (`nameHTML(name)`), suggest teacher kind (`match.nameHTML(r.label,
   r.ranges)` — class/subject branches keep `highlightHTML`), `renderGhost`
   first line (`redacted() ? null :`); `js/classes.js` `td.c-teacher` and
   `span.s-teacher` (`nameHTML(s.professor, '—')`); `js/app.js` time detail
   Teacher cell and matrix axis (`nameHTML(s.professor, '—')`, `nameHTML(n)`).
   Search logic, commit/blur/arrow semantics, `dataset.name`, counts,
   `No match`, input value untouched; hunks line-local. ✓
5. **CSS** — one block appended at the very end of `styles.css` with
   `display: inline-block; height: 0.78em; border-radius: 0.18em;
   vertical-align: -0.08em; background: currentColor;` (test 8 additionally
   pins that it is the file's last rule). ✓
6. **Providers** — `nameHTML: data.nameHTML` added at all five sandboxes
   (`teacher-daygroups` ~77 and ~627, `classes` ~694 and ~947, `time-live`
   ~146); no other test edits — the diff shows those three files differing
   only on those lines; Barboura/Dlima and structural pins pass unmodified. ✓
7. **Tests** — `test/redact.test.js` has exactly the 10 enumerated tests;
   `node --test test/classes.test.js … test/time-live.test.js
   test/redact.test.js` → **139/139/0**; also `node --test` → 139/139/0 and
   `node --test test/*.test.js` → 139/139/0; the four pages plus
   `index.html?redact=1` (and the other three `?redact=1` URLs) → `200` via
   `curl` from `python3 -m http.server 8611`, killed afterwards by its PID
   (966859) — `pkill -f` never used. ✓
8. **Captures + no-leak assertion** — the 7 PNGs per the matrix; assertion
   run immediately before each screenshot with no intervening state change;
   the two numbers per shot are in the table below. ✓
9. **Binaries** — only at the 7 specified paths (sizes above); `assets/preview.*`
   byte-identical (content diff against the sibling worktree). ✓
10. **README** — `# Screenshots` inserted between the intro (line 4) and
    `# Data Pipeline`, one intro sentence explaining rectangles + `?redact=1`,
    7 captions and the 7 images in matrix order with criterion 9's exact file
    names; alt texts describe page/state/scheme only (test 10 proves no alt
    contains any professor token ≥4 chars against the real CSV); no other
    README change. ✓
11. **Re-capture recipe** — documented in full below (this replaces a
    committed capture script). ✓
12. **Diff hygiene** — the changed-file list above is exactly criterion 12's
    list. No-gos observed: `emplois.csv`, `data/pdfs/`, `data/extract.py`, the
    four HTML files, `js/theme.js`, `js/model.js` are byte-identical to the
    base (verified by content diff against the sibling `clean` worktree —
    `js/theme.js`/`test/deadcode.test.js` here are the untouched pre-059
    versions); no new dependencies, no `package.json`, no capture script; no
    teacher name in any PNG (assertion + visual review of all 7); default
    rendering byte-identical (all 129 pins green, plus the no-param walk). ✓

**Verification results**

- Baseline re-verified before any edit: the 7-file run line →
  **129 tests, 129 pass, 0 fail**; the reconstructed pre-change tree (see diff
  note above) → **129/129/0** as well.
- Final: `node --test` → **139/139/0**; `node --test test/*.test.js` →
  **139/139/0** (129 + 10 new; `node --test test/` still fails as documented,
  files stay listed).
- Redaction walk (Chromium, `?redact=1`, all four pages; token set = 130
  accent-normalized professor tokens ≥4 chars + full names from
  `emplois.csv`; numbers are `.redact` count / name-token hits in
  `body.innerText`):
  - index list: **132/0**; detail after row click: **134/0** with the `<h2>`
    rectangle = 1; typing `barb`: ghost suppressed (`#ghost` hidden, ghostRest
    empty), suggest rows rectangles = 2, **0 hits**;
  - mobile 390×844 teacher state: `#overlayName .redact` = 1, overlay
    `innerText` empty, **0 hits**;
  - classes detail: **42/0** (21 `td.c-teacher` + 21 `span.s-teacher`);
  - time slot detail: **32/0**; timetable matrix: **132/0**.
  Every visible name site renders a rectangle; no name text anywhere.
- No-param walk (default rendering unchanged): first row `Abbassi (26)`,
  detail `<h2>Abbassi`, classes cell `Ben Krim`, time cell `Omezzine`, matrix
  axis `Abbassi`, ghost still completes (`barb` → rest `oura`), suggest shows
  `TEACHERBarboura (18)` with `<mark>` — **0** `.redact` elements on all four
  pages. Byte-identical behavior to today.
- **Captures** — each assertion ran immediately before its screenshot, no
  intervening state change; every shot's page-side clock read
  `Wed Oct 14 2026` (installed pre-navigation); `--md-primary` observed per
  shot confirmed the preset (light ISIM `#445E91`, dark ISIM `#ADC6FF`,
  light Monochrome `#5E5E5E`):

| # | File | Viewport | Scheme × preset | `.redact` count | name hits | Notes |
|---|------|----------|-----------------|-----------------|-----------|-------|
| 1 | `teachers-list-light.png` | 1280×800 | light × ISIM Blue | 132 | 0 | boot list, rows = rects + counts |
| 2 | `teachers-detail-light.png` | 1280×800 | light × ISIM Blue | 134 | 0 | `<h2>` rect = 1 (132 list + h2 + hidden desktop overlay rect) |
| 3 | `teachers-detail-dark.png` | 1280×800 | dark × ISIM Blue | 134 | 0 | same state, dark foregrounds |
| 4 | `teachers-mobile-light.png` | 390×844 | light × ISIM Blue | 134 | 0 | **`#overlayName .redact` = 1 asserted specifically** |
| 5 | `classes-week-light.png` | 1280×800 | light × ISIM Blue | 42 | 0 | 21 `c-teacher` + 21 `s-teacher` (week grid below the fold, in DOM) |
| 6 | `time-detail-dark.png` | 1280×800 | dark × ISIM Blue | 32 | 0 | Teacher column of the slot detail |
| 7 | `matrix-mono-light.png` | 1280×800 | light × Monochrome | 132 | 0 | sticky axis = rects; third preset |

  All 7 PNGs were opened and reviewed: rectangles render wherever names
  would, no name is visible, the bar takes the text foreground including
  NOW/NEXT row colors.
- `curl` (server PID 966859): `index.html`, `classes.html`, `time.html`,
  `timetable.html`, `index.html?redact=1` → **200** (also
  `classes.html?redact=1`, `time.html?redact=1`, `timetable.html?redact=1`,
  `styles.css`, `README.md` → 200). Server killed by PID afterwards.

**Re-capture recipe** (criterion 11 — this replaces a committed capture
script; the mechanism is also discoverable from the `js/data.js` comment):

1. `cd` the worktree, start `python3 -m http.server 8611` in the background
   and keep its PID (`echo $!`); kill that PID when done — never `pkill -f`.
2. One Playwright session (the MCP `browser_run_code_unsafe` tool suffices;
   no npm package, no script committed):
   `page.clock.install({ time: new Date(2026, 9, 14, 10, 5, 0) })`
   **before the first capture navigation** — every shot then reads
   `Wed Oct 14 2026 10:05` page-side (NOW/NEXT and today=MERCREDI
   deterministic; the kaomoji face stays random, accepted non-data pixels).
   Token set for the assertion: fetch `emplois.csv`, keep each professor
   word-token ≥4 chars after NFD accent-stripping + lowercase, plus each
   full professor name ≥4 chars (130 tokens today).
3. Per shot, in this order with nothing extra between the last two steps:
   `page.setViewportSize(w, h)` → `page.emulateMedia({ colorScheme })` →
   navigate same-origin (`index.html`) →
   `localStorage.setItem('emplois-theme', JSON.stringify({ preset: '<P>' }))`
   → navigate to the shot URL `…?redact=1` → wait for the state → the shot's
   interaction (see 4) → blur `document.activeElement` → assert
   (a) `document.querySelectorAll('.redact').length >= 1` and (b) zero
   professor tokens in accent-normalized `document.body.innerText` →
   `page.screenshot({ path, fullPage: false, scale: 'css', type: 'png' })`
   immediately after the assertion.
4. Interactions per shot: 1 none (boot list); 2/3 click
   `#teacherList li:first-child`, wait `#detail h2`; 4 click `#search` (opens
   the mobile menu), wait `#layout.is-list`, click
   `#teacherList li:first-child`, wait `#overlayName .redact`, and assert
   `#overlayName .redact >= 1`; 5 click `#classList li:first-child`, wait
   `#detail span.s-teacher`; 6 click
   `li[data-day="MERCREDI"][data-slot="10h00-11h30"]`, wait `#detail table`;
   7 none. Presets/viewports/schemes: the matrix table in the decision.
5. A missed preset can only degrade color, never privacy — the no-leak
   assertion is per shot (observed `--md-primary`: light ISIM `#445E91`,
   dark ISIM `#ADC6FF`, light Monochrome `#5E5E5E`).

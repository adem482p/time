# 048: Restore desktop day headings and group class weeks by day

- Status: Fixed
- Date: 2026-10-17, Reporter: user

## Description

Observed (problem 1 — regression, unintended): on the **teachers** page at any
viewport above 700px the per-day headings emitted by `showTeacher`
(`<h3 class="day-head">lundi</h3>`, …) are in the DOM but invisible:
`styles.css:451` sits inside `@media (min-width: 701px)` (block starts at
`styles.css:394`) and sets `#detail .day-head { display: none; }`. Verified in
a real browser: at 1024px, selecting `Barboura` renders 3 headings
(`jeudi`, `vendredi`, `samedi`), all with computed `display: none`; at 600px
the same three headings compute `display: block`.

Expected (problem 1): desktop teachers keep the `h3.day-head` per-day
headings introduced by commit `ed552ec` ("Group teacher sessions by day with
section headings"), visible on **all** viewports — the heading sits as a
sibling immediately before its `section.day-group`, above the
`table.t-sessions` for that day (order already asserted by
`test/teacher-daygroups.test.js:206-212`). Only problem 2's classes-page
headings were meant to disappear from desktop.

Observed (problem 2 — feature): the **classes** page desktop view is the week
grid only. Selecting a class above 700px renders `#detail` children in the
order `h2`, `div.weekwrap`, then six `h3.day-head` + `section.day-group`
pairs; every `h3.day-head` computes `display: none` (same rule as above) and
every `table.c-sessions` computes `display: none`
(`styles.css:454` — `#layout > #detail table.c-sessions { display: none; }`).
There is no full session table anywhere on the page (`renderWeek` emits none).

Expected (problem 2 — the design answers below are BINDING):

1. **Classes desktop layout order** inside `#detail`: `<h2>` class name →
   per-day sections (each `<h3 class="day-head">` heading followed by that
   day's session table) → the week grid → a plain full session table listing
   every session of the week as the **LAST** element of the detail. Exact
   expected DOM order:

   ```
   #detail
     h2                      (class name)
     h3.day-head × n         (one per non-empty day, Monday-first)
     section.day-group × n   (each holding its table.c-sessions, immediately
                              after its heading)
     div.weekwrap            (table.week + div.cursor — moved here from the top)
     table                   (full session list; columns Day / Time / Teacher /
                              Subject / Room; every session of the week)
   ```

2. The week grid (`.weekwrap` / `table.week` with the red `.cursor`) is
   **kept** but no longer first.
3. Narrow screens (≤700px) keep the current day-card list **exactly as-is**;
   both the week grid (already hidden today via `styles.css:740`
   `#detail .weekwrap { display: none; }`) and the new full table stay hidden
   on narrow screens.
4. Teachers page day headings must be visible again on all viewports.

Note: the stray desktop headings are a classes-page symptom — the day-group
tables there are hidden by `styles.css:454`, so headings above them label
nothing. Removing that desktop `table.c-sessions` hide is what makes the
classes day headings non-stray (each heading then labels a visible table),
which in turn lets the blanket `#detail .day-head { display: none; }` go away
instead of being re-scoped.

## Root cause

Commit `9329ab8` ("Show day headings on mobile only", 2026-10-16) added
exactly two things:

1. `styles.css`, inside `@media (min-width: 701px)` (now lines 449-451):

   ```css
   /* day headings are a mobile pattern (the card needs its label); on desktop
      the grouped tables stand alone */
   #detail .day-head { display: none; }
   ```

   The base rule `#detail .day-head { … }` (`styles.css:374-378`) makes the
   heading visible everywhere; the later, equally-specific rule inside the
   desktop media query wins at >700px. Because the selector is
   `#detail .day-head` (not scoped to a page or table class), it hides the
   headings on **both** `index.html` and `classes.html`.
2. The test `'day headings show on mobile only, never on desktop'`
   (`test/teacher-daygroups.test.js:307-319`), which requires the desktop
   slice (from `@media (min-width: 701px)` up to `@media (max-width: 700px)`)
   to contain `#detail .day-head` followed within 60 characters by
   `display: none`, and the narrow slice to contain no
   `.day-head { display: none`. So the regression is pinned by the suite:
   restoring the headings requires changing this test too.

The commit's premise ("desktop grouped tables stand alone") is true only for
the teachers page. The structure that made the headings look stray lives on
the classes page:

- `js/classes.js:217-307` `renderWeek` emits `<h2>` then
  `div.weekwrap > table.week (+ div.cursor)` first (lines 220-255), and only
  then the per-day `h3.day-head` + `section.day-group` + `table.c-sessions`
  sections (lines 279-301). Its own comment (lines 256-257) states the list is
  "hidden on desktop by CSS", and `js/classes.js:40-41` states "On narrow
  screens the grid is replaced by a teacher-style session card list".
- On desktop those sections are hidden wholesale by `styles.css:454`
  (`#layout > #detail table.c-sessions { display: none; }`), so there the
  `h3.day-head` really labelled invisible content. `9329ab8` suppressed that
  symptom with one page-agnostic rule and thereby removed the teachers
  page's headings as well.
- `js/teachers.js:285-308` `showTeacher` emits one
  `<h3 class="day-head">` + `section.day-group` + `table.t-sessions` per
  non-empty day (heading at line 286, section at line 287, table at line 288);
  the desktop rules `styles.css:434-448` style those `t-sessions` tables
  (gutter hang), so teachers desktop needs no `display` change — only the
  `:451` rule has to go.

Tests that currently pin the behavior a fix must revisit (all verified):

- `test/teacher-daygroups.test.js:307-319` — demands the desktop hide.
- `test/teacher-daygroups.test.js:396-407` (`'styles.css keeps the classes
  guards intact'`) — demands `#layout > #detail table.c-sessions { display: none; }`
  (`:397`) and the narrow `#detail .weekwrap { display: none; }` (`:399`).
- `test/classes.test.js:595-617` (`'styles.css hides the grid/list per viewport…'`)
  — demands the desktop c-sessions hide (`:598`) and the narrow weekwrap hide
  (`:600`).
- `test/classes.test.js:564-578` (`'classes card list groups by day with no
  Day column (G2)'`) — asserts `list.indexOf('<th>Day') === -1` (`:575`) and
  no `c-day` cells (`:576`) over `classesListBlock()`, whose bounds are
  `var liveDays = {};` … `detail.innerHTML = h;` (`:499-505`); a full table
  with a `Day` column emitted between those bounds would trip it.

## Repro steps

Commands (from the worktree root
`/home/user/.local/share/opencode/worktree/1de5bb/048-day-headings`):

```
node --test
node --test test/*.test.js     # same result
python3 -m http.server 8000
```

(`node --test test/` as written in AGENTS.md fails on this machine's
Node v22.23.3 with `MODULE_NOT_FOUND: …/test`; the forms above both work.
Current result: 96 tests, 96 pass, 0 fail. Serve check:
`curl -s -o /dev/null -w '%{http_code}' http://localhost:8000/classes.html`
returns 200, likewise `index.html`, `styles.css`, `js/teachers.js`,
`js/classes.js`, `emplois.csv`.)

URLs + clicks:

1. **Teachers regression (>700px)** — open
   http://localhost:8000/index.html with the window at e.g. 1024×800 and
   click the teacher `Barboura` in the list. Observed: three day groups
   (jeudi/vendredi/samedi) with **no visible headings** (`h3.day-head`
   present, computed `display: none`). Expected after the fix: `jeudi`,
   `vendredi`, `samedi` headings visible above their tables. Resize to
   600×800 and re-select: headings visible (unchanged).
2. **Classes desktop (>700px)** — open
   http://localhost:8000/classes.html at 1024×800 and click the class
   `GLSI3D1`. Observed: detail children are `h2`, `div.weekwrap`, then six
   `h3.day-head` + `section.day-group` pairs; all headings and all
   `table.c-sessions` are `display: none`, `.weekwrap` is `display: block`,
   and no full table exists. Expected: `h2` → the six
   heading + day-table pairs (visible) → `.weekwrap` grid → a final plain
   table with header `Day / Time / Teacher / Subject / Room` as the last
   element.
3. **Classes narrow (<700px)** — same selection, shrink to 600×800.
   Observed: day-card list visible (6 headings `display: block`, 6
   `table.c-sessions` `display: block`), `.weekwrap` `display: none`.
   Expected after the fix: byte-identical, except the new full table is also
   `display: none` here.

## Discussion

### Maintainer decision (2026-10-17)

Round 1 — triage. Researched the code and tests directly (read-only); this is
a final decision, no outstanding requests — the Implementer may act on the
criteria below.

**Verdict**

- **Problem 1 (teachers desktop day headings) — VALID, in scope.** `9329ab8`
  added a page-agnostic `#detail .day-head { display: none; }` that hides
  exactly the headings `showTeacher` has emitted on every viewport since
  `ed552ec`; the fix is a pure regression revert (delete one rule, invert one
  pinned test).
- **Problem 2 (classes desktop restructure) — VALID, in scope, decided as the
  Reporter's binding design answers state.** The classes desktop view is
  grid-only today purely because of the same blanket rule plus
  `#layout > #detail table.c-sessions { display: none; }`; both problems share
  one root cause, so they are fixed together — removing only the blanket rule
  would leave stray headings above the still-hidden classes tables. The day-card
  markup itself is already correct for both viewports and is reused unchanged.
- **Docs (`Design.md`, `classes.html` meta descriptions) — OUT OF SCOPE.**
  "see its whole week grid" stays factually true (the grid is kept), and
  `Design.md`'s Classes section already omitted the day-card list shipped in
  issue 047 without being updated; touching SEO meta/description text for this
  fix would be unrelated churn. File a separate docs issue if desired.

**Acceptance criteria**

CSS (`styles.css`):

1. In `@media (min-width: 701px)` (block starts line 394), delete the rule
   `#detail .day-head { display: none; }` **with its two-line comment**
   (now lines 449-451). After the change, no rule anywhere in styles.css may
   set `display` on `.day-head`; the base rule (lines 374-378) and the narrow
   margin override (line 642) stay byte-identical.
2. In the same desktop block, delete
   `#layout > #detail table.c-sessions { display: none; }` **with its comment**
   (now lines 452-454). After the change, styles.css must contain no
   `table.c-sessions` rule with `display: none` anywhere (it is the narrow view,
   it must never be hidden).
3. Extend the desktop gutter-hang rule set (still inside the desktop block) to
   the classes day tables, rewriting the three existing rules as selector
   lists — declarations unchanged:
   - `#layout > #detail .day-group table.t-sessions, #layout > #detail .day-group table.c-sessions { margin-left: calc(-1 * var(--gutter)); width: calc(100% + var(--gutter)); }`
   - same two-selector list for the `th:first-child, td:first-child` rule
     (`width: var(--gutter); padding-left: 0; padding-right: 0; vertical-align: middle;`),
   - same two-selector list for the `.nowtag, .nexttag` rule
     (`font-size: .78em; vertical-align: middle;`).
   Rationale: both per-day tables share the identical leading marker column;
   one source of truth beats duplicating declarations. Constraint: after the
   change `CSS_SRC.indexOf('.day-group table.t-sessions') !== -1` and
   `CSS_SRC.indexOf('#detail table.t-sessions') === -1` must both still hold
   (test `teacher-daygroups.test.js:300-305`). The new full table
   (`table.c-all`, criterion 7) gets **no** gutter hang — it has no marker
   column and must start at the detail column's left edge.
4. In the classes narrow block (`@media (max-width: 700px)`, lines 736-751),
   immediately beside the existing `#detail .weekwrap { display: none; }`
   (line 740), add `#detail table.c-all { display: none; }`. Its
   id+class+type specificity beats the generic narrow
   `#detail table { display: block; }` (line 589), so the full table never
   renders on narrow screens. This is the only narrow-CSS change.
5. No other CSS changes. Narrow card rules (494-679) including
   `#detail tr:has(th) { display: none; }` (590), base `.day-group`/`.day-head`
  /dim rules (367-380), and all teachers rules stay byte-identical apart from
   the selector lists of criterion 3.

JS (`js/classes.js`, `renderWeek` only):

6. Reorder `renderWeek`'s emission of `h` to: `<h2>` class name → the existing
   per-day `h3.day-head` + `section.day-group` block (now lines 265-301,
   content byte-identical) → the existing `div.weekwrap` grid block (now lines
   221-255, moved as a whole, byte-identical) → the new full table
   (criterion 7) → `detail.innerHTML = h;`. Concretely, the source of
   `renderWeek` must contain at strictly increasing indices: `'<h2>'`,
   `'<h3 class="day-head">'`, `'<section class="day-group'`,
   `'<div class="weekwrap"'`, `'<table class="c-all">'`,
   `'detail.innerHTML = h;'`. `var by = indexByDaySlot(week)` must remain
   assigned before the grid block executes.
7. After the `.weekwrap` block, append the full session table, emitted inline
   in `renderWeek`:
   - starts with the literal `'<table class="c-all">'`, header emitted as the
     contiguous literal
     `'<tr><th>Day</th><th>Time</th><th>Teacher</th><th>Subject</th><th>Room</th></tr>'`
     — exactly five columns in that order, **no leading marker column**;
   - one `<tr>` per row of `week.sessions`, produced by a **second**
     `dayOrder.forEach` + `byDay[day].forEach` over the *same* structures
     already built for the day groups: `var byDay = {}` and `var dayOrder = []`
     are each declared exactly once, never recomputed or duplicated;
   - row class from
     `color.sessionRow({ isNow: …, isNext: …, dimIdle: false })` with
     `isNow = model.isCurrentSession(s.day, s.time, now)` and
     `isNext = !isNow && cursor.visible && s.day === cursor.today && s.time === cursor.next`
     — identical today-only cursor formulas as the day-group rows;
     `nextSessionIdx` must remain absent from `js/classes.js`;
   - cells: first cell **plain `<td>` (no `c-day` class — see risk 7)**
     containing `esc(model.frDay(s.day))` plus, when marked, a space and the
     same tag markup the day-groups use (`<span class="nowtag">● NOW</span>` /
     `<span class="nexttag">` + `NEXT_ARROW` + `NEXT</span>`), then
     `<td class="c-time">` `esc(s.time)`, `<td class="c-teacher">`
     `esc(s.professor || '—')`, `<td class="c-subject">` `esc(s.subject)`,
     `<td class="c-room">` `esc(s.room || '—')`;
   - no `dim` anywhere in the full table (idle-day dimming stays the
     day-groups' job), no `daystart`, no `<hr>`, no `weekCount`/`span class="n"`.
   Every session of the week appears exactly once (data rows ===
   `week.sessions.length`) in Monday-first `cmpSession` order (inherited from
   `dayOrder`/`byDay`).
8. Marking design resolved: the binding five-column header rules out a sixth
   gutter column, so the NOW/NEXT tag lives inside the Day cell; the tint comes
   from the existing base rules `#detail tr.now td` / `#detail tr.next td`
   (lines 328-329), which need no changes. Rows are never dimmed.
9. `applyCursor`/`startCursor` are untouched and must stay so: they locate
   `td.c-cell`, `th.c-day`, `.cursor` and `.weekwrap` purely by selector —
   position-independent, so moving `.weekwrap` later in `#detail` cannot break
   cursor positioning. Never introduce first-child/order dependence there. The
   full table emits no `c-cell`, no `th.c-day`, no `data-day`/`data-slot`, so
   cursor queries can never match it.
10. `js/teachers.js` is untouched (zero diff): `showTeacher` emission, its
    source slice and the whole teachers behavioral battery must pass
    unmodified. `classes.html`, `index.html`, `Design.md` untouched.

Tests:

11. `test/teacher-daygroups.test.js`:
    a. **Replace** test `'day headings show on mobile only, never on desktop'`
       (lines 307-319) with e.g. `'day headings show on every viewport'`
       asserting: desktop block exists before the first narrow block (keep the
       ordering sanity); the desktop slice contains **no** `#detail .day-head`
       rule (`desktop.indexOf('#detail .day-head') === -1`); the whole file
       matches no day-head hide
       (`!/\.day-head\s*\{\s*display\s*:\s*none/.test(CSS_SRC)`); the narrow
       slice still styles `#detail .day-head`
       (`narrow.indexOf('#detail .day-head') !== -1`).
    b. In `'styles.css keeps the classes guards intact'` (396-407) **invert**
       line 397 to
       `assert.ok(CSS_SRC.indexOf('#layout > #detail table.c-sessions { display: none; }') === -1, 'desktop must keep the classes day tables visible')`.
       Every other assertion of that test (narrow weekwrap hide, `td.c-teacher`
       order/label, `c-cell.today` before `c-cell.now`) stays unchanged.
    c. Line 164 (`sec.indexOf("'<td class=\"c-day\">'") === -1` over the whole
       `initClassesPage` section) must remain untouched and green — it is the
       reason criterion 7 forbids `c-day` in the full table (see risks).
12. `test/classes.test.js`:
    a. **Re-bound** `classesListBlock()` (lines 499-505): keep
       `start = sec.indexOf('var liveDays = {};')`; change `end` from
       `sec.indexOf('detail.innerHTML = h;', start)` to the first week-grid
       emission after start, e.g.
       `sec.indexOf('<div class="weekwrap"', start)`, keeping the
       `end > start` assert. Required because criterion 6 moves the grid (which
       carries `c-day` header cells and six `<td class="c-time">` slot cells)
       and the new full table (which carries `<th>Day`) between the day groups
       and `detail.innerHTML = h;` — under the old bounds all of it would land
       inside the block and trip G2 and the row-count/marker battery.
    b. With (a), **every existing assertion stays byte-for-byte as-is** and
       must not be weakened: `'classes.js emits a teacher-style day-grouped
       session list…'` (529-549), `'classes card list groups by day with no Day
       column (G2)'` (564-578), `'classes dim lives on the section… (G3)'`
       (580-593), and the behavioral battery `checkClassesInvariants` /
       `runClassesList` (638-775) — the day-group emission is unchanged, so
       heads, sections, row totals, marker and dim expectations are preserved.
    c. In `'styles.css hides the grid/list per viewport and labels teacher
       cells'` (595-617) **invert** line 598 to assert
       `'#layout > #detail table.c-sessions { display: none; }'` is absent;
       keep line 600's narrow weekwrap-hide assert; **add**: the exact rule
       `#detail table.c-all { display: none; }` exists AND occurs after
       `css.lastIndexOf('@media (max-width: 700px)')` (i.e. inside a narrow
       block), and the desktop slice (from `@media (min-width: 701px)` to the
       first `@media (max-width: 700px)`) contains no `c-all` rule. Keep all
       remaining asserts of the test.
    d. **Add** structural test `'renderWeek emits day groups, then the week
       grid, then the full table'`: slice `js/classes.js` from
       `'function renderWeek'` to `'function applyCursor'` and assert strictly
       increasing indices for `'<h2>'`, `'<h3 class="day-head">'`,
       `'<section class="day-group'`, `'<div class="weekwrap"'`,
       `'<table class="c-all">'`, `'detail.innerHTML = h;'`; assert the
       contiguous header literal of criterion 7 is present in `js/classes.js`;
       assert `var byDay = {}` occurs exactly once and `dayOrder.forEach`
       exactly twice in the classes source (reuse, no duplicate grouping); and
       `nextSessionIdx` still never occurs.
    e. **Add** behavioral test for the full table: run the real source in a vm
       (mirroring `runClassesList`) as two slices — part 1 from
       `'var liveDays = {};'` to `'<div class="weekwrap"'` (defines
       `dayOrder`/`byDay` exactly as production does), part 2 from
       `'<table class="c-all"'` to just before `'detail.innerHTML = h;'` —
       with `week = model.classWeek(groups, 'GLSI3D1')` and the existing
       fixture clocks (Fri 2026-10-16 12:00, Sun 2026-10-11 10:00). Assert on
       the tail from `'<table class="c-all">'` onward: exact header row; data
       rows === `week.sessions.length`; each row's Day cell equals
       `frDay(s.day)` with days Monday-first non-decreasing in `store.days`
       order; at Fri 12:00 the `nowtag`/`nexttag` rows equal the
       `wantNow`/`wantNext` sets recomputed with the same cursor formulas; at
       Sunday 10:00 no `nowtag`, no `nexttag`, no `dim`; the tail contains no
       `c-day`, no `daystart`, no `<hr`, no `<p class="count"`.
    f. All other tests in both files (and `fusion`/`libgroups`) pass unchanged.
13. Verification: `node --test test/*.test.js` (and bare `node --test`) → 0
    failures including the new tests; `python3 -m http.server 8000` from the
    worktree root, then `curl -s -o /dev/null -w '%{http_code}'` → 200 for
    `/index.html`, `/classes.html`, `/styles.css`, `/js/classes.js`,
    `/js/teachers.js`, `/emplois.csv`.
14. Diff hygiene: only `styles.css`, `js/classes.js`,
    `test/teacher-daygroups.test.js`, `test/classes.test.js` change (plus this
    thread's implementer entry). `Status:` stays `Open` until merge; no git
    operations by the Implementer.

**Risks / constraints**

1. **Cursor/applyCursor**: `.weekwrap` may no longer be `#detail`'s first
   child — all cursor code must remain selector-based and order-independent
   (criterion 9); keep `var by = indexByDaySlot(week)` before the grid block.
   Never assert or rely on weekwrap-first anywhere.
2. **Mobile card byte-stability**: the day-group emission source must stay
   byte-identical; narrow CSS changes by exactly one added line; the DOM reorder
   is invisible on narrow because `.weekwrap` and `table.c-all` are both
   `display: none` there.
3. **Gutter hang scope**: extends only across `.day-group table.t-sessions`
   and `.day-group table.c-sessions` (both have marker columns). Never
   unscope it to `#detail table.t-sessions` (breaks test 300-305) and never
   apply it to `table.c-all` (a plain table hanging into the layout gap).
4. **Specificity battles**: after criterion 1 no `display` may be set on
   `.day-head` in any block (the base rule must win everywhere on both pages);
   the full-table narrow hide must beat `#detail table { display: block }` via
   id+class specificity while never matching in the desktop block; the
   `td.c-cell.today` before `td.c-cell.now` ordering must not move; narrow
   `tr:has(th)`/`tr:has(td)` card rules must not be re-scoped.
5. **Test bounding helpers are load-bearing**: `classesListBlock()` is used by
   G2/G3 source asserts — re-bound exactly once (end at the weekwrap marker),
   never widened back. Do not rename the markers the suites slice on:
   `function renderWeek`, `function applyCursor`, `var liveDays = {};`,
   `detail.innerHTML = h;`, `var byDay = {}`, `function initClassesPage`.
6. **Marking semantics**: today-only cursor now/next (never `nextSessionIdx`),
   `dimIdle: false` on every row, no `dim` in the full table, no
   `dayStart`/`prevDay` anywhere in `js/classes.js` — tinted
   `tr.now`/`tr.next` rows rely on base rules 328-329 with no competing rules.
7. **No `c-day` literal in `js/classes.js`**: `teacher-daygroups.test.js:164`
   asserts its absence over the whole section — this is why the full table's
   Day cell is a plain `<td>`; adding `class="c-day"` there would break a test
   the Reporter did not list.
8. **Teachers page**: zero behavioral change — the fix is deletion only; the
   t-sessions gutter declarations must stay byte-identical (only their selector
   lists grow). Teachers desktop keeps headings above `table.t-sessions` at
   `:206-212` shape assertions.
9. **Classes desktop becomes a tall page** (day groups + grid + full table);
   it relies on the documented overflow-scroll path
   (`body[data-page] height:100vh` + document scroll, styles.css 397-401 — the
   same mechanism teachers desktop breakdown already uses). No browser is
   available to the Implementer: note this in the fix entry as visually
   unverified.
10. **Grid fidelity**: the `.weekwrap` block moves verbatim — no edits inside
    it (cursor div, `c-cell.today/now/next` emission, `store.days` loops all
    untouched).

**Beyond the Reporter's analysis (found during triage)**

- Re-ordering alone (even without the full table) lands the grid's `c-day`
  header cells and six `<td class="c-time">` slot cells inside
  `classesListBlock()`'s current `…→ detail.innerHTML = h;` bounds, tripping
  G2's `c-day === -1` and the battery's row-total count — so the helper
  re-bound (12a) is required regardless of how the full table is shaped, not
  only because of its `<th>Day` as the Reporter's root cause implies.
- `teacher-daygroups.test.js:164` (whole-section absence of
  `'<td class="c-day">'`) was not on the Reporter's list of tests to revisit
  yet constrains the full table's Day cell (criterion 7 / risk 7).
- No existing test asserts weekwrap-first or any `#detail` child order — the
  only order assertions are heading-before-section inside the list block and
  `c-cell.today` before `c-cell.now` in CSS — so criterion 6 needs a *new*
  order test rather than an edit of an existing one.
- The gutter-hang asymmetry (t-sessions hangs into `--gutter`, c-sessions
  would not) was unaddressed in the issue; decided as criterion 3, and
  `styles.css re-scopes the desktop gutter hang…` (300-305) constrains how the
  selector extension may be written.

### Maintainer re-evaluation (2026-10-17)

Round 2 — re-evaluated under the REVISED charter (this role was redefined
after the triage entry above; the old AGENTS.md in this worktree is
superseded by charter 208e65a). I read the full thread, studied
`js/classes.js`, `js/teachers.js`, `js/app.js`, `js/libgroups.js`,
`js/model.js`, `styles.css` and both test suites, and ran the baseline:
`node --test` → 96/96 pass. **This is a FINAL decision with no outstanding
requests**; where this entry and the triage above disagree, this entry wins.

**Verdict on the old triage (per point)**

- Overall: the *outcomes* of the triage correctly implement the Reporter's
  binding design answers and are upheld. The *handling* is revised in three
  implementation points (gutter-hang selectors, full-table row sourcing, the
  new structural/behavioral tests) and corrected in two factual slips.
  Nothing user-decided is relitigated.
- c1 (delete desktop `#detail .day-head` hide) — **upheld**.
- c2 (delete desktop `table.c-sessions` hide) — **upheld**.
- c3 (gutter hang rewritten as two-selector lists
  `table.t-sessions, table.c-sessions`) — **superseded**: scope the three
  desktop rules by the pattern `#layout > #detail .day-group table`
  (reasoning below). The triage also missed that
  `teacher-daygroups.test.js:301` pins `.day-group table.t-sessions` and
  must be updated with the rewrite (its own message — "gutter hang must
  apply per .day-group table" — already speaks pattern language).
- c4 (narrow `#detail table.c-all { display: none; }` beside the weekwrap
  hide) — **upheld**.
- c5 (no other CSS changes) — **upheld** (except c3's rewrite).
- c6 (reorder `renderWeek` emissions; strictly increasing marker indices;
  `var by = indexByDaySlot(week)` before the grid block) — **upheld**.
- c7 (full table inline in `renderWeek`, rows produced by a *second*
  `dayOrder.forEach` + `byDay[day].forEach`) — **modified**: the flat table
  iterates `week.sessions` directly (see direction 5), and the session-row
  markup is single-sourced through a local row helper shared with the
  day-groups loop (direction 4). **Correction**: "`nextSessionIdx` must
  remain absent from `js/classes.js`" is false as written — the *word* is in
  a comment today (`js/classes.js:262`); the invariant (already pinned by
  `classes.test.js:542`) is that the *call form* `nextSessionIdx(` never
  occurs.
- c8 (marking design; tint from base rules 328-329) — **upheld** (via the
  helper).
- c9 (cursor code order-independent, untouched) — **upheld**, with the c7
  correction applied to its `nextSessionIdx` wording.
- c10 (`js/teachers.js` zero diff; `classes.html`/`index.html`/`Design.md`
  untouched; docs out of scope) — **upheld**: `Design.md:181-183` and the
  `classes.html` meta descriptions ("see its whole week grid", lines 7/15/24)
  stay factually true since the grid is kept, and `Design.md` already omitted
  the issue-047 card list without being updated.
- c11 (test/teacher-daygroups updates) — **upheld** for a/b/c, **extended**
  with the test-301 edit from c3.
- c12 (test/classes updates) — a, b, c **upheld**; d (structural order test)
  and e (full-table behavioral test) **modified** to match c7 (below).
- c13 (verification: node --test 0 failures; curl 200 ×6) — **upheld**;
  expected total is now 98 tests (96 baseline, the 307-319 test *replaced*,
  +2 new).
- c14 (diff hygiene: only `styles.css`, `js/classes.js`,
  `test/teacher-daygroups.test.js`, `test/classes.test.js`) — **upheld**.
- Old risks 1-10 — **all upheld** (risk 6/7 wording corrected per c7).
  "Beyond the Reporter's analysis" notes — upheld; its gutter point is
  resolved here by the pattern rewrite instead of selector lists.

**Architectural direction and reasoning**

1. **Cross-page day-group duplication is NOT unified in this fix.** I weighed
   extracting the shared heading/section/row rendering into shared code and
   rejected it, because: (a) per-page self-containment is an explicit,
   user-made convention (`js/classes.js:1-6`: the shared head "is duplicated
   from js/app.js by design, not imported — zero coupling, no load-order
   constraints"; "This file owns DOM only") — and none of the named shared
   homes (`libgroups.js` = hierarchy parsing, `model.js` = domain,
   `color.js` = color decisions) owns DOM markup; (b) the two pages'
   next-marking semantics differ *by design* and are separately test-pinned
   (teachers: `upcoming.has(i)` wrapping into coming days,
   `teacher-daygroups.test.js:149`; classes: today-only cursor, never
   `nextSessionIdx(`, `classes.test.js:540-542`), so a shared renderer would
   still take per-page marking callbacks — the interesting logic would stay
   duplicated while the string shell moved; (c) both suites source-slice the
   per-page functions heavily (`teacherSlice`/`showTeacherFn`,
   `classesSection`/`classesListBlock`), so moving emission into a shared
   file would force rewriting most of both suites with no browser to catch
   the fallout. Revisit if a third day-group consumer ever appears.
2. **Within-page duplication IS unified** — this issue would otherwise create
   the session-row markup (now/next formula, `color.sessionRow`, tag
   literals, the four shared cells) twice inside `renderWeek`. A local row
   helper single-sources it so the day sections and the full table can never
   drift apart (criterion 7). This is the "remove the need" shape over
   piling up two inline copies.
3. **CSS keyed by pattern, not per-page accumulation.** The narrow block
   already scopes day-group tables structurally — `#detail .day-group table`
   at `styles.css:643` and `:648` — while the desktop gutter hang enumerates
   `table.t-sessions` per page class. The real invariant is: every table
   inside a `.day-group` carries the leading marker gutter and therefore
   hangs it. One selector per rule expresses that; the enumerated list would
   grow by another selector per future day-group table. Behavior today is
   identical (only `t-sessions` and `c-sessions` tables live in day-groups:
   `teachers.js:288`, `classes.js:282`), declarations stay byte-identical,
   and specificity drops from (2 IDs, 2 classes, 1 type) to (2 IDs, 1 class,
   1 type) with no competing desktop rules.
4. **The viewport split stays CSS-only** (one DOM, CSS hides what narrow
   must not show): `classes.test.js:526` actively forbids JS narrow gates
   (`isNarrow` must be gone), so the full table is always emitted and hidden
   on narrow by CSS, exactly like `.weekwrap`.
5. **The flat table iterates the flat list**: `week.sessions` is already
   pinned in `cmpSession` order (`classes.test.js:480-483`), so
   `week.sessions.forEach` over the full table inherits Monday-first order
   and makes "every session exactly once" (rows === `week.sessions.length`)
   structural. Re-using `dayOrder`/`byDay` for a flat table (old c7) would
   couple the last block to grouping internals it does not need; the
   grouping (`dayOrder`/`byDay`) is now built exactly once, for the day
   sections.

**Acceptance criteria**

CSS (`styles.css`):

1. In `@media (min-width: 701px)` (block starts line 394), delete
   `#detail .day-head { display: none; }` with its two-line comment (lines
   449-451). After: no rule anywhere sets `display` on `.day-head`; the base
   rule (374-378) and the narrow margin override (642) stay byte-identical.
2. Delete `#layout > #detail table.c-sessions { display: none; }` with its
   comment (452-454). After: styles.css contains no `table.c-sessions`
   `display: none` rule anywhere.
3. Rewrite the three desktop gutter-hang rules (434-448) to the pattern
   selector, declarations byte-identical, comments kept:
   - `#layout > #detail .day-group table { margin-left: calc(-1 * var(--gutter)); width: calc(100% + var(--gutter)); }`
   - `#layout > #detail .day-group table th:first-child, #layout > #detail .day-group table td:first-child { … }` (declarations unchanged)
   - `#layout > #detail .day-group table .nowtag, #layout > #detail .day-group table .nexttag { … }` (declarations unchanged)
   After: styles.css contains `#layout > #detail .day-group table`, contains
   no `.day-group table.t-sessions`, and still contains no
   `#detail table.t-sessions`. `table.c-all` gets **no** gutter rule (it has
   no marker column and starts at the detail column's left edge).
4. In the classes narrow block (the SECOND `@media (max-width: 700px)`,
   lines 736-751 — note the first narrow block starts at 494), immediately
   beside `#detail .weekwrap { display: none; }` (740), add
   `#detail table.c-all { display: none; }`. Its (id, class, type)
   specificity beats the generic narrow `#detail table { display: block; }`
   (589) regardless of source order. This is the only narrow-CSS change.
5. No other CSS changes: narrow card rules (494-679) including
   `#detail tr:has(th)` (590), base day-group/day-head/dim rules (367-380),
   `#detail tr.now td`/`tr.next td` (328-329), all teachers rules, and the
   `td.c-cell.today`-before-`td.c-cell.now` ordering stay byte-identical
   apart from criterion 3.

JS (`js/classes.js`, `renderWeek` only):

6. Reorder `renderWeek`'s source so the emission markers occur at strictly
   increasing indices: `'<h2>'`, `'<h3 class="day-head">'`,
   `'<section class="day-group'`, `'<div class="weekwrap"'`,
   `'<table class="c-all">'`, `'detail.innerHTML = h;'`. Concretely:
   `var cursor = model.dayCursor(now, store.slots);` and
   `var by = indexByDaySlot(week);` stay at the top of `renderWeek`;
   `var h = '<h2>' + esc(week.name) + '</h2>';` first; then the day-groups
   block (liveDays computation, `var dayOrder = [];`/`var byDay = {};`
   grouping, the emit loop); then the existing `div.weekwrap` grid block
   moved as a whole (cursor div, `c-cell` emission, `store.days` loops all
   byte-identical); then the full table (criterion 8); then
   `detail.innerHTML = h;`.
7. Single-source the session row: declare a local function inside
   `renderWeek` (implementer's name) textually between
   `var liveDays = {};` and the first `'<h3 class="day-head">'` emission —
   i.e. inside `classesListBlock()`'s re-bounded range (criterion 12) and
   inside the part-1 slice of the new behavioral test. It takes
   `(s, dayLabel)` and returns the complete `<tr…>…</tr>`:
   - `isNow = model.isCurrentSession(s.day, s.time, now)`;
     `isNext = !isNow && cursor.visible && s.day === cursor.today && s.time === cursor.next`;
     `cls = color.sessionRow({ isNow: …, isNext: …, dimIdle: false })` —
     exact identifiers `s`, `now`, `cursor.next` (the literals
     `model.isCurrentSession(s.day, s.time, now)` and `s.time === cursor.next`
     must remain inside the `classesListBlock()` range — tests
     `classes.test.js:540-544` assert them there);
   - first cell: plain `<td>` (never a `c-day` class) containing `dayLabel`,
     then — only when marked — a separating space if `dayLabel` is non-empty,
     then the exact tag markup the day-groups use today
     (`<span class="nowtag">● NOW</span>` / `<span class="nexttag">` +
     `NEXT_ARROW` + `NEXT</span>`);
   - then `<td class="c-time">` `esc(s.time)`, `<td class="c-teacher">`
     `esc(s.professor || '—')`, `<td class="c-subject">` `esc(s.subject)`,
     `<td class="c-room">` `esc(s.room || '—')`, closing `</tr>` —
     byte-identical to today's rows.
   The day-groups loop calls it with `dayLabel = ''` (rendered output
   byte-identical to today — the existing behavioral battery must pass
   unmodified); `nextSessionIdx(` must not occur anywhere in
   `js/classes.js`; no `dayStart`, no `prevDay`, no row `dim`.
7b. The stale comment above the day-groups block ("Session card list for
   narrow screens … hidden on desktop by CSS", `js/classes.js:256-257`) must
   be rewritten to describe the shipped behavior: day groups render on every
   viewport (desktop sections above the grid; narrow cards), the grid and
   the full table are hidden on narrow by CSS. After the fix no comment in
   `js/classes.js` may contain the phrase `hidden on desktop`.
8. Full session table, emitted after the grid block:
   `h += '<table class="c-all">'`, then the header as the contiguous literal
   `'<tr><th>Day</th><th>Time</th><th>Teacher</th><th>Subject</th><th>Room</th></tr>'`
   (exactly five columns, no marker gutter column), then
   `week.sessions.forEach(function (s) { h += <row helper>(s, esc(model.frDay(s.day))); })`,
   then the closing `</table>`. Every session of the week appears exactly
   once, in `week.sessions` (cmpSession, Monday-first) order; no `dim`,
   no `daystart`, no `<hr>`, no `weekCount`, no `span class="n"`; the tail
   of `renderWeek` contains exactly one `var byDay = {};`, one
   `var dayOrder = [];` and one `dayOrder.forEach` (the sections loop).
9. `applyCursor`/`startCursor` untouched and selector-based only
   (`td.c-cell`, `th.c-day`, `.cursor`, `.weekwrap` — verified at
   `js/classes.js:312-347` they are position-independent): the weekwrap
   moving later in `#detail` cannot break them. The full table emits no
   `c-cell`, no `th.c-day`, no `data-day`/`data-slot`, so cursor queries
   never match it. NOW/NEXT tags in both list tables are render-time
   snapshots (as today) — do NOT extend `applyCursor` to tick them.
10. `js/teachers.js`, `index.html`, `classes.html`, `Design.md`: zero diff.
11. Comment hygiene: the only required comment change is 7b (plus the CSS
    comments deleted with criteria 1-2). No comment anywhere may claim the
    classes day list/cards are hidden on desktop.

Tests:

12. `test/classes.test.js`:
    a. Re-bound `classesListBlock()` (499-505): keep
       `start = sec.indexOf('var liveDays = {};')`; change `end` from
       `sec.indexOf('detail.innerHTML = h;', start)` to
       `sec.indexOf('<div class="weekwrap"', start)`; keep the `end > start`
       assert.
    b. Every other existing assertion in the file stays byte-for-byte and
       unweakened (507-617 and 619-781), except the explicit inversions and
       additions of 12c below.
    c. In `'styles.css hides the grid/list per viewport and labels teacher
       cells'` (595-617): invert 598 to assert
       `'#layout > #detail table.c-sessions { display: none; }'` is ABSENT;
       keep 600 (narrow weekwrap hide) and the rest; ADD: the exact rule
       `'#detail table.c-all { display: none; }'` exists and its index is
       greater than `css.lastIndexOf('@media (max-width: 700px)')`, and the
       desktop slice (`indexOf('@media (min-width: 701px)')` to
       `indexOf('@media (max-width: 700px)')`) contains no `c-all` at all.
    d. ADD structural test `'renderWeek emits day groups, then the week
       grid, then the full table'`: slice `js/classes.js` from
       `'function renderWeek'` to `'function applyCursor'`; assert strictly
       increasing indices for `'<h2>'`, `'<h3 class="day-head">'`,
       `'<section class="day-group'`, `'<div class="weekwrap"'`,
       `'<table class="c-all">'`, `'detail.innerHTML = h;'`; assert the
       contiguous five-column header literal of criterion 8 is present; in
       the whole classes source assert `var byDay = {};` occurs exactly once
       and `var dayOrder = [];` exactly once and `dayOrder.forEach` exactly
       once; in the slice from `'<div class="weekwrap"'` to
       `'detail.innerHTML = h;'` assert `week.sessions.forEach` occurs;
       assert `nextSessionIdx(` never occurs in `js/classes.js`; assert the
       row helper (a `function` declaration) occurs textually between
       `var liveDays = {};` and the first `'<h3 class="day-head">'` within
       the renderWeek slice.
    e. ADD behavioral test for the full table, mirroring `runClassesList`
       (638-650): same sandbox (`model`, `color`, `esc`, `week`, `cursor`,
       `now`), prepend `classesArrow() + '\nvar h = \'\';\n'`; part 1 =
       `classesListBlock()` (defines the helper and dayOrder/byDay exactly
       as production); part 2 = the slice starting at the FULL statement
       `h += '<table class="c-all">'` through to just before
       `detail.innerHTML = h;` — evaluate part 1 then part 2 in the same vm
       context so `h` accumulates. Fixtures: `week = model.classWeek(groups,
       'GLSI3D1')`, clocks Fri 2026-10-16 12:00 and Sun 2026-10-11 10:00
       (existing `friClass`/`sunClass`). Assert on the tail of `h` from
       `'<table class="c-all"'` onward: exact header row; data rows ===
       `week.sessions.length`; the i-th row's first-cell text (regex
       `/<td>([^<]*)</`, trimmed) equals `model.frDay(week.sessions[i].day)`
       with days Monday-first non-decreasing in `store.days` order; at Fri
       12:00 the `nowtag`/`nexttag` rows equal the `wantNow`/`wantNext` sets
       recomputed with the same formulas as `checkClassesInvariants`; at
       Sunday 10:00 the tail contains no `nowtag`, no `nexttag`, no `dim`;
       the tail contains no `c-day`, no `daystart`, no `<hr`, no
       `class="count"`, no `weekCount`, no `span class="n"`.
13. `test/teacher-daygroups.test.js`:
    a. Replace `'day headings show on mobile only, never on desktop'`
       (307-319) with e.g. `'day headings show on every viewport'`:
       keep the deskStart < narrowStart ordering sanity; assert the desktop
       slice contains **no** `#detail .day-head` at all
       (`desktop.indexOf('#detail .day-head') === -1`); assert no day-head
       hide in the whole file (`!/\.day-head\s*\{\s*display\s*:\s*none/.test(CSS_SRC)`);
       assert the narrow slice still styles `#detail .day-head`
       (the margin override at 642).
    b. In `'styles.css re-scopes the desktop gutter hang to per-group
       tables'` (300-305): change the first assertion to
       `assert.ok(CSS_SRC.indexOf('#layout > #detail .day-group table') !== -1, 'gutter hang must apply per .day-group table')`;
       keep the second (`'#detail table.t-sessions' === -1`) unchanged.
    c. In `'styles.css keeps the classes guards intact'` (396-407): invert
       397 to assert the desktop c-sessions hide is ABSENT
       (`'desktop must keep the classes day tables visible'`); every other
       assertion stays unchanged.
    d. Line 164 (`sec.indexOf("'<td class=\"c-day\">'") === -1` over the
       whole `initClassesPage` section) must remain untouched and green; all
       other tests in the file pass unmodified (including 287-298, whose
       first-occurrence `#detail .day-head` slice keeps resolving to the
       base rule).
14. Verification: `node --test` and `node --test test/*.test.js` → 98 tests,
    0 failures (96 baseline with the 307-319 test replaced, plus the two new
    tests of 12d/12e); `python3 -m http.server 8000` from the worktree root,
    then `curl -s -o /dev/null -w '%{http_code}'` → 200 for `/index.html`,
    `/classes.html`, `/styles.css`, `/js/classes.js`, `/js/teachers.js`,
    `/emplois.csv`.
15. Diff hygiene: only `styles.css`, `js/classes.js`,
    `test/teacher-daygroups.test.js`, `test/classes.test.js` change (plus
    this thread). `Status:` stays `Open` until merge; no git operations by
    the Implementer.

**Risks / constraints**

1. Cursor/applyCursor: `.weekwrap` is no longer `#detail`'s first child —
   cursor code must remain selector-based and order-independent (criterion
   9); `var by = indexByDaySlot(week)` stays before the grid block. Never
   assert or rely on weekwrap-first.
2. Narrow byte-stability: the day-groups' *rendered output* must stay
   byte-identical (helper with `dayLabel = ''`); narrow CSS changes by
   exactly one added line; the DOM reorder is invisible on narrow because
   `.weekwrap` and `table.c-all` are both `display: none` there. No JS
   viewport gates may be introduced (`classes.test.js:526` pins their
   absence).
3. Gutter hang: scoped by the `.day-group table` pattern only (mirrors the
   narrow block's existing pattern rules at 643/648); never unscope to
   `#detail table.*` (test 13b second assertion), never apply it to
   `table.c-all`; declarations byte-identical.
4. Specificity: after criterion 1 no `display` may be set on `.day-head` in
   any block; the full-table narrow hide (id+class+type) beats
   `#detail table { display: block }` and must exist only in the LAST
   narrow block (the file has two `@media (max-width: 700px)` blocks — 494
   and 736; tests slice on the first, criterion 12c asserts via the last);
   `td.c-cell.today` before `td.c-cell.now` must not move; narrow
   `tr:has(th)`/`tr:has(td)` card rules must not be re-scoped.
5. Test bounding helpers are load-bearing: `classesListBlock()` is re-bound
   exactly once (end at the `'<div class="weekwrap"'` marker) and must never
   be widened back; do not rename markers the suites slice on:
   `function renderWeek`, `function applyCursor`, `var liveDays = {};`,
   `'<div class="weekwrap"'`, `detail.innerHTML = h;`, `var byDay = {};`,
   `function initClassesPage`, and the new full-table statement marker
   `h += '<table class="c-all">'`.
6. Row-helper placement: textually between `var liveDays = {};` and the
   first `'<h3 class="day-head">'` — outside that range, test 12b's literals
   (`model.isCurrentSession(s.day, s.time, now)`, `s.time === cursor.next`,
   `color.sessionRow(`, `NEXT_ARROW`, `dimIdle: false`) leave
   `classesListBlock()` and tests 529-546/580-593 fail; the new behavioral
   test's part-1 slice would also stop defining it. Keep the identifiers
   `s`, `now`, `cursor`.
7. Marking semantics: today-only cursor now/next; `nextSessionIdx(` never in
   `js/classes.js`; `dimIdle: false` in the helper; no `dim`/`daystart` in
   the full table; tinted `tr.now`/`tr.next` rely on unchanged base rules
   328-329. Full-table tags are render-time snapshots like the day-group
   rows — extending `applyCursor` to them is out of scope.
8. No `c-day` in classes markup: `teacher-daygroups.test.js:164` and
   `classes.test.js:576` pin its absence — hence the full table's Day cell
   is a plain `<td>`.
9. Teachers page: zero behavioral change — deletion of two display rules
   (the day-head hide removal *restores* the ed552ec behavior) plus the
   gutter selector rewrite (shape only). The t-sessions behavioral battery
   (171-262) and structural tests must pass unmodified.
10. Classes desktop becomes a tall page (day groups + grid + full table); it
    relies on the documented overflow-scroll path (`body[data-page]` height
    100vh, styles.css 402-409). No browser is available to the Implementer:
    note "visually unverified" in the fix entry.
11. Grid fidelity: the `.weekwrap` block moves verbatim — no edits inside it.

### Fix implemented (2026-10-17)

Implemented in worktree `/home/user/.local/share/opencode/worktree/1de5bb/048-day-headings`
on branch `fix/048-day-headings-desktop`, acting on the
`### Maintainer re-evaluation (2026-10-17)` entry (its 15 acceptance criteria
and 11 risks are the spec; where the old triage and the re-evaluation
disagreed, the re-evaluation was followed — notably c3 pattern-selector gutter
hang and c7/c8 `week.sessions.forEach` + shared row helper, not the triage's
selector lists and second `dayOrder.forEach`).

**Diff summary per file** (exact hunks below or described to the line):

- `styles.css` (3 hunks):
  1. In `@media (min-width: 701px)`: deleted the two display hides with their
     comments — `#detail .day-head { display: none; }` and
     `#layout > #detail table.c-sessions { display: none; }` (old 449-454).
  2. Same block: the three gutter-hang rules rewritten from
     `.day-group table.t-sessions` to the pattern selector, declarations
     byte-identical, comments kept (now 434-447):

     ```css
     #layout > #detail .day-group table {
       margin-left: calc(-1 * var(--gutter));
       width: calc(100% + var(--gutter));
     }
     #layout > #detail .day-group table th:first-child,
     #layout > #detail .day-group table td:first-child { /* declarations unchanged */ }
     #layout > #detail .day-group table .nowtag,
     #layout > #detail .day-group table .nexttag { font-size: .78em; vertical-align: middle; }
     ```
  3. In the SECOND narrow block (the classes one), exactly one added line
     beside the weekwrap hide (now 734-735):
     `#detail table.c-all { display: none; }`.
     No other CSS change (narrow rules, base rules, teachers rules,
     `td.c-cell.today`-before-`now` order all byte-identical).
- `js/classes.js` — `renderWeek` only (112 changed lines, one function):
  emission reordered to `<h2>` → day-groups block → `div.weekwrap` grid block
  (moved as a whole, byte-identical — verified old-vs-new source equality) →
  new `table.c-all` → `detail.innerHTML = h;`. `var cursor`/`var by` stay at
  the top. New local helper `function sessionRow(s, dayLabel)` (textually
  between `var liveDays = {};` and the first `'<h3 class="day-head">'`
  emission) single-sources the session row; the day-groups loop calls
  `sessionRow(s, '')` (rendered output byte-identical to before — verified by
  diffing old-vs-new vm renders at both fixture clocks, see below) and the
  full table calls `week.sessions.forEach(function (s) { h += sessionRow(s,
  esc(model.frDay(s.day))); })` after the contiguous header literal
  `'<tr><th>Day</th><th>Time</th><th>Teacher</th><th>Subject</th><th>Room</th></tr>'`.
  The stale "hidden on desktop" comment is rewritten; `applyCursor`/
  `startCursor` byte-identical to `b03ce5b`.
- `test/classes.test.js`: `classesListBlock()` re-bound (end marker
  `'<div class="weekwrap"'`); the c-sessions desktop-hide assert inverted to
  absence + the three new `c-all` narrow/desktop asserts in
  `'styles.css hides the grid/list per viewport…'`; two NEW tests added:
  `'renderWeek emits day groups, then the week grid, then the full table'`
  (structural order + exactly-once grouping + helper placement) and
  `'GLSI3D1 full table lists the whole week: live markers at Fri 12:00, none
  on Sunday'` (vm behavioral, two slices, two clocks). All other assertions
  byte-for-byte untouched.
- `test/teacher-daygroups.test.js`: `'day headings show on mobile only, never
  on desktop'` replaced by `'day headings show on every viewport'`;
  test-301 first assert changed to
  `CSS_SRC.indexOf('#layout > #detail .day-group table') !== -1`;
  `'styles.css keeps the classes guards intact'` line inverted to
  `… c-sessions … }' === -1, 'desktop must keep the classes day tables
  visible'`. Everything else (incl. line 164 `c-day` guard) byte-for-byte.
- `js/teachers.js`, `classes.html`, `index.html`, `Design.md`: zero diff
  (`git diff --exit-code` verified).

**One implementation note (spec vs reality, not papered over)**: criterion
12a's re-bound end marker `sec.indexOf('<div class="weekwrap"', start)` cuts
the source *inside* the emission line `h += '<div class="weekwrap">…`, so
`classesListBlock()` would end with a dangling `h += '` and the vm harness of
the (byte-frozen) `runClassesList` would throw `SyntaxError`. Resolved without
touching any test by placing the grid block's explanatory comment line so that
the marker literal first occurs inside that comment:
`// the week grid <div class="weekwrap"> + red cursor, moved below the day
groups (issue 048): …`. The slice now ends at the comment's `<`, leaving a
valid trailing line-comment; every criterion's literal (marker indices,
12a bounds, 12d order slice, 12e part-1/part-2 slices) holds exactly as
written, and the grid block's own source stays byte-identical (risk 11).

**The 15 criteria, conformance**

1. Desktop `#detail .day-head { display: none; }` + comment deleted; no rule
   anywhere sets `display` on `.day-head` (grep: only base rule 374-378 and
   narrow margin override 636 remain); base rule byte-identical. ✔
2. Desktop `#layout > #detail table.c-sessions { display: none; }` + comment
   deleted; no `table.c-sessions` display:none anywhere. ✔
3. Three gutter-hang rules rewritten to `#layout > #detail .day-group table`
   (declarations byte-identical, comments kept); styles.css contains the
   pattern selector, contains no `.day-group table.t-sessions`, still no
   `#detail table.t-sessions`; `table.c-all` has no gutter rule. ✔
4. `#detail table.c-all { display: none; }` added in the second (classes)
   narrow block, immediately after `#detail .weekwrap { display: none; }`;
   only narrow-CSS change. ✔
5. No other CSS changes (verified via `git diff styles.css` — exactly the
   three hunks above). ✔
6. `renderWeek` source markers at strictly increasing indices `<h2>` →
   `<h3 class="day-head">` → `<section class="day-group` →
   `<div class="weekwrap"` → `<table class="c-all">` → `detail.innerHTML = h;`
   (pinned by the new structural test); `cursor` and `var by =
   indexByDaySlot(week)` stay at the top, before the grid block. ✔
7. Row helper `sessionRow(s, dayLabel)` between `var liveDays = {};` and the
   first `'<h3 class="day-head">'`; exact identifiers `s`/`now`/
   `cursor.next`/`model.isCurrentSession(s.day, s.time, now)` inside the
   re-bounded `classesListBlock()`; day-groups call it with `''` (rendered
   output byte-identical — old-vs-new vm render diff `true` at Fri 12:00 and
   Sun 10:00); `nextSessionIdx(` never occurs; no `dayStart`, no `prevDay`,
   no row `dim`. ✔
7b. Stale comment rewritten; no comment in `js/classes.js` contains
   `hidden on desktop` (grep count 0). ✔
8. Full table after the grid block: literal `h += '<table class="c-all">'`,
   contiguous five-column header literal, `week.sessions.forEach` rows via the
   helper with `esc(model.frDay(s.day))`; data rows === `week.sessions.length`
   (22 = 22 in the behavioral test); no `dim`/`daystart`/`<hr`/`weekCount`/
   `span class="n"`; exactly one `var byDay = {};`, `var dayOrder = [];`,
   `dayOrder.forEach` each (structural test). ✔
9. `applyCursor`/`startCursor` untouched (source byte-compared against
   `b03ce5b`); still selector-based (`td.c-cell`, `th.c-day`, `.cursor`,
   `.weekwrap`); full table emits no `c-cell`/`th.c-day`/`data-day`/
   `data-slot` (behavioral test asserts no `c-day` in the tail); no ticking
   extension added. ✔
10. `js/teachers.js`, `index.html`, `classes.html`, `Design.md` zero diff. ✔
11. Only comment change is 7b (+ its grid-move companion comment required by
    the 12a boundary note above, and the two CSS comments deleted with 1-2);
    no comment claims the day list/cards are hidden on desktop. ✔
12. a. `classesListBlock()` re-bound exactly once (end at
    `'<div class="weekwrap"'`), `end > start` assert kept. b. Every other
    existing assertion byte-for-byte and unweakened (G1/G2/G3, 507-617,
    619-781 — the day-group battery passes on the byte-identical emission).
    c. 598 inverted to absence; 600 kept; added: exact
    `#detail table.c-all { display: none; }` exists after
    `css.lastIndexOf('@media (max-width: 700px)')` and the desktop slice
    contains no `c-all`. d. Structural test added with all listed asserts
    (order, header literal, exactly-once grouping, `week.sessions.forEach`
    in the grid→assign slice, `nextSessionIdx(` absent, helper between
    `liveDays` and the first day-head). e. Behavioral vm test added (same
    sandbox as `runClassesList`, part 1 = `classesListBlock()`, part 2 from
    the full statement `h += '<table class="c-all">'` to before
    `detail.innerHTML = h;`, fixtures `friClass(12,0)`/`sunClass(10,0)`):
    exact header, rows === `week.sessions.length`, Day cell ==
    `frDay(s.day)` Monday-first non-decreasing, now/next sets equal to the
    recomputed formulas, Sunday tail free of `nowtag`/`nexttag`/`dim`, tail
    free of `c-day`/`daystart`/`<hr`/`class="count"`/`weekCount`/
    `span class="n"`. f. `fusion`/`libgroups` and all other tests pass
    unchanged. ✔
13. `node --test test/*.test.js` and bare `node --test` → **98 tests, 98
    pass, 0 fail** (baseline before the change: 96/96, verified first). Serve
    `python3 -m http.server` from the worktree root: `curl -s -o /dev/null
    -w '%{http_code}'` → **200** for `/index.html`, `/classes.html`,
    `/styles.css`, `/js/classes.js`, `/js/teachers.js`, `/emplois.csv`
    (served on port 8017 to avoid colliding with other worktrees' servers;
    same command shape). ✔
14. Diff hygiene verified via `git status --porcelain` (output below):
    exactly `styles.css`, `js/classes.js`, `test/classes.test.js`,
    `test/teacher-daygroups.test.js` modified + this issue file (untracked,
    thread appended). `Status:` stays `Open`; no git operations performed
    beyond read-only `status`/`diff`/`show`. ✔

**Verification evidence (verbatim)**

```
node --test test/*.test.js   → # tests 98 / # pass 98 / # fail 0
node --test                  → # tests 98 / # pass 98 / # fail 0
(base run before edits       → # tests 96 / # pass 96 / # fail 0)
curl (python3 -m http.server, port 8017):
index.html 200 · classes.html 200 · styles.css 200 · js/classes.js 200 ·
js/teachers.js 200 · emplois.csv 200
node vm cross-checks vs b03ce5b:
  day-groups rendered output identical (fri 12:00): true | len 4986
  day-groups rendered output identical (sun 10:00): true | len 4798
  weekwrap grid block byte-identical: true
  applyCursor/startCursor byte-identical: true
  full h top-level order: h2 → h3+section ×6 → div.weekwrap → table.c-all
  full-table data rows 22 === week.sessions.length 22
  fri: nowtag 1, nexttag 1; sun: nowtag 0, nexttag 0; no c-day/daystart/dim
git status --porcelain:
 M js/classes.js
 M styles.css
 M test/classes.test.js
 M test/teacher-daygroups.test.js
?? issues/048-day-headings-desktop.md
```

**Visually unverified (risk 10)**: no browser is available to the
Implementer, so everything visual is **visually unverified** — the desktop
teachers headings (Barboura jeudi/vendredi/samedi), the classes desktop order
(h2 → sections → grid → full table), the gutter hang of the classes day
tables, the tall-page overflow-scroll path, and the narrow screens' byte-stable
cards are all asserted only by node-level source/render checks and the test
suite, not by pixels. `Status:` stays `Open` until the main agent merges.

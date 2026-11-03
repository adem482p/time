# 049: Show only the whole-week grid on the classes page

- Status: Fixed
- Date: 2026-10-17, Reporter: user

## Description

Observed: on **classes.html**, after the per-day tables, the detail area ends
with **two** extra tables (verified in a real browser at 1024×800, class
`GLSI3D1`):

1. the **week grid** — `<div class="weekwrap"><table class="week">`, whose
   header row is two gutter cells plus one `<th>` per weekday
   (`lundi mardi mercredi jeudi vendredi samedi`), i.e. the **days are the
   columns** and the six slots are the rows; it is closed by the
   `<div class="cursor">` line and `</div>` (`js/classes.js:281-315`);
2. the **flat full-session list** — `<table class="c-all">`, whose **first
   column is the day** (`Day / Time / Teacher / Subject / Room` header, one
   `<tr>` per session of the week) (`js/classes.js:320-325`).

Both are present and **both are visible on desktop**. Measured in Chrome at
1024×800 with `GLSI3D1` selected, `#detail` has exactly 15 element children:

```
h2 "LCS3-GLSI_D Groupe 1"
h3.day-head lundi      + section.day-group.dim > table.c-sessions
h3.day-head mardi      + section.day-group.dim > table.c-sessions
h3.day-head mercredi   + section.day-group.dim > table.c-sessions
h3.day-head jeudi      + section.day-group.dim > table.c-sessions
h3.day-head vendredi   + section.day-group.dim > table.c-sessions
h3.day-head samedi     + section.day-group.dim > table.c-sessions
div.weekwrap            (display: block, 517×535, top y=1253)  ← table.week (1100px wide) + div.cursor
table.c-all             (display: table, 517×1055, top y=1797, 23 rows = header + 22 sessions)
```

The six day tables are visible (`display: table`, e.g. 589px wide), so the two
trailing tables sit after them: the grid starts 16px below the last
`section.day-group` (bottom y=1237) and the flat list starts 8px below the
grid (bottom y=1789); the document scrolls to y=2851. There is **no heading
of any kind** between the last day group and `.weekwrap`, and none before
`table.c-all` — the only headings on the page are the `h2` class name and the
six `h3.day-head`.

Narrow (600×800, same selection): `.weekwrap` computes `display: none` and
`table.c-all` computes `display: none` (`styles.css:734-735`); the day cards
stay visible. No change is requested there.

Expected: at the end of the classes detail only the **days-as-columns** week
grid (`div.weekwrap` / `table.week`) is included, as the section named
**"WHOLE WEEK"**; the flat `table.c-all` (first column = day) is no longer
part of the page. Narrow-screen behavior (day cards visible, grid and full
table hidden) stays as it is.

Incidental observations from the same session, **not** part of this report:
with a class selected at 1024×800 the page also scrolls horizontally
(`document.documentElement.scrollWidth` 1568 vs 1024 viewport; 1024 on the
empty state) because `table.week` measures 1100px inside its 517px
`.weekwrap`; and the only console entry is a `favicon.ico` 404.

## Root cause

Both trailing tables are emitted unconditionally by `renderWeek`
(`js/classes.js:217-331`), which `showClass` calls at `js/classes.js:393`;
`detail.innerHTML = h` is `js/classes.js:326`. Source order of the emitted
string (= DOM order):

| # | element | emitted by |
|---|---------|-----------|
| 1 | `<h2>` class name | `js/classes.js:220` |
| 2 | per-day `h3.day-head` + `section.day-group` + `table.c-sessions` | loop `js/classes.js:267-276` (heading `:268`, section `:269`, table `:270-271`, rows `:272-274`, close `:275`) |
| 3 | `div.weekwrap` > `table.week` + `div.cursor` — days as **columns** | open `js/classes.js:281`, grid body `:282-311`, cursor `:312-314`, close `:315` |
| 4 | `table.c-all` — flat list, day as first **column** | open `js/classes.js:320`, header `:321`, rows `:322-324` (`sessionRow(s, esc(model.frDay(s.day)))`), close `:325` |

So `renderWeek` builds three table shapes: the per-day `table.c-sessions`
(:270), the week grid `table.week` (:281) and the flat `table.c-all` (:320).
Tables 3 and 4 are the two the report describes — they are not two renderings
of one table but two distinct blocks, both appended to `h` with no condition
and no viewport gate (`test/classes.test.js:526` actively requires `isNarrow`
to be absent from `js/classes.js`). The `:316-319` comment states the design
that shipped with issue 048: the flat table is the "Plain full session
table… like the grid it is display:none on narrow screens", and `:277-280`
states the day groups come first, then the grid, then the full table
(`issues/048-day-headings-desktop.md`, criteria 6-8).

Visibility rules (`styles.css`):

- Base `#detail table { border-collapse: collapse; width: 100%; margin-top: .5rem; }`
  (`styles.css:321`) — sets no `display`.
- The desktop block `@media (min-width: 701px)` (`styles.css:394-449`) contains
  **no** `display` rule for `.weekwrap`, `table.week` or `table.c-all` (it only
  styles the `.day-group` tables at `:434-448` and sets `#layout > #detail {
  overflow-x: visible; }` at `:433`), which is why both trailing tables render
  at their default `display` above 700px — exactly what the browser measured.
- Grid styling lives at `.weekwrap` `styles.css:695`, `table.week` `:696-712`,
  `.cursor` `:716-727`.
- The classes narrow block `@media (max-width: 700px)` (`styles.css:730-746`)
  sets `#detail .weekwrap { display: none; }` (`:734`) **and**
  `#detail table.c-all { display: none; }` (`:735`) — i.e. the flat full table
  is **already `display: none` on narrow screens**, confirmed by computed style
  at 600px. (The generic narrow rules `#detail table, #detail tbody { display: block; }`
  at `:583` and `#detail tr:has(th) { display: none; }` at `:584` also apply,
  but are moot for these two tables since they are hidden above.)

Tests that pin the current behavior (baseline verified: `node --test` → 98
tests, 98 pass, 0 fail):

- `test/classes.test.js:796-829` — requires emissions at strictly increasing
  indices: `'<h2>'`, `'<h3 class="day-head">'`, `'<section class="day-group'`,
  `'<div class="weekwrap"'`, `'<table class="c-all">'`,
  `'detail.innerHTML = h;'` (marker list `:803-804`), plus
  `week.sessions.forEach` between the grid and the assignment (`:818-821`).
- `test/classes.test.js:836-913` — behavioral full-table suite:
  `runClassesFullTable` slices the source from `h += '<table class="c-all">'`
  (`:845`), `checkFullTable` asserts the table is emitted (`:861-862`), and
  `'GLSI3D1 full table lists the whole week…'` (`:905-913`) asserts its
  markers/rows.
- `test/classes.test.js:595-617` — requires the narrow hide
  `#detail table.c-all { display: none; }` to exist inside a narrow block
  (`:602-606`), forbids any `c-all` rule in the desktop block (`:611-612`),
  and requires the narrow weekwrap hide (`:600-601`).
- `test/classes.test.js:547-548` — the grid `table.week` must be kept.
- `test/teacher-daygroups.test.js:400-401` — the narrow
  `#detail .weekwrap { display: none; }` must stay.

## Repro steps

Commands (from the worktree root
`/home/user/.local/share/opencode/worktree/1de5bb/049-whole-week`):

```
python3 -m http.server 8000
node --test                 # baseline: 98 tests, 98 pass, 0 fail
curl -s -o /dev/null -w '%{http_code}' http://localhost:8000/classes.html   # 200
```

URLs + clicks:

1. **Desktop (>700px)** — open http://localhost:8000/classes.html with the
   window at 1024×800, type `GLSI` into "Search class (LCS, GLSI3D1…)" and
   click `GLSI3D1 — LCS3-GLSI_D Groupe 1` in the list. Observed: below the six
   day tables `#detail` shows the week grid (`div.weekwrap` / `table.week`,
   days as columns, `display: block`) **and then** `table.c-all` (flat list
   starting with a `Day` column, `display: table`); both visible, page scrolls
   to y≈2851. Expected: only the days-as-columns grid remains, as the section
   named "WHOLE WEEK"; no `table.c-all`.
2. **Narrow (≤700px)** — keep the selection and resize to 600×800. Observed:
   day cards visible; `.weekwrap` and `table.c-all` both `display: none`.
   Expected: unchanged.

## Discussion

### Maintainer decision (2026-10-17)

Round 1 — final decision, no outstanding requests; the Implementer may act on
the criteria below. I verified the Reporter's analysis directly (emission
sites `js/classes.js:217-331`, visibility rules `styles.css:199/394-449/695-727/730-735`,
and every pinned test range) — it is accurate as written, including the
baseline of 98/98 passing tests.

**Verdict**

- **VALID, in scope, as requested — with one deliberate carve-out (the
  horizontal scroll) and the 048 rollback question resolved as a legitimate
  revision, not a regression.**
- *The issue-048 rollback question.* The flat `table.c-all` exists purely
  because the Reporter's binding design answers in issue 048 (answer 1:
  "…→ a plain full session table listing every session of the week as the
  LAST element") specified it; it was not solving a defect. Its information
  content is fully duplicated: on desktop every session was rendered **three
  times** (the per-day `table.c-sessions`, the `table.week` grid, and the flat
  list), and the flat list added no interaction of its own — same render-time
  NOW/NEXT tags as the day tables, no filtering, no cursor. 048's *real*
  outcomes — teachers day headings restored, classes day sections visible on
  desktop (c-sessions desktop hide deleted), the grid moved below the day
  sections, the pattern-keyed `.day-group table` gutter hang, the single-
  sourced session-row helper, the CSS-only viewport split — all stand
  untouched by 049; only the trailing append is removed. The same authority
  (the user) filed both issues, 049 is later-dated and explicit, and the
  revision *removes* surface area (a block of JS, a CSS rule, a whole test
  suite) instead of piling up state — exactly the direction the charter
  prefers. So 049 supersedes 048's design answer 1 tail; it does not damage
  048.
- *Docs.* Out of scope, same as 048: `classes.html`'s meta descriptions ("see
  its whole week grid") and `Design.md`'s Classes section (which describes
  only the grid and never mentioned the flat table) become *more* accurate
  after this fix. Zero diff to both.
- *The incidental horizontal scroll (documentElement.scrollWidth 1568 at
  1024px): OUT of scope for 049 — file a separate issue.* Reasoning: (a) the
  Reporter flagged it as incidental and 049 changes no grid geometry —
  `table.c-all` was 517px wide inside the 517px column, so deleting it changes
  neither `.weekwrap`'s width nor the document's scroll width; (b) fixing it
  is a genuine design decision with history it must not bulldoze: issue 047
  deliberately removed a `.weekwrap { overflow-x: auto; }` override
  (`test/classes.test.js:614` pins its absence), desktop
  `#layout > #detail { overflow-x: visible; }` exists on purpose for the
  gutter hang (`styles.css:433`), and the red cursor spans
  `wrap.scrollWidth` (`js/classes.js:370`) — reintroducing a scroll container
  interacts with cursor geometry and needs its own triage. Recommend the
  coordinator file e.g. "#050: whole-week grid overflows the detail column on
  desktop".

**Architectural direction**

1. *One DOM, CSS decides visibility* (the page's standing convention;
   `classes.test.js:526` forbids `isNarrow` in the JS). The WHOLE WEEK label
   is always emitted; a one-line narrow rule hides it beside the grid's own
   narrow hide. No wrappers, no JS gates, no special cases.
2. *The label reuses the existing heading vocabulary with one distinguishing
   class:* `<h3 class="day-head week-head">WHOLE WEEK</h3>`, emitted as the
   contiguous literal immediately before the `div.weekwrap` block, as a
   **sibling** — mirroring the `h3.day-head` + `section.day-group` "label
   immediately precedes what it labels" shape. The base `#detail .day-head`
   rule (`styles.css:374-378`) gives it the small-uppercase section-label look
   on desktop for free; the second class `week-head` is not decoration but a
   necessity: (a) it is the handle the narrow hide keys on, and (b) it keeps
   it out of the day-heading vocabulary — `checkClassesInvariants`' regex
   `classHeadingsOf` pins "exactly one `<h3 class="day-head">` per distinct
   day", and a plain `class="day-head"` label would both break that equality
   and have no way to hide it on narrow without a display rule on `.day-head`
   itself (which `teacher-daygroups.test.js:315` forbids). The text is the
   literal uppercase `WHOLE WEEK` the user named.
3. *Rejected alternatives*: (a) heading inside `.weekwrap` (would avoid one
   CSS line but puts a section label inside the cursor's positioning context
   and the grid's scroll box — wrong shape for the box's job); (b) a
   `<section>` wrapper around label+grid hidden as a unit (more DOM churn and
   it would delete `#detail .weekwrap { display: none; }`, which
   `teacher-daygroups.test.js:400-401` pins as an invariant). The one added
   narrow rule next to the existing weekwrap hide is the minimal, conventional
   expression.
4. *The flat table dies completely*: its emission block, its comment, its
   narrow CSS rule (dead selector once gone), its dedicated behavioral test
   suite, and every assertion that pinned it. No compatibility shim, no
   leftover `c-all` string anywhere in `js/classes.js` or `styles.css`
   (new tests pin that absence).
5. *The sessionRow helper survives, simplified.* It no longer serves two
   callers, but it still isolates the now/next marking + tag markup in one
   named place, and the suites pin its existence and placement — so it stays
   as `function sessionRow(s)` with the now-meaningless `dayLabel` parameter
   and its two dependent lines deleted (with `dayLabel` always `''` in the
   day groups, the emitted rows stay byte-identical). A vestigial always-
   empty parameter would be exactly the kind of residue that misleads the
   next reader into hunting for a second caller.

Resulting desktop `#detail` DOM order (the grid block itself is untouched):

```
#detail
  h2                                (class name)
  h3.day-head × n                   (one per non-empty day, Monday-first)
  section.day-group × n             (each holding its table.c-sessions)
  h3.day-head.week-head "WHOLE WEEK"    ← new label, sibling before the grid
  div.weekwrap                      (table.week + div.cursor — unchanged)
  …                                 (nothing — table.c-all removed)
```

**Acceptance criteria**

CSS (`styles.css`):

1. In the classes narrow block (`@media (max-width: 700px)` starting line
   730), delete `#detail table.c-all { display: none; }` (line 735). After the
   change, `styles.css` contains no `c-all` anywhere.
2. In the same block, immediately beside the byte-identical
   `#detail .weekwrap { display: none; }` (line 734), add the exact rule
   `#detail .week-head { display: none; }`. It must occur exactly once, after
   `css.lastIndexOf('@media (max-width: 700px)')`. It must NOT be written as
   `#detail .day-head`, `#detail .day-head.week-head` or anything containing
   the substring `.day-head {` with a display declaration (would trip
   `teacher-daygroups.test.js:315`).
3. No other CSS change: the narrow weekwrap hide stays byte-identical
   (`teacher-daygroups.test.js:400-401`), the base `#detail .day-head` rule
   (374-378) and its narrow margin override (636) stay byte-identical, the
   grid/cursor rules (695-727) and the desktop block (394-449) stay
   byte-identical. No desktop rule is added or changed — the base day-head
   styling already gives the label its look.

JS (`js/classes.js`, `renderWeek` only):

4. Delete the flat-table emission in full: the comment at lines 316-319 and
   the five statements at 320-325 (`h += '<table class="c-all">';` …
   `h += '</table>';`). After the change, `js/classes.js` contains no `c-all`
   and no `<th>Day</th>`.
5. Rewrite the grid comment (lines 277-280) to drop both "full table"
   mentions and keep the load-bearing marker. Replace it exactly with:

   ```js
   // the week grid <div class="weekwrap"> + red cursor (days as columns),
   // after the day sections (issue 048). Desktop labels it WHOLE WEEK below;
   // on narrow screens the label and this grid are display:none — the day
   // cards are the whole narrow view.
   ```

   Constraints: the literal `<div class="weekwrap"` must still first occur on
   the comment's FIRST line (before the real emission line), so
   `classesListBlock()`'s slice still ends there, inside a valid line comment
   (it is executed in a vm — the slice must stay syntactically valid).
6. Immediately after that comment, emit the label as the contiguous literal
   `h += '<h3 class="day-head week-head">WHOLE WEEK</h3>';` — exactly once in
   the file, before `h += '<div class="weekwrap">…`.
7. Fix the day-groups comment (lines 221-230): replace the phrase "the grid
   and the full table below are display:none on narrow" (lines 223-224) with
   "the whole-week label and grid below are display:none on narrow". After the
   change, no comment in `js/classes.js` may contain the phrase `full table`
   or `hidden on desktop`.
8. Simplify the session-row helper (lines 238-258): rewrite the comment
   (238-240) to e.g. "One session row for the day-group tables: the first cell
   is the NOW/NEXT tag when marked (the heading already names the day).";
   change the declaration to `function sessionRow(s)`; delete the `dayLabel +`
   line and the `(dayLabel && (isNow || isNext) ? ' ' : '')` line from the
   return; change the day-groups call site (line 273) to
   `h += sessionRow(s);`. The rendered day-group rows must stay byte-identical
   (old-vs-new vm render at Fri 12:00 and Sun 10:00 equal). The helper stays a
   `function` declaration textually between `var liveDays = {};` and the first
   `'<h3 class="day-head">'` emission; the identifiers `s`, `now`, `cursor`
   and the literals `model.isCurrentSession(s.day, s.time, now)`,
   `s.time === cursor.next`, `color.sessionRow(`, `NEXT_ARROW`,
   `dimIdle: false` stay inside that range (tests slice on them).
9. Final emission order in `renderWeek`: strictly increasing source indices
   for `'<h2>'`, `'<h3 class="day-head">'`, `'<section class="day-group'`,
   `'<h3 class="day-head week-head">WHOLE WEEK</h3>'`,
   `'<div class="weekwrap"><table class="week">'`, `'detail.innerHTML = h;'`.
   (`var cursor`/`var by = indexByDaySlot(week)` stay at the top; the grid
   block interior — thead/tbody/cell emission and the `div.cursor` line — is
   byte-identical; `applyCursor`/`startCursor` are byte-identical.)

Tests (`test/classes.test.js` only — `test/teacher-daygroups.test.js` takes a
zero diff and must pass unmodified):

10. DELETE the full-table suite: `runClassesFullTable` (836-854),
    `checkFullTable` (856-903), the test `'GLSI3D1 full table lists the whole
    week…'` (905-913), the section comment at 794 and the harness comment
    831-835. KEEP `classRowTime` (used by the day-group battery at 752),
    `classesArrow()` (used by `runClassesList`) and every other helper.
11. REWRITE the structural test (796-829), e.g. `'renderWeek emits day
    groups, then the WHOLE WEEK label, then the week grid'`: strictly
    increasing indices in the `function renderWeek`→`function applyCursor`
    slice for the six markers of criterion 9; `count(src, '<h3
    class="day-head week-head">WHOLE WEEK</h3>') === 1`; ADD absence asserts
    `src.indexOf('<table class="c-all">') === -1`,
    `src.indexOf('<th>Day</th>') === -1`, `src.indexOf('c-all') === -1`, and
    `count(slice, 'week.sessions.forEach') === 2` (liveDays + day grouping —
    the third occurrence was the flat table's). DELETE the five-column header
    literal assert (810-811) and the `week.sessions.forEach` grid→assign
    assert (818-821). KEEP the `var byDay = {};`/`var dayOrder = [];`/
    `dayOrder.forEach` exactly-once counts, the `nextSessionIdx(` absence and
    the helper-placement assert (823-828).
12. MODIFY `'styles.css hides the grid/list per viewport…'` (595-617), e.g.
    renamed to `'styles.css hides the week grid per viewport and labels
    teacher cells'`: DELETE the two c-all-narrow-hide asserts (602-606) and
    the desktop no-c-all assert (611-612); ADD `css.indexOf('c-all') === -1`
    and, with the exact literal, `css.indexOf('#detail .week-head { display: none; }') !== -1`
    plus its index > `css.lastIndexOf('@media (max-width: 700px)')`. KEEP
    everything else byte-for-byte (598-599 desktop c-sessions visible,
    600-601 narrow weekwrap hide, 613-627).
13. EXTEND `checkClassesInvariants` (after the 731-734 block) with two
    boundary pins: `assert.ok(html.indexOf('week-head') === -1, key + ': the WHOLE WEEK label stays outside the day-list block');`
    and `assert.ok(html.indexOf('c-all') === -1, …)`. (The label emission sits
    after `classesListBlock()`'s end marker, so the day-group behavioral
    battery keeps rendering exactly the day groups; `classHeadingsOf`'s
    "one h3 per distinct day" equality stays honest because the label carries
    the second class.)
14. Everything else in both files passes byte-for-byte unmodified: the
    day-group battery (`checkClassesInvariants` core, 529-593, 775-786), the
    leaf/commit/G1/G2/G3 suites, `classesListBlock()`'s bounds (499-505), the
    isNarrow prohibition (526), and the whole `teacher-daygroups` suite
    (including 164's `c-day` guard, 307-320's every-viewport headings, 397-407
    classes guards).
15. Verification: `node --test` and `node --test test/*.test.js` → **97
    tests, 97 pass, 0 fail** (98 baseline − the one deleted full-table test);
    `python3 -m http.server 8000` from the worktree root, `curl -s -o /dev/null
    -w '%{http_code}'` → 200 for `/index.html`, `/classes.html`, `/styles.css`,
    `/js/classes.js`, `/js/teachers.js`, `/emplois.csv`.
16. Diff hygiene: only `js/classes.js`, `styles.css`, `test/classes.test.js`
    change (plus this thread). `js/teachers.js`, `classes.html`, `index.html`,
    `Design.md`, `test/teacher-daygroups.test.js` zero diff. `Status:` stays
    `Open` until merge; no git operations by the Implementer.

**Risks / constraints**

1. `classesListBlock()`'s end marker is load-bearing (048's implementation
   note): the literal `<div class="weekwrap"` must keep first occurring inside
   the rewritten grid comment's first line, before the real emission, and the
   sliced block must stay vm-valid (it currently ends mid-comment at the
   marker's `<`; keep that property).
2. The label MUST carry the second class (`day-head week-head`). Emitted as
   plain `class="day-head"` it breaks `classHeadingsOf`'s one-heading-per-day
   equality (`checkClassesInvariants`) and has no narrow-hide handle without a
   forbidden `.day-head` display rule.
3. The `isNarrow` prohibition (`classes.test.js:526`) stands: the label is
   always emitted; only CSS hides it, exactly like `.weekwrap`.
4. Narrow screens: the day cards' visible output is byte-identical (the
   sessionRow simplification is output-neutral; the label and grid are both
   `display:none`; the flat table is gone from the DOM but was already
   invisible there). The narrow weekwrap hide and all card rules stay
   byte-identical.
5. Cursor invariant: `div.cursor` stays inside `.weekwrap` (its absolute
   positioning parent); the grid block moves for nothing and edits nothing
   inside; `applyCursor`/`startCursor` stay selector-based and untouched; the
   label emits no `c-cell`, no `th.c-day`, no `data-day`/`data-slot`, so no
   cursor query can ever match it.
6. Siblings: `table.c-all`/`table.week` exist only on the classes page
   (verified repo-wide; teachers.js has its own inline row code using
   `color.sessionRow`, time/matrix have neither) — `js/teachers.js` and the
   other pages take zero diff and their suites pass unmodified.
7. Test-slicing markers the suites depend on and must not be renamed:
   `function renderWeek`, `function applyCursor`, `var liveDays = {};`,
   `'<div class="weekwrap"'` (in the comment), `detail.innerHTML = h;`,
   `var byDay = {};`, `var dayOrder = [];`, `dayOrder.forEach`,
   `function initClassesPage`, `color.sessionRow(`, `NEXT_ARROW`.
8. Desktop page height shrinks by the removed table (~1055px) but remains
   taller than the viewport; it relies on the same documented document-scroll
   path as before (styles.css 394-409) — unchanged. No browser is available
   to the Implementer: note "visually unverified" in the fix entry.
9. The horizontal-scroll observation stays out of scope (verdict above); do
   not "fix" it in this issue — no overflow, width or wrap rule may change.

### Fix implemented (2026-10-17)

**Where the previous Implementer left off.** It had already completed every
code and test edit required by criteria 1–14 (`js/classes.js`, `styles.css`,
`test/classes.test.js`) and died before appending this entry. This agent
audited the working tree criterion-by-criterion against the decision above and
found nothing incomplete or wrong: **no code change was needed** — every line of
the diff below is the previous agent's work, verified here against all 16
criteria; this agent added only the verification (criteria 15–16) and this
entry. `Status:` untouched; no git operations were run by the Implementer.

**Exact diff** (a/ = pristine pre-change `main`, b/ = this worktree):

```diff
--- a/js/classes.js
+++ b/js/classes.js
@@ -220,8 +220,8 @@
       var h = '<h2>' + esc(week.name) + '</h2>';
       // Per-day session groups, rendered on every viewport: desktop shows the
       // sections above the week grid, narrow screens shape them into cards
-      // (teacher-style, via the generic mobile table rules; the grid and the
-      // full table below are display:none on narrow). One day-group section
+      // (teacher-style, via the generic mobile table rules; the whole-week
+      // label and grid below are display:none on narrow). One day-group section
       // per non-empty day, Monday-first, mirroring showTeacher — the day
       // lives in the heading once, so there is no Day column and `dim`
       // moves to the section. Row marking mirrors showTeacher with
@@ -235,10 +235,9 @@
             (cursor.visible && s.day === cursor.today && s.time === cursor.next))
           liveDays[s.day] = true;
       });
-      // One session row, shared by the day-group tables and the full table
-      // below: the Day cell holds dayLabel (empty in the day groups — the
-      // heading already names the day) plus the NOW/NEXT tag when marked.
-      function sessionRow(s, dayLabel) {
+      // One session row for the day-group tables: the first cell is the
+      // NOW/NEXT tag when marked (the heading already names the day).
+      function sessionRow(s) {
         var isNow = model.isCurrentSession(s.day, s.time, now);
         var isNext = !isNow && cursor.visible && s.day === cursor.today && s.time === cursor.next;
         var cls = color.sessionRow({
@@ -246,8 +245,6 @@
           dimIdle: false
         });
         return '<tr' + (cls.length ? ' class="' + cls.join(' ') + '"' : '') + '><td>' +
-          dayLabel +
-          (dayLabel && (isNow || isNext) ? ' ' : '') +
           (isNow ? '<span class="nowtag">● NOW</span>' : '') +
           (isNext ? '<span class="nexttag">' + NEXT_ARROW + 'NEXT</span>' : '') +
           '</td><td class="c-time">' + esc(s.time) +
@@ -270,14 +267,15 @@
         h += '<table class="c-sessions"><tr><th></th><th>Time</th>' +
           '<th>Teacher</th><th>Subject</th><th>Room</th></tr>';
         byDay[day].forEach(function (s) {
-          h += sessionRow(s, '');
+          h += sessionRow(s);
         });
         h += '</table></section>';
       });
-      // the week grid <div class="weekwrap"> + red cursor, moved below the day
-      // groups (issue 048): desktop reads the day sections first, then the
-      // grid, then the full table; on narrow screens both the grid and the
-      // full table are display:none.
+      // the week grid <div class="weekwrap"> + red cursor (days as columns),
+      // after the day sections (issue 048). Desktop labels it WHOLE WEEK below;
+      // on narrow screens the label and this grid are display:none — the day
+      // cards are the whole narrow view.
+      h += '<h3 class="day-head week-head">WHOLE WEEK</h3>';
       h += '<div class="weekwrap"><table class="week"><thead><tr>';
       h += '<th class="cgutter"></th><th class="timecol"></th>';
       store.days.forEach(function (d) {
@@ -313,16 +311,6 @@
         (cursor.visible ? '' : ' style="display:none"') +
         '><div class="cursor-arrow"></div></div>';
       h += '</div>';
-      // Plain full session table: every session of the week exactly once
-      // (week.sessions is already in cmpSession, Monday-first order), five
-      // columns Day/Time/Teacher/Subject/Room with the NOW/NEXT tag inside
-      // the Day cell; like the grid it is display:none on narrow screens.
-      h += '<table class="c-all">';
-      h += '<tr><th>Day</th><th>Time</th><th>Teacher</th><th>Subject</th><th>Room</th></tr>';
-      week.sessions.forEach(function (s) {
-        h += sessionRow(s, esc(model.frDay(s.day)));
-      });
-      h += '</table>';
       detail.innerHTML = h;
       if (layout) layout.classList.remove('is-list');
       syncClear();
--- a/styles.css
+++ b/styles.css
@@ -732,7 +732,7 @@
      cards by the generic mobile rules above) instead of the desktop week
      grid. */
   #detail .weekwrap { display: none; }
-  #detail table.c-all { display: none; }
+  #detail .week-head { display: none; }
   /* the class list flattens exactly like the teacher list */
   #classList { max-width: none; max-height: none; border: 0; overflow: visible; }
   #classList li {
--- a/test/classes.test.js
+++ b/test/classes.test.js
@@ -592,24 +592,23 @@
   assert.ok(colorSrc.indexOf('dayStart') !== -1, 'color.js dayStart key must stay');
 });
 
-test('styles.css hides the grid/list per viewport and labels teacher cells', function () {
+test('styles.css hides the week grid per viewport and labels teacher cells', function () {
   var css = readPage('styles.css');
-  // desktop shows the card list; narrow hides the grid and the full table
+  // desktop shows the day tables; narrow hides the WHOLE WEEK label and grid
   assert.ok(css.indexOf('#layout > #detail table.c-sessions { display: none; }') === -1,
     'desktop must keep the classes day tables visible');
   assert.ok(css.indexOf('#detail .weekwrap { display: none; }') !== -1,
     'missing narrow weekwrap hide');
-  assert.ok(css.indexOf('#detail table.c-all { display: none; }') !== -1,
-    'missing narrow full-table hide');
-  assert.ok(css.indexOf('#detail table.c-all { display: none; }') >
+  assert.ok(css.indexOf('#detail .week-head { display: none; }') !== -1,
+    'missing narrow WHOLE WEEK label hide');
+  assert.ok(css.indexOf('#detail .week-head { display: none; }') >
     css.lastIndexOf('@media (max-width: 700px)'),
-    'the full-table hide must live in a narrow block');
+    'the WHOLE WEEK label hide must live in a narrow block');
+  assert.ok(css.indexOf('c-all') === -1, 'the flat full table is gone from the CSS');
   var deskStart = css.indexOf('@media (min-width: 701px)');
   var narrowStart = css.indexOf('@media (max-width: 700px)');
   assert.ok(deskStart !== -1 && narrowStart !== -1 && deskStart < narrowStart,
     'expected desktop block before narrow block');
-  assert.ok(css.slice(deskStart, narrowStart).indexOf('c-all') === -1,
-    'no c-all rule in the desktop block');
   // the dead scroll-grid overrides are gone
   assert.ok(css.indexOf('.weekwrap { overflow-x: auto; }') === -1);
   assert.ok(css.indexOf('min-width: 42rem') === -1);
@@ -732,6 +731,9 @@
   assert.ok(html.indexOf('Day</th>') === -1, key + ': no Day header');
   assert.ok(html.indexOf('daystart') === -1, key + ': no daystart class');
   assert.ok(html.indexOf('<hr') === -1, key + ': no rule elements');
+  // the WHOLE WEEK label and the flat full table stay outside the day-list block
+  assert.ok(html.indexOf('week-head') === -1, key + ': the WHOLE WEEK label stays outside the day-list block');
+  assert.ok(html.indexOf('c-all') === -1, key + ': no flat full-table markup in the day groups');
 
   // row total == week.sessions.length; per-table header cells match data cells
   assert.strictEqual(html.split('<td class="c-time">').length - 1, week.sessions.length,
@@ -791,9 +793,9 @@
   assert.ok(src.indexOf('span class="n"') === -1, 'no count badge in class rows');
 });
 
-// ---- full session table (issue 048) -------------------------------------------
+// ---- whole-week label + grid (issue 049) -------------------------------------
 
-test('renderWeek emits day groups, then the week grid, then the full table', function () {
+test('renderWeek emits day groups, then the WHOLE WEEK label, then the week grid', function () {
   var src = fs.readFileSync(path.join(ROOT, 'js/classes.js'), 'utf8');
   var start = src.indexOf('function renderWeek');
   var end = src.indexOf('function applyCursor');
@@ -801,24 +803,29 @@
   var slice = src.slice(start, end);
   var prev = -1;
   ['<h2>', '<h3 class="day-head">', '<section class="day-group',
-   '<div class="weekwrap"', '<table class="c-all">', 'detail.innerHTML = h;'].forEach(function (m) {
+   '<h3 class="day-head week-head">WHOLE WEEK</h3>',
+   '<div class="weekwrap"><table class="week">', 'detail.innerHTML = h;'].forEach(function (m) {
     var at = slice.indexOf(m);
     assert.ok(at !== -1, 'renderWeek must emit ' + m);
     assert.ok(at > prev, 'renderWeek emissions must be in order at ' + m);
     prev = at;
   });
-  assert.ok(slice.indexOf('<tr><th>Day</th><th>Time</th><th>Teacher</th><th>Subject</th><th>Room</th></tr>') !== -1,
-    'full table must carry the five-column header');
-  // grouping is built exactly once, for the day sections
   function count(hay, needle) { return hay.split(needle).length - 1; }
+  assert.strictEqual(count(src, '<h3 class="day-head week-head">WHOLE WEEK</h3>'), 1,
+    'the WHOLE WEEK label must be emitted exactly once');
+  // the flat full table is gone: no emission, no leftovers anywhere
+  assert.ok(src.indexOf('<table class="c-all">') === -1, 'no c-all table emission');
+  assert.ok(src.indexOf('<th>Day</th>') === -1, 'no five-column Day header left');
+  assert.ok(src.indexOf('c-all') === -1, 'no c-all string anywhere in classes.js');
+  // only two week.sessions.forEach walks remain in renderWeek: the liveDays
+  // computation and the day grouping (the third was the flat table's)
+  assert.strictEqual(count(slice, 'week.sessions.forEach'), 2,
+    'exactly two week.sessions.forEach in renderWeek (liveDays + day grouping)');
+  // grouping is built exactly once, for the day sections
   assert.strictEqual(count(src, 'var byDay = {};'), 1, 'byDay must be declared exactly once');
   assert.strictEqual(count(src, 'var dayOrder = [];'), 1, 'dayOrder must be declared exactly once');
   assert.strictEqual(count(src, 'dayOrder.forEach'), 1,
     'exactly one dayOrder.forEach (the sections loop)');
-  var gridToAssign = slice.slice(slice.indexOf('<div class="weekwrap"'),
-    slice.indexOf('detail.innerHTML = h;'));
-  assert.ok(gridToAssign.indexOf('week.sessions.forEach') !== -1,
-    'the full table must iterate week.sessions');
   assert.ok(src.indexOf('nextSessionIdx(') === -1, 'must not use the wrapping nextSessionIdx');
   // the session-row helper is declared between liveDays and the first day-head
   var liveAt = slice.indexOf('var liveDays = {};');
@@ -827,87 +834,3 @@
   assert.ok(/function \w+\(/.test(slice.slice(liveAt, headAt)),
     'session-row helper must be declared between liveDays and the day-head emission');
 });
-
-// The full table is straight-line HTML building over (week, cursor, now) like
-// the day-groups block, so it is driven the same way in a vm sandbox: part 1
-// (the re-bounded list block) defines the shared session-row helper exactly as
-// production does, part 2 appends the full table in the same context so h
-// accumulates.
-function runClassesFullTable(week, now) {
-  var cursor = model.dayCursor(now, store.slots);
-  var sandbox = {
-    console: console,
-    model: model, color: color, esc: data.esc,
-    week: week, cursor: cursor, now: now
-  };
-  vm.createContext(sandbox);
-  var part1 = classesListBlock();
-  var start = CLASSES_SRC.indexOf("h += '<table class=\"c-all\">'");
-  var end = CLASSES_SRC.indexOf('detail.innerHTML = h;', start);
-  assert.ok(start !== -1 && end !== -1 && end > start, 'full table bounds');
-  var part2 = CLASSES_SRC.slice(start, end);
-  vm.runInContext(classesArrow() + '\nvar h = \'\';\n' + part1,
-    sandbox, { filename: 'classes-fulltable-part1' });
-  var html = vm.runInContext(part2 + '\nh;', sandbox,
-    { filename: 'classes-fulltable-part2' });
-  return { html: html, cursor: cursor };
-}
-
-function checkFullTable(key, clock) {
-  var week = model.classWeek(groups, key);
-  assert.strictEqual(week.leaves.length, 1, key + ' must resolve to one leaf');
-  var res = runClassesFullTable(week, clock);
-  var html = res.html, cursor = res.cursor;
-  var at = html.indexOf('<table class="c-all">');
-  assert.ok(at !== -1, 'full table must be emitted');
-  var tail = html.slice(at);
-  // exact five-column header, no marker gutter column
-  assert.ok(tail.indexOf('<tr><th>Day</th><th>Time</th><th>Teacher</th>' +
-    '<th>Subject</th><th>Room</th></tr>') !== -1,
-    key + ': full table must carry the five-column header');
-  var dataRows = tail.split('<tr').slice(1).filter(function (r) { return r.indexOf('<td') !== -1; });
-  assert.strictEqual(dataRows.length, week.sessions.length,
-    key + ': every session of the week appears exactly once');
-  // Day cell == frDay(session day), Monday-first non-decreasing in store order
-  var rank = {};
-  main(store.days).forEach(function (d, i) { rank[d] = i; });
-  dataRows.forEach(function (r, i) {
-    var s = week.sessions[i];
-    var cell = (/<td>([^<]*)</.exec(r) || [])[1];
-    assert.strictEqual(cell.trim(), model.frDay(s.day),
-      key + ': row ' + i + ' Day cell must be the session day name');
-    if (i) assert.ok(rank[week.sessions[i - 1].day] <= rank[s.day],
-      key + ': rows must stay Monday-first');
-  });
-  // now/next markers recomputed with the same today-only cursor formulas
-  var wantNow = {}, wantNext = {};
-  week.sessions.forEach(function (s) {
-    var isNow = model.isCurrentSession(s.day, s.time, clock);
-    var isNext = !isNow && cursor.visible && s.day === cursor.today && s.time === cursor.next;
-    if (isNow) wantNow[s.day + '|' + s.time] = true;
-    else if (isNext) wantNext[s.day + '|' + s.time] = true;
-  });
-  var gotNow = {}, gotNext = {};
-  dataRows.forEach(function (r, i) {
-    var key2 = week.sessions[i].day + '|' + classRowTime(r);
-    if (r.indexOf('nowtag') !== -1) gotNow[key2] = true;
-    if (r.indexOf('nexttag') !== -1) gotNext[key2] = true;
-  });
-  assert.deepStrictEqual(gotNow, wantNow, key + ': NOW rows match cursor logic');
-  assert.deepStrictEqual(gotNext, wantNext, key + ': NEXT rows match cursor logic');
-  // plain table: no day-group leftovers or chrome
-  ['c-day', 'daystart', '<hr', 'class="count"', 'weekCount', 'span class="n"'].forEach(function (tok) {
-    assert.ok(tail.indexOf(tok) === -1, key + ': full table must not carry ' + tok);
-  });
-  return { tail: tail, week: week };
-}
-
-test('GLSI3D1 full table lists the whole week: live markers at Fri 12:00, none on Sunday', function () {
-  var fri = checkFullTable('GLSI3D1', friClass(12, 0));
-  assert.ok(fri.tail.indexOf('nowtag') !== -1, 'expected a NOW marker');
-  assert.ok(fri.tail.indexOf('nexttag') !== -1, 'expected a NEXT marker');
-  var sun = checkFullTable('GLSI3D1', sunClass(10, 0));
-  assert.ok(sun.tail.indexOf('nowtag') === -1, 'nothing is NOW on Sunday');
-  assert.ok(sun.tail.indexOf('nexttag') === -1, 'nothing is NEXT on Sunday');
-  assert.ok(sun.tail.indexOf('dim') === -1, 'the full table never dims');
-});
```

**Criteria checklist (1–16)**

1. **CSS c-all hide deleted** — ✅ the `@media (max-width: 700px)` block no
   longer contains `#detail table.c-all { display: none; }`; node/grep confirm
   `styles.css` contains no `c-all` anywhere (`css.indexOf('c-all') === -1`).
2. **`#detail .week-head { display: none; }` added** — ✅ directly beside the
   byte-identical `#detail .weekwrap { display: none; }` (lines 734-735),
   exactly once, with index > `css.lastIndexOf('@media (max-width: 700px)')`;
   not written on `.day-head` — a scan shows no `.day-head` selector in
   `styles.css` carries a `display:` declaration, and the unmodified
   `teacher-daygroups.test.js` passes.
3. **No other CSS change** — ✅ the styles.css diff above is the one line;
   base `#detail .day-head` rule, its narrow margin override, grid/cursor
   rules and the desktop block are byte-identical; no desktop rule added.
4. **Flat-table emission deleted in full** — ✅ comment + five statements gone;
   `src.indexOf('c-all') === -1` and `src.indexOf('<th>Day</th>') === -1`.
5. **Grid comment rewritten exactly** — ✅ byte-compared against the four
   mandated lines; the literal `<div class="weekwrap"` still first occurs on
   the comment's FIRST line (before the real emission), so
   `classesListBlock()` still ends `… // the week grid ` inside an unterminated
   line comment — asserted vm-valid with `new vm.Script`.
6. **Label emitted as the contiguous literal** — ✅
   `h += '<h3 class="day-head week-head">WHOLE WEEK</h3>';` occurs exactly once,
   immediately after the comment and before `h += '<div class="weekwrap">…`.
7. **Day-groups comment fixed** — ✅ now reads "…the whole-week label and grid
   below are display:none on narrow…"; no comment (indeed no text) in
   `js/classes.js` contains `full table` or `hidden on desktop`.
8. **Helper simplified** — ✅ `function sessionRow(s)` with the new comment;
   `dayLabel` has 0 occurrences in the file (declaration, `dayLabel +` line and
   `(dayLabel && …)` line all gone); call site is `h += sessionRow(s);`;
   rendered day-group rows byte-identical (evidence below); the helper stays
   between `var liveDays = {};` and the first `'<h3 class="day-head">'`
   emission with `s`, `now`, `cursor`,
   `model.isCurrentSession(s.day, s.time, now)`, `s.time === cursor.next`,
   `color.sessionRow(`, `NEXT_ARROW`, `dimIdle: false` all inside that range.
9. **Emission order** — ✅ strictly increasing source indices for `'<h2>'`,
   `'<h3 class="day-head">'`, `'<section class="day-group'`, the WHOLE WEEK
   literal, `'<div class="weekwrap"><table class="week">'`,
   `'detail.innerHTML = h;'`; `var cursor`/`var by` stay at the top; the grid
   interior, the `div.cursor` line and `applyCursor`/`startCursor` are
   byte-identical to pre-change (slice comparison, node-asserted).
10. **Full-table suite deleted** — ✅ `runClassesFullTable`, `checkFullTable`,
    the `'GLSI3D1 full table lists the whole week…'` test, the old section
    comment and the harness comment are gone (grep: no matches);
    `classRowTime` and `classesArrow()` kept and still used.
11. **Structural test rewritten** — ✅ `'renderWeek emits day groups, then the
    WHOLE WEEK label, then the week grid'`: six-marker strictly-increasing
    order, `count(src, '<h3 class="day-head week-head">WHOLE WEEK</h3>') === 1`,
    absence asserts for `<table class="c-all">`, `<th>Day</th>` and `c-all`,
    `count(slice, 'week.sessions.forEach') === 2`; five-column-header assert
    and grid→assign forEach assert deleted; `var byDay = {};`,
    `var dayOrder = [];`, `dayOrder.forEach` counts, `nextSessionIdx(` absence
    and the helper-placement assert kept.
12. **CSS viewport test modified** — ✅ renamed to `'styles.css hides the week
    grid per viewport and labels teacher cells'`; the two c-all narrow-hide
    asserts and the desktop no-c-all assert deleted; `css.indexOf('c-all') === -1`
    and the exact `#detail .week-head { display: none; }` literal plus its
    `lastIndexOf('@media (max-width: 700px)')` placement assert added;
    desktop c-sessions visible, narrow weekwrap hide and the 613-627 range kept
    byte-for-byte.
13. **`checkClassesInvariants` extended** — ✅ lines 735-736 add the two
    boundary pins, the week-head message exactly
    `key + ': the WHOLE WEEK label stays outside the day-list block'`.
14. **Everything else byte-for-byte** — ✅ the test diff contains only the three
    specified hunks (day-group battery, G1/G2/G3, leaf/commit suites,
    `classesListBlock()` bounds, `isNarrow` prohibition untouched);
    `test/teacher-daygroups.test.js`, `js/teachers.js`, `classes.html`,
    `index.html`, `Design.md` are byte-identical (`cmp` clean).
15. **Verification numbers** — ✅ `node --test` → **97 tests, 97 pass, 0 fail**;
    `node --test test/*.test.js` → **97/97/0** (the pristine pre-change
    checkout measured 98/98/0 with the same commands: 98 − the one deleted
    full-table test = 97; no expectation was adjusted);
    `curl` → **200** for all six URLs (list below).
16. **Diff hygiene** — ✅ recursive file comparison against the pristine
    checkout shows only `js/classes.js`, `styles.css`, `test/classes.test.js`
    changed plus this issue file; the five named siblings are byte-identical;
    `Status:` stays `Open`; no git operations were run.

**Verification results** (from the worktree root; no browser available)

- `node --test` → `# tests 97 / # pass 97 / # fail 0`;
  `node --test test/*.test.js` → same: 97 / 97 / 0.
- Dev server `python3 -m http.server 8000`, `curl -s -o /dev/null -w '%{http_code}'`:
  `/index.html` → 200, `/classes.html` → 200, `/styles.css` → 200,
  `/js/classes.js` → 200, `/js/teachers.js` → 200, `/emplois.csv` → 200.
- **Byte-identity evidence**: vm-loaded the real page stack (`js/data.js`,
  `js/libgroups.js`, `js/model.js`, `js/match.js`, `js/color.js`) against the
  real `emplois.csv` from BOTH this worktree and the pristine pre-change
  checkout, extracted each version's day-list block (the same
  `var liveDays = {};` … `<div class="weekwrap"` slice the tests use) and
  rendered `GLSI3D1` with a stubbed clock at **Friday 2026-10-16 12:00** and
  **Sunday 2026-10-11 10:00**: `assert.strictEqual(newHtml, oldHtml)` holds at
  both clocks (28 `<tr>` each = 6 header rows + 22 session rows), the row
  arrays are `deepStrictEqual`, and every session row's first cell is exactly
  `''`, `<span class="nowtag">● NOW</span>` or the NEXT-tag span — no empty
  leading-cell / day-label drift, i.e. the `sessionRow` simplification is
  output-neutral.
- Further node assertions (all pass): `src.indexOf('c-all') === -1`,
  `src.indexOf('<th>Day</th>') === -1`, the WHOLE WEEK literal occurs exactly
  once in `js/classes.js`, `css.indexOf('c-all') === -1` in `styles.css`,
  `#detail .week-head { display: none; }` exactly once and after
  `css.lastIndexOf('@media (max-width: 700px)')`, no `.day-head` selector
  carries a `display:` declaration, the six emission markers are strictly
  ordered with `count(slice, 'week.sessions.forEach') === 2`, the grid-block
  interior + cursor line + `applyCursor`/`startCursor` are byte-identical to
  pre-change, and the `classesListBlock()` slice vm-parses.
- **Visually unverified**: no browser is available to the Implementer (risk 8);
  verification is structural and over HTTP only. The out-of-scope
  horizontal-scroll observation was left untouched — no overflow, width or
  wrap rule changed (risk 9).


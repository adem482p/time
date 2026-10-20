# 054: Structural coverage gaps — the live ticker, the time/matrix pages, and the CSV parser

- Status: Open
- Date: 2026-10-19, Reporter: user

## Description

The suite (`node --test test/*.test.js` — 4 files, verified **103 pass / 0
fail** in this worktree) is green while three whole areas of the codebase have
no behavioral coverage at all. Every claim below was re-verified by grep/read
against this tree on 2026-10-19; the *defect that slipped through* is cited as
prior executed evidence from the coordinator's bug hunt (not re-executed here).

### Observed

**1. The classes page's 30-second ticker is never executed or asserted.**

- The ticker is real code: `startCursor` schedules
  `setInterval(function () { applyCursor(model.dayCursor(new Date(), store.slots)); }, 30000)`
  (`js/classes.js:362-367`; `applyCursor` itself `js/classes.js:~324-360`;
  `stopCursor` `:368-370`). It is the only `setInterval` in `js/`
  (grep-verified: `js/classes.js:364` and nowhere else).
- No test executes it. Grepping `test/` for `setInterval|startCursor|stopCursor|cursorTimer|dayCursor(new Date`
  returns **zero matches**. The only `applyCursor` occurrence in the whole
  suite is a *source-string slice bound* — `src.indexOf('function applyCursor')`
  at `test/classes.test.js:868`, used to bound the structural `renderWeek`
  slice test (`:865-911`).
- Behavioral tests instead drive emission through `classesListBlock()`
  (`test/classes.test.js:537-543`), a source slice from `var liveDays = {};`
  to `<div class="weekwrap"`, executed in a vm sandbox with **injected
  stubbed clocks**. The clock is therefore always frozen at render time; the
  "live" path — re-reading `new Date()` on a timer and re-applying state — is
  pinned only as text.
- Consequence, prior executed evidence (coordinator's bug hunt, this cycle):
  issue **#051** — a live contradiction defect in exactly this area (the
  ticker-driven cursor/grid state diverging from the once-computed list
  markers) — **passed 103/103**. #051 is being fixed in parallel in another
  worktree; this issue does not restate its content, but any new coverage must
  cover the **POST-#051 live-update behavior on both classes and teachers**
  (note: `js/teachers.js` currently has **no** ticker at all — grep-verified —
  so the post-#051 shape of teachers-side live updates is whatever the #051
  fix establishes; the tests here must be written against that outcome, not
  against today's snapshot).

**2. `time.html` / `timetable.html` / `js/app.js` have zero coverage.**

- No test reads any of the three files, nor `index.html` (the teachers page —
  naming per issue #050). Every `readFileSync` site in `test/` was enumerated:
  the shared vm stacks load `js/data.js`, `js/libgroups.js`, `js/model.js`,
  `js/match.js` (`test/classes.test.js:23-31`, same pattern in
  `test/fusion.test.js` and `test/teacher-daygroups.test.js:23-41`);
  `test/libgroups.test.js` additionally reads `js/libgroups.js` as
  `SOURCE_PATH` (`:17`, used `:265`); page-level reads are `js/classes.js`,
  `js/teachers.js`, `js/color.js`, `styles.css`, and `classes.html` via
  `readPage()` (`test/classes.test.js:424`, used at `:427`, `:456`, `:462`).
  That is the complete list. `readPage('index.html')`,
  `readPage('time.html')`, `readPage('timetable.html')` and any read of
  `js/app.js` occur **nowhere**.
- So the entire time-page marker logic is untested: `initTimePage`
  (`js/app.js:34-134`) with `todayNextSlot` (`:48-55` — today-only next slot,
  null on Sunday / after the last slot), `marksFor` (`:58-63`), the Sunday
  info line (`:87-92`), the "Day over — no more sessions today." line
  (`:101-107`), the click-to-`show()` detail table with fused rows and pills
  (`:110-129`), and the status line (`:133`); likewise the matrix renderer
  `initTimetablePage` (`:138-170`) — header row, day filter, teacher search
  filter, per-cell fused content — and the `boot` dispatch (`:176-182`).
- Two stale artifacts testify that this area drifted out of the suite's
  attention rather than being consciously excluded: a test *named*
  `'app.js selects leaves only (no broader classes)'` (`test/classes.test.js:545`)
  actually inspects `js/classes.js` source (`classesSection()`, `:529-533`) —
  a leftover name from when that logic lived in `app.js` — and
  `test/teacher-daygroups.test.js:4` still says "showTeacher is a closure
  inside js/app.js" while its `APP_SRC` (`:39`) reads `js/teachers.js`.

**3. `data/extract.py` (598 lines) has no self-checks and no test.**

- `wc -l data/extract.py` → **598**; grepping it for `assert` (or any
  self-check) returns **zero matches**; no file in `test/` mentions
  `extract.py` (grep-verified).
- Yet `extract.py` produces `emplois.csv`, the site's **single source of
  truth** (AGENTS.md: every page reads it and nothing else; verified header
  `professor,day,time,room,subject,field,week,source,color`). A
  schema-shape regression from the parser (a renamed column, a day leaking in
  English, `week` carrying `S1`, an uppercase/hex-less color) would sail
  through all 103 tests, because the suite's CSV reader is a tolerant RFC-4180
  parser that indexes columns by header name and never validates their
  vocabulary.

### Expected

Per AGENTS.md's verification standards — "Data/logic changes: exercise the
real logic in `node` against the real CSV (row counts, grouping, search
queries, date-boundary cases with a stubbed clock)"; "Page changes: re-serve
and `curl` for 200; assert template/CSS structure by parsing the HTML in node
with DOM stubs where needed" — the suite should:

1. **Execute** (not just string-pin) the live-update path, post-#051, and
   assert list/grid/teachers/time agreement after a tick;
2. cover `js/app.js`'s time and matrix pages with the same stubbed-clock
   behavioral style the classes page already enjoys, plus the same
   template-structure style `classes.html` already enjoys — for
   `index.html`, `time.html` and `timetable.html`;
3. guard the parser's output contract, so a schema regression in
   `data/extract.py` (or a hand-edit of `emplois.csv`) fails a test instead
   of failing the site.

## Root cause

Not an oversight in any one place — a structural property of how the suite
grew. It grew **page-by-page around vm-slice harnesses**:

- Each page-shaped issue (046–050) extended `test/classes.test.js` (and later
  `test/teacher-daygroups.test.js`) with a *source-slice harness*: cut the
  page file at marker strings (`classesSection()` `test/classes.test.js:529-533`,
  `classesListBlock()` `:537-543`, the `renderWeek` slice `:865-870`), eval
  the slice in a vm sandbox with an injected `now`, assert on the emitted
  HTML. This is an excellent harness for *render-time* behavior — hence the
  strong day-group/grid/marker coverage — but it structurally cannot reach
  code that runs **outside** the sliced functions: the `setInterval` callback
  and `applyCursor` live after the slice bounds, so they were only ever
  reachable via string pins (`:868`), and string pins are what got written.
- The ticker (`js/classes.js:362-367`) was added for live behavior but the
  suite's only lever was the source-string assert, so its *runtime* behavior
  was never pinned — the #051 defect class passed 103/103 (prior executed
  evidence).
- `js/app.js`, `time.html` and `timetable.html` are the **oldest** pages
  (the header comment `js/app.js:1-7` records that teachers/classes *moved
  out* to their own files); they predate the harness conventions, and no issue
  since then touched them, so nothing ever grew around them. The stale test
  name (`classes.test.js:545`) and stale comment
  (`teacher-daygroups.test.js:4`) are fossils of that move.
- `data/extract.py` lives in a different language and a different workflow
  (run manually against `data/pdfs/` when timetables change); the node suite
  only ever consumes its *output*. No test validates the output's schema, and
  the script itself has no assertions, so nothing in the loop can catch a
  shape regression.

## Proposed coverage additions (shape only — to be scoped by a future maintainer)

These are concrete, actionable enumerations of what "closing the gap" looks
like. They are proposals, not acceptance criteria.

1. **Live-update behavioral test (post-#051), classes + teachers.** A
   clock-injected test that runs the *real* live-update path end-to-end (the
   post-#051 equivalent of render → advance the stubbed clock across a slot
   boundary → invoke the scheduled callback) and then asserts **agreement**
   across every surface: the day-group NOW/NEXT/dim markers, the grid's
   `c-day today` column and `div.cursor` position/state on classes, the
   teachers list's markers, and the time page's marks (see item 2). The
   invariant to pin: after any tick, no surface may claim a slot is NOW while
   another claims it is over. Written against the post-#051 code shape —
   if #051 changes the ticker mechanism, the test drives the new mechanism.
2. **`test/app.test.js` (new file).** Load `js/app.js` in the vm-stack style
   of the existing suites (it is a plain `TT.app` IIFE, `js/app.js:8-9`,
   sandbox-friendly — its own `isCoarsePointer` guard already anticipates a
   node environment, `:21-25`), stub `document`/DOM minimally, and drive
   `initTimePage(store, modelObjs)` with stubbed clocks through at least:
   - **before** the first slot (exactly one `nexttag`, correct `nowtag`
     absent),
   - **during** a slot (exactly one `nowtag`, exactly one `nexttag`),
   - **after the last slot** (no marks; the "Day over — no more sessions
     today." `li.info`, `js/app.js:101-107`),
   - **Sunday** (the "No sessions on Sunday — showing the full week." info
     line `:87-92`, no `today` bucket, no marks),
   - bucket counts (`countOf`, `:42-44`) vs the real CSV, the status line
     (`:133`), the `show()` detail table (fused rows + pills; and the empty
     "No sessions …" path, `:116-118`).
   And drive `initTimetablePage(store, modelObjs)`: header row = Teacher +
   all slots, one row per teacher, cell contents match `store.sessionsOf`,
   the `dayFilter` and `search` filters shrink the matrix as the render
   function specifies (`:145-169`).
3. **Template/structure tests for `index.html`, `time.html`,
   `timetable.html`** mirroring the existing `classes.html` test
   (`test/classes.test.js:426-452`): correct `data-page` attribute
   (`teachers`/`time`/`matrix`), the expected `<script>` stack (all three
   load `js/app.js`-era stack; `time.html:21`, `timetable.html:30` verified),
   required element ids (`#slotList`, `#detail`, `#status`, `#matrix`,
   `#dayFilter`, `#search`, `#themeCycle` …), nav links to the sibling pages,
   and the SEO head bits (meta description / theme-color / canonical), same as
   the classes test does. This also retires the two stale fossils (the
   `'app.js selects leaves only'` test name in `classes.test.js:545` and the
   `teacher-daygroups.test.js:4` comment) as a natural side effect.
4. **`extract.py` smoke + always-on CSV schema guard.**
   - *Smoke*: run `data/extract.py` on **one** PDF from `data/pdfs/` (it
     already shells out per-PDF, `pdf_to_xml` `data/extract.py:53`, and writes
     via `csv.DictWriter` with explicit `fieldnames`, tail of `main()`) and
     assert the produced CSV's schema: exact header
     `professor,day,time,room,subject,field,week,source,color`; `day` ∈ the
     six French school days; `time` ∈ the slot vocabulary (`\d{2}h\d{2}-\d{2}h\d{2}`
     matching `store.slots`); `week` ∈ `{'', 'SA', 'SB'}` and never `S1`
     (AGENTS.md: `S1` is a semestre label stripped at parse time); `color`
     empty or lowercase `#rrggbb`; `source` non-empty and naming a real PDF
     page.
   - *Always-on guard*: a cheap node test that schema-validates the committed
     `emplois.csv` itself with the same rules, so a hand-edit regression is
     caught even on machines without the PDF toolchain. (The existing suite
     parses the CSV but never validates its shape — a renamed column would
     currently produce an empty store and, depending on the test, possibly
     still pass structural pins.)

Scope guard: coverage targets **live behavior only**. In particular, nothing
in this issue should give test coverage to dead exports — see the interaction
with #055 below.

## Interaction with #055 (cleanup-dead-code, filed in parallel)

#055 identifies dead code slated for **removal**, e.g.
`match.parseExactQuery` / `match.exactQuery` (defined `js/match.js:604,651`,
exported `:684`) and the unused `var index = match.buildIndex(store, modelObjs)`
in `js/app.js`'s `boot` (`js/app.js:178` — never passed to either page
init). **These must NOT be given coverage.** Writing tests for symbols that
#055 wants removed would convert a cleanup into a breaking change and pin
cruft in place; removal is the preferred treatment for dead code. Whoever
implements this issue must first check #055's outcome and scope every new
test to behavior that is (a) live today or (b) introduced by the post-#051
fix — never to code on the removal list.

## Repro steps

From the worktree root
`/home/user/.local/share/opencode/worktree/1de5bb/054-test-coverage`:

```
# baseline: 103 tests, 103 pass, 0 fail
node --test test/*.test.js

# gap 1: the ticker is never executed — only one string-pin mention in the suite
grep -rn 'setInterval\|startCursor\|stopCursor\|cursorTimer\|dayCursor(new Date' test/
#   -> no matches
grep -rn 'applyCursor' test/
#   -> test/classes.test.js:868 only (a source-string slice bound)

# gap 2: no test reads app.js / time.html / timetable.html / index.html
grep -rn "readFileSync" test/          # -> js/{data,libgroups,model,match,classes,teachers,color}.js, styles.css, classes.html, emplois.csv — nothing else
grep -rn "time\.html\|timetable\.html\|'index\.html'\|js/app\.js" test/
#   -> only stale comments/names (classes.test.js:545, teacher-daygroups.test.js:4), no reads

# gap 3: the parser has no self-checks and no test references it
wc -l data/extract.py                  # -> 598
grep -n 'assert' data/extract.py       # -> no matches
grep -rn 'extract\.py' test/           # -> no matches
```

The suite stays 103/103 green with all three gaps standing; the concrete
proof of the blind spot is that the #051 live-contradiction defect passed
103/103 (prior executed evidence, coordinator's bug hunt this cycle).

## Discussion

*(empty — filed for record per the coordinator; intentionally not triaged or
implemented in this round)*

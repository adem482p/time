# 055: Clean dead code and dead documentation

- Status: Fixed
- Date: 2026-10-19, Reporter: user

## Description

User directive (binding): **"clean dead code and dead documentation"**.

### Observed

Five clusters of dead code / dead documentation, each verified by execution
(greps over the whole worktree, full-file reads) on 2026-10-19 in this
worktree (`/home/user/.local/share/opencode/worktree/1de5bb/055-cleanup-dead-code`,
baseline `node --test` = **103 tests, 103 pass, 0 fail**):

1. **Dead code in `js/match.js` — the committed exact-query machinery.**
   `parseExactQuery` (`js/match.js:604-643`) and `exactQuery`
   (`js/match.js:651-678`) are defined and exported (`js/match.js:684`) but
   have **zero callers anywhere**. A repo-wide grep for
   `parseExactQuery|exactQuery` returns exactly three hits, all inside
   `js/match.js` itself: the two definitions (`:604`, `:651`) and the export
   entry (`:684`). No HTML page, no page JS, and no test references them; the
   export object (`js/match.js:680-687`) is a plain literal and nothing
   anywhere does computed access (`match[...]`). A previous change dropped
   the committed-query surface from the pages but kept the machinery: the
   pages' search paths use only `searchSections`/`classSearch`/`suggest`/
   `highlightHTML`/`shadowText` (`js/teachers.js:187-530`,
   `js/classes.js:182-601`). The section comment
   `// ---- committed exact queries (issue 010 semantics) ----` and its
   grammar block (`js/match.js:596-603`) plus the `exactQuery` doc comment
   (`js/match.js:645-650`) are dead documentation inside the code.

2. **Unused index built on every time/matrix page load.**
   `js/app.js:178` — `var index = match.buildIndex(store, modelObjs);` inside
   `boot(store)`. The variable `index` is **never referenced again in the
   file** (full read of `js/app.js:1-192`): `initTimePage` (`:34-134`) uses
   only `store`, `modelObjs`, `model`, `color`, `esc`; `initTimetablePage`
   (`:138-170`) uses only `store`, `model`, `esc`. Neither page searches
   teachers/classes the way the teachers/classes pages do. `buildIndex` is a
   pure construction (`js/match.js:43-90` — builds maps/arrays, mutates
   nothing), so the call is a pure per-page-load cost: on every visit to
   `time.html` or `timetable.html` it builds entry rows for every teacher,
   every subject and **every grouping node with its descendant raws**
   (`js/match.js:61-78`) and throws the result away. Removing it also
   strands `var match = TT.match;` at `js/app.js:11` (the only other `match`
   occurrence in the file is the header comment at `:6`).

3. **Stale documentation in `Design.md` — the Classes service section.**
   `Design.md:175-187` still describes the pre-046/047/049 interior-prefix +
   union behaviour. The stale sentences (`Design.md:177-180`):

   > "The class is chosen through a live search over the grouping hierarchy:
   > any named class is selectable, whether fully specified or an interior
   > prefix, and a broader class shows the union of every timetable beneath
   > it, each line labelled with the class it comes from."

   The code is intentionally **leaf-only** and the code decision is blessed
   (issues 046/047/049): `js/classes.js:58-60` states "Leaf-only selection …
   Interior nodes (broader classes) are excluded everywhere below",
   `leafSet` is built from `groups.leaves` (`js/classes.js:61-62`), and
   `leafRows` filters every class surface (`js/classes.js:467,475,500,601`);
   the single-leaf commit/show gates are pinned at
   `test/classes.test.js:558-559`, and the union machinery's *absence* is
   pinned at `test/classes.test.js:561-564` (`s-class`, `isUnion`,
   `orderedDays`, `isNarrow` must not appear in `js/classes.js`). So the doc
   is the stale side; the rest of the section (grid, cursor, slot
   highlighting, `Design.md:180-187`) is still accurate. Issue 050's
   maintainer already flagged this as pre-existing drift
   (`issues/050-start-day-groups-from-today.md:313-315`).

4. **Favicon 404 on every page.** No `<link rel="icon">` exists in any of
   the four HTML files (grep `rel="icon"|favicon` over the whole repo: the
   only hit is `issues/049-whole-week-only.md:58`, which recorded the same
   404 in a browser console). No favicon asset exists either (`assets/`
   holds only `preview.png` and `preview.svg`). Every page load therefore
   produces a `GET /favicon.ico → 404` in the console. Head sections:
   `index.html:3-30` (canonical `:28`, stylesheet `:29`), `classes.html:3-30`
   (canonical `:28`, stylesheet `:29`), `time.html:3-8` (stylesheet `:7`),
   `timetable.html:3-8` (stylesheet `:7`) — a declaration belongs in each
   `<head>`, e.g. before the stylesheet link.

5. **Two stale test fossils** from the page-JS split (teachers/classes pages
   moved out of `js/app.js` into `js/teachers.js` / `js/classes.js` — see the
   `js/app.js:3-4` header):
   - `test/classes.test.js:545` — test **name** `'app.js selects leaves only
     (no broader classes)'`, but the body reads `js/classes.js`
     (`classesSection()` at `:529-533` reads the file at `:530`). The same
     fossil also sits in comments/assert messages in that file:
     `:480` ("filters the match layer down to leaves in app.js"),
     `:501` ("filtering lives in app.js"), `:510` ("(app.js filters them)").
   - `test/teacher-daygroups.test.js:4-6` — stale header comment: "showTeacher
     is a closure inside js/app.js, so the behavioral tests drive the real
     function source (breakdownHTML + treeHTML + showTeacher slice)…". The
     tests actually load `js/teachers.js` as `APP_SRC`
     (`test/teacher-daygroups.test.js:39`); `showTeacher` lives in
     `js/teachers.js` (`:254`), not `js/app.js`.

**Secondary finding (same directive, for the Maintainer to scope):**
`js/match.js:681-686` exports seven identifiers that no consumer outside
`match.js` ever uses via `match.*`: `resolveClass`, `mergeRanges`,
`tokenScore`, `fuzzyRanges`, `liveSearch`, `parseQuery`,
`completionContext` (all internally live — e.g. `:230,242,317,167-246,
268,327,389,392,527` — verified by grep: external callers use only
`buildIndex`, `highlightHTML`, `suggest`, `shadowText`, `searchSections`,
`classSearch`). Whether the export *entries* prune with the rest is a design
decision (module API surface vs minimal exports; note `js/color.js:51`
mentions `match.liveSearch` in a comment, and issue 050's precedent that "a
minimal API surface beats a second export"). The functions themselves are
NOT dead and must stay.

### Expected

1. `parseExactQuery` and `exactQuery` are removed from `js/match.js`
   (definitions, doc comments, and the export entry); everything else in the
   file stays byte-identical.
2. The dead `index` construction (and, if the Maintainer agrees, the
   stranded `match` alias) is removed from `js/app.js`'s `boot`; the time
   and matrix pages behave exactly as before (the call has no observable
   effect — pure cost).
3. The Classes service section of `Design.md` is rewritten to describe the
   leaf-only search/selection; the code stays as-is (already blessed).
4. The favicon 404 goes away on all four pages — mechanism left to the
   Maintainer: either a minimal declaration (`<link rel="icon" href="data:,">`
   in each `<head>`, zero assets) or a real icon (e.g. derived from
   `assets/preview.svg`).
5. The stale test name/comments are corrected (`test/classes.test.js:545`
   name plus the `app.js` mentions at `:480/:501/:510`;
   `test/teacher-daygroups.test.js:4-6`). Names/comments only — assertions
   and test count (103) unchanged.

No behaviour change anywhere: same pages, same search results, same test
pass count.

### Scope guard (owned by sibling issue #052, filed in a sibling worktree)

The teacher-summary removal (#052) owns: `js/model.js`'s `teacherSummary`
cluster (`// ---- teacher summary sentence` divider `:534`, `:577-593` —
line numbers to be re-verified against #052's own tree at merge time — and
export `:611`) and `EN_DAY`
(`:407,558-559,593,606`), `test/fusion.test.js` summary asserts
(`:162-166,285`), `Design.md:162-163` ("A generated summary states, in one
sentence…"), the `styles.css` summary/em rules, and `js/color.js`'s
`emphasis()`/`emph` machinery (`:3,17,87,93`). **None of those are part of
this issue** — this issue's grep passes did hit them and they are listed here
only to mark them out of scope.

Cross-reference: sibling issue #054 (coverage) — dead exports like
`parseExactQuery`/`exactQuery` should be **removed**, not given coverage
tests; this issue is the removal side of that coin.

## Root cause

- **`parseExactQuery`/`exactQuery`**: relics of the issue-010 committed
  exact-query surface. When the pages' search UX moved to the live fuzzy
  path (`searchSections` for teachers, `classSearch`/`suggest` for classes),
  the committed-query entry points disappeared from every caller, but the
  two functions and their export entry (`js/match.js:684`) were left in
  place. Nothing dynamically references them (the export object at
  `:680-687` is a plain literal; no computed member access exists anywhere).
  Removing them strands nothing: `covers` stays live (`js/match.js:252,
  371, 378`), `resolveClass` stays live (`:230, 242, 317`), and
  `TT.data.HOURS_PER_SESSION` (read at `:673`) stays used by `js/model.js:10`
  and `js/data.js:62,95`.
- **`js/app.js:178`**: when the teachers/classes pages were split out of
  `app.js` into their own files (header `js/app.js:3-4`), the boot sequence
  that served all four pages kept the index build — needed by the teachers
  and classes pages' search — even though the two pages remaining in
  `app.js` (time, matrix) never search and never touch `index`. Both
  remaining init functions were verified index-free by full read
  (`initTimePage :34-134`, `initTimetablePage :138-170`). No test loads
  `js/app.js` (tests load `js/teachers.js` — `test/teacher-daygroups.test.js:39`
  — and `js/classes.js` — `test/classes.test.js:530,677` — and drive match
  APIs directly), so the line has neither a runtime nor a test consumer.
  The other `buildIndex` call sites are live and stay:
  `js/teachers.js:540` (index used at `:402-530`), `js/classes.js:611`
  (used at `:467-601`), and each test file's own `index`.
- **`Design.md:177-180`**: written when any grouping node (including
  interior prefixes) was selectable and a broader class rendered the union
  of its timetable with per-line class labels. Issues 046/047/049 removed
  that surface deliberately — leaf-only catalogue, single-leaf gates, no
  `s-class` labels, no `isUnion`, no `orderedDays` — and pinned the removal
  (`test/classes.test.js:558-564`), but the Classes service prose was never
  updated. Doc drift, not code drift: the code is the blessed side.
- **Favicon**: no `<link rel="icon">` was ever declared in any page, and no
  icon asset exists; browsers unconditionally probe `/favicon.ico`, so every
  page logs a 404 (already observed in issue 049's browser audit,
  `issues/049-whole-week-only.md:58`). The two SEO-heavy heads
  (`index.html`, `classes.html`) and the two minimal heads (`time.html`,
  `timetable.html`) alike lack the declaration.
- **Test fossils**: `test/classes.test.js:545`'s name and the `app.js`
  mentions at `:480/:501/:510`, and `test/teacher-daygroups.test.js:4-6`'s
  header, all predate the page-JS split that moved `showTeacher`/`showClass`
  from `js/app.js` into `js/teachers.js`/`js/classes.js`. The assertions
  themselves read the correct files; only the prose went stale.

## Repro steps

Commands (from the worktree root
`/home/user/.local/share/opencode/worktree/1de5bb/055-cleanup-dead-code`):

```
# baseline
node --test                                    # 103 tests, 103 pass, 0 fail

# candidate 1: dead committed-query machinery — only match.js self-hits
grep -rn 'parseExactQuery\|exactQuery' .       # 3 hits: js/match.js:604,651,684
grep -rn 'exactQuery\|parseExactQuery' test/   # no hits

# candidate 2: the app.js index is never used again; app.js never uses match
# beyond the build (full read of js/app.js: boot :176-182 passes only
# store/modelObjs to initTimePage/initTimetablePage; neither references
# index or match)
grep -n 'index' js/app.js                      # single hit: :178
grep -n 'match\.' js/app.js                    # single hit: :178
grep -rn 'js/app.js' test/                     # no readFileSync of app.js;
                                               # only stale comments/name

# candidate 3: doc vs code
sed -n '175,187p' Design.md                    # interior-prefix + union text
sed -n '58,67p' js/classes.js                  # leaf-only comment + leafSet/leafRows
sed -n '545,565p' test/classes.test.js         # pins: gates present (:558-559),
                                               # s-class/isUnion/orderedDays
                                               # absent (:561-564)

# candidate 4: no favicon declaration, no asset
grep -rn 'rel="icon"\|favicon' --include='*.html' .   # no hits
ls assets/                                     # preview.png preview.svg only

# candidate 5: fossils
sed -n '545p' test/classes.test.js             # 'app.js selects leaves only…'
sed -n '480p;501p;510p' test/classes.test.js   # '…in app.js' / 'app.js filters'
sed -n '4,6p' test/teacher-daygroups.test.js   # 'showTeacher is a closure
                                               # inside js/app.js'
sed -n '39p' test/teacher-daygroups.test.js    # APP_SRC actually reads
                                               # js/teachers.js

# scope guard: #052's cluster exists and is NOT listed above
grep -n 'teacherSummary\|EN_DAY' js/model.js   # :407,558-559,577,593,606,611
grep -n 'emphasis\|emph' js/color.js           # :3,17,87,93
```

Serve + 200 checks (server stopped by PID afterwards):

```
python3 -m http.server 8000 &
curl -s -o /dev/null -w '%{http_code}' http://localhost:8000/index.html     # 200
curl -s -o /dev/null -w '%{http_code}' http://localhost:8000/classes.html   # 200
curl -s -o /dev/null -w '%{http_code}' http://localhost:8000/time.html      # 200
curl -s -o /dev/null -w '%{http_code}' http://localhost:8000/timetable.html # 200
```

No test pins the removal surface: no test references `parseExactQuery`,
`exactQuery`, or `js/app.js`; the HTML structure tests
(`test/classes.test.js:426-459`) are presence-only asserts, so adding a
`<link rel="icon">` to any `<head>` cannot break them; renaming the test at
`:545` and editing comments/assert-message strings keeps the count at 103.

## Discussion

### Maintainer decision (2026-10-19)

Round 1 — final decision, no outstanding requests; the Implementer may act on
the criteria below. I re-verified the Reporter's analysis directly against
this tree (definitions `js/match.js:604-643,651-678`, export `:680-687`,
the full live search paths in `js/teachers.js:397-444` and
`js/classes.js:461-514`, `js/app.js` in full, `Design.md` in full, all four
HTML heads, the fossil lines in both test files, repo-wide greps for
`parseExactQuery|exactQuery`, `match.[a-zA-Z]+`, `buildIndex`,
`location.search|URLSearchParams|?q=`, `Object.keys` over the match object,
`app.js` in `test/`, `Design.md` in `test/`, and the baseline of **103/103
passing** tests); it is accurate as written, line numbers included.

**Verdict**

- **Candidate 1 (`parseExactQuery`/`exactQuery`) — VALID, in scope, delete the
  whole machinery.** Truly unreachable on both axes: zero external callers
  (the only `match.*` consumers anywhere are `js/teachers.js`
  (`highlightHTML :187,192,195,341,344,347`, `shadowText :368`,
  `searchSections :402,422,428,530`, `suggest :404`, `buildIndex :540`) and
  `js/classes.js` (`highlightHTML :182,401`, `suggest :467`,
  `classSearch :475,500,601`, `buildIndex :611`), plus the three test
  harnesses (`buildIndex`/`classSearch`/`searchSections`/`suggest` only)) and
  zero internal callers (`resolveClass`'s uses at `:625,:633` and `covers`'s
  at `:660,:667` live *inside* the dead block; both functions stay live
  elsewhere — `resolveClass :230,242,317`, `covers :252,371,378`). No URL
  param, planned feature, or dynamic access references them (grep
  `location.search|URLSearchParams|?q=` → zero hits in `js/` and `*.html`; the
  export object is a plain literal and nothing enumerates it). The **LIVE**
  committed-query-adjacent behavior the brief warned about is a different
  path and is untouched: the teachers page's Enter/Tab/`commit()` is
  page-local (`js/teachers.js:416-444`) and drives `match.searchSections`
  (which internally uses the live `parseQuery`/`liveSearch`, `match.js:389,392`)
  plus `suggest`/`shadowText`; the classes page's `commit()` is page-local
  (`js/classes.js:495-514`) and drives `leafRows(match.classSearch(index,q))`
  with the single-leaf gate `model.classWeek(groups,q).leaves.length === 1`
  (`:500,507`) and the page-local `classGhost` mirror (`:422-431`). Neither
  page has a *copy* of the exact-query machinery — the issue-010 path was
  fully orphaned. Scope therefore stays `js/match.js` + `js/app.js` only.
- **Candidate 2 (unused `index` in `js/app.js`'s boot) — VALID, in scope,
  delete the line, the stranded alias, and the two header clauses that the
  deletion falsifies.** `initTimePage` (`:34-134`) and `initTimetablePage`
  (`:138-170`) never receive or reference `index`; no test loads `js/app.js`;
  `buildIndex` is pure construction, so the call is pure per-page-load waste
  on time.html/timetable.html. Removing it strands `var match = TT.match;`
  (`js/app.js:11` — the file's only other `match` occurrence is prose in the
  header) and makes two header claims false ("Boots the store + analysis +
  match layers", "all matching through TT.match") — this issue kills stale
  code *and* stale prose, so the header gets the two-word/clause fix rather
  than recreating candidate-3-style drift inside the code.
- **Candidate 3 (`Design.md` Classes section) — VALID, in scope.** The code
  is the blessed side (047/049, pinned at `test/classes.test.js:558-564`);
  the prose at `Design.md:177-180` describes surface (interior-prefix
  selection, union output) that the tests now *forbid*. The #050 decision
  documented this as tolerated pre-existing drift, explicitly "actionable
  separately" (`issues/050…:312-314`) — this directive is that separate
  action. Rest-of-doc audit: the Teachers section ("available today are
  raised to the top", "sessions grouped by day", `Design.md:160-162`) survives
  050 unchanged (050 reordered day *groups*, not the list ranking; the 050
  decision itself verified `:161` still true); the Time section matches
  `js/app.js` (scroll-into-view `:132`); the Grouping model's "broader
  classes cover everything beneath them" (`:7`) is a *model*-level truth and
  stays; "fully specified class … is the unit the services list, search and
  link" (`:50-52`) became *more* true after 047. So: exactly one falsified
  sentence must change, plus one omission to fill (below); everything else is
  pre-existing, tolerated drift — untouched.
- **Candidate 4 (favicon 404) — VALID, in scope; fix = an explicit empty-icon
  declaration, no asset.** Ruling: add `<link rel="icon" href="data:,">` to
  all four heads. The presence of any `rel="icon"` link suppresses the
  unconditional `/favicon.ico` probe, killing the console 404 on every page
  with zero files, zero requests, zero design invention. Rejected
  alternatives: (a) a new `assets/favicon.svg` — inventing site iconography
  is a product/design decision, not dead-code cleanup, and an SVG-only
  declaration still lets legacy browsers probe `/favicon.ico` (404 stays in
  those consoles); (b) a binary `favicon.ico` — a build/binary-asset
  concession this repo (no build step; `assets/` holds only social-card
  `preview.png`/`preview.svg`) should not take for a console-hygiene bug;
  (c) an inline SVG data-URL — duplicates icon markup in four heads and again
  makes a design choice. If the project ever wants a real tab icon, that
  issue replaces the `href` with an asset path; the declaration stays.
- **Candidate 5 (test fossils) — VALID, in scope, prose-only.** Four stale
  spots from the page-JS split; the assertions themselves read the right
  files. Names/comments only.
- **Secondary finding (the other seven exports) — OUT of scope, keep as-is.**
  `resolveClass`, `mergeRanges`, `tokenScore`, `fuzzyRanges`, `liveSearch`,
  `parseQuery`, `completionContext` are internally live and the export object
  is the match module's *declared layer interface* ("Layer 3: match module"),
  driven directly by the vm test harnesses that are this repo's verification
  standard. Dormant externally ≠ dead: the pair being deleted had zero
  internal *and* zero external users. Pruning the seven changes no behavior
  and fixes no defect — pure API-taste churn better done separately if ever;
  `js/color.js:51`'s comment about `match.liveSearch` remains accurate either
  way and is #052 territory regardless.

**Architectural direction**

1. *Delete the whole dead block, not just the export entries.* In
   `js/match.js`, remove lines `596-678` inclusive — the section comment +
   grammar block (`:596-603`), `parseExactQuery` (`:604-643`), its blank
   separator, the `exactQuery` doc comment (`:645-650`) and `exactQuery`
   (`:651-678`) — and shrink the export line `:684` to
   `shadowText: shadowText,`. Removing only the export entries would leave
   two unreachable functions inside the module: a worse state than the one
   we're fixing. `covers`/`resolveClass`/`TT.data.HOURS_PER_SESSION` all keep
   live users (`match.js:252,371,378`; `:230,242,317`; `js/model.js:10`,
   `js/data.js:62,95`). Everything else in the file stays byte-identical.
2. *App.js: remove the need, not add a case.* Delete `js/app.js:178`
   (the `buildIndex` call) and the stranded `js/app.js:11` alias; fix the two
   falsified header clauses (`:2` "…+ match layers" → "…layer"; drop "; all
   matching through TT.match" from `:5-7`, re-wrapping). Do **not** keep a
   built-but-unused index "for later": the house pattern is that each page
   builds its own index in its own boot when it needs one
   (`js/teachers.js:540`, `js/classes.js:611`); the shared-boot index is a
   fossil of the pre-split architecture and the exact dormant surface that
   let this dead code accumulate. My app.js edit region is `:2-14` (header +
   alias) and `:176-182` (boot body) only — `initTimePage :34-134` and
   `initTimetablePage :138-170` are untouched (sibling #051 owns the clock
   logic there; no overlap).
3. *Design.md: one falsified sentence replaced, one omission filled, nothing
   else.* Replace the sentence spanning `Design.md:177-180` (from "The class
   is chosen through a live search over the grouping hierarchy:" through
   "…each line labelled with the class it comes from.") with the leaf-only
   truth, and insert one sentence before the closing "It answers…" line
   (`:186`) for the 047 card list, mirroring the Teachers section's own cards
   phrasing (`:164-165`) — that is the complete prescription; every other
   line of the document stays byte-identical, **especially
   `Design.md:159-165` (Teachers service), whose summary sentence
   `:162-163` is owned by sibling #052.**
4. *Favicon: suppression, declared in all four heads.* `<link rel="icon"
   href="data:,">` immediately before each stylesheet link
   (`index.html:29`, `classes.html:29`, `time.html:7`, `timetable.html:7`).
   CSP-free static hosting makes the `data:` URL safe; old-browser probing of
   `/favicon.ico` may persist on ~pre-2020 browsers — acceptable, documented,
   and future-icon work only swaps the href.
5. *Fossils: fix the prose, keep every assertion.* `test/classes.test.js`
   `:480`, `:501`, `:510`, `:545` and `test/teacher-daygroups.test.js:4`
   (header comment) — app.js → classes.js / js/teachers.js as appropriate.
6. *Tests: two new absence pins, no deletions, one new file.* Nothing pins
   the dead code (re-verified: no test references `parseExactQuery`/
   `exactQuery`; no test reads `js/app.js`; the HTML tests
   (`test/classes.test.js:426-459`) are presence-only). House precedent says
   deliberately-removed surface gets an absence pin (#049 `c-all`,
   #050 `orderedDays`, current `s-class`/`isUnion`/`orderedDays`/`isNarrow`
   at `test/classes.test.js:561-564`); both removals here qualify — the
   exact-query pair survived once precisely because nothing watched it. Add
   `test/deadcode.test.js` with exactly two source-level pins (the house
   structural-pin style, no vm/CSV needed): (1) `js/match.js` source
   contains neither `parseExactQuery` nor `exactQuery`; (2) `js/app.js`
   source contains no `buildIndex`. New file, not an edit to
   `test/fusion.test.js` (owned by #052) or the other sibling-touched files.
   Expected `node --test` total: **105** = 103 baseline − 0 deleted + 2 added.

**Acceptance criteria** (for a blind Implementer; every cite re-verified today)

1. `js/match.js`: delete lines `596-678` (section comment + grammar,
   `parseExactQuery`, `exactQuery`); edit the export line (now `:684` after
   deletion it is `shadowText: shadowText, parseExactQuery: parseExactQuery,
   exactQuery: exactQuery,` → `shadowText: shadowText,`). No other byte
   changes in the file.
2. `js/app.js`: delete line `178` (`var index =
   match.buildIndex(store, modelObjs);`) and line `11` (`var match =
   TT.match;`). Line 2: `…Boots the store + analysis + match layers and
   dispatches…` → `…Boots the store + analysis layer and dispatches…`.
   Lines 5-7: drop the clause `; all matching through TT.match` and re-wrap
   to `…All coloring decisions go through TT.color; all domain data through
   TT.model. This file owns DOM only.` Lines `34-170` byte-identical.
3. `Design.md`: in the Classes section (`:175-187`), replace the sentence on
   `:177-180` with: "The class is chosen through a live search over the
   catalogue: only leaves — fully specified classes that own a timetable of
   their own — are listed, offered by autocomplete and selectable, and a
   reference to a broader class reports no match." Insert before the final
   sentence ("It answers…", `:186`): "On narrow screens the week collapses
   into stacked session cards, as the teachers view does." All other bytes of
   `Design.md` identical — in particular no edit anywhere in `:159-165`.
4. Favicon: insert exactly one line, `<link rel="icon" href="data:,">`,
   immediately before the `<link rel="stylesheet"…>` line in each of
   `index.html` (before `:29`), `classes.html` (before `:29`), `time.html`
   (before `:7`), `timetable.html` (before `:7`). No asset files; no other
   HTML edits.
5. `test/classes.test.js`: `:480` comment `…down to leaves in app.js;` →
   `…down to leaves in classes.js;`; `:501` `(filtering lives in app.js)` →
   `(filtering lives in classes.js)`; `:510` `(app.js filters them)` →
   `(classes.js filters them)`; `:545` test name `'app.js selects leaves
   only…'` → `'classes.js selects leaves only…'`. No assertion text,
   structure, or ordering changes anywhere in the file — including the
   byte-identical keeps at `:558-564`.
6. `test/teacher-daygroups.test.js`: line 4 only — `// showTeacher is a
   closure inside js/app.js, so…` → `…inside js/teachers.js, so…`. Lines 5-6
   stay (breakdownHTML/treeHTML/showTeacher all live in `js/teachers.js`,
   which `APP_SRC` reads at `:39`). No other change in the file.
7. New `test/deadcode.test.js` with exactly two tests in the house
   structural style (`fs.readFileSync` + `indexOf`): (a) `'the committed
   exact-query machinery stays removed'` — `js/match.js` source contains
   neither `parseExactQuery` nor `exactQuery`; (b) `'the time/matrix pages
   never build a match index'` — `js/app.js` source contains no
   `buildIndex`. Do not pin the absence of `match.` generally in app.js
   (a future legitimate search feature there would use the page-local-index
   pattern; only the wasted build is the defect). Do not add a favicon test
   (the declaration is static markup with no runtime surface; any browser
   audit like 049's would catch its removal).
8. Verification, in order, all from the worktree root:
   `node --test` → **105 pass, 0 fail** (anything else means a missed or
   extra edit); `grep -rn 'parseExactQuery\|exactQuery' js/ test/` → zero
   hits; `grep -n 'buildIndex' js/app.js` → zero hits;
   `grep -c 'rel=\"icon\"' index.html classes.html time.html timetable.html`
   → 1 each. Then serve and check:
   `python3 -m http.server 8000 &` (record the PID);
   `curl -s -o /dev/null -w '%{http_code}' http://localhost:8000/index.html`
   → 200; same for `classes.html`, `time.html`, `timetable.html` → 200;
   `curl -s -o /dev/null -w '%{http_code}' http://localhost:8000/favicon.ico`
   → **404, by design** — this ruling declares the icon inline, so no
   `/favicon.ico` file exists and none is needed: the fix is that browsers
   no longer *request* it (asserted via the four `rel="icon"` presence
   checks above; a real-browser re-audit would show a clean console). A 200
   here would mean an unwanted asset was added — fail the diff. Kill the
   server by its recorded PID afterwards.
9. Diff hygiene — exactly these files and nothing else:
   `js/match.js`, `js/app.js`, `Design.md`, `index.html`, `classes.html`,
   `time.html`, `timetable.html`, `test/classes.test.js`,
   `test/teacher-daygroups.test.js`, `test/deadcode.test.js` (new), plus this
   issue's `### Fix implemented` entry. `Status:` stays `Open` (the
   coordinator flips it at merge).
10. No-go items (sibling boundaries): `js/model.js` (#052 teacherSummary /
    EN_DAY, #053 subjectCounts — this issue touches model.js never);
    `test/fusion.test.js` (#052); `js/color.js` (#052 owns `emph`/`emphasis`;
    the `:51` liveSearch comment stays as-is); `js/teachers.js` and
    `js/classes.js` entirely (#051 — the fossil fixes above are in *test*
    files, not theirs); the clock logic in `js/app.js:34-134` and the
    day-group code in `js/classes.js`/`js/teachers.js` (#051);
    `Design.md:159-165` (#052 — note only its `:162-163` summary sentence is
    theirs; the section as a whole must come through byte-identical);
    `issues/051`–`054` files (#054's prose about app.js/ticker coverage is
    untouched; this issue is the removal side of its dead-export note);
    `styles.css`, `assets/`, `vendor/`, `data/`, `emplois.csv`, all other
    issue files.

**Merge-reconciliation notes** (for the coordinator, not the Implementer):
in `js/app.js` my regions are `:2-14` + `:176-182`; #051's clock work lives
in `:34-134` (`initTimePage`) — disjoint hunks. In `test/classes.test.js` my
edits are four prose lines (`:480,:501,:510,:545`) inside 047-era leaf tests;
#051's clock asserts would land in different tests. In
`test/teacher-daygroups.test.js` my edit is line 4 only.

**Risks / constraints**

- *A wrong cut bricks search.* Mitigated by full-path verification: no line
  of the LIVE paths (`js/teachers.js:397-444`, `js/classes.js:461-514`,
  `match.searchSections`/`classSearch`/`suggest`/`shadowText`/
  `highlightHTML`/`buildIndex`) changes; the deleted pair had zero wiring to
  any Enter/Tab/commit handler. Post-change, the suite's 30+ live-search
  assertions (classSearch/suggest/searchSections against the real CSV) stand
  unchanged as the regression net.
- *Merge conflicts with in-flight siblings* — bounded and enumerated above;
  each sibling's hunks are region-disjoint from mine.
- *`data:,` legacy caveat:* ~pre-2020 browsers may still probe
  `/favicon.ico`; the declaration is future-proof (a real icon later only
  swaps the href) and this residual is cosmetic, console-only.
- *Doc drift discipline:* only the falsified sentence and the one omission
  change; a rewrite of Design.md would bulldoze #049's deliberate "docs get
  more accurate" carve-out and #052's pending summary-sentence edit.
- *Test-count accounting is load-bearing:* expected 105; a 103/104 result
  means a pin or the new file is missing, 106+ means unrequested edits.

No requests — every question was decidable from this tree; one round is
enough. Implementer may proceed on criteria 1-10.

### Fix implemented (2026-10-19)

Implemented by the Implementer (audit-and-finish run) against criteria 1–10
above. **Provenance**: the first Implementer run made the file edits but was
interrupted before appending this entry; this run audited every numbered
criterion against the actual files — criteria 1–7 and 10 were already **met**
and no further code edit was needed — then executed criterion 8's
verification sequence and criterion 9's hygiene proof, and finished
criterion 9's last item (this entry). No git was invoked at any point: the
audit compares the whole tree against the pre-change sha256 snapshot
(`/tmp/opencode/055-baseline/tree-before.sha`, taken before the first run's
edits). `Status:` stays `Open` (the coordinator flips it at merge). The dev
server was killed by its recorded PID after the curl checks.

**Exact diff** of the change (unified, against the pre-change state of the ten
files; reproduced from `diff -u` of before/after copies; this issue file's own
append is not self-included):

```diff
--- a/js/match.js
+++ b/js/match.js
@@ -593,95 +593,12 @@
     return null;
   }
 
-  // ---- committed exact queries (issue 010 semantics) --------------------------
-
-  // query ::= constraint (whitespace constraint)*,
-  // constraint ::= [prefix] value, prefix ::= 'teacher:'|'class:'|'subject:'.
-  // A prefixed constraint swallows following bare tokens ("subject:A B"
-  // keeps "A B" together). Bare tokens resolve class-exact -> subject-exact
-  // -> teacher-exact; anything else lands in unknown (=> zero hits, no
-  // fuzzy fallback — this is the exact boundary).
-  function parseExactQuery(text, index) {
-    var tokens = String(text == null ? '' : text).trim().split(/\s+/).filter(Boolean);
-    var groups = [];
-    tokens.forEach(function (tok) {
-      var m = /^(teacher|class|subject):(.*)$/i.exec(tok);
-      if (m) groups.push({ prefix: m[1].toLowerCase(), value: m[2], open: true });
-      else if (groups.length && groups[groups.length - 1].open)
-        groups[groups.length - 1].value += ' ' + tok;
-      else groups.push({ prefix: null, value: tok, open: false });
-    });
-    var parsed = { teacher: null, classes: [], subjects: [], unknown: [] };
-    var seenC = {}, seenS = {};
-    groups.forEach(function (g) {
-      var v = g.value.trim();
-      if (!v) return;
-      var hit;
-      if (g.prefix === 'teacher') {
-        hit = index.teachersByNorm[model.normStr(v)];
-        if (hit) parsed.teacher = hit;
-        else parsed.unknown.push('teacher:' + v);
-      } else if (g.prefix === 'class') {
-        hit = resolveClass(index, v);
-        if (hit && !seenC[hit]) { seenC[hit] = true; parsed.classes.push(hit); }
-        else if (!hit) parsed.unknown.push('class:' + v);
-      } else if (g.prefix === 'subject') {
-        hit = index.subjectsByNorm[model.normStr(v)];
-        if (hit && !seenS[hit]) { seenS[hit] = true; parsed.subjects.push(hit); }
-        else if (!hit) parsed.unknown.push('subject:' + v);
-      } else {
-        hit = resolveClass(index, v);
-        if (hit && !seenC[hit]) { seenC[hit] = true; parsed.classes.push(hit); return; }
-        hit = index.subjectsByNorm[model.normStr(v)];
-        if (hit && !seenS[hit]) { seenS[hit] = true; parsed.subjects.push(hit); return; }
-        hit = index.teachersByNorm[model.normStr(v)];
-        if (hit) { parsed.teacher = hit; return; }
-        parsed.unknown.push(v);
-      }
-    });
-    return parsed;
-  }
-
-  // Exact committed query: a teacher matches iff ALL constraints hold by
-  // normalized exact equality (class = subtree membership; a broader node
-  // covers its leaves). Score = hours of sessions satisfying ALL class +
-  // subject constraints (teacher: selects, does not score). Sort desc(score),
-  // tie localeCompare. Unknown token or no constraints -> [].
-  // Deterministic: pure function of (rows, normalized query).
-  function exactQuery(index, parsed) {
-    if (!parsed || (parsed.unknown && parsed.unknown.length)) return [];
-    if (!parsed.teacher && !parsed.classes.length && !parsed.subjects.length) return [];
-    var out = [];
-    index.teachers.forEach(function (n) {
-      if (parsed.teacher && model.normStr(n) !== model.normStr(parsed.teacher)) return;
-      var ss = index.store.sessionsOf(n);
-      var ok = true, i;
-      for (i = 0; i < parsed.classes.length; i++)
-        if (!ss.some(function (s) { return covers(index, parsed.classes[i], s.field); })) { ok = false; break; }
-      if (!ok) return;
-      for (i = 0; i < parsed.subjects.length; i++)
-        if (!ss.some(function (s) { return model.normStr(s.subject) === model.normStr(parsed.subjects[i]); })) { ok = false; break; }
-      if (!ok) return;
-      var rel = 0;
-      ss.forEach(function (s) {
-        var inClass = parsed.classes.every(function (c) { return covers(index, c, s.field); });
-        var inSubj = parsed.subjects.every(function (sb) {
-          return model.normStr(s.subject) === model.normStr(sb);
-        });
-        if (inClass && inSubj) rel++;
-      });
-      out.push({ name: n, relevantSessions: rel, relevantHours: rel * TT.data.HOURS_PER_SESSION });
-    });
-    return out.sort(function (a, b) {
-      return b.relevantSessions - a.relevantSessions || a.name.localeCompare(b.name);
-    });
-  }
 
   return {
     buildIndex: buildIndex, resolveClass: resolveClass,
     mergeRanges: mergeRanges, tokenScore: tokenScore, fuzzyRanges: fuzzyRanges,
     highlightHTML: highlightHTML, liveSearch: liveSearch, suggest: suggest,
-    shadowText: shadowText, parseExactQuery: parseExactQuery, exactQuery: exactQuery,
+    shadowText: shadowText,
     parseQuery: parseQuery, searchSections: searchSections,
     completionContext: completionContext, classSearch: classSearch
   };
--- a/js/app.js
+++ b/js/app.js
@@ -1,14 +1,13 @@
 // js/app.js — page wiring for the time + matrix pages. Boots the store +
-// analysis + match layers and dispatches to the per-page renderers
+// analysis layer and dispatches to the per-page renderers
 // (body[data-page]). The teachers and classes pages moved to js/teachers.js
 // and js/classes.js (same shared head, self-contained per page); this file
 // keeps only what time.html and timetable.html load. All coloring decisions
-// go through TT.color; all matching through TT.match; all domain data
-// through TT.model. This file owns DOM only.
+// go through TT.color; all domain data through TT.model. This file owns
+// DOM only.
 var TT = TT || {};
 TT.app = (function () {
   var model = TT.model;
-  var match = TT.match;
   var color = TT.color;
   var C = color.CLASSES;
   var esc = TT.data.esc;
@@ -175,7 +174,6 @@
   // and classes boot from js/teachers.js / js/classes.js (see header).
   function boot(store) {
     var modelObjs = model.buildAll(store);
-    var index = match.buildIndex(store, modelObjs);
     var page = document.body.getAttribute('data-page');
     if (page === 'time') initTimePage(store, modelObjs);
     else if (page === 'matrix') initTimetablePage(store, modelObjs);
--- a/Design.md
+++ b/Design.md
@@ -175,13 +175,14 @@
 ## Service: Classes
 A view with classes as the main object — the student-facing counterpart to the
 teacher and time views. The class is chosen through a live search over the
-grouping hierarchy: any named class is selectable, whether fully specified or an
-interior prefix, and a broader class shows the union of every timetable beneath
-it, each line labelled with the class it comes from. Selecting a class draws its
+catalogue: only leaves — fully specified classes that own a timetable of their
+own — are listed, offered by autocomplete and selectable, and a reference to a
+broader class reports no match. Selecting a class draws its
 week as a grid with the days as columns and the six slots as rows; each cell lists
 the sessions held then, every line giving the subject, the teacher and the room. A
 semi-transparent red cursor crosses the grid at the current time, its arrowhead
 resting in a small gutter beside the time column, and the current and next slots
 are highlighted — the next only while it is still today, with nothing marked at
-all on Sunday, before the day begins, or once it has ended. It answers "what does
-this class have right now, and where?"
+all on Sunday, before the day begins, or once it has ended. On narrow screens the
+week collapses into stacked session cards, as the teachers view does. It answers
+"what does this class have right now, and where?"
--- a/index.html
+++ b/index.html
@@ -26,6 +26,7 @@
 <meta name="twitter:image:alt" content="Emplois — the ISIM Mahdia timetable, searchable by teacher, class or subject.">
 
 <link rel="canonical" href="https://adem482p.github.io/time/">
+<link rel="icon" href="data:,">
 <link rel="stylesheet" href="styles.css">
 </head>
 <body data-page="teachers">
--- a/classes.html
+++ b/classes.html
@@ -26,6 +26,7 @@
 <meta name="twitter:image:alt" content="Emplois — the ISIM Mahdia class week timetable, searchable by class.">
 
 <link rel="canonical" href="https://adem482p.github.io/time/classes.html">
+<link rel="icon" href="data:,">
 <link rel="stylesheet" href="styles.css">
 </head>
 <body data-page="classes">
--- a/time.html
+++ b/time.html
@@ -4,6 +4,7 @@
 <meta charset="utf-8">
 <meta name="viewport" content="width=device-width, initial-scale=1">
 <title>Time — Emplois</title>
+<link rel="icon" href="data:,">
 <link rel="stylesheet" href="styles.css">
 </head>
 <body data-page="time">
--- a/timetable.html
+++ b/timetable.html
@@ -4,6 +4,7 @@
 <meta charset="utf-8">
 <meta name="viewport" content="width=device-width, initial-scale=1">
 <title>Timetable matrix — Emplois</title>
+<link rel="icon" href="data:,">
 <link rel="stylesheet" href="styles.css">
 </head>
 <body data-page="matrix">
--- a/test/classes.test.js
+++ b/test/classes.test.js
@@ -477,7 +477,7 @@
 
 // ---- leaf-only selection + session cards (issue 047) -----------------------
 
-// The page filters the match layer down to leaves in app.js; the match layer
+// The page filters the match layer down to leaves in classes.js; the match layer
 // itself is untouched, so the tests replicate the page's filter here.
 function leafSet() {
   var set = {};
@@ -498,7 +498,7 @@
   // the same filter on a mid-hierarchy query drops the interior node itself
   var sub = match.classSearch(index, 'lcs1');
   assert.ok(sub.map(function (r) { return r.label; }).indexOf('LCS1') !== -1,
-    'match layer still returns the interior node (filtering lives in app.js)');
+    'match layer still returns the interior node (filtering lives in classes.js)');
   var kept = sub.filter(function (r) { return set[(r.node && r.node.key) || r.label]; });
   assert.ok(kept.length < sub.length);
   kept.forEach(function (r) {
@@ -507,7 +507,7 @@
   // class autocomplete entries resolve through the same leaf set
   var sug = match.suggest(index, 'lcs1').filter(function (r) { return r.kind === 'class'; });
   var sugKept = sug.filter(function (r) { return set[r.label]; });
-  assert.ok(sug.length > sugKept.length, 'suggest still offers interior classes (app.js filters them)');
+  assert.ok(sug.length > sugKept.length, 'suggest still offers interior classes (classes.js filters them)');
   sugKept.forEach(function (r) {
     assert.ok(groups.byKey[r.label].isLeaf(), r.label + ' must be a leaf');
   });
@@ -542,7 +542,7 @@
   return sec.slice(start, end);
 }
 
-test('app.js selects leaves only (no broader classes)', function () {
+test('classes.js selects leaves only (no broader classes)', function () {
   var sec = classesSection();
   // leaf lookup built once from groups.leaves, applied to every surface
   assert.ok(sec.indexOf('groups.leaves.forEach') !== -1, 'missing leafSet build');
--- a/test/teacher-daygroups.test.js
+++ b/test/teacher-daygroups.test.js
@@ -1,7 +1,7 @@
 // Tests for the teacher day groups (one shared DOM for desktop + mobile) —
 // run with `node --test test/`.
 //
-// showTeacher is a closure inside js/app.js, so the behavioral tests drive
+// showTeacher is a closure inside js/teachers.js, so the behavioral tests drive
 // the real function source (breakdownHTML + treeHTML + showTeacher slice)
 // in a vm sandbox with stubbed document/detail and a stubbed clock.
 
--- /dev/null
+++ b/test/deadcode.test.js
@@ -0,0 +1,29 @@
+// Tests for deliberately-removed surface (issue 055) — run with `node --test test/`.
+//
+// The committed exact-query machinery (js/match.js) and the shared-boot
+// match index (js/app.js) had zero callers when they were deleted; these
+// source-level pins keep them from creeping back unnoticed.
+
+'use strict';
+
+var test = require('node:test');
+var assert = require('node:assert');
+var fs = require('node:fs');
+var path = require('node:path');
+
+var ROOT = path.join(__dirname, '..');
+
+function readSrc(rel) {
+  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
+}
+
+test('the committed exact-query machinery stays removed', function () {
+  var src = readSrc('js/match.js');
+  assert.ok(src.indexOf('parseExactQuery') === -1, 'parseExactQuery must stay removed');
+  assert.ok(src.indexOf('exactQuery') === -1, 'exactQuery must stay removed');
+});
+
+test('the time/matrix pages never build a match index', function () {
+  assert.ok(readSrc('js/app.js').indexOf('buildIndex') === -1,
+    'buildIndex must stay out of app.js');
+});
```

**Criteria checklist** (each numbered acceptance criterion):

1. **Met — pre-done by run 1, audited this run.** `js/match.js` has exactly
   one hunk (`@@ -593,95 +593,12 @@`): the prescribed 83 lines 596-678
   (section comment + grammar `:596-603`, `parseExactQuery` `:604-643`, its
   blank separator `:644`, the `exactQuery` doc comment `:645-650`,
   `exactQuery` `:651-678`) are gone, and the export line reads
   `shadowText: shadowText,` — no other byte in the file. The double blank
   line now before `return {` is the literal outcome of "delete 596-678, no
   other bytes" (the separators at old `:595` and `:679` lie outside the
   range) and was left exactly so. `resolveClass`/`covers` and the rest of the
   export object are untouched (context lines in the hunk).
2. **Met — pre-done, audited.** `js/app.js` has exactly two hunks:
   `@@ -1,14 +1,13 @@` (line 2 `…analysis + match layers…` → `…analysis
   layer…`; the `; all matching through TT.match` clause dropped and lines 5-7
   re-wrapped to `…All coloring decisions go through TT.color; all domain data
   through TT.model. This file owns DOM only.`; `var match = TT.match;`
   deleted) and `@@ -175,7 +174,6 @@` (the `var index =
   match.buildIndex(store, modelObjs);` line deleted). No hunk between old
   lines 15 and 174, so `:34-170` (the init/clock region, #051) is
   byte-identical. Residue greps: `grep -n 'TT.match' js/app.js` → 0;
   `grep -n 'buildIndex' js/app.js` → 0; the only `match` tokens left are
   `window.matchMedia` in the untouched region.
3. **Met — pre-done, audited.** `Design.md` has exactly one hunk
   (`@@ -175,13 +175,14 @@`). Criterion 3's leaf-only sentence sits verbatim
   (modulo the document's line wrapping) where the falsified sentence was, and
   the prescribed narrow-screen sentence is inserted immediately before
   `It answers …`, whose own text is unchanged. Grepping the dead prose
   (`interior prefix`, `union of every timetable`, `each line labelled with
   the class`) → 0 hits in `Design.md`. The two insertions re-wrap only their
   own paragraph at the document's ~80-column width; every other sentence is
   unchanged, and no hunk exists before line 175 — `Design.md:159-165`
   (#052) is byte-identical.
4. **Met — pre-done, audited.** Exactly one line, `<link rel="icon"
   href="data:,">`, inserted immediately before the stylesheet link in each of
   the four heads — one single-line hunk per file, nothing else in any HTML
   file. `grep -c 'rel="icon"' index.html classes.html time.html
   timetable.html` → `1 / 1 / 1 / 1`. `assets/` byte-identical (no asset);
   `/favicon.ico` stays 404 (criterion 8: by design).
5. **Met — pre-done, audited.** `test/classes.test.js` has exactly four
   single-line hunks, at `:480`, `:501`, `:510`, `:545`, each `app.js` →
   `classes.js` (one comment, two assert messages, the test name). The last
   hunk ends at old line 548, so the byte-identical keeps at `:558-564` have
   no hunk; no assertion logic, structure, or ordering changed.
   `grep -n 'app.js' test/classes.test.js` → 0 hits.
6. **Met — pre-done, audited.** `test/teacher-daygroups.test.js` has a single
   hunk (`@@ -1,7 +1,7 @@`) changing line 4 only (`js/app.js` →
   `js/teachers.js`); lines 5-6 are context; the whole-file diff is that one
   hunk.
7. **Met — pre-done, audited.** `test/deadcode.test.js` (new) is the house
   structural style (`fs.readFileSync` + `indexOf`), exactly two `test()`
   calls with the criterion's exact names (`'the committed exact-query
   machinery stays removed'`, `'the time/matrix pages never build a match
   index'`); pin (b) needles only `buildIndex` (no general `match.` pin in
   `app.js`); no favicon test.
8. **Met — executed this run** (one literal-grep reconciliation, documented
   below):
   - `node --test` → **tests 105, pass 105, fail 0**; `node --test
     test/*.test.js` → **tests 105, pass 105, fail 0** (103 baseline − 0 +
     2 = 105, exactly the required total).
   - `grep -n 'buildIndex' js/app.js` → **0 hits**.
   - `grep -c 'rel="icon"' …` → **1 each** on all four pages.
   - Serve + curl: `python3 -m http.server 8000` from the worktree root →
     `index.html` 200, `classes.html` 200, `time.html` 200, `timetable.html`
     200; `/favicon.ico` → **404, by design** (a 200 would have failed the
     diff — no asset exists). Server killed by its recorded PID (515160);
     port 8000 verified free afterwards.
   - `grep -rn 'parseExactQuery\|exactQuery' js/ test/` cannot be literally
     zero, and the reason is this very decision: the only hits are
     `test/deadcode.test.js:22-23`, the needle literals that criterion 7
     itself mandates (an `indexOf(...) === -1` pin must name the identifier).
     Reconciled reading, **met**: zero hits in `js/` (`grep … js/` → exit 1)
     and zero hits in `test/` outside the pin (`grep … test/
     --exclude=deadcode.test.js` → exit 1). Building the needles by
     concatenation would satisfy the literal grep but break criterion 7's
     house-style mandate; the repo's own precedent pins removed surface with
     raw literals (`test/classes.test.js:561-564`: `'s-class'`, `'isUnion'`,
     `'orderedDays'`, `'isNarrow'` — a repo-wide grep for those names hits
     that file too). The removal itself is fully verified: the dead
     identifiers exist nowhere except in the pin's strings.
9. **Met — hygiene proven this run; the entry itself finished this run.**
   sha256 of every file in the tree vs the pre-change snapshot: exactly the
   nine edited files + new `test/deadcode.test.js` differ (plus, after this
   append, this issue file); every other file is byte-identical —
   `styles.css`, `js/model.js`, `js/color.js`, `js/teachers.js`,
   `js/classes.js`, `test/fusion.test.js`, `test/libgroups.test.js`,
   `data/`, `vendor/`, `assets/`, `emplois.csv`, `issues/046…050`. That is
   precisely the criterion's file list plus this entry. Sibling-#056
   cross-check (main merged #056 touching `index.html`,
   `test/teacher-daygroups.test.js`, `js/teachers.js`, `styles.css`): my
   `index.html` change is the favicon line only and `grep -n
   'searchBack\|searchOverlay' index.html` → 0 hits (none of #056's nav
   markup exists in this base or in my diff), and
   `test/teacher-daygroups.test.js` differs only at line 4 — no #056 surface
   is present in this diff. `Status:` still `Open`.
10. **Met — verified this run.** No-go items untouched (sha256 evidence as in
    criterion 9): `js/model.js`, `test/fusion.test.js`, `js/color.js` (incl.
    the `:51` liveSearch comment), `js/teachers.js`, `js/classes.js`,
    `styles.css`, `assets/`, `vendor/`, `data/`, `emplois.csv`, and the other
    issue files; `Design.md:159-165` has no hunk; `js/app.js:34-134` (#051
    clock) has no hunk. Issues 051-054 do not exist in this tree, so nothing
    of theirs was touched.

**Verification results** (this run, from the worktree root; node v22.23.3):

- `node --test` → `# tests 105 / # pass 105 / # fail 0`.
- `node --test test/*.test.js` → `# tests 105 / # pass 105 / # fail 0`.
- `node --check` on each of `js/match.js`, `js/app.js`,
  `test/deadcode.test.js`, `test/classes.test.js`,
  `test/teacher-daygroups.test.js` → all parse clean.
- Dead-doc greps: the old `Design.md` prose → 0 hits; the old `app.js` header
  claims (`match layers`, `all matching through TT.match`) → 0 hits;
  `grep -n 'app.js' test/classes.test.js` → 0 hits;
  `test/teacher-daygroups.test.js:4` now says `js/teachers.js`.
- HTTP (server PID 515160, killed afterwards): all four pages → 200;
  `/favicon.ico` → 404 by design.
- Full-tree sha256 vs `tree-before.sha` → the changed set equals the
  criterion-9 file list (+ this entry).
- No git invoked; `Status:` unchanged (`Open`).

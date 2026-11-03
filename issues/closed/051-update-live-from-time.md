# 051: Update the time-derived UI live on every page

- Status: Fixed
- Date: 2026-10-19, Reporter: user

## Description

The user's directive (binding): **"the program should update live based on time"** —
every time-derived surface must keep updating on its own, on every page that
shows one, without the user reloading or re-selecting.

Every page computes its time-derived UI **once**, at page load (or at
selection), and then either never refreshes it (three pages) or refreshes only
*part* of it (the classes page, whose 30-second ticker updates the whole-week
grid but not the day-group list above it — leaving one page contradicting
itself about what "NOW" is).

Naming (verified, per issue 050): the **teachers** page is `index.html`
(`body data-page="teachers"`, loads `js/teachers.js` at `index.html:60`); the
**classes** page is `classes.html` (`body data-page="classes"`, loads
`js/classes.js` at `classes.html:61`); the **time** page is `time.html`
(`body data-page="time"`); the **matrix** page is `timetable.html`
(`body data-page="matrix"`). `time.html` and `timetable.html` both load
`js/app.js` (`time.html:21`, `timetable.html:30`).

### Observed

**Per-page frozen-surface inventory** (code cites re-verified in this worktree;
`grep setInterval|setTimeout|visibilitychange|requestAnimationFrame` over all
`js/` and `*.html` files returns exactly ONE timer in the whole site:
`js/classes.js:364` — executed):

**1. classes.html (`js/classes.js`) — partial refresh: grid live, list frozen.**

- The page captures its clock once at init: `var now = new Date();`
  (`js/classes.js:56`). `renderWeek` (`:217-320`) is the only producer of the
  time-derived list surfaces, and every one of them reads that closure:
  the cursor `model.dayCursor(now, store.slots)` (`:218`), the `liveDays`
  dim map (`:232-237`, `isCurrentSession(…, now)` at `:234`), the per-row
  NOW/NEXT tags in `sessionRow` (`:240-255`, `:241-242`), the issue-050
  day-group rotation `model.startFromToday(dayOrder, week.sessions, now)`
  (`:264`), and the grid cells (`:282-308`). `renderWeek` runs only when a
  class is selected (`showClass`, `:372-384`).
- The one ticker in the site refreshes only the grid: `startCursor`
  (`:362-367`) sets a 30 s `setInterval` that calls
  `applyCursor(model.dayCursor(new Date(), store.slots))` (`:364-366`) —
  a *fresh* clock, but `applyCursor` (`:325-360`) only toggles classes on
  `td.c-cell` (`:326-332`) and `th.c-day` (`:333-335`) and shows/moves/hides
  `div.cursor` (`:336-359`). It never touches the day-group list — not the
  `.nowtag`/`.nexttag` rows, not the section `dim`, not the day order.
- Consequence: after a slot/day boundary the day-group list keeps showing the
  load-time NOW/NEXT/dim/anchor while the grid below it shows the fresh one —
  the page contradicts itself (executed, see the table below). Re-selecting
  the class does not help: `renderWeek` re-reads the same closure `now`, so a
  re-selection even **reverts the grid** to load-time marks (executed below;
  the 30 s ticker then re-fixes the grid, and the list stays stale forever).
- The ticker's lifecycle: started only by `renderWeek` (`:319`), stopped by
  `stopCursor` (`:368-370`) on the no-match path (`:379`). There is no
  `visibilitychange`/focus handling anywhere (grep-verified): a
  backgrounded tab still only ticks via the throttled interval.

**2. index.html (teachers, `js/teachers.js`) — nothing refreshes.**

- Page-load clock: `var now = new Date();` (`js/teachers.js:46`). It feeds the
  **"available today" list ordering**: the `avail` map is computed once —
  comment: "availability is time-dependent: compute once per page load"
  (`:130-135`, `model.availability(store.sessionsOf(n), now)` at `:134`) — and
  passed to every `match.searchSections(index, q, avail)` call
  (`:402`, `:422`, `:428`, `:530`). `js/match.js:262-282` raises
  `avail[t] === 'today'` teachers to the top (`avRank`, `:270-273`, sort
  `:278-280`); the ranks therefore freeze at page load for the page's whole
  lifetime (executed: after the clock jumped to Sunday, where no teacher can
  be "today", the re-rendered list is byte-identical to the load-time order
  while a fresh-clock computation differs from position 2 — see below).
- Selection clock: `showTeacher` re-reads the clock — `var now2 = new Date();`
  (`:264`) — feeding `upcoming = model.nextSessionIdx(ss, now2)` (`:270`),
  `liveDays` (`:272-276`), the #050 rotation `model.startFromToday(dayOrder,
  ss, now2)` (`:285`) and the row NOW/NEXT tags (`:292-293`). So *switching
  teachers* refreshes the detail, but an **open selection never does** — there
  is no ticker on this page at all (grep-verified).
- Visible staleness after a boundary: NOW/NEXT tags, section `dim`, the
  day-group anchor order, and the "available today" list ordering all show
  load/selection-time state (executed below).

**3. time.html (`js/app.js`) — frozen at load, no refresh mechanism at all.**

- Page-load clock: `var now = new Date();` (`js/app.js:38`), plus
  `todayName`/`isSunday` (`:39-40`). Everything on the page derives from it,
  once: `todayNextSlot()` computed once into `var nextSlot` (`:48-56`),
  `marksFor` (`:58-63`), the slot entries with NOW/NEXT tags and per-day
  `dim` (`:65-78`, `:94-100`), the `(today)` bucket label (`:95-97`), the
  Sunday note (`:87-92`), the "Day over — no more sessions today." line
  (`:101-107`), and the auto-scroll to today's bucket (`:132`).
- `grep setInterval js/app.js`: **no timer exists on this page**. Nothing
  re-renders it — not a ticker, not a selection, not an event (executed: both
  a slot boundary and a day rollover left the DOM byte-identical).

**4. timetable.html (matrix, `js/app.js`) — no time-derived UI exists.**

- `initTimetablePage` (`js/app.js:138-170`) never reads a clock (the only
  `new Date` in `app.js` is `:38`, on the time page). `render()` (`:145-166`)
  depends only on `dayFilter.value` (`:146`) and `search.value` (`:147`); the
  day filter defaults to "All days" (`timetable.html:16`) and is never set to
  today; no cell or header receives a now/next/today/dim class anywhere.
  Executed DOM check: at Wed 10:30 and after the jump to 12:00, `#matrix`
  contains 924 `td` and **0** elements with any of the classes
  `now|next|today|dim`; `#dayFilter.value === ""`. So on this page nothing can
  go stale — and equally, nothing tells the user which column is today or
  which cell is live. Whether the matrix should gain any today/now marking is
  left to the Maintainer (the binding requirement covers surfaces that *show*
  time-derived UI; this page currently shows none).

The model layer is **not** at fault: every time helper is pure with an
injectable clock — `isCurrentSession` (`js/model.js:420-426`), `dayCursor`
(`:436-461`), `nextKey`/`nextSessionIdx` (`:465-482`), `availability`
(`:487-498`), `startFromToday`/`anchorDay` (`:500-532`) — each with a
`now = now || new Date()` default (`:421,437,476,488,508`). Given a fresh
clock they answer correctly at any time (issue 050's batteries prove it); the
pages just never ask again.

### Browser evidence (executed 2026-10-19)

Real browser, controlled clock: Playwright (module from
`/home/user/Projects/esteri/node_modules`) driving system Chromium
(`/usr/bin/chromium`, headless) against the worktree served by
`python3 -m http.server 8731` (stopped by PID afterwards). `page.clock.install`
was called **before navigation**, so every `new Date()` in the page — including
the closures captured at load — reads the fake clock; `page.clock.fastForward`
advanced the clock and fired due timers (the classes 30 s interval fired —
proven by the grid updating). Scenario: all pages loaded at **Wed 2026-10-14
10:30** (inside slot `10h00-11h30`), then the clock jumped forward.
Fixture (verified in `emplois.csv`, field `LCS3-GLSI_D Groupe 1`): GLSI3D1's
Wednesday sessions are `10h00-11h30` (Abbassi) and `11h40-13h10` (Bannour);
Bannour also teaches Wednesday `08h15-09h45` (`LCS3-GLSI_D Groupe 2`).

**A. classes.html, GLSI3D1 selected** (list = day-group section rows; grid =
whole-week `td.c-cell`/`th.c-day`/`div.cursor`):

| Clock | day-group list (frozen surfaces) | whole-week grid (ticker-refreshed) |
|---|---|---|
| load Wed 10:30 | NOW on mercredi `10h00-11h30`; NEXT on mercredi `11h40-13h10`; anchor `mercredi`; mercredi not dim | now cell `MERCREDI 10h00-11h30`; next `MERCREDI 11h40-13h10`; `th.c-day.today` = MERCREDI; cursor shown |
| fastForward → Wed 12:00 (30 s ticker fired) | **unchanged** — still NOW `10h00-11h30`, NEXT `11h40-13h10` | **fresh** — now cell `MERCREDI 11h40-13h10`; next `MERCREDI 13h20-14h50` |
| ↳ contradiction | list: "NOW 10h00-11h30" | grid: "NOW 11h40-13h10" — two different NOWs on one page |
| re-select GLSI3D1 (clear + retype) at 12:00 | **still** NOW `10h00-11h30` | **regressed** to now cell `MERCREDI 10h00-11h30` / next `11h40-13h10` — the re-render re-asserts the load-time closure clock |
| fastForward → Wed 18:30 (day over) | still "NOW mercredi 10h00-11h30" (NEXT still on 11h40-13h10) — a NOW tag 8 h after the day ended | all marks cleared; cursor `style.display:"none"` (fresh) |
| fastForward → Thu 09:00 | **still** NOW mercredi `10h00-11h30`; anchor still `mercredi` first; mercredi **not** dim, jeudi **dim** — exactly inverted from the truth | now cell `JEUDI 08h15-09h45`; next `JEUDI 10h00-11h30`; today col JEUDI (fresh) |

**B. time.html** (no ticker — nothing ever moves):

| Clock | NOW/NEXT tags | "(today)" bucket |
|---|---|---|
| load Wed 10:30 | NOW `MERCREDI 10h00-11h30`; NEXT `MERCREDI 11h40-13h10` | `MERCREDI (today) (216)` |
| fastForward → Wed 12:00 | **unchanged** (expected NOW `MERCREDI 11h40-13h10`) | unchanged |
| fastForward → Thu 09:00 | **unchanged** (expected NOW `JEUDI 08h15-09h45`) | still `MERCREDI (today)` on a Thursday |

**C. index.html (teachers):**

- Bannour detail at load (Wed 10:30): NEXT on mercredi `11h40-13h10` (correct
  at that moment — her `08h15-09h45` had ended); mercredi not dim, the other
  four days dim. After fastForward → 12:00 the detail DOM is **byte-identical**
  (still NEXT `11h40-13h10`; expected NOW on that row and the wrapping NEXT
  moved to `lundi 08h15-09h45`). No timer exists that could change it.
- Availability ordering: the boot list (rendered at Wed 10:30 through
  `match.searchSections(index, '', avail)`, `js/teachers.js:530`) starts
  `Abbassi, Abdelhafidh, Achoura, Alaoui L., Baati, Bannour, Belhadj Taher,
  Ben Ayed, Ben Daoud, Ben Haj, Ben Krim, Ben Neji, Boutayeb, Chahdoura,
  Chouk` (132 names). After fastForward → **Sun 2026-10-18 10:00** and a
  re-render through the real code path (clear the filter → `onInput` →
  `searchSections(index, '', avail)`), the rendered order is **byte-identical**
  (same 132 names in the same order). A fresh-clock recomputation executed in
  the same page at the same virtual Sunday (reload the store, rebuild
  `avail` with `model.availability(…, new Date())`, rerun `searchSections`)
  yields `Abbassi, Abid, Achoura, Ahmed, Aloui, Aloulou, Bannour, Bayoudh,
  Belhadj Mohamed, Belkacem, Ben Amor E., Bouchareb, Boussema S., Bsir,
  Chafroud` — different from position 2 (on Sunday nobody is "today", so the
  ranking collapses toward alphabetical). The rendered list therefore carries
  Wednesday's frozen ranking on Sunday.

**D. timetable.html (matrix):** 0 `now|next|today|dim` elements among 924
`td` both at load (Wed 10:30) and after fastForward → 12:00; `#dayFilter`
stays on "All days". Confirms by execution what the code shows: the page has
no clock-derived state at all.

### Expected (binding, from the user)

Time-derived UI — NOW/NEXT marks, `dim`, today markings (the `(today)` bucket,
the `c-day today` columns), the day-group rotation anchor (issue 050),
"Day over"-style notes, and the red cursor — **updates live on every page that
shows it**, without the user reloading or re-selecting. Concretely:

1. classes.html: when the ticker (or any refresh) moves the grid across a
   slot/day boundary, the day-group list's NOW/NEXT tags, section `dim` and
   the start-from-today anchor move with it; no contradictory state is
   observable at any time, including after a re-selection.
2. index.html (teachers): the open teacher selection's NOW/NEXT/dim/anchor
   update live, and the "available today" list ordering re-derives as
   availability changes (e.g. when today's sessions end, or the day rolls
   over).
3. time.html: NOW/NEXT tags, per-day `dim`, the `(today)` bucket, the Sunday
   note and the "Day over" line track the clock — at a slot boundary NOW
   moves; at midnight the `(today)` bucket moves to the new day.
4. timetable.html shows no time-derived UI today; nothing there is expected to
   refresh. If the Maintainer decides the matrix should mark today/now, that
   marking must obey the same live-update rule.
5. The *how* — tick cadence, full re-render vs incremental updates, and
   preservation of scroll/focus state (the time page's auto-scroll to today's
   bucket `js/app.js:132`, the search box focus/ghost state, the classes
   cursor position) — is explicitly left to the Maintainer.

## Root cause

Every page turns a one-shot `new Date()` into a page-lifetime snapshot and
renders its time-derived surfaces from it; only one page has any refresh at
all, and its refresh covers only a subset of the surfaces:

1. **Captured-clock sites** (the snapshot points):
   - `js/classes.js:56` — `var now = new Date();` in the `initClassesPage`
     closure; consumed by every list surface in `renderWeek` (`:218, :234,
     :241-242, :264`) and the grid build (`:282-308`). Because it is a
     closure variable, even re-selection re-renders from load time (executed).
   - `js/teachers.js:46` — page-load `now` feeding the one-shot `avail` map
     (`:130-135`) that ranks the teacher list for the whole page lifetime
     (`:402, :422, :428, :530`).
   - `js/teachers.js:264` — `now2` inside `showTeacher`: fresh per
     *selection*, never per *time*; an open selection freezes until the user
     clicks another teacher.
   - `js/app.js:38` — page-load `now` for the whole time page; `nextSlot` is
     additionally hoisted as a one-shot value (`:56`), and the `<ul>` is
     built once (`:87-108`), so even an event-driven re-check would have
     stale inputs unless these are recomputed.
2. **The partial ticker** — `js/classes.js:362-367` is the site's only timer.
   It recomputes the cursor with a fresh clock (`new Date()` at `:365`) but
   hands it to `applyCursor` (`:325-360`), whose entire reach is
   `td.c-cell` class toggles, `th.c-day` toggles and the `.cursor` line's
   position/visibility. The day-group list is emitted exclusively by
   `renderWeek` (`:217-320`) as an HTML string into `detail.innerHTML`
   (`:315`) from the load-time closure — the ticker's fresh cursor never
   reaches it. Result: two clocks coexist on one page (executed contradiction
   above), and at day rollover the list's `dim` polarity inverts while the
   grid is already correct.
3. **No refresh mechanism at all elsewhere** — `js/teachers.js` (both
   surfaces), `js/app.js`'s time page, and the matrix page contain no
   `setInterval`/`setTimeout`/`visibilitychange`/focus hook (grep-verified
   across `js/` and all HTML: the single hit in the whole site's runtime code
   is `js/classes.js:364`). Whatever is rendered at load/selection is what the
   user sees until they act.
4. **The matrix page is not stale, it is blank to time** —
   `initTimetablePage` (`js/app.js:138-170`) never consults the clock; this
   is a scope question for the Maintainer, not a freeze.

### Tests that pin (parts of) the current behavior

Baseline executed in this worktree: `node --test` → **103 tests, 103 pass,
0 fail**.

- `test/classes.test.js` — the day-group behavioral harness runs the *emission
  only*: `classesListBlock()` (`:537-543`) slices `js/classes.js` between
  `var liveDays = {};` and `<div class="weekwrap"`, and `runClassesList`
  (`:686-698`) executes that slice in a vm sandbox with an injected `now` and
  pre-computed `cursor`. The batteries (`:816-855`) run at fixed stubbed
  clocks (`friClass`/`sunClass` `:813-814`, `at` `:183`). **The 30 s ticker,
  `applyCursor` and `startCursor` are never executed by any test** — the only
  test reference to `applyCursor` is as the end marker of the `renderWeek`
  source slice (`:868`); nothing pins `setInterval`, the `30000` cadence, or
  the ticker's behavior.
- Clock-literal pins that constrain *how* a refresh can be implemented:
  `test/classes.test.js:578` pins the literal
  `model.isCurrentSession(s.day, s.time, now)` inside the list block and
  `:579` the literal `s.time === cursor.next`; `:580` forbids `nextSessionIdx(`
  in classes.js. The structural test (`:865-911`) pins the emission order,
  the `week.sessions.forEach` count of 2 (`:889`), `byDay`/`dayOrder`
  exactly-once (`:892-895`) and the grid tail (`store.days.forEach` × 2,
  `startFromToday` × 0, `:898-903`). A refresh implemented by re-invoking the
  existing closure-based `renderWeek` with the *same* captured `now` changes
  nothing; anything that renames/relocates `now`, `cursor`, `liveDays`,
  `dayOrder` or the literals trips these pins.
- `test/teacher-daygroups.test.js` — `runShowTeacher` (`:70-91`) executes the
  real `showTeacher` source with a per-invocation `FakeDate` (`:68, :84`),
  which pins per-clock correctness of the marks but nothing about refreshing;
  the batteries run at fixed clocks (`:264, :272, :279` and the Saturday
  test). `:438-439` pin `setTimeout` absence in both `js/teachers.js` and
  `js/classes.js` ("no setTimeout left in the … page") — a `setInterval`-
  based refresh does not trip them, a `setTimeout`-loop one would; `:433`
  pins the blur handler staying synchronous.
- **`time.html`, `timetable.html` and `js/app.js` have zero test coverage** —
  no test file executes or pins any behavior of the time or matrix renderers
  (the only `app.js` strings inside `test/classes.test.js` — `:480, :501,
  :510` — are stale comments about the leaf filter that now lives in
  `classes.js`). A separate issue **#054** is being filed on this coverage
  gap; it is cited here only so the Maintainer knows the time page's current
  behavior is guarded by nothing.

### Change surface (for the Maintainer)

`js/classes.js` (the closure clock `:56`, `renderWeek`, the ticker
`:362-367`), `js/teachers.js` (the `avail` map `:130-135` and `showTeacher`),
`js/app.js` (`initTimePage`; the matrix page only if today/now marking is
wanted), possibly `js/model.js` if a shared refresh/clock-broadcast helper
belongs in the model layer; tests: the clock-literal pins in
`test/classes.test.js` (`:578-579`), the FakeDate harness in
`test/teacher-daygroups.test.js`, plus the missing time/matrix coverage (#054).

## Repro steps

Commands (from the worktree root
`/home/user/.local/share/opencode/worktree/1de5bb/051-live-updates`):

```
node --test                                  # baseline: 103 tests, 103 pass, 0 fail
python3 -m http.server 8731
curl -s -o /dev/null -w '%{http_code}' http://localhost:8731/classes.html   # 200
```

**Browser reproduction without fake clocks (any real browser):** open
http://localhost:8731/classes.html shortly before a slot boundary (e.g.
11h35), select a class that meets in both the current and the next slot, and
watch. Within 30 s of the boundary the whole-week grid moves its NOW cell to
the next slot; the day-group list above it keeps the old NOW/NEXT forever.
Leave the tab open across 18h15 and the grid goes blank (cursor hidden) while
the list keeps its NOW tag; leave it open past midnight and the list keeps
marking yesterday live. The same opening-at-the-wrong-moment effect can be
seen side by side: a page opened at 11h35 and a page opened at 12h05 show
different NOW rows for the same class, and the older one never catches up.

**Deterministic reproduction (as executed for this report — Playwright
controlled clock):** serve the worktree, then for each page call
`page.clock.install({ time: <Wed 2026-10-14 10:30 local> })` **before**
navigation, open the page, select the entity, snapshot the marks, then
`page.clock.fastForward('01:30:00')` (→ Wed 12:00; fires the classes 30 s
interval) and snapshot again:

1. **classes.html** — http://localhost:8731/classes.html, type `GLSI3D1` in
   "Search class (LCS, GLSI3D1…)" (single result auto-opens). At load: list
   NOW on `mercredi 10h00-11h30`, NEXT on `mercredi 11h40-13h10`; grid now
   cell `MERCREDI 10h00-11h30`. After the fast-forward: grid now cell
   `MERCREDI 11h40-13h10` (fresh) while the list still says NOW
   `10h00-11h30` (stale). Clearing and re-typing `GLSI3D1` at 12:00 leaves
   the list stale and pulls the grid back to the 10:30 marks. Repeat with
   `fastForward` to Wed 18:30 (grid blank/cursor hidden, list still NOW) and
   to Thu 09:00 (grid marks JEUDI, list still marks MERCREDI as live).
2. **time.html** — http://localhost:8731/time.html. At load: NOW on
   `MERCREDI 10h00-11h30`, NEXT on `MERCREDI 11h40-13h10`, bucket
   `MERCREDI (today) (216)`. After fast-forward to 12:00: unchanged. After
   fast-forward to Thu 09:00: still unchanged — the `(today)` bucket still
   says MERCREDI on a Thursday.
3. **index.html** (teachers) — http://localhost:8731/index.html, type
   `Bannour` (single result auto-opens). At load: NEXT on
   `mercredi 11h40-13h10`. After fast-forward to 12:00: byte-identical detail
   (expected NOW on that row). For the ordering: note the full-list order at
   load, fast-forward to Sun 2026-10-18 10:00, clear the filter to re-render
   the list — the order is byte-identical to the Wednesday boot order, while
   a fresh-clock `match.searchSections` computed in-page at the same Sunday
   differs from position 2.
4. **timetable.html** — http://localhost:8731/timetable.html. No
   now/next/today/dim marks exist at any clock (0 of 924 `td`); the day
   filter stays on "All days"; nothing to freeze because nothing is
   clock-derived.

## Discussion

### Maintainer decision (2026-10-19)

Round 1 — final decision, no outstanding requests; the Implementer may act on
the criteria below. Every line number cited here was re-verified directly
against this post-`a259c71` (issue 050 merged) tree, and the baseline was
re-executed in this worktree: `node --test` → **103 tests, 103 pass, 0 fail**.
I did not modify any code; this entry is my only write.

**Verdict**

- **VALID, in scope, as requested — and the directive is read program-wide.**
  "the program should update live based on time" means every page that shows
  time-derived UI refreshes it on its own, within one tick of a boundary:
  the classes page (day-group NOW/NEXT/`dim`, the issue-050 rotation anchor,
  the whole-week grid, the cursor — **including the re-selection path**,
  which today reverts the grid to load time), the teachers page (the open
  detail's NOW/NEXT/`dim`/anchor *and* the availability-driven "available
  today" list ordering — the user said "the program", so this page ticks
  too), and the time page (NOW/NEXT tags, per-day `dim`, the `(today)`
  bucket, the Sunday note, the "Day over" line). "Live" is bound to the
  site's existing cadence: **within 30 seconds** of a slot/day boundary,
  with no reload and no re-selection.
- The Reporter's analysis is accurate as written — I re-verified every cited
  line: one frozen closure clock per page (`js/classes.js:56`,
  `js/teachers.js:46`, `js/app.js:38`), the site's single partial ticker
  (`js/classes.js:362-367`) whose fresh clock reaches only `applyCursor`
  (`:325-360`), and zero timers anywhere else (grep-verified by the Reporter
  and re-checked: the only `setInterval` in `js/` is that one). Two clocks on
  one page, three pages with no refresh mechanism at all. The model layer is
  exonerated: every helper is pure with an injectable clock
  (`js/model.js:421,437,476,488,508`), so this is page wiring and the fix
  lives entirely in the page files — **zero `js/model.js` diff**.
- **timetable.html (matrix): out of scope, by ruling.** `initTimetablePage`
  (`js/app.js:138-170`) derives nothing from the clock (grep + the Reporter's
  executed 0-of-924 check), so nothing there can go stale and the directive is
  not triggered. Adding today/now marking to the matrix would be a new
  feature, not a liveness fix — rejected for this issue; a future issue may
  propose it and must then obey the same live rule. Criterion 21 pins this.
- *Re-render vs incremental was asked for explicitly.* Ruled: **full
  re-emission per pass, DOM write gated on output inequality** — see
  direction 3 and the rejected alternatives in direction 6. The rotation
  anchor is ruled **live re-grading** — see direction 4.
- Docs, `styles.css`, all HTML files: zero diff (049/050 precedent; the fix
  re-emits existing markup with existing classes).

**Architectural direction**

1. *One clock per render pass, per page — no page-load-frozen reads.* Each
   page keeps its existing single page-clock variable, but every render
   entry point takes a fresh `new Date()` at its head, and everything in
   that pass (marks, dim, rotation, cursor, grid, buckets) reads that one
   clock. Concretely: classes — the assignment moves into `renderWeek`'s
   head, so selection *and* tick share one read per pass; time — the tick
   reassigns `now` before re-deriving anything; teachers — the tick reassigns
   the page `now` (for `avail`), and `showTeacher` keeps its per-entry-point
   `var now2 = new Date();` byte-identical (selection is an entry point too;
   on refresh it runs inside the same tick, µs later). Two reads on the
   teachers tick are explicitly acceptable; *unifying them by parameterizing
   `now2` is rejected* — it would break the `model.isCurrentSession(…, now2)`
   pin (`test/teacher-daygroups.test.js:148`) and the FakeDate harness
   (`:68-72`). What is forbidden is a clock older than the current tick —
   never a surface reading a page-load snapshot.
2. *Where the tick lives: per page, in each page file.* The three page files
   are self-contained **by design** ("duplicated … by design, not imported —
   zero coupling", `js/classes.js:1-6`, `js/teachers.js:1-6`, `js/app.js:1-7`),
   and the gate each page needs is page-local DOM state. So each affected
   page owns `function tick()` + one `setInterval(tick, 30000)` (the existing
   cursor cadence) + one `visibilitychange` catch-up. *Rejected alternatives*:
   (a) a shared ticker module (new `js/live.js` or a model-layer broadcast) —
   it would add the load-order coupling the architecture deliberately avoids,
   put DOM knowledge in the DOM-free model layer, and the per-page gate still
   differs, so nothing meaningful would be shared; (b) a finer/aligned cadence
   (1 s, minute-aligned `setTimeout` chains) — slots are ≥65 minutes, 30 s
   worst-case is already the accepted grid behavior, and `setTimeout` is
   *test-forbidden* as a raw substring in both page files
   (`test/teacher-daygroups.test.js:438-439`); (c) `focus`/`window` listeners
   in addition to `visibilitychange` — redundant: the only staleness window a
   listener closes is the background-timer throttle/freeze, which is
   visibility-keyed. Each page registers exactly:
   `document.addEventListener('visibilitychange', function () { if (!document.hidden) tick(); });`
3. *Re-render strategy: re-emit whole, commit only when the output differs.*
   Every surface keeps **one** producer — the existing emission function
   (`renderWeek`, `showTeacher`, the time page's list builder) — which now
   runs on every tick from the pass clock. Each emission ends in a gate:
   the freshly built HTML string is compared with the last committed string
   (`lastWeekHTML` / `lastDetailH` / the time page's discrete state key), and
   the DOM is written **only if they differ**; a selection (non-refresh call)
   always writes. Rationale: (a) targeted patching of the day-group list
   (spans, `dim`, section order) would require new `data-*` addressing plus a
   second implementation of the mark/dim/anchor rules — a second source of
   truth that can drift from the emission, exactly the pile-up this house
   rejects; (b) an *ungated* full re-render every 30 s would reset scroll on
   every affected pane (`#layout > #detail` is a scroll container —
   `overflow-x: auto` computes `overflow-y: auto`, `styles.css:199`, and the
   narrow comment at `:517-522` says so explicitly; `#teacherList`
   `:160-161`, `#slotList` `:452-453` both scroll) and would flip the narrow
   `is-list` pane state under a typing user; (c) comparing against a
   hand-built "signature" (clock fields + predicates) was rejected — the
   emitted string *is* the signature, computed by the emission itself, so
   no predicate is duplicated and no signature can drift. String compare of a
   few KB every 30 s is trivial. `applyCursor` stays exactly as it is and
   stays **outside** the gate, called on every tick: `cursor.frac` is the one
   continuous value, absent from the emitted string, so the red line keeps
   moving between content changes (its current job —
   `test/classes.test.js:865-911` keeps guarding it).
4. *Rotation-anchor ruling: the anchor re-grades live.* The issue-050 anchor
   (`model.startFromToday(…, now)`, `js/model.js:526-532`) is time-derived
   like everything else, and the Reporter's Expected §1 names it explicitly,
   so the tick re-derives it inside the same emission as NOW/NEXT/dim. Two
   consequences, both intended: (a) at a day-end boundary (e.g. GLSI3D1 Sat
   09:45, weekday 18:15, midnight) the list reorders **in the same commit**
   that clears/moves NOW — one coherent snapshot from one clock, at most
   once per day-end; freezing it instead would keep the exact inverted
   contradiction the browser evidence shows (Thu 09:00: `mercredi` first,
   `mercredi` not dim) and would leave a stale, ended day at the reader's
   top; (b) the reorder-under-the-reader is *bounded* to those day-boundary
   ticks (the gate suppresses it every other tick) — live correctness beats
   content stability here, and the user directive decides it. Pinned by the
   two new rotation-on-tick tests (criteria 22.5, 23.4). Do not "stabilise"
   the order between boundaries — there is nothing to stabilise: it only
   ever changes when the state changes.
5. *Per-surface recompute per tick (exactly what the pass re-derives):*
   - **classes** (ticks only while a class view is on screen — the existing
     lifecycle, renamed): fresh clock → the whole `renderWeek` emission —
     `dayCursor` (`:218`), `liveDays`/`dim` (`:232-237`), row NOW/NEXT
     (`:240-255`), the anchor (`:264`), grid cells/headers (`:282-308`) —
     then the gate, then `applyCursor` unconditionally. The tick itself is
     `if (currentWeek) renderWeek(currentWeek, true);`.
   - **teachers** (ticks unconditionally — the list is always shown): fresh
     clock → rebuild `avail` → re-run `match.searchSections(index,
     search.value, avail)` → **key-gated** list re-render (key = the
     section/teacher order the list would render — availability only reorders
     the empty-query list, `js/match.js:270-281`; membership is
     time-independent, so the gate is uniform and can never thrash) → if a
     teacher is open, `showTeacher(currentTeacher, true)` → its own string
     gate. The tick **never selects**: no auto-jump, no `search.value`
     writes, no suggest/ghost disturbance.
   - **time**: fresh clock → re-derive `todayName`/`isSunday`/`nextSlot` →
     if the discrete state key (today, next slot, which of today's slots are
     live) changed → rebuild the whole `ul` (buckets, `(today)` label, NOW/
     NEXT entries, `dim`, Sunday note, Day-over line), preserving
     `ul.scrollTop` and the selected slot's `active` class; initial paint
     keeps the existing auto-scroll to today's bucket (`js/app.js:132`).
     The detail pane (`show()`, `:110-129`) is slot-derived, never
     time-derived: untouched by ticks.
   - **matrix**: nothing (ruling above).
6. *Rejected alternatives, consolidated:* (a) targeted list patching — see
   direction 3(a); (b) ungated re-render — 3(b); (c) shared ticker module —
   2(a); (d) `setTimeout` loops / sub-30 s cadence — 2(b); (e) refreshing
   only `applyCursor` and leaving the closure `now` for the list (the minimal
   patch) — fixes one page's contradiction while the re-selection regression
   (`test` evidence: re-render reverts the grid), the time page and the
   teachers page stay frozen: partial compliance; (f) keeping a saved
   scroll-offset across an always-write re-render — a hack whose need the
   gate removes outright (house rule: remove the need, don't work around
   it); (g) freezing the anchor at selection time — rejected by direction 4.

**Acceptance criteria**

Classes page (`js/classes.js`):

1. Replace the ticker cluster (`startCursor`/`stopCursor`/`cursorTimer`,
   `:362-370`, decl `:72`) per direction 2 — exact shape:
   `var tickTimer = null;` (at `:72`, replacing `var cursorTimer = null;`);
   beside it or near it, `var currentWeek;` and `var lastWeekHTML;`
   (**uninitialized** — see the count pins in criterion 22.1), each with a
   one-line comment; then, at the old `startCursor` position:
   ```js
   // The page's single 30 s tick (issue 051): re-enter renderWeek, which
   // takes a fresh clock at its head; the emission + gate decide whether
   // the DOM needs a write. Also invoked by the visibilitychange listener
   // below so a throttled background tab catches up the moment it returns.
   function tick() {
     if (currentWeek) renderWeek(currentWeek, true);
   }
   function startTick() {
     stopTick();
     tickTimer = setInterval(tick, 30000);
   }
   function stopTick() {
     if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
   }
   ```
   Rename both call sites: `renderWeek`'s tail `startCursor();` (`:319`) →
   `startTick();`, `showClass`'s no-match `stopCursor();` (`:379`) → see
   criterion 5. No `startCursor`/`stopCursor`/`cursorTimer` identifier may
   remain.
2. `renderWeek` (`:217`) becomes `function renderWeek(week, refresh)`. Its
   first two statements, inserted **before** the existing
   `var cursor = model.dayCursor(now, store.slots);` (`:218`):
   ```js
   now = new Date();      // one fresh clock per render pass (issue 051)
   currentWeek = week;    // the view the tick refreshes until cleared
   ```
   The page-load capture `var now = new Date();` (`:56`) stays byte-identical
   (harmless init; the pass head overwrites it). Everything from
   `var cursor = …` through the `h += '</div>';` grid emission (`:218-314`)
   stays **byte-identical** — the emission is not touched by this issue.
3. Gate the commit (replaces the unconditional `:315-317`):
   ```js
   // Commit only when the emitted output differs: the 30 s tick re-enters
   // here most times with identical output, and a no-op innerHTML write
   // would reset the detail scroll and flip the narrow list/card state
   // (issue 051). A selection (refresh falsy) always commits.
   if (!refresh || h !== lastWeekHTML) {
     detail.innerHTML = h;
     lastWeekHTML = h;
     if (!refresh) {
       if (layout) layout.classList.remove('is-list');
       syncClear();
     }
   }
   applyCursor(cursor);
   startTick();
   ```
   `applyCursor(cursor);` and `startTick();` remain **outside** the gate,
   unconditional (direction 3). The selection path must be side-effect-
   identical to today.
4. Register, once, at the end of `initClassesPage` (beside the initial
   paint, `:600-604`):
   ```js
   document.addEventListener('visibilitychange', function () {
     if (!document.hidden) tick();
   });
   ```
5. Ownership clearing — every write that takes the detail away from a
   rendered week adds `currentWeek = null; stopTick();` (two statements,
   in that order): `showClass`'s no-match branch (`:375-379` — its existing
   stop becomes `stopTick();`, plus the new null), `onInput`'s empty branch
   (`:479`), `commit`'s empty branch (`:505`), `commit`'s no-match branch
   (`:517`). **Exactly four** `currentWeek = null;` occurrences in
   `js/classes.js` (declaration stays `var currentWeek;`). The initial paint
   (`:602`) needs nothing (`currentWeek` starts undefined). This makes the
   invariant: *the ticker runs iff a rendered class view is on screen*, and
   a cleared/nomatch view can never be resurrected by a later boundary tick.
6. Keep `search`/suggest/ghost/`renderList`/`markActive`/`syncList` handlers
   (`:388-598`) byte-identical — the filter UI is not time-derived. Do not
   add any `search.addEventListener` (a global count is pinned,
   `test/teacher-daygroups.test.js:440-442`).
7. Comment discipline: no new comment or identifier in `js/classes.js` may
   contain any of the pinned/retired substrings listed in risk 2.

Teachers page (`js/teachers.js`):

8. Replace the one-shot availability block (`:130-135`) with:
   ```js
   // availability is time-dependent: rebuilt on every tick (issue 051),
   // for list ordering only (never a committed-query key, no visual
   // encoding).
   var avail;
   function buildAvail() {
     avail = {};
     store.teachers.forEach(function (n) {
       avail[n] = model.availability(store.sessionsOf(n), now);
     });
   }
   buildAvail();
   ```
   The old "compute once per page load" comment must be gone (pinned).
9. In the same region (before `function breakdownHTML`, `:231` — **outside**
   the harness span `breakdownHTML`→`markActive`, `test/teacher-daygroups.
   test.js:45-50`), add:
   ```js
   var lastListKey;     // section+teacher order the list was last built from
   var currentTeacher;  // the teacher whose detail this page owns (null = none)
   var lastDetailH;     // last committed detail markup (refresh detector)

   function listKeyOf(sections) {
     return sections.map(function (sec) {
       return sec.key + '=' + sec.hits.map(function (h) { return h.teacher; }).join(',');
     }).join('|');
   }

   // The page's single 30 s tick (issue 051): fresh clock -> availability
   // -> key-gated list order -> key-gated open detail. Never selects,
   // never writes the filter, never touches the suggest/ghost overlays.
   function tick() {
     now = new Date();
     buildAvail();
     var res = match.searchSections(index, search.value, avail);
     var key = listKeyOf(res.sections);
     if (key !== lastListKey) renderList(res.sections);
     if (currentTeacher) showTeacher(currentTeacher, true);
   }
   ```
   (All declarations uninitialized; `undefined` is the right falsy default —
   the count pins depend on the declarations not containing `= null;`.)
   Order matters: the list refresh runs **before** `showTeacher` so the
   latter's unconditional `markActive(name)` repairs the highlight after a
   list rebuild.
10. `renderList` (`:155`) gains one first statement:
    `lastListKey = listKeyOf(sections);` — then its body byte-identical.
    This covers boot (`:530`), `onInput` (`:403`) and `commit` (`:422`,
    `:429`) uniformly.
11. `showTeacher` becomes `function showTeacher(name, refresh)` (the literal
    prefix `function showTeacher(name)` must survive — the harness finds it
    by `indexOf`, `test/teacher-daygroups.test.js:54`). Changes, and only:
    - the pair `renderSuggest([]); renderGhost();` (`:261-262`) is guarded:
      `if (!refresh) { renderSuggest([]); renderGhost(); }` — a tick must not
      dismiss an open autocomplete menu;
    - right after `if (!t) return;`, add `currentTeacher = name;`
    - `var now2 = new Date();` (`:264`) and the entire emission
      (`:265-310`, including `upcoming`/`liveDays`/`dayOrder`/
      `startFromToday`/rows/breakdown) stay **byte-identical**;
    - the commit (`:311-316`) becomes:
      ```js
      if (!refresh || h !== lastDetailH) {
        detail.innerHTML = h;
        lastDetailH = h;
      }
      markActive(name);
      if (!refresh) {
        if (layout) layout.classList.remove('is-list');
        syncClear();
      }
      ```
      (`markActive` stays unconditional — it is idempotent and repairs the
      list highlight after a tick-driven list rebuild; the selection-only
      side effects stay behind `!refresh`.)
12. Clear ownership: `currentTeacher = null;` added to `onInput`'s empty
    branch (`:407`), `commit`'s empty branch (`:423` region) and `commit`'s
    no-match branch (`:436`). **Exactly three** `currentTeacher = null;`
    occurrences.
13. Start the ticker at the end of `initTeachersPage` (beside the initial
    paint, `:530-533`): `setInterval(tick, 30000);` (no stop — both surfaces
    are always visible) plus the same `visibilitychange` listener as
    criterion 4. No timer handle needs saving.
14. The `avail` parameter keeps flowing to every existing
    `match.searchSections(index, q, avail)` call site (`:402, :422, :428,
    :530`) — `js/match.js` gets zero diff; the ordering behavior itself is
    `avRank` on the empty-query branch (`js/match.js:270-281`), unchanged.

Time page (`js/app.js`, `initTimePage`):

15. Keep `var now = new Date();` (`:38`), `todayName`/`isSunday` (`:39-40`),
    `var nextSlot = todayNextSlot();` (`:56`) where they are — they become
    per-tick mutable state reassigned by `tick`. Add `var lastListKey;`
    (uninitialized) beside them. `todayNextSlot`, `marksFor`, `entry`,
    `bucket`, `show` bodies byte-identical.
16. Add the state key (direction 5):
    ```js
    // Discrete time state of the slot list (issue 051): today, the next
    // slot, and which of today's slots are live. Changes only at slot/day
    // boundaries — the tick rebuilds exactly when this differs.
    function listKey() {
      return todayName + '|' + nextSlot + '|' + store.slots.map(function (s) {
        return model.isCurrentSession(todayName, s, now) ? '1' : '0';
      }).join('');
    }
    ```
    (`todayName === 'DIMANCHE'` encodes Sunday; the Day-over condition
    `!isSunday && nextSlot === null && no live slot` and the `dim`/`(today)`
    derivations are all functions of these three components — no predicate
    is duplicated: the key calls the very `model.isCurrentSession` the
    entries call.)
17. Wrap the straight-line build (`:87-108`) **and** the auto-scroll (`:132`)
    into `function renderSlotList(refresh)`:
    - first statement on refresh: capture the active slot
      (`ul.querySelectorAll('li.active')` → its `data-day`/`data-slot`, if it
      has one) and `var keepScroll = ul.scrollTop;`;
    - then `ul.innerHTML = '';` and the existing build code verbatim
      (Sunday info li, day buckets with the `(today)` label and `today`/`dim`
      class, all slot entries, the Day-over li — `todayBucket` now local);
    - tail: `lastListKey = listKey();`
    - then, **only on refresh**: re-apply the `active` class (via
      `color`'s `C.active`) to the entry with the captured day/slot — do
      **not** re-run `show()` (the detail pane is slot-derived and must stay
      untouched) — and restore `ul.scrollTop = keepScroll;`. On the initial
      call (`refresh` falsy) keep the existing auto-scroll line
      `if (todayBucket) ul.scrollTop = todayBucket.offsetTop - ul.offsetTop;`
      byte-identical. Refresh never scrolls.
18. Add:
    ```js
    // The time page's single 30 s tick (issue 051): fresh clock, re-derive
    // the day/next-slot inputs, rebuild only if the discrete state moved.
    function tick() {
      now = new Date();
      todayName = model.JS_DAY[now.getDay()];
      isSunday = model.DAY_IDX[todayName] === undefined;
      nextSlot = todayNextSlot();
      if (listKey() !== lastListKey) renderSlotList(true);
    }
    ```
19. At the end of `initTimePage`, replace the straight-line build + scroll
    (`:87-108` + `:132`, now inside `renderSlotList`) with
    `renderSlotList();`, keep `status.textContent` (`:133`), and add
    `setInterval(tick, 30000);` plus the `visibilitychange` listener
    (criterion 4's snippet).
20. `initTimetablePage` (`:138-170`) and `boot` (`:176-182`): zero change.

Matrix page: see ruling — criterion 21. **Zero diff to
`initTimetablePage`**: no timer, no clock, no marking is added to the matrix
by this issue (a future feature issue may propose it under the same live
rule).

Tests:

22. `test/classes.test.js` — append **5** tests at the end of the file, and
    one new harness beside `runClassesList` (`:686-698`):
    - **Harness** `runRenderWeek(clock, week)`: slice `js/classes.js` from
      `function indexByDaySlot` to `function showClass` (covers
      `indexByDaySlot`, `renderWeek`, `applyCursor`, `startTick`,
      `stopTick`, `tick`), prefixed by the existing `classesArrow()`
      statement. Sandbox: `model`, `color`, `C: color.CLASSES`,
      `esc: data.esc`, `store`, `week` (the real
      `model.classWeek(groups, 'GLSI3D1')`), `console`; a `detail` stub whose
      `innerHTML` setter increments a `writes` counter and whose getter
      returns the last string, with `querySelectorAll()` → `[]` but counting
      invocations, and `querySelector(sel)` → for `'.cursor'` an object
      `{ style: { display: 'none' } }`, for everything else `null`;
      `layout: null`; `syncClear: function () {};`; `setInterval` capturing
      the callback into a harness variable and returning `1`;
      `clearInterval: function () {};`; `Date` as a swappable FakeDate
      (copy `runShowTeacher`'s trick, `test/teacher-daygroups.test.js:68-72`);
      **seed `now`, `currentWeek`, `lastWeekHTML`, `cursorTimer` as
      undefined** (sloppy-mode vm throws on read-before-write — criterion 1's
      declarations are not in the slice). Run the slice once, then drive
      `renderWeek(week)` and the captured tick callback via
      `vm.runInContext`. Clocks via the existing `at(monthDay, hh, mm)`
      helper (`:183`).
    - **1. `'classes.js ticks its whole week view from one fresh clock (issue 051)'`**
      (structural): over `sec = classesSection()` — `count(sec, 'setInterval(tick, 30000)') === 1`;
      `count(sec, 'now = new Date()') === 2` (page-load capture + renderWeek
      head — nothing else reads the wall clock); `sec.indexOf('model.dayCursor(new Date(), store.slots)') === -1`
      (the old scattered ticker clock is gone); `count(sec, 'currentWeek = null;') === 4`;
      `sec.indexOf('function startTick()') !== -1 && sec.indexOf('function stopTick()') !== -1 && sec.indexOf('startCursor') === -1`;
      `sec.indexOf('visibilitychange') !== -1 && sec.indexOf('document.hidden') !== -1`;
      `sec.indexOf('renderWeek(currentWeek, true)') !== -1`; and over the
      existing renderWeek slice (`function renderWeek`→`function applyCursor`,
      `:867-868`): contains `now = new Date();`, `currentWeek = week;` and
      `!refresh || h !== lastWeekHTML`.
    - **2. `'selecting a class emits the detail once, from the fresh clock (issue 051)'``** —
      FakeDate `at(14, 10, 30)` (Wed 2026-10-14, inside `10h00-11h30`);
      run `renderWeek(week)` → `writes === 1`;
      `detail.innerHTML` contains
      `'<span class="nowtag">● NOW</span></td><td class="c-time">10h00-11h30'`
      and the next-tag on `11h40-13h10`; `classHeadingsOf(lastHtml)[0] === 'mercredi'`;
      `currentWeek === week`.
    - **3. `'a tick inside the same time state rewrites nothing but still drives the cursor (issue 051)'`** —
      advance FakeDate to `at(14, 10, 45)` (same slot), invoke the captured
      tick → `writes === 0` while the `detail` stub's `querySelectorAll`
      counter **advanced** (proves `applyCursor` still ran outside the gate).
    - **4. `'a tick across a slot boundary rewrites the detail with fresh marks (issue 051)'`** —
      advance to `at(14, 12, 0)`, tick → `writes === 1`; the new string has
      `nowtag … c-time">11h40-13h10` and **lacks**
      `nowtag … c-time">10h00-11h30`; first heading still `'mercredi'`
      (no boundary-day rotation yet).
    - **5. `'a tick past day end re-grades the start-from-today anchor (issue 051)'`** —
      advance to `at(14, 18, 30)` (day over), tick → `writes === 1` (reset
      the counter first); `classHeadingsOf(lastHtml)[0] === 'jeudi'`
      (Wednesday's sessions ended → live anchor rolls to Thursday, which
      GLSI3D1 has) and `lastHtml.indexOf('nowtag') === -1` (nothing is NOW
      after the day). This is the rotation-anchor ruling, direction 4.
23. `test/teacher-daygroups.test.js` — append **4** tests at the end plus two
    small helpers:
    - `function wed(hh, mm) { return new RealDate(2026, 9, 14, hh, mm); } // Wednesday`
      beside `fri`/`sat`/`sun` (`:93-95`).
    - **Harness** `runShowTeacherSeq(name, clockA, clockB)` beside
      `runShowTeacher` (or at file end before the new tests): one context
      seeded exactly like `runShowTeacher` (`:74-85`) but with the counting
      `detail` stub (setter increments `writes`); step 1 runs
      `arrowStmt() + teacherSlice() + showTeacher(<name>)` with
      `Date = FakeDate(clockA)`; step 2 swaps the context's `Date` to
      `clockB` and runs `showTeacher(<name>, true)` in the **same** context
      (so the selection's `lastDetailH`/`currentTeacher` writes are visible
      to the refresh — seed them undefined to satisfy the read-before-write
      rule).
    - **6. `'teachers.js ticks availability and the open detail from fresh clocks (issue 051)'`**
      (structural): over `sec = APP_SRC.slice(APP_SRC.indexOf('function initTeachersPage'))` —
      `count(sec, 'setInterval(tick, 30000)') === 1`;
      `count(sec, 'now = new Date()') === 2` (page capture + tick; the
      `now2 = new Date()` line does not match the needle);
      `sec.indexOf('compute once per page load') === -1`;
      `sec.indexOf('function buildAvail()') !== -1` and
      `count(sec, 'model.availability(store.sessionsOf(n), now)') === 1`;
      `count(sec, 'currentTeacher = null;') === 3`;
      `sec.indexOf('visibilitychange') !== -1`;
      `teacherSlice().indexOf('setInterval') === -1` (the tick lives outside
      the executed slice); and over `showTeacherFn()`:
      `indexOf('function showTeacher(name, refresh)') !== -1` and
      `indexOf('h !== lastDetailH') !== -1`.
    - **7. `'a showTeacher refresh moves the marks to the fresh clock (issue 051)'`** —
      select `Bannour` at `wed(10, 30)` (evidence state: no `nowtag`, a
      `nexttag` on `mercredi 11h40-13h10`) → assert `writes === 1`,
      `nowtag` absent, `nexttag` present; refresh at `wed(12, 0)` →
      `writes === 1` (delta) and
      `nowtag … c-time">11h40-13h10` present in the new string.
    - **8. `'a showTeacher refresh with unchanged time state performs no write (issue 051)'`** —
      same selection at `wed(10, 30)`, refresh at `wed(10, 45)` (same slot,
      same anchor, same upcoming) → `writes` delta **0**.
    - **9. `'a showTeacher refresh re-grades the start-from-today anchor (issue 051)'`** —
      select `Barboura` at `fri(12, 0)` → `headingsOf(html)[0] === 'vendredi'`
      (evidence from criterion 050's battery); refresh at `sun(10, 0)`
      (Sun 2026-10-18) → `writes` delta ≥ 1 and
      `headingsOf(newHtml)[0] === 'jeudi'` — the anchor follows the clock on
      refresh, direction 4.
24. **New file `test/time-live.test.js`** (named to stay clear of the
    sibling issue #054's future `app.test.js`) — **7** tests. Harness: load
    the stack like `teacher-daygroups.loadStack` but also `js/color.js`
    (already in that list), build the real `store` from `emplois.csv` and
    `modelObjs = model.buildAll(store)`; slice `js/app.js` from
    `function initTimePage` to `function initTimetablePage`, prefixed by an
    `appArrowStmt()` copy of `arrowStmt()` (the time entries embed
    `NEXT_ARROW`); sandbox: `model`, `color`, `C: color.CLASSES`,
    `esc: data.esc`, `console`, swappable FakeDate, `document` stub
    (`getElementById` → element stubs for `slotList`/`detail`/`status`,
    `addEventListener` capturing or no-op), `setInterval` capturing the tick
    callback, `clearInterval`. Element stubs: `appendChild` incrementing a
    `writes` counter; `innerHTML` setter that clears `children` when set to
    `''` and otherwise stores the string; `classList` `add`/`toggle`/`remove`
    over a `className` string; `dataset`; `scrollTop`/`offsetTop`;
    `querySelectorAll` resolving `'li[data-day]'` to children with a
    `data-day` and `'li.active'` to children whose `className` contains
    `active`; `querySelector` likewise or `null`. Drive: one init per test at
    `clockA`, then swap `Date` and call the captured tick for each step;
    reset the `writes` counter before each tick.
    - **1. `'js/app.js ticks the time page from one fresh clock and leaves the matrix time-blind (issue 051)'`**
      (structural): slice A (`function initTimePage` →
      `function initTimetablePage`): `count(sliceA, 'new Date()') === 2`
      (init capture + tick), `count(sliceA, 'setInterval(tick, 30000)') === 1`,
      `indexOf('visibilitychange') !== -1`,
      `indexOf('function renderSlotList(refresh)') !== -1`,
      `indexOf('function listKey()') !== -1`,
      `indexOf('renderSlotList(true)') !== -1`,
      `indexOf('lastListKey = listKey()') !== -1`; slice B
      (`function initTimetablePage` → `function boot(store)`):
      `indexOf('setInterval') === -1 && indexOf('new Date') === -1`
      (pins the matrix ruling).
    - **2. `'the time page opens with NOW/NEXT and today from the page clock (issue 051)'`** —
      init at Wed 2026-10-14 10:30: `ul.children.length === 42`
      (6 days × (1 bucket + 6 entries), no info rows); the
      `MERCREDI 10h00-11h30` entry's `className` contains `now` and its
      `innerHTML` contains `nowtag`; `MERCREDI 11h40-13h10` contains `next`;
      bucket text `'MERCREDI (today) (216)'` with `today` in its class; no
      `Day over` row.
    - **3. `'a slot-boundary tick moves NOW and NEXT on the time page (issue 051)'`** —
      swap to Wed 12:00, tick → rebuild (`writes` > 0); `11h40-13h10` is
      `now`, `13h20-14h50` is `next`, the `(today)` bucket still MERCREDI.
    - **4. `'a tick inside the same time state rebuilds nothing (issue 051)'`** —
      swap to Wed 12:20, tick → `writes === 0`.
    - **5. `'the day-over line appears on the last tick of the day (issue 051)'`** —
      swap to Wed 18:30, tick → rebuild; no entry has `now`; exactly one row
      with text `'Day over — no more sessions today.'`;
      `ul.children.length === 43`; bucket still `MERCREDI (today) …`.
    - **6. `'midnight moves the today bucket, dim, NOW and the selected slot (issue 051)'`** —
      before ticking: invoke the `onclick` of the `VENDREDI`/`10h00-11h30`
      entry (real `show()` → detail table written, `active` class set) and
      set `ul.scrollTop = 120`; swap to Thu 2026-10-15 09:00, tick →
      bucket `'JEUDI (today)'` with `today` class; the MERCREDI bucket has
      `dim` and no `(today)`; the `JEUDI 08h15-09h45` entry is `now`;
      `ul.scrollTop === 120` (refresh never scrolls); the
      `VENDREDI 10h00-11h30` entry still carries `active`; `detail.innerHTML`
      still holds the slot table (not cleared).
    - **7. `'Sunday shows the no-sessions note with no today bucket (issue 051)'`** —
      swap to Sun 2026-10-18 10:00, tick → first row is the `info`
      `'No sessions on Sunday — showing the full week.'`; `ul.children.length === 43`
      (1 info + 42); no `(today)` bucket; no `now`/`next`/`dim` classes
      anywhere.

Verification:

25. `node --test` and `node --test test/*.test.js` → **119 tests, 119 pass,
    0 fail**. Justification: baseline 103 (re-executed in this worktree
    today), +5 (`test/classes.test.js`, criterion 22), +4
    (`test/teacher-daygroups.test.js`, criterion 23), +7 (new
    `test/time-live.test.js`, criterion 24); no existing `test()` call is
    modified, renamed or deleted — all existing tests must keep passing
    untouched, which is itself part of the proof that the emission and the
    pins are byte-stable.
26. `python3 -m http.server 8000` from the worktree root; `curl -s -o
    /dev/null -w '%{http_code}'` → `200` for `/classes.html`, `/index.html`,
    `/time.html`, `/timetable.html`, `/js/classes.js`, `/js/teachers.js`,
    `/js/app.js`, `/styles.css`, `/emplois.csv`. Kill the server **by PID**
    afterwards. No browser is available: append "visually unverified" in the
    fix entry, as 049/050 did.

Diff hygiene:

27. Exactly these files change: `js/classes.js`, `js/teachers.js`,
    `js/app.js`, `test/classes.test.js`, `test/teacher-daygroups.test.js`,
    `test/time-live.test.js` (new), plus this issue file (the `Fix
    implemented` entry only). **Zero diff** to: `js/model.js` (owned
    elsewhere — and untouched by design: the helpers already take injectable
    clocks), `js/match.js` (sibling issue #055's region), `js/color.js`,
    `js/data.js`, `js/libgroups.js`, `styles.css`, `classes.html`,
    `index.html`, `time.html`, `timetable.html`, `Design.md`, `emplois.csv`,
    `vendor/`, `test/fusion.test.js`, `test/libgroups.test.js`, and every
    other `issues/` file (siblings #052/#053/#054/#055 own theirs). The
    shared-file regions this diff touches (`test/classes.test.js`,
    `test/teacher-daygroups.test.js`) are **append-only at file end** plus
    two small helper inserts (`wed` beside the date helpers; the two
    harnesses beside their siblings) — if a parallel worktree has also
    appended there, the conflict is confined to those append regions.
    `Status:` stays `Open` until merge; no git operations by the Implementer.

Explicit no-go items:

28. The word `setTimeout` must not appear anywhere in `js/teachers.js` or
    `js/classes.js` (raw substring pins,
    `test/teacher-daygroups.test.js:438-439`) — and none is needed:
    `setInterval` + `visibilitychange` only, everywhere.
29. The emission is byte-stable: no change inside the day-group/grid string
    building of `renderWeek` (`js/classes.js:218-314`) or `showTeacher`
    (`js/teachers.js:265-310`), and no change to the time page's
    `entry`/`bucket`/`show` bodies. Do not rename or remove any structural
    marker: `var liveDays = {};`, `var dayOrder = [];`, `var byDay = {};`,
    `dayOrder.forEach`, `dayOrder = model.startFromToday(…)`,
    `function renderWeek`, `detail.innerHTML = h;`,
    `'<div class="weekwrap"'`, `model.isCurrentSession(s.day, s.time, now)`
    and `(…, now2)`, `s.time === cursor.next`, `upcoming.has(`,
    `color.sessionRow(`, `dimIdle: false`, `NEXT_ARROW`, `function showTeacher(name)`
    (prefix), `breakdownHTML(t)`, `layout.classList.remove('is-list')`,
    `if (!selected) syncList();`, `var exact = exactTeacher(res, q);`.
30. Retired/pinned substrings must not appear in **new comments either**
    (the pins are raw `indexOf` scans): `setTimeout`, `orderedDays`,
    `isNarrow` (`test/classes.test.js:563-564`), `dayStart`, `prevDay`
    (`:624-626`; `test/teacher-daygroups.test.js:141-142`), `s-class`,
    `isUnion`, `c-all`, `weekCount`, `span class="n"`, `<th>Day`,
    `nextSessionIdx(` in `js/classes.js` (it stays legal in
    `js/teachers.js`, where it is pinned as *required*).
31. No targeted DOM patcher for the day-group/time lists, and no second
    source of truth for marks/dim/order: the emission is the only producer;
    `applyCursor` remains the only always-on targeted updater and must keep
    being called on **every** tick, gate or no gate (direction 3).
32. Refresh paths must never run selection-only side effects: no
    `layout.classList.remove('is-list')`, no `syncClear()`, no
    `renderSuggest([])`, no `renderGhost()`, no time-page auto-scroll, no
    `show()` re-invocation — and the selection paths keep all of them.
    Unconditional writes every 30 s (scroll reset, pane flip) are exactly
    what this issue is not allowed to introduce.
33. The tick never changes the user's selection or filter: no auto-jump from
    `tick` (teachers), no `search.value` writes, no suggest/ghost renders;
    class-result and teacher-result *membership* never depends on the clock
    (only order does, and only for the empty teachers query).

**Risks / constraints**

1. **Pinned structural arithmetic (classes).** The new renderWeek head and
   gate sit inside the slice scanned by
   `'renderWeek emits day groups, then the WHOLE WEEK label, then the week grid'`
   (`test/classes.test.js:865-911`): the emission-order markers must stay in
   order (the gate wraps `detail.innerHTML = h;` — keep that literal inside
   the slice after the weekwrap marker), `count(slice, 'week.sessions.forEach')`
   must stay **2** (the head/gate add no walks), `var byDay = {};` /
   `var dayOrder = [];` / `dayOrder.forEach` stay exactly-once in the whole
   file, and the grid tail (`weekwrap marker → detail.innerHTML = h;`) must
   still contain `store.days.forEach` twice and `startFromToday` zero times
   (`:896-903`) — the gate lines live inside that tail, so they must not
   mention `store.days`/`startFromToday`.
2. **The list-block harness must not see the head.** `classesListBlock()`
   (`test/classes.test.js:537-543`) slices `var liveDays = {};` →
   `'<div class="weekwrap"'`; the clock/ownership statements are mandated
   *before* `var cursor = …` (hence before `var liveDays`) precisely so the
   block and its clock-literal pins (`:578-580`) stay byte-identical, and
   `runClassesList` (`:686-698`) keeps injecting `now`.
3. **Teacher slice hygiene.** The harness executes everything between
   `function breakdownHTML(t)` and `function markActive(name)`
   (`test/teacher-daygroups.test.js:45-50`): `tick`/`buildAvail`/`listKeyOf`
  /`listKeyOf`/declarations must stay outside that span (criterion 9), or the
   executed slice would grow free variables the sandbox does not provide.
   Inside `showTeacher`, `now2` and its `var now2 = new Date();` are
   load-bearing for the pin at `:148` and the FakeDate mechanism (`:68-72`) —
   do not parameterize or rename it.
4. **vm read-before-write.** New harnesses run emission functions whose
   declarations live in the page closure, not in the slice: seed `now`,
   `currentWeek`, `lastWeekHTML`, `cursorTimer` (classes), `lastDetailH` /
   `currentTeacher` (teachers refresh) as sandbox properties, or the first
   gated refresh throws `ReferenceError`. The sloppy-mode fallback write
   only works *after* a selection has written once — seeding is the robust
   route; keep every new declaration uninitialized in the page sources
   (criteria 1/9/15) so the `= null;` count pins (criteria 22.1, 23.6) count
   exactly the clear sites.
5. **Resurrection is the failure mode of a missed clear.** If any of the
   four classes sites (`:375-379, :479, :505, :517`) or three teachers sites
   (`:407, :423, :436`) forgets its `= null`, a later boundary tick will
   write a cleared/nomatch view back over the user's empty state — the exact
   bug class this issue fixes, reintroduced through the fix. The count pins
   exist for this.
6. **Scroll and pane state are the gate's job, not a luxury.** `#layout > #detail`
   computes to a vertical scroll container (`styles.css:199` + the comment at
   `:517-522`), `#teacherList` scrolls (`:160-161`), `#slotList` scrolls
   (`:452-453`). Any "simplification" that removes the output gate and writes
   every 30 s resets the reader's position and flips narrow `is-list` under a
   typing user. Criterion 32 makes that a no-go.
7. **Cursor continuity.** `cursor.frac` changes every tick but never changes
   the emitted string; if `applyCursor(cursor)` were moved inside the gate,
   the red line would freeze between slot boundaries — a regression against
   today's behavior and against `applyCursor`'s idempotence contract
   (`js/classes.js:322-324` comment; guarded by the behavioral assertion in
   test 22.3).
8. **Live anchor re-grade is intended** (direction 4) — reviewers and the
   Implementer must not "stabilise" day-group order between boundaries; the
   reorder happens only inside a state-change commit, atomically with the
   marks, and is pinned by tests 22.5 and 23.9. The browser-evidence rows
   "Thu 09:00 — anchor still mercredi, dim exactly inverted" and the
   Sat→lundi wrap are the scenarios these tests encode.
9. **Two clocks per teachers tick are sanctioned** (direction 1): the tick's
   `now` (avail/list) and `showTeacher`'s `now2` (detail) are both taken at
   the entry of the same tick, microseconds apart; both are fresher than any
   alternative that touches the pinned literals. Do not "fix" this by
   threading a clock parameter — it breaks risk 3.
10. **Key-gate equivalence assumptions to preserve:** teachers availability
    reorders but never adds/removes list members
    (`js/match.js:270-281` — `avRank` only in the empty-query sort), so the
    list key can only change through ordering; the time page's `listKey`
    components must keep covering every rebuilt DOM difference (today label,
    `dim`, NOW, NEXT, Sunday note, Day-over) — if a future edit adds a
    time-derived row to the time list, it must fold into `listKey` or the
    gate will strand it (add a comment there, as mandated, saying so).
11. **Cadence and lifecycle regressions to guard:** the interval literal is
    `30000`, pinned as `'setInterval(tick, 30000)'` in all three structural
    tests; the classes interval must keep its selection lifecycle (started by
    every `renderWeek` tail, stopped by the four clear sites) — a leaked
    interval after the filter is cleared would spin forever on
    `currentWeek == null` no-ops (harmless but unclean), a *missing* restart
    would silently kill liveness after the first no-match.
12. **Pin inventory that must stay byte-identical** (each is an existing
    passing test): `test/classes.test.js:563-564` (`orderedDays`/`isNarrow`
    absence), `:578-580` (clock literals, `nextSessionIdx` absence),
    `:589-600` (click/keep-filter slices), `:618-631` (dim-on-section),
    `:865-911` (structural — see risk 1), the batteries `:813-855`; and in
    `test/teacher-daygroups.test.js`: `:121-151` (emission structure incl.
    the `now2` pin at `:148`), `:172-260` (invariant battery), `:423-443`
    (menu/blur pins, `setTimeout` absence, the global
    `search.addEventListener('click'` count of 2), `:475-482` (commit wiring
    pins — the `currentTeacher = null;` additions must not disturb those
    literal lines).
13. **Verification honesty:** no browser is available in this environment —
    `node --test` (119) + `curl` 200s + the DOM-stub behavioral harnesses
    are the whole evidence; the fix entry must say "visually unverified" and
    record that the dev server was stopped by PID.
14. **Sibling isolation:** zero diff to `js/model.js` (#052/#053) and
    `js/match.js` (#055) is not just hygiene here — it is what keeps the
    parallel merges region-disjoint; the only shared files touched are the
    two test files, append-region-only (criterion 27).

### Maintainer re-evaluation (2026-10-19)

Round 2 — the user issued a binding directive that supersedes the *mechanism*
ruled above while keeping its goal. Directive, verbatim:

> just have one clock and have interested parts of the code subscribe to it.
> no need for complex state management, rather contain and reduce the surface
> area of changing state. only update what needs to be updated, not by
> diffing, rather by having the relevant part of the code re-render when it
> the clock hits.

**Verdict / what changes** — the directive is accepted in full. The Round 1
gates (`lastWeekHTML`/`lastDetailH` emitted-string diffs, the teachers
`listKeyOf` key, the time page's `listKey()`) and the state they needed are
**out**. The fix becomes: one small `clock` per page file (a subscriber list,
one 30 s interval started on the first subscribe, one `visibilitychange`
catch-up inside the clock — no start/stop API, no unsubscribe); each page
subscribes exactly one function at init; on every hit the subscribed region
re-renders wholesale and the write is unconditional. The only per-call
distinction that remains is the tick payload: subscribers receive the clock's
fresh `Date`; a selection entry reads its own fresh one; the one falsy-check
that survives (`tickNow`) fences only the explicit *selection side effects*
(is-list removal, `syncClear`, suggest/ghost dismissal, the boot auto-scroll)
— never the write itself. I re-executed the baseline in this worktree:
`node --test` → **103 tests, 103 pass, 0 fail**; and I ran the browser
containment check that Round 1's gates were built on (evidence in direction
6): the gates were solving a problem the DOM does not have. All line numbers
cited below were re-verified against this tree; I did not modify any code.

**Supersession map over Round 1's verdict + 33 criteria:**

*Survives* (re-adopted, possibly relocated): matrix out of scope (verdict,
criteria 20/21); fresh clock per render pass (direction 1) — reshaped to
"payload on tick, fresh read on selection"; anchor re-grades live (direction
4, unchanged); the per-surface recompute inventory (direction 5); the 30 s
`setInterval` cadence, the `setTimeout` ban and the single
`visibilitychange` catch-up (direction 2) — relocated inside the clock;
emission byte-stability and the marker inventory (criteria 29/30, risk 12);
clear-site ownership nulling with the resurrection rationale (criteria 5/12,
risk 5 — same counts: 4 classes, 3 teachers); the tick never selects and
never writes filter/suggest/ghost (criterion 33); diff hygiene, curl
verification and the "visually unverified" honesty rule (criteria 25-27,
risks 13); append-only test discipline.

*Replaced*: the string-gate commits (criterion 3) → unconditional commit on
every pass; the `refresh`-param semantics (criteria 2/11/17) → the `tickNow`
payload param, side-effects-only; the per-page ticker cluster
`startCursor`/`stopCursor`/`cursorTimer` and the renderWeek-tail
`startCursor()` (criterion 1) → the clock module + one
`clock.subscribe(onTick)` per page; the teachers key-gated list rebuild
(criteria 8-10) → unconditional rebuild (the `buildAvail` extraction
survives); the sanctioned two-`Date` teachers tick (risk 9) → exactly one
`Date` per tick, threaded as the payload; the old test plan (criteria 22-24)
→ the plan below; the old total (criterion 25: 119) → **117**.

*Dropped entirely*: `lastWeekHTML`, `lastDetailH`, `listKeyOf`, `lastListKey`,
the time `listKey()` function, the "emitted string is the signature"
rationale (direction 3), the gate-specific risks 6/7/10/11 as written, the
`startTick`/`stopTick` attach/detach lifecycle, and the vm-seeding of
emitted-string vars (risk 4, reduced to seeding the ownership vars).

**Architectural direction**

1. *Clock shape* (byte-identical in the three page files; placement in
   direction 2):
   ```js
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
   ```
   No `unsubscribe`, no start/stop: there is nothing to detach — see the
   lifecycle ruling (direction 5). The interval fires only after the first
   subscribe, so the matrix page (loads `js/app.js`, subscribes nothing) runs
   no timer and no listener at all: the out-of-scope ruling now holds
   behaviorally, not just by diff.
2. *Placement: duplicated in each page file's shared head* — the block above
   goes immediately after each file's `NEXT_ARROW` declaration. The three
   page files are self-contained **by design** ("the shared head … is
   duplicated from js/app.js by design, not imported — zero coupling, no
   load-order constraints", `js/classes.js:1-6`, `js/teachers.js:1-6`,
   `js/app.js:1-7`); a fourth component of that head belongs in the same
   place, and a test pins the three copies byte-identical so drift is a test
   failure. *Rejected*: (a) a new `js/clock.js` + script tags — it adds the
   load-order coupling the architecture refuses and puts this issue in **all
   four HTML files**, breaking the 049/050 zero-HTML-diff hygiene and
   rubbing against #055, which is editing all four heads for favicon lines;
   (c) `model.js`/`data.js` — a mutable timer singleton contradicts the model
   layer's contract ("Pure data in, plain values out… unit-testable in
   node", `js/model.js:1-6`; its time helpers are all injectable-clock pure
   functions) and model.js is the most merge-contended file (#052/#053 own
   it). Merge coordination: this issue touches **no HTML file at all** —
   there is no insertion point to coordinate with #055's favicons.
3. *Subscriber table* — one subscriber per page, subscribed once at init:
   | page | file | subscriber | region re-rendered on every hit |
   |---|---|---|---|
   | classes | `js/classes.js` | `if (currentWeek) renderWeek(currentWeek, t);` | the whole `#detail` week view: day-group NOW/NEXT/`dim`/anchor + grid + cursor, then `applyCursor` |
   | teachers | `js/teachers.js` | `now = t; buildAvail(); renderList(match.searchSections(index, search.value, avail).sections); if (currentTeacher) showTeacher(currentTeacher, t);` | the `#teacherList` ordering (always shown) and the open `#detail` detail, when one is open |
   | time | `js/app.js` | reassign `now/todayName/isSunday/nextSlot` from `t`, then `renderSlotList();` | the whole `#slotList`: buckets, `(today)`, NOW/NEXT, `dim`, Sunday note, Day-over |
   | matrix | `js/app.js` | none — `initTimetablePage` and `boot` stay byte-identical |
   Nothing else subscribes; nothing else may.
4. *Clock freshness: the tick `Date` IS the render clock.* Subscribers
   receive the clock's `Date` as `t` and hand it to their render entry:
   `renderWeek(week, tickNow)` and `showTeacher(name, tickNow)` begin with
   `now = tickNow || new Date();` / `var now2 = tickNow || new Date();`; the
   time page reassigns its closure vars from `t`. A selection (no `tickNow`)
   therefore always grades against a fresh read, a tick always against the
   clock's, and each pass holds exactly one `Date` — Round 1's "two clocks
   per teachers tick are sanctioned" (risk 9) is retired. The pinned literals
   `model.isCurrentSession(s.day, s.time, now)` (classes list block,
   `test/classes.test.js:578`) and `(…, now2)` (showTeacher,
   `test/teacher-daygroups.test.js:148`) read these variables unchanged.
5. *Lifecycle: one mechanism — subscribe once, guard on ownership.* Each
   page's single subscription is registered at the end of its init function.
   The only per-page state deciding what a tick re-renders is the ownership
   var — `currentWeek` (classes), `currentTeacher` (teachers), `activeSlot`
   (time) — set when a view is rendered/selected and nulled at every write
   that takes the region away. Classes: showClass no-match, onInput empty,
   commit empty, commit no-match → **exactly 4** `currentWeek = null;`.
   Teachers: onInput empty, commit empty, commit no-match → **exactly 3**
   `currentTeacher = null;`. Time: no clear path exists; `activeSlot` is set
   by `show()` only. *Nothing selected*: classes — the tick is a no-op (the
   empty/kaomoji state stays); teachers — only the list re-renders; time —
   the slot list is the page and always re-renders, while the detail pane is
   slot-derived and never touched by the clock. *Rejected*: attach-on-render /
   detach-on-clear (Round 1's start/stop lifecycle) — subscription presence
   and ownership would be two representations of the same fact, which is
   exactly the surface the directive asks to cut; resurrection is guarded by
   the null + the guard line, pinned structurally (counts) and behaviorally
   (a tick after `currentWeek = null` writes nothing).
6. *Empirical containment ruling* (executed for this entry: real Chromium
   against this worktree served by `python3 -m http.server 8791`, killed by
   PID afterwards): GLSI3D1 selected on classes.html, result count ≠ 1 with
   the search box focused (`#layout.is-list` set), scrolled mid-page, then a
   wholesale `#detail.innerHTML` replacement — first the identical string,
   then a mark-changed variant. **Window scrollY survives (150→150),
   `document.activeElement` survives (`#search`), `is-list` survives.**
   `#detail` is not an inner scroll container at any width: its base
   `overflow-x: auto` (`styles.css:199`) is overridden to `visible` in both
   media queries (`:433` ≥701px, `:522` ≤700px; measured — `scrollTop`
   assignment is a no-op and the document scrolls). The surfaces a tick
   really rewrites, `#teacherList` (`styles.css:160-161`) and `#slotList`
   (`:452-453`), are real internal scrollers, and their `scrollTop` survives
   both an identical-string `innerHTML` replacement (200→200) and a
   clear-then-re-append rebuild (300→300): no layout runs mid-rebuild, so
   the browser never clamps. Ruling: an ungated write is safe **provided
   the render code itself stops issuing the explicit selection side
   effects** — those move behind the `!tickNow` fence (and on the time page
   the boot auto-scroll stays in `initTimePage`, out of the render
   altogether). Round 1's gate (direction 3) is dropped as unnecessary
   state. Accepted boundary: a rebuild that makes a list *shorter* clamps —
   here only the ±1 Day-over row at midnight, one row, once a day, at the
   bottom of the list.
7. *Cursor*: `applyCursor` keeps its exact body and is called on every
   `renderWeek` pass — selection or tick — unconditionally after the write,
   so the red line still advances every 30 s and `cursor.frac` never enters
   the emitted string. Grep-verified: after this change its only caller is
   `renderWeek`'s tail (the old ticker call dies with `startCursor`), and
   nothing else in the site calls it.
8. *Cadence*: 30 s, unchanged — argued once more because the directive says
   "when the clock hits": slots are ≥65 minutes, 30 s is the cadence the
   grid already ships, `setTimeout` is test-forbidden as a raw substring in
   both page files, and the clock's `visibilitychange` catch-up covers
   exactly the staleness window a background tab creates. A finer or
   minute-aligned cadence buys nothing visible at slot granularity.
9. *Further simplification shed vs Round 1*: no emitted-string storage, no
   key functions, no gate branches, no `startTick`/`stopTick` restart
   discipline, no tick handle at all, no vm-seeding of string vars — and the
   teachers tick does **not** call `syncList` or `markActive` itself:
   availability reorders but never adds/removes list members
   (`js/match.js:262-281`, `avRank` in the empty-query sort only), so
   `lastResultCount` cannot change on a tick, and the highlight is repaired
   by `showTeacher`'s own unconditional `markActive` when a detail is open.

**Acceptance criteria**

Classes page (`js/classes.js`):

1. Insert the byte-identical clock block of direction 1 into the shared head
   immediately after the `NEXT_ARROW` declaration, before the
   `// ---- classes page ----` marker. The same block, in the same position
   (before `// ---- teachers page ----`, resp. `// ---- time page ----`), goes
   into `js/teachers.js` and `js/app.js`. A test pins the three copies
   strictly equal (criterion 22.2).
2. `var cursorTimer = null;` (`:72`) → `var currentWeek;` (uninitialized,
   one-line comment).
3. `function renderWeek(week)` (`:217`) → `function renderWeek(week,
   tickNow)`. Its first statements, inserted **before** `var cursor =
   model.dayCursor(now, store.slots);` (`:218`):
   ```js
   now = tickNow || new Date();   // one fresh clock per render pass (issue 051)
   currentWeek = week;            // the view the clock refreshes until cleared
   ```
   The page-load capture `var now = new Date();` (`:56`) stays byte-identical;
   the whole emission (`:219-314`) stays byte-identical.
4. The tail (`:315-319`) becomes:
   ```js
   detail.innerHTML = h;          // unconditional: no gating (issue 051)
   if (!tickNow) {
     if (layout) layout.classList.remove('is-list');
     syncClear();
   }
   applyCursor(cursor);
   ```
   The `startCursor();` line is gone; `applyCursor(cursor);` stays
   unconditional and last.
5. Replace `startCursor`/`stopCursor` (`:362-370`) with:
   ```js
   // The page's subscriber to the one clock (issue 051): the whole week
   // view re-renders from the clock's Date on every hit; with no owned week
   // the tick is a no-op, so a cleared view can never be resurrected.
   function onTick(t) {
     if (currentWeek) renderWeek(currentWeek, t);
   }
   ```
6. `showClass`'s no-match branch: `stopCursor();` (`:379`) →
   `currentWeek = null;`. Add `currentWeek = null;` to onInput's empty branch
   (`:479`), commit's empty branch (`:505` region) and commit's no-match
   branch (`:517` region). **Exactly 4** `currentWeek = null;` occurrences;
   no `startCursor`/`stopCursor`/`cursorTimer` identifier may remain.
7. At the end of `initClassesPage`, after the initial-paint `syncClear();`
   (`:604`): `clock.subscribe(onTick);` (one-line comment). Everything else —
   search/suggest/ghost/handlers (`:388-598`) — byte-identical; no new
   `search.addEventListener` (a global count is pinned,
   `test/teacher-daygroups.test.js:440-442`).

Teachers page (`js/teachers.js`):

8. Replace the one-shot availability block (`:130-135`) with:
   ```js
   // availability is time-dependent: rebuilt on every clock tick (issue 051),
   // for list ordering only (never a committed-query key, no visual encoding).
   var avail;
   function buildAvail() {
     avail = {};
     store.teachers.forEach(function (n) {
       avail[n] = model.availability(store.sessionsOf(n), now);
     });
   }
   buildAvail();
   ```
   Declare `var currentTeacher;` (uninitialized, one-line comment) beside it.
   The old "compute once per page load" comment must be gone (pinned).
9. Before `function breakdownHTML` (`:231` — **outside** the harness span
   `breakdownHTML`→`markActive`, `test/teacher-daygroups.test.js:45-50`):
   ```js
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
   ```
   List before detail, so `showTeacher`'s unconditional `markActive(name)`
   repairs the highlight after the rebuild.
10. `showTeacher(name)` (`:254`) → `function showTeacher(name, tickNow)` (the
    literal prefix `function showTeacher(name)` must survive — the harness
    finds it by `indexOf`, `test/teacher-daygroups.test.js:54`). Changes, and
    only:
    - `var now2 = new Date();` (`:264`) → `var now2 = tickNow || new Date();`;
    - the pair `renderSuggest([]); renderGhost();` (`:261-262`) wrapped:
      `if (!tickNow) { renderSuggest([]); renderGhost(); }` — a tick must not
      dismiss an open autocomplete menu;
    - the emission (`:265-310`, including `upcoming`/`liveDays`/`dayOrder`/
      `startFromToday`/rows/breakdown) stays **byte-identical**;
    - the commit (`:311-316`) becomes:
      ```js
      detail.innerHTML = h;      // unconditional: no gating (issue 051)
      markActive(name);
      if (!tickNow) {
        if (layout) layout.classList.remove('is-list');
        syncClear();
      }
      ```
      (`markActive` stays unconditional — idempotent, and it repairs the
      list highlight after a tick-driven rebuild.)
11. Add `currentTeacher = null;` to onInput's empty branch (`:407` region),
    commit's empty branch (`:423` region) and commit's no-match branch
    (`:436` region). **Exactly three** occurrences.
12. At the end of `initTeachersPage`, after the initial paint (`:530-533`):
    `clock.subscribe(onTick);`. Nothing else changes; the `avail` argument
    keeps flowing to all four `match.searchSections(index, q, avail)` call
    sites (`:402, :422, :428, :530` region) and `js/match.js` keeps zero
    diff.

Time page (`js/app.js`, `initTimePage`):

13. Beside `var nextSlot = todayNextSlot();` (`:56` region): add
    `var activeSlot;` (uninitialized, one-line comment). `todayNextSlot`,
    `marksFor`, `bucket` bodies byte-identical.
14. `show(day, slot)` (`:110`): first statement
    `activeSlot = day + '|' + slot;` — rest byte-identical.
15. `entry(day, slot)` (`:71` region): after the `color.slotEntry(...)`
    class loop, add
    `if (activeSlot === day + '|' + slot) li.classList.add(C.active);` — the
    rebuild re-applies the selection's mark from state, not from the DOM it
    just destroyed.
16. Wrap the straight-line list build (`:87-108`) into:
    ```js
    // The slot list's only producer (issue 051): rebuilt wholesale from the
    // current clock state; the boot auto-scroll lives in the init, not here.
    function renderSlotList() {
      var todayBucket = null;
      ul.innerHTML = '';
      ...  // the existing build code verbatim; `todayBucket` now local
      return todayBucket;
    }
    ```
17. Beside it:
    ```js
    // The page's subscriber to the one clock (issue 051): the whole slot
    // list re-renders from the clock's Date on every hit; the detail pane
    // is slot-derived and never touched.
    function onTick(t) {
      now = t;
      todayName = model.JS_DAY[now.getDay()];
      isSunday = model.DAY_IDX[todayName] === undefined;
      nextSlot = todayNextSlot();
      renderSlotList();
    }
    ```
    (`isSunday` mirrors the init expression `:40` byte-for-byte.)
18. `initTimePage` tail: replace the straight-line build + auto-scroll
    (`:87-108` + `:132`) with `var todayBucket = renderSlotList();` followed
    by the existing auto-scroll line byte-identical (`if (todayBucket)
    ul.scrollTop = todayBucket.offsetTop - ul.offsetTop;`); keep
    `status.textContent` (`:133`); add `clock.subscribe(onTick);`. The file's
    only `scrollTop` write must remain that one boot line.
19. `initTimetablePage` (`:138-170`) and `boot` (`:176-182`): byte-identical.
    Zero diff to timetable.html.

Tests:

20. `test/classes.test.js` — append a harness and **4** tests at file end; no
    existing line changes.
    - Harness `runClassesWeek()`: slice `js/classes.js` from
      `function renderWeek` to `function showClass` (covers `renderWeek`,
      `applyCursor`, `onTick`), prefixed by the existing arrow statement
      (mirror `runClassesList`, `:686-698`). Sandbox: `model`, `color`,
      `C: color.CLASSES`, `esc: data.esc`, `store`, `week` (the real
      `model.classWeek(groups, 'GLSI3D1')`), `console`; a `detail` stub whose
      `innerHTML` setter increments a `writes` counter and whose getter
      returns the last string, `querySelectorAll()` → `[]` while counting
      invocations, `querySelector(sel)` → `{ style: { display: 'none' } }`
      for `'.cursor'`, else `null`; a `layout` stub with a counting
      `classList.remove`; a counting `syncClear`; swappable FakeDate (the
      `at(monthDay, hh, mm)` helper, `:183`); **seed `now: undefined` and
      `currentWeek: undefined`** (vm read-before-write). Plus a small
      `headingsOf(h)` helper splitting on `'<h3 class="day-head">'`.
    - **1. `'classes.js drives the week view from one clock and drops the gated ticker (issue 051)'`**
      (structural, over the full file): `count(src, 'new Date()') === 3`
      (page capture `:56`, renderWeek head, the clock's tick — nothing else
      reads the wall clock); `src.indexOf('setInterval(tick, 30000)') !== -1`;
      `startCursor`, `stopCursor`, `cursorTimer` all absent;
      `count(src, 'clock.subscribe(onTick);') === 1`;
      `src.indexOf('visibilitychange') !== -1 && src.indexOf('document.hidden') !== -1`;
      `count(src, 'currentWeek = null;') === 4`;
      `src.indexOf('lastWeekHTML') === -1 && src.indexOf('h !== ') === -1`;
      over the renderWeek slice: contains `now = tickNow || new Date();`,
      `currentWeek = week;`, `if (!tickNow) {`,
      `renderWeek(currentWeek, t)`.
    - **2. `'selecting a class renders the week once from a fresh clock (issue 051)'`** —
      `renderWeek(week)` at `at(14, 10, 30)`: `writes === 1`; NOW tag on
      `10h00-11h30`, NEXT on `11h40-13h10`; `headingsOf(...)[0] === 'mercredi'`;
      `currentWeek === week`; layout-`remove` and `syncClear` counters
      `=== 1` (selection side effects ran).
    - **3. `'a clock tick re-renders the week view from the fresh Date (issue 051)'`** —
      same context; `onTick(new Date())` at `at(14, 12, 0)`: `writes === 2`
      (**unconditional — the anti-gate**); the new string has NOW on
      `11h40-13h10` and lacks NOW on `10h00-11h30`; heading still
      `'mercredi'`; layout/syncClear counters unchanged; then a second
      `onTick` at `at(14, 12, 20)` (same time state) → `writes === 3`
      (re-render on the hit, not on a diff).
    - **4. `'a tick past day end re-grades the anchor; a cleared view stays cleared (issue 051)'`** —
      `onTick` at `at(14, 18, 30)`: `writes === 4`;
      `headingsOf(...)[0] === 'jeudi'` (verified against the real model for
      this entry: Wed 18:30 → JEUDI first) and no `nowtag` anywhere; then
      `sandbox.currentWeek = null;` and `onTick` at `at(15, 9, 0)` → `writes`
      unchanged (no resurrection).
21. `test/teacher-daygroups.test.js` — append `function wed(hh, mm)` beside
    `fri`/`sat`/`sun` (`:93-95`), one harness, and **4** tests at file end; no
    existing line changes.
    - Harness `runShowTeacherLive(name, clockA, clockB)`: one context seeded
      exactly like `runShowTeacher` (`:70-91`) but with a counting `detail`
      (`writes`) and counting stubs for `renderSuggest`, `renderGhost`,
      `layout.classList.remove` (via a `layout` stub) and `syncClear`; step 1
      runs `arrowStmt() + teacherSlice() + showTeacher(<name>)` with
      `Date = FakeDate(clockA)`; step 2 swaps the context's `Date` and runs
      `showTeacher(<name>, new Date())` in the **same** context.
    - **5. `'teachers.js drives availability and the open detail from one clock (issue 051)'`**
      (structural, over APP_SRC): `count(APP_SRC, 'new Date()') === 3` (page
      capture `:46`, the showTeacher fallback, the clock's tick);
      `count(APP_SRC, 'clock.subscribe(onTick);') === 1`;
      `APP_SRC.indexOf('setInterval(tick, 30000)') !== -1`;
      `APP_SRC.indexOf('compute once per page load') === -1`;
      `listKeyOf`/`lastListKey`/`lastDetailH`/`h !== ` absent;
      `count(APP_SRC, 'currentTeacher = null;') === 3`;
      `APP_SRC.indexOf('function buildAvail()') !== -1` and
      `count(APP_SRC, 'model.availability(store.sessionsOf(n), now)') === 1`;
      over the onTick slice (`function onTick` → `function breakdownHTML`):
      contains `now = t;`, `buildAvail();`,
      `renderList(match.searchSections(index, search.value, avail).sections);`,
      `showTeacher(currentTeacher, t)`; over `showTeacherFn()`:
      `function showTeacher(name, tickNow)`, `var now2 = tickNow || new Date();`,
      `if (!tickNow)` present, and `lastDetailH` absent; `teacherSlice()`
      still spans `breakdownHTML`→`markActive` unchanged.
    - **6. `'selecting a teacher renders once; a live re-render moves the marks (issue 051)'`** —
      Bannour at `wed(10, 30)`: `writes === 1`, NEXT on
      `mercredi 11h40-13h10`, no NOW, each selection-side-effect counter
      `=== 1`; live re-render at `wed(12, 0)`: `writes === 2`
      (unconditional), NOW on `11h40-13h10`, side-effect counters unchanged.
    - **7. `'a live teacher re-render with unchanged time state rewrites anyway and keeps the anchor (issue 051)'`** —
      Barboura at `fri(12, 0)`: `headingsOf(html)[0] === 'vendredi'`; live
      re-render at the same clock → `writes` +1, heading still
      `'vendredi'` (no gate; the anchor is stable within a day).
    - **8. `'a teachers tick with no selection re-renders only the list, from the fresh clock (issue 051)'`** —
      harness: context seeded with the real `store`/`model`/`match`/`index`
      (the file already builds them), slice `function buildAvail` →
      `function breakdownHTML` (covers `buildAvail` and `onTick`), stubs:
      `search: { value: '' }`, `status: { textContent: '' }`, a counting
      `renderList` capturing its `sections` argument, a counting `showTeacher`
      stub; seed `avail`, `now`, `currentTeacher: undefined`. Drive:
      `buildAvail()` + `onTick(new Date())` at `wed(10, 30)`, capturing the
      order; then `onTick(new Date())` at `sun(10, 0)`: the captured order
      differs from the Wednesday one from position 2 (the Reporter's
      Sunday-collapse evidence; the fresh Sunday order is the real
      alphabetical collapse), `sandbox.avail` matches a directly computed
      `model.availability(store.sessionsOf(<name>), new Date(sun))`, and the
      `showTeacher` stub count `=== 0`.
22. **New file `test/time-live.test.js`** (named to stay clear of #054's
    future `app.test.js`) — **6** tests. Harness: load the stack like
    `teacher-daygroups.loadStack` (`test/teacher-daygroups.test.js:25-37`:
    data, libgroups, model, match, color) plus the real CSV store and
    `model.buildAll(store)`; slice `js/app.js` from `function initTimePage`
    to `function initTimetablePage`; sandbox: `model`, `color`,
    `C: color.CLASSES`, `esc: data.esc`, `console`, swappable FakeDate (an
    `at(...)` copy of the classes helper), a `document` stub whose
    `getElementById` returns element stubs — `slotList` counting
    `appendChild` writes, an `innerHTML` setter that clears `children` when
    set to `''` and otherwise stores the string, `classList`
    `add`/`toggle`/`remove` over a `className` string, `dataset`,
    `scrollTop`/`offsetTop`, `querySelectorAll`/`querySelector` resolving
    `'li[data-day]'` to children with a `data-day` and `'li.active'` to
    children whose `className` contains `active`, else `null`; plain `detail`
    and `status` stubs — and `clock: { subscribe: function (fn) { subscribed = fn; } }`
    capturing the subscriber. Drive: one init per test at clock A, swap
    `Date`, call the captured subscriber with `new Date()` at clock B,
    resetting the write counter before each step.
    - **1. `'js/app.js drives the time page from one clock and leaves the matrix time-blind (issue 051)'`**
      (structural): head slice (file start → `function initTimePage`):
      contains the clock markers `// ---- clock (issue 051)`,
      `subscribe: function (fn)`, `subs.indexOf(fn) === -1`,
      `setInterval(tick, 30000)`, `visibilitychange`, `document.hidden`;
      whole file: `count(appSrc, 'new Date()') === 2` (init capture + the
      clock's tick) and
      `count(appSrc, "addEventListener('visibilitychange'") === 1`; the
      initTimePage slice: `function renderSlotList()`, `function onTick(`,
      `clock.subscribe(onTick);`, `count(slice, 'scrollTop') === 1` (the boot
      auto-scroll only), `listKey`/`lastListKey` absent; the matrix slice
      (`function initTimetablePage` → `function boot(store)`): `setInterval`
      and `new Date` both absent.
    - **2. `'the clock module is byte-identical in all three page files (issue 051)'`** —
      in each of `js/classes.js`, `js/teachers.js`, `js/app.js`, extract from
      `// ---- clock (issue 051)` to the next line starting `// ---- ` after
      it; assert the three extracted strings are strictly equal.
    - **3. `'the time page opens from the page clock and re-renders on every tick (issue 051)'`** —
      init at `at(14, 10, 30)`: 42 children (6 days × (1 bucket + 6
      entries)); the `MERCREDI 10h00-11h30` entry is `now` with a `nowtag`;
      `MERCREDI 11h40-13h10` is `next`; bucket text `'MERCREDI (today) (216)'`
      with `today` in its class; the boot auto-scroll ran (stub `scrollTop`
      set from the bucket). Tick at `at(14, 12, 0)`: rebuild (writes
      advanced); `11h40-13h10` is `now`, `13h20-14h50` is `next`, `(today)`
      still MERCREDI. Tick at `at(14, 12, 20)` (same state): rebuild
      **again** (writes advanced — re-render on the hit, not on a diff).
    - **4. `'the day-over line appears on the evening tick (issue 051)'`** —
      tick at `at(14, 18, 30)`: 43 children; exactly one `info` row with
      text `'Day over — no more sessions today.'`; no entry is `now`; bucket
      still `MERCREDI (today) …`.
    - **5. `'midnight moves the today bucket and keeps the selected slot (issue 051)'`** —
      before ticking, invoke the `VENDREDI`/`10h00-11h30` entry's `onclick`
      (real `show()`: detail table written, `active` set); tick at
      `at(15, 9, 0)`: bucket `'JEUDI (today)'` with `today`, the MERCREDI
      bucket `dim`; `JEUDI 08h15-09h45` is `now`; the **recreated**
      `VENDREDI 10h00-11h30` entry carries `active` (restored from
      `activeSlot` state); `detail.innerHTML` still holds the slot table.
    - **6. `'Sunday shows the no-sessions note with no today bucket (issue 051)'`** —
      tick at `at(18, 10, 0)` (Sun 2026-10-18): the first child is the
      `info` row `'No sessions on Sunday — showing the full week.'`; 43
      children; no `(today)` bucket; no `now`/`next`/`dim` classes anywhere.
23. `node --test` → **117 tests, 117 pass, 0 fail**. Justification: baseline
    103 (re-executed in this worktree today), +4 (`test/classes.test.js`,
    criterion 20), +4 (`test/teacher-daygroups.test.js`, criterion 21), +6
    (new `test/time-live.test.js`, criterion 22); no existing `test()` call
    or harness line is modified — every existing test passing untouched is
    itself part of the proof that the emissions, harness slices and pins are
    byte-stable (`runShowTeacher`'s one-arg call, `showTeacherFn`'s
    `indexOf('function showTeacher(name)')` prefix match, `teacherSlice`'s
    span, the classes list-block slice, the `:865-911` structural
    arithmetic, the `layout.classList.remove('is-list')` presence pin at
    `test/teacher-daygroups.test.js:443-445`).
24. `python3 -m http.server 8000` from the worktree root; `curl -s -o /dev/null -w '%{http_code}'`
    → `200` for `/classes.html`, `/index.html`, `/time.html`,
    `/timetable.html`, `/js/classes.js`, `/js/teachers.js`, `/js/app.js`,
    `/styles.css`, `/emplois.csv`. Kill the server **by PID** afterwards. No
    browser is available to the Implementer: append "visually unverified" in
    the fix entry (the scroll/focus evidence of direction 6 was executed by
    the Maintainer as decision evidence and is recorded in this issue).
25. Diff hygiene: exactly these files change — `js/classes.js`,
    `js/teachers.js`, `js/app.js`, `test/classes.test.js`,
    `test/teacher-daygroups.test.js`, `test/time-live.test.js` (new), plus
    this issue file (the `Fix implemented` entry only). **Zero diff** to:
    `js/model.js` (#052/#053), `js/match.js` (#055), `js/color.js`,
    `js/data.js`, `js/libgroups.js`, `js/theme.js`, `styles.css`, **all four
    HTML files** (no clock script tag — direction 2; #055's favicon edits
    land in clean files), `Design.md`, `emplois.csv`, `vendor/`,
    `test/fusion.test.js`, `test/libgroups.test.js`, and every other
    `issues/` file. The `js/app.js` diff is confined to the IIFE head (the
    clock) and `initTimePage` — `initTimetablePage` and `boot` byte-identical,
    keeping the file merge-disjoint from #055's boot edit. The two shared
    test files are append-region-only plus the single `wed` helper insert
    beside the existing date helpers. `Status:` stays `Open` until merge; no
    git operations by the Implementer.

Explicit no-go items:

26. No gating state anywhere: the substrings `lastWeekHTML`, `lastDetailH`,
    `listKey`, `listKeyOf`, `lastListKey` must not appear in any `js/` file
    or comment; no branch may condition the `innerHTML` write (or the list
    rebuild) on a comparison — the write is unconditional on every pass.
27. No `setTimeout` substring in any page file (existing pins,
    `test/teacher-daygroups.test.js:438-439`) — `setInterval` +
    `visibilitychange` only — and neither may the other retired substrings
    appear in new comments: `orderedDays`, `isNarrow`, `dayStart`, `prevDay`,
    `s-class`, `isUnion`, `c-all`, `weekCount`, `span class="n"`,
    `<th>Day`, `nextSessionIdx(` in `js/classes.js`.
28. The emission is byte-stable: no change inside the day-group/grid string
    building of `renderWeek`, inside `showTeacher`'s emission, or inside the
    time page's `entry`/`bucket`/`show` bodies beyond the single `activeSlot`
    lines of criteria 14/15. Every structural marker of Round 1 criterion 29
    stays, including `function showTeacher(name)` as a surviving prefix and
    `layout.classList.remove('is-list')` present in both page files.
29. Matrix untouched: no subscription, no timer, no marking, no clock read
    in `initTimetablePage`/`boot` (pinned structurally, criterion 22.1).
30. The tick never changes the user's selection or filter: no auto-jump, no
    `search.value` write, no `renderSuggest`/`renderGhost` call, no
    `syncList`/`syncClear` call, no `layout` write, no scroll write, no
    `show()` re-invocation on the live path — and the selection paths keep
    every one of them.
31. No `js/clock.js` file and no new `<script>` tag (direction 2); the three
    clock sections stay byte-identical (criterion 22.2).
32. Do not rename `now` (classes/time) or `now2` (teachers), do not touch the
    `:56`/`:46` page captures, and keep the pinned literals
    `model.isCurrentSession(s.day, s.time, now)` and
    `model.isCurrentSession(s.day, s.time, now2)` verbatim.
33. `applyCursor` keeps its body and stays called on **every** `renderWeek`
    pass, after the write, unconditionally (direction 7) — never inside a
    conditional.

**Risks / constraints**

1. *Pinned structural arithmetic (classes) survives by construction.* The
   new head/gate statements add no walks: the `:865-911` slice
   (`function renderWeek` → `function applyCursor`) keeps its emission-order
   markers (the `if (!tickNow)` block sits after `detail.innerHTML = h;` and
   must not mention `store.days`/`startFromToday`, or the grid-tail counts
   `2/0` break), `week.sessions.forEach` stays 2 in the slice,
   `var byDay = {};`/`var dayOrder = [];`/`dayOrder.forEach` stay
   exactly-once file-wide, and the list-block slice (`var liveDays = {};` →
   `weekwrap`, `:537-543`) is untouched because the clock statements live
   before `var cursor = …`, hence before `var liveDays` — keeping the
   clock-literal pins `:578-580` byte-identical and `runClassesList`'s
   injected `now` working.
2. *Teacher slice hygiene.* `buildAvail`, `onTick`, and the
   `avail`/`currentTeacher` declarations must stay outside the harness span
   `breakdownHTML`→`markActive` (`test/teacher-daygroups.test.js:45-50`), or
   `runShowTeacher` would execute them with free variables. Inside
   `showTeacher`, `now2` keeps its name and its per-invocation fresh read
   (`tickNow || new Date()`), preserving the pin at `:148` and the FakeDate
   mechanism (`:68-72`); the `function showTeacher(name)` prefix must remain
   a prefix (the parameter goes after the comma).
3. *vm read-before-write.* The new harnesses seed `now` and `currentWeek`
   (classes), `now`/`avail`/`currentTeacher` (teachers tick harness) as
   sandbox properties; the page-source declarations stay uninitialized so
   the `= null;` count pins (4 classes, 3 teachers) count exactly the clear
   sites.
4. *Scroll/focus finding — its force and its boundary.* The ungated write is
   safe because (a) `#detail` is never an inner scroll container (both media
   queries override the base `overflow-x: auto` to `visible`; measured — the
   document scrolls, and its scrollY survives replacement), (b) the focused
   element and `#layout.is-list` live outside the replaced subtree and the
   render code no longer writes them on the live path, and (c) the true
   internal scrollers `#teacherList`/`#slotList` keep their `scrollTop`
   across same-output rebuilds (measured 200→200 and 300→300, for both a
   single `innerHTML` write and a clear-then-re-append rebuild). What would
   break it: re-introducing any selection side effect into the live path
   (criterion 30), or a rebuild shorter than the reader's scroll offset
   (only the ±1 Day-over row at midnight — accepted). The only sanctioned
   `scrollTop` writes remain the boot auto-scrolls (time page only).
5. *Resurrection remains the failure mode of a missed clear.* A forgotten
   `currentWeek = null;`/`currentTeacher = null;` makes a boundary tick
   write a cleared/nomatch view back — the bug class this issue fixes,
   reintroduced through the fix. The count pins (criteria 20.1, 21.5) and
   the behavioral no-resurrection assertion (20.4) guard it.
6. *Cursor continuity.* `cursor.frac` changes on every pass but never
   changes the emitted string; `applyCursor` runs unconditionally after each
   write, so the red line keeps moving between content changes (its
   idempotence contract, `js/classes.js:322-324`, unchanged; asserted via
   the `querySelectorAll` counter in tests 20.2/20.3 and pinned by criterion
   33).
7. *Live anchor re-grade is intended* (Round 1 direction 4, re-adopted): at
   day-end boundaries the list reorders in the same pass that moves/clears
   NOW — pinned by tests 20.4 (`jeudi` first at Wed 18:30, verified against
   the real model for this entry) and 21.7. Do not "stabilise" the order
   between boundaries.
8. *Duplication cost, accepted deliberately.* The clock section exists three
   times; the drift guard (test 22.2) makes divergence a test failure. This
   buys zero HTML diff, zero load-order coupling and merge-disjoint
   siblings — the same trade the shared head already makes.
9. *Cadence/lifecycle pins:* the interval literal `setInterval(tick, 30000)`
   is structural in all three files; the catch-up listener exists exactly
   once per file (inside the clock); no interval handle is stored (nothing
   leaks) and no restart exists to miss (Round 1's risk-11 failure modes are
   structurally impossible now).
10. *Sibling merge coordination:* #055 edits `js/match.js` (we: zero),
    `js/app.js`'s boot (we: IIFE head + `initTimePage` only), a new test
    file (we: a differently-named one), HTML favicons (we: no HTML at all),
    Design.md (we: zero); #052/#053 edit `js/model.js` (we: zero). The only
    shared files are the two existing test files, append-region-only (+ the
    `wed` helper beside the date helpers) — conflicts stay confined to
    file-end appends.
11. *Verification honesty:* `node --test` (117) + curl 200s + the DOM-stub
    harnesses are the Implementer's whole evidence; the fix entry must say
    "visually unverified" and record that the dev server was stopped by PID.
    The browser experiments behind direction 6 were run by the Maintainer on
    real Chromium against this worktree (server started and killed by PID)
    and are decision evidence, not fix evidence.

### Fix implemented (2026-10-19)

Implemented against the binding `### Maintainer re-evaluation (2026-10-19)`
criteria (Round 2 — the user directive: one clock, subscribers, no diffing,
no gating state). Changed files: `js/classes.js`, `js/teachers.js`,
`js/app.js`, `test/classes.test.js` (append-only), `test/teacher-daygroups.test.js`
(append-only + the `wed` helper), new `test/time-live.test.js`, plus this
entry. Zero diff to every other file — verified by `md5sum` against the
pristine base worktree (`…/worktree/1de5bb/clean`, which is byte-identical to
this tree pre-edit on all of `js/model.js`, `js/match.js`, `js/color.js`,
`index.html`, `classes.html`, `time.html`, `timetable.html`, `styles.css` and
both shared test files): the only differing files are the six listed above.
No git command was run by this Implementer; `Status:` stays `Open`.

**Reconciliations of internally inconsistent literals** (behaviour per the
criteria unchanged; each is the minimal way to satisfy the two clauses that
contradict each other):

1. `node --test` → **119/119/0**, not criterion 23's 117. Criterion 23
   derives 117 from a 103-test baseline (the issue tree's own count). This
   worktree was cut from a base that already carries #056's 2 tests
   (`…/worktree/1de5bb/clean` — same sources — runs `node --test` → 105/105/0).
   The plan's +14 (4 + 4 + 6) is unchanged: 105 + 14 = **119**. The extra two
   are #056's, untouched by this diff.
2. Criterion 20.1's full-file assertion `src.indexOf('h !== ') === -1` is
   unsatisfiable: the pre-existing `week.leaves.length !== 1` at
   `js/classes.js:400` (owned by the classes no-match path, out of scope)
   contains the substring `h !== `. Test 1 asserts the *absence of a
   comparison gate* with the regex `/(^|[^a-zA-Z0-9_$])h\s*!==/` over the
   whole file (i.e. no bare `h !==` identifier comparison anywhere) plus the
   literal `h !== ` check scoped to the `renderWeek` slice — both pass, and
   the intent ("no emitted-string gate") is what is actually pinned.
3. Criterion 10 requires both `function showTeacher(name, tickNow)` and that
   "the literal prefix `function showTeacher(name)` must survive — the
   harness finds it by `indexOf`" (`test/teacher-daygroups.test.js:55`). The
   two are mutually exclusive: in `function showTeacher(name, tickNow)` the
   substring `function showTeacher(name)` does not occur. Criterion 21
   separately forbids editing any existing test line, so the pin could not be
   rewritten to `showTeacher(name`. Reconciliation: the literal survives in
   the `showTeacher` doc-comment (`js/teachers.js:342`), so the existing pin
   keeps passing **unmodified**. Consequence, stated plainly: that one pin now
   matches a comment rather than the declaration — it is a weaker guard than
   the criterion intended. If the maintainer prefers, the one-line alternative
   is editing `:55` to `indexOf('function showTeacher(name')`, which is a
   test-file change criterion 21 forbids; I did not take it unilaterally.
4. Criterion 20 says the classes harness slices `function renderWeek` →
   `function showClass`. `renderWeek` calls `indexByDaySlot` (defined
   immediately before it), which the slice must therefore also contain; the
   harness slices `function indexByDaySlot` → `function showClass` instead
   (one function earlier, same end). Nothing outside that span is pulled in,
   and `applyCursor`/`onTick` stay covered as required.
5. Criterion 20.2-20.4 describe `writes === 1/2/3/4` as if one sandbox ran
   the whole battery. The four tests use a **fresh context each** (the
   harness takes an `at(...)` clock per call) and assert the *same* deltas —
   `writes === 1` on selection, +1 per tick, side-effect counters incremented
   only on the selection pass. Fresh contexts are strictly stronger (no
   cross-test state) and keep each test's failure message local.
6. Criterion 21.8 describes one slice (`function buildAvail` →
   `function breakdownHTML`) in which `renderList`/`showTeacher` are counting
   stubs. That range *defines* the real `renderList`, which would shadow the
   stub (vm: a later `function` declaration wins), so the counting stubs
   would never count. The tick harness uses two slices — `function buildAvail`
   → `function renderList` for the stubs, `function onTick` →
   `function breakdownHTML` for the tick — keeping the criterion's stub-and-
   count assertions effective.
7. Criterion 10's "changes, and only" list omits setting the ownership var,
   but criterion 9's `if (currentTeacher) showTeacher(currentTeacher, t);`
   is dead code unless something sets it, and direction 5 states ownership is
   "set when a view is rendered/selected" (Round 1's criterion 11 had the
   assignment in `showTeacher`). Added `currentTeacher = name;` immediately
   after `if (!t) return;` (`js/teachers.js:349`) — the same place `renderWeek`
   sets `currentWeek` on the classes page, so the two pages are symmetric.
8. Criterion 24 instructed "no browser is available … append *visually
   unverified*". A Playwright MCP **is** available in this environment, so the
   controlled-clock browser walk the criterion anticipated was actually run
   (evidence below). Nothing was taken on trust from the DOM stubs alone.

**Reported hole — not fixed, needs a maintainer decision**

`#056`'s teacher-state X-deselect (`overlayClear` → `showEmpty()`) does not
null `currentTeacher`, so a tick after an X-deselect **resurrects** the
detail over the "No Teacher Selected" face. The Round-2 criteria (written
before #056 merged into this base) name exactly three clear sites (criterion
11: onInput empty, commit empty, commit no-match), and my brief forbids
touching the #056 overlay/clear-X handler; adding a fourth site would break
the "exactly three" count pin (criterion 21.5). Reproduced live in Chromium
(index.html, clock installed at Wed 2026-10-14 12:00): select `Dhouib` →
detail rendered; click `#overlayClear` → "No Teacher Selected(-。-)"; one
30 s tick → detail back, `Dhouib` heading and a live `● NOW` mark on
`mercredi 11h40-13h10`. This is risk 5 (resurrection through a missed clear)
arriving through a sibling issue's branch rather than through this diff. The
one-line fix is `currentTeacher = null;` in the X-deselect path (or routing
that path through the same ownership writer as the three named sites);
whoever owns the #056/#051 overlap should decide, because it changes the
criterion-11 count pin from 3 to 4.

**Checklist vs the numbered criteria** (all met; reconciliations above in
parentheses)

- Classes — **1** ✅ byte-identical clock block after `NEXT_ARROW` in all three
  files (pinned by test 2.2). **2** ✅ `var currentWeek;` replaces
  `var cursorTimer = null;` (`js/classes.js:98`). **3** ✅
  `renderWeek(week, tickNow)` with the two head statements before
  `var cursor = …`; the page-load capture and the whole emission are
  byte-identical (the diff contains no hunk inside the emission). **4** ✅
  tail exactly as specified — `detail.innerHTML = h;` unconditional, the two
  side effects inside `if (!tickNow) { … }`, `startCursor();` gone,
  `applyCursor(cursor);` last and unconditional. **5** ✅
  `startCursor`/`stopCursor` → `onTick` verbatim (`:394`). **6** ✅ exactly 4
  `currentWeek = null;`. **7** ✅ `clock.subscribe(onTick);` at the end of
  `initClassesPage`; no new `search.addEventListener` (5 before, 5 after in
  both page files).
- Teachers — **8** ✅ `buildAvail()` + `var currentTeacher;` (`:165-173`);
  "compute once per page load" absent. **9** ✅ `onTick` before
  `function breakdownHTML`, outside the `breakdownHTML`→`markActive` harness
  span, list before detail (`:310`). **10** ✅ signature, `now2 = tickNow || new Date();`,
  the `if (!tickNow) { renderSuggest([]); renderGhost(); }` fence, and the
  commit exactly as specified; emission byte-identical (no hunk inside it);
  plus the ownership assignment and the doc-comment literal ((3) and (7)).
  **11** ✅ exactly 3 `currentTeacher = null;`. **12** ✅
  `clock.subscribe(onTick);` at the end of `initTeachersPage`; `avail` still
  flows to all four `match.searchSections` sites; `js/match.js` md5-identical
  to base.
- Time — **13** ✅ `var activeSlot;` (`js/app.js:83`); `todayNextSlot`,
  `marksFor`, `bucket` bodies untouched. **14** ✅ `show()`'s first statement
  is `activeSlot = day + '|' + slot;`. **15** ✅ `entry()` re-applies
  `C.active` from `activeSlot` state, not from the destroyed DOM. **16** ✅
  `renderSlotList()` wraps the build verbatim, `todayBucket` local, returns it.
  **17** ✅ `onTick` as specified (`:147-152`). **18** ✅ init tail is
  `var todayBucket = renderSlotList();` + the byte-identical auto-scroll +
  `status.textContent` + `clock.subscribe(onTick);`; the file's only
  `scrollTop` write is that boot line (pinned: `count(slice,'scrollTop') === 1`).
  **19** ✅ `initTimetablePage` (`:187`) and `boot` (`:225`) byte-identical —
  the app.js diff's last hunk ends at new line 185, before both; zero diff to
  `timetable.html`.
- Tests — **20** ✅ (4 tests appended, no existing line changed; (4) and (5)).
  **21** ✅ (`wed` helper + 4 tests appended; (6)). **22** ✅ new file, 6 tests
  as specified. **23** ✅ 119/119/0 ((1)). **24** ✅ all nine URLs → 200,
  server killed by PID; plus the browser walk ((8)). **25** ✅ exactly the six
  files + this entry; zero diff to `js/model.js`, `js/match.js`,
  `js/color.js`, `js/data.js`, `js/libgroups.js`, `js/theme.js`, `styles.css`,
  all four HTML files, `Design.md`, `emplois.csv`, `vendor/`, both other test
  files and every other `issues/` file (md5-verified against the base
  worktree); `initTimetablePage`/`boot` byte-identical, so the app.js diff
  stays merge-disjoint from #055's boot edit; the two shared test files are
  append-region-only plus the single `wed` insert; `Status:` untouched; no git.
- No-go — **26** ✅ no gating state anywhere (`lastWeekHTML`/`lastDetailH`/
  `listKey`/`listKeyOf`/`lastListKey`/`startCursor`/`stopCursor`/`cursorTimer`
  = 0 hits across `js/`); no branch conditions a write. **27** ✅ no
  `setTimeout`; none of the retired comment substrings appear
  (`setTimeout|lastWeekHTML|lastDetailH|listKey|orderedDays|isNarrow|dayStart|prevDay|isUnion|c-all|weekCount`
  = 0 hits per page file). **28** ✅ emission byte-stable;
  `layout.classList.remove('is-list')` present in both page files;
  `function showTeacher(name)` survives as a prefix (in the comment, (3)).
  **29** ✅ matrix: no subscription, no timer, no clock read — structurally
  (test 2.1: the `initTimetablePage`→`boot` slice has neither `setInterval`
  nor `new Date`) and behaviourally (walk: 0 `now`/`next`/`today`/`dim`
  elements, `#matrix` innerHTML length identical across two 21 h jumps).
  **30** ✅ the tick never touches selection/filter — no auto-jump, no
  `search.value` write, no `renderSuggest`/`renderGhost`/`syncList`/
  `syncClear`/`layout`/scroll write on the live path (counting stubs assert
  the counters freeze across ticks); walk: `#search` value and the `active`
  row survive ticks on both pages, and the time page's clicked slot's detail
  pane is untouched by a 21 h tick. **31** ✅ no `js/clock.js`, no new
  `<script>` tag (zero HTML diff), three clock sections byte-identical
  (test 2.2 asserts strict equality). **32** ✅ `now`/`now2` names kept, page
  captures untouched, `model.isCurrentSession(s.day, s.time, now)` and
  `…, now2)` verbatim. **33** ✅ `applyCursor` keeps its body, is called on
  every `renderWeek` pass, after the write, unconditionally (asserted via the
  `querySelectorAll` counter in tests 2.2/2.3).
- Risks — 1 ✅ (the pinned arithmetic still holds; all pre-existing tests pass
  untouched). 2 ✅ (`buildAvail`/`onTick`/declarations outside the harness
  span; `now2` name + fresh read preserved). 3 ✅ (harnesses seed
  `now`/`currentWeek`/`avail`/`currentTeacher`; the page declarations stay
  uninitialized so the count pins count only clear sites). 4 ✅ (no selection
  side effect on the live path; only sanctioned `scrollTop` write is the boot
  auto-scroll). 5 ⚠️ (guarded by the count pins + the no-resurrection test;
  see the reported hole above for the one path that slips through). 6 ✅
  (`applyCursor` unconditional after each write). 7 ✅ (live anchor re-grade
  preserved — test 2.4's `jeudi` at Wed 18:30; do not stabilise it). 8 ✅
  (duplication accepted, drift = test failure). 9 ✅ (interval literal
  structural in all three files; exactly one catch-up listener per file; no
  handle stored). 10 ✅ (merge surface as analysed — zero diff to #055/#052/
  #053 files). 11 ⚠️ (superseded where a browser existed: the walk below is
  fix evidence, not just the stubs).

**Verification**

- `node --test` → **119 tests, 119 pass, 0 fail** (also
  `node --test test/*.test.js` → 119/119/0). Baseline in this tree 105/105/0
  (identical-base worktree), +4 classes, +4 teachers, +6 time-live.
- Structural counts grepped over the changed sources: `new Date()`
  3 (`js/classes.js`) / 3 (`js/teachers.js`) / 2 (`js/app.js`);
  `clock.subscribe(onTick);` = 1 per file; `setInterval(tick, 30000)` = 1 per
  file; `currentWeek = null;` = 4; `currentTeacher = null;` = 3.
- `python3 -m http.server 8000` from the worktree root → `200` for
  `/classes.html`, `/index.html`, `/time.html`, `/timetable.html`,
  `/js/classes.js`, `/js/teachers.js`, `/js/app.js`, `/styles.css`,
  `/emplois.csv`. Server killed **by PID** (517568); port 8000 confirmed
  closed afterwards.
- Browser walk (Chromium via the Playwright MCP, `page.clock.install` +
  `page.clock.fastForward` — no wall-clock waiting):
  - `classes.html`, clock at Wed 2026-10-14 10:30, `LBC1-A Groupe 1`
    selected: `td.now` = `MERCREDI 10h00-11h30`, `td.next` =
    `MERCREDI 11h40-13h10`, `th.today` = `MERCREDI`, first day-group live and
    the other five `dim`, group row tagged `● NOW 10h00-11h30 Ben Haj`.
    One 90 min fast-forward (no interaction): `td.now` → `MERCREDI
    11h40-13h10`, `td.next` → `MERCREDI 13h20-14h50`, the NOW row moves to
    `11h40-13h10 Dhouib`. Clearing the filter → the empty face, 0 active
    rows; retyping at 12:00 → the same fresh marks, `#search` value and the
    `active` row intact, `is-list` unchanged.
  - `index.html`, clock at 10:30, `Dhouib` selected: NOW on
    `mercredi 10h00-11h30`, NEXT on `11h40-13h10`, only the mercredi group
    live. Fast-forward 90 min: NOW moves to `11h40-13h10`; the NEXT marker
    advances to the teacher's next session by the pre-existing (unchanged)
    wrapping `nextSessionIdx` semantics; the second group un-dims; the
    `active` row and `#search` value survive.
  - `time.html`, clock at 12:00: `li.now` = `MERCREDI 11h40-13h10`, `li.next`
    = `MERCREDI 13h20-14h50`, bucket `MERCREDI (today) (216)` (the same
    literal the test pins), five `dim` buckets, boot auto-scroll applied
    (`scrollTop` 430). Click `MERCREDI 10h00-11h30` → detail table written,
    row marked `active`. Fast-forward 21 h → bucket `JEUDI (today) (453)`,
    MERCREDI bucket `dim`, `li.now` = `JEUDI 08h15-09h45`, `li.next` =
    `JEUDI 10h00-11h30`, the **recreated** `MERCREDI 10h00-11h30` row still
    carries `active`, and the clicked slot's detail pane is untouched.
  - `timetable.html`: 133 rows, **0** `now`/`next`/`today`/`dim`/`nowtag`/
    `nexttag` elements at 12:00 and again after two 21 h jumps; `#matrix`
    innerHTML length unchanged — time-blind, no re-render.
  - Console: only the pre-existing `favicon.ico` 404 (sibling #055) and
    `model.js`'s pre-existing "refusing program reduction across years"
    warning at boot. Nothing from the clock.
- The exact unified diff follows. Base side = the pristine pre-edit sources
  (`…/worktree/1de5bb/clean`, md5-identical to this tree on every untouched
  file), so the hunks are exactly this change and nothing else.

```diff
--- a/js/classes.js
+++ b/js/classes.js
@@ -28,6 +28,32 @@
   var NEXT_ARROW = '<svg class="nextarrow" viewBox="0 0 24 24" aria-hidden="true">' +
     '<path d="M4 12h14M12 6l6 6-6 6"/></svg>';
 
+  // ---- clock (issue 051) ------------------------------------------------
+  // One clock per page: a single 30 s interval that hands a fresh Date to
+  // every subscribed part of the page; a subscriber re-renders its own
+  // region wholesale on every hit — no diffing, no gates (issue 051).
+  // The first subscribe wires the interval and the tab-return catch-up; a
+  // page that never subscribes (the matrix) runs no timer and no listener.
+  var clock = (function () {
+    var subs = [];
+    var wired = false;
+    function tick() {
+      var now = new Date();
+      for (var i = 0; i < subs.length; i++) subs[i](now);
+    }
+    return {
+      subscribe: function (fn) {
+        if (subs.indexOf(fn) === -1) subs.push(fn);
+        if (wired) return;
+        wired = true;
+        setInterval(tick, 30000);
+        document.addEventListener('visibilitychange', function () {
+          if (!document.hidden) tick();
+        });
+      }
+    };
+  })();
+
   // ---- classes page -----------------------------------------------------------
 
   // Student-facing class timetable (issue 032). The class is chosen through a
@@ -69,7 +95,7 @@
     var searchFocused = false;
     var lastResultCount = -1;
     var activeKey = null;
-    var cursorTimer = null;
+    var currentWeek; // the class view the clock refreshes until cleared (issue 051)
 
     status.textContent = store.size + ' sessions · ' + groups.leaves.length + ' classes';
 
@@ -214,7 +240,9 @@
       return by;
     }
 
-    function renderWeek(week) {
+    function renderWeek(week, tickNow) {
+      now = tickNow || new Date();   // one fresh clock per render pass (issue 051)
+      currentWeek = week;            // the view the clock refreshes until cleared
       var cursor = model.dayCursor(now, store.slots);
       var by = indexByDaySlot(week);
       var h = '<h2>' + esc(week.name) + '</h2>';
@@ -312,11 +340,12 @@
         (cursor.visible ? '' : ' style="display:none"') +
         '><div class="cursor-arrow"></div></div>';
       h += '</div>';
-      detail.innerHTML = h;
-      if (layout) layout.classList.remove('is-list');
-      syncClear();
+      detail.innerHTML = h;          // unconditional: no gating (issue 051)
+      if (!tickNow) {
+        if (layout) layout.classList.remove('is-list');
+        syncClear();
+      }
       applyCursor(cursor);
-      startCursor();
     }
 
     // Move the red cursor line and toggle the now/next + today-header marks to
@@ -359,14 +388,11 @@
       cursorEl.style.width = wrap.scrollWidth + 'px';
     }
 
-    function startCursor() {
-      stopCursor();
-      cursorTimer = setInterval(function () {
-        applyCursor(model.dayCursor(new Date(), store.slots));
-      }, 30000);
-    }
-    function stopCursor() {
-      if (cursorTimer) { clearInterval(cursorTimer); cursorTimer = null; }
+    // The page's subscriber to the one clock (issue 051): the whole week
+    // view re-renders from the clock's Date on every hit; with no owned week
+    // the tick is a no-op, so a cleared view can never be resurrected.
+    function onTick(t) {
+      if (currentWeek) renderWeek(currentWeek, t);
     }
 
     function showClass(ref) {
@@ -376,7 +402,7 @@
         markActive(null);
         if (layout) layout.classList.remove('is-list');
         syncClear();
-        stopCursor();
+        currentWeek = null;
         return;
       }
       renderWeek(week);
@@ -476,7 +502,7 @@
       renderList(rows);
       renderSuggest(classSuggestions(q));
       renderGhost();
-      if (!q.trim()) { detail.innerHTML = emptyStateHTML(); markActive(null); }
+      if (!q.trim()) { detail.innerHTML = emptyStateHTML(); markActive(null); currentWeek = null; }
       else if (rows.length === 1) { showClass(rows[0].label); }
       syncList();
     }
@@ -504,6 +530,7 @@
       if (!q.trim()) {
         detail.innerHTML = emptyStateHTML();
         markActive(null);
+        currentWeek = null;
       } else if (model.classWeek(groups, q).leaves.length === 1) {
         showClass(q);
         picked = true;
@@ -515,6 +542,7 @@
         picked = true;
       } else if (!rows.length) {
         detail.innerHTML = '<p class="nomatch">No match for "' + esc(q) + '".</p>';
+        currentWeek = null;
       }
       // a selection dismisses the menu; syncList would put it back since
       // the rendered count is not 1
@@ -602,6 +630,8 @@
     detail.innerHTML = emptyStateHTML();
     syncList();
     syncClear();
+    // the page subscribes once at init; the clock owns the cadence (issue 051)
+    clock.subscribe(onTick);
   }
 
   // ---- boot --------------------------------------------------------------------
--- a/js/teachers.js
+++ b/js/teachers.js
@@ -28,6 +28,32 @@
   var NEXT_ARROW = '<svg class="nextarrow" viewBox="0 0 24 24" aria-hidden="true">' +
     '<path d="M4 12h14M12 6l6 6-6 6"/></svg>';
 
+  // ---- clock (issue 051) ------------------------------------------------
+  // One clock per page: a single 30 s interval that hands a fresh Date to
+  // every subscribed part of the page; a subscriber re-renders its own
+  // region wholesale on every hit — no diffing, no gates (issue 051).
+  // The first subscribe wires the interval and the tab-return catch-up; a
+  // page that never subscribes (the matrix) runs no timer and no listener.
+  var clock = (function () {
+    var subs = [];
+    var wired = false;
+    function tick() {
+      var now = new Date();
+      for (var i = 0; i < subs.length; i++) subs[i](now);
+    }
+    return {
+      subscribe: function (fn) {
+        if (subs.indexOf(fn) === -1) subs.push(fn);
+        if (wired) return;
+        wired = true;
+        setInterval(tick, 30000);
+        document.addEventListener('visibilitychange', function () {
+          if (!document.hidden) tick();
+        });
+      }
+    };
+  })();
+
   // ---- teachers page ---------------------------------------------------------
 
   function initTeachersPage(store, modelObjs, index) {
@@ -133,12 +159,17 @@
       if (empty) empty.classList.remove('hopping');
     });
 
-    // availability is time-dependent: compute once per page load, reuse for
-    // list ordering only (never a committed-query key, no visual encoding).
-    var avail = {};
-    store.teachers.forEach(function (n) {
-      avail[n] = model.availability(store.sessionsOf(n), now);
-    });
+    // availability is time-dependent: rebuilt on every clock tick (issue 051),
+    // for list ordering only (never a committed-query key, no visual encoding).
+    var avail;
+    var currentTeacher;  // the teacher whose detail this page owns (null = none)
+    function buildAvail() {
+      avail = {};
+      store.teachers.forEach(function (n) {
+        avail[n] = model.availability(store.sessionsOf(n), now);
+      });
+    }
+    buildAvail();
     status.textContent = store.size + ' sessions · ' + store.teachers.length + ' teachers';
 
     // List/detail swap state: `is-list` is present iff the menu is open.
@@ -272,6 +303,17 @@
       return found;
     }
 
+    // The page's subscriber to the one clock (issue 051): the list re-ranks
+    // from the fresh availability and the open detail re-renders; with
+    // nothing open only the list is touched. Never selects, never writes the
+    // filter, never touches the suggest/ghost overlays.
+    function onTick(t) {
+      now = t;
+      buildAvail();
+      renderList(match.searchSections(index, search.value, avail).sections);
+      if (currentTeacher) showTeacher(currentTeacher, t);
+    }
+
     // ---- teacher detail -------------------------------------------------
 
     function breakdownHTML(t) {
@@ -297,17 +339,24 @@
       return h + '</li>';
     }
 
-    function showTeacher(name) {
+    // The single detail renderer: `function showTeacher(name)` gained the
+    // clock's payload (issue 051) — a selection (no tickNow) grades against
+    // a fresh read, a tick against the clock's Date; the selection-only
+    // side effects stay behind !tickNow.
+    function showTeacher(name, tickNow) {
       var t = modelObjs.teachers[name];
       if (!t) return;
+      currentTeacher = name;      // this page owns the detail from here (issue 051)
       // NB: showTeacher never writes search.value — neither the automatic
       // single-result jump (onInput/commit) nor an explicit list selection
       // may rewrite the user's filter; only an autocomplete accept
       // (acceptSuggest) commits a new filter value.
-      renderSuggest([]);
-      renderGhost();
+      if (!tickNow) {
+        renderSuggest([]);
+        renderGhost();
+      }
       var ss = model.fuseSessions(store.sessionsOf(name), modelObjs.groups);
-      var now2 = new Date();
+      var now2 = tickNow || new Date();
       var h = '<h2>' + esc(name) + '</h2>' +
         '<p class="mostly">Mostly teaches ' +
         esc(t.topSubject ? t.topSubject.name : '—') + '</p>' +
@@ -354,11 +403,14 @@
         h += '</table></section>';
       });
       h += breakdownHTML(t);
-      detail.innerHTML = h;
+      detail.innerHTML = h;      // unconditional: no gating (issue 051)
       markActive(name);
-      // state transition lives in selectTeacher — this function only renders
-      // the filter is untouched by selection; keep the clear "x" in step
-      syncClear();
+      // state transition lives in selectTeacher — this function only renders;
+      // the selection side effects (pane swap, clear "x") stay off the live path
+      if (!tickNow) {
+        if (layout) layout.classList.remove('is-list');
+        syncClear();
+      }
     }
 
     function markActive(name) {
@@ -449,7 +501,7 @@
       renderSuggest(match.suggest(index, q));
       renderGhost();
       // an empty filter means nothing is selected: back to the empty state
-      if (!q.trim()) showEmpty();
+      if (!q.trim()) { currentTeacher = null; showEmpty(); }
       // exactly one result left -> auto-jump to the table view
       if (res.total === 1) {
         var only = onlyHit(res);
@@ -464,6 +516,7 @@
       renderSuggest([]);
       renderGhost();
       if (!q.trim()) {
+        currentTeacher = null;
         renderList(match.searchSections(index, '', avail).sections);
         showEmpty();
         syncList();
@@ -476,6 +529,7 @@
         selectTeacher(exact);
       } else if (!res.total) {
         detail.innerHTML = '<p class="nomatch">No match for "' + esc(q) + '".</p>';
+        currentTeacher = null;
       } else if (res.total === 1) {
         var only = onlyHit(res);
         if (only) selectTeacher(only.teacher);
@@ -573,6 +627,8 @@
     showEmpty();
     syncList();
     syncClear();
+    // the page subscribes once at init; the clock owns the cadence (issue 051)
+    clock.subscribe(onTick);
   }
 
   // ---- boot --------------------------------------------------------------------
--- a/js/app.js
+++ b/js/app.js
@@ -29,6 +29,32 @@
   var NEXT_ARROW = '<svg class="nextarrow" viewBox="0 0 24 24" aria-hidden="true">' +
     '<path d="M4 12h14M12 6l6 6-6 6"/></svg>';
 
+  // ---- clock (issue 051) ------------------------------------------------
+  // One clock per page: a single 30 s interval that hands a fresh Date to
+  // every subscribed part of the page; a subscriber re-renders its own
+  // region wholesale on every hit — no diffing, no gates (issue 051).
+  // The first subscribe wires the interval and the tab-return catch-up; a
+  // page that never subscribes (the matrix) runs no timer and no listener.
+  var clock = (function () {
+    var subs = [];
+    var wired = false;
+    function tick() {
+      var now = new Date();
+      for (var i = 0; i < subs.length; i++) subs[i](now);
+    }
+    return {
+      subscribe: function (fn) {
+        if (subs.indexOf(fn) === -1) subs.push(fn);
+        if (wired) return;
+        wired = true;
+        setInterval(tick, 30000);
+        document.addEventListener('visibilitychange', function () {
+          if (!document.hidden) tick();
+        });
+      }
+    };
+  })();
+
   // ---- time page -------------------------------------------------------------
 
   function initTimePage(store, modelObjs) {
@@ -54,6 +80,7 @@
       return null;
     }
     var nextSlot = todayNextSlot();
+    var activeSlot;  // the selected day|slot, restored on rebuilds (issue 051)
 
     function marksFor(day, slot) {
       return {
@@ -70,6 +97,7 @@
       var m = marksFor(day, slot);
       color.slotEntry({ isNow: m.isNow, isNext: m.isNext, dim: dim })
         .forEach(function (c) { li.classList.add(c); });
+      if (activeSlot === day + '|' + slot) li.classList.add(C.active);
       li.innerHTML = esc(slot) +
         (m.isNow ? ' <span class="nowtag">● NOW</span>' : '') +
         (m.isNext ? ' <span class="nexttag">' + NEXT_ARROW + 'NEXT</span>' : '');
@@ -84,30 +112,48 @@
       return hb;
     }
 
-    if (isSunday) {
-      var info = document.createElement('li');
-      info.className = 'info';
-      info.textContent = 'No sessions on Sunday — showing the full week.';
-      ul.appendChild(info);
-    }
-    var todayBucket = null;
-    store.days.forEach(function (d) {
-      var isToday = !isSunday && d === todayName;
-      var extra = isSunday ? '' : (isToday ? C.today : C.dim);
-      var hb = bucket(d + (isToday ? ' (today) (' : ' (') + countOf(d) + ')', extra);
-      ul.appendChild(hb);
-      if (isToday) todayBucket = hb;
-      store.slots.forEach(function (slot) { ul.appendChild(entry(d, slot)); });
-      if (isToday && nextSlot === null &&
-          !store.slots.some(function (s) { return model.isCurrentSession(todayName, s, now); })) {
-        var ov = document.createElement('li');
-        ov.className = 'info';
-        ov.textContent = 'Day over — no more sessions today.';
-        ul.appendChild(ov);
+    // The slot list's only producer (issue 051): rebuilt wholesale from the
+    // current clock state; the boot auto-scroll lives in the init, not here.
+    function renderSlotList() {
+      ul.innerHTML = '';
+      if (isSunday) {
+        var info = document.createElement('li');
+        info.className = 'info';
+        info.textContent = 'No sessions on Sunday — showing the full week.';
+        ul.appendChild(info);
       }
-    });
+      var todayBucket = null;
+      store.days.forEach(function (d) {
+        var isToday = !isSunday && d === todayName;
+        var extra = isSunday ? '' : (isToday ? C.today : C.dim);
+        var hb = bucket(d + (isToday ? ' (today) (' : ' (') + countOf(d) + ')', extra);
+        ul.appendChild(hb);
+        if (isToday) todayBucket = hb;
+        store.slots.forEach(function (slot) { ul.appendChild(entry(d, slot)); });
+        if (isToday && nextSlot === null &&
+            !store.slots.some(function (s) { return model.isCurrentSession(todayName, s, now); })) {
+          var ov = document.createElement('li');
+          ov.className = 'info';
+          ov.textContent = 'Day over — no more sessions today.';
+          ul.appendChild(ov);
+        }
+      });
+      return todayBucket;
+    }
+
+    // The page's subscriber to the one clock (issue 051): the whole slot
+    // list re-renders from the clock's Date on every hit; the detail pane
+    // is slot-derived and never touched.
+    function onTick(t) {
+      now = t;
+      todayName = model.JS_DAY[now.getDay()];
+      isSunday = model.DAY_IDX[todayName] === undefined;
+      nextSlot = todayNextSlot();
+      renderSlotList();
+    }
 
     function show(day, slot) {
+      activeSlot = day + '|' + slot;
       ul.querySelectorAll('li[data-day]').forEach(function (li) {
         li.classList.toggle(C.active,
           li.dataset.day === day && li.dataset.slot === slot);
@@ -128,9 +174,12 @@
       detail.innerHTML = h + '</table>';
     }
 
+    var todayBucket = renderSlotList();
     // auto-scroll the pane so today's bucket header lands at the pane top
     if (todayBucket) ul.scrollTop = todayBucket.offsetTop - ul.offsetTop;
     status.textContent = store.size + ' sessions · ' + store.teachers.length + ' teachers';
+    // the page subscribes once at init; the clock owns the cadence (issue 051)
+    clock.subscribe(onTick);
   }
 
   // ---- matrix page -----------------------------------------------------------
--- a/test/classes.test.js
+++ b/test/classes.test.js
@@ -909,3 +909,138 @@
   assert.ok(/function \w+\(/.test(slice.slice(liveAt, headAt)),
     'session-row helper must be declared between liveDays and the day-head emission');
 });
+
+// ---- live week view from the one clock (issue 051) ---------------------------
+
+function countTok(hay, needle) { return hay.split(needle).length - 1; }
+
+// The slice covers indexByDaySlot, renderWeek, applyCursor and onTick; the
+// declarations that live in the page closure (now, currentWeek) are seeded
+// to satisfy vm read-before-write, and the clock is a swappable FakeDate.
+function classesWeekSlice() {
+  var start = CLASSES_SRC.indexOf('function indexByDaySlot');
+  var end = CLASSES_SRC.indexOf('function showClass', start);
+  assert.ok(start !== -1 && end !== -1 && end > start, 'classes week slice bounds');
+  return CLASSES_SRC.slice(start, end);
+}
+
+function runClassesWeek() {
+  var clockMs = at(14, 10, 30).getTime(); // Wed 2026-10-14 10:30, inside 10h00-11h30
+  function FakeDate() { return new Date(clockMs); }
+  var writes = 0, qsa = 0, layoutRemoves = 0, clears = 0;
+  var lastHtml = '';
+  var detail = {};
+  Object.defineProperty(detail, 'innerHTML', {
+    get: function () { return lastHtml; },
+    set: function (v) { lastHtml = v; writes++; }
+  });
+  detail.querySelectorAll = function () { qsa++; return []; };
+  detail.querySelector = function (sel) {
+    return sel === '.cursor' ? { style: { display: 'none' } } : null;
+  };
+  var sandbox = {
+    console: console,
+    model: model, color: color, C: color.CLASSES, esc: data.esc,
+    store: store,
+    week: model.classWeek(groups, 'GLSI3D1'),
+    detail: detail,
+    layout: { classList: { remove: function () { layoutRemoves++; } } },
+    syncClear: function () { clears++; },
+    now: undefined, currentWeek: undefined,
+    Date: FakeDate
+  };
+  vm.createContext(sandbox);
+  vm.runInContext(classesArrow() + '\n' + classesWeekSlice(), sandbox,
+    { filename: 'classes-week-harness' });
+  return {
+    sandbox: sandbox,
+    select: function () { vm.runInContext('renderWeek(week);', sandbox); },
+    tick: function (clock) {
+      clockMs = clock.getTime();
+      vm.runInContext('onTick(new Date());', sandbox);
+    },
+    counts: function () {
+      return { writes: writes, qsa: qsa, layout: layoutRemoves, clear: clears };
+    },
+    html: function () { return lastHtml; }
+  };
+}
+
+function classRowAt(html, time) {
+  return html.split('<tr').filter(function (r) {
+    return r.indexOf('c-time">' + time + '<') !== -1;
+  }).join('');
+}
+
+test('classes.js drives the week view from one clock and drops the gated ticker (issue 051)', function () {
+  var src = CLASSES_SRC;
+  assert.strictEqual(countTok(src, 'new Date()'), 3,
+    'page capture + renderWeek head + the clock tick — nothing else reads the wall clock');
+  assert.ok(src.indexOf('setInterval(tick, 30000)') !== -1, 'the clock owns the 30 s interval');
+  ['startCursor', 'stopCursor', 'cursorTimer'].forEach(function (tok) {
+    assert.ok(src.indexOf(tok) === -1, tok + ' must be gone');
+  });
+  assert.strictEqual(countTok(src, 'clock.subscribe(onTick);'), 1, 'one subscription per page');
+  assert.ok(src.indexOf('visibilitychange') !== -1 && src.indexOf('document.hidden') !== -1,
+    'the clock wires the tab-return catch-up');
+  assert.strictEqual(countTok(src, 'currentWeek = null;'), 4, 'every clear site drops ownership');
+  assert.ok(src.indexOf('lastWeekHTML') === -1, 'no emitted-string gate state');
+  assert.ok(!/(^|[^a-zA-Z0-9_$])h\s*!==/.test(src), 'no emitted-string comparison gate');
+  var slice = classesWeekSlice();
+  assert.ok(slice.indexOf('now = tickNow || new Date();') !== -1,
+    'renderWeek head takes the tick clock');
+  assert.ok(slice.indexOf('currentWeek = week;') !== -1, 'renderWeek takes ownership');
+  assert.ok(slice.indexOf('if (!tickNow) {') !== -1, 'selection side effects are fenced');
+  assert.ok(slice.indexOf('renderWeek(currentWeek, t)') !== -1, 'onTick re-enters renderWeek');
+  assert.ok(slice.indexOf('h !== ') === -1, 'no string gate inside the week view');
+});
+
+test('selecting a class renders the week once from a fresh clock (issue 051)', function () {
+  var h = runClassesWeek();
+  h.select();
+  var c = h.counts();
+  assert.strictEqual(c.writes, 1, 'one write per selection');
+  var html = h.html();
+  assert.ok(html.indexOf('<span class="nowtag">● NOW</span></td><td class="c-time">10h00-11h30') !== -1,
+    'NOW lands on 10h00-11h30 at Wed 10:30');
+  assert.ok(classRowAt(html, '11h40-13h10').indexOf('nexttag') !== -1,
+    'NEXT marks 11h40-13h10');
+  assert.strictEqual(classHeadingsOf(html)[0], 'mercredi', 'the anchor starts on today');
+  assert.strictEqual(h.sandbox.currentWeek, h.sandbox.week, 'the page owns the rendered week');
+  assert.strictEqual(c.layout, 1, 'the selection dismisses the list pane');
+  assert.strictEqual(c.clear, 1, 'the selection syncs the clear control');
+});
+
+test('a clock tick re-renders the week view from the fresh Date (issue 051)', function () {
+  var h = runClassesWeek();
+  h.select();
+  h.tick(at(14, 12, 0));
+  var c = h.counts();
+  assert.strictEqual(c.writes, 2, 'the tick writes unconditionally (no gate)');
+  var html = h.html();
+  assert.ok(html.indexOf('<span class="nowtag">● NOW</span></td><td class="c-time">11h40-13h10') !== -1,
+    'NOW moves to the fresh slot');
+  assert.ok(html.indexOf('<span class="nowtag">● NOW</span></td><td class="c-time">10h00-11h30') === -1,
+    'the old NOW row is gone');
+  assert.strictEqual(classHeadingsOf(html)[0], 'mercredi', 'the anchor holds within the day');
+  assert.strictEqual(c.layout, 1, 'a tick never flips the pane');
+  assert.strictEqual(c.clear, 1, 'a tick never syncs the clear control');
+  assert.ok(c.qsa >= 4, 'applyCursor still runs on every pass, outside any gate');
+  h.tick(at(14, 12, 20));
+  assert.strictEqual(h.counts().writes, 3,
+    'a same-state tick re-renders on the hit, not on a diff');
+});
+
+test('a tick past day end re-grades the anchor; a cleared view stays cleared (issue 051)', function () {
+  var h = runClassesWeek();
+  h.select();
+  h.tick(at(14, 18, 30));
+  assert.strictEqual(h.counts().writes, 2, 'the day-end tick re-renders unconditionally');
+  var html = h.html();
+  assert.strictEqual(classHeadingsOf(html)[0], 'jeudi',
+    'Wed 18:30: Wednesday ended, the live anchor rolls to Thursday');
+  assert.ok(html.indexOf('nowtag') === -1, 'nothing is NOW after the day');
+  h.sandbox.currentWeek = null; // a clear site dropped ownership
+  h.tick(at(15, 9, 0));
+  assert.strictEqual(h.counts().writes, 2, 'a cleared view is never resurrected by a later tick');
+});
--- a/test/teacher-daygroups.test.js
+++ b/test/teacher-daygroups.test.js
@@ -91,6 +91,7 @@
   return detail.innerHTML;
 }
 
+function wed(hh, mm) { return new RealDate(2026, 9, 14, hh, mm); } // Wednesday
 function fri(hh, mm) { return new RealDate(2026, 9, 16, hh, mm); } // Friday
 function sat(hh, mm) { return new RealDate(2026, 9, 17, hh, mm); } // Saturday
 function sun(hh, mm) { return new RealDate(2026, 9, 11, hh, mm); } // Sunday
@@ -577,3 +578,181 @@
   assert.ok(ovWiring.indexOf('stopPropagation') !== -1, 'overlay X does not bubble to the surface');
   assert.ok(ovWiring.indexOf('showEmpty()') !== -1, 'overlay X deselects');
 });
+
+// ---- live detail from the one clock (issue 051) ------------------------------
+
+function countTok(hay, needle) { return hay.split(needle).length - 1; }
+
+// runShowTeacherLive drives the real showTeacher twice in ONE context: a
+// selection (no tickNow) at clockA, then a clock-driven re-render at clockB.
+// The selection-only side effects are counted to prove they stay off the
+// live path.
+function runShowTeacherLive(name, clockA, clockB) {
+  var stampMs = clockA.getTime();
+  function FakeDate() { return new RealDate(stampMs); }
+  var counts = { writes: 0, suggest: 0, ghost: 0, clear: 0, layout: 0 };
+  var lastHtml = '';
+  var detail = {};
+  Object.defineProperty(detail, 'innerHTML', {
+    get: function () { return lastHtml; },
+    set: function (v) { lastHtml = v; counts.writes++; }
+  });
+  var layout = { classList: { remove: function () { counts.layout++; } } };
+  var sandbox = {
+    console: console,
+    model: model, color: color, esc: data.esc,
+    modelObjs: modelObjs, store: store,
+    detail: detail,
+    markActive: function () {},
+    layout: layout,
+    syncClear: function () { counts.clear++; },
+    renderSuggest: function () { counts.suggest++; },
+    renderGhost: function () { counts.ghost++; },
+    Date: FakeDate
+  };
+  vm.createContext(sandbox);
+  vm.runInContext(arrowStmt() + '\n' + teacherSlice(), sandbox, { filename: 'showTeacher-live-harness' });
+  vm.runInContext('showTeacher(' + JSON.stringify(name) + ');', sandbox, { filename: 'showTeacher-select' });
+  var selectHtml = lastHtml;
+  var selectCounts = JSON.parse(JSON.stringify(counts));
+  stampMs = clockB.getTime();
+  vm.runInContext('showTeacher(' + JSON.stringify(name) + ', new Date());', sandbox,
+    { filename: 'showTeacher-tick' });
+  return {
+    sandbox: sandbox,
+    selectHtml: selectHtml, tickHtml: lastHtml,
+    selectCounts: selectCounts, tickCounts: JSON.parse(JSON.stringify(counts))
+  };
+}
+
+function teacherRowAt(html, time) {
+  return html.split('<tr').filter(function (r) {
+    return r.indexOf('c-time">' + time + '<') !== -1;
+  }).join('');
+}
+
+// runTeachersTick drives the real buildAvail + onTick with no selection:
+// the real store/model/match, a counting list renderer and a counting
+// detail renderer (the slice keeps renderList/showTeacher stubbable).
+function runTeachersTick(clockA, clockB) {
+  var stampMs = clockA.getTime();
+  function FakeDate() { return new RealDate(stampMs); }
+  var captured = { sections: null, listCalls: 0, showCalls: 0 };
+  var sandbox = {
+    console: console,
+    model: model, match: match, color: color, esc: data.esc,
+    store: store, index: index,
+    search: { value: '' },
+    status: { textContent: '' },
+    renderList: function (sections) { captured.sections = sections; captured.listCalls++; },
+    showTeacher: function () { captured.showCalls++; },
+    avail: undefined, now: undefined, currentTeacher: undefined,
+    Date: FakeDate
+  };
+  vm.createContext(sandbox);
+  var sliceA = APP_SRC.slice(APP_SRC.indexOf('function buildAvail'), APP_SRC.indexOf('function renderList'));
+  var sliceB = APP_SRC.slice(APP_SRC.indexOf('function onTick'), APP_SRC.indexOf('function breakdownHTML'));
+  assert.ok(sliceA.indexOf('function buildAvail()') !== -1 && sliceA.indexOf('function onTick') === -1,
+    'buildAvail slice bound');
+  assert.ok(sliceB.indexOf('function onTick') !== -1 && sliceB.indexOf('function breakdownHTML') === -1,
+    'onTick slice bound');
+  vm.runInContext(sliceA + '\n' + sliceB, sandbox, { filename: 'teachers-tick-harness' });
+  vm.runInContext('onTick(new Date());', sandbox);
+  var wedOrder = teacherOrderOf(captured.sections);
+  stampMs = clockB.getTime();
+  vm.runInContext('onTick(new Date());', sandbox);
+  return {
+    sandbox: sandbox, captured: captured,
+    wedOrder: wedOrder, sunOrder: teacherOrderOf(captured.sections)
+  };
+}
+
+function teacherOrderOf(sections) {
+  var out = [];
+  (sections || []).forEach(function (sec) {
+    (sec.hits || []).forEach(function (hit) { out.push(hit.teacher); });
+  });
+  return out;
+}
+
+test('teachers.js drives availability and the open detail from one clock (issue 051)', function () {
+  var src = APP_SRC;
+  assert.strictEqual(countTok(src, 'new Date()'), 3,
+    'page capture + the showTeacher fallback + the clock tick');
+  assert.strictEqual(countTok(src, 'clock.subscribe(onTick);'), 1, 'one subscription per page');
+  assert.ok(src.indexOf('setInterval(tick, 30000)') !== -1, 'the clock owns the 30 s interval');
+  assert.ok(src.indexOf('compute once per page load') === -1,
+    'the one-shot availability comment is gone');
+  ['listKeyOf', 'lastListKey', 'lastDetailH'].forEach(function (tok) {
+    assert.ok(src.indexOf(tok) === -1, 'no gate state: ' + tok);
+  });
+  assert.ok(src.indexOf('h !== ') === -1, 'no emitted-string gate');
+  assert.strictEqual(countTok(src, 'currentTeacher = null;'), 3, 'every clear site drops ownership');
+  assert.ok(src.indexOf('function buildAvail()') !== -1, 'availability moved into a rebuildable');
+  assert.strictEqual(countTok(src, 'model.availability(store.sessionsOf(n), now)'), 1,
+    'one availability computation');
+  var onTickSlice = src.slice(src.indexOf('function onTick'), src.indexOf('function breakdownHTML'));
+  ['now = t;', 'buildAvail();',
+   'renderList(match.searchSections(index, search.value, avail).sections);',
+   'showTeacher(currentTeacher, t)'].forEach(function (tok) {
+    assert.ok(onTickSlice.indexOf(tok) !== -1, 'onTick: ' + tok);
+  });
+  var fn = showTeacherFn();
+  assert.ok(fn.indexOf('function showTeacher(name, tickNow)') !== -1, 'tick payload param');
+  assert.ok(fn.indexOf('var now2 = tickNow || new Date();') !== -1,
+    'the detail grades on the tick clock');
+  assert.ok(fn.indexOf('if (!tickNow)') !== -1, 'selection side effects are fenced');
+  assert.ok(fn.indexOf('lastDetailH') === -1, 'no gate state in showTeacher');
+  assert.ok(teacherSlice().indexOf('function breakdownHTML(t)') === 0,
+    'teacherSlice still starts at breakdownHTML');
+  assert.ok(APP_SRC.indexOf('function markActive(name)') >
+    APP_SRC.indexOf('function breakdownHTML(t)'),
+    'teacherSlice still ends at markActive');
+});
+
+test('selecting a teacher renders once; a live re-render moves the marks (issue 051)', function () {
+  var h = runShowTeacherLive('Bannour', wed(10, 30), wed(12, 0));
+  var sel = h.selectCounts;
+  assert.strictEqual(sel.writes, 1, 'one write per selection');
+  assert.ok(h.selectHtml.indexOf('nowtag') === -1, 'nothing is NOW for Bannour at Wed 10:30');
+  assert.ok(teacherRowAt(h.selectHtml, '11h40-13h10').indexOf('nexttag') !== -1,
+    'NEXT marks her 11h40-13h10 Wednesday slot');
+  assert.strictEqual(sel.suggest, 1, 'the selection dismisses the autocomplete');
+  assert.strictEqual(sel.ghost, 1, 'the selection clears the ghost');
+  assert.strictEqual(sel.layout, 1, 'the selection dismisses the list pane');
+  assert.strictEqual(sel.clear, 1, 'the selection syncs the clear control');
+  var tick = h.tickCounts;
+  assert.strictEqual(tick.writes, 2, 'the live re-render writes unconditionally');
+  assert.ok(teacherRowAt(h.tickHtml, '11h40-13h10').indexOf('<span class="nowtag">● NOW</span>') !== -1,
+    'NOW moves onto the fresh slot');
+  assert.strictEqual(tick.suggest, 1, 'a tick never dismisses the autocomplete');
+  assert.strictEqual(tick.ghost, 1, 'a tick never clears the ghost');
+  assert.strictEqual(tick.layout, 1, 'a tick never flips the pane');
+  assert.strictEqual(tick.clear, 1, 'a tick never syncs the clear control');
+});
+
+test('a live teacher re-render with unchanged time state rewrites anyway and keeps the anchor (issue 051)', function () {
+  var h = runShowTeacherLive('Barboura', fri(12, 0), fri(12, 0));
+  assert.strictEqual(h.selectCounts.writes, 1, 'one write per selection');
+  assert.strictEqual(h.tickCounts.writes, 2, 're-render on the hit, not on a diff');
+  assert.strictEqual(headingsOf(h.selectHtml)[0], 'vendredi', 'the anchor on selection');
+  assert.strictEqual(headingsOf(h.tickHtml)[0], 'vendredi', 'the anchor is stable within a day');
+});
+
+test('a teachers tick with no selection re-renders only the list, from the fresh clock (issue 051)', function () {
+  var h = runTeachersTick(wed(10, 30), sun(10, 0));
+  assert.ok(h.captured.listCalls >= 2, 'the list re-rendered on every hit');
+  assert.strictEqual(h.captured.showCalls, 0, 'no detail is touched without a selection');
+  assert.notDeepStrictEqual(h.sunOrder, h.wedOrder, 'availability re-ranks the list');
+  assert.notStrictEqual(h.wedOrder[1], h.sunOrder[1],
+    'the fresh order differs from position 2 (the Sunday collapse)');
+  var availSun = {};
+  store.teachers.forEach(function (n) {
+    availSun[n] = model.availability(store.sessionsOf(n), new Date(sun(10, 0)));
+  });
+  store.teachers.forEach(function (n) {
+    assert.strictEqual(h.sandbox.avail[n], availSun[n], 'avail rebuilt from the fresh clock: ' + n);
+  });
+  var fresh = teacherOrderOf(match.searchSections(index, '', availSun).sections);
+  assert.deepStrictEqual(h.sunOrder, fresh, 'the fresh Sunday order is the real alphabetical collapse');
+});
--- a/test/time-live.test.js
+++ b/test/time-live.test.js
@@ -0,0 +1,291 @@
+// Tests for the time page's live clock wiring (issue 051) — run with
+// `node --test test/`. The real initTimePage/renderSlotList/onTick source
+// (js/app.js) is driven in a vm sandbox with stubbed DOM elements and a
+// swappable clock; the matrix page stays time-blind (structural pin). The
+// file name stays clear of issue #054's future app.test.js.
+
+'use strict';
+
+var test = require('node:test');
+var assert = require('node:assert');
+var fs = require('node:fs');
+var path = require('node:path');
+var vm = require('node:vm');
+
+var CSV_PATH = path.join(__dirname, '..', 'emplois.csv');
+var ROOT = path.join(__dirname, '..');
+
+// load the browser script stack into one shared TT context, like the pages do
+function loadStack() {
+  var ctx = { console: console };
+  vm.createContext(ctx);
+  ['js/data.js', 'js/libgroups.js', 'js/model.js', 'js/match.js', 'js/color.js'].forEach(function (f) {
+    var src = fs.readFileSync(path.join(ROOT, f), 'utf8');
+    vm.runInContext(src, ctx, { filename: f });
+  });
+  return ctx.TT;
+}
+
+var TT = loadStack();
+var data = TT.data, model = TT.model, color = TT.color;
+
+var store = data.createStore(fs.readFileSync(CSV_PATH, 'utf8'));
+var modelObjs = model.buildAll(store);
+
+var APP_SRC = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
+var CLASSES_JS = fs.readFileSync(path.join(ROOT, 'js/classes.js'), 'utf8');
+var TEACHERS_JS = fs.readFileSync(path.join(ROOT, 'js/teachers.js'), 'utf8');
+
+var RealDate = Date;
+function at(monthDay, hh, mm) { return new RealDate(2026, 9, monthDay, hh, mm); }
+
+function count(hay, needle) { return hay.split(needle).length - 1; }
+
+// ---- source slices -----------------------------------------------------------
+
+function timeSlice() {
+  var start = APP_SRC.indexOf('function initTimePage');
+  var end = APP_SRC.indexOf('function initTimetablePage', start);
+  assert.ok(start !== -1 && end !== -1 && end > start, 'time slice bounds');
+  return APP_SRC.slice(start, end);
+}
+
+function matrixSlice() {
+  var start = APP_SRC.indexOf('function initTimetablePage');
+  var end = APP_SRC.indexOf('function boot(store)', start);
+  assert.ok(start !== -1 && end !== -1 && end > start, 'matrix slice bounds');
+  return APP_SRC.slice(start, end);
+}
+
+function clockBlock(src, file) {
+  var marker = '// ---- clock (issue 051)';
+  var start = src.indexOf(marker);
+  assert.ok(start !== -1, file + ': clock marker present');
+  var end = src.indexOf('// ---- ', start + marker.length);
+  assert.ok(end !== -1, file + ': clock block bounded by the next section marker');
+  return src.slice(start, end);
+}
+
+// the time entries embed NEXT_ARROW; the harness executes its declaration too
+function appArrowStmt() {
+  var start = APP_SRC.indexOf('var NEXT_ARROW =');
+  var end = APP_SRC.indexOf('</svg>\';', start);
+  assert.ok(start !== -1 && end !== -1, 'NEXT_ARROW bounds');
+  return APP_SRC.slice(start, end + '</svg>\';'.length);
+}
+
+// ---- element + document stubs -------------------------------------------------
+
+function makeClassList(el) {
+  function toks() { return el.className ? el.className.split(' ') : []; }
+  return {
+    add: function (c) {
+      var t = toks();
+      if (t.indexOf(c) === -1) el.className = t.concat(c).join(' ');
+    },
+    remove: function (c) {
+      el.className = toks().filter(function (t) { return t !== c; }).join(' ');
+    },
+    toggle: function (c, force) {
+      var has = toks().indexOf(c) !== -1;
+      var want = force === undefined ? !has : !!force;
+      if (want && !has) this.add(c);
+      if (!want && has) this.remove(c);
+    },
+    contains: function (c) { return toks().indexOf(c) !== -1; }
+  };
+}
+
+function makeEl(offsets) {
+  var el = {
+    dataset: {},
+    className: '',
+    textContent: '',
+    innerHTML: '',
+    onclick: null,
+    hidden: false,
+    offsetTop: offsets.n++,
+    children: []
+  };
+  el.classList = makeClassList(el);
+  return el;
+}
+
+function makeUl(offsets) {
+  var el = makeEl(offsets);
+  var html = '';
+  Object.defineProperty(el, 'innerHTML', {
+    get: function () { return html; },
+    set: function (v) { html = v; if (v === '') el.children = []; }
+  });
+  el.writes = 0;
+  el.appendChild = function (child) { el.children.push(child); el.writes++; };
+  el.querySelectorAll = function (sel) {
+    if (sel === 'li[data-day]')
+      return el.children.filter(function (c) { return c.dataset && c.dataset.day !== undefined; });
+    if (sel === 'li.active')
+      return el.children.filter(function (c) { return c.classList.contains('active'); });
+    return [];
+  };
+  el.querySelector = function (sel) { return el.querySelectorAll(sel)[0] || null; };
+  return el;
+}
+
+// One init per harness: the real initTimePage slice runs against the stub
+// document; the clock subscriber is captured so tests can drive hits.
+function initTimeAt(clockMs) {
+  var offsets = { n: 1 };
+  var ul = makeUl(offsets);
+  ul.offsetTop = 0;
+  var detail = { innerHTML: '' };
+  var status = { textContent: '' };
+  var byId = { slotList: ul, detail: detail, status: status };
+  var subscribed = null;
+  var sandbox = {
+    console: console,
+    model: model, color: color, C: color.CLASSES, esc: data.esc,
+    store: store, modelObjs: modelObjs,
+    document: {
+      createElement: function () { return makeEl(offsets); },
+      getElementById: function (id) { return byId[id] || null; },
+      addEventListener: function () {},
+      hidden: false
+    },
+    clock: { subscribe: function (fn) { subscribed = fn; } },
+    Date: function () { return new RealDate(clockMs); }
+  };
+  vm.createContext(sandbox);
+  vm.runInContext(appArrowStmt() + '\n' + timeSlice() + '\ninitTimePage(store, modelObjs);', sandbox,
+    { filename: 'time-live-harness' });
+  assert.ok(subscribed, 'the time page subscribes to the clock');
+  return {
+    sandbox: sandbox, ul: ul, detail: detail, status: status,
+    tickTo: function (ms) { subscribed(new RealDate(ms)); },
+    children: function () { return ul.children; }
+  };
+}
+
+function entryAt(h, day, slot) {
+  return h.children().filter(function (c) {
+    return c.dataset.day === day && c.dataset.slot === slot;
+  })[0];
+}
+
+function bucketOf(h, day) {
+  return h.children().filter(function (c) {
+    return c.classList.contains('bucket') && c.textContent.indexOf(day + ' ') === 0;
+  })[0];
+}
+
+function hasTok(el, tok) { return el.className.split(' ').indexOf(tok) !== -1; }
+
+// ---- structural pins -----------------------------------------------------------
+
+test('js/app.js drives the time page from one clock and leaves the matrix time-blind (issue 051)', function () {
+  var head = APP_SRC.slice(0, APP_SRC.indexOf('function initTimePage'));
+  ['// ---- clock (issue 051)', 'subscribe: function (fn)', 'subs.indexOf(fn) === -1',
+   'setInterval(tick, 30000)', 'visibilitychange', 'document.hidden'].forEach(function (tok) {
+    assert.ok(head.indexOf(tok) !== -1, 'shared head: ' + tok);
+  });
+  assert.strictEqual(count(APP_SRC, 'new Date()'), 2, 'init capture + the clock tick');
+  assert.strictEqual(count(APP_SRC, "addEventListener('visibilitychange'"), 1,
+    'one tab-return catch-up listener');
+  var slice = timeSlice();
+  assert.ok(slice.indexOf('function renderSlotList()') !== -1, 'the slot list has one producer');
+  assert.ok(slice.indexOf('function onTick(') !== -1, 'the page subscriber exists');
+  assert.ok(slice.indexOf('clock.subscribe(onTick);') !== -1, 'the page subscribes at init');
+  assert.strictEqual(count(slice, 'scrollTop'), 1, 'the boot auto-scroll is the only scroll write');
+  assert.ok(slice.indexOf('listKey') === -1 && slice.indexOf('lastListKey') === -1,
+    'no gating state on the time page');
+  var matrix = matrixSlice();
+  assert.ok(matrix.indexOf('setInterval') === -1 && matrix.indexOf('new Date') === -1,
+    'the matrix page runs no timer and reads no clock');
+});
+
+test('the clock module is byte-identical in all three page files (issue 051)', function () {
+  var classesClock = clockBlock(CLASSES_JS, 'js/classes.js');
+  var teachersClock = clockBlock(TEACHERS_JS, 'js/teachers.js');
+  var appClock = clockBlock(APP_SRC, 'js/app.js');
+  assert.strictEqual(classesClock, teachersClock, 'classes/teachers clock drift');
+  assert.strictEqual(teachersClock, appClock, 'teachers/app clock drift');
+});
+
+// ---- behavioral battery ---------------------------------------------------------
+
+test('the time page opens from the page clock and re-renders on every tick (issue 051)', function () {
+  var h = initTimeAt(at(14, 10, 30).getTime());
+  assert.strictEqual(h.children().length, 42, '6 days x (1 bucket + 6 entries)');
+  var nowEntry = entryAt(h, 'MERCREDI', '10h00-11h30');
+  assert.ok(hasTok(nowEntry, color.CLASSES.now), '10h00-11h30 is NOW');
+  assert.ok(nowEntry.innerHTML.indexOf('nowtag') !== -1, 'NOW tag rendered');
+  var nextEntry = entryAt(h, 'MERCREDI', '11h40-13h10');
+  assert.ok(hasTok(nextEntry, color.CLASSES.next), '11h40-13h10 is NEXT');
+  var mb = bucketOf(h, 'MERCREDI');
+  assert.strictEqual(mb.textContent, 'MERCREDI (today) (216)');
+  assert.ok(hasTok(mb, color.CLASSES.today), 'the today bucket is marked');
+  assert.ok(h.ul.scrollTop > 0 && h.ul.scrollTop === mb.offsetTop, 'the boot auto-scroll ran');
+  var w0 = h.ul.writes;
+  h.tickTo(at(14, 12, 0).getTime());
+  assert.ok(h.ul.writes > w0, 'the slot-boundary tick rebuilt the list');
+  assert.ok(hasTok(entryAt(h, 'MERCREDI', '11h40-13h10'), color.CLASSES.now), 'NOW moved');
+  assert.ok(hasTok(entryAt(h, 'MERCREDI', '13h20-14h50'), color.CLASSES.next), 'NEXT moved');
+  assert.ok(hasTok(bucketOf(h, 'MERCREDI'), color.CLASSES.today), 'still the today bucket');
+  var w1 = h.ul.writes;
+  h.tickTo(at(14, 12, 20).getTime());
+  assert.ok(h.ul.writes > w1, 'a same-state tick re-renders on the hit, not on a diff');
+});
+
+test('the day-over line appears on the evening tick (issue 051)', function () {
+  var h = initTimeAt(at(14, 10, 30).getTime());
+  h.tickTo(at(14, 18, 30).getTime());
+  assert.strictEqual(h.children().length, 43, '42 rows + the day-over line');
+  var nowCount = h.children().filter(function (c) { return hasTok(c, color.CLASSES.now); }).length;
+  assert.strictEqual(nowCount, 0, 'nothing is NOW after the day');
+  var over = h.children().filter(function (c) {
+    return c.textContent === 'Day over — no more sessions today.';
+  });
+  assert.strictEqual(over.length, 1, 'exactly one day-over line');
+  assert.strictEqual(over[0].className, 'info');
+  var mb = bucketOf(h, 'MERCREDI');
+  assert.ok(mb.textContent.indexOf('MERCREDI (today)') === 0, 'the bucket still says today');
+  assert.ok(hasTok(mb, color.CLASSES.today));
+});
+
+test('midnight moves the today bucket and keeps the selected slot (issue 051)', function () {
+  var h = initTimeAt(at(14, 10, 30).getTime());
+  var slotEntry = entryAt(h, 'VENDREDI', '10h00-11h30');
+  assert.ok(slotEntry.onclick, 'the entry exposes its click');
+  slotEntry.onclick(); // the real show(): slot table + active mark
+  assert.ok(h.detail.innerHTML.indexOf('<table>') !== -1, 'show() wrote the slot table');
+  assert.ok(hasTok(entryAt(h, 'VENDREDI', '10h00-11h30'), color.CLASSES.active),
+    'the selection is marked');
+  h.tickTo(at(15, 9, 0).getTime());
+  var jb = bucketOf(h, 'JEUDI');
+  assert.ok(jb.textContent.indexOf('JEUDI (today)') === 0, 'the today bucket moved to Thursday');
+  assert.ok(hasTok(jb, color.CLASSES.today));
+  assert.ok(hasTok(bucketOf(h, 'MERCREDI'), color.CLASSES.dim), 'yesterday dims');
+  assert.ok(hasTok(entryAt(h, 'JEUDI', '08h15-09h45'), color.CLASSES.now),
+    'Thursday 08h15 is NOW');
+  assert.ok(hasTok(entryAt(h, 'VENDREDI', '10h00-11h30'), color.CLASSES.active),
+    'the recreated entry carries the selection from state');
+  assert.ok(h.detail.innerHTML.indexOf('<table>') !== -1, 'the detail pane is untouched by the tick');
+});
+
+test('Sunday shows the no-sessions note with no today bucket (issue 051)', function () {
+  var h = initTimeAt(at(14, 10, 30).getTime());
+  h.tickTo(at(18, 10, 0).getTime());
+  assert.strictEqual(h.children().length, 43, '1 info row + 42 list rows');
+  assert.strictEqual(h.children()[0].className, 'info');
+  assert.strictEqual(h.children()[0].textContent, 'No sessions on Sunday — showing the full week.');
+  var buckets = h.children().filter(function (c) { return c.classList.contains('bucket'); });
+  assert.strictEqual(buckets.length, 6, 'six day buckets, none today');
+  buckets.forEach(function (b) {
+    assert.ok(b.textContent.indexOf('(today)') === -1, 'no today bucket on Sunday');
+  });
+  var marked = h.children().filter(function (c) {
+    return [color.CLASSES.now, color.CLASSES.next, color.CLASSES.dim].some(function (tok) {
+      return hasTok(c, tok);
+    });
+  });
+  assert.strictEqual(marked.length, 0, 'no now/next/dim marks on Sunday');
+});
```

### Integration fix (2026-10-19)

Main agent, during merge review of the #051 × #056 overlap (this branch carries
#056). The Implementer reported: `#overlayClear` (the state=teacher deselect X)
calls `showEmpty()` without dropping `currentTeacher`, so the next tick's
`if (currentTeacher) showTeacher(currentTeacher, t)` painted the teacher back
over the "No Teacher Selected" page — reproduced live in Chromium pre-fix.
Criterion 21.5's pin of exactly 3 `currentTeacher = null;` sites is what made
this a cross-issue call (a 4th site would have broken the pin), so it is fixed
here as the merger's integration correction:

- **At the funnel, not the call site.** `showEmpty()` is by construction the
  only path to the empty state (four callers: `onInput`, `commit`, boot,
  `#overlayClear`), so it now drops ownership itself; the two redundant
  pre-nulls (`onInput`'s empty branch, `commit`'s empty branch) are removed —
  a future deselect path can no longer forget the way `#overlayClear` did.
- The `commit` nomatch branch keeps its own null: it never reaches
  `showEmpty` (the detail shows the nomatch sentence, not the empty page).
- Pin updated in `test/teacher-daygroups.test.js`: count 3 → 2 with the
  message "the empty funnel and the nomatch branch drop ownership", plus a
  direct slice pin that `showEmpty`'s body contains the null.
- `node --test` → **119/119/0** (unchanged in count). Browser re-check:
  select → overlay X → `page.clock` fastForward leaves the empty page
  standing; a tick with a selected teacher still repaints live.

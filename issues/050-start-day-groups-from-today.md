# 050: Start the day-group listing from today on the classes and teachers pages

- Status: Fixed
- Date: 2026-10-17, Reporter: user

## Description

Naming (verified): the **teachers** page file is `index.html` (its `<title>` is
"Teachers — Emplois", `body data-page="teachers"`, it loads `js/teachers.js`,
`index.html:6/31/60`); there is no `teachers.html`. The **classes** page is
`classes.html` (`body data-page="classes"`, loads `js/classes.js`).

On both pages a class's / teacher's week is listed as a **day-group** sequence —
one `h3.day-head` heading followed by one `section.day-group` holding a session
table. This is a **single emission rendered on every viewport**: desktop shows it
as tables (`#detail .day-group table` in the desktop block, `styles.css:434-448`),
narrow screens shape the same markup into cards (`#detail .day-group` in the
narrow block; pinned by `test/teacher-daygroups.test.js:322-339`). So one change
covers both the desktop tables and the mobile cards.

### Observed

Both pages list the days **Monday-first, always, regardless of the current day or
time**. Verified in a real Chrome window at 1024×800 on Saturday 2026-10-17
15:26 CET (a mid-session moment — the clock sits inside the `15h00-16h30` slot):

- **classes.html**, class `GLSI3D1` selected: `#detail` has 15 element children;
  the `h3.day-head` order is `lundi, mardi, mercredi, jeudi, vendredi, samedi`
  (then the `WHOLE WEEK` label with class `day-head week-head`). All six
  `section.day-group` carry `dim` (`day-group dim`) and hold no NOW/NEXT tag —
  `GLSI3D1`'s only Saturday session is `08h15-09h45`, which ended at 09:45, so at
  15:26 nothing of today is live. The whole-week grid's `th.c-day` columns are
  `lundi…samedi` Monday-first with `samedi` carrying `c-day today`, and
  `div.cursor` is shown (style `display:""`). **The first heading is `lundi`,
  i.e. the week restarts at Monday even though today is Saturday.**
- **index.html** (teachers), teacher `Bannour` selected: the `h3.day-head` order
  is `lundi, mardi, mercredi, vendredi, samedi` (no `jeudi` — she does not teach
  Thursday). The `NEXT` tag sits on `lundi 08h15-09h45` (the teachers page marks
  the *wrapping* next session via `model.nextSessionIdx`, `js/teachers.js:270`),
  so the `lundi` section is not dim while `mardi/mercredi/vendredi/samedi` are
  `day-group dim`. **Again Monday-first even though the next upcoming teaching
  day is already known and is `lundi` only by coincidence here.**

**Audit re-verification (2026-10-18 ~13:55 CET — a Sunday):** both pages were
re-opened in a real browser (Playwright Chromium, 1024×800) and the recorded
states reproduced: **classes** `GLSI3D1` — `#detail` 15 element children,
heading order `lundi, mardi, mercredi, jeudi, vendredi, samedi` + `WHOLE WEEK`,
all six `section.day-group` `day-group dim`, no NOW/NEXT; **teachers**
`Bannour` — heading order `lundi, mardi, mercredi, vendredi, samedi`, `NEXT` on
`lundi 08h15-09h45`, `lundi` not dim, the other four `day-group dim`. The two
Saturday-clock grid claims above (`samedi` carrying `c-day today`, `div.cursor`
shown) are not re-observable on a Sunday — `dayCursor` is invisible on Sunday
(`{phase:'sunday', visible:false}`, observed), so no column gets `today` and
the cursor renders `style="display:none"` (observed) — so they were re-derived
at the recorded clock by driving the real emission in node with a stubbed
clock (the AGENTS.md standard): `dayCursor(Sat 2026-10-17 15:26)` →
`{today:'SAMEDI', visible:true, phase:'during', cur:'15h00-16h30',
next:'16h45-18h15'}`, which makes `js/classes.js:282-283` mark the `samedi`
column `today` and `:310-312` emit the cursor with no `display:none`
(`style.display === ""`); the same harness renders GLSI3D1's six headings with
6/6 sections dim and 0 NOW/NEXT, matching the recorded observation.

The defect is *not* always visible on a Saturday because a forward roll from
Saturday wraps to Monday, which coincides with Monday-first. Driving the real
emission blocks in node with a stubbed clock (the AGENTS.md verification
standard) shows the current order never changes while the expected order does:

| Scenario (stubbed clock) | current heading order | expected start-from-today |
|---|---|---|
| GLSI3D1 @ Sat 10-17 15:26 (Sat session already ended 09:45) | lundi…samedi | lundi…samedi (coincides) |
| GLSI3D1 @ Fri 10-16 18:30 (Fri evening; class meets Sat) | lundi…samedi | **samedi** > lundi… |
| GLSI3D1 @ Sun 10-11 10:00 (no school) | lundi…samedi | lundi…samedi (coincides) |
| GLSI3D1 @ Tue 10-13 09:00 (Tue has sessions) | lundi…samedi | **mardi** > mercredi… > lundi |
| SD1 @ Tue 10-13 09:00 (meets Mon/Wed/Thu/Fri/Sat, **no Tuesday**) | lundi, mercredi… | **mercredi** > jeudi… > lundi |
| GLSI3D1 @ Thu 10-15 15:30 (Thu `15h00-16h30` **in progress**) | lundi…samedi | **jeudi** > vendredi… > lundi |
| GLSI3D1 @ Sat 10-17 09:00 (Sat `08h15-09:45` **in progress**) | lundi…samedi | **samedi** > lundi… |
| TEACHER Dlima @ Fri 10-16 12:00 (Fri in progress) | mardi…vendredi | **vendredi** > mardi… |
| TEACHER Barboura @ Sat 10-17 15:26 (teaches Thu/Fri/Sat; Sat ended) | jeudi…samedi | jeudi…samedi (coincides) |
| TEACHER Abdelhafidh @ Sat 10-17 15:26 (teaches Tue/Wed only) | mardi, mercredi | mardi, mercredi (coincides) |

### Expected

The **day-group listing starts from today** and the remaining days follow in
cyclic order. Binding rules as pinned by the user:

**Classes page** (the `h3.day-head` + `section.day-group` tables/cards — the same
emission above):

1. Anchor = today; the day list is a **cyclic rotation** of the days the class
   actually meets, starting at the anchor.
2. **Sunday** (no school): start Monday (the first day with sessions after
   Sunday).
3. **Last day of the week (Saturday)** and the class's last session already
   finished: start Monday.
4. If today has **no sessions** for the class at all (class meets Mon/Wed/Fri and
   it is Tuesday): start from the **next day with sessions**, cyclically forward.
5. If today's sessions have **all ended** on an ordinary weekday (Friday 18:30):
   **roll forward** to the next day with sessions (Friday evening → Saturday
   first when the class meets Saturday) — the user explicitly generalizes the
   roll-forward beyond the two named edge cases.
   → **Unified**: today first **iff** today still has a session **not yet ended**
   (an in-progress session counts as not yet ended); otherwise the next cyclic
   day that has any session.
6. **The whole-week grid (`div.weekwrap` / `table.week`, days as columns, under
   the `WHOLE WEEK` heading) stays Monday-first everywhere** — explicitly
   answered by the user. Only the day-group tables/cards rotate.

**Teachers page** (`index.html`):

7. Same idea, but the first element of the sorted day list is "the most relevant
   day from a student's perspective asking *when can I meet this teacher?*" =
   **the next upcoming teaching day**: today if the teacher still teaches later
   today (or a session is in progress), otherwise the next school day they teach —
   skipping Sunday, wrapping past Saturday to Monday. The remaining days follow in
   cyclic order after it.

### SA/SB week alternation (verified finding)

The CSV has a `week` column (`SA`/`SB` = alternating weeks, empty = every week).
**No page filters sessions by the current SA/SB week when rendering the day
groups — week is a display label only, and on the classes path it is dropped
entirely.** Verified:

- `js/data.js:42-76` `createStore` applies no week filter; `week` is just a row
  field.
- `model.classWeek` (`js/model.js:357-401`) does **not** even copy `s.week` into
  its output rows (`:385-387`) — the classes path never sees a week value.
- `model.fuseSessions` (`js/model.js:262-321`) only *aggregates* week into a
  display `week` label on merged rows (`:308-316`); it never filters.
- `js/teachers.js:263` `showTeacher` fuses every session and iterates all of
  them (`:273-308`), never reading `s.week`.
- `js/classes.js:217-319` `renderWeek` iterates `week.sessions` — no week field.

Consequence: the anchor rule (1–7) must be computed from the **displayed**
sessions regardless of SA/SB, exactly as the listing already shows them.

## Root cause

The day-group emission builds its day order as the **first-seen order over
already-Monday-first-sorted sessions** and never rotates it:

- **classes** — `js/classes.js`: the comment "one section per non-empty day,
  Monday-first … first-seen day order is the week order" (`:256-257`), then
  `var dayOrder = []` (`:258`), `var byDay = {}` (`:259`), the grouping
  `week.sessions.forEach` (`:260-263`), and the emit loop `dayOrder.forEach`
  (`:264-273`; heading `:265`, section `:266`, table header `:267-268`, rows
  `:269-271`, close `:272`). `week.sessions` comes from `model.classWeek`,
  sorted by `cmpSession` (`js/model.js:390-397` → `:323-326`), which orders by
  `DAYS.indexOf` = the fixed Monday-first `DAYS` of `js/data.js:7`; so `dayOrder`
  is always `LUNDI…SAMEDI` restricted to non-empty days, in that order.
- **teachers** — `js/teachers.js`: identical shape. Comment "one section per
  non-empty day, Monday-first … first-seen day order is the week order"
  (`:277-278`), `var dayOrder = []` (`:279`), `var byDay = {}` (`:280`), the
  grouping `ss.forEach` (`:281-284`), and the emit loop `dayOrder.forEach`
  (`:285-308`; heading `:286`, section `:287`, table header `:288`, rows
  `:289-306`, close `:307`). `ss` comes from `model.fuseSessions`, whose output
  is sorted by `cmpFusedSession` (`js/model.js:320` → `:330-341` → `cmpSession`),
  again Monday-first.

**Which days appear**: only **non-empty** days — a day with no sessions gets no
heading and no section (pinned by `test/classes.test.js:710-716` — section
count `:710-711`, no heading for an empty day `:712-716` — and
`test/teacher-daygroups.test.js:193-199` — section count `:193-194`, no
heading `:195-199`). **Nothing rotates day order anywhere**
today. (A rotation helper `orderedDays` once existed for the classes *grid* on
narrow screens — issue 046 added it, and issue 047 **removed** it,
`test/classes.test.js:525` pins `orderedDays === -1` — which is why the current
code is Monday-first by construction.)

The grid that must **stay** Monday-first iterates `store.days` directly:
`js/classes.js:281` (header `th.c-day`) and `js/classes.js:290` (cell loop);
`store.days` is the fixed `DAYS` array (`js/data.js:60`), and
`test/classes.test.js:546` pins `store.days.forEach`. Rules 1–7 touch only the
`dayOrder` emission, not these loops.

The natural home for an anchor/rotation helper is the pure schedule-helpers
section of `js/model.js` (injectable `now`, unit-testable against the real CSV),
beside the existing `dayCursor` (`js/model.js:436-461`, which already models
today / Sunday / before / during / after phases via its `today`, `isSunday`,
`phase` and `visible` fields) and `nextKey` / `nextSessionIdx`
(`js/model.js:465-482`, minutes to a session's next occurrence, wrapping weekly —
already used by the teachers page at `js/teachers.js:270`).

### Tests that pin Monday-first day order (a fix must revisit)

- `test/classes.test.js:700-709` — `checkClassesInvariants`: `wantHeads =
  distinct.map(frDay)` then `assert.deepStrictEqual(heads, wantHeads, key + ':
  one h3 per distinct day, Monday-first')` (`:705-706`) **and**
  `assert.deepStrictEqual(distinct, main(store.days).filter(…), key + ': day
  order is the Monday-first store order')` (`:707-709`). Run at Fri 12:00
  (`:777`) and Sun 10:00 (`:783`).
- `test/classes.test.js:723-727` — each day's heading must immediately precede
  its section (adjacency, order-independent but grouped).
- `test/classes.test.js:572` — `dayOrder.forEach` must exist ("first-seen day
  grouping"); `:825-828` — `var byDay = {};` (`:825`), `var dayOrder = [];`
  (`:826`) each exactly once and `dayOrder.forEach` exactly once (`:827-828`).
- `test/classes.test.js:546` — grid must keep iterating `store.days` (Monday-
  first grid).
- `test/teacher-daygroups.test.js:187-192` — `assert.deepStrictEqual(heads,
  wantHeads, name + ': one h3 per distinct day, Monday-first')` where `wantHeads`
  is the first-seen order over the fused `ss`; `:206-211` heading adjacency and
  exactly one heading per distinct day. Run for `Barboura` @ Fri 12:00 (`:264`),
  `Dlima` @ Fri 12:00 (`:272`), `Barboura` @ Sun 10:00 (`:279`).

### Clock scenarios a fix must cover (node, stubbed clock — AGENTS.md standard)

1. **Sunday** (no school) → start Monday.
2. **Saturday 18:30** / after the last slot → Saturday's sessions ended → start
   Monday (wrap).
3. **Weekday 18:30** (Friday 18:30) → today ended; class meets Saturday →
   Saturday first (roll forward).
4. **Tuesday 09:00** for a class with no Tuesday sessions → next day with
   sessions (Wednesday).
5. **In-progress session** (Thu 15:30, Sat 09:00) → today first.
6. **Slot gap** (e.g. Sat 09:50 — `cursor.cur` null but `cursor.next` set) and
   the **before** phase (Mon 07:00 — today's sessions all still ahead → today
   first). The existing `dayCursor` boundary tests
   (`test/classes.test.js:185-278`) already pin Sunday/before/after/gap/frac and
   can be reused.

## Repro steps

Commands (from the worktree root
`/home/user/.local/share/opencode/worktree/1de5bb/050-today-first`):

```
python3 -m http.server 8000
node --test                 # baseline: 97 tests, 97 pass, 0 fail
curl -s -o /dev/null -w '%{http_code}' http://localhost:8000/classes.html   # 200
curl -s -o /dev/null -w '%{http_code}' http://localhost:8000/index.html     # 200
```

URLs + clicks (observed 2026-10-17 ~15:26 CET, a Saturday inside the
`15h00-16h30` slot):

1. **Classes** — open http://localhost:8000/classes.html at 1024×800, type
   `GLSI` in "Search class (LCS, GLSI3D1…)", click `GLSI3D1 — LCS3-GLSI_D
   Groupe 1`. Observed: heading order `lundi, mardi, mercredi, jeudi, vendredi,
   samedi` (then `WHOLE WEEK`); all six `section.day-group` are `day-group dim`
   with no NOW/NEXT (GLSI3D1's only Saturday session ended 09:45); grid `th.c-day`
   Monday-first with `samedi` marked `today`; cursor shown. Expected: since
   today (Saturday) has no live session, the list still starts at the first day
   with sessions — here `lundi` by coincidence; on a Friday evening it must start
   at `samedi` (rule 5).
2. **Teachers** — open http://localhost:8000/index.html at 1024×800, type
   `Bannour`, let the single result auto-open. Observed: heading order `lundi,
   mardi, mercredi, vendredi, samedi`; `NEXT` on `lundi 08h15-09h45` (wrapping
   next session), `lundi` section not dim, the rest `day-group dim`. Expected:
   the first heading is the next upcoming teaching day (`lundi` here only because
   the roll-forward from Saturday wraps to Monday; e.g. teacher `Dlima` at Fri
   12:00 must start at `vendredi`, not `mardi`).
3. **Audit re-run (2026-10-18, Sunday ~13:55 CET)** — repeat steps 1-2; both
   pages reproduce the heading orders and dim/NEXT states recorded above
   (browser re-observation succeeded). On a Sunday the grid has no `today`
   column and the cursor is `display:none` (`dayCursor` invisible on Sunday),
   so the Saturday-specific `c-day today` and cursor-shown claims were verified
   with the node stubbed-clock harness instead (see Observed).

## Discussion

### Maintainer decision (2026-10-18)

Round 1 — final decision, no outstanding requests; the Implementer may act on
the criteria below. I re-verified the Reporter's analysis directly against the
post-`c03cf19` tree (emission sites `js/classes.js:256-273`,
`js/teachers.js:277-308`, the pure helpers in `js/model.js:403-498`, every
pinned test range cited in the Root cause, and the baseline of 97/97 passing
tests); it is accurate as written. I also drove the proposed anchor rule in
node against the real CSV at every clock in the issue's scenario table and it
reproduces all ten expected orders, including the three "coincides" rows.

**Verdict**

- **VALID, in scope, as requested.** Rules 1–7 are binding user decisions
  (pinned through direct clarification); the defect is real (first-seen day
  order over Monday-first-sorted sessions, never rotated — verified at
  `js/classes.js:256-263` and `js/teachers.js:277-284`), and the fix touches
  exactly the day-group emission both pages already share in shape.
- *Rules 1–5 and rule 7 are ONE rule, not two.* Rule 5's unified statement
  ("today first iff today still has a session not yet ended, an in-progress
  session counts") and rule 7's teacher phrasing ("today if the teacher still
  teaches later today or a session is in progress, otherwise the next school
  day they teach") are the same predicate: "a session ends after now"
  ⟺ "it is in progress or starts later today", and "the next school day they
  teach" ⟺ "the next cyclic day that has any session". Only the input rows
  differ (`week.sessions` vs fused `ss`), and both are `{day, time}`-shaped.
  A single implementation is the enforceable expression of that unification —
  two page-local copies would be free to drift apart.
- *The 047 / `orderedDays` pin question (asked explicitly).* Issue 047 removed
  a *viewport-gated grid column rotation* (`isNarrow()`/`orderedDays()`,
  issues/047:37) and `test/classes.test.js:525` pins
  `sec.indexOf('orderedDays') === -1` over the classes page source. **This fix
  does not trip that pin, and the pin stays byte-identical.** Three reasons,
  stated honestly: (a) the new helper lives in `js/model.js` and is called as
  `model.startFromToday(…)`, so the substring `orderedDays` never occurs in
  `js/classes.js`; the pin is identifier-keyed and keeps guarding exactly what
  047 retired; (b) the pin's *intent* — no JS-side viewport gate
  (`isNarrow`, separately pinned at `:526`) and no rotation of the *grid* —
  is fully preserved: the grid loops still iterate the fixed `store.days`
  (`js/classes.js:281,290`, pinned at `:546`), and the rotation mandated here
  applies only to the day-group listing, on every viewport; (c) 050 is a
  later, explicit user decision that *mandates* an ungated rotation of a
  different surface, so reintroducing rotation there is compliance, not
  regression. To make the intent positively pinned instead of relying on a
  name accident, criterion 17 adds one absence assert over the grid block
  (`startFromToday` must not appear after the `<div class="weekwrap">`
  marker). Naming the helper `orderedDays` would rightly trip :525 — the name
  is load-bearing and stays off the table.
- *Docs.* Out of scope, consistent with the 049 precedent (its docs verdict,
  issues/049:183-186). Verified: `Design.md`'s Teachers service text says only
  "sessions grouped by day" (`Design.md:161`) — still true after the change;
  the Classes service text (`Design.md:175-187`) describes only the whole-week
  grid and makes no day-group or ordering claim (it was already stale w.r.t.
  047/049 — pre-existing drift, actionable separately, not made worse here);
  no `index.html`/`classes.html` meta text mentions ordering (grep-verified).
  Zero diff to all three.
- *Empty selection is unreachable*, so no page-side fallback is needed:
  verified against the real CSV that all 94 leaves resolve to ≥1 placeable
  session and every teacher in `store.teachers` derives from sessions. The
  helper still degrades gracefully (empty list / no anchor → input order
  unchanged) as a pure-function contract, with a pin (criterion 12), but no
  `if` is added to either page.

**Architectural direction**

1. *One shared pure helper in the model layer.* `js/model.js`'s
   schedule-helpers section (the issue's own pointer) is the home: both page
   files delegate all domain logic to `TT.model` by design ("All domain data
   through TT.model. This file owns DOM only" — identical headers,
   `js/classes.js:1-6`, `js/teachers.js:1-6`), the anchor is schedule
   semantics (not DOM), and a pure function with injectable `now` is the
   house verification standard (it composes the already-in-scope `DAYS`,
   `JS_DAY`/`DAY_IDX`, `slotMinutes` — `js/model.js:11,405-406,414-417`).
2. *Helper shape — two functions, one export*, inserted in the schedule
   helpers after `availability` (ends `js/model.js:498`) and before the
   `// ---- teacher summary sentence` divider (`:500`):

   ```js
   // Issue 050: start-from-today day lists for the day-group listings.
   // `anchorDay` is the unified rule: `today` iff some session today still
   // has an end after `now` (an in-progress session counts); otherwise the
   // first day, scanning forward cyclically through DAYS from the day after
   // today, that has any session. Sunday is not in DAYS and never has
   // sessions, so a Sunday (or post-Saturday) wrap lands on LUNDI. Never
   // DIMANCHE; null for an empty session list.
   function anchorDay(sessions, now) {
     now = now || new Date();
     var mins = now.getHours() * 60 + now.getMinutes();
     var today = JS_DAY[now.getDay()];
     var ss = sessions || [];
     if (ss.some(function (s) {
       return s.day === today && slotMinutes(s.time)[1] > mins;
     })) return today;
     var start = DAY_IDX[today]; // undefined on Sunday
     for (var k = 1; k <= 6; k++) {
       var d = DAYS[(((start + k) % 6) + 6) % 6];
       if (ss.some(function (s) { return s.day === d; })) return d;
     }
     return null;
   }

   // Rotate a Monday-first distinct-day list so the listing starts at the
   // anchor day (see anchorDay). Pure: the input is never mutated; an empty
   // list or a null anchor returns the days unchanged.
   function startFromToday(days, sessions, now) {
     var a = anchorDay(sessions, now);
     if (a === null) return days.slice();
     var i = days.indexOf(a);
     if (i <= 0) return days.slice();
     return days.slice(i).concat(days.slice(0, i));
   }
   ```

   Export ONLY `startFromToday` (add it to the return object beside
   `availability`, `js/model.js:575`). `anchorDay` stays module-private: no
   consumer needs the bare anchor, and the rule is fully pinnable through
   `startFromToday` with two-line synthetic fixtures (criterion 12) — a
   minimal API surface beats a second export used only by tests. The first
   parameter is the page-built distinct-day list (not the raw sessions) so
   the helper is a single-responsibility rotation and each page keeps its
   pinned grouping pass; the sessions parameter exists only to find the
   anchor. The `(days, time)`-only contract serves both row shapes
   (`classWeek` rows have no `week` field; fused rows carry a display-only
   one) — SA/SB is provably irrelevant (issue Root cause, re-verified).
3. *Rejected alternatives*: (a) **extending `dayCursor`** (`js/model.js:436-461`)
   — dayCursor is a clock over the *school day* (now + slot table), pinned
   wide by boundary tests (`test/classes.test.js:185-278`) and by the grid;
   the anchor is a function of *this entity's* sessions, not of the clock
   alone: at Sat 15:26 dayCursor is `during` but a morning-only class must
   still roll to Monday, so phases add nothing and a `sessions` argument
   would break dayCursor's pinned contract for a second job — keep the two
   orthogonal; (b) **per-page logic** — duplication invites the two pages'
   rules to drift, and the user pinned a *unified* rule plus "same mechanics"
  for teachers, which one shared implementation actually enforces; (c)
   **a helper that returns the distinct days straight from sessions** —
   would duplicate/group sessions inside the model and fight the pinned
   `var dayOrder`/`var byDay`/`dayOrder.forEach` page structure
   (`test/classes.test.js:825-828`).
4. *Exact anchor semantics* (one rule, both pages), all re-verified by driving
   the real data through the sketched helper:
   - today has a session whose end is strictly after `now` → today first
     (covers **before** (Mon 07:00 → lundi), **in-progress** (Thu 15:30 →
     jeudi; Sat 09:00 → samedi), **slot gap with a later session today**
     (Thu 09:50 → jeudi), and **later-today** (GLSI3D1 Tue 09:00, first
     class 10h00 → mardi)); an in-progress session counts because its *end*
     is after now — the predicate is `slotMinutes(s.time)[1] > mins`, NOT
     "starts later";
   - otherwise scan forward cyclically over `DAYS` from the day after today,
     skipping Sunday by construction (it is not in `DAYS`), and pick the
     first day with any session: **weekday 18:30** (Fri 18:30, GLSI3D1 meets
     Saturday → samedi), **Saturday-after** (Sat 15:26 → lundi for GLSI3D1;
     wraps past Sunday), **Sunday** (→ lundi), **no sessions today**
     (SD1 Tue 09:00 → mercredi);
   - boundary: a session ending exactly at `now` counts as ended (strict
     `>`; Sat 18:15/18:30 → Monday);
   - anchor is always a day that has sessions, hence always in the page's
     distinct list; `startFromToday` is non-mutating and returns a fresh
     array.
5. *Exact DOM-emission change*: each page's day-group block gains ONE line
   between its grouping pass and its emit loop — the heading/section/table
   markup, `liveDays`/`dim`, the NOW/NEXT marking and the grid do not change:
   - `js/classes.js` (after the grouping loop at `:260-263`, before
     `dayOrder.forEach` at `:264`):
     `dayOrder = model.startFromToday(dayOrder, week.sessions, now);`
     (`now` is the page-level clock already used for `dayCursor`,
     `js/classes.js:56,218`); the "Monday-first" phrases in the day-group
     comments at `:225` and `:256` are rewritten to describe the
     cyclic-from-today order (they would otherwise lie).
   - `js/teachers.js` (after the grouping loop at `:281-284`, before
     `dayOrder.forEach` at `:285`):
     `dayOrder = model.startFromToday(dayOrder, ss, now2);`
     (`now2` is the clock already used for `upcoming`/`isCurrentSession`,
     `js/teachers.js:264,270,274,291`); the "Monday-first" comment at `:277`
     is rewritten likewise.
   - Nothing else in either page moves: the emit loops still walk
     `dayOrder.forEach`; the grid keeps iterating `store.days`
     (`js/classes.js:281,290`); `applyCursor`/`startCursor` are untouched.
6. *Remaining days follow cyclically* (anchor vendredi → vendredi, samedi,
   lundi…) — this falls out of rotating the distinct-day list; no consumer
   depends on Monday-first emission order: `liveDays` and the `dim` class are
   per-day lookups (`js/classes.js:232-236,266`; `js/teachers.js:272-276,287`),
   the per-section NOW/NEXT marking is per-session (`isCurrentSession` /
   `cursor.next` / `upcoming.has(entry.i)` — index-based into the *unrotated*
   `ss`, `js/teachers.js:270-275,289-292`), and the only equality pins on
   order are the two batteries' heading expectations (rewritten below). The
   CSS is order-agnostic: the only positional rules live *inside* a group
   (gutter `th/td:first-child`, `styles.css:438-439`; row dividers
   `.day-group tr:has(td) + tr:has(td)`, `:646`; tint bleed
   `:nth-child(2)`/`:last-child`, `:665-666`), `.day-head` has only the base
   rule (`:374-378`) and its narrow margin (`:636`), and `dim` keys on the
   section class (pinned by `test/teacher-daygroups.test.js:297`). No
   `h3 + section`, section-to-section or `:first-child`-of-`#detail` rule
   exists anywhere (grep-verified).
7. *Desktop vs narrow*: the day groups are a single emission rendered as
   tables (desktop) and cards (narrow) — the rotation therefore applies to
   both viewports automatically; zero CSS change, zero narrow-specific JS
   (the `isNarrow` prohibition at `test/classes.test.js:526` stands), and the
   whole-week grid plus its `today` column marking (`js/classes.js:281-294`,
   `applyCursor` `:324-359`) are untouched — rule 6.

**Acceptance criteria**

Model (`js/model.js`):

1. Insert `anchorDay` + `startFromToday` exactly per direction 2, between
   `availability` (ends `:498`) and the `// ---- teacher summary sentence`
   divider (`:500`); ES5 style consistent with the file; the internal cycle
   order is the module's own `DAYS`. Add `startFromToday: startFromToday,`
   to the return object (line with `availability: availability,`, `:575`).
   `anchorDay` is NOT exported. `dayCursor`, `nextKey`, `nextSessionIdx` and
   `availability` stay byte-identical.

Classes page (`js/classes.js`, `renderWeek` day-groups only):

2. Insert `dayOrder = model.startFromToday(dayOrder, week.sessions, now);`
   exactly once, between the `week.sessions.forEach` grouping loop and
   `dayOrder.forEach`. No other statement changes. The helper call must NOT
   be written as an iteration over `week.sessions` (the pin
   `count(slice, 'week.sessions.forEach') === 2` at
   `test/classes.test.js:822` must keep passing).
3. Rewrite the two day-group comments whose text says "Monday-first"
   (`:224-225` block comment and `:256-257` line comment) to describe the
   cyclic-from-today order (issue 050), keeping their load-bearing literals.
   No other comment changes.

Teachers page (`js/teachers.js`, `showTeacher` day-groups only):

4. Insert `dayOrder = model.startFromToday(dayOrder, ss, now2);` exactly once,
   between the `ss.forEach` grouping loop and `dayOrder.forEach`. Nothing
   else changes: `upcoming`, `liveDays`, `byDay` entries `{s, i}`, the row
   markup and `breakdownHTML` stay byte-identical.
5. Rewrite the "Monday-first" phrase in the day-group comment (`:277-278`) to
   describe the cyclic-from-today order.

Tests (`test/classes.test.js`):

6. REWRITE the heading expectation in `checkClassesInvariants` (`:700-709`):
   after the `distinct` build add
   `var rotated = main(model.startFromToday(distinct, week.sessions, clock));`
   (the `main()` conversion is mandatory — the helper returns a model-realm
   array and `deepStrictEqual` compares prototypes, the same reason `main()`
   exists at `:44`); `wantHeads` becomes
   `rotated.map(function (d) { return model.frDay(d); })` (`:704`); the
   assertion message at `:706` becomes
   `key + ': one h3 per distinct day, start-from-today'`. KEEP the
   store-order data-layer pin at `:707-709` byte-identical (it asserts on
   the test-side `distinct`, which stays first-seen Monday-first over the
   sorted `week.sessions` — still true and now the guard that the *page*
   rotates while the *data layer* does not).
7. In the same function, switch the three section-indexed lookups
   `var day = distinct[gi]` → `var day = rotated[gi]` (`:752` NOW/NEXT loop,
   `:764` dim loop). Everything else in the battery stays byte-identical:
   section count (`:710-711`), empty-day no-heading checks (`:712-716`),
   heading-outside-section (`:719-722`), per-day adjacency (`:723-727`),
   row totals and column counts (`:738-747`), marker equality
   (`:759-760`), the `week-head`/`c-all` boundary pins (`:734-736`).
8. EXTEND the existing behavioral tests with explicit first-heading pins
   (parse with `classHeadingsOf(r.html)[0]`): `'GLSI3D1 at Fri 12:00 groups
   its week with live Friday markers'` (`:777`) asserts `heads[0] ===
   'vendredi'`; `'GLSI3D1 on Sunday morning dims every group with no
   markers'` (`:783`) asserts `heads[0] === 'lundi'`.
9. ADD four behavioral tests beside them, each running the full rewritten
   `checkClassesInvariants` at a stubbed clock (use the existing `at()`
   helper, `:183`) plus an explicit first-heading assert:
   - `'GLSI3D1 at Fri 18:30 rolls the day groups forward to Saturday'` —
     `checkClassesInvariants('GLSI3D1', at(16, 18, 30))`; `heads[0]` is
     `'samedi'`; no `nowtag`, no `nexttag` (cursor phase `after`).
   - `'GLSI3D1 at Thu 15:30 starts at Thursday (a session is in progress)'`
     — `at(15, 15, 30)`; `heads[0]` is `'jeudi'`; a `nowtag` is present.
   - `'GLSI3D1 at Sat 15:26 wraps the finished Saturday back to Monday'` —
     `at(17, 15, 26)`; `heads[0]` is `'lundi'`; no `nowtag` (its only
     Saturday session ended 09:45).
   - `'SD1 at Tue 09:00 starts at Wednesday (no Tuesday sessions)'` —
     `at(13, 9, 0)`; `heads` is exactly
     `['mercredi', 'jeudi', 'vendredi', 'samedi', 'lundi']`.
10. ADD the helper unit test, placed after the dayCursor block (after
    `:278`), named
    `'startFromToday rotates a day list per the unified anchor rule (issue 050)'`:
    synthetic `var days = ['LUNDI', 'MARDI', 'MERCREDI'];` and
    `var ss = [{ day: 'LUNDI', time: '08h15-09:45' }, { day: 'MERCREDI', time: '10h00-11:30' }];`
    with hand-written expectations (each result passed through `main()` and
    `deepStrictEqual` against a literal — no expectation may be computed via
    the helper itself): Mon 07:00 → lundi-first (before phase, today's
    sessions ahead); Mon 09:00 → lundi-first (in progress); Mon 09:45 →
    mardi... (session end == now counts as ended); Mon 09:50 →
    `['MERCREDI', 'LUNDI', 'MARDI']` (gap, today's only session ended →
    roll); Tue 09:00 → `['MERCREDI', 'LUNDI', 'MARDI']` (no sessions today);
    Fri 18:30 → lundi-first (weekday wrap); Sat 15:26 → lundi-first
    (Saturday wrap); Sun 10:00 → lundi-first (rule 2); plus degenerate
    pins: `startFromToday([], [], clock)` → `[]`, single-day list at a
    wrap-clock → unchanged, and the input array is not mutated.
11. EXTEND the structural test `'renderWeek emits day groups, then the
    WHOLE WEEK label, then the week grid'` (`:798`) with one rule-6 pin:
    in the `renderWeek` slice, the tail from
    `'<div class="weekwrap"><table class="week">'` to `'detail.innerHTML = h;'`
    must contain `store.days.forEach` twice and `startFromToday` zero times
    ("the whole-week grid stays Monday-first"). KEEP every other assert in
    that test byte-identical (`:813-835` — the `week.sessions.forEach` count
    of 2, the `byDay`/`dayOrder` exactly-once counts, the `nextSessionIdx(`
    absence and the sessionRow-helper placement).
12. KEEP byte-identical: the `orderedDays`/`isNarrow` absence pins
    (`:525-526` — see the verdict), the grid `store.days.forEach` pin
    (`:546` — together with the fixed `store.days` pinned at `:282-284` this
    is sufficient for rule 6; criterion 11 adds the direct absence pin), the
    `dayOrder.forEach` presence pin (`:572`), all dayCursor boundary tests
    (`:185-278`), and the harness plumbing (`classesListBlock()` bounds
    `:499-505`, `runClassesList` `:648-660` — the new line is vm-safe: the
    sandbox already provides `model`, `week` and `now`).

Tests (`test/teacher-daygroups.test.js`):

13. REWRITE the heading expectation in `checkInvariants` (`:187-199`) the same
    way: `var rotated = main(model.startFromToday(distinct, ss, clock));`
    after the `distinct` build; `wantHeads` from `rotated` (`:190`); message
    at `:192` becomes `name + ': one h3 per distinct day, start-from-today'`.
    Switch the two section-indexed lookups `var day = distinct[gi]` →
    `var day = rotated[gi]` (`:234` NOW/NEXT, `:246` dim). KEEP
    byte-identical: section count (`:193-194`), empty-day checks
    (`:195-199`), heading-outside-card (`:201-205`), per-day adjacency and
    exactly-one-heading (`:206-212`), marker equality (`:241-242`), the
    "day name exactly once" checks (`:255-258`).
14. EXTEND the three battery tests with explicit first-heading pins via
    `headingsOf(r.html)[0]`: Barboura Fri 12:00 (`:264`) → `'vendredi'`
    (its 11h40-13h10 is NOW); Dlima Fri 12:00 (`:272`) → `'vendredi'` (the
    issue's teacher rotation case: vendredi, mardi, mercredi, jeudi);
    Barboura Sun 10:00 (`:279`) → `'jeudi'` (Sunday wrap past the days she
    does not teach).
15. ADD one test beside them: `'Barboura at Sat 18:30 rolls past the finished
    Saturday to Thursday'` — add `function sat(hh, mm)` beside `fri`/`sun`
    (`:93-94`), run `checkInvariants('Barboura', sat(18, 30))`, assert
    `heads[0] === 'jeudi'`, no `nowtag`, and a `nexttag` still present (the
    wrapping NEXT is unchanged behaviour). `test/fusion.test.js` and
    `test/libgroups.test.js` take zero diff.

Verification:

16. `node --test` and `node --test test/*.test.js` → **103 tests, 103 pass,
    0 fail** (97 baseline — verified in this worktree — plus 5 new
    `classes.test.js` tests (criteria 9, 10) and 1 new
    `teacher-daygroups.test.js` test (criterion 15); no test is deleted, no
    `test()` call is renamed, so the arithmetic is exact).
17. `python3 -m http.server 8000` from the worktree root; `curl -s -o
    /dev/null -w '%{http_code}'` → 200 for `/index.html`, `/classes.html`,
    `/styles.css`, `/js/model.js`, `/js/classes.js`, `/js/teachers.js`,
    `/emplois.csv`. No browser is available: append "visually unverified" in
    the fix entry, as 049 did.

Diff hygiene:

18. Exactly these files change: `js/model.js`, `js/classes.js`,
    `js/teachers.js`, `test/classes.test.js`, `test/teacher-daygroups.test.js`,
    plus this issue file (the `Fix implemented` entry only). ZERO diff to:
    `styles.css`, `classes.html`, `index.html`, `js/data.js`,
    `js/libgroups.js`, `js/match.js`, `js/color.js`, `js/theme.js`,
    `Design.md`, `emplois.csv`, `vendor/`, `test/fusion.test.js`,
    `test/libgroups.test.js`, every other `issues/` file. `Status:` stays
    `Open` until merge; no git operations by the Implementer.

Explicit no-go items:

19. The whole-week grid stays Monday-first: only the two `store.days` loops
    feed it; `startFromToday` must not appear after the `<div class="weekwrap">`
    marker (criterion 11 pins this). The grid `today` column marking and the
    cursor (`applyCursor`/`startCursor`, `js/classes.js:324-369`) are
    untouched.
20. SA/SB untouched: the helper reads only `day`/`time`; no week filtering,
    no `week` field read, anywhere.
21. No viewport gating in JS, ever (`isNarrow` stays forbidden,
    `test/classes.test.js:526`); no CSS change at all.
22. The classes page keeps its today-only marking model: no `nextSessionIdx(`
    may appear in `js/classes.js` (pinned at `:542` and `:829`).
23. Do not reorder `week.sessions` or `ss`; the rotation applies to
    `dayOrder` only (teachers' NEXT is index-based into `ss`).
24. Do not rename or remove the slicing/structural markers the suites depend
    on: `var liveDays = {};`, `var dayOrder = [];`, `dayOrder.forEach`,
    `var byDay = {};`, `function renderWeek`, `detail.innerHTML = h;`,
    `'<div class="weekwrap"'` (first occurrence stays in the grid comment),
    `function showTeacher(name)`, `model.isCurrentSession(s.day, s.time, now)`
    / `(…, now2)`, `s.time === cursor.next`, `upcoming.has(`,
    `color.sessionRow(`, `dimIdle: false`, `NEXT_ARROW`.

**Risks / constraints**

1. The subtle regression to guard: both batteries map `secs[gi]` back to
   `distinct[gi]` for the NOW/NEXT and dim checks
   (`test/classes.test.js:751-767`, `test/teacher-daygroups.test.js:233-249`).
   If only the heading expectations are rewritten and the section-indexed
   loops keep the Monday-first `distinct`, every rotated scenario mis-attributes
   rows to days and fails confusingly — the loops MUST switch to `rotated`
   (criteria 7, 13).
2. `deepStrictEqual` across vm realms: `model.startFromToday` returns an array
   from the model's realm; both batteries must wrap it with the existing
   `main()` helper (`test/classes.test.js:44`,
   `test/teacher-daygroups.test.js:37`) before comparing to literals, exactly
   as every other model-returned array in those files.
3. The in-progress trap: the predicate is session-end > now. Implementing it
   as "a session starts after now" (or reusing `cursor.visible`) silently
   drops in-progress days — pinned by the Thu 15:30 and Sat 09:00 scenarios
   (criteria 9, 10) and by the helper unit test's Mon 09:00 case.
4. Pin discipline: the `orderedDays` absence pin (`classes.test.js:525`) is
   identifier-keyed — the name `startFromToday` is load-bearing for it; the
   `week.sessions.forEach`-count-2 pin (`:822`) forbids expressing the
   rotation as an iteration; the `store.days.forEach` pin (`:546`) and the
   fixed `store.days` (`:282-284`) carry rule 6 alongside the new direct
   assert (criterion 11).
5. Invariants preserved (and still pinned): heading-immediately-precedes-
   section adjacency on both pages (`:723-727`; `:206-212`), one
   heading/section per non-empty day and none for empty days (`:710-716`,
   `:738-747`; `:193-199`, `:220-229`), the day name exactly once
   (`teacher-daygroups:255-258`), row totals (`classes:739`; teachers:221`),
   the data layer staying Monday-first (`classes:707-709`), the `week-head`
   boundary (`classes:734-736`), the today-only marking model on classes and
   the wrapping-`nextSessionIdx` model on teachers (all byte-identical).
6. The class-list battery renders only the day-list block
   (`classesListBlock()`), so the grid is structurally — not behaviorally —
   guarded; that is unchanged from today and is why criterion 11's absence
   assert is worth its one line.
7. Behaviour note for reviewers: with rotation, the teachers page's already-
   wrapping `NEXT` tag (e.g. Barboura's Sunday `lundi` NEXT) now usually sits
   in the FIRST section, and the first section is the only non-dim one when
   something is live — that is the intended reading order, not a marker
   change; the markers themselves are computed exactly as before.

### Fix implemented (2026-10-18)

Implemented by the subagent Implementer against the acceptance criteria
below. Files changed: `js/model.js`, `js/classes.js`, `js/teachers.js`,
`test/classes.test.js`, `test/teacher-daygroups.test.js` (+ this entry). No
git operations were performed; `Status:` stays `Open` until merge. The dev
server was stopped by PID after the curl checks.

**Documented deviation from direction 2's sketch (criterion 1): the sketch's
cyclic index arithmetic is off by one, and was corrected by one token.**
`DAY_IDX` is 1-based (`LUNDI:1 … SAMEDI:6`) while `DAYS` is 0-based
(`LUNDI` at index 0), so `DAYS[(((DAY_IDX[today] + k) % 6) + 6) % 6]` as
printed scans Sat→MARDI,…,SAMEDI,LUNDI (LUNDI last) and Fri→LUNDI (skipping
SAMEDI). Driven in node, the printed sketch returns MARDI for the Sat 15:26
wrap and LUNDI for Fri 18:30 — contradicting the binding rules 1–7, the
Maintainer's own point-4 semantics ("Saturday-after (Sat 15:26 → lundi…),
Sunday (→ lundi), weekday 18:30 (Fri 18:30 → samedi)") and criteria 9/10/
14/15's pinned orders, which the sketch cannot satisfy as printed. The fix
is the one-token correction `var start = DAY_IDX[today] - 1;` (0-based
position; `undefined - 1` is `NaN` on Sunday, so `DAYS[NaN]` never matches,
Sunday still returns `null`, and the Monday-first input stays — rule 2).
Everything else in the sketch is kept per direction 2: names, comments,
structure, the `slotMinutes(s.time)[1] > mins` end-after-now predicate, the
`(days, sessions, now)` contract, and "export only `startFromToday`". With
the correction the rule reproduces all ten scenario-table orders; with the
printed arithmetic it fails three of them (probe: Sat 15:26→MARDI,
Fri 18:30→LUNDI, plus Fri/Sat wraps only passing via the null path). One
further, smaller slip in the issue text: criterion 10's prose "Mon 09:45 →
mardi…" cannot hold for the criterion's own fixture (`ss` contains only
LUNDI and MERCREDI sessions, no MARDI); the ended-boundary roll lands on
MERCREDI, which the criterion's own explicit expectation for the identical
state five minutes later (Mon 09:50 → `['MERCREDI', 'LUNDI', 'MARDI']`)
confirms. The test asserts `['MERCREDI', 'LUNDI', 'MARDI']` at 09:45 with a
comment. No other deviation; every criterion is met as numbered.

**Exact diff** of the final change (unified, against the pre-change state of
the five files; reproduced from `diff -u` of before/after copies):

```diff
--- a/js/model.js
+++ b/js/model.js
@@ -497,6 +497,40 @@
     return null;
   }
 
+  // Issue 050: start-from-today day lists for the day-group listings.
+  // `anchorDay` is the unified rule: `today` iff some session today still
+  // has an end after `now` (an in-progress session counts); otherwise the
+  // first day, scanning forward cyclically through DAYS from the day after
+  // today, that has any session. Sunday is not in DAYS and never has
+  // sessions, so a Sunday (or post-Saturday) wrap lands on LUNDI. Never
+  // DIMANCHE; null for an empty session list.
+  function anchorDay(sessions, now) {
+    now = now || new Date();
+    var mins = now.getHours() * 60 + now.getMinutes();
+    var today = JS_DAY[now.getDay()];
+    var ss = sessions || [];
+    if (ss.some(function (s) {
+      return s.day === today && slotMinutes(s.time)[1] > mins;
+    })) return today;
+    var start = DAY_IDX[today] - 1; // 0-based DAYS position; NaN on Sunday
+    for (var k = 1; k <= 6; k++) {
+      var d = DAYS[(((start + k) % 6) + 6) % 6];
+      if (ss.some(function (s) { return s.day === d; })) return d;
+    }
+    return null;
+  }
+
+  // Rotate a Monday-first distinct-day list so the listing starts at the
+  // anchor day (see anchorDay). Pure: the input is never mutated; an empty
+  // list or a null anchor returns the days unchanged.
+  function startFromToday(days, sessions, now) {
+    var a = anchorDay(sessions, now);
+    if (a === null) return days.slice();
+    var i = days.indexOf(a);
+    if (i <= 0) return days.slice();
+    return days.slice(i).concat(days.slice(0, i));
+  }
+
   // ---- teacher summary sentence (issues 006/008 semantics) ---------------
 
   // Wrap an interpolated data value: HTML-escaped inside literal
@@ -573,6 +607,7 @@
     slotMinutes: slotMinutes, isCurrentSession: isCurrentSession,
     dayCursor: dayCursor,
     nextKey: nextKey, nextSessionIdx: nextSessionIdx, availability: availability,
+    startFromToday: startFromToday,
     teacherSummary: teacherSummary
   };
 })();
--- a/js/classes.js
+++ b/js/classes.js
@@ -222,9 +222,9 @@
       // sections above the week grid, narrow screens shape them into cards
       // (teacher-style, via the generic mobile table rules; the whole-week
       // label and grid below are display:none on narrow). One day-group section
-      // per non-empty day, Monday-first, mirroring showTeacher — the day
-      // lives in the heading once, so there is no Day column and `dim`
-      // moves to the section. Row marking mirrors showTeacher with
+      // per non-empty day, cyclic from today (issue 050), mirroring showTeacher
+      // — the day lives in the heading once, so there is no Day column and
+      // `dim` moves to the section. Row marking mirrors showTeacher with
       // today-only semantics: the same `now` and the computed `cursor` keep
       // the grid and the lists consistent; never nextSessionIdx (it wraps
       // into the coming days).
@@ -253,14 +253,15 @@
           '</td><td class="c-room">' + esc(s.room || '—') +
           '</td></tr>';
       }
-      // one section per non-empty day, Monday-first (classWeek output is
-      // already in cmpSession order, so first-seen day order is the week order)
+      // one section per non-empty day, cyclic from today (issue 050: the
+      // first-seen Monday-first day order is rotated to the anchor day)
       var dayOrder = [];
       var byDay = {};
       week.sessions.forEach(function (s) {
         if (!byDay[s.day]) { byDay[s.day] = []; dayOrder.push(s.day); }
         byDay[s.day].push(s);
       });
+      dayOrder = model.startFromToday(dayOrder, week.sessions, now);
       dayOrder.forEach(function (day) {
         h += '<h3 class="day-head">' + esc(model.frDay(day)) + '</h3>';
         h += '<section class="day-group' + (liveDays[day] ? '' : ' dim') + '">';
--- a/js/teachers.js
+++ b/js/teachers.js
@@ -274,14 +274,15 @@
         if (model.isCurrentSession(s.day, s.time, now2) || upcoming.has(i))
           liveDays[s.day] = true;
       });
-      // one section per non-empty day, Monday-first (fused output is already
-      // in cmpSession order, so first-seen day order is the week order)
+      // one section per non-empty day, cyclic from today (issue 050: the
+      // first-seen Monday-first day order is rotated to the anchor day)
       var dayOrder = [];
       var byDay = {};
       ss.forEach(function (s, i) {
         if (!byDay[s.day]) { byDay[s.day] = []; dayOrder.push(s.day); }
         byDay[s.day].push({ s: s, i: i });
       });
+      dayOrder = model.startFromToday(dayOrder, ss, now2);
       dayOrder.forEach(function (day) {
         h += '<h3 class="day-head">' + esc(model.frDay(day)) + '</h3>';
         h += '<section class="day-group' + (liveDays[day] ? '' : ' dim') + '">';
--- a/test/classes.test.js
+++ b/test/classes.test.js
@@ -277,6 +277,44 @@
   assert.ok(Math.abs(c.frac - (89 / 90)) < 1e-9);
 });
 
+test('startFromToday rotates a day list per the unified anchor rule (issue 050)', function () {
+  var days = ['LUNDI', 'MARDI', 'MERCREDI'];
+  var ss = [{ day: 'LUNDI', time: '08h15-09h45' }, { day: 'MERCREDI', time: '10h00-11h30' }];
+  // before phase: today's sessions are all ahead -> today first
+  assert.deepStrictEqual(main(model.startFromToday(days, ss, at(12, 7, 0))),
+    ['LUNDI', 'MARDI', 'MERCREDI']);
+  // in progress: the session's end is after now -> today first
+  assert.deepStrictEqual(main(model.startFromToday(days, ss, at(12, 9, 0))),
+    ['LUNDI', 'MARDI', 'MERCREDI']);
+  // boundary: a session ending exactly at now counts as ended -> roll
+  assert.deepStrictEqual(main(model.startFromToday(days, ss, at(12, 9, 45))),
+    ['MERCREDI', 'LUNDI', 'MARDI']);
+  // slot gap after today's only session ended -> roll to the next session day
+  assert.deepStrictEqual(main(model.startFromToday(days, ss, at(12, 9, 50))),
+    ['MERCREDI', 'LUNDI', 'MARDI']);
+  // no sessions today at all -> next cyclic day with sessions
+  assert.deepStrictEqual(main(model.startFromToday(days, ss, at(13, 9, 0))),
+    ['MERCREDI', 'LUNDI', 'MARDI']);
+  // weekday evening wrap (Friday's sessions ended, Saturday has none here)
+  assert.deepStrictEqual(main(model.startFromToday(days, ss, at(16, 18, 30))),
+    ['LUNDI', 'MARDI', 'MERCREDI']);
+  // Saturday wrap past Sunday -> Monday
+  assert.deepStrictEqual(main(model.startFromToday(days, ss, at(17, 15, 26))),
+    ['LUNDI', 'MARDI', 'MERCREDI']);
+  // Sunday (rule 2): null anchor -> the Monday-first input stays
+  assert.deepStrictEqual(main(model.startFromToday(days, ss, at(11, 10, 0))),
+    ['LUNDI', 'MARDI', 'MERCREDI']);
+  // degenerate: empty list / empty sessions -> unchanged
+  assert.deepStrictEqual(main(model.startFromToday([], [], at(12, 9, 0))), []);
+  // degenerate: single-day list at a wrap clock -> unchanged
+  assert.deepStrictEqual(main(model.startFromToday(['LUNDI'], ss, at(17, 15, 26))),
+    ['LUNDI']);
+  // pure: the input array is never mutated (a real rotation happens here)
+  var copy = days.slice();
+  main(model.startFromToday(days, ss, at(13, 9, 0)));
+  assert.deepStrictEqual(days, copy, 'input array is not mutated');
+});
+
 // ---- week grid shape ------------------------------------------------------
 
 test('the grid is drawn from the six fixed days and slots', function () {
@@ -697,13 +735,14 @@
   var heads = classHeadingsOf(html);
   var secs = classSectionsOf(html);
 
-  // one heading + one section per distinct day, Monday-first, none for empty days
+  // one heading + one section per distinct day, start-from-today, none for empty days
   var distinct = [];
   week.sessions.forEach(function (s) { if (distinct.indexOf(s.day) === -1) distinct.push(s.day); });
   assert.ok(distinct.length > 1, key + ' must span several days to prove grouping');
-  var wantHeads = distinct.map(function (d) { return model.frDay(d); });
+  var rotated = main(model.startFromToday(distinct, week.sessions, clock));
+  var wantHeads = rotated.map(function (d) { return model.frDay(d); });
   assert.deepStrictEqual(heads, wantHeads,
-    key + ': one h3 per distinct day, Monday-first');
+    key + ': one h3 per distinct day, start-from-today');
   assert.deepStrictEqual(distinct,
     main(store.days).filter(function (d) { return distinct.indexOf(d) !== -1; }),
     key + ': day order is the Monday-first store order');
@@ -749,7 +788,7 @@
   // NOW/NEXT markers land on the cursor-computed rows
   var gotNow = {}, gotNext = {};
   secs.forEach(function (g, gi) {
-    var day = distinct[gi];
+    var day = rotated[gi];
     g.rows.forEach(function (r) {
       var rowKey = day + '|' + classRowTime(r);
       if (r.indexOf('nowtag') !== -1) gotNow[rowKey] = true;
@@ -761,7 +800,7 @@
 
   // dim on the section iff its day has no now/next
   secs.forEach(function (g, gi) {
-    var day = distinct[gi];
+    var day = rotated[gi];
     assert.strictEqual(g.cls.split(' ').indexOf('dim') !== -1, !live[day],
       key + ': dim on section iff day has no now/next (' + day + ')');
   });
@@ -776,17 +815,45 @@
 
 test('GLSI3D1 at Fri 12:00 groups its week with live Friday markers', function () {
   var r = checkClassesInvariants('GLSI3D1', friClass(12, 0));
+  assert.strictEqual(classHeadingsOf(r.html)[0], 'vendredi');
   assert.ok(r.html.indexOf('nowtag') !== -1, 'expected a NOW marker');
   assert.ok(r.html.indexOf('nexttag') !== -1, 'expected a NEXT marker');
 });
 
 test('GLSI3D1 on Sunday morning dims every group with no markers', function () {
   var r = checkClassesInvariants('GLSI3D1', sunClass(10, 0));
+  assert.strictEqual(classHeadingsOf(r.html)[0], 'lundi');
   assert.ok(r.html.indexOf('nowtag') === -1, 'nothing is NOW on Sunday');
   assert.ok(r.html.indexOf('nexttag') === -1, 'nothing is NEXT on Sunday');
   assert.ok(r.html.indexOf('day-group dim') !== -1, 'every group dims on Sunday');
 });
 
+test('GLSI3D1 at Fri 18:30 rolls the day groups forward to Saturday', function () {
+  var r = checkClassesInvariants('GLSI3D1', at(16, 18, 30));
+  assert.strictEqual(classHeadingsOf(r.html)[0], 'samedi');
+  assert.ok(r.html.indexOf('nowtag') === -1, 'nothing is NOW at Fri 18:30');
+  assert.ok(r.html.indexOf('nexttag') === -1, 'nothing is NEXT at Fri 18:30');
+});
+
+test('GLSI3D1 at Thu 15:30 starts at Thursday (a session is in progress)', function () {
+  var r = checkClassesInvariants('GLSI3D1', at(15, 15, 30));
+  assert.strictEqual(classHeadingsOf(r.html)[0], 'jeudi');
+  assert.ok(r.html.indexOf('nowtag') !== -1, 'expected a NOW marker (in progress)');
+});
+
+test('GLSI3D1 at Sat 15:26 wraps the finished Saturday back to Monday', function () {
+  var r = checkClassesInvariants('GLSI3D1', at(17, 15, 26));
+  assert.strictEqual(classHeadingsOf(r.html)[0], 'lundi');
+  assert.ok(r.html.indexOf('nowtag') === -1,
+    'nothing is NOW at Sat 15:26 (its only Saturday session ended 09:45)');
+});
+
+test('SD1 at Tue 09:00 starts at Wednesday (no Tuesday sessions)', function () {
+  var r = checkClassesInvariants('SD1', at(13, 9, 0));
+  assert.deepStrictEqual(classHeadingsOf(r.html),
+    ['mercredi', 'jeudi', 'vendredi', 'samedi', 'lundi']);
+});
+
 test('class list rows carry no session count badge', function () {
   var src = fs.readFileSync(path.join(ROOT, 'js/classes.js'), 'utf8');
   assert.ok(src.indexOf('weekCount') === -1, 'no per-row session counting');
@@ -826,6 +893,14 @@
   assert.strictEqual(count(src, 'var dayOrder = [];'), 1, 'dayOrder must be declared exactly once');
   assert.strictEqual(count(src, 'dayOrder.forEach'), 1,
     'exactly one dayOrder.forEach (the sections loop)');
+  // the whole-week grid stays Monday-first (issue 050): from the weekwrap
+  // marker to the innerHTML write, only the two store.days loops feed it
+  var gridTail = slice.slice(slice.indexOf('<div class="weekwrap"><table class="week">'),
+    slice.indexOf('detail.innerHTML = h;'));
+  assert.strictEqual(count(gridTail, 'store.days.forEach'), 2,
+    'the week grid keeps its two Monday-first store.days loops');
+  assert.strictEqual(count(gridTail, 'startFromToday'), 0,
+    'startFromToday must not reach the whole-week grid');
   assert.ok(src.indexOf('nextSessionIdx(') === -1, 'must not use the wrapping nextSessionIdx');
   // the session-row helper is declared between liveDays and the first day-head
   var liveAt = slice.indexOf('var liveDays = {};');
--- a/test/teacher-daygroups.test.js
+++ b/test/teacher-daygroups.test.js
@@ -91,6 +91,7 @@
 }
 
 function fri(hh, mm) { return new RealDate(2026, 9, 16, hh, mm); } // Friday
+function sat(hh, mm) { return new RealDate(2026, 9, 17, hh, mm); } // Saturday
 function sun(hh, mm) { return new RealDate(2026, 9, 11, hh, mm); } // Sunday
 
 // ---- output parsing -------------------------------------------------------
@@ -184,12 +185,13 @@
   var heads = headingsOf(html);
   var secs = sectionsOf(html);
 
-  // one heading + one section per distinct day, Monday-first, none for empty days
+  // one heading + one section per distinct day, start-from-today, none for empty days
   var distinct = [];
   ss.forEach(function (s) { if (distinct.indexOf(s.day) === -1) distinct.push(s.day); });
-  var wantHeads = distinct.map(function (d) { return model.frDay(d); });
+  var rotated = main(model.startFromToday(distinct, ss, clock));
+  var wantHeads = rotated.map(function (d) { return model.frDay(d); });
   assert.deepStrictEqual(heads, wantHeads,
-    name + ': one h3 per distinct day, Monday-first');
+    name + ': one h3 per distinct day, start-from-today');
   assert.strictEqual(secs.length, distinct.length,
     name + ': one section per distinct day');
   main(store.days).forEach(function (d) {
@@ -231,7 +233,7 @@
   // NOW/NEXT markers land on the same rows as the pre-change logic
   var gotNow = {}, gotNext = {};
   secs.forEach(function (g, gi) {
-    var day = distinct[gi];
+    var day = rotated[gi];
     g.rows.forEach(function (r) {
       var key = day + '|' + rowTime(r);
       if (r.indexOf('nowtag') !== -1) gotNow[key] = true;
@@ -243,7 +245,7 @@
 
   // dim on the section iff its day has no now/next
   secs.forEach(function (g, gi) {
-    var day = distinct[gi];
+    var day = rotated[gi];
     assert.strictEqual(g.cls.split(' ').indexOf('dim') !== -1, !live[day],
       name + ': dim on section iff day has no now/next (' + day + ')');
   });
@@ -264,6 +266,7 @@
 test('Barboura at Fri 12:00 groups 12 fused rows with live Friday markers', function () {
   var r = checkInvariants('Barboura', fri(12, 0));
   assert.strictEqual(r.ss.length, 12, 'Barboura fuses to 12 rows');
+  assert.strictEqual(headingsOf(r.html)[0], 'vendredi');
   // Friday 12h00 sits inside 11h40-13h10: that row is NOW, 13h20-14h50 is NEXT
   assert.ok(r.html.indexOf('nowtag') !== -1, 'expected a NOW marker');
   assert.ok(r.html.indexOf('nexttag') !== -1, 'expected a NEXT marker');
@@ -272,16 +275,26 @@
 test('Dlima at Fri 12:00 marks only the single next capsule, no NOW', function () {
   var r = checkInvariants('Dlima', fri(12, 0));
   assert.strictEqual(r.ss.length, 10, 'Dlima keeps 10 rows');
+  // the rotation case from the issue: vendredi first, then mardi… cyclic
+  assert.strictEqual(headingsOf(r.html)[0], 'vendredi');
   assert.ok(r.html.indexOf('nowtag') === -1, 'no NOW at Fri 12:00 for Dlima');
   assert.strictEqual(r.html.split('nexttag').length - 1, 1, 'single NEXT capsule');
 });
 
 test('Barboura on Sunday morning marks the wrapped next session only', function () {
   var r = checkInvariants('Barboura', sun(10, 0));
+  assert.strictEqual(headingsOf(r.html)[0], 'jeudi');
   assert.ok(r.html.indexOf('nowtag') === -1, 'nothing is NOW on Sunday');
   assert.ok(r.html.indexOf('nexttag') !== -1, 'wrapped NEXT still marks');
 });
 
+test('Barboura at Sat 18:30 rolls past the finished Saturday to Thursday', function () {
+  var r = checkInvariants('Barboura', sat(18, 30));
+  assert.strictEqual(headingsOf(r.html)[0], 'jeudi');
+  assert.ok(r.html.indexOf('nowtag') === -1, 'nothing is NOW at Sat 18:30');
+  assert.ok(r.html.indexOf('nexttag') !== -1, 'wrapped NEXT still marks');
+});
+
 // ---- styles.css asserts -----------------------------------------------------
 
 test('styles.css defines day-group/day-head in the group-head language', function () {
```

**Criteria checklist** (each numbered acceptance criterion):

1. **Met** (with the documented one-token deviation above). `anchorDay` +
   `startFromToday` inserted between `availability` and the `// ---- teacher
   summary sentence` divider, ES5 style, internal cycle order = the module's
   own `DAYS`; `startFromToday: startFromToday,` added to the return object
   beside `availability`; `anchorDay` is NOT exported (source-asserted);
   `dayCursor`, `nextKey`, `nextSessionIdx`, `availability` byte-identical
   (the diff shows zero changes inside them).
2. **Met** — `dayOrder = model.startFromToday(dayOrder, week.sessions, now);`
   inserted exactly once, between the `week.sessions.forEach` grouping loop
   and `dayOrder.forEach`; no other statement changes; the `week.sessions.forEach`
   count in `renderWeek` stays 2 (pin at `test/classes.test.js:822` passes —
   the call is not an iteration).
3. **Met** — the two day-group comments (`:224-225` block, `:256-257` line)
   rewritten to describe the cyclic-from-today order; no other comment
   changes (diff-verified).
4. **Met** — `dayOrder = model.startFromToday(dayOrder, ss, now2);` inserted
   exactly once between the `ss.forEach` grouping loop and `dayOrder.forEach`;
   `upcoming`, `liveDays`, the `{s, i}` entries, the row markup and
   `breakdownHTML` are byte-identical.
5. **Met** — the teachers "Monday-first" phrase (`:277-278`) rewritten.
6. **Met** — `checkClassesInvariants` adds
   `var rotated = main(model.startFromToday(distinct, week.sessions, clock));`
   (the `main()` conversion is there — vm-realm prototypes), `wantHeads`
   becomes `rotated.map(... frDay)`, message becomes
   `key + ': one h3 per distinct day, start-from-today'`; the store-order
   data-layer pin (`:707-709`) is byte-identical.
7. **Met** — both section-indexed lookups `var day = distinct[gi]` in the
   classes battery (`:752` NOW/NEXT loop, `:764` dim loop) switched to
   `rotated[gi]` (the criterion's "three" counts the classes battery's two
   loops; both are switched, grep-verified there is no `distinct[gi]` left).
   Everything else in the battery is byte-identical: section count, empty-day
   checks, heading-outside-section, per-day adjacency, row totals/columns,
   marker equality, `week-head`/`c-all` boundaries.
8. **Met** — the Fri 12:00 test asserts
   `classHeadingsOf(r.html)[0] === 'vendredi'`; the Sunday test asserts
   `'lundi'`.
9. **Met** — four new tests added beside them, each running the full rewritten
   battery at a stubbed clock via `at()` plus an explicit first-heading assert:
   Fri 18:30 → `samedi` (no nowtag, no nexttag — cursor phase `after`);
   Thu 15:30 → `jeudi` (nowtag present — in progress); Sat 15:26 → `lundi`
   (no nowtag — its only Saturday session ended 09:45); SD1 Tue 09:00 →
   heads exactly `['mercredi', 'jeudi', 'vendredi', 'samedi', 'lundi']`.
10. **Met** — `'startFromToday rotates a day list per the unified anchor rule
    (issue 050)'` added after the dayCursor block, with the criterion's exact
    synthetic fixture; every expectation is a hand-written literal passed
    through `main()` (none computed via the helper): Mon 07:00 lundi-first,
    Mon 09:00 lundi-first (in progress), Mon 09:45 rolls (end == now counts
    as ended; expectation `['MERCREDI','LUNDI','MARDI']` per the note above),
    Mon 09:50 `['MERCREDI','LUNDI','MARDI']`, Tue 09:00
    `['MERCREDI','LUNDI','MARDI']`, Fri 18:30 lundi-first (weekday wrap),
    Sat 15:26 lundi-first (Saturday wrap), Sun 10:00 lundi-first (rule 2),
    plus degenerate pins (`[]`→`[]`, single-day list at a wrap clock →
    unchanged) and the non-mutation pin (input array unchanged after a real
    rotation).
11. **Met** — the structural test `'renderWeek emits day groups, then the
    WHOLE WEEK label, then the week grid'` extended with the rule-6 pin: the
    tail from `'<div class="weekwrap"><table class="week">'` to
    `'detail.innerHTML = h;'` must contain `store.days.forEach` twice and
    `startFromToday` zero times. Every other assert in that test is
    byte-identical (the `week.sessions.forEach` count of 2, the
    `byDay`/`dayOrder` exactly-once counts, the `nextSessionIdx(` absence,
    the sessionRow-helper placement).
12. **Met** — kept byte-identical: the `orderedDays`/`isNarrow` absence pins
    (`:525-526`), the grid `store.days.forEach` pin (`:546`), the
    `dayOrder.forEach` presence pin (`:572`), all dayCursor boundary tests
    (`:185-278`), and the harness plumbing (`classesListBlock()` bounds,
    `runClassesList` — the new line is vm-safe: the sandbox already provides
    `model`, `week` and `now`; the batteries pass).
13. **Met** — `checkInvariants` in `test/teacher-daygroups.test.js` rewritten
    the same way: `var rotated = main(model.startFromToday(distinct, ss, clock));`,
    `wantHeads` from `rotated`, message `name + ': one h3 per distinct day,
    start-from-today'`; both section-indexed lookups (`:234` NOW/NEXT,
    `:246` dim) switched to `rotated[gi]`. Byte-identical: section count,
    empty-day checks, heading-outside-card, per-day adjacency and
    exactly-one-heading (`:206-212`), marker equality, the "day name exactly
    once" checks.
14. **Met** — first-heading pins added: Barboura Fri 12:00 → `'vendredi'`;
    Dlima Fri 12:00 → `'vendredi'`; Barboura Sun 10:00 → `'jeudi'`.
15. **Met** — `function sat(hh, mm)` added beside `fri`/`sun`; new test
    `'Barboura at Sat 18:30 rolls past the finished Saturday to Thursday'`
    runs `checkInvariants('Barboura', sat(18, 30))` and asserts
    `heads[0] === 'jeudi'`, no `nowtag`, and a `nexttag` still present.
    `test/fusion.test.js` and `test/libgroups.test.js` take zero diff.
16. **Met** — `node --test` → **103 tests, 103 pass, 0 fail**;
    `node --test test/*.test.js` → **103/103/0**. The 97 baseline was
    re-verified in this worktree before the change; +5 `classes.test.js`
    tests (criteria 9, 10) and +1 `teacher-daygroups.test.js` test
    (criterion 15); no test deleted, no `test()` call renamed.
17. **Met** — `python3 -m http.server 8000` from the worktree root;
    `curl -s -o /dev/null -w '%{http_code}'` → 200 for `/index.html`,
    `/classes.html`, `/time.html`, `/timetable.html`, `/styles.css`,
    `/js/model.js`, `/js/classes.js`, `/js/teachers.js`, `/emplois.csv`
    (all nine; the criterion's seven included). The server was killed by PID
    afterwards. No browser is available: **visually unverified**, as 049 did.
18. **Met** — exactly the five code files above changed plus this issue entry
    (verified by an mtime sweep of the worktree: only `js/model.js`,
    `js/classes.js`, `js/teachers.js`, `test/classes.test.js`,
    `test/teacher-daygroups.test.js`). Zero diff to `styles.css`,
    `classes.html`, `index.html`, `js/data.js`, `js/libgroups.js`,
    `js/match.js`, `js/color.js`, `js/theme.js`, `Design.md`, `emplois.csv`,
    `vendor/`, `test/fusion.test.js`, `test/libgroups.test.js`, every other
    `issues/` file. `Status:` stays `Open`; no git operations by the
    Implementer.
19. **Met** — grid stays Monday-first: only the two `store.days` loops feed
    it (pinned by criterion 11's assert and `:546`); `startFromToday` does
    not appear after the `<div class="weekwrap">` marker (source-asserted
    plus the new test pin); the grid `today` column marking and
    `applyCursor`/`startCursor` are untouched.
20. **Met** — SA/SB untouched: the helper reads only `day`/`time` (no `week`
    field read anywhere in the helper block — source-asserted); no week
    filtering added.
21. **Met** — no viewport gating: `isNarrow` absent from both page files
    (source-asserted; `:526` pin passes); zero CSS change.
22. **Met** — no `nextSessionIdx(` in `js/classes.js` (source-asserted; pins
    `:542` and `:829` pass).
23. **Met** — `week.sessions` and `ss` are never reordered; only `dayOrder`
    is reassigned (the grouping loops are byte-identical, diff-verified).
24. **Met** — all slicing/structural markers preserved (source-asserted):
    `var liveDays = {};`, `var dayOrder = [];`, `dayOrder.forEach`,
    `var byDay = {};`, `function renderWeek`, `detail.innerHTML = h;`,
    `'<div class="weekwrap"'`, `function showTeacher(name)`,
    `model.isCurrentSession(s.day, s.time, now2)`, `s.time === cursor.next`,
    `upcoming.has(`, `color.sessionRow(`, `dimIdle: false`, `NEXT_ARROW`,
    plus the classes-side `model.isCurrentSession(s.day, s.time, now)`.

**Verification results** (run in the worktree before this entry; node v22):

- `node --test` → tests 103, pass 103, fail 0. `node --test test/*.test.js`
  → tests 103, pass 103, fail 0. (Baseline before the change: 97/97/0.)
- **Real-emission scenario evidence** — the real `renderWeek` body (day
  groups + whole-week grid) and the real `showTeacher` slice were driven in
  a node vm harness against the real `emplois.csv` with stubbed clocks
  (the AGENTS.md standard; same harness shape as the test batteries):
  - GLSI3D1 @ Fri 2026-10-16 18:30 → headings `samedi, lundi, mardi,
    mercredi, jeudi, vendredi`; grid `th.c-day` = `lundi, mardi, mercredi,
    jeudi, vendredi, samedi`.
  - GLSI3D1 @ Thu 2026-10-15 15:30 (15h00-16h30 in progress) → `jeudi,
    vendredi, samedi, lundi, mardi, mercredi`.
  - GLSI3D1 @ Sat 2026-10-17 15:26 (Saturday session ended 09:45) →
    `lundi, mardi, mercredi, jeudi, vendredi, samedi` (wrap past Sunday).
  - GLSI3D1 @ Sun 2026-10-11 10:00 → `lundi, …samedi` (unchanged, rule 2).
  - GLSI3D1 @ Tue 2026-10-13 09:00 → `mardi, mercredi, jeudi, vendredi,
    samedi, lundi`.
  - GLSI3D1 @ Fri 2026-10-16 12:00 (in progress) → `vendredi, samedi,
    lundi, mardi, mercredi, jeudi`.
  - SD1 @ Tue 2026-10-13 09:00 (no Tuesday sessions) → `mercredi, jeudi,
    vendredi, samedi, lundi`.
  - Teachers: Barboura @ Fri 12:00 → `vendredi, samedi, jeudi`; Dlima @
    Fri 12:00 → `vendredi, mardi, mercredi, jeudi`; Barboura @ Sun 10:00 →
    `jeudi, vendredi, samedi`; Barboura @ Sat 18:30 (finished Saturday) →
    `jeudi, vendredi, samedi`; Bannour @ Sat 15:26 → `lundi, mardi,
    mercredi, vendredi, samedi` (wrap).
  - **Unchanged-grid check** (rule 6): on every rotated classes render
    above, the whole-week grid columns are still `lundi … samedi`.
- **Source invariants** (node assertions): `js/classes.js` contains 0
  `orderedDays`, exactly 1 `startFromToday` (the one rotation call, before
  the `<div class="weekwrap">` marker), no `isNarrow`, no `nextSessionIdx(`;
  `js/teachers.js` contains exactly 1 `startFromToday`, no `isNarrow`;
  `js/model.js` defines `startFromToday` once and exports it, does NOT
  export `anchorDay`, and the helper block reads no `week` field. All no-go
  markers listed under criterion 24 are present.
- **curl statuses**: 200 for all nine URLs listed in criterion 17. The
  server was stopped by PID; no `python3 -m http.server` process was left
  running by this work.
- **Diff hygiene**: pre/post copies of the five files compared with
  `diff -u` (reproduced in full above); an mtime sweep of the worktree
  shows only those five files modified besides this issue file.
- No browser is available in this environment: **visually unverified**.

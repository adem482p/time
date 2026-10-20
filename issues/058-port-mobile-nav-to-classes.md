# 058: Port the mobile three-state navigation (issues 056 + 057) to the classes page

- Status: Fixed
- Date: 2026-10-20, Reporter: user

## Description

Scope: the **classes page** — `classes.html` + `js/classes.js`
(`body data-page="classes"`, `classes.html:32`, script `classes.html:62`).
Narrow viewport only for the behaviour below: the pane swap is CSS
`@media (max-width: 700px)` (`styles.css:489`; a second classes-only narrow
block lives at `styles.css:784-800`), exercised at **390×844**.

Method: Playwright (MCP `playwright` server) driving headless Chromium against
this worktree served by `python3 -m http.server 8058` (PID 574735 in
`/tmp/opencode/http058.pid`, **killed by PID** afterwards), URL
`http://localhost:8058/classes.html`, executed **2026-10-20**. Every claim
labeled *Measured* is a live DOM / `getComputedStyle` result; every *code* claim
is re-read in this worktree with line numbers. Console over the whole walk:
**0 JS errors** (favicon 404 excepted; the repo ships no favicon).
Baseline: `node --test` → **127 tests, 127 pass, 0 fail** (re-verified here
before any measurement).

### Observed — the current classes machine (Measured, 390×844)

The pre-056 mirror of the teachers machine, five transitions + one derived
class, exactly as issue 056 described the teachers page *before* its fix
(issue 056, Observed T1–T7): `#layout` carries `is-list`, derived in
`syncList` as *"searchFocused **and** the most recent render did not leave
exactly one result"* (`js/classes.js:105-108`,
`lastResultCount = rows.length` `js/classes.js:192`).

| # | Transition | Measured result |
|---|---|---|
| T1 | load | `#layout` class **absent**; `#classList` `display:none` (**94 `li`** already in the DOM); `#detail` `display:flex` with `.empty-state` → heading **"No Class Selected"** (`js/classes.js:184`, `.no-class-selected`) + kaomoji face — **the classes page has the same kaomoji empty state as teachers, only the heading class/text differs**; `#search` `""`; V (`#searchDone`) `display:none` (`styles.css:129` base armour); X (`#searchClear`) `hidden`. `#searchBack` / `#searchOverlay` / `#overlayClear` / `#overlayName`: **no such nodes** (Measured: `getElementById` → null; `#searchWrap` children = `ghost, search, searchDone, searchClear, suggest`). |
| T2 | tap `#search` (focus) | `#layout` gains **`is-list`**; list `display:block` (94 rows); `#detail` → `none`; V → `display:flex` (focus-gated, `styles.css:527`); `activeElement = #search`. |
| T3 | type `GLSI` | list narrows to **16** rows (`leafRows` filter, `js/classes.js:501`); X appears (`js/classes.js:109-111`); **suggest stays `hidden` (0 rows)** — measured: `match.suggest('GLSI')` returns 8 entries whose first 8 are all *interior* nodes, and the classes page keeps only `kind==='class' && leafSet[label]` (`js/classes.js:489-496`), so the leaf rows are cut by the cross-kind cap of 8 (`js/match.js:541`). Typing `GLSI3D` then opens the suggest with **2 rows** (`GLSI3D1`, `GLSI3D2`) + ghost. (Teachers shows a suggest for `GLSI` — class vocabulary behaves differently here.) |
| T4 | select — `fill('GLSI3D1')` (single hit → `onInput` auto-jump `js/classes.js:506`, or Enter → `acceptSuggest` → `commit`) | `is-list` **removed** (via `renderWeek`'s fenced write `js/classes.js:344-347`); `#detail` `display:block` with `<h2>LCS3-GLSI_D Groupe 1</h2>` (the **week name**, not the typed label); list `display:none` but keeps the active highlight (`GLSI3D1`); `#search.value` = `"GLSI3D1"` (the commit path writes the filter, `js/classes.js:480`); focus **retained** → V `flex`, X `flex`. **Variant (row tap)** `#classList li` click: `is-list` removed, `<h2>LBC2-BI_B Groupe 1</h2>`, `value` still `""` (selection never rewrites the filter), `activeElement → BODY`, **V `display:none`, X `display:none`** — same focus nuance issue 056 measured for teachers (row taps blur, suggest/Enter keeps focus). |
| T5 | press V ("Hide the keyboard", `classes.html:43-45`, handler `js/classes.js:611-616`: `search.blur(); searchDone.blur(); searchFocused = false; syncList();`) | `activeElement → BODY`, V → `display:none`, `is-list` stays absent, detail unchanged (class week). Keyboard dismissed; **list stays hidden; detail stays the class.** |
| T6 | tap `#search` again | **Conditional — measured divergence from the teachers walk:** `is-list` returns **only if the last render left ≠ 1 row** (the `lastResultCount !== 1` half of the derivation). With `value = "GLSI3D1"` (1 row) the tap focuses the box and shows the **V**, but the list **does not open** (`isList:false`, `list:none`, detail still shown — measured twice: A4 and A4p). With a partial/empty filter (94 or 16 rows) the list **does** open (measured `A9_then_tapFilter: isList:true`). Issue 056's T6 on teachers worked because the query `Ben Haj` rendered 2 rows; under the post-056 `menuOpen` derivation every filter tap opens the list. |
| T7 | type with a class already selected | list re-renders to the new hits **regardless of the selection** (`js/classes.js:498-508`); `#detail` still holds the selected class (hidden, not destroyed) — measured in A10a: `value:"zzz"`, `nomatch` hidden behind the list, previous `h2` still in `#detail`. "Typing updates the list regardless of other state" confirmed. |

Code shape (verified): `searchFocused`/`lastResultCount` declared
`js/classes.js:95-96`; `syncList` `:105-108` (toggle derivation); focus
`:590-593` and click `:597-600` both set `searchFocused = true; syncList();`
("tapping the filter box always bring the menu back" comment `:594-596`);
blur `:604-607` is pure (`renderSuggest([]); renderGhost();` — `3909bd9`
shape); the V `:611-616`; the X `:618-626` (**still calls `search.focus()`**
`:623` — issue 056 dropped that on teachers, criterion 11); Escape
`:554-560` (preventDefault, drop suggest if open, **unconditional `return`**
— no navigation edge at all); issue-007 gates `isCoarsePointer` `:20-24`,
suggest pre-focus `:418-422`, Tab `:561-570`, Enter `:583-588`; boot paint
`:628-634` (`renderList` → `detail.innerHTML = emptyStateHTML()` →
`syncList()` → `syncClear()` → `clock.subscribe(onTick)`).

### Observed — the dead end (state = class selected, keyboard dismissed)

Rebuilt as `tap filter → fill GLSI3D1 → press V` (snapshot A1: `is-list`
absent, list `none`, `#detail h2 = "LCS3-GLSI_D Groupe 1"`, `value
"GLSI3D1"`, **V `display:none`**, **X `display:flex`**). Every affordance
enumerated from A1, each from a fresh rebuild (Measured):

1. **Tap the filter box** → with the exact 1-row filter: **no list at all**
   (T6 nuance: `isList:false`, only the V appears); V again → `blur()` only,
   nothing changes. The list is reachable from A1 **only by editing the
   query** (backspace → count ≠ 1 → `onInput` → `syncList` adds `is-list`).
   With a non-1-row filter (e.g. after an empty-filter row tap) the tap opens
   the list and the V then returns to the class (`A9_then_tapFilter`).
   *Cycle class ↔ list; never empty.*
2. **Tap the `#detail`** → **no change** (A6: `is-list` absent, same `h2`).
   The only click handler on `#detail` is the empty-state face hop keyed on
   `.empty-state` (`js/classes.js:151-171`), absent while a class shows.
3. **Escape** (after focusing) → **no-op for navigation** (A7: value, `h2`,
   panes untouched; suggest already closed). The handler returns
   unconditionally (`js/classes.js:554-560`); on a phone there is no Esc key
   anyway (coarse-pointer comment `js/classes.js:15-19`).
4. **Tap X** → clears the filter but lands in **state=list, not state=empty**
   (A2: `value ""`, `is-list` **added** (94 rows, `searchFocused` armed by the
   X's own `search.focus()` `js/classes.js:623`), empty state rendered into
   the **hidden** `#detail`, V now `flex`). Only a **second tap on the V**
   (A3) shows the empty page. → with text in the filter the shortest route
   back to empty is **X then V (2 taps, passing through the list)** —
   identically to issue 056's A2/A3 on teachers.
5. **Empty-filter selection has no clear control at all** (Case B): focus →
   tap a `#classList` row → `value ""` → X `hidden` (no text), V `display:none`
   (row tap blurred) — measured `A9_rowTap_emptyFilter: xHidden:true,
   v:none`. Now a class is selected with **zero clear/deselect controls on
   screen**. Shortest measured route to the empty page: tap filter → type
   `zzz` ("No classes match." behind the list) → tap X → tap V = **4 taps**
   (`A10a → A10b → A10c` + the leading filter tap), mirroring issue 056's
   B7–B10.
6. **Outside-tap while the list is open** (D4 analog): tap `#status` → the
   list **stays visible with the V hidden** (A8: `isList:true`, `v:none`;
   blur never touches panes, `js/classes.js:604-607`); re-tapping the box
   brings the V back (A8b). A menu state whose only "back" control is
   focus-gated.

**No single affordance in state=class transitions to state=empty**, and under
the 1-row filter even "back to list" has no edge — the same defect issue 056
fixed on teachers (its ruling 2, anti-D4).

### Observed — what the teachers page has that classes lacks

`index.html` + `js/teachers.js` now ship the 056/057 architecture; classes has
none of it (all Verified by reading + the injection experiment below):

- Markup (`index.html:42-54`): `#searchBack` (between input and
  `#searchClear`), `#searchOverlay[hidden]` with `#overlayClear`,
  `#overlayName`, `.overlay-drop`; `#searchDone` **gone** (`index.html` has no
  `id="searchDone"`; `classes.html:43-45` still has it).
- State (`js/teachers.js:78-85`): the comment block + two facts `menuOpen`,
  `selectedTeacher` — replacing `searchFocused`/`lastResultCount`; single
  derivation `state = menuOpen ? 'list' : selectedTeacher ? 'teacher' :
  'empty'`.
- Funnels (`js/teachers.js:180-232`): `syncList` (sole writer of `is-list`),
  `syncOverlay`, `openMenu`, `closeMenu`, `showEmpty`, `selectTeacher`;
  `renderItem` row click → `selectTeacher(r.teacher)`; `showTeacher`'s tail
  keeps only a fenced `if (!tickNow) { if (layout) layout.classList.remove('is-list');
  syncClear(); }` (`js/teachers.js:411-416` — issue-051 fence, retained as the
  live-path guard and pinned by `test/teacher-daygroups.test.js:743,751`).
- Handlers (`js/teachers.js:582-625`): focus/click → `openMenu();`, blur
  **unchanged** (pure), `#searchBack` → `closeMenu()`, `#searchOverlay` →
  `openMenu(); search.focus();`, `#overlayClear` → `stopPropagation +
  showEmpty()`, X **without** `search.focus()`, Escape → suggest-open? drop
  suggest : `closeMenu()` (`:545-552`), boot → `showEmpty()`
  (`:627-633`).
- CSS: the shared 056 block (`styles.css:131-133, 541-591`) and the 057 polish
  (`border-radius: 8px` `:566`, `#searchWrap:has(#searchOverlay:not([hidden]))
  #search { visibility: hidden; }` `:570`).
- Tests: `test/teacher-daygroups.test.js:525-556` (nav chrome) and
  `:558-593` (nav machine funnels) pin all of it for teachers.

### Observed — markup (classes.html vs index.html)

`classes.html:40-50` `#searchWrap` exact node order: `#ghost` (:41) →
`#search` (:42) → **`#searchDone`** (:43-45) → `#searchClear` (:46-48) →
`#suggest` (:49). Present: `searchWrap, search, searchDone, searchClear,
suggest, ghost` (+ `classList` :51, `detail` :53). **Absent:** `#searchBack`,
`#searchOverlay`, `#overlayClear`, `#overlayName` (Measured in the DOM too).
`index.html:39-56` now: `ghost` → `search` → **`searchBack`** (:42-44) →
`searchClear` (:45-47) → **`searchOverlay`** (:48-54) → `suggest` (:55).

### Observed — CSS: shared vs classes-specific (all Verified)

**Already shared, ungated — they would light up on classes.html the moment the
markup exists.** Proven, not inferred: I injected `#searchBack` +
`#searchOverlay` into the *live* classes page (in-page DOM only, no file
changed) and read computed styles at 390×844:

| rule | line | measured with injected markup |
|---|---|---|
| `#searchBack { display: none; }` (base armour) | `styles.css:132` | overridden to `flex` while `#layout.is-list`, back to `none` without it |
| `#searchOverlay { display: none; }` (base armour) | `styles.css:133` | overridden to `flex` when unhidden |
| `#layout.is-list #searchBack` (+`:active`, `svg`) | `styles.css:544-553` | `display:flex; position:absolute; left:0; width:43.19px` (2.7rem) |
| `#layout.is-list #search` / `#ghost` left gutters | `styles.css:557-558` | `padding-left: 52.8px` both |
| `#searchOverlay:not([hidden])` (056) + `border-radius: 8px` (057) | `styles.css:562-568` | `display:flex; border-radius:8px; z-index:3` |
| `#searchWrap:has(#searchOverlay:not([hidden])) #search` (057 input hide) | `styles.css:570` | `#search` `visibility:hidden` while the overlay shows, `visible` again when `[hidden]` — **the 057 rule already works on classes with zero CSS edits** |
| `#overlayClear` / `#overlayName` / `.overlay-drop` | `styles.css:572-591` | present |
| pane swap `#layout:not(.is-list) #teacherList, #layout:not(.is-list) #classList` / `#layout.is-list #detail` | `styles.css:516-517` | the classes pane swap itself |
| `#searchClear` geometry, `#search { padding-right: 2.7rem; }` | `styles.css:597-607, 618` | X slot (both pages) |
| base hides `#searchDone { display:none; }` / `#searchClear { display:none; }`, `[hidden]` override | `styles.css:129-136` | — |
| focus glow `#searchWrap:focus-within` | `styles.css:92-95` | — |

None of 544-591 carries a `body[data-page=…]` gate — they key on ids and
`#layout.is-list`, i.e. they are page-agnostic **by construction**.

**Classes-specific — the V-stepping rules issue 056 re-scoped to
`body[data-page="classes"]` precisely because classes still has the V**
(`styles.css:608-619`):

```css
/* styles.css:614 — the X steps aside for the focus-gated V */
body[data-page="classes"] #searchWrap:focus-within:has(#searchClear:not([hidden])) #searchClear { right: 2.7rem; }
/* styles.css:619 — double gutter when V + X show together */
body[data-page="classes"] #searchWrap:focus-within:has(#searchClear:not([hidden])) #search { padding-right: 5.4rem; }
```

Measured live on classes today: focused + text → `#searchClear`
`right: 43.2px` (2.7rem) and `#search` `padding-right: 86.4px` (5.4rem), V
`display:flex`. These exist **only** for classes (056's scoping fix, ruling 6
+ criterion 16); they are the dead-end rules of this port — once classes loses
the V, both must go (else the X steps aside for a button that no longer
exists, leaving a phantom hole), which in turn kills the `test/classes.test.js:475`
pin that matches them.

**Rules that become dead CSS on classes when `#searchDone` markup is removed:**
`styles.css:527-540` (`#searchWrap:focus-within #searchDone { display:flex; }`,
`#searchDone { … right:0 … }`, `:active`, `svg`). They are ungated and already
dead on teachers (index.html no longer has the node); classes is their last
user. No test pins them (grep `searchDone` over `test/` → only the two markup
pins listed below).

### Observed — desktop (Measured, 1280×800)

`matchMedia('(max-width:700px)') = false`; boot, focus and selection states
all show **both panes** (`#classList display:block` + `#detail display:flex|block`);
`is-list` toggles (`true` after focus) with **no visual effect**; V and X both
`display:none` (base armour); no `#searchBack`/`#searchOverlay` nodes. Desktop
is unaffected by any of this today and must stay so (056 ruling 7: the new
chrome carries base `display:none` and only the narrow media may show it).

### Tests that pin the current behavior (baseline re-verified: 127/127/0)

**`test/classes.test.js`**

1. `:444-448` — markup pin: `classes.html` must contain `id="searchDone"` and
   `id="searchClear"` (plus `searchWrap/search/suggest/classList/detail/status/
   themeCycle`). **Killed by the port** if the V markup is removed → rewrite to
   assert `id="searchBack"`, `id="searchOverlay"`, `id="overlayClear"`,
   `id="overlayName"` present and `id="searchDone"` **absent** (mirror of
   `teacher-daygroups:526-530`). No test pins node *order* in `classes.html`.
2. `:461-476`, pin at `:475` — full-CSS literal
   `#searchWrap:focus-within:has(#searchClear:not([hidden])) #searchClear`
   must survive ("rule text per issue 031"). It matches only because of the
   `body[data-page="classes"] ` prefix on `styles.css:614`. **Killed** if the
   dead V-stepping rules are deleted → rewrite (assert absence) or keep dead
   rules (not recommended).
3. `:589-595` — 'classes row click keeps the filter (G1)': the row-click
   handler slice must contain `showClass(r.label)` and must not contain
   `search.value =`. **Killed** if rows are re-wired to `selectClass(r.label)`
   → rewrite the token (the no-`search.value` half must stay).
4. `:986` — `countTok(js/classes.js, 'currentWeek = null;') === 4`
   ("every clear site drops ownership": `:405, :505, :533, :545`). A
   `showEmpty()` that owns the clear (as teachers' `showEmpty` owns
   `currentTeacher = null`, `js/teachers.js:217`) moves two sites into it →
   count becomes **3** → **killed** unless the pin is rewritten or the sites
   are kept.
5. `:1010` (`c.layout === 1` "the selection dismisses the list pane") and
   `:1026` (`c.layout === 1` "a tick never flips the pane") — these count
   `layout.classList.remove` calls inside the `classesWeekSlice()`
   harness (`:920-925`, bounds `function indexByDaySlot` → `function showClass`),
   i.e. they pin `renderWeek`'s fenced write `js/classes.js:344-347`.
   **Survives untouched** if the port keeps that fence — which is exactly what
   the post-056/051 teachers page does (`js/teachers.js:411-416`, pinned by
   `teacher-daygroups:743,751`). Only killed if the implementer deletes
   `renderWeek`'s remove line (056's literal criterion 5 said *delete* for
   `showTeacher`; the merged teachers code re-kept it inside the 051 fence —
   the classes port should follow the **code as it is now**, and this
   Reporter flags the discrepancy between 056's criterion text and the merged
   result).
6. `:977` — `countTok('new Date()') === 3` constrains the implementation (no
   new wall-clock read in a funnel).
7. `:551-559` — leaf filters (`leafRows(match.classSearch(index, q))`,
   `leafSet[r.label]`) and single-leaf gates (`leaves.length === 1`,
   `week.leaves.length !== 1`) must survive verbatim.
8. `:661-663` — CSS pins `#layout:not(.is-list) #classList`,
   `#classList { max-width: none;` survive.
9. `:545-565, :567-631, :865-911, :975-996` (except `:986`), `:998-1046`
   (except the two `c.layout` lines if the fence dies) — unaffected.

**`test/teacher-daygroups.test.js`**

10. `:425-443` — **'menu visibility is selection-driven, never blur-driven'**,
    runs on **both** page files: blur slice must contain `renderSuggest([])`
    and must **not** contain `syncList()`/`setTimeout`; the section must
    contain `layout.classList.remove('is-list')` (`:441-442` — satisfied after
    the port **only if** `syncList` is written in the
    `if (menuOpen) add else remove('is-list')` form *or* the fenced
    `renderWeek` line is kept; a `classList.toggle(...)` rewrite breaks it).
11. `:449-452` — the **classes-side assertions of the old machine**:
    `classesBlur` must not touch `searchFocused` (vacuous after a rename) and
    **`classes.indexOf('searchFocused = true') !== -1`** ("classes: focus arms
    the menu"). **Killed** by the rename to `menuOpen`/`openMenu()` → rewrite
    (per 056 criterion 17b, teachers side already rewritten; classes side is
    the residue).
12. `:471-475` — no `setTimeout` in either file; **exactly 2**
    `search.addEventListener('click'` across both files ("both pages bring the
    menu back on filter-box taps"). **Survives** if the classes click handler
    is kept (it should be — `openMenu()`).
13. `:478-523` — 'exact name selects even among partial matches (both pages)':
    classes side pins `var like = exactClass(rows, q);` (`:521`, survives) and
    **`showClass(like);`** (`:522`). **Killed** if `commit` funnels through
    `selectClass(like)` → rewrite the token (056 did the analogous rewrite for
    teachers at `:514-519`, adding a no-direct-`showTeacher(` single-funnel pin).
14. `:398-410` — pane-swap literals (`#layout:not(.is-list) #teacherList`,
    `#layout:not(.is-list) #classList`, `#layout.is-list #detail` in the narrow
    slice) + **no `@media (pointer: coarse)` anywhere** — must hold after the
    port (keep `styles.css:516-517`, add no pointer media).
15. `:525-556` (teachers nav chrome, incl. 057's radius/`:has`/narrow-only/
    anti-focus pins) and `:558-593` (teachers nav machine: `menuOpen`,
    `selectTeacher`, `showEmpty`, overlay wiring, `showTeacherFn()` vm safety)
    — teachers-only; **unaffected**, but they fix the literals the classes port
    must not disturb in the shared CSS.
16. `:45-57, :70-91` (vm harness bounds/stubs for `showTeacher`),
    `:155-170` (classes day-group structure), `:691-763` (teachers clock) —
    unaffected.

**Not pinned anywhere** (grep-verified): the `js/classes.js` V handler body
(`:611-616`), the X handler body (`:618-626`), Escape (`:554-560`),
`isCoarsePointer`/issue-007 pre-focus, `showClass`'s `:403` card-forcing line,
`searchFocused`/`lastResultCount` **declarations** in classes (only
`APP_SRC`'s `lastResultCount` is asserted dead, `teacher-daygroups:561`),
empty-state markup/CSS, `styles.css:527-540` (the V rules).

### Existing behaviors the port must preserve or deliberately kill (056 mirror)

- **Preserve — issue-007 pre-focus rules**: coarse pointer ⇒ no pre-focused
  suggest row; Enter/Tab commit the typed query until an explicit pick
  (`js/classes.js:15-24, 418-422, 561-570, 583-588`). Unpinned, phone-visible.
- **Preserve — exact-class select** ("exact names select", commit `e872489`
  cited by the coordinator; **not re-verified — this Reporter runs no git**):
  `js/classes.js:513-519` + `:534-543` (`classWeek(q).leaves===1` → `like` →
  `rows.length===1`), pinned `teacher-daygroups:510-522`.
- **Preserve — "taps on the filter always bring the menu back"** (same commit):
  both the focus (`:590`) and click (`:597`) handlers; pinned by the
  exactly-2-clicks pin (`:473-475`).
- **Preserve — selection-driven visibility / blur purity** (commit `3909bd9`,
  **not re-verified — no git**): blur body stays exactly
  `renderSuggest([]); renderGhost();` (`js/classes.js:604-607`); the back
  control must be state-gated (`#layout.is-list`), never focus-gated (anti-D4).
- **Preserve — Escape** never deselects (after 056: suggest-open ⇒ drop
  suggest, else `closeMenu()`); unpinned.
- **Preserve — filter never rewritten by selection** (`:212-215` comment,
  measured T4b; the sanctioned commit write `:480` stays) and **empty filter ⇒
  nothing selected** (`:505, :530-533`).
- **Preserve — issue-051 clock ownership**: `currentWeek` cleared on every
  deselect (`:405, :505, :533, :545` — see pin 4) and the
  `if (!tickNow)` selection fence in `renderWeek` (`:344-347` — see pins 5).
- **Kill — the V on classes** (markup `classes.html:43-45`, var
  `js/classes.js:70`, handler `:611-616`, CSS `styles.css:527-540`, and the
  two `body[data-page="classes"]` stepping rules `:614, :619`) — replaced by
  `#searchBack` (056 ruling 6 analog; its keyboard-dismissal job is covered
  because `closeMenu()` blurs). 056 kept `#searchDone` CSS *because classes
  still used it* — that justification disappears with this port.
- **Kill — `searchFocused` / `lastResultCount`** (→ `menuOpen` /
  `selectedClass`; `lastResultCount`'s only reader is the old derivation),
  **`picked` + the trailing `if (!picked) syncList();` special case**
  (`js/classes.js:529, 547-549` — the classes twin of teachers' deleted
  `if (!selected) syncList();`), **the X's `search.focus()`** (`:623`), and
  **the focus-gated back-control pattern itself**.

### Expected (binding)

- The user's instruction, verbatim: **"port to classe.html"** — port issue
  056's mobile navigation architecture (and issue 057's overlay polish) from
  the teachers page to `classes.html` + `js/classes.js`, with class vocabulary
  in place of teacher vocabulary.
- Restated as the three-state spec of **issue 056** (its Description/Expected
  section is the binding source, adapted to classes):
  - **state="empty"**: no class selected, no list shown. The default (the
    kaomoji "No Class Selected" page, measured at T1).
  - **state="list"**: shows a **back button** and a filterable class list.
    Entered by focusing the filter box. Left by selecting a class
    (→ state="class") or pressing the back button (→ the earlier state —
    "empty" when nothing is selected). When the filter has text, the filter
    box shows an X that erases the filter.
  - **state="class"**: a class is selected; its detail (week grid / day cards)
    shows as usual; the search box is overlaid with the **class name
    centered**, an **X on the left** (→ state="empty"), and a **dropdown
    symbol on the right**. Pressing the overlay moves to state="list".
  - User's notes: pressing the filter box shows the list AND prepends a back
    arrow that **replaces the "hide the keyboard" button completely**; the back
    arrow dismisses the list, removes focus, and dismisses itself.
- Issue 057's polish carries over with the overlay: `border-radius: 8px`
  matching `#searchWrap` (`styles.css:566`) and the input hidden while the
  overlay shows via `#searchWrap:has(#searchOverlay:not([hidden])) #search`
  (`styles.css:570`) — both **already class-ready** (measured by injection).
- The same governance as 056 applies: how the port is wired (what happens to
  the suggest overlay, the `lastResultCount`-vs-`menuOpen` derivation, the
  `renderWeek` fence, and the pin churn) is the Maintainer's call.

## Root cause

Same root cause as issue 056, mirrored: the classes mobile state machine is
**implicit** — three orthogonal pieces nobody composes into named states:

1. the derived class `is-list` on `#layout`, computed as *"search box focused
   **and** the most recent render did not leave exactly one result"*
   (`js/classes.js:105-108`, `lastResultCount` written in `renderList`
   `:192`);
2. the boolean `searchFocused` (`:95`, set `true` only by focus `:591` / click
   `:598`, `false` only by the V `:614`);
3. **no selection variable at all** — "a class is selected" exists only as the
   current content of `#detail` written by `renderWeek` (`:343`, `<h2>` +
   day cards) plus the `markActive` highlight in a hidden list
   (`activeKey`, `:97, :220-228`).

Consequences (all measured above):

1. **No "deselect" edge.** Nothing empties `#detail` except `onInput`/`commit`
   on an *empty query* (`:505, :530-533`) — the empty page is a side effect of
   an empty filter, never a state the page can be put into. Selection never
   writes `search.value` on the row-tap path (`:215`), and no handler clears
   the detail on blur/Escape/back.
2. **The X means "clear the filter", not "deselect"** (`:618-626`): it clears,
   **re-focuses** (`:623`), and `commit()`s; focus arms the menu (`:590-600`),
   so the result is always state=list with the empty state rendered into the
   *hidden* detail (measured A2) — never state=empty in one step.
3. **The only "back to cards" control is the V, and it is focus-gated**
   (`classes.html:43-45`, handler `:611-616`, CSS `styles.css:527`). In
   state=class the input is unfocused, so the control that would leave list
   mode does not exist; in an unfocused list state it is invisible too
   (measured A8 — the D4 landmine). There is no back-button markup anywhere in
   `classes.html:40-50`.
4. **Three writers of `is-list`**: focus/click (`:590-600`), the V (`:614`),
   and the render path (`renderWeek`'s fenced remove `:345` + `showClass`'s
   nomatch remove `:403`), with `commit` needing the special case
   `if (!picked) syncList();` (`:547-549`) so a selection is not immediately
   undone by the trailing re-show. Their interaction *is* the machine.
5. **The classes-specific amplifier**: the `lastResultCount !== 1` half of the
   derivation makes the "filter tap ⇒ list" edge silently fail whenever the
   current filter renders exactly one row — which is *every* exact-label
   selection made through the commit/suggest path (measured A4/A4p). State=class
   with an exact filter has **no outgoing navigation edge at all** except the
   X (→ list) and the detail tap (→ nothing).
6. The empty state is plain markup (`emptyStateHTML` `:180-187`, hop listener
   `:151-171`) hidden by narrow CSS while `is-list` (`styles.css:517`) —
   reachable again only by re-rendering it *and* clearing `is-list`, i.e. the
   measured X→V (2 taps) or filter→junk→X→V (4 taps) dances.

### Where the change lands (for the Maintainer)

- `js/classes.js`: element vars (`:69-71`), state block (`:95-96`),
  `syncList` (`:105-108`), `syncClear` (`:109-111`) + new
  `syncOverlay/openMenu/closeMenu/showEmpty/selectClass` funnels (056 put them
  right after `syncClear`), `renderList`'s `lastResultCount` (`:192`),
  row click (`:215`), `renderWeek` fence (`:344-347` — see pin 5),
  `showClass` (`:398-410`), `onInput` (`:498-508`), `commit` (`:521-550`),
  keydown/Escape (`:553-589`), focus/click/blur (`:590-607`), V/X handlers
  (`:609-626`), boot (`:628-634`).
- `classes.html:40-50`: replace the V with `#searchBack` + `#searchOverlay`
  (056's markup block, class wording: `aria-label="Clear the selection"` stays
  semantic-neutral).
- `styles.css`: add nothing new is required for the chrome (shared rules light
  up by markup — measured); **delete** `:527-540` (V rules, now dead
  everywhere) and the two `body[data-page="classes"]` stepping rules
  `:614, :619` (or re-scope — either way `classes.test.js:475` must be
  reconciled); keep `:618` (X slot).
- Tests: `test/classes.test.js` (pins 1–4 above) and
  `test/teacher-daygroups.test.js` (pins 10, 11, 13) need rewrites; pins 14–16
  and the teachers chrome/machine tests are the regression guard rails.

## Repro steps

Commands (from the worktree root
`/home/user/.local/share/opencode/worktree/1de5bb/058-classes-mobile-nav`):

```
node --test                                  # baseline: 127 tests, 127 pass, 0 fail
python3 -m http.server 8058                  # PID recorded, killed by PID afterwards
curl -s -o /dev/null -w '%{http_code}' http://localhost:8058/classes.html   # 200
curl -s -o /dev/null -w '%{http_code}' http://localhost:8058/index.html     # 200
```

Browser: Playwright (MCP), Chromium, **viewport 390×844**, URL
**http://localhost:8058/classes.html** (CSS switches at
`styles.css:489` `max-width: 700px`; default pointer is fine —
`(pointer: coarse)` = false, so the suggest pre-focus behaves desktop-like).

1. **Initial** — load. Observed: no `is-list`, `#classList` hidden (94 rows in
   DOM), `.empty-state` "No Class Selected" + kaomoji filling `#detail`, V
   hidden, X hidden, no `#searchBack`/`#searchOverlay` nodes.
2. **Focus** — tap `#search`. Observed: `is-list` set, 94 rows, empty state
   hidden (not destroyed), V appears right.
3. **Type** — `GLSI`. Observed: 16 rows, X beside the V, **no suggest**
   (interior-node cap); continue to `GLSI3D` → suggest opens with 2 rows +
   ghost.
4. **Select** — press Enter (pre-focused `GLSI3D1` row → `acceptSuggest` →
   `commit`) or `fill('GLSI3D1')` (auto-jump). Observed: `is-list` removed,
   `<h2>LCS3-GLSI_D Groupe 1</h2>`, value `"GLSI3D1"`, focus kept, V + X
   visible. (Selecting by tapping a `#classList` row instead blurs: V and X
   disappear immediately, value stays `""` — measured.)
5. **Hide the keyboard** — tap the V. Observed: input blurred (`BODY`), V
   hidden, list stays hidden, detail unchanged.
6. **Dead-end walk** (from step 5's state) — enumerate every affordance:
   - tap the filter box → **nothing but focus/V** (the 1-row derivation blocks
     the list); V again → blur only. *Never empty; often not even the list.*
   - tap the detail → nothing changes.
   - Escape (after focusing) → nothing (value/selection untouched; no Esc key
     on mobile anyway).
   - tap X → filter cleared **but the list opens** (empty state rendered into
     the hidden detail); tap V once more → the empty page returns (2 taps,
     via the list).
   - empty-filter variant (focus → tap a `#classList` row): X hidden, V hidden
     — no clear control exists; only filter → type junk → X → V (4 taps)
     restores the empty page.
   - tap outside (`#status`) while the list is open → list stays visible with
     the V hidden; re-tap the box → V back.
7. **Desktop** — resize **1280×800**, repeat 1–5: both panes visible in every
   state, `is-list` toggles without visual effect, V/X `display:none`, no
   overlay/back chrome (nodes absent).
8. **Shared-CSS proof** — on `classes.html` at 390×844, inject `#searchBack`
   and `#searchOverlay` into `#searchWrap` via `evaluate` (diagnostic only):
   computed `#searchBack` = `flex / absolute / left 0 / width 43.19px` with
   `is-list`, `none` without; `#searchOverlay:not([hidden])` = `flex /
   border-radius 8px / z-index 3` with `#search` `visibility: hidden`
   (057 rule fires), back to `visible` when `[hidden]`. ⇒ 056/057 CSS needs
   **zero new selectors** on classes; only markup + JS change.
9. Re-run `node --test` after any change: **127 tests** (or the Maintainer's
   revised total), **0 fail**; kill the server by its recorded PID.

## Discussion

### Maintainer decision (2026-10-20)

**Verdict — valid, in scope, and binding as a straight port of the *merged*
056/057 teachers architecture.** The Reporter's measurements stand (dead end
confirmed, T6 divergence confirmed, shared-CSS injection proof accepted — I
re-read `styles.css:541-591` and it carries no `body[data-page=…]` gate, so the
chrome lights up on classes from markup alone; 057's polish is already there
at `:566`/`:570` and must be **verified, not re-added**). Baseline re-verified
in this worktree before deciding: `node --test` → **127 tests, 127 pass, 0
fail**. Scope = `classes.html`, `js/classes.js`, `styles.css` (deletions
only), `test/classes.test.js`, `test/teacher-daygroups.test.js` (its
classes-side assertions only). Ambiguity rulings, all binding:

1. **State model** — mirror the merged teachers shape exactly: two facts
   `var menuOpen = false;` and `var selectedClass = null;` (replacing
   `searchFocused` + `lastResultCount`), one derived state
   `menuOpen ? 'list' : selectedClass ? 'class' : 'empty'`, and the five
   funnels `syncList` / `syncOverlay` / `openMenu` / `closeMenu` /
   `showEmpty` / `selectClass`, placed immediately after `syncClear`
   (`js/classes.js:111`), exactly as `js/teachers.js:192-232`. No third
   `navState` variable; blur writes neither fact (3909bd9 kept literally —
   its body `renderSuggest([]); renderGhost();` is pin-locked at
   `teacher-daygroups:438-440` anyway).
2. **`is-list` write-site reconciliation** — classes has three writers today;
   post-port exactly these writes exist and no others:
   - `syncList()` — the **menu-derived** writer, body *exactly*
     `if (menuOpen) layout.classList.add('is-list'); else layout.classList.remove('is-list');`
     (the `if/else` **add/remove form, not `classList.toggle`** — see risk 2).
     Only `openMenu`/`closeMenu`/`selectClass`, `onInput`'s trailing call and
     boot call it.
   - `renderWeek`'s fenced `if (!tickNow) { if (layout)
     layout.classList.remove('is-list'); syncClear(); }` (`js/classes.js:344-347`)
     — **kept byte-identical, zero edits to `renderWeek`**. This follows the
     code-as-merged teachers precedent (`js/teachers.js:411-416`), not 056's
     literal criterion-5 wording: pins `classes.test.js:1010/1026` (and
     `:1011/:1027` for the `syncClear` half) depend on it inside the
     `classesWeekSlice()` harness. It is the selection/render-path writer,
     fenced off the live path.
   - `showClass`'s nomatch remove (`js/classes.js:403`) — kept verbatim
     (defensive: every real caller is pre-validated by the leaf gates, and
     `selectClass`'s `syncList` runs after it, so the two never disagree).
     It also keeps pin `classes.test.js:559`'s `week.leaves.length !== 1`
     text alive.
   The focus/click handlers, the V handler and `commit`'s `if (!picked)
   syncList();` stop writing `is-list` entirely (they funnel through
   `openMenu`/`selectClass`).
3. **`currentWeek` ownership — `showEmpty()` owns the clear.** Post-port the
   `currentWeek = null;` sites are **exactly 3**: inside `showEmpty()` (which
   absorbs the two old caller-side clears at `:505` onInput-empty and `:533`
   commit-empty), plus the two nomatch branches that never reach `showEmpty`
   (`showClass` `:405`, commit `:545`). This mirrors the teachers precedent
   (`showEmpty` owns `currentTeacher = null`, `js/teachers.js:217`, pinned by
   `teacher-daygroups:706-711`) and it is the **structural fix for the
   051×056 bug class**: the overlay X on classes is a deselect, so without
   the funnel owning the clear, a later clock tick would repaint the class
   grid over "No Class Selected" (the exact bug 051's integration fix closed
   on teachers). Decided now, not after: pin `classes.test.js:986` is
   rewritten 4 → **3** and a new pin asserts `showEmpty`'s slice contains
   `currentWeek = null;`. Caller-side nulls are *not* kept for the empty
   paths (rejecting the status quo ante) and not duplicated (rejecting a
   count of 4/5).
4. **T6 divergence — deliberate behavior change, confirmed.** After the port,
   tapping the filter box in state=class **always** opens the list
   (`focus`/`click` → `openMenu()`), regardless of how many rows the current
   filter renders. The `lastResultCount !== 1` half was an artifact of the
   implicit derivation, not a feature: it is the classes-specific amplifier
   (root cause 5) and 056's spec ("pressing the filter box shows the list")
   binds the new behavior. Accordingly **die**: `lastResultCount` (decl `:96`
   + assignment `:192`), `searchFocused` (`:95`), `picked` + the trailing
   `if (!picked) syncList();` special case (`:529, :536-542, :547-549`,
   replaced by 056's no-trailing-syncList comment), and the V machinery.
5. **Markup/CSS deaths, overlay-X semantics, filter preservation.**
   - `classes.html:43-45` `#searchDone` (V) is **replaced** by `#searchBack`
     (between input and `#searchClear`) and `#searchOverlay`
     (`#overlayClear`/`#overlayName`/`.overlay-drop`, between `#searchClear`
     and `#suggest`) — node order identical to `index.html:42-54`, SVG paths
     verbatim.
   - CSS **deletions only, zero additions**: the V narrow rules
     `styles.css:524-540` (comment + `:527-540`), the V-stepping rules
     `:614` and `:619` with their dedicated comments (`:608-613`, `:615-617`)
     and the now-stale "stacking rule below" sentence in the `#searchClear`
     comment (`:592-596`), and the dead base rule + comment `:127-129`
     (`#searchDone` now has no node on *any* page — 056's reason for keeping
     it disappears with this port; grep confirms no test pins it). Keep
     `:618` `#search { padding-right: 2.7rem; }` (the X slot) and everything
     `:131-133`/`:541-591` untouched (056's nav chrome, 057's polish — the
     teachers nav-chrome test `:525-556` pins those literals).
   - **Overlay X on classes = deselect only**: `stopPropagation +
     showEmpty()` → "No Class Selected" kaomoji (state=class implies
     `menuOpen === false`, so the result is unambiguously empty). It never
     touches the filter.
   - **Filter text preserved across every transition** (056 ruling 5):
     selection, deselection, back, overlay taps and Escape never write
     `search.value`; only `#searchClear`/accept-suggest/typing do (the
     sanctioned `:480` commit write stays).
   - **X handler loses `search.focus()`** (056 criterion 11 mirror); **Escape**
     becomes suggest-open? drop suggest : `closeMenu()` — never deselects;
     **row-tap / commit / auto-jump all funnel through `selectClass`**
     (killing the `showClass(r.label)` pin `classes.test.js:589-595` and the
     `showClass(like);` pin `teacher-daygroups:522`, both rewritten).
   - **`#overlayName` shows the fact `selectedClass`** (the leaf label, e.g.
     "GLSI3D1"), not `week.name` — the overlay renders from state, and
     reading `#detail h2` or storing a second name would be DOM-as-state,
     the very pattern this issue removes. The `#detail` heading keeps
     `week.name` as today.
6. **Desktop (>700px)** — zero visual/layout change: no CSS is added, the
   new chrome carries base `display:none` (`:132-133`, added by 056) and only
   narrow rules show it, and JS reads no width/pointer (pin
   `teacher-daygroups:408-409` holds). One deliberate *behavioural* delta,
   identical to 056 ruling 7/9: selection now blurs the input on all
   viewports (glow/caret clear only; Enter/suggest-accept used to keep
   focus) — do not "fix" this with a viewport check. Asserted in the walk
   (step 13), not in a new test.
7. **Tests** — turn the Reporter's inventory into the exact per-pin table in
   criterion 16/17 below: every killed pin is rewritten **in place** (same
   `test(...)` block, so the count is unchanged), and the two new classes
   tests mirror the merged teachers pair (`nav chrome` + `nav machine`) and
   live in `test/classes.test.js` (that file owns the classes markup/CSS
   pins; `teacher-daygroups` stays the teachers+shared file). Expected
   **`node --test` → 129 tests, 129 pass, 0 fail** (baseline 127 re-verified
   here; +2 new tests, 0 deletions, every other change a rewrite in place).
8. **Scope** — classes-only; all issues 049-057 are merged, no parallel
   worktree in flight. File list: `classes.html`, `js/classes.js`,
   `styles.css`, `test/classes.test.js`, `test/teacher-daygroups.test.js`
   (+ this issue's `### Fix implemented` entry). **No-go**: `js/teachers.js`,
   `index.html`, `js/match.js`, `js/model.js`, `js/color.js` untouched;
   `teacher-daygroups` edits limited to its classes-side assertions
   (`:449-452` and the `showClass(like);` line at `:522`) — its teachers
   chrome/machine/051 tests (`:398-410`, `:425-448`, `:471-521`, `:525-593`,
   `:595-779`) must pass unmodified.

**Architectural direction**

*Transition table* (facts: menuOpen M, selectedClass C; `is-list` ⟺ M;
overlay visible ⟺ C && !M; back arrow visible ⟺ M):

| State | Event | M | C | → State | Effects |
|---|---|---|---|---|---|
| — | boot | false | null | empty | `renderList(full leaf catalogue)`, `showEmpty()`, `syncList()`, `syncClear()` |
| empty | tap/focus filter box | true | null | list | `openMenu()`; is-list added; back arrow appears (CSS, state-gated) |
| list | type (`onInput`) | true | — | list | list/suggest/ghost re-render; empty query → `showEmpty()`; `rows.length===1` → `selectClass(rows[0].label)`; trailing `syncList()` |
| list | select (row tap / suggest tap / Enter / Tab / auto-jump) | false | label | class | `selectClass(ref)`: `showClass` renders the week, `search.blur()`, `menuOpen=false`, `syncList()`, `syncOverlay()`; overlay shows the label |
| class | tap overlay (anywhere but its X) | true | label | list | `openMenu(); search.focus();` — back arrow + filtered list, class stays selected under it |
| class | tap overlay X | false | null | empty | `showEmpty()`: kaomoji + `markActive(null)` + **`currentWeek = null`**; filter preserved; overlay hides |
| list | tap back arrow | false | unchanged | class if C else empty | `closeMenu()` (blurs); back self-hides with the menu |
| list | tap `#searchClear` (text present) | true | null | list | erase → `commit()` → empty branch → `showEmpty()`; stays list |
| empty | tap `#searchClear` (preserved text) | false | null | empty | erase; stays empty |
| list | blur (tap outside) | true | — | list | PURE: suggest+ghost drop only; list persists **with visible back** (anti-D4) |
| list | Escape | unchanged | unchanged | suggest open → stay list (suggest drops); else = back row | never deselects |
| any | desktop >700px | same machine | same | same | `is-list` inert; back/overlay never display (base armour) |

*Code shape* — the exact funnel bodies the Implementer must land (vars
`searchBack`/`searchOverlay`/`overlayName`/`overlayClear` replace the
`searchDone` var at `:70`):

```js
function syncOverlay() {
  searchOverlay.hidden = selectedClass === null || menuOpen;
  if (selectedClass !== null) overlayName.textContent = selectedClass;
}
function openMenu() { menuOpen = true; syncList(); syncOverlay(); }
function closeMenu() { menuOpen = false; search.blur(); syncList(); syncOverlay(); }
// every deselect funnels through here; the filter text is preserved.
// dropping currentWeek here (not at each caller) means no deselect path
// can leave tick ownership behind and repaint over the empty page
function showEmpty() {
  selectedClass = null;
  currentWeek = null;
  detail.innerHTML = emptyStateHTML();
  markActive(null);
  syncOverlay();
}
// the single selection funnel: every path that picks a class lands here;
// blurs because the overlay owns the box in state=class
function selectClass(ref) {
  selectedClass = ref;
  showClass(ref);
  search.blur();
  menuOpen = false;
  syncList();
  syncOverlay();
}
```

(`syncOverlay` uses the **merged** teachers derivation
`selectedClass === null || menuOpen` — 056's fix-implemented note 1; the
overlay must be hidden in state=list, not just when nothing is selected.)
`renderWeek`, `showClass`, the suggest/ghost machinery, the kaomoji/hop
listeners, the clock, and issue-007 pre-focus rules are **out of edit scope**.

*Deaths*: `#searchDone` markup/var/handler + its CSS (`:127-129`, `:524-540`);
the two `body[data-page="classes"]` stepping rules (`:614`, `:619`) and the
`:475` pin that matched them; `searchFocused`, `lastResultCount`, `picked` +
`if (!picked) syncList();`; the X's `search.focus()`; the unconditional
Escape `return`; the focus-gated back-control pattern itself; the four
caller-side `currentWeek = null;` on the empty paths (two move into
`showEmpty`, two stay as nomatch-only clears).

*Preserved verbatim*: blur purity; "taps on the filter always bring the menu
back" (both handlers, the exactly-2-clicks pin `teacher-daygroups:473-475`);
exact-name-selects (`var like = exactClass(rows, q);` + leaf gates); the
filter-never-rewritten-by-selection invariant; empty filter ⇒ nothing
selected; issue-007 coarse rules; the `renderWeek` fence; `activeKey` (a
list-highlight cache owned by `markActive`, not a nav fact); the pane-swap
CSS `:516-517` and the no-pointer-gate rule.

*Rejected alternatives*: (a) keeping T6's `≠1 rows` conditional — a special
case guarding a state that no longer exists; (b) keeping caller-side
`currentWeek` nulls in `showEmpty`'s callers — leaves the overlay X outside
the ownership rule, i.e. the 051×056 bug shipped by construction; (c)
`classList.toggle('is-list', menuOpen)` — cleaner-looking but drops the
literal `layout.classList.remove('is-list')` out of `syncList` and leans
solely on the fence for pin `:441-442` (see risks); (d) an explicit
`navState` string — a third variable desyncable from two facts; (e)
re-adding 057/056 CSS "for classes" — the shared rules already fire
(measured by the Reporter's injection); (f) keeping the V *beside* the back
arrow — two backs for one edge, and the stepping rules would then be alive
only to serve a redundant button; (g) folding `activeKey` into
`selectedClass` — a real simplification, but it churns `renderList`/
`markActive`/nomatch interactions for zero user-visible gain and is out of
scope; (h) adding validation to `showClass`/`selectClass` for the
unreachable nomatch-through-selectClass edge — the leaf gates make it
unreachable and pin `:559` owns the gate.

**Acceptance criteria** (blind-implementer complete; diffs limited to the
five files of ruling 8 + this issue's discussion entry)

1. `js/classes.js:70` — delete `var searchDone = …`; add
   `searchBack`, `searchOverlay`, `overlayName`, `overlayClear`
   (`getElementById` lines, same order as `js/teachers.js:61-64`).
2. `:95-96` — replace `searchFocused`/`lastResultCount` with the comment
   block (class wording: `'class'` state, `selectClass`/`showEmpty` named in
   the last line) + `var menuOpen = false;` + `var selectedClass = null;`.
   Keep `activeKey`/`currentWeek` declarations untouched.
3. `:102-108` — `syncList` comment updated to "present iff the menu is open…
   sole menu-derived writer" and body exactly the `if (menuOpen) …add('is-list')
   else …remove('is-list')` form (no `toggle`).
4. Immediately after `syncClear` (`:111`) — add `syncOverlay`, `openMenu`,
   `closeMenu`, `showEmpty`, `selectClass` **in that order**, bodies exactly
   as in the direction block above.
5. `:192` — delete `lastResultCount = rows.length;`. `:215` — row click
   becomes `li.onclick = function () { selectClass(r.label); };` (comment
   about the filter staying untouched kept).
6. `renderWeek` (`:243-349`) and `showClass` (`:398-410`) — **zero edits**.
7. `onInput` (`:505-507`) — empty branch → `if (!q.trim()) showEmpty();`
   ; auto-jump → `else if (rows.length === 1) { selectClass(rows[0].label); }`;
   trailing `syncList();` stays.
8. `commit` (`:521-550`) — restructure to: `syncClear(); renderSuggest([]);
   renderGhost();` then `var rows = leafRows(match.classSearch(index, q));
   renderList(rows); var like = exactClass(rows, q);` then
   `if (!q.trim()) { showEmpty(); syncList(); return; }` then the chain
   `if (model.classWeek(groups, q).leaves.length === 1) selectClass(q);
   else if (like) selectClass(like); else if (rows.length === 1)
   selectClass(rows[0].label); else if (!rows.length) { detail.innerHTML =
   '<p class="nomatch">No match for "' + esc(q) + '".</p>'; currentWeek = null; }`
   followed by the comment `// no trailing syncList: a selection closes the
   menu and syncList cannot resurrect a closed one`. Delete `picked` and its
   special case. Keep `var like = exactClass(rows, q);` and both leaf-gate
   literals verbatim (pins `:551-559`).
9. Escape (`:554-559`) — body becomes `e.preventDefault(); if
   (!suggest.hidden) { renderSuggest([]); renderGhost(); return; }
   closeMenu();` with 056's comment; Tab/Arrow/Enter untouched.
10. focus (`:590-593`) and click (`:597-600`) — bodies become
    `openMenu();` (keep the "always brings the menu back" comment and the
    exactly one `search.addEventListener('click'` occurrence). blur
    (`:604-607`) — body unchanged; comment updated to "selection/back-driven,
    never blur-driven".
11. `:609-616` — delete the whole V handler; add after it (056's blocks,
    class wording): `if (searchBack) searchBack.addEventListener('click',
    function () { closeMenu(); });` with the "a selected class stays
    selected" comment; `if (searchOverlay) searchOverlay.addEventListener('click',
    function () { openMenu(); search.focus(); });`; `if (overlayClear)
    overlayClear.addEventListener('click', function (e) { e.stopPropagation();
    showEmpty(); });`.
12. X handler (`:618-626`) — drop `search.focus();` (body:
    `search.value = ''; syncClear(); commit();`), comment updated per 056
    criterion 11 (deselect is `#overlayClear`).
13. Boot (`:628-634`) — replace `detail.innerHTML = emptyStateHTML();` with
    `showEmpty();`; order stays `renderList(...)` → `showEmpty();` →
    `syncList();` → `syncClear();` → `clock.subscribe(onTick);`.
14. `classes.html:43-45` — remove the `#searchDone` button; insert
    `#searchBack` between `<input>` and `#searchClear`, and `#searchOverlay`
    (with `#overlayClear`, `#overlayName`, `.overlay-drop`) between
    `#searchClear` and `#suggest`, **byte-for-byte the `index.html:42-54
    blocks** (`aria-label="Back"`, `aria-label="Clear the selection"`,
    chevron paths `M15 6l-6 6 6 6` / `M6 6l12 12M18 6L6 18` / `M6 9l6 6 6-6`).
15. `styles.css` — deletions only: `:127-129` (V base comment + rule),
    `:524-540` (V narrow comment + rules), `:608-614` and `:619` (stepping
    comments + rules), and the stale stacking-rule sentence in the
    `#searchClear` comment `:592-596` (rule text of `:597-607` and `:618`
    unchanged). **Add nothing** — verify 057's radius/`:has` and 056's
    chrome in place. Do not reformat `:541-591` (teachers pins read those
    literals).
16. `test/classes.test.js` — four rewrites in place + two new tests:
    - `:444-448` markup pin — replace `'id="searchDone"'` with
      `'id="searchBack"', 'id="searchOverlay"', 'id="overlayClear"',
      'id="overlayName"'` and add `assert.ok(html.indexOf('id="searchDone"')
      === -1, 'the V-chevron is gone from the classes page');` (mirror of
      `teacher-daygroups:526-530`). Keep every other id in the list.
    - `:475` — replace the `indexOf(...) !== -1` with the three assertions:
      `css.indexOf('#searchWrap:focus-within:has(#searchClear:not([hidden])) #searchClear') === -1`
      ("the V-stepping rules died with the V"), `css.indexOf('body[data-page="classes"] #searchWrap:focus-within:has(#searchClear:not([hidden])) #search') === -1`,
      and `css.indexOf('#search { padding-right: 2.7rem; }') !== -1` ("the X
      slot survives"). Keep `:462-474` untouched; test name unchanged.
    - `:594` — `showClass(r.label)` → `selectClass(r.label)`; the no-`search.value =`
      half and the `acceptSuggest` write pin stay.
    - `:986` — expected count **4 → 3**, comment "the empty funnel owns the
      deselect clear; the two nomatch branches (which never reach showEmpty)
      drop it themselves".
    - **New test A** (append at EOF under a `// ---- mobile nav (issue 058)
      ----` header), `'classes nav chrome: state-gated back arrow, class overlay, V gone'`:
      `classes.html` contains the four new ids and NOT `id="searchDone"`;
      `styles.css` contains **no `#searchDone` at all**; base slice (before
      `@media (max-width: 700px)`) contains `#searchBack { display: none; }`
      and `#searchOverlay { display: none; }`; narrow slice contains
      `#layout.is-list #searchBack` and `#searchOverlay:not([hidden])`, and
      the overlay rule slice (up to its `}`) contains `border-radius: 8px`
      plus `#searchWrap:has(#searchOverlay:not([hidden])) #search` (057
      verified-from-classes); full CSS contains no
      `#searchWrap:focus-within #searchBack` (anti-D4) and no
      `#searchWrap:focus-within #searchDone`.
    - **New test B**, `'classes nav machine: single selection/empty funnels, harness-safe week slice'`:
      `CLASSES_SRC` contains `var menuOpen = false;`, `var selectedClass = null;`,
      and NOT `var lastResultCount`, NOT `searchFocused`, NOT `searchDone`;
      the week slice (`indexOf('function indexByDaySlot')` →
      `indexOf('function showClass')`) contains none of `menuOpen`,
      `search.blur`, `syncOverlay`, `selectClass` (week-harness safety —
      that sandbox stubs only `layout.classList.remove` + `syncClear`);
      `fnBody('function syncList()')` (bounded by the first `\n    }`) has
      `classList.add('is-list')`, `classList.remove('is-list')`, not
      `toggle(`; `fnBody('function selectClass(ref)')` has
      `selectedClass = ref`, `showClass(ref)`, `search.blur()`,
      `menuOpen = false`, `syncOverlay()`; `fnBody('function showEmpty()')`
      has `selectedClass = null`, **`currentWeek = null;`**,
      `emptyStateHTML()`, `markActive(null)`; `fnBody('function onInput()')`
      has `showEmpty();` and `selectClass(rows[0].label)`; the row wiring
      (`function renderList(sections)` → `function markActive(key)`) has
      `selectClass(r.label)`; the commit slice
      (`function commit()` → `search.addEventListener('input'`) has
      `selectClass(q)`, `selectClass(like)`, `selectClass(rows[0].label)`
      and **no `showClass(`**; the `openMenu`/`closeMenu` slices have
      `menuOpen = true` / `menuOpen = false` + `search.blur()` +
      `syncOverlay()`; focus and click handler slices have `openMenu()`;
      the `searchBack` listener slice has `closeMenu()`; the
      `searchOverlay` listener slice (up to its `showEmpty();`) has
      `openMenu()`, `search.focus()`, `stopPropagation`, `showEmpty()`; the
      `searchClear` click slice has **no `search.focus()`**; the keydown
      slice contains `closeMenu();`; the boot tail (from `// initial
      paint` to `clock.subscribe`) contains `showEmpty();`.
17. `test/teacher-daygroups.test.js` — two classes-side rewrites only:
    - `:449-452` — replace the two `searchFocused` assertions with:
      a `['menuOpen', 'openMenu', 'closeMenu']` absence loop over
      `classesBlur` (same as the teachers block above it), **and** (after
      the existing teachers focus/click pins, where `fnSlice` is in scope)
      the mirrored classes assertions: `fnSlice(classes, 'function openMenu()')`
      contains `menuOpen = true`; `fnSlice(classes, 'function closeMenu()')`
      contains `menuOpen = false` and `search.blur()`; `handlerSlice(classes,
      "addEventListener('focus'")` and `handlerSlice(classes,
      "search.addEventListener('click'")` each contain `openMenu()`. Keep
      the both-file `setTimeout` absence and the exactly-2-clicks pin.
    - `:522` — `showClass(like);` → `selectClass(like);` (message: "exact
      class label selects through the funnel"); `:521`'s `var like = …`
      pin and every teachers-side assertion stay byte-identical.
18. Expected result: **`node --test` → 129 tests, 129 pass, 0 fail**
    (baseline 127 re-verified; +2 = the two new classes tests; all other
    changes are rewrites inside existing `test(...)` blocks; zero
    deletions). Justification per ±: +2 (criteria 16 A/B), nothing else may
    move — if any other count changes, a pin outside the table was edited.
19. **Browser verification (required — I have re-read the code but the
    machine is runtime behavior):** serve `python3 -m http.server 8058` from
    the worktree root, record the PID in a file, kill **by PID** afterwards
    (`pkill -f` self-matches — do not use it); `curl -s -o /dev/null -w '%{http_code}'`
    for `/classes.html`, `/index.html`, `/styles.css`, `/js/classes.js`,
    `/js/teachers.js` → all 200; `node --test` → 129/129; then
    Playwright/Chromium at **390×844** on
    `http://localhost:8058/classes.html`, asserting exactly:
    1. **Load** — no `is-list`; `#classList` hidden (94 `li[data-key]`);
       `.empty-state` visible with "No Class Selected"; `#searchOverlay`
       `[hidden]` + `display:none`; `#searchBack` `display:none`;
       `#searchClear` `hidden`; **`document.getElementById('searchDone') === null`**.
    2. **Focus `#search`** — `is-list` set; list `display:block` (94 rows);
       `#searchBack` `display:flex` with its bbox hugging the box's LEFT
       edge (x ≈ wrap x + 1px, width 43.2px); `#detail` hidden; overlay
       still hidden; no V node.
    3. **Type `GLSI`** — 16 rows; `#searchClear` `display:flex` at the
       right edge (right: 0 — no stepping); back still `flex`.
    4. **Tap X** — value `""`; 94 rows; X `hidden`; `is-list` still set
       (state=list, empty state rendered behind).
    5. **`fill('GLSI3D1')`** (auto-jump) — `is-list` gone; `#detail h2`
       = `LCS3-GLSI_D Groupe 1`; `#searchOverlay:not([hidden])` bbox
       contains the input's; `#overlayName` text **`GLSI3D1`**;
       `document.activeElement !== #search` (selection blurs — ruling 6
       delta); overlay X at left, chevron at right;
       `getComputedStyle(#search).visibility === 'hidden'` (057);
       overlay `border-radius: 8px`; value still `GLSI3D1`.
    6. **Tick-liveness probe (051)** — set `#detail h2`'s `textContent` to
       `TICKPROOF`, then force one clock tick (`page.clock.fastForward` if
       the server exposes it, else `document.dispatchEvent(new
       Event('visibilitychange'))` — the clock's catch-up listener fires
       `tick()` synchronously since `document.hidden` is false): `h2` must
       read `LCS3-GLSI_D Groupe 1` again (the tick really re-rendered).
    7. **Tap overlay centre** — `is-list` back; overlay `[hidden]`;
       `#search` focused; back `flex`; 1 active row (`GLSI3D1`); value
       unchanged.
    8. **Tap `#searchBack`** — `is-list` gone; back hidden; overlay visible
       again; `h2` unchanged; `activeElement !== #search`.
    9. **Tap `#overlayClear`** — `.empty-state` visible ("No Class
       Selected"); overlay hidden; value still `GLSI3D1`; `#searchClear`
       `display:flex`. **Force the tick again (step 6's mechanism): the
       `.empty-state` must survive with no `<h2>` in `#detail`** — the
       `currentWeek`-ownership rule (051×056 bug class) proven in the
       browser.
    10. **Tap `#searchClear`** — value `""`; still empty (no `is-list`);
        empty state still visible.
    11. **D4 round-trip** — tap `#search`, type `zzz` ("No classes match."),
        tap `#status`: `is-list` STILL set **and** `#searchBack` STILL
        `display:flex` (outside-blur never hides the back); tap back →
        `.empty-state` visible.
    12. **Row-tap select (dead end 5 fixed)** — tap `#search`, tap a
        `#classList` row: class state (overlay visible, `h2` = week name),
        value `""` untouched, `#searchClear` hidden but **`#overlayClear`
        visible — a clear control now exists on screen**.
    13. **T6 change** — from a class state with the 1-row filter (type
        `GLSI3D1` → auto-jump re-selects and blurs), tap `#search`:
        **`is-list` SET, the list opens** with the back arrow (old machine:
        blocked by `lastResultCount === 1`); tap back → class restored.
        Also assert `#search.value` is unchanged across steps 5-9 and 12-13
        (filter preservation).
    14. **Desktop 1280×800** — repeat steps 1, 2, 5, 7, 8: `#searchBack`
        and `#searchOverlay` `display:none` at every point; both panes
        visible in every state (`#classList` `block` + `#detail`
        `flex|block`); `is-list` toggles with no visual effect;
        `#searchClear` `display:none`; value preserved.
    15. **Console** over the whole walk: 0 JS errors (favicon 404 excepted).
20. **Diff hygiene** — full-tree diff vs base may touch only `classes.html`,
    `js/classes.js`, `styles.css`, `test/classes.test.js`,
    `test/teacher-daygroups.test.js`, `issues/058-port-mobile-nav-to-classes.md`.
    **No-go**: no `js/teachers.js`/`index.html` edits; no `setTimeout`; no
    width/pointer reads in JS; no `@media (pointer: coarse)` in CSS; no
    edits inside `renderWeek`/`showClass`/the suggest/ghost/kaomoji/hop
    machinery; no renames of `searchClear`/`suggest`/`is-list`/`classList`/`detail`;
    no `search.value =` writes outside `acceptSuggest` + the X handler; do
    not touch `teacher-daygroups` outside the two classes-side spots. No
    git operations — the Implementer does not commit; the main agent merges.

**Risks / constraints (pin arithmetic traps)**

- **`:986` count**: `currentWeek = null;` must be exactly **3** after the
  port (`showEmpty` + `showClass` nomatch + commit nomatch). 4 = the
  caller-side empties were kept *and* the funnel clear added (double
  ownership); 2 = a nomatch clear was "tidied" away (tick would resurrect
  the view over a nomatch page). The new `showEmpty`-owns-it pin guards the
  direction.
- **The 051×056 ownership bug class**: the overlay X is the first
  *deselect* edge classes has ever had; any implementation where
  `currentWeek` is cleared by callers instead of `showEmpty` leaves
  `#overlayClear` uncovered and a 30 s tick will repaint the grid over the
  kaomoji. Walk step 9 is the regression proof — do not skip it, and do not
  weaken it to "the heading is still there" (assert **no `<h2>`**).
- **`:441-442` literal**: the classes section must contain the literal
  `layout.classList.remove('is-list')`. Guaranteed only if (a) `syncList`
  is written in the `if/else add-remove` form **and/or** (b) the `renderWeek`
  fence is kept — keep **both** (belt and braces; a `classList.toggle`
  rewrite alone would leave the assertion hanging on the fence).
- **`:1010/:1026` (+ `:1011/:1027`) fence**: `renderWeek`'s `!tickNow` block
  must stay byte-identical — it is the only `layout.classList.remove` and
  the only `syncClear()` the week harness will execute. The sandbox
  (`classes.test.js:941-951`) stubs **only** `layout.classList.remove` and
  `syncClear`; adding `syncOverlay()`, `markActive`, `renderSuggest` or any
  nav call inside `renderWeek` (or moving the funnels into its slice bounds
  `indexByDaySlot`→`showClass`) throws a vm `ReferenceError` and fails four
  tests at once.
- **`:475`**: dies with the stepping-rule deletion — it must be *rewritten
  to assert absence* in the same diff; keeping the dead rules to save the
  pin is rejected (phantom 2.7rem hole for a button that no longer exists).
- **`:977`** `new Date() === 3`: no wall-clock read may appear in any funnel
  (`showEmpty`/`selectClass` must not grade time — `showClass`/`renderWeek`
  own the clock).
- **`teacher-daygroups:473-475`**: exactly two
  `search.addEventListener('click'` across both files — keep exactly one in
  `js/classes.js`.
- **`:551-559` leaf gates** and **`:521` `var like = exactClass(rows, q);`**
  survive verbatim — they are the reason the unreachable
  nomatch-through-`selectClass` edge stays unreachable.
- **`:525-593` teachers chrome/machine tests + `:398-410`/`:595-779`** read
  shared CSS and `APP_SRC`/`INDEX_SRC` — the deletions in criterion 15 must
  not graze `styles.css:541-591` or `:618`, and `js/teachers.js` is
  read-only for this issue.
- **Blur is load-bearing twice**: it is the only thing that drops
  suggest/ghost on the post-select path (the port's `search.blur()` in
  `selectClass` triggers it) — do not "help" by adding
  `renderSuggest([])`/`renderGhost()` to `renderWeek`/`showClass`, and do
  not add `syncList()`/pane writes to blur (pins `:438-440`).
- **Selection blurs everywhere now** (ruling 6) — walk step 5's
  `activeElement !== #search` is expected, not a regression; guarding it
  with a viewport check is forbidden.
- **Overlay name = the fact** (`selectedClass`), never `#detail h2` and
  never a stored `week.name` (rejected alternative (g)-adjacent: DOM-as-state
  would reintroduce root-cause item 3).
- Dead code note: `showClass`'s nomatch branch is unreachable through the
  ported wiring (leaf pre-validation); leave it — pin `:559` owns its gate
  text and removing it would drop the count at `:986` to 2.

### Fix implemented (2026-10-20)

Role: Implementer. Worktree `/home/user/.local/share/opencode/worktree/1de5bb/058-classes-mobile-nav`
(branch `fix/058-classes-mobile-nav`, HEAD 08567e0); changes left uncommitted for the
main agent to merge. Baseline re-verified before any edit: `node --test` → **127
tests, 127 pass, 0 fail**.

#### Criterion checklist (all met; numbering = the Maintainer's acceptance criteria)

1. **Element vars** — met. `var searchDone` deleted; `searchBack`, `searchOverlay`,
   `overlayName`, `overlayClear` added in `js/teachers.js:61-64` order.
2. **State block (`:95-96`)** — met. Comment block (class wording: `'class'` state,
   `selectClass`/`showEmpty` named) + `var menuOpen = false;` + `var selectedClass = null;`;
   `activeKey`/`currentWeek` declarations untouched.
3. **`syncList`** — met. Comment updated ("present iff the menu is open… SOLE writer");
   body exactly `if (menuOpen) …add('is-list'); else …remove('is-list');` — no `toggle`.
4. **Five funnels** — met. `syncOverlay` / `openMenu` / `closeMenu` / `showEmpty` /
   `selectClass`, in that order, immediately after `syncClear`, bodies exactly as the
   direction block (`syncOverlay` uses the merged `selectedClass === null || menuOpen`).
5. **`:192` + row click** — met. `lastResultCount = rows.length;` deleted; row click is
   `li.onclick = function () { selectClass(r.label); };` with the keep-filter comment kept.
6. **`renderWeek` + `showClass` zero edits** — met. No hunk touches either function
   (see diff); the `!tickNow` fence is byte-identical; new test B asserts the week slice
   (`indexByDaySlot`→`showClass`) contains no nav state (vm-harness safety).
7. **`onInput`** — met. `if (!q.trim()) showEmpty();` / `else if (rows.length === 1) {
   selectClass(rows[0].label); }`; trailing `syncList();` stays.
8. **`commit`** — met. Restructured exactly per criterion; `picked` + trailing
   `if (!picked) syncList();` dead; 056's no-trailing-syncList comment added;
   `var like = exactClass(rows, q);` and both leaf-gate literals verbatim
   (pins `:551-559` pass unmodified).
9. **Escape** — met. Body = `e.preventDefault(); if (!suggest.hidden) { renderSuggest([]);
   renderGhost(); return; } closeMenu();` with 056's comment; Tab/Arrow/Enter untouched.
10. **focus/click/blur** — met. focus/click bodies = `openMenu();` ("always brings the
    menu back" comment kept; exactly one `search.addEventListener('click'` in the file);
    blur body unchanged, comment now "selection/back-driven, never blur-driven".
11. **V handler death + new chrome wiring** — met. Whole V block deleted; `searchBack`
    → `closeMenu()`, `searchOverlay` → `openMenu(); search.focus();`, `overlayClear` →
    `stopPropagation + showEmpty()`, with 056's comments in class wording.
12. **X handler** — met. `search.focus()` dropped (body `search.value = ''; syncClear();
    commit();`); comment updated (deselect is `#overlayClear`).
13. **Boot** — met. `detail.innerHTML = emptyStateHTML();` → `showEmpty();`; order
    `renderList(...)` → `showEmpty();` → `syncList();` → `syncClear();` → `clock.subscribe`.
14. **Markup** — met. `#searchDone` removed; `#searchBack` (input→`#searchClear`) and
    `#searchOverlay`+`#overlayClear`/`#overlayName`/`.overlay-drop`
    (`#searchClear`→`#suggest`) inserted; the 13-line block verified **byte-identical**
    to `index.html:42-54` (`diff` of the two blocks: empty), chevron paths verbatim.
15. **CSS deletions only** — met. Deleted: base V comment+rule (old `:127-129`), the V
    narrow comment+rules (old `:524-540`), the stepping comment+rule (old `:608-614`),
    the double-gutter comment+rule (old `:615-617`, `:619`), the stale stacking-rule
    sentence in the `#searchClear` comment (old `:592-596`). Kept unchanged: `#search {
    padding-right: 2.7rem; }` (old `:618`), all of old `:131-133`/`:541-591` (056/057
    chrome+polish — re-verified in place, incl. `border-radius: 8px` and the `:has`
    input-hide). **Zero additions**; grep confirms no `#searchDone` remains in the CSS
    and no `body[data-page="classes"] #searchWrap` rule remains.
16. **`test/classes.test.js`** — met. Four in-place rewrites (markup pin → four new ids
    + `searchDone` absence; `:475` → the three absence/survival assertions, test name
    unchanged; row-click token → `selectClass(r.label)`, no-`search.value` half kept;
    `:986` → 3 with the ownership comment) + the two new tests A/B appended under the
    `// ---- mobile nav (issue 058) ----` header, mirroring the teachers pair.
17. **`test/teacher-daygroups.test.js`** — met. Only the two classes-side spots changed:
    the `:449-452` block (absence loop over `classesBlur` + mirrored classes
    openMenu/closeMenu/focus/click pins placed after the teachers pins, where `fnSlice`
    is in scope) and `:522` (`selectClass(like);` + funnel message). Teachers-side
    assertions byte-identical.
18. **Counts** — met. `node --test` → **129 tests, 129 pass, 0 fail** (127 baseline +
    the two new tests; nothing else moved). Same via `node --test test/*.test.js`.
19. **Browser verification** — met (see walk table + curls below). Deviation notes,
    both mechanical and inside the architecture: (a) in state=class the input is
    `visibility:hidden` under the overlay *by 057 design* (criterion 19.5 asserts this
    itself), so the literal physical tap on `#search` is impossible on narrow — the same
    on merged teachers; the walk therefore exercised the box's focus/click handlers by
    dispatching them on the node (step 13), and the user-visible edge (the overlay IS
    the box) physically in step 7, which starts from the exact old-T6 dead-end state
    (1-row filter, state=class); desktop step 14 taps the *visible* box with the 1-row
    filter directly. (b) between steps 11 and 12 the walk erases the `zzz` filter with
    the X (empty state → stays empty), because step 12 asserts value `""` untouched by
    the row tap and `li[data-key]` rows only exist for an empty/matching filter.
20. **Diff hygiene** — met. Full-tree `diff -r` against the base worktree shows exactly
    `classes.html`, `js/classes.js`, `styles.css`, `test/classes.test.js`,
    `test/teacher-daygroups.test.js` (+ this issue file) changed; `js/teachers.js`,
    `index.html`, `js/match.js`, `js/model.js`, `js/color.js` byte-identical to base.
    No `setTimeout`, no width/pointer reads, no `@media (pointer: coarse)`, no edits
    inside `renderWeek`/`showClass`/suggest/ghost/kaomoji/hop, no renames, no stray
    `search.value =` writes (only `acceptSuggest` + the X handler). No git was used;
    nothing committed.

#### Verification

- `node --test` (pre-change): 127/127/0. `node --test` (post-change): **129/129/0**.
  `node --test test/*.test.js`: **129 pass / 0 fail**.
- `python3 -m http.server 8058` from the worktree root, PID 766334 recorded in
  `/tmp/opencode/http058.pid`, killed by PID afterwards (`ps` confirms gone).
- curl: `/classes.html` 200, `/index.html` 200, `/styles.css` 200, `/js/classes.js` 200,
  `/js/teachers.js` 200.
- Playwright/Chromium, 390×844 (steps 1–13), 1280×800 (step 14), console over the whole
  walk (step 15):

| # | Walk step | Result | Measured highlights |
|---|---|---|---|
| 1 | Load | PASS | no `is-list`; list `none`, 94 `li[data-key]`; empty state "No Class Selected"; overlay `[hidden]`+`none`; back `none`; X `hidden`; `searchDone` node absent; no `h2` |
| 2 | Focus `#search` | PASS | `is-list` set; list `block` 94 rows; back `flex`, dx 1.0px from wrap x, w 43.2px; `#detail` hidden; overlay hidden; activeElement `#search` |
| 3 | Type `GLSI` | PASS | 16 rows; X `flex`, right edge −1px from wrap right (no stepping); back still `flex` |
| 4 | Tap X | PASS | value `""`; 94 rows; X hidden; `is-list` still set (state=list) |
| 5 | `fill('GLSI3D1')` auto-jump | PASS | `is-list` gone; `h2` "LCS3-GLSI_D Groupe 1"; overlay not hidden, bbox contains input's; `#overlayName` "GLSI3D1"; activeElement BODY; X-left/chevron-right; `#search` `visibility:hidden` (057); radius `8px`; value preserved |
| 6 | Tick-liveness probe (051) | PASS | h2 set to `TICKPROOF`, forced `visibilitychange` tick → reads "LCS3-GLSI_D Groupe 1" again (tick really re-renders) |
| 7 | Tap overlay centre | PASS | `is-list` back; overlay `[hidden]`; focused; back `flex`; exactly 1 active row `GLSI3D1`; value unchanged |
| 8 | Tap `#searchBack` | PASS | `is-list` gone; back hidden; overlay visible; `h2` unchanged; activeElement ≠ `#search` |
| 9 | Tap `#overlayClear` + forced tick | PASS | empty state "No Class Selected"; overlay hidden; value `GLSI3D1`; X `flex`; tick before/after: `.empty-state` survives, **0 `<h2>`** (051×056 ownership proven in-browser) |
| 10 | Tap X while empty | PASS | value `""`; still empty, no `is-list`; empty state visible |
| 11 | D4 round-trip | PASS | "No classes match." row; tap `#status`: `is-list` STILL set, back STILL `flex`; tap back → empty state visible |
| 12 | Row-tap select | PASS | class state (row `BI1A1` → `h2` "LBC2-BI_A Groupe 1"); value `""` untouched; X hidden but `#overlayClear` visible (43.2×24px box) — clear control exists |
| 13 | T6 change | PASS | class + 1-row filter: box handlers open the list (`is-list` set, list `block`, back `flex`) — old machine blocked this; tap back → class restored; value `GLSI3D1` throughout |
| 14 | Desktop 1280×800 | PASS | boot/focus/select/reopen/Escape-close: back+overlay+X all `display:none` at every point; both panes visible in every state; `is-list` toggles (true on focus/tap, false after select/Escape) with no visual effect; `h2`+value preserved |
| 15 | Console | PASS | 0 JS errors (favicon excepted; none occurred) |

- Filter preservation: `#search.value` unchanged across steps 5–9 (`GLSI3D1`) and
  steps 12–13 (`""` → `GLSI3D1` via the deliberate `fill` only) — asserted in the walk.

#### Diff (base = worktree HEAD 08567e0; `a/` = base, `b/` = fixed)

```diff
--- a/classes.html	2026-10-20 08:18:57.049384648 +0100
+++ b/classes.html	2026-10-20 13:55:22.837016233 +0100
@@ -40,12 +40,19 @@
     <div id="searchWrap">
       <div id="ghost" aria-hidden="true"><span id="ghostPre"></span><span id="ghostTyped"></span><span id="ghostRest"></span></div>
       <input id="search" type="search" placeholder="Search class (LCS, GLSI3D1…)" autocomplete="off">
-      <button type="button" id="searchDone" aria-label="Hide the keyboard">
-        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
+      <button type="button" id="searchBack" aria-label="Back">
+        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>
       </button>
       <button type="button" id="searchClear" aria-label="Clear the search">
         <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
       </button>
+      <div id="searchOverlay" hidden>
+        <button type="button" id="overlayClear" aria-label="Clear the selection">
+          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
+        </button>
+        <span id="overlayName"></span>
+        <svg class="overlay-drop" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
+      </div>
       <ul id="suggest" hidden></ul>
     </div>
     <ul id="classList"></ul>
--- a/js/classes.js	2026-10-20 08:20:10.171211048 +0100
+++ b/js/classes.js	2026-10-20 13:58:30.938788397 +0100
@@ -67,7 +67,10 @@
   // teacher-style session card list (table.c-sessions).
   function initClassesPage(store, modelObjs, index) {
     var search = document.getElementById('search');
-    var searchDone = document.getElementById('searchDone');
+    var searchBack = document.getElementById('searchBack');
+    var searchOverlay = document.getElementById('searchOverlay');
+    var overlayName = document.getElementById('overlayName');
+    var overlayClear = document.getElementById('overlayClear');
     var searchClear = document.getElementById('searchClear');
     var ghost = document.getElementById('ghost');
     var ghostTyped = document.getElementById('ghostTyped');
@@ -92,24 +95,75 @@
     }
     function leafRows(rows) { return rows.filter(isLeafRow); }
     var suggestRows = [];
-    var searchFocused = false;
-    var lastResultCount = -1;
+    // mobile nav machine (issue 058): two facts, three named states —
+    //   menuOpen                    -> 'list'  (filterable list + back arrow)
+    //   !menuOpen && selectedClass  -> 'class' (week view + name overlay)
+    //   !menuOpen && !selectedClass -> 'empty' (kaomoji; the default)
+    // Blur writes neither fact (a press in flight must never lose its row);
+    // only openMenu/closeMenu (menu edges), selectClass and showEmpty write.
+    var menuOpen = false;
+    var selectedClass = null;
     var activeKey = null;
     var currentWeek; // the class view the clock refreshes until cleared (issue 051)
 
     status.textContent = store.size + ' sessions · ' + groups.leaves.length + ' classes';
 
-    // List/detail swap state: one class `is-list` on #layout, absent = cards.
-    // Only narrow CSS reads it; wider screens keep both panes visible and
-    // this only toggles state.
+    // List/detail swap state: `is-list` is present iff the menu is open.
+    // syncList is the SOLE writer of `is-list`, deriving from the menuOpen
+    // fact (issue 058) — no other code may touch the flag. Only narrow CSS
+    // reads it (one pane at a time); wider screens keep both panes visible
+    // and this only toggles state.
     function syncList() {
       if (!layout) return;
-      layout.classList.toggle('is-list', searchFocused && lastResultCount !== 1);
+      if (menuOpen) layout.classList.add('is-list');
+      else layout.classList.remove('is-list');
     }
     function syncClear() {
       if (searchClear) searchClear.hidden = !search.value;
     }
 
+    // The name overlay belongs to the 'class' state: hidden unless a
+    // class is selected AND the menu is closed (issue 058).
+    function syncOverlay() {
+      searchOverlay.hidden = selectedClass === null || menuOpen;
+      if (selectedClass !== null) overlayName.textContent = selectedClass;
+    }
+
+    // menu edges: the list is open or not — blur writes neither fact
+    function openMenu() {
+      menuOpen = true;
+      syncList();
+      syncOverlay();
+    }
+    function closeMenu() {
+      menuOpen = false;
+      search.blur();
+      syncList();
+      syncOverlay();
+    }
+
+    // every deselect funnels through here; the filter text is preserved.
+    // dropping currentWeek here (not at each caller) means no deselect path
+    // can leave tick ownership behind and repaint over the empty page
+    function showEmpty() {
+      selectedClass = null;
+      currentWeek = null;
+      detail.innerHTML = emptyStateHTML();
+      markActive(null);
+      syncOverlay();
+    }
+
+    // the single selection funnel: every path that picks a class lands
+    // here; blurs because the overlay owns the box in state=class
+    function selectClass(ref) {
+      selectedClass = ref;
+      showClass(ref);
+      search.blur();
+      menuOpen = false;
+      syncList();
+      syncOverlay();
+    }
+
     // A giant, faint emoticon fills the detail area whenever no class is
     // selected (initial load, or the filter cleared back to empty). The faces
     // come from the vendored kaomoji library (vendor/kaomoji.js, CC BY 4.0);
@@ -189,7 +243,6 @@
     // ---- class list -----------------------------------------------------
 
     function renderList(rows) {
-      lastResultCount = rows.length;
       var active = String(activeKey).toUpperCase();
       list.innerHTML = '';
       if (!rows.length) {
@@ -212,7 +265,7 @@
         // The filter is the source of truth for the list: selecting a row must
         // not rewrite it, so the result list stays as-is and the user can move
         // to the next hit.
-        li.onclick = function () { showClass(r.label); };
+        li.onclick = function () { selectClass(r.label); };
         list.appendChild(li);
       });
     }
@@ -502,8 +555,10 @@
       renderList(rows);
       renderSuggest(classSuggestions(q));
       renderGhost();
-      if (!q.trim()) { detail.innerHTML = emptyStateHTML(); markActive(null); currentWeek = null; }
-      else if (rows.length === 1) { showClass(rows[0].label); }
+      // an empty filter means nothing is selected: back to the empty state
+      if (!q.trim()) showEmpty();
+      // exactly one result left -> auto-jump to the week view
+      else if (rows.length === 1) { selectClass(rows[0].label); }
       syncList();
     }
 
@@ -526,37 +581,34 @@
       var rows = leafRows(match.classSearch(index, q));
       renderList(rows);
       var like = exactClass(rows, q);
-      var picked = false;
       if (!q.trim()) {
-        detail.innerHTML = emptyStateHTML();
-        markActive(null);
-        currentWeek = null;
-      } else if (model.classWeek(groups, q).leaves.length === 1) {
-        showClass(q);
-        picked = true;
+        showEmpty();
+        syncList();
+        return;
+      }
+      if (model.classWeek(groups, q).leaves.length === 1) {
+        selectClass(q);
       } else if (like) {
-        showClass(like);
-        picked = true;
+        selectClass(like);
       } else if (rows.length === 1) {
-        showClass(rows[0].label);
-        picked = true;
+        selectClass(rows[0].label);
       } else if (!rows.length) {
         detail.innerHTML = '<p class="nomatch">No match for "' + esc(q) + '".</p>';
         currentWeek = null;
       }
-      // a selection dismisses the menu; syncList would put it back since
-      // the rendered count is not 1
-      if (!picked) syncList();
+      // no trailing syncList: a selection closes the menu and syncList
+      // cannot resurrect a closed one
     }
 
     search.addEventListener('input', onInput);
     search.addEventListener('keydown', function (e) {
       if (e.key === 'Escape') {
         // <input type="search"> clears the field on Esc by default; cancel
-        // that so Esc only dismisses the menu and keeps the typed filter.
+        // that so Esc keeps the typed filter: it drops the suggest overlay
+        // if open, else closes the menu — it never deselects.
         e.preventDefault();
-        if (!suggest.hidden) { renderSuggest([]); renderGhost(); }
-        return;
+        if (!suggest.hidden) { renderSuggest([]); renderGhost(); return; }
+        closeMenu();
       }
       if (e.key === 'Tab') {
         // Issue 007: Tab must not accept an implicit (non-explicit)
@@ -588,46 +640,53 @@
       }
     });
     search.addEventListener('focus', function () {
-      searchFocused = true;
-      syncList();
+      openMenu();
     });
     // tapping the filter box always brings the menu back: focus alone does
     // not refire while the box never lost focus (row taps keep it focused),
     // but click fires on every tap.
     search.addEventListener('click', function () {
-      searchFocused = true;
-      syncList();
+      openMenu();
     });
     // blur only drops the autocomplete overlay: menu visibility is
-    // selection-driven (selecting shows cards, focusing shows the menu),
-    // so losing focus must never hide the row a press is about to land on.
+    // selection/back-driven, never blur-driven, so losing focus must never
+    // hide the row a press is about to land on.
     search.addEventListener('blur', function () {
       renderSuggest([]);
       renderGhost();
     });
 
-    // the mobile V-chevron explicitly leaves list mode for the cards (blur
-    // alone no longer does); it blurs itself too so focus fully clears
-    if (searchDone) searchDone.addEventListener('click', function () {
-      search.blur();
-      searchDone.blur();
-      searchFocused = false;
-      syncList();
+    // back dismisses the open list + focus and hides itself; a selected
+    // class stays selected ("back to the earlier state" by construction)
+    if (searchBack) searchBack.addEventListener('click', function () { closeMenu(); });
+    // in state=class the overlay IS the box: the whole surface (name,
+    // chevron, background) is one click target that reopens the list; its
+    // left X (#overlayClear) is the separate deselect control
+    if (searchOverlay) searchOverlay.addEventListener('click', function () {
+      openMenu();
+      search.focus();
+    });
+    if (overlayClear) overlayClear.addEventListener('click', function (e) {
+      e.stopPropagation();
+      showEmpty();
     });
 
+    // the mobile X erases the filter in the list/empty states (empty query
+    // -> full catalogue + emoticon detail); it no longer arms the menu —
+    // class-state deselect is #overlayClear. mousedown is prevented so
+    // the button never takes focus.
     if (searchClear) {
       searchClear.addEventListener('mousedown', function (e) { e.preventDefault(); });
       searchClear.addEventListener('click', function () {
         search.value = '';
         syncClear();
-        search.focus();
         commit();
       });
     }
 
     // initial paint: full leaf catalogue, empty detail
     renderList(leafRows(match.classSearch(index, '')));
-    detail.innerHTML = emptyStateHTML();
+    showEmpty();
     syncList();
     syncClear();
     // the page subscribes once at init; the clock owns the cadence (issue 051)
--- a/styles.css	2026-10-20 09:29:59.947439479 +0100
+++ b/styles.css	2026-10-20 14:01:02.720475565 +0100
@@ -124,9 +124,6 @@
 #search, #ghost {
   font-family: "Monaspace Neon", ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
 }
-/* mobile-only: a button beside the search box that drops focus (hides the
-   keyboard / leaves list mode). The V is an inline SVG chevron. */
-#searchDone { display: none; }
 #searchClear { display: none; }
 /* mobile nav chrome (issue 056): desktop never shows it; the narrow block may */
 #searchBack { display: none; }
@@ -521,23 +518,6 @@
      it expands with its content and the document scrolls instead. Desktop
      keeps the base rule for the hanging gutter/Grid overflow. */
   #layout > #detail { overflow: visible; }
-  /* a V-chevron button beside the search box drops focus / hides the keyboard.
-     It appears only while the search box actually holds focus, and it always
-     keeps the rightmost slot: the X is the control that steps aside. */
-  #searchWrap:focus-within #searchDone { display: flex; }
-  #searchDone {
-    align-items: center; justify-content: center;
-    /* rightmost slot, never shifted: the stacking rule below moves the X
-       beside this button, not the other way round */
-    position: absolute; right: 0; top: 0; bottom: 0; width: 2.7rem;
-    border: 0; background: transparent; color: var(--md-on-surface-variant, #555);
-    cursor: pointer; z-index: 2;
-  }
-  #searchDone:active { color: var(--md-primary, #0b4da2); }
-  #searchDone svg {
-    width: 1.5rem; height: 1.5rem; fill: none; stroke: currentColor; stroke-width: 2.4;
-    stroke-linecap: round; stroke-linejoin: round;
-  }
   /* issue 056: the back arrow replaces the V on the teachers page. It is
      state-gated (#layout.is-list), never focus-gated, so an outside-tap
      blur leaves the list with a visible way back; it hides with the menu. */
@@ -590,10 +570,7 @@
     stroke-linecap: round; stroke-linejoin: round;
   }
   /* the clear "x" is shown only while the filter holds text: JS toggles the
-     [hidden] attribute, and #searchClear[hidden] above beats this id rule.
-     At right: 0 it fills the rightmost slot whenever the focus-gated V is off
-     screen (an unfocused field holding text leaves no hole); the stacking rule
-     below steps it one slot left, immediately beside the V, when both show. */
+     [hidden] attribute, and #searchClear[hidden] above beats this id rule. */
   #searchClear {
     align-items: center; justify-content: center;
     position: absolute; right: 0; top: 0; bottom: 0; width: 2.7rem;
@@ -605,18 +582,7 @@
     width: 1.5rem; height: 1.5rem; fill: none; stroke: currentColor; stroke-width: 2.4;
     stroke-linecap: round; stroke-linejoin: round;
   }
-  /* stack the two controls on the right edge: the V owns right: 0, so the X
-     yields that slot only while the focus-gated V is actually on screen and
-     sits immediately to the V's left; when the V hides again the X slides back
-     to right: 0 instead of leaving a hole where the V would be. Classes page
-     only (issue 056): the V is dead on teachers, so the stepping rule (and
-     its double gutter) would leave a phantom 2.7rem hole there. */
-  body[data-page="classes"] #searchWrap:focus-within:has(#searchClear:not([hidden])) #searchClear { right: 2.7rem; }
-  /* reserve one control slot by default; only both controls at once (a focused
-     field that also holds text) need the double gutter, so typed text, the ghost
-     completion and its --ghost-pre inset never run underneath a control. */
   #search { padding-right: 2.7rem; }
-  body[data-page="classes"] #searchWrap:focus-within:has(#searchClear:not([hidden])) #search { padding-right: 5.4rem; }
   /* exactly one clear affordance on mobile: suppress the engine native cancel */
   #search::-webkit-search-cancel-button, #search::-webkit-search-decoration {
     -webkit-appearance: none; appearance: none; display: none;
--- a/test/classes.test.js	2026-10-20 08:20:10.172211194 +0100
+++ b/test/classes.test.js	2026-10-20 14:04:17.562314076 +0100
@@ -443,9 +443,11 @@
     'canonical/og:url must use the classes.html URL');
   ['id="searchWrap"', 'id="search"', 'id="suggest"', 'id="classList"',
    'id="detail"', 'id="status"', 'id="themeCycle"',
-   'id="searchDone"', 'id="searchClear"'].forEach(function (id) {
+   'id="searchBack"', 'id="searchOverlay"', 'id="overlayClear"', 'id="overlayName"',
+   'id="searchClear"'].forEach(function (id) {
     assert.ok(html.indexOf(id) !== -1, 'missing element ' + id);
   });
+  assert.ok(html.indexOf('id="searchDone"') === -1, 'the V-chevron is gone from the classes page');
   // the theme control is ONE element: no #themeBar wrapper, no .theme-dot span
   assert.ok(html.indexOf('theme-dot') === -1, 'theme square must not use a .theme-dot span');
   assert.ok(html.indexOf('id="themeBar"') === -1, 'theme square must not use a #themeBar wrapper');
@@ -470,9 +472,11 @@
     'c-cell.today must come before c-cell.now');
   // the classes empty state shares the teachers empty-state heading style
   assert.ok(css.indexOf('no-class-selected') !== -1, 'missing no-class-selected style');
-  // the pre-existing mobile search-button block is intact (rule text per
-  // issue 031: the V owns right:0 and the X is the control that steps aside)
-  assert.ok(css.indexOf('#searchWrap:focus-within:has(#searchClear:not([hidden])) #searchClear') !== -1);
+  // the V-stepping rules died with the V (issue 058); the X keeps its slot
+  assert.ok(css.indexOf('#searchWrap:focus-within:has(#searchClear:not([hidden])) #searchClear') === -1,
+    'the V-stepping rules died with the V');
+  assert.ok(css.indexOf('body[data-page="classes"] #searchWrap:focus-within:has(#searchClear:not([hidden])) #search') === -1);
+  assert.ok(css.indexOf('#search { padding-right: 2.7rem; }') !== -1, 'the X slot survives');
 });
 
 // ---- leaf-only selection + session cards (issue 047) -----------------------
@@ -591,7 +595,7 @@
   var at = sec.indexOf('li.onclick = function ()');
   assert.ok(at !== -1, 'row click handler found');
   var handler = sec.slice(at, sec.indexOf('};', at) + 2);
-  assert.ok(handler.indexOf('showClass(r.label)') !== -1, 'row click shows the class directly');
+  assert.ok(handler.indexOf('selectClass(r.label)') !== -1, 'row click selects through the funnel');
   assert.ok(handler.indexOf('search.value =') === -1, 'row click must not rewrite the filter');
   // the sanctioned commit path still writes the filter
   var accept = sec.slice(sec.indexOf('function acceptSuggest(row)'));
@@ -983,7 +987,8 @@
   assert.strictEqual(countTok(src, 'clock.subscribe(onTick);'), 1, 'one subscription per page');
   assert.ok(src.indexOf('visibilitychange') !== -1 && src.indexOf('document.hidden') !== -1,
     'the clock wires the tab-return catch-up');
-  assert.strictEqual(countTok(src, 'currentWeek = null;'), 4, 'every clear site drops ownership');
+  assert.strictEqual(countTok(src, 'currentWeek = null;'), 3,
+    'the empty funnel owns the deselect clear; the two nomatch branches (which never reach showEmpty) drop it themselves');
   assert.ok(src.indexOf('lastWeekHTML') === -1, 'no emitted-string gate state');
   assert.ok(!/(^|[^a-zA-Z0-9_$])h\s*!==/.test(src), 'no emitted-string comparison gate');
   var slice = classesWeekSlice();
@@ -1044,3 +1049,117 @@
   h.tick(at(15, 9, 0));
   assert.strictEqual(h.counts().writes, 2, 'a cleared view is never resurrected by a later tick');
 });
+
+// ---- mobile nav (issue 058) ------------------------------------------------
+
+test('classes nav chrome: state-gated back arrow, class overlay, V gone', function () {
+  var html = readPage('classes.html');
+  ['id="searchBack"', 'id="searchOverlay"', 'id="overlayClear"', 'id="overlayName"'].forEach(function (id) {
+    assert.ok(html.indexOf(id) !== -1, 'classes.html missing ' + id);
+  });
+  assert.ok(html.indexOf('id="searchDone"') === -1,
+    'the V-chevron is gone from the classes page');
+  var css = readPage('styles.css');
+  assert.ok(css.indexOf('#searchDone') === -1, 'no #searchDone at all in styles.css');
+  var base = css.slice(0, css.indexOf('@media (max-width: 700px)'));
+  assert.ok(base.indexOf('#searchBack { display: none; }') !== -1,
+    'desktop armour: the back arrow is display:none at base');
+  assert.ok(base.indexOf('#searchOverlay { display: none; }') !== -1,
+    'desktop armour: the class overlay is display:none at base');
+  var narrow = css.slice(css.indexOf('@media (max-width: 700px)'));
+  assert.ok(narrow.indexOf('#layout.is-list #searchBack') !== -1,
+    'back arrow is gated on the list state, not on focus');
+  assert.ok(narrow.indexOf('#searchOverlay:not([hidden])') !== -1,
+    'overlay renders from its attribute on narrow screens');
+  // issue 057's polish is shared CSS, verified live from the classes page:
+  // the overlay takes the wrap's 8px radius and the input goes invisible
+  var ovAt = narrow.indexOf('#searchOverlay:not([hidden])');
+  var ovRule = narrow.slice(ovAt, narrow.indexOf('}', ovAt));
+  assert.ok(ovRule.indexOf('border-radius: 8px') !== -1,
+    'overlay takes the wrap 8px radius (issue 057, verified from classes)');
+  assert.ok(narrow.indexOf('#searchWrap:has(#searchOverlay:not([hidden])) #search') !== -1,
+    'the input hides while the overlay shows (issue 057, verified from classes)');
+  // anti-D4: the back control is never focus-gated, and the V rules stay dead
+  assert.ok(css.indexOf('#searchWrap:focus-within #searchBack') === -1,
+    'the back control must never be focus-gated (anti-D4 regression pin)');
+  assert.ok(css.indexOf('#searchWrap:focus-within #searchDone') === -1,
+    'the dead V rule must stay gone');
+});
+
+test('classes nav machine: single selection/empty funnels, harness-safe week slice', function () {
+  var src = CLASSES_SRC;
+  assert.ok(src.indexOf('var menuOpen = false;') !== -1, 'menuOpen fact declared');
+  assert.ok(src.indexOf('var selectedClass = null;') !== -1, 'selectedClass fact declared');
+  assert.ok(src.indexOf('var lastResultCount') === -1, 'lastResultCount is dead');
+  assert.ok(src.indexOf('searchFocused') === -1, 'searchFocused is dead');
+  assert.ok(src.indexOf('searchDone') === -1, 'the V machinery is dead');
+  // week-harness safety: that sandbox stubs only layout.classList.remove +
+  // syncClear, so the slice between those bounds may carry no nav state
+  var weekSlice = src.slice(src.indexOf('function indexByDaySlot'),
+    src.indexOf('function showClass'));
+  ['menuOpen', 'search.blur', 'syncOverlay', 'selectClass'].forEach(function (tok) {
+    assert.ok(weekSlice.indexOf(tok) === -1, 'week slice must not contain ' + tok + ' (vm harness)');
+  });
+  function fnBody(sig) {
+    var start = src.indexOf(sig);
+    assert.ok(start !== -1, sig + ' found');
+    var end = src.indexOf('\n    }', start);
+    assert.ok(end !== -1, sig + ' bounds');
+    return src.slice(start, end + '\n    }'.length);
+  }
+  var listFn = fnBody('function syncList()');
+  assert.ok(listFn.indexOf("classList.add('is-list')") !== -1, 'syncList adds the flag');
+  assert.ok(listFn.indexOf("classList.remove('is-list')") !== -1, 'syncList removes the flag');
+  assert.ok(listFn.indexOf('toggle(') === -1, 'syncList uses the add/remove form, not toggle');
+  var sel = fnBody('function selectClass(ref)');
+  ['selectedClass = ref', 'showClass(ref)', 'search.blur()', 'menuOpen = false', 'syncOverlay()'].forEach(function (tok) {
+    assert.ok(sel.indexOf(tok) !== -1, 'selectClass: ' + tok);
+  });
+  var emp = fnBody('function showEmpty()');
+  ['selectedClass = null', 'currentWeek = null;', 'emptyStateHTML()', 'markActive(null)'].forEach(function (tok) {
+    assert.ok(emp.indexOf(tok) !== -1, 'showEmpty: ' + tok);
+  });
+  var inputFn = fnBody('function onInput()');
+  assert.ok(inputFn.indexOf('showEmpty();') !== -1, 'onInput: empty filter deselects');
+  assert.ok(inputFn.indexOf('selectClass(rows[0].label)') !== -1, 'onInput: auto-jump selects via the funnel');
+  var rowStart = src.indexOf('function renderList(rows)');
+  var rowWiring = src.slice(rowStart, src.indexOf('function markActive(key)', rowStart));
+  assert.ok(rowWiring.indexOf('selectClass(r.label)') !== -1, 'row tap selects via the funnel');
+  var commitFn = src.slice(src.indexOf('function commit()'), src.indexOf("search.addEventListener('input'"));
+  assert.ok(commitFn.indexOf('selectClass(q)') !== -1, 'commit exact-week selects via the funnel');
+  assert.ok(commitFn.indexOf('selectClass(like)') !== -1, 'commit exact-label selects via the funnel');
+  assert.ok(commitFn.indexOf('selectClass(rows[0].label)') !== -1, 'commit single-hit selects via the funnel');
+  assert.ok(commitFn.indexOf('showClass(') === -1, 'commit must not bypass the selection funnel');
+  var openSlice = fnBody('function openMenu()');
+  assert.ok(openSlice.indexOf('menuOpen = true') !== -1, 'openMenu arms the fact');
+  var closeSlice = fnBody('function closeMenu()');
+  assert.ok(closeSlice.indexOf('menuOpen = false') !== -1, 'closeMenu drops the fact');
+  assert.ok(closeSlice.indexOf('search.blur()') !== -1, 'closeMenu removes focus');
+  assert.ok(closeSlice.indexOf('syncOverlay()') !== -1, 'closeMenu syncs the overlay');
+  function handlerSlice(sig) {
+    var at = src.indexOf(sig);
+    assert.ok(at !== -1, sig + ' handler found');
+    return src.slice(at, src.indexOf('});', at) + 3);
+  }
+  assert.ok(handlerSlice("addEventListener('focus'").indexOf('openMenu()') !== -1,
+    'focus opens the menu');
+  assert.ok(handlerSlice("search.addEventListener('click'").indexOf('openMenu()') !== -1,
+    'a filter-box tap opens the menu');
+  var backStart = src.indexOf("searchBack.addEventListener('click'");
+  assert.ok(backStart !== -1, 'back wiring found');
+  assert.ok(src.slice(backStart, src.indexOf('});', backStart) + 3).indexOf('closeMenu()') !== -1,
+    'back closes the menu');
+  var ovStart = src.indexOf('searchOverlay.addEventListener');
+  assert.ok(ovStart !== -1, 'overlay wiring found');
+  var ovWiring = src.slice(ovStart, src.indexOf('showEmpty();', ovStart) + 'showEmpty();'.length);
+  assert.ok(ovWiring.indexOf('openMenu()') !== -1, 'overlay tap reopens the list');
+  assert.ok(ovWiring.indexOf('search.focus()') !== -1, 'overlay tap focuses the box');
+  assert.ok(ovWiring.indexOf('stopPropagation') !== -1, 'overlay X does not bubble to the surface');
+  assert.ok(ovWiring.indexOf('showEmpty()') !== -1, 'overlay X deselects');
+  assert.ok(handlerSlice("searchClear.addEventListener('click'").indexOf('search.focus()') === -1,
+    'the X no longer re-focuses the box');
+  assert.ok(handlerSlice("addEventListener('keydown'").indexOf('closeMenu();') !== -1,
+    'Escape without an open suggest closes the menu');
+  var bootTail = src.slice(src.indexOf('// initial paint'), src.indexOf('clock.subscribe(onTick);'));
+  assert.ok(bootTail.indexOf('showEmpty();') !== -1, 'boot paints through the empty funnel');
+});
--- a/test/teacher-daygroups.test.js	2026-10-20 09:29:59.947439479 +0100
+++ b/test/teacher-daygroups.test.js	2026-10-20 14:05:01.363389455 +0100
@@ -446,10 +446,11 @@
   ['menuOpen', 'openMenu', 'closeMenu'].forEach(function (tok) {
     assert.ok(teachersBlur.indexOf(tok) === -1, 'teachers: blur must not touch ' + tok);
   });
-  // classes keeps its old fact name (out of scope for issue 056)
+  // classes: blur writes neither nav fact nor any menu-edge function
   var classesBlur = handlerSlice(classes, "addEventListener('blur'");
-  assert.ok(classesBlur.indexOf('searchFocused') === -1, 'classes: blur must not touch menu state');
-  assert.ok(classes.indexOf('searchFocused = true') !== -1, 'classes: focus arms the menu');
+  ['menuOpen', 'openMenu', 'closeMenu'].forEach(function (tok) {
+    assert.ok(classesBlur.indexOf(tok) === -1, 'classes: blur must not touch ' + tok);
+  });
   function fnSlice(sec, sig) {
     var start = sec.indexOf(sig);
     assert.ok(start !== -1, sig + ' found');
@@ -468,6 +469,16 @@
     'teachers: focus opens the menu');
   assert.ok(handlerSlice(teachers, "search.addEventListener('click'").indexOf('openMenu()') !== -1,
     'teachers: a filter-box tap opens the menu');
+  // classes runs the same machine (issue 058): menu edges + both box handlers
+  var classesOpen = fnSlice(classes, 'function openMenu()');
+  assert.ok(classesOpen.indexOf('menuOpen = true') !== -1, 'classes: openMenu arms the fact');
+  var classesClose = fnSlice(classes, 'function closeMenu()');
+  assert.ok(classesClose.indexOf('menuOpen = false') !== -1, 'classes: closeMenu drops the fact');
+  assert.ok(classesClose.indexOf('search.blur()') !== -1, 'classes: closeMenu removes focus');
+  assert.ok(handlerSlice(classes, "addEventListener('focus'").indexOf('openMenu()') !== -1,
+    'classes: focus opens the menu');
+  assert.ok(handlerSlice(classes, "search.addEventListener('click'").indexOf('openMenu()') !== -1,
+    'classes: a filter-box tap opens the menu');
   assert.ok(APP_SRC.indexOf('setTimeout') === -1, 'no setTimeout left in the teachers page');
   assert.ok(CLASSES_SRC.indexOf('setTimeout') === -1, 'no setTimeout left in the classes page');
   var clicks = APP_SRC.split("search.addEventListener('click'").length - 1 +
@@ -519,7 +530,7 @@
     'commit must not bypass the selection funnel');
   var classes = CLASSES_SRC.slice(CLASSES_SRC.indexOf('function initClassesPage'));
   assert.ok(classes.indexOf('var like = exactClass(rows, q);') !== -1, 'classes commit computes exact');
-  assert.ok(classes.indexOf('showClass(like);') !== -1, 'exact class label selects');
+  assert.ok(classes.indexOf('selectClass(like);') !== -1, 'exact class label selects through the funnel');
 });
 
 test('teachers nav chrome: state-gated back arrow, teacher overlay, V gone', function () {
```

#### Dead-code / pin arithmetic confirmations

- `currentWeek = null;` count = **3** (`showEmpty` + `showClass` nomatch + commit
  nomatch) — pin `classes.test.js:986` rewritten 4→3 and passing; new test B pins
  `currentWeek = null;` inside `showEmpty`'s body.
- `is-list` writers post-port = exactly three: `syncList` (add/remove form),
  `renderWeek`'s fenced remove (byte-identical), `showClass`'s nomatch remove.
- `new Date()` count still **3** (no wall-clock read in any funnel); no `setTimeout`
  anywhere; exactly two `search.addEventListener('click'` across both page files.

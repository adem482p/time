# 056: Mobile teachers navigation has no direct way back to the "no teacher selected" page

- Status: Fixed
- Date: 2026-10-19, Reporter: user

## Description

Scope: the **teachers page** — `index.html` + `js/teachers.js` (there is no
`teachers.html`; the repo's teachers page is `index.html`, `index.html:31`
`body data-page="teachers"`, script at `index.html:60`). Narrow viewport only:
all pane swapping below is CSS `@media (max-width: 700px)`
(`styles.css:488`), exercised at **390×844**.

### Observed (measured in a real browser, executed 2026-10-19)

Playwright (MCP `playwright` server) driving headless Chromium against the
worktree served by `python3 -m http.server 8056` (stopped by PID afterwards),
viewport 390×844. Every claim below is a DOM/computed-style measurement of the
live page, labeled by step; code lines are re-verified in this worktree.

**The current machine** (five states of *focus* + one derived class — not the
user's three named states):

| # | Transition | Measured result |
|---|---|---|
| T1 | load | `#layout` class **absent**; `#teacherList` `display:none` (132 `li[data-name]` already in the DOM); `#detail` `display:flex` with `.empty-state` → heading **"No Teacher Selected"** + face `|°з°|`; `#search` value `""` (placeholder shows); V (`#searchDone`) `display:none`; X (`#searchClear`) `hidden`. → the initial "empty" page shows the kaomoji, list hidden. |
| T2 | tap `#search` (focus) | `#layout` gains **`is-list`**; list `display:block` (132 rows); `#detail` → `none` (the kaomoji/empty state is *hidden behind* the list); V → `display:flex` (focus-gated, `styles.css:526`); active element = `#search`. |
| T3 | type `Ben Haj` | list re-renders to 2 rows; `#suggest` opens (2 rows); X appears (`syncClear`, `js/teachers.js:149-151`); **fine pointer**: suggest row 0 pre-focused (`suggestIdx=0`, `js/teachers.js:335`) + ghost completion visible. |
| T4 | select (Enter accepts the pre-focused suggest row → `acceptSuggest` → `commit` → exact `showTeacher`) | `is-list` **removed** (`js/teachers.js:314`); `#detail` `display:block` with `<h2>Ben Haj</h2>`; list `display:none` but keeps `markActive` highlight (`Ben Haj`); filter value still `"Ben Haj"` (selection never writes it, `js/teachers.js:257-260`); focus **retained** (suggest rows `preventDefault()` mousedown, `js/teachers.js:351-354`) → V `display:flex`, X `display:flex`. |
| T5 | press V ("Hide the keyboard", `index.html:41-43`) | `search.blur()` + `searchFocused=false` + `syncList()` (`js/teachers.js:507-512`): active element → `BODY`, V → `display:none`, `is-list` stays absent, detail unchanged (teacher timeline). Keyboard/keyboard-glow dismissed; **list stays hidden; detail stays the teacher.** |
| T6 | tap `#search` again | `is-list` returns (`js/teachers.js:491-494` — "tapping the filter box always brings the menu back"): list shown (2 rows, selected row still highlighted), teacher detail **hidden underneath** (`display:none`, not destroyed). |
| T7 | type `Bel` (teacher still selected) | list re-renders to 13 rows **regardless of the selection**; `#detail` still holds `Ben Haj`'s timeline (hidden); suggest opens. → "typing updates the list regardless of other state" confirmed. |

All five user-reported transitions are confirmed, with one measured nuance:
the V button is **only visible while the input has focus**
(`styles.css:526` `#searchWrap:focus-within #searchDone`). Selecting via a
`#teacherList` row tap **blurs** the input (measured: `activeElement` → `BODY`,
V → `display:none` in the same step), so from a list-row selection the "hide the
keyboard" control does not even exist until the box is tapped again. Selecting
via the suggest row/Enter keeps focus, so T4→T5 as listed is reachable that way.

**The dead end** (state = teacher selected, keyboard dismissed, reached as
`rebuild` = tap filter → type `Ben Haj` → Enter → press V; snapshot A1):

- A1: `is-list` absent, list `none`, detail `<h2>Ben Haj</h2>`, value
  `"Ben Haj"`, **V `display:none`**, **X `display:flex`**.
- **Every affordance enumerated from A1** (each from a fresh rebuild):
  1. **Tap the filter box** → state=list (A4): list 132…2 rows shown, teacher
     detail hidden underneath, V reappears. Then **V** → straight back to the
     teacher detail (A5). *Cycle teacher ↔ list; never empty.*
  2. **Tap the detail/timeline** → **no change at all** (A6: `is-list` still
     absent, `<h2>Ben Haj</h2>` still shown). The only click handler on
     `#detail` is the empty-state face hop, keyed on `.empty-state`
     (`js/teachers.js:101-121`), which isn't present while a teacher is shown.
  3. **Escape** → **no-op for navigation** (A7): the handler cancels the native
     `<input type=search>` clear and only drops the suggest overlay
     (`js/teachers.js:448-454`); value and selection untouched; and on a phone
     there is no Esc key at all (coarse-pointer comment `js/teachers.js:15-19`).
  4. **Tap X** → clears the filter but lands in **state=list, not state=empty**
     (A2): value `""`, `is-list` **added** (the X handler focuses then commits —
     `js/teachers.js:521-526`, focus arms the menu `:484-487`, the empty
     `commit` branch renders the kaomoji into the *hidden* detail and calls
     `syncList()` — `:421-427`), list 132 rows, `#detail` `display:none` though
     `.empty-state` is now in it. Only a **second tap on the V** (A3) reveals
     the empty page. → with text in the filter the shortest route back to the
     empty page is **X then V (2 taps, passing through the list)** — the user's
     "no way" is therefore *slightly* too absolute, but **no single affordance
     in state=teacher transitions to state=empty**, and the X contradicts the
     spec below (which wants X → state=empty directly).
  5. **Empty-filter selection has no X at all** (Case B): tap filter on an
     empty query → tap row `Abdelhafidh` → value `""` → `syncClear` keeps X
     `hidden` (`js/teachers.js:149-151`) and V is `display:none` (input blurred
     by the row tap) — measured B2/B6: `xHidden:true`, `vDisplay:none`. Now the
     teacher is selected with **zero clear/deselect controls on screen**.
     Shortest measured route to the empty page: tap filter → type junk (`zzz`
     → list "No teachers match.", detail still `Abdelhafidh`, X appears) → tap X
     (kaomoji rendered into hidden detail) → tap V → empty page = **4 taps**
     (B7→B10). Escape adds nothing (B7).
- Also measured: blurring by tapping *outside* the box (e.g. `#status`) leaves
  the **list visible with the V hidden** (D4: `is-list` still set — blur never
  touches panes, `js/teachers.js:495-501`) — a menu state whose only "back"
  control is focus-gated and therefore invisible until the box is tapped again
  (D5/D6).

**Search-box UI in state=teacher (measured):** there is **no overlay**. The box
shows the raw filter text (`"Ben Haj"`) or, when the filter is empty, the
placeholder `"Search teacher, class (GLSI3D1) or subject…"` — never the teacher
name; no X on the left (X sits at the right edge, `styles.css:545-549`, and
only while text exists); no dropdown symbol (the V is focus-gated and absent).

**Gates: width vs pointer.** The pane swap (`is-list`) is **width-only**
(`styles.css:488, 515-516`) and a test *forbids* a pointer gate in CSS
(`test/teacher-daygroups.test.js:406-407`, "swap must not depend on pointer
type") — so everything in the tables above is gate-independent. The JS gate
`isCoarsePointer()` (`js/teachers.js:20-24`) is consulted in exactly one place,
the suggest pre-focus (`:335`). At default Playwright emulation
`(pointer: coarse)` = **false** even at 390×844, so T3/T7 ran with a
pre-focused row 0 + ghost (fine-pointer behavior). After enabling CDP touch
emulation (`Emulation.setTouchEmulationEnabled`), `(pointer: coarse)` = true
and, for the same query `Bel`: `suggestActiveIdx = -1`, ghost hidden, and
**Enter selects nothing** (commits the typed query only, `js/teachers.js:477-482`)
whereas on fine pointer the same Enter selected `Belkacem` via the pre-focused
row. On a real phone the machine therefore behaves as measured *for panes*, but
without pre-focus/ghost and with Enter-as-commit (issue 007 behavior,
`js/teachers.js:15-19, 331-335`).

**Scope context:** `js/classes.js` mirrors the pattern exactly — `searchFocused`
(`:69`), `syncList` with the identical derivation (`:76-82`), `syncClear`
(`:83-85`), `showClass`'s card forcing (`:316-317` renderWeek commit, `:377`),
focus/click/blur (`:562-579`), the V (`:583-588`), the X (`:590-598`), boot
paint (`:600-604`) — so the classes page has the same dead end. Per the brief
this issue is **teachers-only unless the Maintainer rules otherwise**.

### Expected (binding, transcribed verbatim from the user's proposal)

- state="empty": no teacher selected, no list shown. The default.
- state="list": shows a back button and a filterable teacher list. Entered by
  focusing the filter box. Left by selecting a teacher (→ state="teacher") or
  pressing the back button (→ back to the earlier/"empty" state). When the
  filter has text, the filter box shows an X button that erases the filter.
- state="teacher": a teacher is selected; the teacher timeline shows as usual;
  the search box is overlaid with: the **teacher name centered**, an **X button
  on the left** (→ state="empty"), and a **dropdown symbol on the right**
  indicating teachers can still be selected. Pressing on the teacher (the
  overlay) moves to state="list".

Notes (user's): pressing the filter box shows the list AND **prepends a back
arrow button which replaces the "hide the keyboard" button completely**; the
back arrow dismisses the list, removes focus, and dismisses itself.

(This three-state spec is the user's **binding** proposal; how it is wired into
the existing code — including what happens to the V/"hide the keyboard" control,
the suggest overlay, and the classes page — is the Maintainer's call.)

## Root cause

The mobile state machine is **implicit**: three orthogonal pieces of state that
nobody composes into named states —
(1) the derived class `is-list` on `#layout`, derived as *"search box focused
**and** the most recent render did not leave exactly one result"*
(`js/teachers.js:138-145`, comment `:138-141`, `syncList` `:142-145`),
(2) the boolean `searchFocused` (`:52`, only ever set `true` by focus/click
`:485, :492` and `false` by the V `:510`), and
(3) **no selection variable at all** — "a teacher is selected" exists only as
*the current content of `#detail`* written by `showTeacher` (`:311`) plus the
`markActive` highlight in a hidden list (`:312`).

Consequences, all measured above:

1. **There is no "deselect" edge.** Nothing ever empties `#detail` except
   `onInput`/`commit` on an *empty query* (`:407`, `:421-427`) — i.e. the empty
   page is a side effect of an empty filter, never a state the page can be put
   into. `showTeacher` deliberately never writes `search.value`
   (`:257-260`), and no handler clears the detail on blur/Escape/back.
2. **The X is defined as "clear the filter", not "deselect"** —
   `js/teachers.js:514-527`: it clears the value, **re-focuses** the input
   (`:524`) and runs `commit()`; because focus arms the menu (`:484-487`, and
   the tap handler re-arms it `:488-494`), the result is always state=list with
   the freshly rendered kaomoji *hidden* behind the list (measured A2). It can
   never reach state=empty in one step.
3. **The only "back to cards" control is the V, and it is focus-gated** —
   `index.html:41-43`, handler `js/teachers.js:503-512` (blur +
   `searchFocused=false` + `syncList()`), CSS `styles.css:526`
   (`#searchWrap:focus-within #searchDone`). In state=teacher the input is
   unfocused, so the control that would leave list mode does not exist; and in
   an *unfocused* list state it is invisible too (measured D4). There is no
   back button markup anywhere (`index.html:32-52` — only ghost/input/V/X/
   suggest + `#teacherList` + `#detail`; no nav on this page).
4. **Selection forces cards from inside `showTeacher`** (`js/teachers.js:313-314`
   "a selection always shows the detail/card view"), while focus/click forces
   the menu from the event handlers (`:484-494`) and blur is forbidden to touch
   either (`:495-497`). The interaction of these three writers *is* the state
   machine; the `commit` path must even special-case it (`:441-443` "a selection
   dismisses the menu; syncList would put it back").
5. The empty state itself is plain markup (`emptyStateHTML`, `:76-83`; hop
   listener `:101-128`) rendered into `#detail` and simply hidden by narrow CSS
   while `is-list` (`styles.css:516`) — so it is reachable again only by
   re-rendering it *and* clearing `is-list`, which today requires the measured
   X→V (2 taps) or junk→X→V (4 taps) dance.

### Where the change lands (for the Maintainer)

- `js/teachers.js`: the state comment/vars (`:49-53`), the `is-list` derivation
  (`:138-145`), `syncClear` (`:149-151`), `showTeacher`'s card forcing
  (`:311-316`), `onInput`/`commit` (`:399-444`), the keydown cluster
  (`:446-483` — Escape `:448-454`, Enter `:477-482`), focus/click/blur
  (`:484-501`), the V handler (`:503-512`), the X handler (`:514-527`), the
  boot paint (`:529-533`), plus new markup for the back arrow / teacher-name
  overlay.
- `index.html:38-49`: `#searchWrap` contents (V `:41-43`, X `:44-46`) — the
  spec's back button and overlay live here; today's markup has no such nodes.
- `styles.css`: the narrow block (`:488-570`, esp. pane swap `:515-516`, the
  focus-gated V `:526-539`, the X `:540-565`, padding gutters `:564-565`,
  suppressed native cancel `:567-569`), the base button hides (`:129-133`), the
  `#searchWrap`/`:focus-within` glow (`:87-95`), the empty-state rules
  (`:257-319`).
- `js/classes.js` (only if the Maintainer extends scope): `:69-85`, `:315-317`,
  `:372-384`, `:562-598`, `:600-604`.
- Tests (see below): the structural pins in `test/teacher-daygroups.test.js`
  and `test/classes.test.js` must be re-read before rewriting; several of them
  pin the *current* architecture by name.

### Tests that pin the current behavior (baseline: `node --test` → **103 tests, 103 pass, 0 fail**)

Exact inventory (grep `is-list|searchDone|searchClear|blur|focus|Escape|
syncList|syncClear|searchFocused|addEventListener('click'|classList.` over
`test/`):

1. `test/teacher-daygroups.test.js:396-408` — **'narrow screens swap menu and
   cards on focus/select only'**: requires the CSS literals
   `#layout:not(.is-list) #teacherList`, `#layout:not(.is-list) #classList`,
   `#layout.is-list #detail`, and **asserts `@media (pointer: coarse)` does NOT
   appear in `styles.css`** (`:406-407`, "swap must not depend on pointer
   type").
2. `test/teacher-daygroups.test.js:423-443` — **'menu visibility is
   selection-driven, never blur-driven'** (runs on *both* page files): the blur
   handler must contain `renderSuggest([])` and must **not** contain
   `searchFocused`, `syncList()`, or `setTimeout`; `searchFocused = true` must
   exist (focus arms the menu); `layout.classList.remove('is-list')` must exist
   (selection dismisses the menu); `setTimeout` must appear nowhere in either
   page file (`:438-439`); and **exactly 2** occurrences of
   `search.addEventListener('click'` across both files (`:440-442`, "both pages
   bring the menu back on filter-box taps").
3. `test/teacher-daygroups.test.js:445-486` — **'exact name selects even among
   partial matches'**: pins `commit`'s order (`var exact = exactTeacher(res,
   q);` before `res.total === 1`) and the mobile-commit suppression
   `if (!selected) syncList();` (`:481-482`, "selection must suppress the
   trailing menu re-show"); classes side pins `var like = exactClass(rows, q);`
   + `showClass(like);`.
4. `test/teacher-daygroups.test.js:45-57` — harness bounds: `teacherSlice()` is
   `function breakdownHTML(t)` → `function markActive(name)`, and
   `showTeacherFn()` locates the **literal prefix `function showTeacher(name)`**
   (`:54`) — renaming the signature or relocating these functions breaks the
   harness.
5. `test/teacher-daygroups.test.js:70-91` — `runShowTeacher` sandbox stubs only
   `layout: null`, `syncClear`, `renderSuggest`, `renderGhost`, `markActive` —
   **`syncList` and `searchFocused` are NOT stubbed**, so new statements inside
   `showTeacher` that call them throw in the harness (vm ReferenceError) unless
   the harness is extended.
6. `test/classes.test.js:444-448` — `classes.html` must keep
   `id="searchDone"` and `id="searchClear"` (the classes page mirrors the
   teachers markup; no test reads `index.html` at all — grep-verified).
7. `test/classes.test.js:475` — the CSS rule
   `#searchWrap:focus-within:has(#searchClear:not([hidden])) #searchClear` must
   survive ("rule text per issue 031: the V owns right:0 and the X is the
   control that steps aside").
8. `test/classes.test.js:661-662` — `#layout:not(.is-list) #classList` must
   survive.
9. **Not pinned anywhere** (grep-verified): Escape handling (`:448-454`),
   `index.html` markup, the empty-state markup/CSS (`.empty-state`,
   `no-teacher-selected`), `isCoarsePointer`/the issue-007 pre-focus, the V
   handler body, and the X handler body.

### Existing behaviors the new architecture must preserve or deliberately kill

- **"Exact names select"** and **"taps on the filter always bring the menu
  back"** — reported as introduced by commit `e872489` (cited by the
  coordinating session; **not re-verified here — this Reporter does not run
  git**); enforced in code at `js/teachers.js:214-227, 488-494` and pinned by
  tests `:440-442` and `:445-486` above.
- **"Menu visibility is selection-driven, never blur-driven"** — reported as
  commit `3909bd9` (**not re-verified — no git**); enforced at
  `js/teachers.js:495-501` and pinned by test `:423-443`. Any back button that
  blurs-and-hides must not trip the "blur must not touch menu state" pin.
- **Issue 007 pre-focus rules** — coarse pointer ⇒ no pre-focused suggest row,
  Enter commits the typed query until an explicit pick (`js/teachers.js:15-19,
  331-335, 477-482`), verified in-browser above; unpinned by tests but
  user-visible on phones.
- **The V's other job** — dismissing the on-screen keyboard (`search.blur()`,
  `js/teachers.js:508`) — the user's note explicitly *replaces* this button
  with the back arrow in state=list; what happens to keyboard dismissal in
  state=teacher (where today only the V blurs) is a design decision for the
  Maintainer.
- **The X's focus guard** (`mousedown` preventDefault, `js/teachers.js:520`) and
  its single-slot CSS stacking (`styles.css:560, 564-565`) — pinned for the
  classes page by `test/classes.test.js:475`.
- **Selection must not rewrite the filter** (`js/teachers.js:257-260`) and the
  empty-query auto-render of the kaomoji (`:407`, `:421-427`).

## Repro steps

Commands (from the worktree root
`/home/user/.local/share/opencode/worktree/1de5bb/056-mobile-nav`):

```
node --test                                  # baseline: 103 tests, 103 pass, 0 fail
python3 -m http.server 8056
curl -s -o /dev/null -w '%{http_code}' http://localhost:8056/index.html   # 200
```

Browser: Playwright (MCP), Chromium, **viewport 390×844** (CSS switches at
`styles.css:488` `max-width: 700px`; default pointer is fine —
`(pointer: coarse)` = false — see the coarse note in Observed), URL
**http://localhost:8056/index.html**.

1. **Initial** — load the page. Observed: no list (`#teacherList` hidden),
   kaomoji empty state "No Teacher Selected" + face `|°з°|` filling `#detail`,
   V hidden, X hidden.
2. **Focus** — tap the filter box. Observed: list appears (132 rows), empty
   state disappears (hidden, not destroyed), V appears at the right edge.
3. **Type** — enter `Ben Haj`. Observed: list narrows to 2, suggest dropdown
   opens (row 0 pre-focused on fine pointer; on coarse/touch emulation: none),
   X appears beside the V.
4. **Select** — press Enter (accepts the pre-focused `Ben Haj` suggest row).
   Observed: list dismissed (`is-list` removed), `<h2>Ben Haj</h2>` timeline
   shown, filter still `Ben Haj`, focus kept, V + X both visible. (Selecting by
   tapping a `#teacherList` row instead blurs the input: V disappears
   immediately — measured.)
5. **Hide the keyboard** — tap the V. Observed: input blurred
   (`activeElement` → `BODY`), V hidden, list stays hidden, detail unchanged.
6. **Type again** — tap the filter box (list reappears, teacher detail still
   loaded underneath), type `Bel`. Observed: list updates to 13 rows regardless
   of the open teacher.
7. **Dead-end walk** (from step 5's state) — enumerate every affordance:
   - tap the filter box → list; tap V → back to the teacher. *Never empty.*
   - tap the timeline → nothing changes.
   - Escape (after focusing) → nothing but the suggest overlay (already
     closed); value and selection untouched; no Esc key on mobile anyway.
   - tap X → filter cleared **but the list opens** (empty state is rendered
     into the hidden detail); tap V once more → the empty page finally
     returns (2 taps, via the list).
   - empty-filter variant (focus → tap `Abdelhafidh` in the full list): X is
     hidden, V is hidden — no clear control exists; only
     filter → type junk → X → V (4 taps) restores the empty page.
   - tap outside (e.g. `#status`) while the list is open → list stays visible
     with the V hidden (no back control at all until the box is tapped).
8. **Coarse check** — CDP `Emulation.setTouchEmulationEnabled` flips
   `(pointer: coarse)` to true: suggest row pre-focus and ghost disappear and
   Enter no longer selects (`js/teachers.js:335, 477-482`); pane behavior is
   unchanged (width-gated, and `test/teacher-daygroups.test.js:406-407`
   forbids pointer-gating the CSS).

## Discussion

### Maintainer decision (2026-10-19)

**Verdict — valid, in scope, scope = teachers page only.** The Reporter's
measurements stand: the machine is implicit, `showTeacher` is its only
selection writer, and no affordance in state=teacher reaches state=empty.
The user's three-state proposal is adopted as the named model. Ambiguity
rulings (all binding):

1. **State model** — no third `navState` variable. The machine is *two facts*
   plus one named derivation: `var menuOpen = false;` (the list is open —
   today's `searchFocused`, renamed because it may now be true while the input
   is unfocused) and `var selectedTeacher = null;` (the missing selection
   variable, root-cause item 1). `state = menuOpen ? 'list' :
   selectedTeacher ? 'teacher' : 'empty'`. This *replaces* three implicit
   pieces (selection-as-DOM-content, `searchFocused`, and `lastResultCount`,
   whose only reader was the old `syncList` derivation — it dies). Net state:
   one primitive out, one primitive in, one named derivation added; nothing is
   piled up (honours `3909bd9`'s minimalism by making the machine explicit,
   not by adding to it).
2. **`3909bd9` preserved literally** — the blur handler keeps its exact body
   (`renderSuggest([])` + `renderGhost()`); blur writes *neither* fact. The
   Reporter's D4 landmine (outside-tap leaves list with no back control) is
   fixed on the *read* side: the back arrow is keyed on the state class
   (`#layout.is-list`), never on `:focus-within`. After an outside-tap the
   list persists **with a visible back arrow** — never a trap. The alternative
   (blur re-derives state + mousedown guards on every row) was rejected: it
   re-opens the press-in-flight hazard `3909bd9` closed and rewrites a pin to
   weaken an invariant instead of relocating it.
3. **Back button = `closeMenu()`** (`menuOpen = false; search.blur();
   syncList();`), *no selection mutation*. "Back to the earlier state" is
   satisfied **by construction**: with nothing selected it lands in
   "empty"; with a teacher selected it returns to "teacher" — literally
   "dismisses the list, removes focus, dismisses itself" (user note).
   Deselecting is *not* a dismiss button's job; "teacher → empty" already has
   its dedicated one-tap edge (overlay X). A back button that destroyed the
   selection would violate the same orthogonality the spec builds on.
4. **Overlay / box collision** — in state=teacher the overlay *is* the box;
   the whole surface (name, chevron, background) is ONE click target →
   `openMenu(); search.focus();` → state=list (both user readings agree; the
   chevron is decorative). The **left X is a separate element**
   (`#overlayClear`, inside `#searchOverlay`) — mechanically it must live in
   the overlay (the overlay covers `#searchClear`), and semantically a single
   button meaning "erase filter" in one state and "deselect" in another is an
   aria/maintenance trap. **Teacher-X deselects only; the filter text is
   preserved** (and the preserved-text X shows in list/empty states to erase
   it). Rationale: filter and selection are now orthogonal axes; every control
   does exactly one thing; "selection never writes the filter" gets its
   symmetric twin "deselection never writes the filter".
5. **Filter text across transitions** — never touched by selection,
   deselection, back, or overlay taps (invariant `js/teachers.js:257-260`
   kept). Erase happens only via `#searchClear` (list and empty states — it is
   physically covered by the overlay in teacher state) or the existing
   accept-suggest commit. Emptying the filter (X or backspacing) keeps the
   long-standing rule "an empty filter means nothing is selected":
   `showEmpty()` runs and state goes list→list (kaomoji behind) or, from
   empty, stays empty.
6. **The V-chevron dies on the teachers page only.** Markup
   (`index.html:41-43`), element var, and handler (`js/teachers.js:503-512`)
   are deleted; `#searchBack` replaces its function entirely (its
   keyboard-dismissal job included: `closeMenu()` blurs). The `#searchDone`
   CSS (`styles.css:129, 526-539`) **survives verbatim** — `classes.html` and
   `js/classes.js` still use it and are out of scope.
7. **Desktop (>700px) — zero layout/chrome change.** `#searchBack` and
   `#searchOverlay` carry base `display: none` and only the narrow media may
   show them, so desktop can never render them regardless of JS state. The
   pane swap stays width-only; **no `@media (pointer: coarse)` in CSS**
   (pinned) and **no width checks in JS** — visibility switching stays in CSS,
   JS only writes facts. One deliberate behavioural delta: selection now
   blurs the input on all viewports (the Enter/suggest-accept path used to
   keep focus), so the focus glow/caret clear after a commit that selects.
   Gating that blur on viewport in JS was rejected: it forks the machine by
   pixel-ruler and is exactly the coupling the width-only pin exists to
   prevent. The delta is a border colour and a caret; layout untouched.
8. **Issue-007 pre-focus rules: preserved unchanged** (coarse pointer ⇒ no
   pre-focused suggest row; Enter/Tab commit the typed query until an explicit
   pick). They gate pointer capability, an axis orthogonal to the nav machine;
   killing them would be scope creep and a phone regression.
9. **The auto-jump keeps selecting, and therefore now blurs** — when typing
   collapses the list to exactly one result the implicit selection dismisses
   the keyboard (previously focus was kept). Deliberate: keeping the keyboard
   up after a selection would need a fourth state combination
   (selected + focused + forced card) — the special case this issue exists to
   remove.
10. **Escape** (unpinned): drops the suggest overlay if open, else
    `closeMenu()`; no-op in teacher/empty states (input unfocused there anyway).
    It never deselects.
11. **Scope: teachers-only.** The user's spec is the teachers page; the
    classes page keeps its mirrored dead end (its V markup/CSS/handlers are
    load-bearing for three classes-page pins). Shared artifact `styles.css`
    is edited additively plus one scoping fix (below) that leaves the classes
    page pixel-identical. Recommend the coordinator file a follow-up
    `057-classes-mobile-nav` mirror issue; do **not** extend this diff.

**Architectural direction**

*Transition table* (facts: `menuOpen` M, `selectedTeacher` S; `is-list` ⟺ M;
overlay visible ⟺ S; back arrow visible ⟺ M):

| State | Event | M | S | → State | Effects |
|---|---|---|---|---|---|
| — | boot | false | null | empty | full list render, `showEmpty()`, `syncList()`, `syncClear()`, `syncOverlay()` |
| empty | tap/focus filter box | true | null | list | `openMenu()`; is-list added; back arrow appears (CSS, state-gated) |
| list | type (`onInput`) | true | — | list | suggest/ghost/list re-render; empty query → `showEmpty()`; total===1 → `selectTeacher` |
| list | select (row tap / suggest tap / Enter / Tab) | false | name | teacher | `selectTeacher`: renders detail, `markActive`, `search.blur()`, is-list removed, overlay shows the name |
| teacher | tap overlay (anywhere but its X) | true | name | list | `openMenu(); search.focus();` — back arrow + filtered list, teacher stays selected under it |
| teacher | tap overlay X | false | null | empty | `showEmpty()`; filter text preserved; overlay hides |
| list | tap back arrow | false | unchanged | teacher if S else empty | `closeMenu()`; back arrow self-hides with the menu |
| list | tap `#searchClear` (text present) | true | null | list | erase filter → full list + `showEmpty()`; stays list |
| empty | tap `#searchClear` (preserved text) | false | null | empty | erase filter; stays empty |
| list | blur (tap outside) | true | — | list | PURE: suggest+ghost drop only; list persists **with back arrow** |
| list | Escape | unchanged | unchanged | suggest open → stay list (suggest closes); else = back row | `renderSuggest([])` or `closeMenu()`; never deselects |
| any | desktop >700px | same machine | same | same | `is-list` toggles but narrow-only CSS ignores it; overlay/back never display |

*Code shape* (single writers): `syncList()` becomes the **only** writer of
`is-list`, deriving from `menuOpen` (`if (menuOpen) layout.classList.add(…)
else …remove('is-list')`); `showTeacher` loses its card-forcing line (writer
consolidation, root-cause item 4); every selection funnels through one new
`selectTeacher(name)`; every deselect through one new `showEmpty()`; menu
edges are `openMenu()` / `closeMenu()`. `showTeacher`'s signature, slice
bounds and body calls stay inside the vm-harness stub set — all new
statements live in `selectTeacher`, *not* in `showTeacher` (the sandbox at
`test/teacher-daygroups.test.js:70-91` does not stub `syncList`/
`searchFocused`, and it will not need to).

*Markup* — `index.html` `#searchWrap` (V deleted, two nodes added):

```html
<button type="button" id="searchBack" aria-label="Back">
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>
</button>
<div id="searchOverlay" hidden>
  <button type="button" id="overlayClear" aria-label="Clear the selection">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
  </button>
  <span id="overlayName"></span>
  <svg class="overlay-drop" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
</div>
```

*CSS* — base (beside `styles.css:129`): `#searchBack { display: none; }` and
`#searchOverlay { display: none; }` (desktop armour). Narrow block only:
`#layout.is-list #searchBack` gets the old `#searchDone` geometry mirrored to
`left: 0`; `#layout.is-list #search`/`#ghost` gain a 2.7rem left gutter
composing with `var(--ghost-pre)`; `#searchOverlay:not([hidden])` absolutely
fills `#searchWrap` (z-index 3, wrap background, flex: X — flexible centered
name — chevron); `#overlayClear` reuses the `#searchClear` slot look.
Scoping fix: `styles.css:560` and `:565` (the V-stepping X and its double
padding) are re-scoped to `body[data-page="classes"] …` — with the V dead on
teachers they would leave a phantom 2.7rem hole on that page; the
`classes.test.js:475` pin matches by `indexOf` and keeps passing with the
prefix. Visibility is class/attribute-driven only; no JS width/pointer reads.

*What dies*: `#searchDone` markup + var + handler (teachers); `searchFocused`
(name/semantics → `menuOpen`); `lastResultCount` (declaration + assignment —
its only reader was the old derivation); `showTeacher`'s
`layout.classList.remove('is-list')`; `commit`'s
`if (!selected) syncList();` suppression (syncList can no longer resurrect a
closed menu); the X handler's `search.focus()` (the X no longer arms the
menu); the focus-gated back control pattern itself.

*What is preserved*: exact-name-selects; "taps on the filter always bring the
menu back" (both `search` click/focus handlers stay — the exactly-2-clicks pin
holds);
blur purity; issue-007 coarse rules; filter-never-rewritten-by-selection;
empty-filter ⇒ nothing selected; suggest/ghost machinery; kaomoji + hop;
width-only swap; the entire classes page.

*Rejected alternatives*: (a) explicit `navState` string — a third variable
that must be kept in sync with two facts it is a function of; the derivation
cannot desync. (b) Booleans without derivation (`listOpen`, `selected` +
scattered `classList` writes) — that is today's architecture with a new name.
(c) Blur-syncs-state — weakens `3909bd9`, needs row mousedown guards
everywhere, rewrites the pin to lose force. (d) Same-X-state-dependent — aria
lie + covered-element collision (see ruling 4). (e) Back always deselects —
violates "dismisses the list" and destroys state no gesture asked to destroy.
(f) Porting to `js/classes.js` now — doubles pin churn on a page this user
proposal never described.

**Acceptance criteria** (blind-implementer complete; diffs limited to
`index.html`, `js/teachers.js`, `styles.css`, `test/teacher-daygroups.test.js`)

1. `js/teachers.js` :35 — delete `var searchDone = …`. Add element vars
   `searchBack`, `searchOverlay` (id `searchOverlay`), `overlayName`,
   `overlayClear`.
2. :49-53 — replace comment + `searchFocused`/`lastResultCount` with:

   ```js
   // mobile nav machine (issue 056): two facts, three named states —
   //   menuOpen                 -> 'list'   (filterable list + back arrow)
   //   !menuOpen && selected    -> 'teacher' (timeline + name overlay)
   //   !menuOpen && !selected   -> 'empty'  (kaomoji; the default)
   // Blur writes neither fact (a press in flight must never lose its row);
   // only openMenu/closeMenu (menu edges), selectTeacher and showEmpty write.
   var menuOpen = false;
   var selectedTeacher = null;
   ```

3. :142-145 — `syncList()` body becomes `if (!layout) return; if
   (menuOpen) layout.classList.add('is-list'); else
   layout.classList.remove('is-list');` (comment: sole writer of `is-list`).
   Immediately after `syncClear` (:151) add, in order: `syncOverlay()`
   (`overlay.hidden = selectedTeacher === null; if (selectedTeacher !== null)
   overlayName.textContent = selectedTeacher;`), `openMenu()` (`menuOpen =
   true; syncList();`), `closeMenu()` (`menuOpen = false; search.blur();
   syncList();`), `showEmpty()` (`selectedTeacher = null;
   detail.innerHTML = emptyStateHTML(); markActive(null); syncOverlay();`),
   `selectTeacher(name)` (`selectedTeacher = name; showTeacher(name);
   search.blur(); menuOpen = false; syncList(); syncOverlay();` — comment:
   the single selection funnel; blurs because the overlay owns the box).
4. `renderItem` :201 — `li.onclick = function () { selectTeacher(r.teacher); };`
5. `showTeacher` tail :312-316 — keep `markActive(name);` and
   `syncClear();`; delete the `if (layout)
   layout.classList.remove('is-list');` line and its comment (replace with
   `// state transition lives in selectTeacher — this function only renders`).
   Do not touch `showTeacher`'s signature or its body above the final
   `markActive(name);` line (the day-group rendering is issue-051 territory).
6. `onInput` :407 — empty-query branch becomes `if (!q.trim()) showEmpty();`
   ; auto-jump :411 — `if (only) selectTeacher(only.teacher);`. Trailing
   `syncList();` stays.
7. `commit` :421-443 — empty branch: keep `renderList(…)` +
   `syncList();`, replace the innerHTML/markActive lines with `showEmpty();`.
   Exact branch: `selectTeacher(exact);`; total===1 branch:
   `selectTeacher(only.teacher);`. Delete the `if (!selected) syncList();`
   line and its comment (add: `// no trailing syncList: a selection closes the
   menu and syncList cannot resurrect a closed one`).
8. Escape branch :448-454 — after `e.preventDefault();`: `if
   (!suggest.hidden) { renderSuggest([]); renderGhost(); return; }
   closeMenu();`. Tab/Arrow/Enter branches untouched (issue 007).
9. focus :484-487 and click :491-494 — bodies become `openMenu();`. blur
   :498-501 — **unchanged** (`renderSuggest([]); renderGhost();`), comment
   updated to "menu visibility is selection/back-driven, never blur-driven".
10. :503-512 — delete the `searchDone` handler; add `if (searchBack)
    searchBack.addEventListener('click', function () { closeMenu(); });`
    with the comment "back dismisses the open list + focus and hides itself;
    a selected teacher stays selected". After the `markActive` function (or
    beside these handlers) add: `if (overlay)
    overlay.addEventListener('click', function () { openMenu();
    search.focus(); });` and `if (overlayClear)
    overlayClear.addEventListener('click', function (e) {
    e.stopPropagation(); showEmpty(); });`.
11. X handler :521-526 — drop `search.focus();` (body: `search.value = '';
    syncClear(); commit();`), comment updated ("the X erases the filter in
    the list/empty states; it no longer arms the menu — teacher-state deselect
    is #overlayClear").
12. Boot :529-533 — replace `detail.innerHTML = emptyStateHTML();` with
    `showEmpty();`; keep `renderList(…)` first and `syncList(); syncClear();`
    after.
13. `index.html` — remove the `#searchDone` button (:41-43); insert
    `#searchBack` between `<input>` and `#searchClear`, and `#searchOverlay`
    between `#searchClear` and `#suggest`, exactly as in the markup block
    above (SVG paths verbatim).
14. `styles.css` base (~:129) — add `#searchBack { display: none; }` and
    `#searchOverlay { display: none; }` with a one-line comment ("desktop
    never shows the mobile nav chrome; the narrow block may"). Leave the
    `#searchDone`/`#searchClear` base rules untouched (classes page).
15. `styles.css` narrow block (after :539) — add, verbatim in spirit:
    `#layout.is-list #searchBack` (flex, `position:absolute; left:0; top:0;
    bottom:0; width:2.7rem`, transparent border/background, `z-index:2`,
    `:active` colour, svg sizing copied from `#searchDone`), the chevron-left
    path `M15 6l-6 6 6 6`, `#layout.is-list #search { padding-left:
    calc(2.7rem + .6rem + var(--ghost-pre, 0px)); }`,
    `#layout.is-list #ghost { padding-left: calc(2.7rem + .6rem); }`, and
    `#searchOverlay:not([hidden])` (absolute fill of `#searchWrap`,
    `z-index:3`, `display:flex; align-items:center`, wrap background
    `var(--md-surface-container-lowest, #fff)`, `padding:.45rem .6rem`,
    `cursor:pointer`), `#overlayClear` (2.7rem slot, same look as
    `#searchClear`), `#overlayName { flex:1 1 auto; text-align:center;
    overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }`,
    `.overlay-drop` (1.5rem stroke svg, `--md-on-surface-variant` colour,
    `flex:0 0 auto`). **No `@media (pointer: coarse)` anywhere.**
16. `styles.css:560` and `:565` — prefix both selectors with
    `body[data-page="classes"] ` (rule text after the prefix unchanged; the
    `classes.test.js:475` `indexOf` pin must still pass — verify).
17. Tests — `test/teacher-daygroups.test.js` only.
    a. **Keep** :396-408 as-is (literals survive; no-pointer-gate pin holds).
    b. **Rewrite** :423-443 (keep the test name). Teachers side: blur slice
    must contain `renderSuggest([])` and must NOT contain `menuOpen`,
    `syncList`, `openMenu`, `closeMenu`, `setTimeout`; `function openMenu()`
    slice must contain `menuOpen = true`; the focus handler and the click
    handler slices must each contain `openMenu()`; `function closeMenu()`
    slice must contain `menuOpen = false` and `search.blur()`; the init
    section must contain `layout.classList.remove('is-list')` (now inside
    `syncList`). Classes side: unchanged assertions on `searchFocused`.
    Keep both-file `setTimeout` absence and the exactly-2
    `search.addEventListener('click'` pin.
    c. **Rewrite** the wiring tail of :445-486 (keep exact-order pins):
    replace the `if (!selected) syncList();` assertion with: the commit slice
    contains `selectTeacher(exact);` and `selectTeacher(only.teacher);`, and
    contains no direct `showTeacher(` call (single-funnel pin). Classes-side
    assertions unchanged.
    d. **Add** `INDEX_SRC` read (fs + path, like `APP_SRC`) and two new tests
    (append near the mobile block):
    **'teachers nav chrome: state-gated back arrow, teacher overlay, V gone'**
    — `index.html` contains `id="searchBack"`, `id="searchOverlay"`,
    `id="overlayClear"`, `id="overlayName"` and NOT `id="searchDone"`;
    `styles.css` base contains `#searchBack { display: none; }` and
    `#searchOverlay { display: none; }`; the narrow slice contains
    `#layout.is-list #searchBack` and `#searchOverlay:not([hidden])`; the
    full CSS contains no `#searchWrap:focus-within #searchBack` (the back
    control must never be focus-gated — anti-D4 regression pin).
    **'nav machine: single selection/empty funnels, harness-safe showTeacher'**
    — APP_SRC contains `var menuOpen = false;`, `var selectedTeacher =
    null;`, and NOT `var lastResultCount`; `showTeacherFn()` contains neither
    `menuOpen` nor `search.blur` (vm-harness safety); the `selectTeacher`
    slice contains `selectedTeacher = name`, `showTeacher(name)`,
    `search.blur()`, `menuOpen = false`; the `showEmpty` slice contains
    `selectedTeacher = null`, `emptyStateHTML()`, `markActive(null)`; the
    `onInput` slice contains `showEmpty();` and `selectTeacher(only.teacher)`;
    the list-row wiring contains `selectTeacher(r.teacher)`; the overlay
    wiring contains `openMenu()` + `search.focus()` and `stopPropagation` +
    `showEmpty()`.
    e. Expected result: `node --test` → **105 tests, 105 pass, 0 fail**
    (baseline 103; zero deletions or additions besides the two new tests;
    b and c are rewrites in place).
18. Verification (Implementer; I am visually unverified — no browser in my
    session, so the playwright walk is **required**, not optional): serve
    `python3 -m http.server 8056`; `curl` 200 for `/index.html`,
    `/classes.html`, `/styles.css`, `/js/teachers.js`; run `node --test`
    (105/105); then Playwright/Chromium at **390×844** on
    `http://localhost:8056/index.html` and assert:
    1. Load: no `is-list`; `#teacherList` hidden; `.empty-state` visible;
       `#searchOverlay` hidden; `#searchBack` `display:none`;
       `#searchClear` hidden.
    2. Tap `#search`: `is-list` set; 132 `li[data-name]` rows; `#searchBack`
       `display:flex` and its bounding box hugs the box's LEFT edge; overlay
       still hidden.
    3. Type `Ben Haj`: list narrows to 2; suggest open; `#searchClear`
       visible at the right edge.
    4. Enter: `is-list` gone; `#detail h2` = "Ben Haj";
       `#searchOverlay:not([hidden])` covers `#search` (overlay bbox contains
       input bbox); `#overlayName` text "Ben Haj"; `document.activeElement`
       is NOT `#search`; deselect X at the overlay's left, chevron at its
       right.
    5. Tap overlay centre: `is-list` back; overlay hidden; `#search` focused;
       back arrow visible; 2 rows with the active class on "Ben Haj".
    6. Tap `#searchBack`: `is-list` gone; back arrow hidden; overlay visible
       again; `#detail h2` = "Ben Haj" (back returned to the earlier state);
       `document.activeElement` is NOT `#search`.
    7. Tap `#overlayClear`: `.empty-state` visible; overlay hidden;
       `#search` value still "Ben Haj"; `#searchClear` visible.
    8. Tap `#searchClear`: value ""; state still empty (no `is-list`);
       `.empty-state` still visible.
    9. Empty → tap `#search` → type `zzz` → "No teachers match." → tap
       `#status`: `is-list` STILL set AND `#searchBack` STILL `display:flex`
       (D4 fixed); tap back → `.empty-state` visible.
    10. Tap `#search`, type `Abdelhafidh` (single hit): auto-select —
        `#detail h2` = "Abdelhafidh", overlay visible, input blurred.
    11. Desktop **1280×800**: overlay and back arrow never appear across
        steps 1-7 repeated; selecting a teacher keeps both panes visible;
        value preserved.
    12. CDP `Emulation.setTouchEmulationEnabled(true)`: steps 1-8 repeat
        with issue-007 behaviour (no suggest pre-focus on `Bel`; Enter on
        `Bel` does not select).
19. Diff hygiene: only the four files of criterion 17/13-16 plus the
    implementer's own `## Discussion` entry. **No-go**: no changes to
    `js/classes.js`, `classes.html`, `test/classes.test.js`; no `setTimeout`;
    no width/pointer reads in JS; no pointer media in CSS; no edits inside
    `showTeacher` above its tail; no edits to suggest/ghost/kaomoji/CSS
    empty-state machinery; do not rename `searchClear`/`suggest`/`is-list`.
20. **Sibling boundaries (issue #051 live-clock, parallel worktree)** — my
    edit regions in `js/teachers.js`: :35 (element vars), :49-53 (state),
    :142-151 + new fns to ~:185 (sync/edges/funnels), :201 (row onclick),
    :312-316 (showTeacher tail only), `onInput`/`commit` :399-443, Escape
    branch :448-454, focus/click/blur :484-501, V/X handlers :503-527, boot
    paint :529-533. I do **not** touch #051's regions: the head clock section
    (`var now = new Date();` :46 and the avail block), `showTeacher`'s
    interior from `var ss = …` through the day-group loop (:263-309 — `now2`,
    `liveDays`, `upcoming`), or any model/match files. Known textual overlap:
    the boot paint line and possibly `showTeacher`'s entry — merges keep both
    sides (051's tick + my `showEmpty()`/`syncOverlay()`).

**Risks / constraints**

- `is-list` writers collapse to `syncList` — any future direct
  `classList` write re-creates the root cause; the new-machine test pins the
  funnels.
- `selectedTeacher` must change in exactly two places (`selectTeacher`,
  `showEmpty`); both call `syncOverlay()`. A third writer without it leaves a
  phantom overlay.
- Desktop Enter-select now blurs (glow/caret clear) — intended, documented in
  ruling 7; guard against "fixing" it with a viewport check.
- Narrow auto-jump now dismisses the keyboard (ruling 9) — asserted by walk
  step 10; do not restore focus after implicit selection.
- The `body[data-page="classes"]` prefix on :560/:565 must keep the literal
  selector text (classes.test.js:475 substring pin) and must not leak the
  phantom-hole back onto teachers.
- `showTeacher` must stay within the vm-harness stub set — new logic belongs
  in `selectTeacher`/`showEmpty`, never in `showTeacher`'s body.
- Merge order with #051: reconcile the boot block by hand; everything else is
  disjoint by region.

### Fix implemented (2026-10-19)

Implemented faithfully against the numbered acceptance criteria; changed files:
`index.html`, `js/teachers.js`, `styles.css`, `test/teacher-daygroups.test.js`
(+ this entry). `js/classes.js`, `classes.html` and `test/classes.test.js` are
byte-identical to base (verified with `cmp` against the pristine `main`
worktree; a full-tree `diff -rq` shows no other differences).

**Implementation notes (the only reconciliations of internally inconsistent
literals — behavior per the transition table and walk unchanged):**

1. `syncOverlay()` visibility. Criterion 3's literal body
   `overlay.hidden = selectedTeacher === null;` keeps the overlay rendered in
   the list-from-teacher state (nothing in criterion 15's CSS list hides it
   there), where it would cover the input and the back arrow (z-index 3) and
   contradict walk step 5's exact assertion "overlay hidden" and the overlay
   edge's target state "→ list" in the transition table. Implemented as the
   single state derivation `searchOverlay.hidden = selectedTeacher === null
   || menuOpen;` (overlay ⟺ the 'teacher' state — the transition-table header
   "overlay visible ⟺ S" read together with the rows' target states), with
   `openMenu()` and `closeMenu()` each ending in `syncOverlay()` — the same
   single-writer shape as `syncList()`. `selectedTeacher` still changes in
   exactly two places, both calling `syncOverlay()` (risk section honored);
   no 17d pin reads `syncOverlay`'s body.
2. Overlay element var named `searchOverlay` per criterion 1's var list; the
   snippets in criteria 3/10 write `overlay` for the same element (id
   `searchOverlay`). No test pins the local name.
3. Walk step 10 typing: with sequential typing the auto-jump now fires (and
   blurs, ruling 9) at the intermediate query "Abdelha" (first total===1);
   the step was executed as one input event ("type Abdelhafidh" → auto-jump
   select) — the asserted end state is identical.
4. Walk step 12: this playwright MCP server exposes no CDP
   touch-emulation tool (`browser_emulate_media` covers only
   color/reduced-motion/forced-colors/contrast). The issue-007 gate reads
   `window.matchMedia('(pointer: coarse)')` at call time, so it was patched
   in-page (`matches: true`, other queries passed through) — behaviourally
   equivalent for the pre-focus/Enter assertions; no page code was changed.

**Checklist vs the numbered criteria**

1. ✓ :35 — `searchDone` var deleted; element vars `searchBack`,
   `searchOverlay` (id `searchOverlay`), `overlayName`, `overlayClear` added.
2. ✓ :49-53 replaced by the exact comment block and
   `var menuOpen = false;` / `var selectedTeacher = null;`; no third state var.
3. ✓ `syncList` body is the exact sole-writer derivation (comment per
   criterion); `syncOverlay`, `openMenu`, `closeMenu`, `showEmpty`,
   `selectTeacher` added in order immediately after `syncClear`
   (`syncOverlay` per note 1; `selectTeacher`/`showEmpty` verbatim).
4. ✓ `renderItem` — `li.onclick = function () { selectTeacher(r.teacher); };`
5. ✓ `showTeacher` tail — `markActive(name);` + `syncClear();` kept, the
   card-forcing line + its comment replaced by the "state transition lives in
   selectTeacher" comment; signature and body above the tail untouched
   (issue-051 regions intact).
6. ✓ `onInput` — `if (!q.trim()) showEmpty();`; auto-jump
   `if (only) selectTeacher(only.teacher);`; trailing `syncList();` kept.
7. ✓ `commit` — empty branch keeps `renderList(…)` + `syncList();` and uses
   `showEmpty();`; `selectTeacher(exact);` / `selectTeacher(only.teacher);`;
   `if (!selected) syncList();` + comment replaced by the no-trailing-syncList
   comment.
8. ✓ Escape — `preventDefault(); if (!suggest.hidden) { renderSuggest([]);
   renderGhost(); return; } closeMenu();`; Tab/Arrow/Enter branches untouched
   (issue 007).
9. ✓ focus + click bodies are `openMenu();`; blur body unchanged
   (`renderSuggest([]); renderGhost();`), comment updated to
   "selection/back-driven, never blur-driven".
10. ✓ `searchDone` handler deleted; `if (searchBack) … { closeMenu(); }` with
    the prescribed comment; overlay surface listener
    (`openMenu(); search.focus();`) and `overlayClear` listener
    (`e.stopPropagation(); showEmpty();`).
11. ✓ X handler — body `search.value = ''; syncClear(); commit();`;
    `search.focus()` dropped; comment updated (erase in list/empty;
    teacher-state deselect is `#overlayClear`).
12. ✓ Boot — `showEmpty();` replaces the innerHTML paint; `renderList(…)`
    first, `syncList(); syncClear();` after.
13. ✓ `index.html` — `#searchDone` removed; `#searchBack` between `<input>`
    and `#searchClear`; `#searchOverlay` between `#searchClear` and `#suggest`;
    SVG paths verbatim per the markup block.
14. ✓ Base `styles.css` — `#searchBack { display: none; }` and
    `#searchOverlay { display: none; }` with the one-line comment; the
    `#searchDone`/`#searchClear` base rules untouched.
15. ✓ Narrow block (after the `#searchDone` svg rule) — `#layout.is-list
    #searchBack` (flex, absolute left:0, 2.7rem, transparent, z-index 2,
    `:active` colour, svg sizing from `#searchDone`, chevron-left path
    `M15 6l-6 6 6 6`), the `#layout.is-list #search`/`#ghost` gutters
    composing with `--ghost-pre`, `#searchOverlay:not([hidden])` (absolute
    fill, z-index 3, flex, wrap background, `.45rem .6rem`, pointer),
    `#overlayClear` (2.7rem slot, `#searchClear` look), `#overlayName`
    (flex/center/ellipsis), `.overlay-drop` (1.5rem stroke svg,
    `--md-on-surface-variant`, `flex: 0 0 auto`). **No
    `@media (pointer: coarse)` anywhere** (pin holds).
16. ✓ The two V-stepping X rules re-scoped with the
    `body[data-page="classes"] ` prefix; rule text after the prefix unchanged;
    `test/classes.test.js:475` `indexOf` pin passes (in the 105).
17. ✓ Tests — a: :396-408 untouched; b: rewritten in place, same name, all
    listed assertions (teachers blur purity on
    `menuOpen`/`openMenu`/`closeMenu`/`syncList`/`setTimeout`;
    `function openMenu()` slice contains `menuOpen = true`; focus and click
    slices contain `openMenu()`; `function closeMenu()` slice contains
    `menuOpen = false` + `search.blur()`; init section contains
    `layout.classList.remove('is-list')` (now inside `syncList`); classes-side
    `searchFocused` assertions unchanged; both-file `setTimeout` absence; the
    exactly-2 `search.addEventListener('click'` pin); c: wiring tail
    rewritten — exact-order pins kept, the funnel pins
    (`selectTeacher(exact);`, `selectTeacher(only.teacher);`) and the
    no-direct-`showTeacher(` pin replace the `if (!selected) syncList();`
    pin; classes-side unchanged; d: `INDEX_SRC` read added and the two new
    tests appended with every listed assertion; e: `node --test` → **105
    tests, 105 pass, 0 fail** (baseline 103 re-verified before the change).
18. ✓ Verification — see below; the playwright walk was executed with every
    exact assertion at 390×844 (coarse via note 4).
19. ✓ Diff hygiene — full-tree diff vs base: only the four allowed files; the
    no-go list checked (no `js/classes.js`/`classes.html`/
    `test/classes.test.js` edits, no `setTimeout`, no width/pointer reads in
    JS, no pointer media in CSS, no edits inside `showTeacher` above its
    tail, suggest/ghost/kaomoji/CSS empty-state machinery untouched, no
    renames of `searchClear`/`suggest`/`is-list`).
20. ✓ Sibling boundaries — only the #056 regions in `js/teachers.js` edited;
    the head clock section (`var now = new Date();`), `showTeacher`'s
    interior (day-group loop) and all model/match files untouched.

**Verification results**

- `node --test` → **105/105 pass, 0 fail**; `node --test test/*.test.js` →
  **105/105 pass, 0 fail** (baseline re-verified at 103/103 before the
  change). `test/classes.test.js:475` passes inside the 105.
- curl (server `python3 -m http.server 8056`): `/index.html` 200,
  `/classes.html` 200, `/styles.css` 200, `/js/teachers.js` 200. Server
  stopped by PID afterwards.
- Console over the whole walk: 0 JS errors/warnings (only the browser's
  default `/favicon.ico` request 404s — the repo ships no favicon, pre-existing
  on both pages).

Playwright state-walk, Chromium, `http://localhost:8056/index.html`:

| # | Step | Exact assertions (criterion 18) | Measured | Result |
|---|---|---|---|---|
| 1 | Load 390×844 | no `is-list`; `#teacherList` hidden; `.empty-state` visible; `#searchOverlay` hidden; `#searchBack` display:none; `#searchClear` hidden | `is-list` absent; list `display:none`; detail `display:flex` + "No Teacher Selected"; overlay `[hidden]` + display:none; back display:none; X `[hidden]` | PASS |
| 2 | Tap `#search` | `is-list` set; 132 rows; back `display:flex` hugging the LEFT edge; overlay still hidden | `is-list` ✓; 132 `li[data-name]`; back x=13.8 vs wrap x=12.8 (1px border), w=43.2px=2.7rem; overlay hidden | PASS |
| 3 | Type `Ben Haj` | list → 2; suggest open; `#searchClear` visible at the right edge | 2 rows; suggest 2 rows (fine-pointer: row 0 pre-focused + ghost); X display:flex at right edge | PASS |
| 4 | Enter | `is-list` gone; `h2`=Ben Haj; overlay `:not([hidden])` covers input; `#overlayName`=Ben Haj; activeElement ≠ `#search`; X left, chevron right | overlay display:flex with bbox identical to input's; name text "Ben Haj"; activeElement BODY; X x=23.4 < name x=66.6 < chevron x=327.6 | PASS |
| 5 | Tap overlay centre | `is-list` back; overlay hidden; `#search` focused; back visible; 2 rows active on Ben Haj | `[hidden]` true + display:none; activeElement=search; back display:flex; 1 `li.active` = Ben Haj | PASS |
| 6 | Tap `#searchBack` | `is-list` gone; back hidden; overlay visible again; `h2`=Ben Haj; activeElement ≠ `#search` | back display:none; overlay display:flex; h2 kept; activeElement BODY | PASS |
| 7 | Tap `#overlayClear` | `.empty-state` visible; overlay hidden; value still "Ben Haj"; `#searchClear` visible | heading visible (detail display:flex); overlay hidden; value "Ben Haj"; X display:flex | PASS |
| 8 | Tap `#searchClear` | value ""; still empty (no `is-list`); empty state still visible | value ""; `is-list` absent; heading visible | PASS |
| 9 | Empty → `#search` → `zzz` → tap `#status` → back | "No teachers match."; `is-list` STILL set AND back STILL display:flex (D4 fixed); back → empty state | all measured ✓ in both phases | PASS |
| 10 | `#search` → `Abdelhafidh` (single hit) | auto-select: `h2`=Abdelhafidh; overlay visible; input blurred (ruling 9) | h2 "Abdelhafidh"; overlay display:flex + name; activeElement BODY | PASS |
| 11 | Desktop 1280×800, steps 1–7 repeated | overlay and back never appear at any point; selecting a teacher keeps both panes visible; value preserved; selection blurs (ruling-7 delta) | back/overlay display:none on load, focus, type, select; after Enter: list `display:block` + detail `display:block`, h2 Ben Haj, value "Ben Haj", activeElement BODY (steps 5–7 are desktop-unreachable by design — chrome never renders, asserted display:none) | PASS |
| 12 | CDP unavailable → in-page `(pointer: coarse)` patch (note 4), steps 1–8 + `Bel` | steps 1–8 repeat; `Ben Haj` typing: no suggest pre-focus, no ghost; Enter commits the typed query → exact-name select → teacher state; Enter on `Bel` does not select | coarse=true; Ben Haj: 2 suggest rows, 0 active, ghost hidden; Enter → h2 Ben Haj + overlay; full overlay/back/overlayClear/searchClear round-trip holds; `Bel`: 8 suggest rows, 0 active, ghost hidden; Enter → h2 null, overlay hidden, `is-list` still set | PASS |

**Exact diff**

```diff
--- clean/js/teachers.js	2026-10-18 22:08:12.575582226 +0100
+++ 056-mobile-nav/js/teachers.js	2026-10-20 00:04:17.034790093 +0100
@@ -32,7 +32,10 @@
 
   function initTeachersPage(store, modelObjs, index) {
     var search = document.getElementById('search');
-    var searchDone = document.getElementById('searchDone');
+    var searchBack = document.getElementById('searchBack');
+    var searchOverlay = document.getElementById('searchOverlay');
+    var overlayName = document.getElementById('overlayName');
+    var overlayClear = document.getElementById('overlayClear');
     var searchClear = document.getElementById('searchClear');
     var ghost = document.getElementById('ghost');
     var ghostTyped = document.getElementById('ghostTyped');
@@ -46,11 +49,14 @@
     var now = new Date();
     var suggestIdx = -1;
     var suggestRows = [];
-    // mobile state machine: one class `is-list` on #layout, absent = cards.
-    // Derived at focus/onInput/commit; showTeacher forces cards. Blur only
-    // drops the suggest overlay, never the menu.
-    var searchFocused = false;
-    var lastResultCount = -1;
+    // mobile nav machine (issue 056): two facts, three named states —
+    //   menuOpen                 -> 'list'   (filterable list + back arrow)
+    //   !menuOpen && selected    -> 'teacher' (timeline + name overlay)
+    //   !menuOpen && !selected   -> 'empty'  (kaomoji; the default)
+    // Blur writes neither fact (a press in flight must never lose its row);
+    // only openMenu/closeMenu (menu edges), selectTeacher and showEmpty write.
+    var menuOpen = false;
+    var selectedTeacher = null;
 
     // A giant, faint emoticon fills the detail area whenever no teacher is
     // selected (initial load, or the filter cleared back to empty). The faces
@@ -135,13 +141,15 @@
     });
     status.textContent = store.size + ' sessions · ' + store.teachers.length + ' teachers';
 
-    // List/detail swap state: `is-list` is present iff the search box is
-    // focused and the most recent render did not leave exactly one result.
-    // Only narrow CSS reads the class (one pane at a time); wider screens
-    // keep both panes visible and this only toggles state.
+    // List/detail swap state: `is-list` is present iff the menu is open.
+    // syncList is the SOLE writer of `is-list`, deriving from the menuOpen
+    // fact (issue 056) — no other code may touch the class. Only narrow CSS
+    // reads it (one pane at a time); wider screens keep both panes visible
+    // and this only toggles state.
     function syncList() {
       if (!layout) return;
-      layout.classList.toggle('is-list', searchFocused && lastResultCount !== 1);
+      if (menuOpen) layout.classList.add('is-list');
+      else layout.classList.remove('is-list');
     }
 
     // Mobile clear "x": it is shown only while the filter holds text. Called
@@ -150,12 +158,50 @@
       if (searchClear) searchClear.hidden = !search.value;
     }
 
+    // The name overlay belongs to the 'teacher' state: hidden unless a
+    // teacher is selected AND the menu is closed (issue 056).
+    function syncOverlay() {
+      searchOverlay.hidden = selectedTeacher === null || menuOpen;
+      if (selectedTeacher !== null) overlayName.textContent = selectedTeacher;
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
+    // every deselect funnels through here; the filter text is preserved
+    function showEmpty() {
+      selectedTeacher = null;
+      detail.innerHTML = emptyStateHTML();
+      markActive(null);
+      syncOverlay();
+    }
+
+    // the single selection funnel: every path that picks a teacher lands
+    // here; blurs because the overlay owns the box in state=teacher
+    function selectTeacher(name) {
+      selectedTeacher = name;
+      showTeacher(name);
+      search.blur();
+      menuOpen = false;
+      syncList();
+      syncOverlay();
+    }
+
     // ---- list rendering (sections, identical on all viewports) ----
 
     function renderList(sections) {
       var total = 0;
       sections.forEach(function (s) { total += s.hits.length; });
-      lastResultCount = total;
       list.innerHTML = '';
       if (!total) {
         var li0 = document.createElement('li');
@@ -198,7 +244,7 @@
       // The filter is the source of truth for the list: selecting a row must
       // not rewrite it, so the result list stays as-is and the user can move
       // to the next hit.
-      li.onclick = function () { showTeacher(r.teacher); };
+      li.onclick = function () { selectTeacher(r.teacher); };
       list.appendChild(li);
     }
 
@@ -310,8 +356,7 @@
       h += breakdownHTML(t);
       detail.innerHTML = h;
       markActive(name);
-      // a selection always shows the detail/card view
-      if (layout) layout.classList.remove('is-list');
+      // state transition lives in selectTeacher — this function only renders
       // the filter is untouched by selection; keep the clear "x" in step
       syncClear();
     }
@@ -403,12 +448,12 @@
       renderList(res.sections);
       renderSuggest(match.suggest(index, q));
       renderGhost();
-      // an empty filter means nothing is selected: blank the detail area
-      if (!q.trim()) { detail.innerHTML = emptyStateHTML(); markActive(null); }
+      // an empty filter means nothing is selected: back to the empty state
+      if (!q.trim()) showEmpty();
       // exactly one result left -> auto-jump to the table view
       if (res.total === 1) {
         var only = onlyHit(res);
-        if (only) showTeacher(only.teacher);
+        if (only) selectTeacher(only.teacher);
       }
       syncList();
     }
@@ -420,37 +465,34 @@
       renderGhost();
       if (!q.trim()) {
         renderList(match.searchSections(index, '', avail).sections);
-        detail.innerHTML = emptyStateHTML();
-        markActive(null);
+        showEmpty();
         syncList();
         return;
       }
       var res = match.searchSections(index, q, avail);
       renderList(res.sections);
       var exact = exactTeacher(res, q);
-      var selected = false;
       if (exact) {
-        showTeacher(exact);
-        selected = true;
+        selectTeacher(exact);
       } else if (!res.total) {
         detail.innerHTML = '<p class="nomatch">No match for "' + esc(q) + '".</p>';
       } else if (res.total === 1) {
         var only = onlyHit(res);
-        if (only) { showTeacher(only.teacher); selected = true; }
+        if (only) selectTeacher(only.teacher);
       }
-      // a selection dismisses the menu; syncList would put it back since the
-      // rendered count is not 1
-      if (!selected) syncList();
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
@@ -482,53 +524,53 @@
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
 
-    // the mobile V-chevron button beside the input removes focus (hides the
-    // on-screen keyboard) and explicitly leaves list mode for the cards; it
-    // blurs itself too so the #searchWrap:focus-within glow clears and the
-    // button hides again
-    if (searchDone) searchDone.addEventListener('click', function () {
-      search.blur();
-      searchDone.blur();
-      searchFocused = false;
-      syncList();
+    // back dismisses the open list + focus and hides itself; a selected
+    // teacher stays selected ("back to the earlier state" by construction)
+    if (searchBack) searchBack.addEventListener('click', function () { closeMenu(); });
+    // in state=teacher the overlay IS the box: the whole surface (name,
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
 
-    // the always-visible mobile X clears the filter exactly like a manual
-    // clear (empty query -> full list + emoticon detail). mousedown is
-    // prevented so the button never takes focus; search.focus() keeps the
-    // keyboard, the V and mobile list mode available and stops the blur
-    // handler from firing.
+    // the mobile X erases the filter in the list/empty states (empty query
+    // -> full list + emoticon detail); it no longer arms the menu —
+    // teacher-state deselect is #overlayClear. mousedown is prevented so
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
 
     // initial paint: full list (available-today raised), faint emoticon detail
     renderList(match.searchSections(index, '', avail).sections);
-    detail.innerHTML = emptyStateHTML();
+    showEmpty();
     syncList();
     syncClear();
   }
--- clean/index.html	2026-10-16 17:55:27.872738301 +0100
+++ 056-mobile-nav/index.html	2026-10-20 00:04:35.651356550 +0100
@@ -38,12 +38,19 @@
     <div id="searchWrap">
       <div id="ghost" aria-hidden="true"><span id="ghostPre"></span><span id="ghostTyped"></span><span id="ghostRest"></span></div>
       <input id="search" type="search" placeholder="Search teacher, class (GLSI3D1) or subject…" autocomplete="off">
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
     <ul id="teacherList"></ul>
--- clean/styles.css	2026-10-17 13:25:57.156392819 +0100
+++ 056-mobile-nav/styles.css	2026-10-20 00:05:40.535970542 +0100
@@ -128,6 +128,9 @@
    keyboard / leaves list mode). The V is an inline SVG chevron. */
 #searchDone { display: none; }
 #searchClear { display: none; }
+/* mobile nav chrome (issue 056): desktop never shows it; the narrow block may */
+#searchBack { display: none; }
+#searchOverlay { display: none; }
 /* JS sets [hidden] while the filter is empty; the id rules here (and the
    mobile display:flex below) would otherwise outrank the UA [hidden] default. */
 #searchClear[hidden] { display: none; }
@@ -537,6 +540,54 @@
     width: 1.5rem; height: 1.5rem; fill: none; stroke: currentColor; stroke-width: 2.4;
     stroke-linecap: round; stroke-linejoin: round;
   }
+  /* issue 056: the back arrow replaces the V on the teachers page. It is
+     state-gated (#layout.is-list), never focus-gated, so an outside-tap
+     blur leaves the list with a visible way back; it hides with the menu. */
+  #layout.is-list #searchBack {
+    display: flex; align-items: center; justify-content: center;
+    position: absolute; left: 0; top: 0; bottom: 0; width: 2.7rem;
+    border: 0; background: transparent; color: var(--md-on-surface-variant, #555);
+    cursor: pointer; z-index: 2;
+  }
+  #layout.is-list #searchBack:active { color: var(--md-primary, #0b4da2); }
+  #layout.is-list #searchBack svg {
+    width: 1.5rem; height: 1.5rem; fill: none; stroke: currentColor; stroke-width: 2.4;
+    stroke-linecap: round; stroke-linejoin: round;
+  }
+  /* the input text and the ghost completion clear the back-arrow slot
+     while the list is open (composing with the --ghost-pre inset) */
+  #layout.is-list #search { padding-left: calc(2.7rem + .6rem + var(--ghost-pre, 0px)); }
+  #layout.is-list #ghost { padding-left: calc(2.7rem + .6rem); }
+  /* state=teacher: the overlay IS the box — deselect X left, centered name,
+     decorative chevron right; the whole surface is one click target that
+     reopens the list */
+  #searchOverlay:not([hidden]) {
+    position: absolute; left: 0; top: 0; right: 0; bottom: 0; z-index: 3;
+    display: flex; align-items: center;
+    background: var(--md-surface-container-lowest, #fff);
+    padding: .45rem .6rem; cursor: pointer;
+  }
+  /* the deselect X reuses the #searchClear slot look, at the overlay's left */
+  #overlayClear {
+    flex: 0 0 auto; width: 2.7rem; align-self: stretch;
+    display: flex; align-items: center; justify-content: center;
+    border: 0; background: transparent; color: var(--md-on-surface-variant, #555);
+    cursor: pointer;
+  }
+  #overlayClear:active { color: var(--md-primary, #0b4da2); }
+  #overlayClear svg {
+    width: 1.5rem; height: 1.5rem; fill: none; stroke: currentColor; stroke-width: 2.4;
+    stroke-linecap: round; stroke-linejoin: round;
+  }
+  #overlayName {
+    flex: 1 1 auto; text-align: center;
+    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
+  }
+  .overlay-drop {
+    flex: 0 0 auto; width: 1.5rem; height: 1.5rem;
+    fill: none; stroke: var(--md-on-surface-variant, #555); stroke-width: 2.4;
+    stroke-linecap: round; stroke-linejoin: round;
+  }
   /* the clear "x" is shown only while the filter holds text: JS toggles the
      [hidden] attribute, and #searchClear[hidden] above beats this id rule.
      At right: 0 it fills the rightmost slot whenever the focus-gated V is off
@@ -556,13 +607,15 @@
   /* stack the two controls on the right edge: the V owns right: 0, so the X
      yields that slot only while the focus-gated V is actually on screen and
      sits immediately to the V's left; when the V hides again the X slides back
-     to right: 0 instead of leaving a hole where the V would be. */
-  #searchWrap:focus-within:has(#searchClear:not([hidden])) #searchClear { right: 2.7rem; }
+     to right: 0 instead of leaving a hole where the V would be. Classes page
+     only (issue 056): the V is dead on teachers, so the stepping rule (and
+     its double gutter) would leave a phantom 2.7rem hole there. */
+  body[data-page="classes"] #searchWrap:focus-within:has(#searchClear:not([hidden])) #searchClear { right: 2.7rem; }
   /* reserve one control slot by default; only both controls at once (a focused
      field that also holds text) need the double gutter, so typed text, the ghost
      completion and its --ghost-pre inset never run underneath a control. */
   #search { padding-right: 2.7rem; }
-  #searchWrap:focus-within:has(#searchClear:not([hidden])) #search { padding-right: 5.4rem; }
+  body[data-page="classes"] #searchWrap:focus-within:has(#searchClear:not([hidden])) #search { padding-right: 5.4rem; }
   /* exactly one clear affordance on mobile: suppress the engine native cancel */
   #search::-webkit-search-cancel-button, #search::-webkit-search-decoration {
     -webkit-appearance: none; appearance: none; display: none;
--- clean/test/teacher-daygroups.test.js	2026-10-18 22:08:12.575582226 +0100
+++ 056-mobile-nav/test/teacher-daygroups.test.js	2026-10-20 00:07:14.160276207 +0100
@@ -38,6 +38,7 @@
 
 var APP_SRC = fs.readFileSync(path.join(ROOT, 'js/teachers.js'), 'utf8');
 var CLASSES_SRC = fs.readFileSync(path.join(ROOT, 'js/classes.js'), 'utf8');
+var INDEX_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
 var CSS_SRC = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
 
 // ---- source slices -------------------------------------------------------
@@ -423,18 +424,49 @@
 test('menu visibility is selection-driven, never blur-driven', function () {
   var teachers = APP_SRC.slice(APP_SRC.indexOf('function initTeachersPage'));
   var classes = CLASSES_SRC.slice(CLASSES_SRC.indexOf('function initClassesPage'));
+  function handlerSlice(sec, sig) {
+    var at = sec.indexOf(sig);
+    assert.ok(at !== -1, sig + ' handler found');
+    return sec.slice(at, sec.indexOf('});', at) + 3);
+  }
+  // blur stays pure on both pages: it drops the suggest overlay and nothing
+  // else (3909bd9 — a press in flight must never lose its row)
   [teachers, classes].forEach(function (sec, i) {
     var tag = i ? 'classes' : 'teachers';
-    var at = sec.indexOf("addEventListener('blur'");
-    var blur = sec.slice(at, sec.indexOf('});', at) + 3);
+    var blur = handlerSlice(sec, "addEventListener('blur'");
     assert.ok(blur.indexOf('renderSuggest([])') !== -1, tag + ': blur drops the overlay');
-    assert.ok(blur.indexOf('searchFocused') === -1, tag + ': blur must not touch menu state');
     assert.ok(blur.indexOf('syncList()') === -1, tag + ': blur must not toggle panes');
     assert.ok(blur.indexOf('setTimeout') === -1, tag + ': no deferred blur');
-    assert.ok(sec.indexOf('searchFocused = true') !== -1, tag + ': focus arms the menu');
     assert.ok(sec.indexOf("layout.classList.remove('is-list')") !== -1,
       tag + ': selection dismisses the menu');
   });
+  // teachers: blur writes neither nav fact nor any menu-edge function
+  var teachersBlur = handlerSlice(teachers, "addEventListener('blur'");
+  ['menuOpen', 'openMenu', 'closeMenu'].forEach(function (tok) {
+    assert.ok(teachersBlur.indexOf(tok) === -1, 'teachers: blur must not touch ' + tok);
+  });
+  // classes keeps its old fact name (out of scope for issue 056)
+  var classesBlur = handlerSlice(classes, "addEventListener('blur'");
+  assert.ok(classesBlur.indexOf('searchFocused') === -1, 'classes: blur must not touch menu state');
+  assert.ok(classes.indexOf('searchFocused = true') !== -1, 'classes: focus arms the menu');
+  function fnSlice(sec, sig) {
+    var start = sec.indexOf(sig);
+    assert.ok(start !== -1, sig + ' found');
+    var end = sec.indexOf('}', start);
+    assert.ok(end !== -1, sig + ' bounds');
+    return sec.slice(start, end + 1);
+  }
+  // the menu edges: openMenu arms the fact, closeMenu drops it + focus
+  var openSlice = fnSlice(teachers, 'function openMenu()');
+  assert.ok(openSlice.indexOf('menuOpen = true') !== -1, 'openMenu arms the fact');
+  var closeSlice = fnSlice(teachers, 'function closeMenu()');
+  assert.ok(closeSlice.indexOf('menuOpen = false') !== -1, 'closeMenu drops the fact');
+  assert.ok(closeSlice.indexOf('search.blur()') !== -1, 'closeMenu removes focus');
+  // focus and filter-box taps bring the menu back through openMenu
+  assert.ok(handlerSlice(teachers, "addEventListener('focus'").indexOf('openMenu()') !== -1,
+    'teachers: focus opens the menu');
+  assert.ok(handlerSlice(teachers, "search.addEventListener('click'").indexOf('openMenu()') !== -1,
+    'teachers: a filter-box tap opens the menu');
   assert.ok(APP_SRC.indexOf('setTimeout') === -1, 'no setTimeout left in the teachers page');
   assert.ok(CLASSES_SRC.indexOf('setTimeout') === -1, 'no setTimeout left in the classes page');
   var clicks = APP_SRC.split("search.addEventListener('click'").length - 1 +
@@ -478,9 +510,70 @@
   assert.ok(commitFn.indexOf('if (exact) {') !== -1, 'exact hit selects immediately');
   assert.ok(commitFn.indexOf('var exact = exactTeacher(res, q);') < commitFn.indexOf('res.total === 1'),
     'exact wins before the single-hit branch');
-  assert.ok(commitFn.indexOf('if (!selected) syncList();') !== -1,
-    'selection must suppress the trailing menu re-show');
+  assert.ok(commitFn.indexOf('selectTeacher(exact);') !== -1,
+    'exact commit selects through the single funnel');
+  assert.ok(commitFn.indexOf('selectTeacher(only.teacher);') !== -1,
+    'single-hit commit selects through the single funnel');
+  assert.ok(commitFn.indexOf('showTeacher(') === -1,
+    'commit must not bypass the selection funnel');
   var classes = CLASSES_SRC.slice(CLASSES_SRC.indexOf('function initClassesPage'));
   assert.ok(classes.indexOf('var like = exactClass(rows, q);') !== -1, 'classes commit computes exact');
   assert.ok(classes.indexOf('showClass(like);') !== -1, 'exact class label selects');
 });
+
+test('teachers nav chrome: state-gated back arrow, teacher overlay, V gone', function () {
+  ['id="searchBack"', 'id="searchOverlay"', 'id="overlayClear"', 'id="overlayName"'].forEach(function (id) {
+    assert.ok(INDEX_SRC.indexOf(id) !== -1, 'index.html missing ' + id);
+  });
+  assert.ok(INDEX_SRC.indexOf('id="searchDone"') === -1,
+    'the V-chevron is gone from the teachers page');
+  var base = CSS_SRC.slice(0, CSS_SRC.indexOf('@media (max-width: 700px)'));
+  assert.ok(base.indexOf('#searchBack { display: none; }') !== -1,
+    'desktop armour: the back arrow is display:none at base');
+  assert.ok(base.indexOf('#searchOverlay { display: none; }') !== -1,
+    'desktop armour: the teacher overlay is display:none at base');
+  var narrow = CSS_SRC.slice(CSS_SRC.indexOf('@media (max-width: 700px)'));
+  assert.ok(narrow.indexOf('#layout.is-list #searchBack') !== -1,
+    'back arrow is gated on the list state, not on focus');
+  assert.ok(narrow.indexOf('#searchOverlay:not([hidden])') !== -1,
+    'overlay renders from its attribute on narrow screens');
+  assert.ok(CSS_SRC.indexOf('#searchWrap:focus-within #searchBack') === -1,
+    'the back control must never be focus-gated (anti-D4 regression pin)');
+});
+
+test('nav machine: single selection/empty funnels, harness-safe showTeacher', function () {
+  assert.ok(APP_SRC.indexOf('var menuOpen = false;') !== -1, 'menuOpen fact declared');
+  assert.ok(APP_SRC.indexOf('var selectedTeacher = null;') !== -1, 'selectedTeacher fact declared');
+  assert.ok(APP_SRC.indexOf('var lastResultCount') === -1, 'lastResultCount is dead');
+  var fn = showTeacherFn();
+  assert.ok(fn.indexOf('menuOpen') === -1, 'showTeacher must not read menuOpen (vm harness)');
+  assert.ok(fn.indexOf('search.blur') === -1, 'showTeacher must not blur (vm harness)');
+  function fnBody(sig) {
+    var start = APP_SRC.indexOf(sig);
+    assert.ok(start !== -1, sig + ' found');
+    var end = APP_SRC.indexOf('\n    }', start);
+    assert.ok(end !== -1, sig + ' bounds');
+    return APP_SRC.slice(start, end + '\n    }'.length);
+  }
+  var sel = fnBody('function selectTeacher(name)');
+  ['selectedTeacher = name', 'showTeacher(name)', 'search.blur()', 'menuOpen = false'].forEach(function (tok) {
+    assert.ok(sel.indexOf(tok) !== -1, 'selectTeacher: ' + tok);
+  });
+  var emp = fnBody('function showEmpty()');
+  ['selectedTeacher = null', 'emptyStateHTML()', 'markActive(null)'].forEach(function (tok) {
+    assert.ok(emp.indexOf(tok) !== -1, 'showEmpty: ' + tok);
+  });
+  var inputFn = fnBody('function onInput()');
+  assert.ok(inputFn.indexOf('showEmpty();') !== -1, 'onInput: empty filter deselects');
+  assert.ok(inputFn.indexOf('selectTeacher(only.teacher)') !== -1, 'onInput: auto-jump selects via the funnel');
+  var rowStart = APP_SRC.indexOf('function renderItem(r)');
+  var rowWiring = APP_SRC.slice(rowStart, APP_SRC.indexOf('function onlyHit(res)', rowStart));
+  assert.ok(rowWiring.indexOf('selectTeacher(r.teacher)') !== -1, 'row tap selects via the funnel');
+  var ovStart = APP_SRC.indexOf('searchOverlay.addEventListener');
+  assert.ok(ovStart !== -1, 'overlay wiring found');
+  var ovWiring = APP_SRC.slice(ovStart, APP_SRC.indexOf('showEmpty();', ovStart) + 'showEmpty();'.length);
+  assert.ok(ovWiring.indexOf('openMenu()') !== -1, 'overlay tap reopens the list');
+  assert.ok(ovWiring.indexOf('search.focus()') !== -1, 'overlay tap focuses the box');
+  assert.ok(ovWiring.indexOf('stopPropagation') !== -1, 'overlay X does not bubble to the surface');
+  assert.ok(ovWiring.indexOf('showEmpty()') !== -1, 'overlay X deselects');
+});
```

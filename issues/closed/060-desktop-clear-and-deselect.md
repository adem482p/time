# 060: Desktop — the search box's X erases the text AND drops the selection (teacher/class)

- Status: Fixed
- Date: 2026-10-20, Reporter: user

## Description

Scope: the **desktop** view (>700px) of both search pages —
`index.html` + `js/teachers.js` (teachers) and `classes.html` +
`js/classes.js` (classes). Measured at **1280×800** in headless Chromium via
Playwright (MCP) against this worktree served by `python3 -m http.server 8060`
(PID recorded in `/tmp/opencode/http060.pid`, **killed by PID** afterwards).
Every *Measured* claim is a live DOM / computed-style / screenshot result;
code claims are re-read in this worktree with line numbers. Console clean
(favicon 404 excepted — the repo ships none).
Baseline re-verified here before any measurement: `node --test` → **129 tests,
129 pass, 0 fail**.

### Observed — which X the user is seeing (Measured)

The X on the desktop search box is **not** the app's own button. The app's
`#searchClear` (`index.html:45-47`, `classes.html:46-48`) is armed off on
desktop by the base rule `#searchClear { display: none; }`
(`styles.css:127`; only the narrow block ever shows it, `styles.css:574-579`
inside `@media (max-width: 700px)` from `:486`), and the engine-native cancel
button of `<input type="search">` (`index.html:41`, `classes.html:42`) is
suppressed **only in the narrow block** (`styles.css:587-589`,
`#search::-webkit-search-cancel-button … display:none`). On desktop nothing
suppresses it, so Chromium renders its own `×` — measured with element
screenshots of `#searchWrap` (evidence PNGs in `/tmp/opencode/060-*.png`):

| condition (value non-empty) | native × visible? |
|---|---|
| input blurred, mouse parked away | **no** (060-a-unfocused.png) |
| input blurred, mouse over the box | **yes**, drawn at the input's right edge (060-a-hovered.png) |
| input focused | **yes** (060-a-focused.png, 060-c-focused.png) |

So the user meets the X whenever they hover or focus the box — and after
*any* selection the input is actually blurred (`selectTeacher` blurs,
`js/teachers.js:228`; `selectClass` blurs, `js/classes.js:161` — Measured
`activeElement = BODY` in state (a)), which is exactly why the X only shows
on hover/focus in the selected state.

### Observed — measured effect of clicking that X

**Teachers** (rebuild: type `Ben Haj` → Enter = accept pre-focused suggest row
→ `acceptSuggest` → `commit` → `selectTeacher`; state = teacher selected +
text `"Ben Haj"` in the box, `#detail h2 = "Ben Haj"`). Instrumented listeners
on `#search` counted the events; click at the input's right edge
(`box.right − 14px`, mid-height) hit the native cancel button:

- value `"Ben Haj"` → `""`; native **`search` event fired (1)** and the app's
  **`input` event fired (1)** → `onInput` (`js/teachers.js:499-514`);
- `!q.trim()` → `showEmpty()` (`:507`; funnel body `:215-221`) →
  `selectedTeacher = null`, `#detail` re-rendered with the kaomoji
  (`.empty-state` present, `h2` gone), `markActive(null)`, overlay hidden;
- trailing `syncList()` (`:513`) re-arms the list (`is-list` true, 132 rows;
  no visual effect on desktop);
- `document.activeElement` **stays `#search`** (the native cancel click
  focuses the input; the input keeps focus afterwards).

Net: **one click on the X = erase text + drop the selection + back to the
"No Teacher Selected" page** — the user's report confirmed exactly.

**Classes** — identical, measured the same way: state = class selected via
`fill('GLSI3D1')` auto-jump (`onInput` → `selectClass`, `js/classes.js:561`),
value `"GLSI3D1"`, `#detail h2 = "LCS3-GLSI_D Groupe 1"`; native-cancel click
→ value `""`, `input` event → `onInput` (`:551-563`) → `showEmpty()`
(`:559`; funnel `:148-154`) → **"No Class Selected" kaomoji**, `is-list` true,
94 rows. In state (c) (not selected, text `"GLSI3"`) the same click merely
erases (stays on the empty page) — i.e. today the X already behaves as the
spec's "stage X" whenever nothing is selected, and as erase+**deselect**
whenever something is.

**Escape does not clear** (Measured on teachers, desktop): the keydown
handler `preventDefault()`s the native Esc-clear and only drops the suggest /
closes the menu (`js/teachers.js:544-552`; classes `:604-612`) — value
unchanged after 1 and 2 Escapes. The only desktop ways to empty the box are
the native X and keyboard deletion — and **keyboard deletion deselects too**
(Measured: backspacing `Ben Haj` to "" → `onInput` → `showEmpty()` → kaomoji,
2 → 132 rows): the same root-cause edge, reached by another door.

### Observed — the four selection×text states on desktop (both pages, Measured)

Legend: *native X* = engine cancel button (visible on hover/focus when text
present); *app X* = `#searchClear` (always `display:none` on desktop,
`styles.css:127`, regardless of its `[hidden]` attribute — Measured
`scDisplay:'none'` in every state, both pages).

| # | state | how reached (measured) | the box today | X today | spec implies |
|---|---|---|---|---|---|
| (a) | selected + text | type `Ben Haj` + Enter (teachers); `fill('GLSI3D1')` auto-jump or Enter-commit (classes — `acceptSuggest` writes the label, `js/classes.js:533`) | text `"Ben Haj"` / `"GLSI3D1"`, input **blurred** (`selectTeacher`/`selectClass` blur), no glow; `#searchOverlay` is `[hidden]=false` but `display:none` (base armour `styles.css:130`) | **native X only** (hover/focus); clicking it = erase **+ deselect** (the bug) | "if there is text, then the x button clears it" → clear text only, landing in (b) |
| (b) | selected + empty | tap a list row (both pages keep the filter untouched on row-tap — Measured value `""`, `h2` = "Abbassi" / "LBC2-BI_A Groupe 1") | the plain filter box with its **placeholder** (060-b*.png) — looks identical to state (d) | **no X at all**: no text → no native cancel; app X hidden-attribute true (`syncClear`, `js/teachers.js:188-190`, `js/classes.js:121-123`) | "the input box transforms into a button with 'x' in the center (just overlay the input box)"; pressing it deselects → (d) |
| (c) | not selected + text | type without committing (`GLSI` → 42 rows; `GLSI3` → 8 rows) | text, focused (focus opens the menu: `openMenu()`, `js/teachers.js:582-590`) | **native X only**; click = erase, stays empty (already the spec's "stage X" behavior) | "if there is text, then the x button clears it" → clear text → (d) |
| (d) | not selected + empty | boot | placeholder, no X (060-d-empty.png) | none | "regular filter box" — nothing |

Cross-checks while enumerating: focusing the box in state (a) hides the
(unrendered) overlay — `openMenu()` → `syncOverlay()` (`js/teachers.js:194-197`)
— so a focused (a) is just text + native X; and the desktop focus glow
(`#searchWrap:focus-within`, `styles.css:92-95`) is present whenever the box
is focused, absent in the blurred (a)/(b) states.

### Observed — the mobile machine has the same "X deselects" semantic (scope question)

Narrow (390×844) there the **app** X is the only X (native cancel suppressed,
`styles.css:587-589`; `#searchClear` shown while text exists,
`:574-579`). Measured on **both pages**, state = list-open-from-selection
(teacher overlay tapped → `openMenu(); search.focus();`, `js/teachers.js:605-608`):

- teachers: select `Ben Haj` (state=teacher, overlay shows the name) → tap the
  overlay → state=list, selection retained → tap `#searchClear` (text present)
  → value `""`, **selection dropped** (`h2` gone, `.empty-state` rendered into
  the hidden detail), menu stays open; the back arrow then lands on the kaomoji
  empty page (not on the teacher).
- classes: same walk with `GLSI3D1` → after the X, back arrow → **"No Class
  Selected"** page.

So today "X with text ⇒ erase **and** deselect" exists on mobile list state
too (it is the same code: X handler → `commit()` → empty branch →
`showEmpty()`, `js/teachers.js:618-625` + `:521-526`, `js/classes.js:678-685` +
`:584-588`). Whether the user's "X with text = erase only" rule should also
apply there is **a scope question for the Maintainer** (see below).

### Observed — X-related machinery inventory (per page, Verified in code)

| piece | teachers | classes | desktop today |
|---|---|---|---|
| `#searchClear` markup | `index.html:45-47` | `classes.html:46-48` | present in DOM, `display:none` (`styles.css:127`) |
| `[hidden]` toggling `syncClear` | `js/teachers.js:188-190` | `js/classes.js:121-123` | runs, but invisible |
| X click handler | `js/teachers.js:618-625` (`search.value=''; syncClear(); commit();` + mousedown preventDefault) | `js/classes.js:678-685` (identical) | dead on desktop (element not rendered) |
| commit's empty branch | `js/teachers.js:521-526` → `showEmpty()` `:523` | `js/classes.js:584-588` → `showEmpty()` `:585` | the deselect edge the native X lands on |
| onInput's empty branch | `js/teachers.js:506-507` ("an empty filter means nothing is selected") | `js/classes.js:558-559` | same, keyboard path |
| deselect funnel | `showEmpty()` `js/teachers.js:215-221` | `js/classes.js:148-154` | — |
| native-cancel suppression | `styles.css:587-589` — **narrow block only** | same rule (shared CSS) | **absent on desktop** → the engine X is the visible one |
| X slot gutter `#search { padding-right: 2.7rem; }` | `styles.css:585` — narrow only | same | desktop input has only `.6rem` padding (`styles.css:113`) |
| focus glow | `styles.css:92-95` (`#searchWrap:focus-within`) | same | active when box focused |
| desktop armour | `#searchClear` `:127`, `#searchBack`/`#searchOverlay` `:129-130`, `#searchClear[hidden]` `:133` | same (shared CSS) | chrome never renders >700px |

### Observed — overlay infra the new "box becomes an X button" could reuse

- `#searchOverlay` family (markup `index.html:48-54` / `classes.html:49-55`:
  `#overlayClear` + `#overlayName` + `.overlay-drop`; JS vars
  `js/teachers.js:61-64`, `js/classes.js:70-74`) — base armoured
  (`styles.css:130`), narrow-shown (`:542-571`), plus 057's input-hide
  `#searchWrap:has(#searchOverlay:not([hidden])) #search { visibility:hidden }`
  (`:550`) which is **pinned narrow-only**
  (`test/teacher-daygroups.test.js:560-564` — "a base-level copy would blank
  the desktop input").
- **Notable hook (Measured):** in desktop state (b) (and (a) while blurred)
  `#searchOverlay` is already `[hidden] === false` — the `syncOverlay`
  derivation keys only on `selectedTeacher/selectedClass` and `menuOpen`
  (`js/teachers.js:194-197`, `js/classes.js:127-130`) — but the base armour
  keeps it at `display:none`, so its click handlers
  (`js/teachers.js:605-612`, `js/classes.js:665-672`) are inert there. A
  desktop mode could ride on this element, but the user explicitly does NOT
  want name+chevron on desktop ("we only show an x button because the list
  is already available") — that markup shows the name centred + a chevron.
- What is **new** either way: (i) a *desktop-visible* X affordance in state
  (b) (today nothing exists — the box is a bare placeholder); (ii) a
  visibility derivation keyed on **selected ≠ null AND value === ''**
  (today `syncOverlay` keys on facts only and `syncClear` keys on value only —
  nobody composes the two); (iii) "erase-only" semantics for the
  text-present X while a selection exists (today the erase path always ends in
  `showEmpty()`); (iv) possibly a desktop suppression of the native cancel
  (`styles.css:587` unscoped or a base copy) so the app owns the only X —
  which then requires an app X in states (c)/(d) as well.

### Tests that pin the current behavior (baseline re-verified: 129/129/0)

**`test/teacher-daygroups.test.js`**

1. `:425-487` — 'menu visibility is selection-driven, never blur-driven'
   (both files): blur purity (`renderSuggest([])`, no `menuOpen`/`openMenu`/
   `closeMenu`/`syncList()`/`setTimeout`), `openMenu`/`closeMenu` bodies,
   focus+click → `openMenu()`, no `setTimeout` in either file, **exactly 2**
   `search.addEventListener('click'` occurrences (`:484-486`).
   *Spec impact:* an erase-only X or a deselect-X button adds its own click
   listener on a *button*, not on `#search` → survives; if the deselect-X were
   wired through the input's click listener it would break the count.
2. `:489-534` — 'exact name selects even among partial matches': `commit`
   order pins (`var exact = exactTeacher(res, q);` before `res.total === 1`,
   `:521-524`), single-funnel pins (`selectTeacher(exact);`,
   `selectTeacher(only.teacher);`, no direct `showTeacher(` in commit,
   `:525-530`), classes `selectClass(like);` (`:533`). *Unaffected* unless
   `commit` itself is restructured.
3. `:536-567` — 'teachers nav chrome': markup ids (`searchBack`/
   `searchOverlay`/`overlayClear`/`overlayName`, no `searchDone`), **desktop
   armour pins** `#searchBack { display: none; }` / `#searchOverlay {
   display: none; }` in the pre-`@media` slice (`:542-546`), narrow-only
   assertions (`:547-564`, incl. "the input-hide rule must stay narrow-only"),
   and the anti-focus-gate pin (`:565-566`). *Spec impact:* a **new**
   desktop-visible element/CSS leaves these untouched; reusing
   `#searchOverlay` at base level would collide with the armour's intent
   (though only `#searchBack`/`#searchOverlay` literals are pinned, not
   `#searchClear`).
4. `:569-604` — 'nav machine: single selection/empty funnels': `menuOpen`/
   `selectedTeacher` facts, `selectTeacher`/`showEmpty` token pins
   (`:583-590`), **`onInput` must contain `showEmpty();`** (`:592`, "onInput:
   empty filter deselects"), overlay wiring (`:597-603`). *Spec impact:*
   **this is the critical pin** — the user's "X clears text only while
   selected" implies erase-with-selection must NOT reach `showEmpty`; if the
   implementation changes `onInput`'s empty branch (e.g. keep the selection
   when erasing by X), `:592` dies; if the X handler stops calling
   `commit()` instead, the pin survives untouched.
5. `:704-722` — clock ownership: `currentTeacher = null;` count 2 (`:717`)
   and `showEmpty` owns one of them (`:719-722`). A new deselect path must
   keep funnelling through `showEmpty` (or the count/pin breaks).
6. `:396-410` — pane swap literals + **no `@media (pointer: coarse)`**
   (`:408`). Any new desktop CSS must not add pointer gating.

**`test/classes.test.js`**

7. `:444-450` — markup: `classes.html` keeps `id="searchClear"` (+ back/
   overlay ids), no `id="searchDone"`.
8. `:463-480` — CSS: the V-stepping rules stay dead (`:476-478`) and
   `#search { padding-right: 2.7rem; }` survives (`:479` — "the X slot
   survives"; substring match, additive base rules don't disturb it).
9. `:990` — `countTok(js/classes.js, 'currentWeek = null;') === 3` — every
   deselect path stays inside `showEmpty` (which owns one) + the two nomatch
   branches. Same constraint as pin 5.
10. `:1055-1087` — classes nav chrome (mirror of pin 3, incl. armour and
    narrow-only pins).
11. `:1089-1165` — classes nav machine (mirror of pin 4: `showEmpty` tokens
    `:1118-1121`, **`onInput` `showEmpty();`** `:1123`, overlay wiring
    `:1152-1158`) plus one extra: **the `#searchClear` click handler must not
    contain `search.focus()`** (`:1159-1160`, "the X no longer re-focuses the
    box") — any rework of the X handler must keep it focus-free. Boot paints
    through `showEmpty()` (`:1163-1164`).

**Not pinned anywhere** (grep-verified over `test/`): the X handler's
`search.value = ''; syncClear(); commit();` triple (only the classes
no-`search.focus()` half is pinned; the teachers X handler body is entirely
unpinned), `syncClear`'s body, the native-cancel suppression rule
(`::-webkit-search-cancel-button` appears in **no** test), the base armour
`#searchClear { display: none; }` (`styles.css:127` — grep `display: none`
over `test/` hits only the `#searchBack`/`#searchOverlay` armour pins and
unrelated rules), the desktop `:focus-within` glow (`styles.css:92-95`), and
`index.html`/`classes.html` node *order* inside `#searchWrap`.

### Expected (binding, transcribed verbatim from the user's report)

> currently on the desktop view, pressing x on the input box doesn't just erase the text, it also goes back to the "no teachers selected page", so it unselects a teacher ! the solution is the following: if there is text, then the x button clears it. if there is no text and a teacher is selected, then the input box transforms into a button with "x" in the center (just overlay the input box), pressing the x unselects the teacher and brings back the regular filter box. the reason we only show an "x" button is because the list is already available to select a new teacher from. unlike the mobile screen where the list isn't visible, in which case the search box overlay plays the double role of clearing selection with x and allowing selecting a new item pressing on the teacher name on the overlay.

## Root cause

On desktop the box has **no app-owned clear control at all**: `#searchClear`
is base-armoured off (`styles.css:127`) and the only X Chromium renders is the
engine's native cancel button (un-suppressed above 700px —
`styles.css:587-589` is narrow-only). That native X does exactly one thing:
clear the input and fire `input` (plus `search`) — and the page's
**"an empty filter means nothing is selected"** invariant
(`js/teachers.js:506-507`, `js/classes.js:558-559`; issue-056 ruling 5) makes
every empty-filter path run `showEmpty()`:

```
native cancel click → value='' + input event
  → onInput (js/teachers.js:499-514 / js/classes.js:551-563)
  → !q.trim() → showEmpty() (call js/teachers.js:507 / js/classes.js:559;
                            funnel js/teachers.js:215-221 / js/classes.js:148-154)
  → selectedTeacher/selectedClass = null + kaomoji + markActive(null)
```

So "erase the text" and "drop the selection" are the *same edge* by
construction — the filter emptiness is today the **only** carrier of the
"nothing selected" fact (the nav machine has explicit `selectedTeacher`/
`selectedClass` facts since issues 056/058, but the empty-filter rule still
collapses them). The same edge is reached by backspacing to empty (Measured).
The user's spec asks for the two to become **orthogonal on desktop**: text
lives in the filter axis (X = erase), selection lives on its own axis and gets
its own control (deselect-X, shown when the box is empty and something is
selected) — which is precisely the separation the mobile overlay already made
on narrow screens (`#overlayClear` deselects without touching the filter,
`js/teachers.js:609-612`), while the desktop kept the old coupled behavior
through the un-suppressed native cancel + `onInput`'s empty branch.

Where the change must reckon (for the Maintainer, not a proposal): the erase
path (`#searchClear` click and/or the native cancel), `onInput`/`commit`'s
empty branches and their pins (`test/teacher-daygroups.test.js:592`,
`test/classes.test.js:1123`), `syncClear`/`syncOverlay` (nobody currently
derives a control from *selected ∧ empty-value*), and a desktop-visible X
affordance in state (b) that does not exist in markup, CSS or JS today.

## Repro steps

Commands (from the worktree root
`/home/user/.local/share/opencode/worktree/1de5bb/060-desktop-deselect`):

```
node --test                                  # baseline: 129 tests, 129 pass, 0 fail
python3 -m http.server 8060                  # PID recorded, killed by PID afterwards
curl -s -o /dev/null -w '%{http_code}' http://localhost:8060/index.html    # 200
curl -s -o /dev/null -w '%{http_code}' http://localhost:8060/classes.html  # 200
```

Browser: Playwright (MCP), Chromium, **viewport 1280×800** (above the
`styles.css:486` `max-width: 700px` switch), URL
`http://localhost:8060/index.html` (repeat on `/classes.html`).

1. **The bug (teachers)** — load; click the filter box; type `Ben Haj`; press
   Enter (accepts the pre-focused suggest row → teacher selected, value
   `"Ben Haj"`). Hover the box so the native `×` appears at its right end and
   click that `×`. Observed: the text clears, **the timeline is replaced by
   the "No Teacher Selected" kaomoji**, the list re-fills to 132 rows — one
   click erased text *and* deselected. (Classes mirror: `fill('GLSI3D1')` →
   week view + value `"GLSI3D1"`; native `×` → "No Class Selected" kaomoji.)
2. **Which X** — with a teacher selected and the mouse parked away from the
   box, no X is visible at all (input is blurred after a selection); hover the
   box (no click) or click into it: the native `×` appears. The app's
   `#searchClear` never renders on desktop (`display:none`, `styles.css:127`).
3. **Escape is not a workaround** — with text, press Escape (once, twice):
   value unchanged (the native Esc-clear is `preventDefault`ed,
   `js/teachers.js:544-552`); it only closes the suggest / the menu.
4. **Keyboard erase deselects too** — from the selected state, backspace all
   the text: the kaomoji returns (same `onInput` edge).
5. **State (b) has no control** — reload; tap the first list row (e.g.
   "Abbassi"): teacher selected, filter empty; the box shows the placeholder
   and **no X exists anywhere** (native cancel needs text; app X hidden) —
   nothing on the box can deselect.
6. **Mobile cross-check** (390×844, scope question) — tap the box, type
   `Ben Haj`, Enter (overlay shows the name); tap the overlay (list opens,
   teacher still selected); tap the app `#searchClear`. Observed: text
   cleared **and the teacher deselected** (back arrow → the kaomoji page) —
   the same "X deselects" semantic exists on mobile list state. Classes:
   identical (`GLSI3D1` walk → back → "No Class Selected").
7. Re-run `node --test`: 129 tests, 0 fail; kill the server by its PID.

### Open scope questions for the Maintainer

1. **Teachers-only or both pages?** The user's wording is teacher-specific
   ("no teachers selected page", "select a new teacher"), but the bug is
   byte-for-byte the same on `classes.html` (Measured above; the X handler /
   `onInput` / `commit` / `showEmpty` code is a mirror). Precedent (056 → 058)
   was one issue per page; the user may intend "both search pages".
2. **Does "X with text = erase only" also apply on mobile list state?**
   Measured: on narrow screens the app `#searchClear` today also deselects
   when tapped with text in list state (both pages), even though the mobile
   deselect control is nominally `#overlayClear`. The user's stated *reason*
   for the desktop-only X ("the list is already available… unlike the mobile
   screen where the list isn't visible") suggests mobile may keep today's
   semantic — but that leaves one element with two viewport-dependent
   meanings. Maintainer to rule.
3. **New element or a desktop mode of `#searchOverlay`?** `#searchOverlay`
   is already `[hidden] === false` in desktop state (b) (armoured off), but
   its markup is name+chevron (explicitly not wanted on desktop) and the
   057 input-hide rule that would blank `#search` is pinned narrow-only
   (`test/teacher-daygroups.test.js:560-564`). A fresh element avoids the
   chrome pins; a mode of the overlay must reconcile them. Design is the
   Maintainer's call.
4. **State (a) → (b) transition and the empty-filter invariant.** Per the
   spec, pressing the X in state (a) (selected + text) must erase the text
   *without* deselecting, landing in state (b) where the box becomes the
   deselect-X. That collides with the binding issue-056 ruling 5 ("an empty
   filter means nothing is selected") and its pins
   (`test/teacher-daygroups.test.js:592`, `test/classes.test.js:1123`).
   Related: what should *backspace*-to-empty do — keep the selection (X and
   keyboard agree, pins die) or deselect (X and keyboard disagree)? And in
   state (b) does the deselect-X show *always* or only while the box is
   hovered/focused (the native X today is hover/focus-gated — Measured)?
5. **Who owns the X on desktop?** Today it is Chromium's (native cancel,
   un-suppressed above 700px, hover/focus-gated, fires `input`+`search`).
   Should the fix suppress it on desktop too (`styles.css:587-589` made
   base-level — no test pins that rule) so the app owns the only clear
   control (which then requires an app X in states (c)/(d) as well, since
   "if there is text, then the x button clears it" must hold there), or keep
   the native X as the "stage X" for states (c)/(d) and only intercept its
   deselect side effect when a selection exists?

*(Reporter note: read-only run — no code, CSS or test changes were made; the
evidence screenshots live in `/tmp/opencode/060-*.png` and are not committed.)*

## Discussion

### Maintainer decision (2026-10-20)

**Verdict — valid, in scope, ready for implementation exactly as specified
below.** The Reporter's measurements and root cause stand as written. The
user's spec is adopted verbatim as the behavioural contract, and it is read as
a statement about the box's **two orthogonal axes**, which settles every open
question:

- **filter axis (the text)** — the app's X clears it, in every state, on
  every viewport; the engine's native cancel button is suppressed app-wide
  (it is the bug's delivery mechanism, and any app X would double up with it);
- **selection axis** — gets its own *dedicated* control per viewport: the new
  `#searchDeselect` on desktop, the existing `#overlayClear` on narrow. This
  is issue-056 ruling 4's orthogonality ("every control does exactly one
  thing"; *"a single button meaning 'erase filter' in one state and 'deselect'
  in another is an aria/maintenance trap"*) carried to its conclusion: today
  `#searchClear` still has exactly that two-meaning trap in the narrow
  list-with-selection state (measured above), and this issue removes the last
  coupling instead of adding a viewport-conditional special case;
- **keyboard/live-search axis** — issue-056 ruling 5's "an empty filter means
  nothing is selected" stays pinned and untouched for `onInput` (backspace)
  and `commit` (Enter).

**Scope rulings (Reporter's five open questions, plus the two sub-questions
they raised):**

1. **Teachers-only or both pages → BOTH, fully mirrored.** The bug is
   byte-identical on `classes.html` (Measured above), and a teachers-only
   change is not even cleanly expressible: the fix lives mostly in
   `styles.css`, which is **shared** — lifting `#searchClear` and suppressing
   the native cancel at base would arm both pages' boxes while only
   `js/teachers.js` learned the erase-only handler, i.e. classes would keep
   deselecting, just through a different X. Page-scoping the CSS would mean
   resurrecting `body[data-page=…]`-prefixed chrome rules — the exact shape
   058 deleted as dead. Parity since 058 is a project invariant; a
   teachers-only change would create the asymmetry the next port issue has to
   chase. The 056→058 "one issue per page" precedent was a *machine port with
   its own test suites per page*, not a reason to ship a known-identical bug
   on the mirror page.
2. **State-(a) erase → erase-only, via a new `eraseFilter()` funnel; the
   pinned `onInput` empty branch is NOT touched.** Routing the erase through
   `onInput()` would hit its pinned `showEmpty();`
   (`test/teacher-daygroups.test.js:592`, `test/classes.test.js:1123`) and
   gut issue-056 ruling 5; keeping `commit()` in the X handler lands on
   `commit`'s empty branch (`showEmpty()`), which *is* the bug. The erase
   instead re-renders the list directly (full list from the empty query),
   re-marks the active row, and touches neither selection fact. The X handler
   stops calling `commit()` entirely — that triple (`search.value='';
   syncClear(); commit();`) is unpinned, which is what makes this fix cheap.
3. **X/backspace divergence → accepted, deliberately, and documented in the
   code.** Both behaviours are pinned by binding authority: the user's spec
   pins the X ("if there is text, then the x button clears it"), issue 056's
   ruling pins the keyboard ("Emptying the filter (X or backspacing)…" — the
   keyboard half survives verbatim). Reconciliation is impossible without
   breaking one: backspace fires a real `input` event that is
   *indistinguishable* from any other edit inside `onInput`, while the button
   is programmatic (it fires no `input` at all) — the two paths are structurally
   separate funnels *today* (`onInput` vs the handler's `commit()` call), and
   this issue only moves the button off the deselect edge. The divergence is
   also coherent to a user: keyboard editing runs the live-search derivation
   (narrow → auto-jump → empty ⇒ no selection to derive from), while the X is
   an explicit single-purpose *command* whose landing state (b) immediately
   presents the deselect-X — the deselection is never lost, it becomes more
   discoverable, one click away on the very box the user just pressed.
4. **Deselect-X → a NEW element (`#searchDeselect`), not a desktop mode of
   `#searchOverlay`; always visible while `selected ∧ value === ''` (state-
   gated, never hover-gated); press runs `showEmpty()` and never focuses the
   input.** Reasons: (i) `#searchOverlay`'s markup is name + chevron, which
   the user explicitly rejected for desktop ("the reason we only show an 'x'
   button is because the list is already available"); (ii) its base armour
   `#searchOverlay { display: none; }` is pinned by both chrome tests as
   *intent* ("desktop never shows it"), and a base-level show rule using the
   `#searchWrap:has(#searchOverlay:not([hidden])) #search` selector prefix is
   pinned dead outright (`test/teacher-daygroups.test.js:562-564`: the first
   occurrence of that selector must be after the first `@media`); (iii)
   `syncOverlay` cannot take the value axis — on narrow the teacher-state name
   overlay must stay visible *with* text in the box, so composing
   `selected ∧ value===''` into `syncOverlay` would break mobile; (iv) the
   mobile overlay's click surface is "reopen the list" (`openMenu();
   search.focus();`) — the exact focus hazard this control must not have.
   Visibility is **always-while-selected+empty**: hover-gating would recreate
   the discoverability failure the user just reported (the native X was
   invisible until hover — that is *why* they only met it in odd moments), and
   the project doctrine is state-gating, never focus/hover-gating (anti-D4
   pin). Spec reading: "the input box transforms into a button … just overlay
   the input box" — the *whole box* becomes the button, so a press anywhere on
   it deselects; the box then "transforms back" to the regular filter box.
5. **The native X → suppressed app-wide (rule lifted from the narrow block to
   base), and `#searchClear` lifted to every viewport when text exists.**
   Keeping the native X as the stage-X and "intercepting" its deselect side
   effect is rejected: its effect arrives as an ordinary `input` event,
   indistinguishable from backspace (see ruling 3) — the only narrowings are
   tracking keydown-vs-engine (fragile, special-case state) or listening to
   the engine's `search` event (non-portable, Chromium-flavoured). One owner,
   one element, all viewports. Desktop state-gating is on *text*, matching
   mobile: while text exists the app X shows at the right slot, always (not
   hover-gated); geometry is the proven mobile slot (2.7rem right gutter on
   `#search`, so text never runs under the X — plus the same gutter on
   `#ghost` so the shadow completion clears it too; today's native X is only
   ~14px, the app X is 43px, so lifting without the gutter would *widen* an
   existing overlap).
6. **Mobile list-state X → erase-only on narrow too (same handler code, zero
   viewport branching).** The Reporter's measured "X deselects on narrow" is
   the *same* bug one viewport over. Making it viewport-dependent
   (`isCoarsePointer()` inside the handler) would give one button two
   viewport meanings — the literal aria/maintenance trap ruling 4 names — and
   would leave the root cause (empty-filter path ⇒ `showEmpty()`) alive. On
   narrow nothing is lost: the user's own framing puts mobile's deselect on
   the overlay ("the search box overlay plays the double role of clearing
   selection with x"), which is exactly `#overlayClear`, and after this change
   that claim becomes *universally* true — overlay-X deselects, box-X erases,
   keyboard-empty deselects. The 056/058 transition tables' X rows (056 row
   "list | tap `#searchClear` … `showEmpty()`", 058's mirror) become stale
   *documentation* — they are other issues' append-only bodies and are not
   rewritten; this entry records the supersession. **Neither 056 nor 058's
   PASS walks assert the deselect side effect**: both walk their X step from
   the *empty* state (056 step 8, 058 step 10 — selection already null, where
   erase-only is observationally identical), and no test asserts it either
   (the only pinned X-handler constraint is classes' no-`search.focus()`).
   The one *measured* narrow behaviour that changes is 060's own repro 6
   (list-state X), whose new expected result is spelled into the walk below.
7. **Keyboard paths stay exactly as pinned:** backspace → `onInput` →
   `showEmpty()` (deselect), Enter-on-empty → `commit` → `showEmpty()`
   (deselect). Not part of the spec; not touched.

**Architectural direction**

*New invariants* (to be pinned by tests below):

- **I1** `#searchClear` ⟺ `value !== ''` (unchanged), on every viewport.
- **I2** `#searchDeselect` ⟺ `selectedFact !== null && value === ''` —
  rendered only by desktop CSS (narrow armours it off).
- **I3** exactly one X on the box at any moment: I1/I2 are disjoint because
  both derive from the value axis in opposite directions; neither is keyed on
  `menuOpen` or focus.
- **I4** the app owns the cancel affordance everywhere: the engine's
  `::-webkit-search-cancel-button` is suppressed at base (single copy).
- **I5** deselect is always a *dedicated* control (`#searchDeselect` desktop,
  `#overlayClear` narrow) or a keyboard derivation (`onInput`/`commit` empty
  branch); the clear X never deselects, and no new path may call `showEmpty`
  outside the existing funnels.

*Transition / affordance table* (S = selection fact, q = box value; teachers
named, classes mirror identically; desktop = >700px, narrow = ≤700px):

| # | state | desktop box BEFORE (measured) | desktop box AFTER | narrow box BEFORE = AFTER |
|---|---|---|---|---|
| (d) | S=null, q='' | placeholder, no X | unchanged | placeholder (+ back arrow in list state); no X (q='') |
| (c) | S=null, q≠'' | text + **native** X (hover/focus only); press erases (already spec-correct) | text + **app X** right slot, visible *while text exists* (not hover-gated); press → `eraseFilter()` → (d) | text + app X (unchanged position); press → erase-only (same visuals; side effect removed) |
| (b) | S≠null, q='' | placeholder, **no control at all** | opaque **full-box `#searchDeselect`**, centered X, 8px radius; press → `showEmpty()` → (d) | teacher state: name overlay + `#overlayClear` (unchanged); `#searchDeselect` exists in DOM (`hidden=false`) but is armoured `display:none` |
| (a) | S≠null, q≠'' | text + **native** X; press = erase **+ deselect** (the bug) | text + app X (always); press → `eraseFilter()` → **(b)**: selection, detail, active row, list all survive; box *becomes* the deselect-X | teacher state: overlay covers the box (X unreachable, unchanged); list state: app X press → erase-only (measured delta, ruling 6) |

Focus variants: the `#searchWrap:focus-within` glow (`styles.css:92-95`) is
untouched and behaves as today; neither new/rewired control ever focuses or
blurs the input (`mousedown → preventDefault`, no `search.focus()`), so no
press can arm `openMenu` or steal it.

*Exact mechanism — markup* (byte-identical block in `index.html` and
`classes.html`, inserted immediately after the `#searchClear` button, before
`#searchOverlay`):

```html
      <button type="button" id="searchDeselect" aria-label="Clear the selection" hidden>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
      </button>
```

(`aria-label` mirrors `#overlayClear` — the two never coexist in the
accessibility tree: each is `display:none` wherever the other renders. The
X-only shape is the user's "we only show an x button" ruling made structural.)

*Exact mechanism — CSS* (`styles.css`, all before the first
`@media (max-width: 700px)` unless noted):

1. **Lift the native suppression to base** (moved verbatim from the narrow
   block, `styles.css:587-589`, and the narrow copy deleted — single source):
   `#search::-webkit-search-cancel-button, #search::-webkit-search-decoration
   { -webkit-appearance: none; appearance: none; display: none; }`.
2. **Replace the base armour `#searchClear { display: none; }`
   (`styles.css:127`)** with the lifted narrow geometry, base-level and
   viewport-independent: `display:flex; position:absolute; right:0; top:0;
   bottom:0; width:2.7rem; border:0; background:transparent;
   color:var(--md-on-surface-variant, #555); cursor:pointer; z-index:2;` plus
   `#searchClear:active { color: var(--md-primary, #0b4da2); }` and the
   `#searchClear svg` metrics block (1.5rem, stroke 2.4, round caps) — the
   whole narrow `#searchClear` cluster (`styles.css:572-584`) moves here with
   a rewritten comment ("the clear X, every viewport — issue 060"), and its
   narrow duplicate is deleted. `#searchClear[hidden] { display: none; }`
   (`styles.css:133`) **stays verbatim** (once the id rule says `display:flex`
   it outranks the UA `[hidden]` default — without this rule the button would
   never hide).
3. **New deselect-X rules** (base): `#searchDeselect { position:absolute;
   left:0; top:0; right:0; bottom:0; z-index:3; display:flex;
   align-items:center; justify-content:center;
   background:var(--md-surface-container-lowest, #fff); border:0;
   border-radius:8px; color:var(--md-on-surface-variant, #555);
   cursor:pointer; }` + `#searchDeselect:active { color: var(--md-primary,
   #0b4da2); }` + the same `svg` metrics as `#searchClear svg` +
   `#searchDeselect[hidden] { display: none; }`. Opaque + `border-radius: 8px`
   is 057's lesson (the overlay must take the wrap's chrome or it reads as a
   square patch). It covers the box exactly like the narrow `#searchOverlay`
   does (inset-0 within the wrap's 1px border), so the placeholder is
   replaced by the centered X — the box *looks* like the button it now is.
4. **Right gutter, two exact lines**, each placed *after* the block it
   augments (both blocks use `padding` shorthand earlier):
   `#search { padding-right: 2.7rem; }` (after the `#search` rules — this is
   also the literal `test/classes.test.js:479` pins, so it must exist
   verbatim as its own single line; the narrow copy at `styles.css:585` is
   deleted) and `#ghost { padding-right: 2.7rem; }` (after the `#ghost`
   rules — the shadow completion must clear the X as well; this also fixes
   the identical underlap narrow has shipped with).
5. **Narrow block additions/deletions**: add exactly
   `#searchDeselect { display: none; }` (with a comment: narrow's deselect
   chrome is `#overlayClear`; the desktop overlay never renders here) — same
   specificity as the base `display:flex`, file-order wins, so no
   `!important` and no reordering; delete the moved-duplicate `#searchClear`
   cluster, `#search { padding-right: 2.7rem; }`, and the webkit suppression.
   Everything else in the narrow block — back arrow, `#searchOverlay`
   `:not([hidden])`, 057's input-hide `:has` rule, `#layout.is-list` paddings
   — stays byte-for-byte.

*Exact mechanism — JS* (both `js/teachers.js` and `js/classes.js`, mirrored):

1. Element var next to the others (`js/teachers.js:65` /
   `js/classes.js:74`): `var searchDeselect = document.getElementById('searchDeselect');`
2. **`syncDeselect()`** — defined immediately after `syncClear()`
   (`js/teachers.js:190` / `js/classes.js:123`, i.e. *before* `indexByDaySlot`
   on classes), body:
   `if (searchDeselect) searchDeselect.hidden = !(selectedTeacher !== null && search.value === '');`
   (classes: `selectedClass`). Guarded like `syncClear`. No `menuOpen`, no
   focus, no viewport test — facts only (I2).
3. **`syncDeselect();` as the last statement of `syncClear()` AND of
   `syncOverlay()`** — those are the two syncs that already sit on *every*
   write of the two facts (value writes call `syncClear`
   (`acceptSuggest`/`onInput`/`commit`/`showTeacher`/boot/X handler);
   selection and menu writes call `syncOverlay`
   (`selectTeacher`/`selectClass`/`showEmpty`/`openMenu`/`closeMenu`/boot)).
   Two call sites, zero scattered ones; composition lives in one place.
4. **`eraseFilter()`** — defined immediately before `function onInput()`
   (after `acceptSuggest` on teachers, after `classSuggestions` on classes —
   deliberately outside every pinned slice, see Risks). Teachers:

   ```js
   function eraseFilter() {
     search.value = '';
     syncClear();
     renderSuggest([]);
     renderGhost();
     renderList(match.searchSections(index, '', avail).sections);
     markActive(selectedTeacher);
     syncList();
   }
   ```

   Classes: identical except `renderList(leafRows(match.classSearch(index, '')));`
   and **no** `markActive` call — classes `renderList` re-applies the active
   mark from `activeKey` (`js/classes.js:246-259`), teachers `renderItem`
   does not, hence the one-line asymmetry. The body is exactly `commit`'s
   empty branch minus `showEmpty()`, plus re-marking the selection: full list
   from the empty query, suggest/ghost dropped, pane flag re-synced, no
   selection fact written, no `new Date()`, no auto-jump (the query is empty,
   `res.total` would be the whole catalogue anyway).
5. **X handler rewritten** (the block at `js/teachers.js:618-625` /
   `js/classes.js:678-685`): keep the `mousedown → preventDefault` line;
   the click body becomes `eraseFilter();` — no `commit()`, no `showEmpty()`,
   no `search.focus()`, no viewport branch. Rewrite the stale comment above it
   (it currently claims "the mobile X … empty query → full list + emoticon
   detail" — the emoticon claim dies with the coupling).
6. **Deselect handler added directly after it**:
   `searchDeselect.addEventListener('mousedown', …preventDefault…);`
   `searchDeselect.addEventListener('click', function () { showEmpty(); });`
   — the deselect funnels through the one empty funnel (pins :717-722 /
   classes `:990` keep holding), never focuses the input (no `openMenu`, no
   glow), never touches the value (it is already '' by I2).
7. **Comments**: rewrite `syncClear`'s header comment (`js/teachers.js:186-187`
   — "Mobile clear 'x'" → every-viewport) and add a header comment to
   `syncDeselect` and `eraseFilter` stating I1/I2/I5 and the ruling-3
   divergence ("keyboard emptying still deselects — pinned 056; the button
   does not — pinned 060"). `js/classes.js` mirrors.
   `showEmpty`, `selectTeacher`/`selectClass`, `onInput`, `commit`, Escape,
   suggest/ghost, auto-jump, clock: **otherwise untouched**.

*Rejected alternatives (argued)*:

- **Guard `showEmpty()` inside `onInput` instead** — games the substring pin
  while gutting its asserted intent ("onInput: empty filter deselects"),
  overturns a settled 056 ruling for a path the user never mentioned, and
  breaks the live-search derivation story (typing derives selection from the
  filter; an empty filter derives none). Rejected.
- **Reconcile backspace with the X** (kill `:592`/`:1123`) — same cost, zero
  user demand (ruling 3). Rejected.
- **Ride `#searchOverlay` as a desktop X-only mode** — pinned-dead base
  selector (chrome test `:562-564`), name+chevron markup the user rejected,
  `syncOverlay` cannot compose the value axis without breaking narrow, and
  its click surface focuses the input (the exact hazard). Rejected.
- **Keep the native X and suppress only its deselect side effect** —
  structurally impossible to distinguish from backspace at the `input` event;
  `search`-event listening is engine-specific. Rejected (ruling 5).
- **Viewport branch in the X handler** (`isCoarsePointer()` ⇒ old behavior on
  narrow) — one element, two meanings; preserves a measured bug; special-case
  state the project's funnels exist to avoid. Rejected (ruling 6).
- **Hover/focus-gate the desktop X's** (native-style) — recreates the
  reported discoverability failure; contradicts state-gating doctrine.
  Rejected (ruling 4).
- **Glyph-only deselect-X** (small centered button, clicks-through elsewhere
  focus the input) — ambiguous affordance ("is the box a field or a
  button?") and an accidental-deselect hazard: the X sits centered exactly
  where the user would click to place the caret. The spec says the box
  *transforms into* a button; full-cover is the literal, unambiguous reading
  and mirrors the proven narrow overlay. Rejected.

**Acceptance criteria (blind implementation)**

1. **Markup** — insert the byte-identical `#searchDeselect` block (above)
   into `index.html` *and* `classes.html`, between `#searchClear` and
   `#searchOverlay`. No other markup change; **no `<head>` edits**.
2. **CSS** — implement the five CSS steps above (lift suppression, lift
   `#searchClear` cluster to base, new `#searchDeselect` rules, the two exact
   gutter lines, narrow deletions + the exact narrow armour line
   `#searchDeselect { display: none; }`). Pinned literals must remain
   verbatim: `#searchBack { display: none; }`, `#searchOverlay { display:
   none; }`, `#searchClear[hidden] { display: none; }` (base);
   `#search { padding-right: 2.7rem; }` (exactly one occurrence, base);
   the narrow `#searchWrap:has(#searchOverlay:not([hidden])) #search` rule
   stays inside the narrow block; `::-webkit-search-cancel-button` exists
   exactly once, **before** the first `@media`. No `!important`, no
   `@media (pointer: coarse)`, no `:focus-within` selector naming `#search`,
   `#searchBack` or any new control, no focus-gating of any kind.
3. **JS (both pages)** — element var, `syncDeselect()` + its two call sites
   (end of `syncClear`, end of `syncOverlay`), `eraseFilter()` before
   `onInput()`, rewritten `#searchClear` handler (`eraseFilter();`), new
   `#searchDeselect` handler (`showEmpty();`), comment rewrites, exactly as
   specified above. `showEmpty`/`selectTeacher`/`selectClass`/`onInput`/
   `commit` bodies change **only** by `syncClear`/`syncOverlay` gaining their
   one `syncDeselect();` line.
4. **Semantics** — erase-X never deselects anywhere (any viewport, any
   state); deselect-X never erases and never focuses; keyboard emptying
   (backspace/Enter) keeps 056's deselect; no `isCoarsePointer`/`matchMedia`/
   `innerWidth` appears in any of the new code (the X machine is
   viewport-independent in JS — CSS alone picks the rendering).
5. **Tests** — exactly **two new** `test(...)` blocks, both named with
   `(issue 060)`, appended to the files that already hold the sources; **zero
   existing tests edited or deleted**:
   - `test/teacher-daygroups.test.js` → `'the clear X erases only, the
     deselect X deselects only (issue 060)'` — using `INDEX_SRC`/`CSS_SRC`/
     `APP_SRC`/`CLASSES_SRC`: markup order
     `id="searchClear"` < `id="searchDeselect"` < `id="searchOverlay"` in
     `index.html`; base slice (before first `@media`): contains
     `#search::-webkit-search-cancel-button`, contains
     `#search { padding-right: 2.7rem; }`, contains
     `#searchDeselect[hidden] { display: none; }`, contains a
     `#searchDeselect {` rule carrying `position: absolute`, and
     `indexOf('#searchClear { display: none; }') === -1`; narrow slice:
     contains the exact line `#searchDeselect { display: none; }` and
     `indexOf('#search::-webkit-search-cancel-button') === -1` (the move, not
     a copy); JS on **both** sources: `function syncDeselect()` exists and its
     body carries `searchDeselect.hidden = !(`, a `selectedTeacher !== null` /
     `selectedClass !== null` token and `search.value === ''` but **no**
     `menuOpen`; `syncClear` body and `syncOverlay` body each contain
     `syncDeselect();`; `function eraseFilter()` exists, contains
     `search.value = '';`, `syncClear();`, `renderSuggest([])`,
     `renderGhost();`, `syncList();`, plus `match.searchSections(index, '',
     avail).sections` + `markActive(selectedTeacher)` (teachers) or
     `leafRows(match.classSearch(index, ''))` (classes), and contains none of
     `showEmpty`, `selectTeacher(`, `selectClass(`, `isCoarsePointer`,
     `matchMedia`; the `searchClear.addEventListener('click'` slice contains
     `eraseFilter();` and none of `commit()`, `showEmpty()`, `search.focus()`;
     the `searchDeselect.addEventListener('click'` slice contains
     `showEmpty();` and no `search.focus()`; both `mousedown` slices contain
     `preventDefault`; `onInput` still contains `showEmpty();`.
   - `test/classes.test.js` → `'classes mirrors the clear/deselect X split
     (issue 060)'` — same assertions for `CLASSES_SRC`, `classes.html`
     markup (via `readPage`), and `readPage('styles.css')` base/narrow
     slices (house style duplicates the shared-CSS checks "verified from
     classes").
6. **Expected test total: 131** — `node --test` → 131 tests, 131 pass,
   0 fail (baseline 129 untouched + exactly 2 new). Any other count means an
   existing test was edited or a pin broke: stop and re-plan, do not "fix" a
   baseline test.
7. **Serve + curl** — `python3 -m http.server <free port>` from the worktree
   root, **record the PID** (e.g. `/tmp/opencode/http060-fix.pid`);
   `curl -s -o /dev/null -w '%{http_code}'` → `200` for `/index.html`,
   `/classes.html`, `/styles.css`, `/js/teachers.js`, `/js/classes.js`.
   Kill the server **by PID** (`pkill -f` self-matches — never use it).
8. **Playwright walk (mandatory before merge; Chromium, console clean except
   the favicon 404, screenshots to `/tmp/opencode/060-fix-*.png`, never
   committed)**:
   - **(a) desktop state (a), teachers** — 1280×800, `index.html`; type
     `Ben Haj` + Enter (state: `#detail h2 = "Ben Haj"`, value `"Ben Haj"`,
     blurred). Click the app X at the box's right edge (≈`box.right − 14px`,
     the old native-X coordinate — it must now be the app's). Assert: value
     `""`; `#detail h2` still `"Ben Haj"` (detail survives, no kaomoji); list
     back to **132** rows; the selected row's `className` on
     `li[data-name="Ben Haj"]` carries the same active mark it had before the
     press; `#searchClear` `[hidden]=true`; `#searchDeselect` `[hidden]=false`
     and `display:flex` (the box *became* the deselect-X);
     `document.activeElement` unchanged (still `BODY` — no focus, no glow:
     `#searchWrap` box-shadow identical to its unfocused value); no native
     cancel (step e).
   - **(b) desktop deselect** — press the deselect-X (its center). Assert:
     `#detail` has `.empty-state` (kaomoji + "No Teacher Selected"), `h2`
     gone, active marks cleared; `#searchDeselect` `[hidden]=true`;
     placeholder visible (regular filter box back); value still `""`;
     `activeElement` unchanged; list still 132 rows.
   - **(c) desktop state (c)** — reload; type a partial query (`GLSI` on
     teachers / `GLSI3` on classes) without committing. App X visible; press
     it. Assert: value `""`, full list, `.empty-state` detail **unchanged**
     (never left the empty page), `#searchDeselect` stays `[hidden]=true`
     (nothing selected ⇒ no deselect affordance).
   - **(d) keyboard divergence** — from (a), click *into* the input (focus,
     glow present), select-all + Backspace to `""`. Assert: `onInput` path —
     `.empty-state` renders (**backspace still deselects**), `#searchDeselect`
     stays hidden, `#searchClear` hidden; repeat on classes.
   - **(e) native X is gone, everywhere** — with text present, focused and
     hovered: `getComputedStyle(input, '::-webkit-search-cancel-button').display
     === 'none'` (same for `::-webkit-search-decoration`) at 1280×800 **and**
     390×844, both pages; element screenshot of `#searchWrap` shows exactly
     one X (the app's, right-aligned, ≈2.7rem slot).
   - **(f) narrow walk re-run** — 390×844: 056 steps 1–8 (teachers) and 058's
     walk (classes) must re- PASS unchanged (their X steps run from the empty
     state, where erase-only is observationally identical; `#overlayClear`
     still deselects with text preserved; `#searchDeselect` computes
     `display:none` in *every* narrow state, including selected+empty).
     Then the one intended delta (060 repro 6, new expected result): select
     `Ben Haj` → tap the overlay (list state, selection retained, text
     present) → tap `#searchClear` → value `""` and **selection RETAINED** →
     back arrow lands on the teacher (`#overlayName`/`h2` = "Ben Haj"), not
     on the kaomoji page. Classes: `GLSI3D1` mirror.
   - **(g) desktop visuals** — screenshots of states (a)/(b)/(c)/(d):
     `getComputedStyle('#search').paddingRight === '43.2px'` (2.7rem @16px);
     with a long query the visible text stops before `#searchClear`'s left
     edge (no text under the X — input *and* ghost); focus glow pixel-equal
     to the baseline glow; deselect-X: bounding rect equal to the wrap's
     content box, `border-radius: 8px`, opaque background, X glyph centered
     within ±1px, `cursor: pointer`.
   - **(h) classes mirror** — repeat (a)–(g) on `/classes.html` with
     `GLSI3D1` (state (a) via `fill('GLSI3D1')` auto-jump; detail
     `h2 = "LCS3-GLSI_D Groupe 1"` must survive the erase;
     `li[data-key="GLSI3D1"]` keeps its active mark — classes re-applies from
     `activeKey`).
9. **Diff hygiene** — the diff contains only: `index.html`, `classes.html`,
   `styles.css`, `js/teachers.js`, `js/classes.js`,
   `test/teacher-daygroups.test.js`, `test/classes.test.js`. No README, no
   `data/`, no other `js/*`, no issue-file edits beyond appending the
   `Fix implemented` entry to this issue's Discussion (append-only; Status
   flips only at merge).
10. **No-gos** — do not remove/soften `showEmpty();` in `onInput` or any
    existing assertion; do not route any X through `onInput()`/`commit()`;
    do not add a second `search.addEventListener('click'` (pinned count = 2);
    do not add `search.focus()` to any X handler; do not key anything new on
    focus/hover or `(pointer: coarse)`; do not add `setTimeout` or
    `new Date()` (pinned counts: teachers `new Date()` = 3);
    `currentTeacher = null;` = 2 and `currentWeek = null;` = 3 stay — the new
    deselect goes through `showEmpty()` only; do not touch the narrow
    057 input-hide rule, the `#searchBack`/`#searchOverlay` armour, the nomatch
    branches, or the clock; do not "fix" the pre-existing stale-fact nomatch
    edge (risk 10); no `!important`.
11. **Sibling boundaries** — issues 059 (`js/theme.js` + HTML `<head>`s) and
    061 (`js/*` + README) run in parallel worktrees. This issue touches no
    `<head>`, no `js/theme.js`, no README. Its only `js/*` writes are
    `js/teachers.js` and `js/classes.js`, confined to four localized regions
    per file (element vars, `syncClear`/`syncOverlay` + new `syncDeselect`,
    new `eraseFilter`, the two handler blocks + comments). If 061's `js/*`
    scope reaches those two files, the coordinator replays both changes
    region-by-region; neither side should renumber or reflow the other's
    regions.

**Risks / constraints (pin arithmetic traps)**

1. `search.addEventListener('click'` must occur exactly **2** times total
   (`test/teacher-daygroups.test.js:484-486`). New listeners must attach as
   `searchClear.addEventListener(...)` / `searchDeselect.addEventListener(...)`
   — safe substrings (the pinned token needs the literal `search.`) — never
   as another `search.addEventListener`.
2. Classes' `handlerSlice("searchClear.addEventListener('click'")`
   (`test/classes.test.js:1159`) cuts at the *first* `});`: the rewritten
   body must stay straight-line (`function () { eraseFilter(); });`) with no
   nested callback, and must contain no `search.focus()`.
3. `countTok(src, 'currentTeacher = null;') === 2` and
   `countTok(src, 'currentWeek = null;') === 3` — the deselect-X must call
   `showEmpty()`, never inline a nulling; same for `new Date()` (= 3 in
   teachers.js) — `eraseFilter` stamps no clock (it renders from the live
   `avail`).
4. `fnBody(sig)` helpers cut at the **first `\n    }`** — do not add nested
   functions or stray `\n    }` lines inside `onInput`, `showEmpty`,
   `selectTeacher`/`selectClass`, `syncList`, `openMenu`/`closeMenu`.
   Placement of `syncDeselect`/`eraseFilter` matters: **classes' week-harness
   slice** runs from `function indexByDaySlot` to `function showClass` and
   must contain none of `menuOpen|search.blur|syncOverlay|selectClass`
   (`test/classes.test.js:1098-1102`) — hence `syncDeselect` goes beside
   `syncClear` (before `indexByDaySlot`) and `eraseFilter` goes before
   `onInput()` (after `showClass`), never inside that window.
5. `commitFn` slices (`function commit()` → `search.addEventListener('input'`)
   in both test files: `eraseFilter` sits *before* `onInput`, so those slices
   keep their exact current extent — this is why the placement is mandated,
   not suggested. If moved after `commit()`, it inherits the slice and must
   then carry no `showTeacher(`/`showClass(` and no earlier
   `res.total === 1` / `var exact` tokens.
6. CSS literal traps: `#search { padding-right: 2.7rem; }` must exist as its
   own single line (folding it into the `#search` block breaks
   `test/classes.test.js:479`); keep the three base armour literals listed in
   criterion 2 verbatim; the narrow `:has` input-hide selector's **first**
   occurrence must remain after the first `@media`
   (`test/teacher-daygroups.test.js:562-564`); never emit
   `#searchWrap:focus-within #search ` (trailing space —
   `:565`) or `#searchWrap:focus-within:has(#searchClear…)` /
   `body[data-page="classes"] #searchWrap:focus-within:has(#searchClear…)`
   (`test/classes.test.js:476-478`).
7. Real `syncClear`/`syncOverlay` bodies execute in **no** vm harness (every
   call site stubs them; they reference unbound element vars) — so
   `syncDeselect`'s correctness is proven by the string pins + the Playwright
   walk, not by unit execution. Keep the `if (searchDeselect)` guard for
   symmetry with `syncClear`, and expect no harness to need a new stub; if a
   suite run says otherwise, guard rather than stub.
8. Transient states never paint: backspace-to-empty momentarily has
   `selected ≠ null ∧ value === ''` inside `onInput` (syncClear runs before
   `showEmpty()`) — same synchronous task, deselect-X unhidden then rehidden
   before any frame. Do not "fix" this by adding `menuOpen`/focus to
   `syncDeselect`'s derivation — that would break ruling 4 (state-gating) and
   the reachability analysis in the table.
9. Disjointness regression risk: if a future path writes `search.value`
   without `syncClear()`, I1/I2 break and both X's can render. The existing
   rule "call `syncClear` wherever the value changes" now also carries the
   deselect-X — preserve it.
10. Pre-existing stale-fact edge (out of scope, do not fix): Enter-commit to
    a nomatch leaves `selectedTeacher`/`selectedClass` set while the detail
    shows "No match". After an erase from that state the deselect-X will show
    (the *fact* is set) above a nomatch detail — pressing it runs `showEmpty`
    and lands on the kaomoji page, which is coherent. Touching the nomatch
    branch would break the pinned `currentTeacher/currentWeek` counts.
11. Narrow documentation drift: 056/058 transition-table X rows now describe
    superseded behaviour (ruling 6). They stay unedited (append-only, other
    issues); this entry is the record. The walks themselves are unaffected —
    re-run them (criterion 8f) and flag any *asserted* narrow step that
    fails, as that would falsify ruling 6.
12. Parallel-worktree hygiene: servers by PID only; screenshots and PID files
    to `/tmp/opencode/`, never committed; no git commands from the
    Implementer.

### Fix implemented (2026-10-20)

Role: Implementer. Worktree `/home/user/.local/share/opencode/worktree/1de5bb/060-desktop-deselect`
(base c520a0e, branch `fix/060-desktop-deselect`); **no git commands were run** —
all changes are left uncommitted for the main agent to merge; `Status:` untouched.
A previous aborted run of this task left no code changes (only this issue file), so
the implementation started from a clean tree. Baseline re-verified before any edit:
`node --test` → **129 tests, 129 pass, 0 fail**. Server: `python3 -m http.server 8060`
from the worktree root, PID recorded in `/tmp/opencode/http060-fix.pid` (967338),
**killed by PID** afterwards.

#### Exact unified diff (base c520a0e → this worktree, the seven allowed files only)

The base side was reconstructed without git by removing the sibling (059) blocks from
the parallel `clean` tree; both reconstructions are verified against this issue's cited
base line numbers (`#searchClear { display: none; }` at `styles.css:127`,
`@media (max-width: 700px)` at `:486`, `#search { padding-right: 2.7rem; }` at `:585`,
suppression at `:587`). A tree-diff of this worktree against `clean` shows no other
file differs except siblings' own merged files (`AGENTS.md`, `js/theme.js`,
`test/deadcode.test.js` — clean-side drift, absent here).

```diff
--- a/index.html
+++ b/index.html
@@ -45,6 +45,9 @@
       <button type="button" id="searchClear" aria-label="Clear the search">
         <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
       </button>
+      <button type="button" id="searchDeselect" aria-label="Clear the selection" hidden>
+        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
+      </button>
       <div id="searchOverlay" hidden>
         <button type="button" id="overlayClear" aria-label="Clear the selection">
           <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
--- a/classes.html
+++ b/classes.html
@@ -46,6 +46,9 @@
       <button type="button" id="searchClear" aria-label="Clear the search">
         <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
       </button>
+      <button type="button" id="searchDeselect" aria-label="Clear the selection" hidden>
+        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
+      </button>
       <div id="searchOverlay" hidden>
         <button type="button" id="overlayClear" aria-label="Clear the selection">
           <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
--- a/styles.css
+++ b/styles.css
@@ -124,13 +124,54 @@
 #search, #ghost {
   font-family: "Monaspace Neon", ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
 }
-#searchClear { display: none; }
+/* the X slot (issue 060): the input text and the ghost completion both clear
+   the clear-button gutter on every viewport. Kept as its own exact lines
+   (the #search one is a pinned literal). */
+#search { padding-right: 2.7rem; }
+#ghost { padding-right: 2.7rem; }
+/* the clear X (issue 060), every viewport: shown only while the filter holds
+   text — JS toggles the [hidden] attribute, and the [hidden] rule below beats
+   this id rule. It erases the filter only (eraseFilter); it never deselects. */
+#searchClear {
+  display: flex; align-items: center; justify-content: center;
+  position: absolute; right: 0; top: 0; bottom: 0; width: 2.7rem;
+  border: 0; background: transparent; color: var(--md-on-surface-variant, #555);
+  cursor: pointer; z-index: 2;
+}
+#searchClear:active { color: var(--md-primary, #0b4da2); }
+#searchClear svg {
+  width: 1.5rem; height: 1.5rem; fill: none; stroke: currentColor; stroke-width: 2.4;
+  stroke-linecap: round; stroke-linejoin: round;
+}
+/* the deselect X (issue 060): while a teacher/class is selected and the
+   filter is empty, the whole box becomes this button — opaque with the wrap's
+   8px radius (issue 057's lesson: the overlay takes the wrap's chrome or it
+   reads as a square patch). Narrow never renders it: its deselect chrome is
+   #overlayClear (armour at the end of the narrow block). */
+#searchDeselect {
+  position: absolute; left: 0; top: 0; right: 0; bottom: 0; z-index: 3;
+  display: flex; align-items: center; justify-content: center;
+  background: var(--md-surface-container-lowest, #fff); border: 0;
+  border-radius: 8px; color: var(--md-on-surface-variant, #555);
+  cursor: pointer;
+}
+#searchDeselect:active { color: var(--md-primary, #0b4da2); }
+#searchDeselect svg {
+  width: 1.5rem; height: 1.5rem; fill: none; stroke: currentColor; stroke-width: 2.4;
+  stroke-linecap: round; stroke-linejoin: round;
+}
+/* exactly one cancel affordance on every viewport: the app owns the X — the
+   engine's native cancel/decoration is suppressed here, once, at base */
+#search::-webkit-search-cancel-button, #search::-webkit-search-decoration {
+  -webkit-appearance: none; appearance: none; display: none;
+}
 /* mobile nav chrome (issue 056): desktop never shows it; the narrow block may */
 #searchBack { display: none; }
 #searchOverlay { display: none; }
-/* JS sets [hidden] while the filter is empty; the id rules here (and the
-   mobile display:flex below) would otherwise outrank the UA [hidden] default. */
+/* JS sets [hidden] while the filter is empty; the id rules above (flex +
+   absolute geometry) would otherwise outrank the UA [hidden] default. */
 #searchClear[hidden] { display: none; }
+#searchDeselect[hidden] { display: none; }
 #suggest {
   position: absolute; top: 100%; left: 0; right: 0; z-index: 10;
   list-style: none; margin: 0; padding: 0;
@@ -569,24 +610,9 @@
     fill: none; stroke: var(--md-on-surface-variant, #555); stroke-width: 2.4;
     stroke-linecap: round; stroke-linejoin: round;
   }
-  /* the clear "x" is shown only while the filter holds text: JS toggles the
-     [hidden] attribute, and #searchClear[hidden] above beats this id rule. */
-  #searchClear {
-    align-items: center; justify-content: center;
-    position: absolute; right: 0; top: 0; bottom: 0; width: 2.7rem;
-    border: 0; background: transparent; color: var(--md-on-surface-variant, #555);
-    cursor: pointer; z-index: 2; display: flex;
-  }
-  #searchClear:active { color: var(--md-primary, #0b4da2); }
-  #searchClear svg {
-    width: 1.5rem; height: 1.5rem; fill: none; stroke: currentColor; stroke-width: 2.4;
-    stroke-linecap: round; stroke-linejoin: round;
-  }
-  #search { padding-right: 2.7rem; }
-  /* exactly one clear affordance on mobile: suppress the engine native cancel */
-  #search::-webkit-search-cancel-button, #search::-webkit-search-decoration {
-    -webkit-appearance: none; appearance: none; display: none;
-  }
+  /* the desktop deselect-X (issue 060) never renders on narrow: the deselect
+     chrome here is #overlayClear (state=teacher/class) */
+  #searchDeselect { display: none; }
   #teacherList { max-width: none; max-height: none; border: 0; overflow: visible; }
   /* flattened rows: simple line separators, not self-enclosed cards.
      Negative side margins + matching padding make each separator run
--- a/js/teachers.js
+++ b/js/teachers.js
@@ -63,6 +63,7 @@
     var overlayName = document.getElementById('overlayName');
     var overlayClear = document.getElementById('overlayClear');
     var searchClear = document.getElementById('searchClear');
+    var searchDeselect = document.getElementById('searchDeselect');
     var ghost = document.getElementById('ghost');
     var ghostTyped = document.getElementById('ghostTyped');
     var ghostPre = document.getElementById('ghostPre');
@@ -183,10 +184,22 @@
       else layout.classList.remove('is-list');
     }
 
-    // Mobile clear "x": it is shown only while the filter holds text. Called
-    // wherever search.value can change (typing, commit, selection, clear, boot).
+    // clear "x" (issue 060), every viewport: shown only while the filter holds
+    // text. Called wherever search.value can change (typing, commit, selection,
+    // clear, boot). The X only ever erases (eraseFilter) — it never deselects.
     function syncClear() {
       if (searchClear) searchClear.hidden = !search.value;
+      syncDeselect();
+    }
+
+    // deselect "x" (issue 060): while a teacher is selected and the filter is
+    // empty, the whole box becomes this button (desktop CSS only; narrow
+    // armours it off — its deselect chrome is #overlayClear). Facts-only
+    // derivation: no menuOpen, no focus, no viewport test — CSS alone picks
+    // the rendering. Keyboard emptying still deselects (pinned 056); the
+    // clear X does not (pinned 060).
+    function syncDeselect() {
+      if (searchDeselect) searchDeselect.hidden = !(selectedTeacher !== null && search.value === '');
     }
 
     // The name overlay belongs to the 'teacher' state: hidden unless a
@@ -194,6 +207,7 @@
     function syncOverlay() {
       searchOverlay.hidden = selectedTeacher === null || menuOpen;
       if (selectedTeacher !== null) overlayName.textContent = selectedTeacher;
+      syncDeselect();
     }
 
     // menu edges: the list is open or not — blur writes neither fact
@@ -496,6 +510,25 @@
 
     // ---- grouped live search ------------------------------------------------
 
+    // erase-only funnel (issue 060): the clear X lands here, never in
+    // onInput()/commit() — emptying the box this way must NOT deselect. The
+    // body is commit's empty branch minus showEmpty(), plus re-marking the
+    // selection: full list from the empty query, suggest/ghost dropped, pane
+    // flag re-synced, no selection fact written. Keyboard emptying still
+    // deselects through onInput (pinned 056 ruling 5) — a deliberate
+    // divergence: the keyboard runs the live-search derivation (empty filter
+    // derives no selection), the X is an explicit erase-only command whose
+    // landing state (selected + empty) immediately presents the deselect X.
+    function eraseFilter() {
+      search.value = '';
+      syncClear();
+      renderSuggest([]);
+      renderGhost();
+      renderList(match.searchSections(index, '', avail).sections);
+      markActive(selectedTeacher);
+      syncList();
+    }
+
     function onInput() {
       var q = search.value;
       syncClear();
@@ -611,18 +644,25 @@
       showEmpty();
     });
 
-    // the mobile X erases the filter in the list/empty states (empty query
-    // -> full list + emoticon detail); it no longer arms the menu —
-    // teacher-state deselect is #overlayClear. mousedown is prevented so
-    // the button never takes focus.
+    // the clear X erases the filter only — every viewport, every state
+    // (issue 060): it never deselects and never arms the menu. Deselect is a
+    // dedicated control: #searchDeselect (desktop, selected + empty filter),
+    // #overlayClear (narrow teacher state); keyboard emptying keeps its
+    // pinned deselect through onInput. mousedown is prevented so the button
+    // never takes focus.
     if (searchClear) {
       searchClear.addEventListener('mousedown', function (e) { e.preventDefault(); });
       searchClear.addEventListener('click', function () {
-        search.value = '';
-        syncClear();
-        commit();
+        eraseFilter();
       });
     }
+    // the deselect X (issue 060): shows while selected ∧ filter empty (state-
+    // gated, never hover-gated), covers the whole box; one press funnels
+    // through the one empty funnel, never focuses the box, never erases
+    if (searchDeselect) {
+      searchDeselect.addEventListener('mousedown', function (e) { e.preventDefault(); });
+      searchDeselect.addEventListener('click', function () { showEmpty(); });
+    }
 
     // initial paint: full list (available-today raised), faint emoticon detail
     renderList(match.searchSections(index, '', avail).sections);
--- a/js/classes.js
+++ b/js/classes.js
@@ -72,6 +72,7 @@
     var overlayName = document.getElementById('overlayName');
     var overlayClear = document.getElementById('overlayClear');
     var searchClear = document.getElementById('searchClear');
+    var searchDeselect = document.getElementById('searchDeselect');
     var ghost = document.getElementById('ghost');
     var ghostTyped = document.getElementById('ghostTyped');
     var ghostPre = document.getElementById('ghostPre');
@@ -118,8 +119,22 @@
       if (menuOpen) layout.classList.add('is-list');
       else layout.classList.remove('is-list');
     }
+    // clear "x" (issue 060), every viewport: shown only while the filter holds
+    // text. Called wherever search.value can change (typing, commit, selection,
+    // clear, boot). The X only ever erases (eraseFilter) — it never deselects.
     function syncClear() {
       if (searchClear) searchClear.hidden = !search.value;
+      syncDeselect();
+    }
+
+    // deselect "x" (issue 060): while a class is selected and the filter is
+    // empty, the whole box becomes this button (desktop CSS only; narrow
+    // armours it off — its deselect chrome is #overlayClear). Facts-only
+    // derivation: no menuOpen, no focus, no viewport test — CSS alone picks
+    // the rendering. Keyboard emptying still deselects (pinned 058); the
+    // clear X does not (pinned 060).
+    function syncDeselect() {
+      if (searchDeselect) searchDeselect.hidden = !(selectedClass !== null && search.value === '');
     }
 
     // The name overlay belongs to the 'class' state: hidden unless a
@@ -127,6 +142,7 @@
     function syncOverlay() {
       searchOverlay.hidden = selectedClass === null || menuOpen;
       if (selectedClass !== null) overlayName.textContent = selectedClass;
+      syncDeselect();
     }
 
     // menu edges: the list is open or not — blur writes neither fact
@@ -548,6 +564,25 @@
       });
     }
 
+    // erase-only funnel (issue 060): the clear X lands here, never in
+    // onInput()/commit() — emptying the box this way must NOT deselect. The
+    // body is commit's empty branch minus showEmpty(): full leaf catalogue
+    // from the empty query, suggest/ghost dropped, pane flag re-synced, no
+    // selection fact written (renderList re-applies the active mark from
+    // activeKey — unlike teachers' renderItem, hence no markActive here).
+    // Keyboard emptying still deselects through onInput (pinned 058 ruling 5)
+    // — a deliberate divergence: the keyboard runs the live-search derivation
+    // (empty filter derives no selection), the X is an explicit erase-only
+    // command whose landing state (selected + empty) presents the deselect X.
+    function eraseFilter() {
+      search.value = '';
+      syncClear();
+      renderSuggest([]);
+      renderGhost();
+      renderList(leafRows(match.classSearch(index, '')));
+      syncList();
+    }
+
     function onInput() {
       var q = search.value;
       syncClear();
@@ -671,18 +706,25 @@
       showEmpty();
     });
 
-    // the mobile X erases the filter in the list/empty states (empty query
-    // -> full catalogue + emoticon detail); it no longer arms the menu —
-    // class-state deselect is #overlayClear. mousedown is prevented so
-    // the button never takes focus.
+    // the clear X erases the filter only — every viewport, every state
+    // (issue 060): it never deselects and never arms the menu. Deselect is a
+    // dedicated control: #searchDeselect (desktop, selected + empty filter),
+    // #overlayClear (narrow class state); keyboard emptying keeps its
+    // pinned deselect through onInput. mousedown is prevented so the button
+    // never takes focus.
     if (searchClear) {
       searchClear.addEventListener('mousedown', function (e) { e.preventDefault(); });
       searchClear.addEventListener('click', function () {
-        search.value = '';
-        syncClear();
-        commit();
+        eraseFilter();
       });
     }
+    // the deselect X (issue 060): shows while selected ∧ filter empty (state-
+    // gated, never hover-gated), covers the whole box; one press funnels
+    // through the one empty funnel, never focuses the box, never erases
+    if (searchDeselect) {
+      searchDeselect.addEventListener('mousedown', function (e) { e.preventDefault(); });
+      searchDeselect.addEventListener('click', function () { showEmpty(); });
+    }
 
     // initial paint: full leaf catalogue, empty detail
     renderList(leafRows(match.classSearch(index, '')));
--- a/test/teacher-daygroups.test.js
+++ b/test/teacher-daygroups.test.js
@@ -788,3 +788,106 @@
   var fresh = teacherOrderOf(match.searchSections(index, '', availSun).sections);
   assert.deepStrictEqual(h.sunOrder, fresh, 'the fresh Sunday order is the real alphabetical collapse');
 });
+
+// ---- clear/deselect X split (issue 060) --------------------------------------
+
+test('the clear X erases only, the deselect X deselects only (issue 060)', function () {
+  // markup: the new deselect button sits between the clear X and the overlay
+  var clr = INDEX_SRC.indexOf('id="searchClear"');
+  var des = INDEX_SRC.indexOf('id="searchDeselect"');
+  var ov = INDEX_SRC.indexOf('id="searchOverlay"');
+  assert.ok(clr !== -1 && des !== -1 && ov !== -1, 'markup ids present');
+  assert.ok(clr < des && des < ov, '#searchDeselect sits between #searchClear and #searchOverlay');
+  // CSS: the engine cancel button is suppressed once, at base (I4 — the app
+  // owns the only X); the narrow copy moved, it is not a duplicate
+  var base = CSS_SRC.slice(0, CSS_SRC.indexOf('@media (max-width: 700px)'));
+  var narrow = CSS_SRC.slice(CSS_SRC.indexOf('@media (max-width: 700px)'));
+  assert.ok(base.indexOf('#search::-webkit-search-cancel-button') !== -1,
+    'the native cancel button is suppressed at base (app-wide)');
+  assert.ok(narrow.indexOf('#search::-webkit-search-cancel-button') === -1,
+    'the narrow suppression copy moved to base, it is not a duplicate');
+  // CSS: the app X owns the 2.7rem right slot on every viewport; the ghost
+  // completion clears the slot too; the base armour is gone
+  assert.ok(base.indexOf('#search { padding-right: 2.7rem; }') !== -1,
+    'the X slot gutter is base-level');
+  assert.ok(narrow.indexOf('#search { padding-right: 2.7rem; }') === -1,
+    'the narrow gutter copy moved to base, it is not a duplicate');
+  assert.ok(base.indexOf('#ghost { padding-right: 2.7rem; }') !== -1,
+    'the ghost completion clears the X slot as well');
+  assert.strictEqual(base.indexOf('#searchClear { display: none; }'), -1,
+    'the clear X is no longer armour-plated off desktop');
+  // CSS: the deselect X overlays the whole box at base; narrow armours it off
+  var desAt = base.indexOf('#searchDeselect {');
+  assert.ok(desAt !== -1, 'base deselect-X rule present');
+  var desRule = base.slice(desAt, base.indexOf('}', desAt));
+  assert.ok(desRule.indexOf('position: absolute') !== -1,
+    'the deselect-X covers the whole box (left/top/right/bottom 0)');
+  assert.ok(base.indexOf('#searchDeselect[hidden] { display: none; }') !== -1,
+    'the deselect-X honours its [hidden] attribute at base');
+  assert.ok(narrow.split('\n').some(function (line) {
+    return line.trim() === '#searchDeselect { display: none; }';
+  }), 'narrow armours the desktop deselect-X off (its chrome is #overlayClear)');
+  // JS, both pages: syncDeselect derives from the two facts only (I2)
+  [APP_SRC, CLASSES_SRC].forEach(function (src, i) {
+    var tag = i ? 'classes' : 'teachers';
+    var fact = i ? 'selectedClass !== null' : 'selectedTeacher !== null';
+    function body(sig) {
+      var start = src.indexOf(sig);
+      assert.ok(start !== -1, tag + ': ' + sig);
+      var end = src.indexOf('\n    }', start);
+      assert.ok(end !== -1, tag + ': ' + sig + ' bounds');
+      return src.slice(start, end + '\n    }'.length);
+    }
+    var sd = body('function syncDeselect()');
+    assert.ok(sd.indexOf('searchDeselect.hidden = !(') !== -1,
+      tag + ': syncDeselect derives the [hidden] attribute');
+    assert.ok(sd.indexOf(fact) !== -1, tag + ': keyed on the selection fact');
+    assert.ok(sd.indexOf("search.value === ''") !== -1, tag + ': keyed on the empty value');
+    assert.ok(sd.indexOf('menuOpen') === -1, tag + ': never keyed on the menu');
+    // both syncs that sit on every fact/value write compose it (I2 stays live)
+    assert.ok(body('function syncClear()').indexOf('syncDeselect();') !== -1,
+      tag + ': syncClear composes syncDeselect');
+    assert.ok(body('function syncOverlay()').indexOf('syncDeselect();') !== -1,
+      tag + ': syncOverlay composes syncDeselect');
+    // eraseFilter: commit's empty branch minus showEmpty, no funnel writes (I5)
+    var ef = body('function eraseFilter()');
+    ["search.value = '';", 'syncClear();', 'renderSuggest([])', 'renderGhost();',
+     'syncList();'].forEach(function (tok) {
+      assert.ok(ef.indexOf(tok) !== -1, tag + ': eraseFilter: ' + tok);
+    });
+    assert.ok(ef.indexOf(i ? "leafRows(match.classSearch(index, ''))"
+      : "match.searchSections(index, '', avail).sections") !== -1,
+      tag + ': eraseFilter re-renders the full list from the empty query');
+    if (!i) assert.ok(ef.indexOf('markActive(selectedTeacher)') !== -1,
+      'teachers: eraseFilter re-marks the active row (classes re-applies from activeKey)');
+    else assert.ok(ef.indexOf('markActive') === -1,
+      'classes: the re-render re-applies the mark from activeKey itself');
+    ['showEmpty', 'selectTeacher(', 'selectClass(', 'isCoarsePointer', 'matchMedia'].forEach(function (tok) {
+      assert.ok(ef.indexOf(tok) === -1, tag + ': eraseFilter must not touch ' + tok);
+    });
+    // the clear X calls eraseFilter and nothing else — never commit/onInput
+    var clrAt = src.indexOf("searchClear.addEventListener('click'");
+    assert.ok(clrAt !== -1, tag + ': clear X handler found');
+    var clrH = src.slice(clrAt, src.indexOf('});', clrAt) + 3);
+    assert.ok(clrH.indexOf('eraseFilter();') !== -1, tag + ': the X erases only');
+    ['commit()', 'showEmpty()', 'search.focus()'].forEach(function (tok) {
+      assert.ok(clrH.indexOf(tok) === -1, tag + ': the X must not contain ' + tok);
+    });
+    // the deselect X funnels through the one empty funnel, never focuses
+    var desHAt = src.indexOf("searchDeselect.addEventListener('click'");
+    assert.ok(desHAt !== -1, tag + ': deselect X handler found');
+    var desH = src.slice(desHAt, src.indexOf('});', desHAt) + 3);
+    assert.ok(desH.indexOf('showEmpty();') !== -1, tag + ': the deselect X runs the empty funnel');
+    assert.ok(desH.indexOf('search.focus()') === -1, tag + ': the deselect X never focuses the box');
+    // neither press may arm focus through mousedown
+    ['searchClear', 'searchDeselect'].forEach(function (id) {
+      var at = src.indexOf(id + ".addEventListener('mousedown'");
+      assert.ok(at !== -1, tag + ': ' + id + ' mousedown handler found');
+      assert.ok(src.slice(at, src.indexOf('});', at) + 3).indexOf('preventDefault') !== -1,
+        tag + ': ' + id + ' press never focuses the box');
+    });
+    // keyboard divergence: onInput's pinned empty branch is untouched (056)
+    assert.ok(body('function onInput()').indexOf('showEmpty();') !== -1,
+      tag + ': backspace-to-empty still deselects');
+  });
+});
--- a/test/classes.test.js
+++ b/test/classes.test.js
@@ -1164,3 +1164,101 @@
   assert.ok(bootTail.indexOf('showEmpty();') !== -1, 'boot paints through the empty funnel');
 });
 
+// ---- clear/deselect X split (issue 060) --------------------------------------
+
+test('classes mirrors the clear/deselect X split (issue 060)', function () {
+  // markup: the new deselect button sits between the clear X and the overlay
+  var html = readPage('classes.html');
+  var clr = html.indexOf('id="searchClear"');
+  var des = html.indexOf('id="searchDeselect"');
+  var ov = html.indexOf('id="searchOverlay"');
+  assert.ok(clr !== -1 && des !== -1 && ov !== -1, 'markup ids present');
+  assert.ok(clr < des && des < ov, '#searchDeselect sits between #searchClear and #searchOverlay');
+  // shared CSS, verified from classes (house style): the engine cancel button
+  // is suppressed once, at base; the narrow copy moved, it is not a duplicate
+  var css = readPage('styles.css');
+  var base = css.slice(0, css.indexOf('@media (max-width: 700px)'));
+  var narrow = css.slice(css.indexOf('@media (max-width: 700px)'));
+  assert.ok(base.indexOf('#search::-webkit-search-cancel-button') !== -1,
+    'the native cancel button is suppressed at base (app-wide, verified from classes)');
+  assert.ok(narrow.indexOf('#search::-webkit-search-cancel-button') === -1,
+    'the narrow suppression copy moved to base, it is not a duplicate');
+  // the app X owns the 2.7rem right slot on every viewport (the pinned
+  // single-line gutter now lives at base); the ghost clears the slot too
+  assert.ok(base.indexOf('#search { padding-right: 2.7rem; }') !== -1,
+    'the X slot gutter is base-level (verified from classes)');
+  assert.ok(narrow.indexOf('#search { padding-right: 2.7rem; }') === -1,
+    'the narrow gutter copy moved to base, it is not a duplicate');
+  assert.ok(base.indexOf('#ghost { padding-right: 2.7rem; }') !== -1,
+    'the ghost completion clears the X slot as well');
+  assert.strictEqual(base.indexOf('#searchClear { display: none; }'), -1,
+    'the clear X is no longer armour-plated off desktop');
+  // the deselect X overlays the whole box at base; narrow armours it off
+  var desAt = base.indexOf('#searchDeselect {');
+  assert.ok(desAt !== -1, 'base deselect-X rule present');
+  var desRule = base.slice(desAt, base.indexOf('}', desAt));
+  assert.ok(desRule.indexOf('position: absolute') !== -1,
+    'the deselect-X covers the whole box (left/top/right/bottom 0)');
+  assert.ok(base.indexOf('#searchDeselect[hidden] { display: none; }') !== -1,
+    'the deselect-X honours its [hidden] attribute at base');
+  assert.ok(narrow.split('\n').some(function (line) {
+    return line.trim() === '#searchDeselect { display: none; }';
+  }), 'narrow armours the desktop deselect-X off (its chrome is #overlayClear)');
+  // JS: syncDeselect derives from the two facts only (I2)
+  var src = CLASSES_SRC;
+  function body(sig) {
+    var start = src.indexOf(sig);
+    assert.ok(start !== -1, sig + ' found');
+    var end = src.indexOf('\n    }', start);
+    assert.ok(end !== -1, sig + ' bounds');
+    return src.slice(start, end + '\n    }'.length);
+  }
+  var sd = body('function syncDeselect()');
+  assert.ok(sd.indexOf('searchDeselect.hidden = !(') !== -1,
+    'syncDeselect derives the [hidden] attribute');
+  assert.ok(sd.indexOf('selectedClass !== null') !== -1, 'keyed on the selection fact');
+  assert.ok(sd.indexOf("search.value === ''") !== -1, 'keyed on the empty value');
+  assert.ok(sd.indexOf('menuOpen') === -1, 'never keyed on the menu');
+  // both syncs that sit on every fact/value write compose it (I2 stays live)
+  assert.ok(body('function syncClear()').indexOf('syncDeselect();') !== -1,
+    'syncClear composes syncDeselect');
+  assert.ok(body('function syncOverlay()').indexOf('syncDeselect();') !== -1,
+    'syncOverlay composes syncDeselect');
+  // eraseFilter: commit's empty branch minus showEmpty, no funnel writes (I5)
+  var ef = body('function eraseFilter()');
+  ["search.value = '';", 'syncClear();', 'renderSuggest([])', 'renderGhost();',
+   'syncList();'].forEach(function (tok) {
+    assert.ok(ef.indexOf(tok) !== -1, 'eraseFilter: ' + tok);
+  });
+  assert.ok(ef.indexOf("leafRows(match.classSearch(index, ''))") !== -1,
+    'eraseFilter re-renders the full leaf catalogue from the empty query');
+  assert.ok(ef.indexOf('markActive') === -1,
+    'the re-render re-applies the mark from activeKey itself');
+  ['showEmpty', 'selectTeacher(', 'selectClass(', 'isCoarsePointer', 'matchMedia'].forEach(function (tok) {
+    assert.ok(ef.indexOf(tok) === -1, 'eraseFilter must not touch ' + tok);
+  });
+  // the clear X calls eraseFilter and nothing else — never commit/onInput
+  var clrAt = src.indexOf("searchClear.addEventListener('click'");
+  assert.ok(clrAt !== -1, 'clear X handler found');
+  var clrH = src.slice(clrAt, src.indexOf('});', clrAt) + 3);
+  assert.ok(clrH.indexOf('eraseFilter();') !== -1, 'the X erases only');
+  ['commit()', 'showEmpty()', 'search.focus()'].forEach(function (tok) {
+    assert.ok(clrH.indexOf(tok) === -1, 'the X must not contain ' + tok);
+  });
+  // the deselect X funnels through the one empty funnel, never focuses
+  var desHAt = src.indexOf("searchDeselect.addEventListener('click'");
+  assert.ok(desHAt !== -1, 'deselect X handler found');
+  var desH = src.slice(desHAt, src.indexOf('});', desHAt) + 3);
+  assert.ok(desH.indexOf('showEmpty();') !== -1, 'the deselect X runs the empty funnel');
+  assert.ok(desH.indexOf('search.focus()') === -1, 'the deselect X never focuses the box');
+  // neither press may arm focus through mousedown
+  ['searchClear', 'searchDeselect'].forEach(function (id) {
+    var at = src.indexOf(id + ".addEventListener('mousedown'");
+    assert.ok(at !== -1, id + ' mousedown handler found');
+    assert.ok(src.slice(at, src.indexOf('});', at) + 3).indexOf('preventDefault') !== -1,
+      id + ' press never focuses the box');
+  });
+  // keyboard divergence: onInput's pinned empty branch is untouched (058)
+  assert.ok(body('function onInput()').indexOf('showEmpty();') !== -1,
+    'backspace-to-empty still deselects');
+});

```

#### Acceptance-criteria checklist

1. **Markup** — **met.** The byte-identical `#searchDeselect` block (verified by
   `diff` of the two inserted regions: RAW-IDENTICAL) inserted into `index.html` and
   `classes.html` between `#searchClear` and `#searchOverlay`. No other markup
   change; no `<head>` edits.
2. **CSS** — **met.** All five steps: (1) `::-webkit-search-cancel-button` /
   `-decoration` suppression moved verbatim to base, exactly one occurrence,
   before the first `@media`; narrow copy deleted. (2) The base armour
   `#searchClear { display: none; }` replaced by the lifted narrow cluster
   (`display:flex; position:absolute; right:0; top:0; bottom:0; width:2.7rem;`
   border/background/color/cursor/z-index + `:active` + `svg` metrics), rewritten
   comment; `#searchClear[hidden] { display: none; }` kept verbatim. (3) New
   `#searchDeselect` rules at base (full-box overlay, `z-index:3`, opaque
   `--md-surface-container-lowest`, `border-radius:8px`, `:active`, same `svg`
   metrics, `#searchDeselect[hidden] { display: none; }`). (4) Exactly two gutter
   lines as own lines after the augmented blocks: `#search { padding-right: 2.7rem; }`
   (single occurrence, the `test/classes.test.js:479` literal) and
   `#ghost { padding-right: 2.7rem; }`. (5) Narrow: moved-duplicate `#searchClear`
   cluster, `#search { padding-right: 2.7rem; }` and the webkit rule deleted; added
   exactly `#searchDeselect { display: none; }` with a comment; everything else in
   the narrow block (back arrow, overlay `:not([hidden])`, 057 `:has` input-hide,
   `is-list` paddings) untouched. Pinned literals verbatim:
   `#searchBack { display: none; }`, `#searchOverlay { display: none; }`,
   `#searchClear[hidden] { display: none; }`, one base `#search { padding-right: 2.7rem; }`,
   the narrow `:has` rule stays narrow-only. No `!important`, no
   `@media (pointer: coarse)`, no focus-gating; the pre-existing `#searchWrap:focus-within`
   glow (`styles.css:92-95`) untouched.
3. **JS (both pages)** — **met.** `var searchDeselect = ...` next to the other
   element vars (teachers `:66`, classes `:75`); `syncDeselect()` defined
   immediately after `syncClear()` (teachers before `syncOverlay`, classes before
   `indexByDaySlot` — outside every pinned slice, incl. the classes week-harness
   window); guarded `if (searchDeselect)`, body exactly
   `searchDeselect.hidden = !(selectedTeacher/selectedClass !== null && search.value === '');`
   — facts only, no `menuOpen`/focus/viewport; `syncDeselect();` as the last
   statement of **both** `syncClear()` and `syncOverlay()` on both pages (two call
   sites, zero scattered); `eraseFilter()` immediately before `onInput()` (after
   `acceptSuggest`/`classSuggestions`) with the mandated bodies — teachers
   includes `markActive(selectedTeacher)`, classes uses
   `leafRows(match.classSearch(index, ''))` and no `markActive` (re-applied from
   `activeKey` by `renderList`); `#searchClear` click body is now `eraseFilter();`
   (straight-line, no `commit()`/`showEmpty()`/`search.focus()`/nested callback —
   classes `handlerSlice` safe); new `#searchDeselect` handlers directly after it
   (`mousedown → preventDefault`; click → `showEmpty();`), never focuses;
   stale comments rewritten (syncClear header, X-handler header), new headers on
   `syncDeselect`/`eraseFilter` stating I1/I2/I5 and the ruling-3 divergence.
   `showEmpty`/`selectTeacher`/`selectClass`/`onInput`/`commit` bodies changed
   **only** by the one `syncDeselect();` line in `syncClear`/`syncOverlay`.
4. **Semantics** — **met.** Erase-X never deselects anywhere (walked on both
   viewports, both pages); deselect-X never erases, never focuses (`mousedown`
   preventDefault; `activeElement` stayed `BODY` after every press); keyboard
   emptying keeps 056's deselect (walked: backspace-from-state-(a) renders the
   kaomoji, both pages); no `isCoarsePointer`/`matchMedia`/`innerWidth` in any new
   code (pinned by both new tests).
5. **Tests** — **met.** Exactly two new `test(...)` blocks, both named with
   `(issue 060)`, appended to the files that already hold the sources:
   `test/teacher-daygroups.test.js` → `'the clear X erases only, the deselect X
   deselects only (issue 060)'` (markup order, base/narrow CSS slices, JS on both
   sources); `test/classes.test.js` → `'classes mirrors the clear/deselect X split
   (issue 060)'` (same assertions for `CLASSES_SRC`, `classes.html` via `readPage`,
   `readPage('styles.css')`). Zero existing tests edited or deleted — verified
   byte-wise: each test file's pre-existing content is an exact prefix of the new
   file (`clean` copy comparison; base counts58/23 →59/24).
6. **Test total** — **met:** `node --test` → **131 tests, 131 pass, 0 fail**;
   `node --test test/*.test.js` → **131/131/0**. (129 baseline untouched + exactly 2.)
7. **Serve + curl** — **met:** `200` for `/index.html`, `/classes.html`,
   `/styles.css`, `/js/teachers.js`, `/js/classes.js`; server killed by PID.
8. **Playwright walk (Chromium, MCP)** — **met** (outcome table below; the 8e
   computed-style probe has an engine quirk, see Deviations — verified instead by
   element screenshots in exactly the required conditions). Screenshots (not
   committed): `/tmp/opencode/060-fix-{a,b,c,g-longquery,g-ghost,e-narrow,e-desktop,e-teachers-focused-hovered,e-teachers-blurred-hovered,e-teachers-stateA-hovered,f-teacher-state,h-a,h-b,h-c}.png`.
   **0 JS console errors** across the entire session (`browser_console_messages`,
   level error, all pages/viewports).
9. **Diff hygiene** — **met.** Only `index.html`, `classes.html`, `styles.css`,
   `js/teachers.js`, `js/classes.js`, `test/teacher-daygroups.test.js`,
   `test/classes.test.js` differ from base, plus this issue's append-only entry.
   No README, no `data/`, no other `js/*`, no `<head>`.
10. **No-gos** — **met.** `showEmpty();` in `onInput` untouched (both pages, pinned
    by baseline tests + new tests); no X routed through `onInput()`/`commit()`;
    `search.addEventListener('click'` count still **2** (new listeners are
    `searchClear.`/`searchDeselect.` — safe substrings); no `search.focus()` in any
    X handler; nothing new keyed on focus/hover/`(pointer: coarse)`; no
    `setTimeout`, no `new Date()` added (counts stay3/3 teachers+classes);
    `currentTeacher = null;` = **2**, `currentWeek = null;` = **3** (the deselect-X
    funnels through `showEmpty()` only); narrow 057 `:has` rule, `#searchBack`/
    `#searchOverlay` armour, nomatch branches, clock — all untouched; the
    pre-existing stale-fact nomatch edge untouched (risk10); no `!important`.
11. **Sibling boundaries** — **met.** No `<head>`, no `js/theme.js`, no README. The
    only `js/*` writes are `js/teachers.js` and `js/classes.js`, confined to the
    four mandated regions each (element vars; `syncClear`/`syncDeselect`/
    `syncOverlay`; `eraseFilter` before `onInput`; the two handler blocks +
    comments). CSS confined to the base search region + the narrow cluster region.

#### Playwright walk outcome table (1280×800 desktop, 390×844 narrow)

| # | step | result |
|---|---|---|
| a | desktop teachers state (a): type `Ben Haj`+Enter, click app X at old native coordinate (`box.right−14px`) | **PASS** — value `""`; `#detail h2` still "Ben Haj" (no kaomoji); list **132** rows; `li[data-name="Ben Haj"]` keeps its `active` mark; `#searchClear [hidden]=true`; `#searchDeselect [hidden]=false`, `display:flex`; `activeElement` stayed `BODY`; wrap box-shadow identical to unfocused boot value (`none`); activeElement/focus never moved |
| b | press deselect-X (center) | **PASS** — `.empty-state` rendered, `h2` gone, active marks cleared; `#searchDeselect [hidden]=true`; placeholder visible; value `""`; `activeElement` unchanged; list still132 rows |
| c | state (c): `GLSI` (42 rows, no commit) → app X | **PASS** — value `""`, full list132 rows, `.empty-state` detail unchanged (never left the empty page), `#searchDeselect` stays hidden. Classes mirror: `GLSI3` (8 rows) → **94** rows, same |
| d | keyboard divergence: from (a), focus + select-all + Backspace | **PASS** — `onInput` path: `.empty-state` renders (**backspace still deselects**), `#searchDeselect` hidden, `#searchClear` hidden; glow armed while focused (`rgb(216,226,255) 0 0 0 2px`). Repeat on classes: **PASS** |
| e | native X gone everywhere | **PASS visually** — element screenshots with text present at1280×800 and390×844, both pages, in all four trigger conditions (focused+hovered, blurred+hovered, blurred with mouse parked, selected state (a) hovered): exactly **one** X, the app's, right-aligned in the2.7rem slot. Computed-style probe caveat: see Deviations |
| f | narrow walk | **PASS** — teachers: 056 steps1–8 re-run, all as pinned (list/overlay/back/suggest states, `#overlayClear` deselects with text preserved, X-from-empty erase-only observationally identical); classes: 058 steps1–10 +12 (row-tap select) re-run, all as pinned. `#searchDeselect` computes `display:none` in every narrow state incl. selected+empty. **060's intended delta:** teachers `Ben Haj` → overlay (list state, text present) → `#searchClear` → value `""`, selection **RETAINED** (active row stays), menu open; back arrow lands on the **teacher** (`h2`/`#overlayName` = "Ben Haj"), not the kaomoji. Classes `GLSI3D1` mirror: identical |
| g | desktop visuals | **PASS** — `#search` and `#ghost` `paddingRight === '43.2px'` (2.7rem@16px); long query: input text area ends **0.0125px before** `#searchClear`'s left edge (no text under the X, input and ghost; ghost completion `class:GLSI1` likewise); focus glow: focused `rgb(216,226,255)0px0px0px2px` vs unfocused `none` (rule untouched ⇒ pixel-identical to baseline); deselect-X: bounding rect equal to the wrap content box (all four offsets **0px**), `border-radius: 8px`, opaque `rgb(255,255,255)`, X glyph centered (offset **0,0**), `cursor: pointer` |
| h | classes mirror of (a)–(g) | **PASS** — state (a) via `fill('GLSI3D1')` auto-jump (`h2 = "LCS3-GLSI_D Groupe 1"`, blurred); erase keeps the detail + the `li[data-key="GLSI3D1"]` `active` mark **byte-identical** (classes re-applies from `activeKey`); deselect → kaomoji, marks cleared,94 rows; (c)/(d)/(g) as in the table |

#### Deviations / notes

- **8e computed-style oracle (probe limitation, not a code deviation):**
  `getComputedStyle(input, '::-webkit-search-cancel-button').display` returns
  `'inline-block'` (UA default) in this Chromium **even where the suppression rule
  verifiably applies** — including narrow *before* this fix, where the Reporter
  measured by element screenshot that no native X rendered. The rule is present in
  the served stylesheet (verified from the page: `#search::-webkit-search-cancel-button,
  #search::-webkit-search-decoration { appearance: none; display: none; }`, once,
  at base) and the screenshots in all required hover/focus/blur conditions show
  exactly one X — the app's. The criterion's exact `display === 'none'` assertion is
  not attainable via this API on this engine; suppression was verified by the
  Reporter's own methodology (element screenshots) instead.
- **8a active-mark wording:** teachers' `li[data-name="Ben Haj"]` className goes
  `exact active` → `partial active` across the erase: the **`active` mark is
  identical**; only the query-match tint changes because the list re-renders from
  the empty query — the result is exactly the state a row-tap-reached (b) shows
  (`partial active`). Classes' row keeps the byte-identical `active` className.
- The backspace-to-empty transient (`selected ≠ null ∧ value === ''` inside
  `onInput`, same synchronous task) never paints — observed in the walk: the
  deselect-X unhidden-then-rehidden is invisible; no `menuOpen`/focus was added to
  `syncDeselect` to "fix" it (risk8 honoured).
- Risk8's same-task transient and risk10's stale-fact nomatch edge were left exactly
  as specified; the pre-existing stale-fact edge was not touched.

*(Reporter note: no commits were made; screenshots and the PID file live in
`/tmp/opencode/` and are not committed.)*

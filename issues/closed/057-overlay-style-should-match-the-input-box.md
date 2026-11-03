# 057: Overlay style should match the input box (square corners over the rounded input)

- Status: Fixed
- Date: 2026-10-20, Reporter: user

## Description

Scope: teachers page (`index.html`), **narrow viewport only** (CSS switches at
`styles.css:489` `@media (max-width: 700px)`); the bug does not exist on
desktop (verified — see Observed, "Desktop"). Measured in a real browser:
Playwright MCP headless Chromium against the worktree served by
`python3 -m http.server 8077` (PID in `/tmp/opencode/http057.pid`, killed by
PID afterwards), **viewport 390×844**, URL `http://localhost:8077/index.html`.
Worktree: `/home/user/.local/share/opencode/worktree/1de5bb/057-overlay-style`.
Every number below is a `getComputedStyle` / `getBoundingClientRect` /
`document.elementsFromPoint` result from the live page, executed 2026-10-20.

**State under test ("state=teacher")** — reached exactly as the brief says:
tap `#search` (→ `#layout` gains `is-list`, 132 rows) then tap the
`#teacherList li[data-name]` row "Abdelhafidh" (→ `is-list` removed,
`#searchOverlay` un-hidden, `#overlayName` = "Abdelhafidh",
`document.activeElement` = **BODY** — the row tap blurs the input,
`js/teachers.js:228`). A second variant (filter text preserved) was reached by
typing `Bel` + Enter → `#search.value` = `"Belkacem"`, overlay shown, input
blurred; both variants measure identically for everything below.

### Observed (measured)

**1. The styling gap — `#search` vs `#searchOverlay` (computed styles, state=teacher):**

| property | `#search` (input) | `#searchWrap` ← the visible "input box" | `#searchOverlay` |
|---|---|---|---|
| `border-radius` | `0px` | **`8px`** | **`0px`** ← defect |
| `border` | `0px none` | **`1px solid rgb(196,198,208)`** | `0px none` |
| `background` | `rgba(0,0,0,0)` (transparent) | `rgb(255,255,255)` | `rgb(255,255,255)` (opaque, same var) |
| `box-shadow` | `none` | `none` (blurred; `:focus-within` would add `0 0 0 2px rgb(216,226,255)` + primary border) | `none` |
| `outline` | `none` (styles.css:112) | `none` | `none` |
| `height` | `38.375px` | `40.375px` | `38.375px` |
| `padding` | `7.2px 43.2px 7.2px 9.6px` | `0px` | `7.2px 9.6px` |
| `box-sizing` | `border-box` | `border-box` | `border-box` |
| `position` / `z-index` | `relative` / `1` | `relative` / `auto` | `absolute` / **`3`** |
| `display` / `overflow` | `inline-block` / `clip` | `block` / **`visible`** | `flex` / `visible` |

The *visible* input box is `#searchWrap` (the `<input>` itself has no border,
no radius, transparent background — `styles.css:111-117`). The overlay matches
the input's *own* chrome in every row but the box the user sees is the wrap:
**the overlay has square corners (`border-radius: 0px`, no border) over a box
whose corners are rounded 8px with a 1px gray border.**

**2. Geometry (`getBoundingClientRect`, CSS px):**

- `#searchWrap`: `x 12.80, y 151.56, w 349.41, h 40.38`
- `#search`: `x 13.80, y 152.56, w 347.41, h 38.38`
- `#searchOverlay`: `x 13.80, y 152.56, w 347.41, h 38.38`

The overlay rect is **exactly equal to the input rect** (it fills the wrap's
padding box, i.e. inset 1px by the wrap's border) — the overlay covers the
input pixel-for-pixel and does **not** overhang it. It *does* overhang the
wrap's **rounded** outline: the overlay's corner sits outside the rounded
border box (TL arc centre `(20.80, 159.56)`, outer radius 8 → the overlay's TL
corner `(13.80, 152.56)` is at distance **9.90 > 8** from the arc centre).

**3. Corner defect — exactly WHERE the square corner shows:**

- At the overlay's own corner `(13.80, 152.56)` the hit-test stack is
  `[searchOverlay, search, listPane, layout, BODY, HTML]` — **`#searchWrap` is
  absent** (Chrome excludes the wrap outside its rounded shape) while the
  overlay is the top element: the overlay's opaque white paints **outside the
  input box's rounded outline, over the page background** (`rgb(249,249,255)`).
- On the wrap's **border stroke** itself (point `(15.78, 154.54)`, distance
  7.1 from the arc centre = inside the 7–8px stroke annulus) the top of the
  stack is also `#searchOverlay`: the overlay's white covers the wrap's gray
  rounded border arc. → visually, each corner's gray arc is erased and
  replaced by white that runs out to a square corner: the box's corners read
  square, with the rounded frame surviving only on the straight edges.
- **Pixel proof** (screenshots taken with `document.body.style.zoom = '6'` for
  magnification — a diagnostic magnification only, the page was reloaded
  afterwards; both shots have identical geometry: border bbox
  `(77,294)–(297,535)` in both):
  - teacher state: `/home/user/.local/share/opencode/worktree/1de5bb/clean/.playwright-mcp/057-corner-zoom6-teacher.png`
  - control (overlay hidden, same box): `/home/user/.local/share/opencode/worktree/1de5bb/clean/.playwright-mcp/057-corner-zoom6-control-nooverlay.png`
  - counting pixels in each 72×72 corner square (zoom 6 → outer radius 48px,
    border 6px), pixels that are **pure white outside the rounded outline**:
    teacher **TL 144, TR 166, BL 166, BR 189**; control **0, 2, 2, 4**
    (anti-alias noise). White square corners protrude from the rounded box
    only when the overlay is up.
  - border-stroke pixels painted white per corner: teacher **350/394/394/438
    of 726**, control **116/154/154/214** (control = anti-alias baseline) →
    roughly half of each corner arc is whiteed out.
- Normal-size shots for citation:
  - `/home/user/.local/share/opencode/worktree/1de5bb/clean/.playwright-mcp/057-state-teacher-viewport.png` (390×844 viewport, state=teacher)
  - `/home/user/.local/share/opencode/worktree/1de5bb/clean/.playwright-mcp/057-searchwrap-element.png` (element shot of `#searchWrap` with the overlay)

**4. What else is visually under/over the overlay (state=teacher, measured):**

- `#ghost` (autocomplete ghost): `hidden`, `display:none`, `z-index: 0`, text
  `""` — even with the filter text preserved (`value = "Belkacem"`) the blur
  cleared it (`js/teachers.js:594-597`), so **no filter/ghost text shows
  through**; z-index 0 < 3 would hide it anyway.
- `#searchClear`: with filter text it is **rendered** — `hidden:false`,
  `display:flex`, `z-index: 2`, rect `[318, 152.6, 43.2, 38.4]`, entirely
  inside the overlay's rect — but fully covered by the opaque overlay
  (z-index 3); no visible bleed, and taps land on the overlay, not on it.
- `#searchBack`: `display:none` (base armour `styles.css:132`; its gate
  `#layout.is-list #searchBack` (`:544`) is off in state=teacher).
- `#suggest`: `hidden`, `display:none`.
- **Focus glow cannot coexist with the overlay**: in state=teacher
  `#searchWrap` has `box-shadow: none` and `:focus-within` is false. Forcing
  `document.getElementById('search').focus()` while the overlay is up hides
  the overlay *synchronously* (focus handler → `openMenu()`
  `js/teachers.js:582-584` → `syncOverlay()` `:194-197`): measured result
  `overlay.hidden = true`, `is-list` set, `activeElement = search`,
  wrap `box-shadow: rgb(216,226,255) 0 0 0 2px`. So no state exists in which
  the glow or the caret peeks out from under the overlay — **the input can
  never be focused while the overlay shows** (every focus path hides the
  overlay in the same tick).
- Real overlay tap (clicked `#overlayName`): overlay `hidden = true`,
  `activeElement = search`, `is-list` set, glow back — overlay-hide and
  input-focus are simultaneous. ⇒ any rule that makes the input box invisible
  must un-hide it exactly when the overlay hides; it must key on the overlay's
  own visibility (single writer: `syncOverlay()` `js/teachers.js:194-197`,
  called from `openMenu :203`, `closeMenu :209`, `showEmpty :220`,
  `selectTeacher :231`), **not** on focus/blur (a blurred outside-tap in
  state=list keeps the overlay hidden while the input is also blurred — a
  focus-keyed rule would desync there).
- The input box chrome that remains visible around the overlay: the wrap's
  `1px solid #c4c6d0` rounded frame surrounds the square white overlay on the
  straight edges (overlay is inset 1px) — i.e. the "visual conflict" the user
  wants removed is this rounded frame + square white surface combination.

**5. Desktop (1280×800, `matchMedia('(max-width:700px)') = false`) —
confirmed narrow-only:** state=teacher is reachable (overlay element
`hidden = false`, `value = "Belkacem"`, `activeElement = BODY`) but the
overlay computes `display: none`, `background: transparent`, `z-index: auto`,
and `#searchBack` computes `display: none` — the base armour wins. Pin
locations: base armour `styles.css:131-133` (`#searchBack { display: none; }`
`:132`, `#searchOverlay { display: none; }` `:133`); the narrow show rule
`#searchOverlay:not([hidden]) { … }` `styles.css:562-567` (inside
`@media (max-width: 700px)` `:489`).

**6. Baseline:** `node --test` → **127 tests, 127 pass, 0 fail** (run in this
worktree before any change).

### Expected (binding, verbatim from the user)

- give the overlay **the same style as the input box** so it looks convincing
- **make the input box invisible when the overlay is visible**, to avoid
  possible visual conflicts

## Root cause

Purely a styling omission in the rule issue 056 added for the overlay:

- The box's rounded chrome lives on `#searchWrap`
  (`styles.css:87-91`: `border: 1px solid …; border-radius: 8px; background:
  #fff`; focus ring on `:focus-within` `:92-95`), which paints it with
  `overflow: visible`.
- The overlay rule `#searchOverlay:not([hidden])` (`styles.css:562-567`)
  absolutely fills the wrap's padding box with an opaque white rectangle and
  declares **no `border-radius` and no `border`**. Descendant painting happens
  after the ancestor's border, so the square white rectangle (a) paints over
  the diagonal segment of the wrap's rounded 1px border arc and (b) — because
  the overlay is a child of an `overflow: visible` parent — extends into the
  corner cut-off region *outside* the rounded outline, over the page
  background. Hence visible square corners outside the rounded input box.
- There is no rule that could have "inherited" the rounding: the `<input>`
  itself is `border: 0; outline: none; border-radius: 0; background:
  transparent` (`styles.css:111-117`) — matching "the input box" means
  matching `#searchWrap`'s 8px (and, geometrically, its 7px *inner* radius if
  the overlay is to hug the existing border, or taking the border over
  entirely — a Maintainer design call, recorded here as observation, not
  decision).
- Second half of the report: the input box chrome (wrap border + focus glow +
  the input element, `opacity:1; visibility:visible; z-index:1`) stays active
  while the overlay is up. Today it is only *covered* (opaque overlay,
  pixel-identical rect), never peeking at the edges — but the user's binding
  expectation is to make it invisible explicitly. The overlay's visibility has
  exactly one writer (`syncOverlay()`, `js/teachers.js:194-197`), so a pure-CSS
  rule keyed on `#searchOverlay:not([hidden])` / `:has(…)` (repo precedent:
  `:has()` already used at `styles.css:611` and `:616`) stays in lockstep with
  the overlay without touching JS; a focus-keyed rule would desync (see
  Observed 4). Whether CSS or JS is the mechanism is the Maintainer's call.

## Repro steps

Commands (from the worktree root
`/home/user/.local/share/opencode/worktree/1de5bb/057-overlay-style`):

```
node --test                                  # baseline: 127 tests, 127 pass, 0 fail
python3 -m http.server 8077                  # record the PID; kill by PID when done
curl -s -o /dev/null -w '%{http_code}' http://localhost:8077/index.html   # 200
```

Browser: Playwright (MCP), Chromium, **viewport 390×844**, URL
**http://localhost:8077/index.html**.

1. **Enter state=teacher** — tap the filter box `#search` (list opens,
   `is-list` set), then tap the `#teacherList li[data-name]` row
   "Abdelhafidh". Observed: `is-list` gone, `#searchOverlay` shown with
   `#overlayName` = "Abdelhafidh", `document.activeElement` = BODY.
2. **Measure styles** — `getComputedStyle` on `#search`, `#searchWrap`,
   `#searchOverlay`: record `borderRadius`, `border`, `backgroundColor`,
   `boxShadow`, `outline`, `height`, `padding`, `boxSizing`, `position`,
   `zIndex`, `overflow`, `display`. Expected vs observed: see the Observed
   table (overlay `borderRadius: 0px` vs wrap `8px`).
3. **Measure geometry** — `getBoundingClientRect` of `#searchWrap`,
   `#search`, `#searchOverlay`. Expected: overlay rect == input rect, both
   inset 1px inside the wrap.
4. **Corner probes** — `document.elementsFromPoint(x, y)` at (a) the
   overlay's TL corner `(overlayRect.left, overlayRect.top)` — top element is
   `#searchOverlay` and `#searchWrap` is missing from the stack (outside its
   rounded shape); (b) a point on the wrap's border stroke, e.g.
   arc-centre + 7.1px along the diagonal — top element `#searchOverlay`
   (white covers the gray arc).
5. **Screenshots** — take an element shot of `#searchWrap` and a viewport
   shot (cite the paths in Observed 3). For magnified corners set
   `document.body.style.zoom = '6'`, `scrollIntoView` the wrap, shoot, then
   **reload the page** to clear the zoom; shoot the same magnified box with
   the overlay hidden (fresh load, no selection) as the control. Pixel-count
   white outside the analytic rounded outline per corner (teacher ≈144–189,
   control ≈0–4) if a numeric proof is wanted.
6. **Input focusability while the overlay shows** — call
   `document.getElementById('search').focus()`. Observed: overlay flips to
   `hidden = true` in the same tick (`is-list` set, glow returns) — the input
   can never be focused while the overlay is visible. Then click
   `#searchBack` to return to state=teacher (overlay back, input blurred,
   `box-shadow: none`).
7. **Overlay tap** — click `#overlayName`. Observed: overlay hides,
   `activeElement = search`, `is-list` set, wrap glow `0 0 0 2px
   rgb(216,226,255)`. ⇒ an input-hiding rule must key on the overlay, not on
   focus.
8. **Filter-text variant** — type `Bel`, press Enter: `#search.value` =
   `"Belkacem"` preserved, overlay up, `#ghost` hidden/empty,
   `#searchClear` rendered (z 2) but fully covered by the overlay (z 3),
   `#searchBack` `display:none`.
9. **Desktop armour** — resize to **1280×800**, reload, repeat step 1 + type
   `Belkacem` + Enter. Observed: overlay element `hidden = false` but
   computed `display: none` (base armour `styles.css:131-133`), `#searchBack`
   `display: none` — the defect is narrow-only.
10. Re-run `node --test` after any change: **127 tests, 127 pass, 0 fail**
    (see the pinned-test inventory the Maintainer will need — reported
    separately in this issue's Repro/Observed notes: the load-bearing pins are
    `test/teacher-daygroups.test.js:525-543` (base-armour literals
    `#searchBack { display: none; }`, `#searchOverlay { display: none; }`,
    narrow `#layout.is-list #searchBack` + `#searchOverlay:not([hidden])`,
    and the absence of `#searchWrap:focus-within #searchBack`),
    `:398-410` (pane-swap literals + **no `@media (pointer: coarse)` anywhere
    in CSS**), `test/classes.test.js:475` (full-CSS literal
    `#searchWrap:focus-within:has(#searchClear:not([hidden])) #searchClear`),
    `test/classes.test.js:633-663` (narrow-slice literals
    `#layout:not(.is-list) #classList`, `#classList { max-width: none;`),
    `test/teacher-daygroups.test.js:302-390` (day-group CSS pins — `indexOf`
    first-occurrence slices, unaffected by edits in the `#search` area),
    `test/fusion.test.js:283-290` (`#detail .summary` / `#detail em` stay
    absent), and the markup pins `test/teacher-daygroups.test.js:526-530`
    (`index.html` must keep `id="searchBack"`, `id="searchOverlay"`,
    `id="overlayClear"`, `id="overlayName"` and must not regain
    `id="searchDone"`).

## Discussion

### Maintainer decision (2026-10-20)

**Verdict — valid, in scope, narrow-only, teachers page only.** The Reporter's
measurements stand as the evidence base (computed-style table, rect identity
overlay==input, corner pixel counts 144–189 vs control 0–4, the
focus-impossibility proof, the 127/127 baseline — re-verified in this
worktree before this entry). The user's two asks are adopted verbatim;
ambiguity rulings, all binding:

1. **"Same style as the input box" = box-chrome parity with `#searchWrap`,
   and the parity delta is `border-radius` only.** The overlay already
   carries the wrap's background (same `--md-surface-container-lowest` var,
   Reporter table row 3). The wrap keeps its border and its `:focus-within`
   glow; the overlay repeats neither (argued under direction).
2. **"Input box invisible" = `visibility: hidden` on `#search`, keyed on the
   overlay's `hidden` attribute via `:has()`, inside the narrow media block.**
   Never keyed on focus/blur.
3. **Scope: `#search` only.** `#ghost` and `#searchClear` get no rules
   (argued under direction).
4. **Zero JS diff.** `syncOverlay()` (`js/teachers.js:194-197`) stays the
   single writer of `hidden`; CSS derives everything from that one fact.

**Architectural direction**

*Box parity* — add `border-radius: 8px;` inside the existing
`#searchOverlay:not([hidden])` rule (`styles.css:562-567`); nothing else
changes there.

- **Literal `8px`, not `inherit`, not a shared custom property.** This repo
  pins CSS by source literal (e.g. `test/classes.test.js:475`) and already
  duplicates the background var literally in both rules — repetition is the
  established convention and it is *testable*: with `8px` in both places a
  future divergence turns a pin red, whereas `inherit` pins as the word
  `inherit` (asserts no value; a wrap-radius refactor would silently unround
  the overlay with all tests green) and a two-use `--box-radius` token adds
  indirection without removing any real duplication. `8px` also satisfies the
  geometric safety invariant with margin: the overlay fills the wrap's
  *padding* box, whose inner radius is 8 − 1 = 7px; any overlay radius ≥ 7
  leaves only white-on-white between the overlay's arc and the wrap's border
  stroke (identical background var → invisible sliver), while a radius < 7
  (today: 0) paints white over the gray arc — the bug itself. Matching the
  wrap's declared 8px reads as "the same box" and survives a future
  border-width change without encoding the subtraction.
- **No repeated 1px border on the overlay.** The overlay sits ON the wrap's
  padding box — inset exactly 1px by the wrap's border (Reporter geometry).
  A border on the overlay draws a second stroke inside the wrap's stroke: a
  double frame, the opposite of parity.
- **The wrap's border is NOT dropped or made transparent under the
  overlay.** Rejected three ways: (a) inverted coupling — an ancestor's
  chrome special-cased on a descendant's state; (b) the border is what
  defines the box against the near-white page background (`rgb(249,249,255)`);
  a transparent border makes the box edge vanish — a visual regression, not
  an improvement; (c) it perturbs the `:focus-within` glow pairing
  (`border-color` + `box-shadow`, `styles.css:92-95`) for zero visual gain.
  Giving the overlay the frame (radius) instead of destroying the frame is
  the composition that needs no special case.

*Input invisibility* — one rule, in the FIRST `@media (max-width: 700px)`
block (`styles.css:489`), directly after the overlay rule:

```css
#searchWrap:has(#searchOverlay:not([hidden])) #search { visibility: hidden; }
```

- **Mechanism: `:has()` + the `hidden` attribute** — the same composition the
  repo already uses at `styles.css:611,616`. `syncOverlay()` is the
  overlay's single writer, so the rule is in lockstep by construction with no
  second state writer. A JS class (`syncOverlay` also toggling a wrap/input
  class) is rejected: two writers of one fact, a grown JS surface for a pure
  presentation concern.
- **Never focus-keyed.** A focus-keyed rule desyncs on the measured
  outside-tap in state=list (Reporter §4: blur writes nothing; overlay stays
  hidden while the input is also blurred — the input would go invisible with
  no overlay). The attribute is the state.
- **`visibility`, not `opacity`, never `display:none`.** `display:none`
  removes the input from flow — the wrap's 40.38px height IS the input's
  height (the overlay is `position:absolute`, out of flow) — so it collapses
  the box to its 2px border: layout shift + destroyed box, the opposite of
  "convincing". `opacity: 0` leaves the input hit-testable and in the
  accessibility tree and would still paint a caret if focus ever arrived.
  `visibility: hidden` removes text/caret/hit-testing/a11y while keeping the
  exact layout box; un-hide is the same style recalc as the overlay's hide —
  no transition, no compositing.
- **Narrow-block placement is mandatory — a base-level rule is a desktop
  landmine.** Reporter §5 measured state=teacher reachable at 1280×800 with
  the overlay element `hidden = false` but computed `display: none` (base
  armour `styles.css:133`). The `:has` keys on the ATTRIBUTE, not on
  rendering: at base level it would match on desktop and hide the input with
  nothing covering it. Narrow-only placement makes desktop unable to match —
  the declaration does not exist >700px.
- **Un-hide is automatic and exact.** Overlay tap → `openMenu()` sets
  `hidden` (`js/teachers.js:605-607`) → the `:has` match drops →
  `search.focus()` runs in the same tick; the recalc precedes any paint, so
  no frame shows a hidden focused input and no flash is possible. The input's
  layout box never changes (visibility is paint-only) → zero layout shift on
  hide and un-hide.

*Scope: `#ghost` and `#searchClear` get no rules.* Both are provably
non-visible in state=teacher by measured fact, not by luck: `#ghost` is
`[hidden]` (own display:none, `styles.css:105`), empty, z 0, and the blur
handler clears it (`js/teachers.js:594-597`) — state=teacher implies an
unfocused input (Reporter §4: every focus path hides the overlay
synchronously), so it structurally cannot render under the overlay.
`#searchClear` is z 2 < overlay z 3, its rect lies entirely inside the
overlay's, the overlay is opaque, and taps land on the overlay (Reporter §4).
Rules for either would be armor against measured-impossible states — the
special-case pile-up this project rejects; if a future change moves
z-indices or the ghost lifecycle, that change must revisit this rule (see
Risks).

*Tests* — extend the existing test `teachers nav chrome: state-gated back
arrow, teacher overlay, V gone` (`test/teacher-daygroups.test.js:525-543`);
it already guards exactly this rule family, so the invariants stay in one
place. **No new `test()` block → expected `node --test` total stays 127**
(baseline re-verified here). No computed-style node assertion: CSS has no
engine in node; the computed-style check is the browser verification below
(house precedent: issue 056's implementer ran a Playwright walk; the
Reporter measured via Playwright MCP).

**Acceptance criteria (for a blind implementer; exact literals)**

1. `styles.css`, FIRST `@media (max-width: 700px)` block, at the
   `#searchOverlay:not([hidden])` rule: add `border-radius: 8px;` inside
   that existing rule's block, and immediately after it add (one-line comment
   allowed) `#searchWrap:has(#searchOverlay:not([hidden])) #search { visibility: hidden; }`.
   No other CSS change anywhere. No JS change at all (`js/teachers.js`
   byte-identical to base).
2. `test/teacher-daygroups.test.js`, assertions appended INSIDE the existing
   test at :525-543 (no new `test()`):
   a. radius pin — slice the existing `narrow` var from
      `narrow.indexOf('#searchOverlay:not([hidden])')` to the next `'}'` and
      assert that slice contains `border-radius: 8px`;
   b. hide-rule pin — assert
      `narrow.indexOf('#searchWrap:has(#searchOverlay:not([hidden])) #search') !== -1`;
   c. narrow-only pin — assert the first index of that selector in `CSS_SRC`
      is `> CSS_SRC.indexOf('@media (max-width: 700px)')` (the rule must
      never exist at base level — desktop-blackout guard);
   d. anti-focus pin (extends the anti-D4 family at :541) — assert
      `CSS_SRC.indexOf('#searchWrap:focus-within #search') === -1`, message:
      the input hide keys on the overlay attribute, never on focus.
3. `node --test` → **exactly 127 tests, 127 pass, 0 fail**; every pin listed
   in Repro step 10 stays green untouched (`classes.test.js:475,633-663`
   included — additive rules don't disturb presence-pins; do not edit them).
4. Browser verification (Playwright MCP, Chromium; serve with
   `python3 -m http.server` on a free port, record the PID, kill by PID
   afterwards — never `pkill -f`):
   a. viewport **390×844**, enter state=teacher exactly as Repro step 1 (tap
      `#search`, tap row "Abdelhafidh"). Computed styles: `#searchOverlay`
      `border-radius: 8px` (was `0px`); `#search` `visibility: hidden` (was
      `visible`); `#searchWrap` rect identical to the Reporter's baseline
      within 0.5px (x 12.80, y 151.56, w 349.41, h 40.38 — no layout shift);
      `#searchClear` still `display:flex` with filter text (untouched, only
      not painted over).
   b. Corner re-count with the Reporter's exact method (Repro step 5,
      `zoom = '6'`, 72×72 corner squares): white-outside-rounded-outline
      pixels per corner in state=teacher must fall from the Reporter's
      **144/166/166/189** to the control noise band (**≈0–4** per corner).
      Cite the four numbers.
   c. Overlay tap (`#overlayName`): overlay `hidden = true`,
      `activeElement = search`, `#search` computed `visibility: visible`,
      wrap rect byte-identical before vs after; no flash (single recalc; a
      before/after screenshot pair suffices if in doubt).
   d. Transitions: teacher → overlay tap (list) → `#searchBack` → teacher
      again: input hidden again; outside-tap blur while in state=list: input
      stays `visible` (D4-desync guard).
   e. Filter-text variant (Repro step 8): `Bel` + Enter → state=teacher,
      input `visibility: hidden`; `elementsFromPoint` at a `#searchClear`
      interior point still returns `#searchOverlay` on top (clear stays
      covered, no bleed).
   f. Desktop **1280×800**: repeat step 1 + `Belkacem` + Enter → overlay
      element `hidden = false`, computed `display: none` (armour), and
      **`#search` `visibility: visible`** (narrow-only proof).
   g. `classes.html` at 390×844: focus its filter, type — input visible,
      unchanged behavior (the `:has` cannot match: no `#searchOverlay`
      element in that page's markup).
   h. Console: 0 JS errors across the whole walk (favicon 404 excepted).
   i. `curl -s -o /dev/null -w '%{http_code}'` → 200 for `/index.html`,
      `/classes.html`, `/styles.css`, `/js/teachers.js`; kill the server by
      its recorded PID.
5. Append a `### Fix implemented` entry with the exact diff and results.
   Diff hygiene: only `styles.css`, `test/teacher-daygroups.test.js` and
   this issue file. **No-go**: no JS edits; no base-level (outside-media)
   copy of the hide rule; no `border` on the overlay; no
   `display:none`/`opacity` on the input; no edits to the wrap border/glow
   (`styles.css:87-95`); no ghost/clear/suggest/`#searchDone` CSS edits; no
   `@media (pointer: coarse)`; no new/renamed/removed pins; no edits inside
   the classes-page narrow block (`styles.css:781+`); no third media block.

**Risks / constraints**

- **Desktop input blackout** if the hide rule lands at base level (attribute
  matches while the armour forces `display:none`) — the one failure mode
  that turns this fix into a critical bug; guarded by criterion 2c's pin and
  4f's walk.
- **Double frame** if the overlay gets a border; **box collapse** if the
  input gets `display:none` — both rejected above; 4a's rect assertion
  catches collapse, 4b's corner count catches frame artifacts.
- The `:focus-within` glow and the back-arrow state gating must stay
  byte-untouched (pins at `test/teacher-daygroups.test.js:541-542`,
  `test/classes.test.js:475`).
- The narrow-slice test convention slices from the FIRST
  `@media (max-width: 700px)` (`styles.css:489`); the new rules go in that
  first block so every new assertion lands inside the existing `narrow` var —
  do not open a third media block.
- Invariant for future work: state=teacher still implies an unfocused input
  (Reporter §4). If a future issue ever lets focus coexist with the overlay,
  re-audit this rule — it would then also hide a legitimately focused input.

### Fix implemented (2026-10-20)

Implementer, in this worktree (uncommitted; the main agent merges). Files
touched: `styles.css`, `test/teacher-daygroups.test.js`, this issue file —
verified by content-comparing the whole worktree against the base
(`diff -rq`, no other file differs; `js/teachers.js` and `index.html`
byte-identical to base).

**Exact unified diff** (`diff -u` against base):

```diff
--- base/styles.css
+++ styles.css
@@ -563,8 +563,11 @@
     position: absolute; left: 0; top: 0; right: 0; bottom: 0; z-index: 3;
     display: flex; align-items: center;
     background: var(--md-surface-container-lowest, #fff);
+    border-radius: 8px;
     padding: .45rem .6rem; cursor: pointer;
   }
+  /* issue 057: while the overlay is the box, the input under it is invisible — keyed on the overlay's attribute, never on focus */
+  #searchWrap:has(#searchOverlay:not([hidden])) #search { visibility: hidden; }
   /* the deselect X reuses the #searchClear slot look, at the overlay's left */
   #overlayClear {
     flex: 0 0 auto; width: 2.7rem; align-self: stretch;
--- base/test/teacher-daygroups.test.js
+++ test/teacher-daygroups.test.js
@@ -540,6 +540,19 @@
     'overlay renders from its attribute on narrow screens');
   assert.ok(CSS_SRC.indexOf('#searchWrap:focus-within #searchBack') === -1,
     'the back control must never be focus-gated (anti-D4 regression pin)');
+  // issue 057: the overlay matches the wrap's box chrome (radius only) and the
+  // input under it goes invisible, keyed on the overlay's attribute
+  var ovAt = narrow.indexOf('#searchOverlay:not([hidden])');
+  var ovRule = narrow.slice(ovAt, narrow.indexOf('}', ovAt));
+  assert.ok(ovRule.indexOf('border-radius: 8px') !== -1,
+    'overlay takes the wrap 8px radius (square corners over the rounded box = issue 057)');
+  assert.ok(narrow.indexOf('#searchWrap:has(#searchOverlay:not([hidden])) #search') !== -1,
+    'the input hides while the overlay shows (narrow block)');
+  assert.ok(CSS_SRC.indexOf('#searchWrap:has(#searchOverlay:not([hidden])) #search')
+    > CSS_SRC.indexOf('@media (max-width: 700px)'),
+    'the input-hide rule must stay narrow-only (a base-level copy would blank the desktop input)');
+  assert.ok(CSS_SRC.indexOf('#searchWrap:focus-within #search ') === -1,
+    'the input hide keys on the overlay attribute, never on focus');
 });
 
 test('nav machine: single selection/empty funnels, harness-safe showTeacher', function () {
```

**One deviation, criterion 2d — reported for adjudication.** The criteria's
exact literal `CSS_SRC.indexOf('#searchWrap:focus-within #search') === -1`
cannot pass against the mandated-untouched CSS: the string
`#searchWrap:focus-within #search` is a **prefix substring** of the existing
base rule `#searchWrap:focus-within #searchDone { display: flex; }`
(`styles.css:527`, first occurrence at byte 30330 of base — verified in node),
so the literal assertion returns that index, not `-1`. Making it green would
require editing the `#searchDone` rule or deleting a pin — both no-go under
criterion 5 and impossible under criterion 3 (127 green). The implementer's
mandate says to stop and report self-contradictory criteria; since the intent
is unambiguous (no focus-keyed `#search` rule exists anywhere), the pin was
implemented token-complete instead — trailing space closes the selector token:

```js
assert.ok(CSS_SRC.indexOf('#searchWrap:focus-within #search ') === -1,
  'the input hide keys on the overlay attribute, never on focus');
```

`-1` on base CSS (so the pin is vacuously true there, exactly as intended),
and `-1` after the fix (the new `:has` rule keys on the attribute). Same
message, same semantics, same location inside the existing test. If the
maintainer prefers a different delimiter it is a one-character edit.

**Acceptance-criteria checklist**

- [x] **1** — `border-radius: 8px;` added INSIDE the existing
  `#searchOverlay:not([hidden])` block (no new selector for it, no border on
  the overlay, wrap border/glow untouched at `styles.css:87-95`); the
  `:has(...)` hide rule added immediately after that rule, one-line comment,
  inside the FIRST `@media (max-width: 700px)` block — nothing else in CSS
  changed; `js/teachers.js` byte-identical to base (zero JS diff, `index.html`
  byte-identical too).
- [x] **2** — all four pins appended INSIDE the existing
  `teachers nav chrome` test (no new `test()`): 2a radius literal sliced from
  `narrow.indexOf('#searchOverlay:not([hidden])')` to the next `}`; 2b
  `:has` rule literal in `narrow`; 2c narrow-only position pin
  (`indexOf(...) > CSS_SRC.indexOf('@media (max-width: 700px)')`); 2d
  anti-`focus-within` pin — implemented with the token-completing trailing
  space (deviation above).
- [x] **3** — `node --test` **and** `node --test test/*.test.js`: baseline
  re-verified first at 127/127/0, after the change 127/127/0 both ways; no
  existing pin edited (`classes.test.js`, the day-group pins, the markup
  pins, the anti-D4 pins all untouched).
- [x] **4a** — Playwright MCP Chromium, 390×844, state=teacher entered exactly
  as Repro step 1 (tap `#search`, tap `#teacherList li[data-name="Abdelhafidh"]`):
  overlay computed `border-radius: 8px` (was `0px`), background
  `rgb(255,255,255)`, border `0px`; `#search` computed `visibility: hidden`
  (was `visible`), `display: inline-block`, `opacity: 1` (not `display:none`,
  not opacity); `#searchWrap` rect **12.80, 151.56, 349.41, 40.38** —
  identical to the Reporter's baseline (Δ0.00px ≤ 0.5px, no layout shift);
  `#searchClear` with filter text still `display: flex` (untouched, only
  covered); wrap border `1px solid rgb(196,198,208)` and glow `none` intact.
- [x] **4b** — Reporter's exact method (`document.body.style.zoom = '6'`,
  `scrollIntoView`, viewport screenshot, 72×72 corner squares, pure white
  `rgb(255,255,255)` counted outside the analytic rounded outline; zoom-6
  border bbox `(76.8,293.56)–(298.2,535.94)` = Reporter's `(77,294)–(297,535)`):
  state=teacher post-fix **TL 0, TR 0, BL 0, BR 0** (was 144/166/166/189) —
  below even the control band 0–4; same-batch control (overlay hidden, zoom 6)
  **0/0/0/0** (Reporter's control: 0/2/2/4). Shots:
  `.playwright-mcp/057-fix-corner-zoom6-teacher.png`,
  `.playwright-mcp/057-fix-corner-zoom6-control.png`.
- [x] **4c** — overlay tap (`#overlayName`): `overlay.hidden = true`,
  `is-list` set, `activeElement = search`, `#search` computed
  `visibility: visible`, wrap glow back
  (`rgb(216,226,255) 0 0 0 2px`); wrap rect before vs after the tap
  byte-identical: `12.796875,151.5625,349.40625,40.375` both.
- [x] **4d** — teacher → overlay tap (list) → `#searchBack` → teacher again:
  overlay shown with "Abdelhafidh", input `visibility: hidden` again,
  `activeElement = BODY`; outside-tap blur while in state=list (tap on the
  fixed `#themeCycle` button — no list-row tap, which would select): blur
  happened (`activeElement = themeCycle`), `is-list` still true, overlay still
  hidden, input `visibility: visible` — D4-desync guard holds.
- [x] **4e** — filter-text variant: `Bel` + Enter → `#search.value =
  "Belkacem"` preserved, overlay shown ("Belkacem"), input `visibility:
  hidden`, `#searchClear` still `hidden:false, display:flex`;
  `elementsFromPoint` at the clear's interior centre → top of stack is the
  overlay's own chevron svg with `#searchOverlay` (z 3) directly above
  `#searchClear` (z 2): clear stays covered, no bleed.
- [x] **4f** — desktop 1280×800 (`matchMedia('(max-width:700px)') = false`),
  state=teacher reached (type `Belkacem` + Enter): overlay element
  `hidden = false`, computed `display: none` (base armour), and **`#search`
  `visibility: visible`** — narrow-only placement confirmed; no desktop
  blackout.
- [x] **4g** — `classes.html` at 390×844: no `#searchOverlay` element in the
  markup (the `:has` cannot match); filter focused and `GLSI` typed: input
  `visibility: visible` throughout, menu opens (`is-list`), 16 matching rows
  rendered — behavior unchanged.
- [x] **4h** — console across the whole walk: **0 JS errors** (single entry in
  the browser session's console log is a favicon 404 from an earlier,
  different-port session — excepted by the criterion; my walk's own requests
  are clean).
- [x] **4i** — `curl` → **200** for `/index.html`, `/classes.html`,
  `/styles.css`, `/js/teachers.js` (checked at walk start and after);
  `python3 -m http.server 8085` (PID recorded in `/tmp/opencode/http057-fix.pid`)
  **killed by PID** and confirmed dead.
- [x] **5** — entry appended with the exact diff and results; diff hygiene
  verified against base: only `styles.css`, `test/teacher-daygroups.test.js`
  and this issue file differ. All no-go items respected: no JS edits; no
  base-level copy of the hide rule; no `border` on the overlay; no
  `display:none`/`opacity` on the input; wrap border/glow untouched; no
  ghost/clear/suggest/`#searchDone` CSS edits; no `@media (pointer: coarse)`;
  no pin added/renamed/removed outside the four appended; nothing inside the
  classes-page narrow block; no third media block.


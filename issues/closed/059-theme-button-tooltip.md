# 059: Theme button tooltip with the colorscheme name

- Status: Fixed
- Date: 2026-10-20, Reporter: user

## Description

**Request (user, verbatim):**

> Hovering over the theme switching button should show a tooltip with the colorscheme name

**Observed (verified in headless Chromium at 1280×800, served over HTTP at
HEAD c520a0e):**

- The theme switching button is `#themeCycle`, present on all four pages as
  `<button type="button" id="themeCycle" title="Cycle color preset"
  aria-label="Cycle color preset"></button>` — `index.html:35`,
  `classes.html:36`, `time.html:11`, `timetable.html:11` (markup duplicated
  per page; there is no shared head include).
- After `js/theme.js` initialises, the button's native tooltip **already
  contains the colorscheme name**: measured `title`/`aria-label` on every page
  = `"Theme: ISIM Blue — click to change"` (the current preset, with a
  `"Theme: "` prefix and `" — click to change"` suffix — not the bare name).
  Written by `js/theme.js:931-938` inside `applyState()`:
  `var desc = 'Theme: ' + p.name + ' — click to change';` then
  `btnEl.setAttribute('title', desc); btnEl.setAttribute('aria-label', desc);`.
- The tooltip **follows the scheme as it changes**: measured by clicking the
  button — `ISIM Blue` → `Indigo` → `Green`; the persisted choice also carries
  across pages (on `timetable.html` the tooltip read
  `"Theme: Ember — click to change"` from `localStorage['emplois-theme']`).
- Hover itself adds nothing new: `#themeCycle:hover` only applies
  `filter: brightness(.94)` (`styles.css:83`). The button is an empty 24×24
  palette square (`textContent` is `""`; `styles.css:66-82`) — the button shows
  **no scheme name visually**, so the tooltip is the only place the name can
  appear. `theme.js:951` looks for a `#themeName` label element
  (`labelEl = document.getElementById('themeName')`), but **no page defines
  `id="themeName"`** (verified: grep over all HTML) — `labelEl` is always null,
  a dead path.
- The only defect-shaped gap found: **before JS runs, or if `js/theme.js` is
  blocked/fails**, the static markup's generic, scheme-less strings are what
  hover shows — `"Cycle color preset"` (all four pages, lines above).
- No custom tooltip infrastructure exists: grep of `styles.css` for
  `tooltip` / `attr(title)` → nothing. Any tooltip the user sees is the native
  `title` attribute.

**Schemes (verified):** `Theme.PRESETS` holds **15 named presets**
(`js/theme.js:691-707`), exact literals in cycle order:

`'Monochrome'`, `'ISIM Blue'`, `'Indigo'`, `'Green'`, `'Ember'`, `'Teal'`,
`'Tachiyomi Blue'`, `'Minus Purple'`, `'Minus Pink'`, `'Strawberry'`,
`'Green Apple'`, `'Minus Orange'`, `'Minus Cyan'`, `'Minus Yellow'`,
`'Neutral Blue'`.

`buildCycleList()` (`js/theme.js:860-866`) may prepend a 16th, conditional
`{ name: 'System' }` preset when `detectSystemSeed()` finds a seed
(`js/theme.js:831-856`): measured seed `#0b4da2` on `index.html`/`classes.html`
— taken from the author `<meta name="theme-color" content="#0b4da2">`
(`index.html:8`, `classes.html:8`, which lacks `data-theme-engine` so the
engine inherits it) — and `#0075ff` on `timetable.html` via the `AccentColor`
probe. Clicking **cycles** forward with wrap-around,
`cycleIndex = (cycleIndex + 1) % cycleList.length` (`js/theme.js:955-958`); a
fresh visitor starts at `DEFAULT_PRESET = 'ISIM Blue'` (`js/theme.js:690`,
`964`) even though Monochrome is `PRESETS[0]`. Light/dark is *not* cycled by
the button — it follows `prefers-color-scheme` (`js/theme.js:924`, `966-972`).

**Ambiguity to resolve (both readings quoted):**

- Reading A — "the colorscheme name" = the **currently applied** scheme:
  *"Hovering … should show a tooltip with the colorscheme name"* →
  `title="Theme: ISIM Blue — click to change"` while ISIM Blue is active.
  **Already satisfied at HEAD** (verified on all four pages).
- Reading B — "the colorscheme name" = the scheme a click would switch **to**:
  → the tooltip should read e.g. `Indigo` while ISIM Blue is applied (hover
  promises what the click delivers). **Not implemented**; the current tooltip
  names the current scheme.
- Sub-question either way: does the user want the **bare** name (`ISIM Blue`)
  or the existing decorated string (`Theme: ISIM Blue — click to change`)?

## Root cause

No code defect was found for Reading A: at HEAD c520a0e (verified byte-identical
to the clean baseline for `js/theme.js`, `index.html`, `styles.css`),
`applyState()` already writes the current scheme's name into the button's
`title` and `aria-label` (`js/theme.js:931-938`), and it re-writes them on
every cycle step. The likeliest explanations for the report, in order:

1. **(inferred)** The user meant Reading B — hover should name the scheme the
   click switches *to* — and read the current-scheme tooltip as "not showing
   the colorscheme name" of the pending action.
2. **(verified possible)** The user hovered before `js/theme.js` ran or with JS
   blocked and saw the static fallback `"Cycle color preset"`, which names no
   scheme. The generic strings live in the four duplicated markup lines
   (`index.html:35`, `classes.html:36`, `time.html:11`, `timetable.html:11`)
   and are overwritten only after `DOMContentLoaded`.
3. **(inferred)** The user wants the bare scheme name rather than the decorated
   `"Theme: <name> — click to change"` phrasing.

Whatever is decided, the change would land in exactly two places: the four
static `title`/`aria-label` attributes in the page markup (duplicated per page —
there is no shared head), and/or the `desc` string in
`js/theme.js` `applyState()` (`js/theme.js:935`), which is the single place
that keeps the tooltip in sync with the scheme. There is no tooltip CSS or JS
infra in `styles.css` to reuse or fight (verified: none exists), and the
scheme's display-only swatch colors (`--pal-*`, `js/theme.js:775-791`,
`styles.css:73-80`) are independent of the tooltip.

**Test pins (verified against the suite, 129/129 pass at HEAD):**

- `test/classes.test.js:445` pins that `classes.html` contains
  `id="themeCycle"`; `:451-453` pins that the theme control stays a *single*
  element (`'theme-dot'` absent, `id="themeBar"` absent). Adding wrapper/spans
  around the button in `classes.html` **would** break these; editing its
  `title`/`aria-label` would not.
- `test/classes.test.js:429-431` pins the script stack of `classes.html`
  (`js/theme.js`, `js/color.js`, … must stay loaded); `:440` pins the
  `<meta name="theme-color">` presence (relevant if the "System"-preset
  inheritance behaviour were touched).
- No test pins `title="Cycle color preset"`, any `title`/`aria-label` value,
  `js/theme.js` source text, or the scheme names. `test/deadcode.test.js` pins
  only removed machinery in `js/match.js`/`js/app.js`; `test/fusion.test.js:283-289`
  pins absence of `#detail .summary` / `#detail em` in `styles.css`. None is
  disturbed by a tooltip change.

## Repro steps

1. `cd /home/user/.local/share/opencode/worktree/1de5bb/059-theme-tooltip && python3 -m http.server 8159`
2. Open `http://localhost:8159/index.html` in a desktop viewport (e.g.
   1280×800) and wait for load (`js/theme.js:979-986` auto-inits on
   `DOMContentLoaded`).
3. Hover the 24×24 palette square pinned top-right (`#themeCycle`,
   `styles.css:66`): the native tooltip reads **"Theme: ISIM Blue — click to
   change"** (fresh visitor default). Verified via the computed `title` /
   `aria-label` attributes; native tooltip *rendering* is browser chrome and not
   directly capturable in headless, but the attribute is what the browser shows.
4. Click the button: it cycles `ISIM Blue → Indigo → Green → … → Monochrome →
   System → …` (wrap-around); hover again — the tooltip always names the
   **currently applied** scheme.
5. Reload `timetable.html`: the persisted preset (`localStorage['emplois-theme']`)
   is restored and the tooltip names it (measured: "Ember").
6. To reproduce the scheme-less tooltip: block `js/theme.js` in devtools (or
   view the page before `DOMContentLoaded`) and hover the button — it reads
   **"Cycle color preset"** (static markup, `index.html:35`).

## Discussion

### Maintainer decision (2026-10-20)

**Verdict — valid request, but the defect is presentation, not information.**
Reading **A** is adopted (the tooltip names the **currently applied**
colorscheme — that is what "the colorscheme name" means for a cycler button),
and the deliverable is **a custom, Material-styled tooltip** that renders the
existing description string instantly and visibly on hover/focus. Reading A's
literal DOM condition was already true at HEAD (Reporter-measured
`title="Theme: ISIM Blue — click to change"`), so this entry states plainly
what the user's words are worth at the pixel level: **the native `title`
tooltip already contained the name, but it is unstyled browser chrome that
needs a ~1s dwell, is suppressed by some browsers/configs, and is dead ("Cycle
color preset", no scheme name) until `js/theme.js` runs — for this user, whose
reports 057/058 show they judge by what is visibly on screen, that does not
read as "a tooltip with the colorscheme name".** The fix makes the literal ask
true in the way this project's own bar ("convincing", issue 057) demands:
a styled `--md-*` bubble that appears immediately, in the site's design
language, on all four pages. As hardening it also kills the dead `#themeName`
path and removes the pre-JS string gap from the *post-JS* experience by
construction (native `title` is retired once the styled tooltip exists, kept
only as the honest no-JS fallback in the static markup).

**Architectural direction**

*Chosen design (one string, one attribute, zero markup, zero new DOM):*

- The description string **stays byte-identical**: `'Theme: ' + p.name +
  ' — click to change'` (`js/theme.js:935`). The complaint is visibility, not
  wording; the string already contains the name; one string serves both the
  visual tooltip and `aria-label`, so they cannot drift; a rewording remains a
  one-line follow-up if the user wants it.
- `applyState()` (`js/theme.js:934-938`) writes the description into
  `aria-label` (unchanged a11y behavior) and into a new **`data-tip`**
  attribute, and **stops writing `title`**. `init()` removes the static
  `title` once (`btn.removeAttribute('title')`), so no browser can show the
  native tooltip after the styled one exists — no double tooltip, ever.
- The bubble is a **`#themeCycle::after` pseudo-element** styled in CSS with
  `content: attr(data-tip, none)`. Pseudo-element, not a child `<span>`: the
  button stays literally the one element the CSS comment at `styles.css:62-65`
  and the pins at `test/classes.test.js:451-453` protect — the spirit of "the
  palette square itself is the button" survives intact, with no wrapper, no
  span, and no new node for JS to manage.
- Tokens: `background: var(--md-inverse-surface, …)`, `color:
  var(--md-inverse-on-surface, …)` — the Material 3 tooltip roles, which the
  engine already publishes (`ROLE_ORDER`, `js/theme.js:506`) and which retheme
  automatically in dark mode; 4px radius (the button's own radius, M3
  extra-small shape); `z-index: 20` (above every current consumer — max in the
  sheet is `#suggest`'s 10, `styles.css:135`); `pointer-events: none`;
  `white-space: nowrap`; positioned `top: calc(100% + 6px); right: 0` relative
  to the button (the button is its own containing block) so it drops
  below-left of the corner and can never clip off-viewport.
- Show rules: base pseudo `visibility: hidden`; flip visible on
  `#themeCycle:hover::after` **wrapped in `@media (hover: hover)`** (mobile
  taps leave a sticky `:hover`; `pointer: coarse` is pinned absent at
  `test/teacher-daygroups.test.js:408`, `hover: hover` is unpinned and is the
  correct axis for this bug), and on `#themeCycle:focus-visible::after` at
  base level (keyboard parity; pointer taps don't set `:focus-visible` on
  buttons).
- Gotchas the Implementer must handle explicitly (all measured): the button
  has `line-height: 0` (`styles.css:68`) — the pseudo must declare its own
  line-height; buttons don't inherit the body font — the pseudo must declare
  `font-family: system-ui, sans-serif` (literal duplication of `styles.css:26`,
  per the house "duplicate the literal, it is testable" convention from 057).
- JS edits are confined to `js/theme.js`: delete the dead path
  (`var labelEl` at `:915`, `labelEl = document.getElementById('themeName')` at
  `:951`, `if (labelEl) labelEl.textContent = p.name;` at `:931` — no page ever
  defined `#themeName`, so this has been a no-op since it was written), drop
  the `title` write, add the `data-tip` write, add the one-time
  `removeAttribute('title')` in `init()`, refresh the comment at `:932-933`.

*Argued rejections:*

- **No-op (status quo is fine)** — rejected. Technically defensible under
  Reading A, but it would ship nothing a user can see. The native tooltip's
  ~1s dwell, its suppression by some browsers, and the scheme-less pre-JS
  string are exactly the surfaces this user reports from. A maintainer answer
  that the ask was "already satisfied" while the visible experience stays
  byte-identical is a non-answer.
- **Reading B (tooltip names the next preset)** — rejected. The button is a
  cycler through 15-16 presets, not a picker: "next: Indigo" is trivia, while
  "current: ISIM Blue" answers the real question "what is this look called?".
  `aria-label` must describe the control's current state, not a preview of its
  effect; and Reading B would silently invert measured behavior the code
  deliberately chose (comment at `js/theme.js:932-933`) with no evidence the
  user wanted it.
- **Revive `#themeName` as a visible label element** — rejected. The button's
  design is the bare palette square (single-element comment, `styles.css:62-65`);
  a label element means markup churn on all four duplicated pages, a new
  layout/pin surface, and a design change the user never asked for. The dead
  path gets deleted, and pinned dead (issue 055's deadcode convention).
- **`content: attr(title)`** — rejected: the `title` attribute would still
  trigger the native tooltip on the same hover — double tooltip. Hence
  `data-tip` + `removeAttribute('title')`.
- **JS-built `<span>` appended to the button** — rejected: works, but the
  pseudo-element delivers the identical visual with zero DOM growth and keeps
  the one-element invariant literally true, not just test-true.
- **A transition/fade-in** — rejected: `styles.css` contains zero transitions;
  the first one in the repo would be a special case needing a
  `prefers-reduced-motion` story for no user benefit over instant appearance.
- **Two-line "current → next" bubble, or a swatch dot inside it** — rejected as
  scope creep; the ask is "a tooltip with the colorscheme name".

**Acceptance criteria (for a blind implementer; numbered)**

1. **`js/theme.js`** — exactly these edits, nothing else:
   a. delete `var labelEl = null;` (line 915) and its assignment
   `labelEl = document.getElementById('themeName');` (line 951);
   b. in `applyState()`, replace the `if (btnEl) { … }` block (lines 934-938)
   with: `var desc = 'Theme: ' + p.name + ' — click to change';` then
   `btnEl.setAttribute('aria-label', desc);` then `btnEl.setAttribute('data-tip', desc);` —
   the `title` write and the `labelEl.textContent` line are gone; the em-dash
   string bytes are unchanged;
   c. in `init()`, immediately after `btnEl = btn;` add
   `btn.removeAttribute('title');` (with a one-line comment: the styled
   `::after` tooltip owns hover after init; `title` survives only in the
   static markup as the no-JS fallback);
   d. update the comment above the block (`js/theme.js:932-933`) to say the
   description now feeds `aria-label` and the CSS tooltip (`data-tip`), and
   the native `title` is retired after init. No other JS file changes:
   `js/color.js`, `js/app.js`, `js/classes.js` etc. stay byte-identical.
2. **All four HTML pages** (`index.html`, `classes.html`, `time.html`,
   `timetable.html`) stay **byte-identical to base** — zero markup diff. The
   static `title="Cycle color preset"` / `aria-label="Cycle color preset"`
   remain the no-JS/pre-JS fallback (honest: without JS no named preset is
   applied; the conic fallback colors are curated solids, not a scheme).
3. **`styles.css`** — one new rule block directly after `#themeCycle:focus-visible`
   (line 84), inside the base stylesheet, in this shape (exact selectors and
   declarations; comments at implementer's discretion):
   ```css
   #themeCycle::after {
     content: attr(data-tip, none);
     position: absolute; top: calc(100% + 6px); right: 0;
     visibility: hidden; pointer-events: none; z-index: 20;
     white-space: nowrap; border-radius: 4px; padding: .3rem .55rem;
     font: 400 .8rem/1.3 system-ui, sans-serif;
     background: var(--md-inverse-surface, #303030);
     color: var(--md-inverse-on-surface, #f5f5f5);
   }
   @media (hover: hover) { #themeCycle:hover::after { visibility: visible; } }
   #themeCycle:focus-visible::after { visibility: visible; }
   ```
   The `content: attr(data-tip, none)` fallback is the no-JS seam: attribute
   absent (pre-JS/JS-blocked) → no box at all, the native `title` shows
   instead; attribute present (post-init) → the styled bubble. No other CSS
   change anywhere; the `#themeCycle`/`:hover`/`:focus-visible` rules at
   `styles.css:66-84` stay byte-untouched.
4. **Tests** — `node --test` must go from baseline **129** (re-verified in
   this worktree 2026-10-20) to **exactly 131** (two new `test()` blocks, no
   existing assertion edited):
   a. `test/deadcode.test.js` (this file exists to keep removed surface dead):
   new `test('the dead #themeName label path stays removed (issue 059)', …)`
   asserting `readSrc('js/theme.js')` contains neither `themeName` nor
   `labelEl`;
   b. `test/classes.test.js` (the theme control's pin home is here,
   :426-454 — do not edit that test): new `test()` reading `classes.html`,
   `styles.css` and `js/theme.js` as sources, asserting: the markup still
   contains `title="Cycle color preset"` (no-JS fallback) and still no
   `id="themeName"`; the CSS contains `#themeCycle::after` whose sliced block
   (from that selector to its closing `}`) holds
   `content: attr(data-tip, none)`, `pointer-events: none`, `z-index: 20`,
   `var(--md-inverse-surface` and `var(--md-inverse-on-surface`;
   `#themeCycle:hover::after` occurs exactly once (`indexOf === lastIndexOf`)
   and at an index greater than `css.indexOf('@media (hover: hover)')` (the
   hover show is media-gated, never ungated); `js/theme.js` contains
   `setAttribute('data-tip'`, `removeAttribute('title')`,
   `setAttribute('aria-label'`, the unchanged `— click to change` literal, and
   **no** `setAttribute('title'`.
5. **Browser verification** (Playwright MCP, Chromium; serve the worktree with
   `python3 -m http.server` on a free port, record the PID in a file under
   `/tmp/opencode/`, kill by PID afterwards — never `pkill -f`):
   a. `index.html`, viewport 1280×800, fresh state (clear
   `localStorage['emplois-theme']`): after load `btn.getAttribute('title') ===
   null`, `btn.getAttribute('data-tip') === 'Theme: ISIM Blue — click to
   change'` === `btn.getAttribute('aria-label')` (fresh-visitor default);
   `getComputedStyle(btn, '::after')`: `content` is
   `"Theme: ISIM Blue — click to change"`, `visibility: hidden`, `fontFamily`
   contains `system-ui`, background is the live inverse-surface rgb;
   b. `page.hover('#themeCycle')`: `getComputedStyle(btn, '::after')
   .visibility === 'visible'`; pseudo `getBoundingClientRect` sits below the
   button (`.top >= buttonRect.bottom`) and right-aligned
   (`|pseudoRect.right − buttonRect.right| <= 1`), fully inside the viewport;
   screenshot cited;
   c. click the button once → applied scheme becomes Indigo; re-hover →
   pseudo `content` reads `"Theme: Indigo — click to change"`, `data-tip` and
   `aria-label` match; the conic square re-tints (no visual regression);
   d. keyboard: `Tab` until `#themeCycle` has focus → `:focus-visible`
   tooltip `visibility: visible`; blur → hidden;
   e. double-tooltip guard: on every state above, `btn.title` stays null —
   only the styled bubble can appear on hover;
   f. touch check: mobile viewport 390×844 with touch emulation →
   `matchMedia('(hover: hover)').matches === false`; tap the button (cycles,
   `aria-label` updates) and assert the pseudo stays `visibility: hidden`
   (no sticky tooltip);
   g. the other three pages (`classes.html`, `time.html`,
   `timetable.html`): same assertions as 5a (title retired, data-tip named —
   `timetable.html` may show the persisted preset instead of ISIM Blue) and a
   hover shows the bubble;
   h. pre-JS/no-JS contract: `curl -s` the raw `index.html` and assert the
   served bytes still contain `title="Cycle color preset"` (the node pin 4b
   covers this; the curl just confirms serving integrity);
   i. console clean (0 JS errors across the walk; favicon 404 excepted);
   j. `curl -s -o /dev/null -w '%{http_code}'` → 200 for `/index.html`,
   `/classes.html`, `/time.html`, `/timetable.html`, `/styles.css`,
   `/js/theme.js`; kill the server by its recorded PID and confirm dead.
6. **Diff hygiene** — the final diff touches only `js/theme.js`,
   `styles.css`, `test/classes.test.js`, `test/deadcode.test.js`, and
   `issues/059-theme-button-tooltip.md`. Verified by comparing the worktree
   against base (`diff -rq`, or `git status --porcelain` read-only): every
   other file, the four HTML pages included, byte-identical.
7. **No-gos**: no HTML edits of any kind (the duplicated-page convention and
   the single-element pins `test/classes.test.js:451-453` stay undisturbed);
   no `<span>`/wrapper for the tooltip; no `setAttribute('title'` anywhere in
   `js/theme.js`; no change to the description string's bytes; no
   `@media (pointer: coarse)` (pinned absent at
   `test/teacher-daygroups.test.js:408`); no transition/animation; no edits to
   the existing `#themeCycle` rules (`styles.css:66-84`), to the pin blocks
   `test/classes.test.js:426-454` / `:463-480`, or to PRESETS/cycle/
   localStorage/`syncMeta` logic; no reviving `#themeName` in markup; no
   changes to any other issue's files.
8. Append a `### Fix implemented (2026-10-20)` entry with the exact diff and
   results.

**Risks / constraints**

- **`filter: brightness(.94)` on `#themeCycle:hover`** (`styles.css:83`)
  creates a stacking context and filters the pseudo with the button — the
  tooltip is painted ~6% dimmer while hovered. Accepted as imperceptible; do
  not "fix" it by moving the filter (touching a pinned byte-region).
- **Sticky mobile `:hover`** is the one real regression vector (a tooltip
  frozen over page content after a tap); criterion 5f's media gate and check
  are the guard. If `@media (hover: hover)` were ever pinned absent (today it
  is not — only `pointer: coarse` is), this design must be revisited.
- **`content: attr(data-tip, none)`** relies on the `attr()` fallback form;
  evergreen browsers are fine. In a hypothetical pre-`attr()`-fallback browser
  the base `visibility: hidden` still suppresses any stray box — worst case
  is no styled tooltip plus the untouched native `title` — acceptable
  degradation.
- **Pre-JS window**: before `DOMContentLoaded` the hover still shows the
  generic native "Cycle color preset". By design (criterion 2): no scheme name
  can be honestly shown without JS. If a future change wants a JS-free named
  tooltip, it must reconsider what "current scheme" means without the engine.
- **Invariants to preserve**: `aria-label` keeps carrying the full
  description for assistive tech (unchanged from HEAD); `data-tip` and
  `aria-label` must always be written from the same `desc` variable in the
  same block (single source, no drift); the `title` attribute must exist in
  markup and nowhere in JS.
- **Future-work hook**: if a later issue ever adds a visible scheme label or a
  picker UI, this decision's `data-tip`/`::after` seam is the extension point
  — one attribute writer, one CSS rule; a child-element tooltip would then be
  revisited with the markup pins.

### Fix implemented (2026-10-20)

Implementer, worktree `059-theme-tooltip` (uncommitted, for the main agent to
merge). Audited the leftover edits found in the worktree against the numbered
criteria above; they matched criterion-for-criterion, so they were kept and
verified end-to-end (nothing was rewritten). `Status:` left `Open` for the main
agent.

**Exact diff vs base (c520a0e) — four files, nothing else:**

```diff
diff --git a/js/theme.js b/js/theme.js
--- a/js/theme.js
+++ b/js/theme.js
@@ -912,7 +912,6 @@
   var state = { preset: null };
   var cycleList = null;
   var cycleIndex = 0;
-  var labelEl = null;
   var btnEl = null;
   var inited = false;
 
@@ -928,13 +927,13 @@
     if (p.variant) opts.variant = p.variant;
     var theme = apply(opts);
     current.preset = p.name;
-    if (labelEl) labelEl.textContent = p.name;
-    // The visible control is now just the palette square: name the preset in
-    // the tooltip / accessible label so cycling 15 schemes stays legible.
+    // The visible control is just the palette square: the description feeds the
+    // aria-label and the CSS tooltip (data-tip); the native title is retired
+    // after init, so the styled ::after bubble is the only tooltip.
     if (btnEl) {
       var desc = 'Theme: ' + p.name + ' — click to change';
-      btnEl.setAttribute('title', desc);
       btnEl.setAttribute('aria-label', desc);
+      btnEl.setAttribute('data-tip', desc);
     }
     syncMeta(theme.surface);
     writeState(state);
@@ -948,7 +947,9 @@
     if (!btn) return null;
     inited = true;
     btnEl = btn;
-    labelEl = document.getElementById('themeName');
+    // The ::after tooltip owns hover after init; `title` survives only in the
+    // static markup, as the honest no-JS fallback.
+    btn.removeAttribute('title');
     cycleList = buildCycleList();
 
     // One button cycles the presets.
diff --git a/styles.css b/styles.css
--- a/styles.css
+++ b/styles.css
@@ -83,6 +83,23 @@
 #themeCycle:hover { filter: brightness(.94); }
 #themeCycle:focus-visible { outline: 2px solid var(--md-primary, #0b4da2); outline-offset: 2px; border-radius: 4px; }
 
+/* Styled tooltip (issue 059): ::after reads the description from data-tip
+   (written by js/theme.js), so without JS the box never forms and the static
+   title stays the no-JS fallback. The button has line-height: 0 and does not
+   inherit the body font; the `font` shorthand resets both. Hover is gated on
+   hover:hover so touch taps leave no sticky bubble. */
+#themeCycle::after {
+  content: attr(data-tip, none);
+  position: absolute; top: calc(100% + 6px); right: 0;
+  visibility: hidden; pointer-events: none; z-index: 20;
+  white-space: nowrap; border-radius: 4px; padding: .3rem .55rem;
+  font: 400 .8rem/1.3 system-ui, sans-serif;
+  background: var(--md-inverse-surface, #303030);
+  color: var(--md-inverse-on-surface, #f5f5f5);
+}
+@media (hover: hover) { #themeCycle:hover::after { visibility: visible; } }
+#themeCycle:focus-visible::after { visibility: visible; }
+
 /* ---- search + ghost text + autocomplete ---- */
 #searchWrap {
   position: relative; max-width: 40rem; margin: .8rem 0;
diff --git a/test/deadcode.test.js b/test/deadcode.test.js
--- a/test/deadcode.test.js
+++ b/test/deadcode.test.js
@@ -27,3 +27,9 @@
   assert.ok(readSrc('js/app.js').indexOf('buildIndex') === -1,
     'buildIndex must stay out of app.js');
 });
+
+test('the dead #themeName label path stays removed (issue 059)', function () {
+  var src = readSrc('js/theme.js');
+  assert.ok(src.indexOf('themeName') === -1, 'themeName must stay removed');
+  assert.ok(src.indexOf('labelEl') === -1, 'labelEl must stay removed');
+});
diff --git a/test/classes.test.js b/test/classes.test.js
--- a/test/classes.test.js
+++ b/test/classes.test.js
@@ -1163,3 +1163,39 @@
   var bootTail = src.slice(src.indexOf('// initial paint'), src.indexOf('clock.subscribe(onTick);'));
   assert.ok(bootTail.indexOf('showEmpty();') !== -1, 'boot paints through the empty funnel');
 });
+
+// ---- theme button tooltip (issue 059) --------------------------------------
+
+test('the theme button carries a media-gated data-tip tooltip (issue 059)', function () {
+  var html = readPage('classes.html');
+  var css = readPage('styles.css');
+  var src = readPage('js/theme.js');
+  // markup: the static title stays as the honest no-JS fallback, no #themeName
+  assert.ok(html.indexOf('title="Cycle color preset"') !== -1,
+    'the static no-JS title fallback must stay in the markup');
+  assert.ok(html.indexOf('id="themeName"') === -1, 'the dead #themeName label must stay absent');
+  // CSS: the ::after bubble reads its text from data-tip
+  var tipStart = css.indexOf('#themeCycle::after');
+  assert.ok(tipStart !== -1, 'missing #themeCycle::after tooltip rule');
+  var tipBlock = css.slice(tipStart, css.indexOf('}', tipStart) + 1);
+  ['content: attr(data-tip, none)', 'pointer-events: none', 'z-index: 20',
+   'var(--md-inverse-surface', 'var(--md-inverse-on-surface'].forEach(function (s) {
+    assert.ok(tipBlock.indexOf(s) !== -1, 'tooltip block missing ' + s);
+  });
+  // the hover show occurs exactly once and only inside the hover media gate
+  // (a bare :hover would leave a sticky bubble on touch taps)
+  var hov = css.indexOf('#themeCycle:hover::after');
+  assert.ok(hov !== -1, 'missing hover show rule');
+  assert.strictEqual(hov, css.lastIndexOf('#themeCycle:hover::after'),
+    'the hover show must occur exactly once');
+  assert.ok(hov > css.indexOf('@media (hover: hover)'),
+    'the hover show must come after (inside) the @media (hover: hover) gate');
+  // JS: one description feeds aria-label and data-tip; the native title is out
+  ["setAttribute('aria-label'", "setAttribute('data-tip'", "removeAttribute('title')"].forEach(function (s) {
+    assert.ok(src.indexOf(s) !== -1, 'js/theme.js missing ' + s);
+  });
+  assert.ok(src.indexOf('— click to change') !== -1,
+    'the description string bytes stay unchanged');
+  assert.ok(src.indexOf("setAttribute('title'") === -1,
+    'js/theme.js must never write the native title');
+});
```

**Criterion checklist**

- [x] 1a — `var labelEl` (915) and the `#themeName` lookup deleted; grep
  `labelEl|themeName` over `js/theme.js` → no matches.
- [x] 1b — `applyState()` block replaced: `desc` (byte-identical em-dash
  string, verified via the diff context lines), `aria-label` + `data-tip`
  writes from the one variable, `title` write and `labelEl.textContent` gone.
- [x] 1c — `btn.removeAttribute('title')` immediately after `btnEl = btn;` in
  `init()`, with the one-line rationale comment.
- [x] 1d — comment above the block updated; `grep setAttribute('title'` over
  `js/` → no matches; `diff -rq` confirms no other JS file changed.
- [x] 2 — all four HTML pages byte-identical to base (`diff -rq` lists none);
  static `title="Cycle color preset"` / `aria-label` untouched.
- [x] 3 — `#themeCycle::after` block directly after `#themeCycle:focus-visible`
  (base 84) in the exact prescribed shape; `@media (hover: hover)` gate and
  `:focus-visible` show as specified; rules 66-84 byte-untouched; no other CSS
  change (diff shows one insertion only; the 3 pre-existing `empty-hop`
  animation lines are the only `transition|animation` hits, same as base).
- [x] 4 — baseline re-verified **129/129/0** in the clean worktree; worktree
  now **131/131/0** via both `node --test` and `node --test test/*.test.js`
  (two new `test()` blocks appended; no existing assertion edited); pin blocks
  `test/classes.test.js:426-454`/`:463-480` untouched (append-only diff).
- [x] 5 — browser walk (Playwright MCP, Chromium), all recorded below.
- [x] 6 — `diff -rq` vs base: only `js/theme.js`, `styles.css`,
  `test/classes.test.js`, `test/deadcode.test.js` differ; the issue file is the
  fifth and last intended path (the `.playwright-mcp` entry on the base side is
  a stale artifact dir in the clean worktree, absent here).
- [x] 7 — no HTML edits; no `<span>`/wrapper (pseudo-element only);
  `setAttribute('title'` absent from `js/theme.js`; description bytes
  unchanged; `grep 'pointer: coarse' styles.css` → 0; no transition/animation;
  `#themeCycle` rules, pin blocks, PRESETS/cycle/localStorage/`syncMeta`
  logic untouched; `#themeName` still absent from markup; no other issue's
  files touched.
- [x] 8 — this entry.

**Verification results**

- Tests: clean/base **129/129/0**; worktree **131/131/0** (`node --test`) and
  **131/131/0** (`node --test test/*.test.js`), fail 0 / cancelled 0 / skipped 0.
- Browser (server `python3 -m http.server 8159 --bind 127.0.0.1`, PID recorded
  in `/tmp/opencode/059-server.pid`, killed by PID afterwards, confirmed dead):
  - 5a index.html @1280×800, fresh (`localStorage['emplois-theme']` cleared,
    reloaded): `title` → `null`; `data-tip` = `aria-label` =
    `'Theme: ISIM Blue — click to change'`; `::after` computed
    `content: "Theme: ISIM Blue — click to change"`, `visibility: hidden`,
    `font-family: system-ui, sans-serif`, background `rgb(47, 48, 54)` = live
    `--md-inverse-surface` (`#2F3036`), radius 4px, z-index 20,
    `pointer-events: none`, `nowrap`; `(hover: hover)` true.
  - 5b hover → `visibility: visible`; pseudo top 54.8px ≥ button bottom 48.8px
    (drops below), right edge 376px = button right (|Δ| = 0 ≤ 1), fully inside
    1280×800; screenshots `/tmp/opencode/059-index-hover.png`,
    `/tmp/opencode/059-index-hover-indigo.png`.
  - 5c click → Indigo applied (`--md-primary` `#65558F`, `--pal-primary`
    `#6a4c93`, conic square re-tinted, gradient intact); re-hover →
    `content`/`data-tip`/`aria-label` all `'Theme: Indigo — click to change'`.
  - 5d keyboard: Tab ×5 → `#themeCycle` focused with `:focus-visible`,
    tooltip `visible`; blur → `hidden`.
  - 5e double-tooltip guard: `title` stayed `null` in every state above.
  - 5f touch: 390×844 + CDP touch emulation → `(hover: hover)` false,
    `(pointer: coarse)` true; real `touchStart/touchEnd` tap on the button
    cycled the scheme (Indigo → Green, `aria-label`/`data-tip` updated) and the
    pseudo stayed `visibility: hidden` — no sticky tooltip
    (`/tmp/opencode/059-mobile-tap.png`).
  - 5g classes.html / time.html / timetable.html: `title` retired (`null`),
    `data-tip` = `aria-label` with the persisted preset
    (`'Theme: Green — click to change'` — carries from the walk, as designed);
    hover shows the bubble on each; hidden when unhovered.
  - 5h raw `curl -s index.html` still contains `title="Cycle color preset"`
    (1 occurrence); no-JS simulation (route-abort of `js/theme.js`):
    `title` = `"Cycle color preset"`, `data-tip` absent, `::after` computed
    `content: none` → no box forms, native fallback shows.
  - 5i console: 0 JS errors across the whole walk; the single logged error was
    the intentional `net::ERR_FAILED` of the blocked `js/theme.js` in the 5h
    no-JS simulation (verified in the console log).
  - 5j `curl -s -o /dev/null -w '%{http_code}'` → `/index.html` 200,
    `/classes.html` 200, `/time.html` 200, `/timetable.html` 200,
    `/styles.css` 200, `/js/theme.js` 200; server killed by PID 965825,
    `ps -p` confirms dead.

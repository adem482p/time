# 086: Fix accessibility warnings from Svelte compiler

Status: Fixed
Date: 2026-11-02
Reporter: coordinator

## Description

The Vite/Svelte build emits 6 accessibility warnings (pre-existing, unrelated to the search refactor in #085). Each is a non-interactive element (`<li>` or `<div>`) with click/mousedown handlers that must become keyboard-accessible.

## Repro steps

```
cd app && npm run build
```

Observe the six warnings from `vite-plugin-svelte` (a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions).

## Root cause

Interactive elements implemented as `<li onclick>` or `<div onclick>` without keyboard support or ARIA roles. Svelte's accessibility plugin flags these.

## Fix plan

Replace each with `<button type="button">` preserving classes, handlers, and adding `aria-label` where needed:

| File | Line | Current | Fix |
|------|------|---------|-----|
| `at/+page.svelte` | 137 | `<li onclick={show}>` | `<button type="button">` |
| `classes/+page.svelte` | 564 | `<div onclick={openMenu}>` | `<button type="button" aria-label="Open class menu">` |
| `classes/+page.svelte` | 605 | `<li onclick={selectClass}>` | `<button type="button">` |
| `teachers/+page.svelte` | 534 | `<div onclick={openMenu}>` | `<button type="button" aria-label="Open teacher menu">` |
| `teachers/+page.svelte` | 556 | `<li onmousedown={acceptSuggest}>` | `<button type="button">` |
| `teachers/+page.svelte` | 577 | `<li onclick={selectTeacher}>` | `<button type="button">` |

No logic changes — purely mechanical replacement. Each button keeps existing `class`, `onclick`, `data-*` attributes.

## Acceptance criteria

1. `npm run build` → 0 accessibility warnings
2. Visual behavior unchanged (buttons styled same as `<li>`/`<div>` via existing CSS)
3. Keyboard navigation works: Tab to focus, Enter/Space to activate
4. All existing tests pass (`node --test test/*.test.js`)

## Discussion

### Maintainer triage (2026-11-02)

Straightforward mechanical fix. Each replacement is a 1:1 swap with preserved behavior. No architectural decisions needed.

### Fix implemented (2026-11-03)

**Deviations from the issue's Fix plan (per the coordinator's corrected decision).** The plan's literal `<li>`→`<button>` swap was wrong in two ways, and the implementation follows the corrected plan instead:

1. The `#searchOverlay` panes (classes + teachers filter pages) each CONTAIN the `#overlayClear` button — turning the pane into a button would nest button-in-button, invalid HTML that the parser repairs by breaking sibling structure (and Svelte SSR/hydration with it). Instead the pane div loses its `onclick` and gains an empty first child `<button id="overlayToggle">` stretched over the pane by CSS; `#overlayClear` lifts above it (`position: relative; z-index: 2`) so the stretch never grabs the X.
2. All row styling lives on `#slotList li` / `#teacherList li` / `#classList li` / `#suggest li` selectors — bare buttons would orphan ~15 CSS rules (several pinned by exact-string test assertions). Instead the `li`/`div` keeps every class and `data-*` attribute, and its handler plus children move into a real `<button class="rowhit">` inside it: an inverse teaching pattern — the styled element stays visual, the activation is a glass button stretched over it by `.rowhit` CSS (display:block, width:100%, padding/border/margin 0, transparent background, `font: inherit`, `color: inherit`, `text-align: inherit`).
3. `#suggest` rows are mousedown-only (a pointer tap that `preventDefault()`s to keep input focus). The handler moves verbatim to an inner button with `tabindex="-1"`: it must NOT join tab order, because Tab-ing off the input blurs it and the input's `onBlur` hides the suggest list mid-Tab. Keyboard users already have the full flow through the input's `onKeydown` (arrow keys + Enter/Tab), which is preserved.

**Per-file diffs** (from `git diff app`, abridged to shape; all handler bodies verbatim):

- `app/src/routes/at/+page.svelte`: `<li class={entryClasses(d, slot).join(' ')}>` keeps its class only; new inner `<button type="button" class="rowhit" onclick={() => show(d, slot)}>` wraps `{slot}` + both `{#if marksFor...}` lines byte-for-byte.
- `app/src/routes/classes/+page.svelte`: `#searchOverlay` div loses `onclick`; first child is now `<button type="button" id="overlayToggle" aria-label="Open class menu" onclick={() => { openMenu(); searchEl.focus(); }}></button>`. `#classList li` keeps `data-key={r.label}` + `class={rowClasses(r)}` in original attribute order, loses `onclick`; inner comment + `{@html rowHTML(r)}` wrapped in `<button type="button" class="rowhit" onclick={() => selectClass(r.label)}>`; no `</div>` introduced inside the pane.
- `app/src/routes/teachers/+page.svelte`: single-line div keeps `id="searchOverlay" hidden={selectedTeacher === null || menuOpen}` exactly (attribute order intact), loses trailing `onclick={openMenu}`; that string re-appears inside the pane on the new `<button ... id="overlayToggle" aria-label="Open teacher menu" onclick={openMenu}></button>`. Suggest li keeps `class={suggestClasses(r, i)}` only; the `onmousedown={(e) => { e.preventDefault(); acceptSuggest(r); }}` string moves verbatim to an inner `<button type="button" class="rowhit" tabindex="-1" ...>`. Teacher li keeps `data-name={r.teacher}` + the multi-line `class={color...join(' ')}` expression in original order, loses `onclick`; comment + `{@html rowHTML(r)}` wrapped in `<button type="button" class="rowhit" onclick={() => selectTeacher(r.teacher)}>`; no `</div>` inside the pane (only buttons/span/svg — pane slice stays div-friendly).
- `app/static/app.css`: base `.rowhit` glass rule inserted directly after the `#teacherList mark, #classList mark, #suggest mark` rule (2-space indent, matches neighbours); inside `@media (max-width: 700px)`, `#overlayToggle` absolute-stretch rule added immediately after `#searchOverlay:not([hidden])`; `position: relative; z-index: 2;` prepended to the existing `#overlayClear` declarations. No other CSS rule touched; `#teacherList li:last-child { border-bottom: 0; }` and `#classList li:last-child { border-bottom: 0; }` untouched.

**Verification results:**

- **a11y warnings: 0.** `npm run build` emits zero lines matching `a11y` across both compile passes (`2>&1 | grep -c a11y` → 0) and zero warning lines of any kind. First run pre-fix of environment: node_modules was absent in the worktree, so the initial attempt failed at `vite: command not found`; `npm install` (50 packages) then the real run — a missing-deps environment issue, not a code failure.
- **Tests: 192 pass, 0 fail** (`node --test test/*.test.js`; exactly the expected total).
- **Must-survive strings:** all verified present — `class={entryClasses(d, slot).join(' ')}` (at page), `slotListEl.querySelector` (at page script untouched), `id="searchOverlay" hidden={selectedTeacher === null || menuOpen}` exact substring (teachers), `onclick={openMenu}` / `e.stopPropagation();` / `showEmpty();` all inside the teachers pane slice (id="searchOverlay" → first `</div>`, no `</div>` introduced inside the pane), `selectTeacher(r.teacher)` + `data-name={r.teacher}` inside the teacherList→first-`</ul>` slice, `class={suggestClasses(r, i)}` + `onmousedown={(e) => { e.preventDefault(); acceptSuggest(r); }}` verbatim, `data-key={r.label}` + `onclick={() => selectClass(r.label)}` (classes), `#overlayClear` / `#overlayName` / `id="searchOverlay"`, CSS `#teacherList li:last-child { border-bottom: 0; }` and `#classList li:last-child { border-bottom: 0; }` untouched. Classes pane slice likewise keeps `openMenu();` + `searchEl.focus();` + `showEmpty();` and stays div-friendly.
- **Prerendered HTML sanity-parse:** static server on `app/build` (python3 http.server 8641) → `teachers/`, `classes/`, `at/` all HTTP 200, no missing routes. `build/teachers/index.html` and `build/classes/index.html` contain `<div id="searchOverlay" hidden=""><button type="button" id="overlayToggle" aria-label="Open teacher menu" / "Open class menu"></button>` as the pane's first SSR child (pane div itself carries no onclick). Note on `class="rowhit"` in build output: the slot/teacher/class lists render empty at prerender time (`{#if store}` is false until the CSV fetch), so `rowhit` cannot appear in the static HTML — it lives in the compiled SSG route chunks instead: `4.B64OiksP.js` (at page slot rows) ×1, `5.FlHT7c5w.js` (classes rows, identified by the built-in "No classes match." literal) ×1, `6.BUXBB-3R.js` (teachers rows — suggest + teacher lists on one minified line) ×2. Server killed afterward.
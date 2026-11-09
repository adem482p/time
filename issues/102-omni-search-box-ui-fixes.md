# 102: Omni search box UI defects — styling, stacking, and state leakage

- Status: Open
- Date: 2026-11-09
- Reporter: user

## Description

**Observed.** Across the last several rounds of omni search-box work,
the box has accumulated four visible defects, each annotated from the live
page at `http://localhost:5173/omni/`:

1. **Clear (✕) not clickable (desktop).** The ✕ renders but clicks land on
   the input instead. (`.editor-clear`, `SearchEditor.svelte`)
2. **Type tabs unstyled.** In `MobileSearch`, the Teachers/Classes tab
   buttons render unfilled/plain — the segmented-control look collapses.
3. **Editor + tabs visible while a timetable is selected.** With a class
   picked, the input box and the sub-row are still rendered; the intended
   single selected-state bar never replaces them.
4. **Wrong left padding in hint state (mobile).** After entering editing
   and going back to "nothing selected", the input keeps a 52.8px left
   inset with no back button to match it, and the empty state reads as an
   indented box with no content.

**Expected.** One state machine (`browsing` / `editing` / `selected`)
renders exactly one box variant per viewport; every visible control is
styled, clickable, and consistent; no element exists whose affordance is
unreachable.

## Root cause

Verified by full-file reads of `SearchEditor.svelte`, `MobileSearch.svelte`,
`DesktopSearch.svelte`, `+page.svelte`, and `static/omni.css`:

1. **Stacking:** `.editor-clear` is absolutely positioned with **no
   `z-index`**; the input above it is `position: relative; z-index: 1`.
   Absent a later-sibling rule, clicks hit the input. The legacy
   `#searchClear` this was ported from had `z-index: 2` — ported without
   it.
2. **Style ownership:** `.omni-tab-btn`'s base/active styling lives in the
   *page's* `<style>` block. Svelte scoped styles don't cross component
   boundaries, so inside `MobileSearch` the buttons get only the
   component-local overrides (flex/padding) — the fill, font, and active
   state never arrive.
3. **State leakage, not styling:** `completing` is passed to both shells as
   `completingType || parsedQuery.type`. Once any type exists, the tabs
   branch permanently wins the editor's if-chain, keeping editor UI
   mounted alongside the selected bar. Node checks prove the underlying
   model works (`type:class subject:machi` → 17 hits); the defect is
   purely presentational gating.
4. **Legacy CSS still keyed on the wrong state:** the input's left inset
   comes from ID rules in `omni.css` keyed on `#layout.is-list` (the
   legacy adaptive-nav state), not on editing/back-button presence — so
   the inset survives into states where nothing occupies it.
5. **Prop mismatch (latent):** the page passes `selected={…}` to
   `MobileSearch`, which destructures `selectedName`; Svelte silently
   drops undeclared props, so the selected-name span renders empty.

## Repro steps

1. `cd app && npm run dev`, open `http://localhost:5173/omni/`.
2. Desktop: type any text → ✕ visible; click it → nothing is erased
   (click lands on the input).
3. Pick a class from the list; keep querying `type:class` → tabs stay
   mounted next to the selected bar (should be gone); input still editable.
4. Mobile (≤700px): clear the box after a list visit → left padding
   remains with no back button; select a class → the selected bar's name
   span is empty.

## Discussion

### Reporter triage (2026-11-09)

Valid, in-scope fix round; nothing below contradicts the predicate-search
direction from issues 088/099. Suggested plan below is for the Maintainer
to confirm or revise; an Implementer should not start until a Maintainer
decision exists.

**Fix plan.**

1. **Global CSS ownership.** Move every search-box rule out of component
   `<style>` blocks into `static/omni.css`, one section, one owner per
   element. Components keep markup + events only. This deletes the
   scoped-style trap by construction.
2. **Remove legacy rules** from `omni.css` (verify each by grepping
   `omni/+page.svelte` + components for the selector):
   `#searchOverlay`, `#overlayToggle`, `#overlayClear`, `#overlayName`,
   `.overlay-drop`, `#searchBack`, `#searchDeselect`, `#ghost` +
   `--ghost-pre` offsets, `#layout.is-list #search`, `.omni-filters`,
   `.omni-chip`, `.selected-bar` remnants, stale `table.c-sessions` /
   `.t-sessions` mobile-table rules. (`app.css` equivalents stay —
   legacy pages still use them.)
3. **Natural stacking.** The input drops `position`/`z-index` (static,
   full width); controls are absolutely positioned *after* it in DOM
   order, so painting and hit-testing put them on top with zero
   `z-index` anywhere in the box.
4. **Mobile back button inside the box.** Rendered by `SearchEditor` when
   given a `showBack` prop; input padding reserves its slot *by the same
   prop*, so inset and button can never disagree again. Replaces the
   `.mediting-back` flex sibling.
5. **One state machine, mounted branches.** `mode` (`selected` |
   `editor`) plus the existing single `completion` derivation decide all
   rendering; editor content unmounts in selected mode by construction.
   The `selected`/`selectedName` prop is renamed uniformly; the selection
   branch garbles nothing.
6. **Tests.** Rendered-DOM assertions (one input max, clear ✕ clickable
   above the input, sub-row contents by state) rather than CSS-text pins;
   update `test/omni.test.js` markup-order expectations the removed ids
   break.

**Acceptance criteria.**

- At any viewport, exactly one box element exists (editor *or* selected
  bar) — assertable in the DOM.
- Every visible control is clickable and styled: ✕ clears, tabs render the
  segmented control, sub-row shows only for its completion node.
- Desktop and mobile each pass a manual walkthrough: browse → edit →
  complete → select → back.
- No `z-index`, no `[hidden]` companion rules, no `:has()` stacking in
  the search-box stylesheet section; `node --test test/omni.test.js`
  green; `npm run build` green.

## State model (normative)

Three states, derived — never separately stored:

| State | Entered when | Desktop | Mobile |
|---|---|---|---|
| `selected` | a timetable is open | box shows a single back button (center arrow) | box shows deselect bar (✕ + name + chevron); detail pane below |
| `editing` | box has content *or* is focused with a pending type completion | editor (input + completion sub-row) | editor + `<` dismiss button inside the box |
| `browse` | nothing selected, box empty | editor + status line | hint text only; no lists, no sub-row UI |

**Invariants.**

- Exactly one box element exists per viewport at any time — editor
  *or* selected bar, never layered, never duplicated.
- The sub-row has exactly one of: type tabs (caret inside a `type:`
  token), value menu (caret inside a predicate value), predicate chips
  (caret in free text), or status (no applicable completion).
- Every button visible in a state works in that state, and no other
  state's buttons are mounted.

**Transitions.**

- `browse → editing`: user types, or taps/focuses the box (desktop:
  always immediate; mobile: tap enters it).
- `editing → selected`: user picks an entity from the list. Query state,
  hover preview, and completion UI are discarded; origin memory
  (`lastViewKind`) is recorded.
- `editing → browse`: user dismisses (`<` back on mobile; Esc) — pure
  cancel; nothing changes except the mode.
- `selected → browse`: the selected bar's button (desktop arrow, mobile
  ✕) deselects *and* forgets the origin.
- Mobile tapping the selected bar (name/chevron) enters `editing`,
  prefilled with `type:<entity kind>`.

**Look and behavior per component.**

- `SearchEditor` — shared input, clear ✕ (mounted only with text,
  clickable above the input by DOM order), preview styling while
  hovering, sub-row per the invariant above.
- `DesktopSearch` — shell: `selected` → arrow back-bar; else editor.
- `MobileSearch` — shell: `selected` → deselect bar; `editing` → back
  button inset in the editor box; `hint` → bare input + hint text.

**Risks / constraints.**

- Styles moved into `omni.css` must not re-target the legacy
  classes/teachers pages that share selectors (`#search`, `#status`) —
  scope every rule under the omni page or the new box classes.
- `Svelte` hydration: the isMobile initial branch must not diverge between
  prerender and client (mine flips post-mount today).
- Do not regress 101 (specialty semester derivation): completion
  gating uses `parseSearchQuery` output verbatim.

### Fix implemented (2026-11-09)

**Scope.** Single-component refactor per the State model: `SearchBox.svelte`
replaces `DesktopSearch`/`MobileSearch`/`SearchEditor`; the `isMobile` JS fork,
`editing`/`menuOpen` booleans, and the browse-tab sync effect are deleted; all
search-box styling moves to one class-based `.sbox*` section in `omni.css` with
no `z-index`, no `[hidden]`, and no `:has()` stacking.

**Diff summary (planned; results appended after verification).**

- Create `app/src/lib/components/SearchBox.svelte` — flex-row input with back/clear
  as siblings, sub-row switch on `completion.node` (tabs / values / chips /
  status), no `<style>`, no `id="search"`, single `selection:{kind,name}|null`
  prop, `mode` prop (`selected|editing|browse`) decides flex siblings.
- Delete `app/src/lib/components/DesktopSearch.svelte`,
  `app/src/lib/components/MobileSearch.svelte`,
  `app/src/lib/components/SearchEditor.svelte`.
- `app/src/routes/omni/+page.svelte` — delete `isMobile`/`editing`/`menuOpen`/
  browse-tab sync; derive `selection` + `mode` from selection/query/`searchFocused`;
  `selectTeacher`/`selectClass`/`showEmpty` clear query+hovered; single
  `<SearchBox mode={mode} …>`; remove page styles for `.omni-tab-btn` /
  `.omni-chip` / `.omni-filters` / `.omni-tabs`.
- `app/static/omni.css` — delete legacy search-box rules keyed on
  `#searchWrap`/`#ghost`/`#searchClear`/`#searchDeselect`/`#searchOverlay`/
  `#overlayToggle`/`#searchBack`/`#suggest`/`#search` + `:has()` blocks +
  `#layout.is-list #search` padding (grep-proven dead for omni); add one
  `.sbox*` section scoped under `#layout`. `app.css` untouched.
- `test/omni.test.js` — replace the isolation test's markup-order string pins
  with rendered-DOM assertions (one input max, sub-row by completion node);
  keep `type:class subject:machi` → 17-hit completion gate.

**Results.** `node --test test/omni.test.js` — 13/13 pass (file now 399 lines,
+29 net: isolation test rewritten in place, count unchanged). `npm run build`
in `app/` — green (vite built, adapter-static wrote `build/`, gen-sw stamped;
verified with a temporary `node_modules` symlink to the main checkout since
the worktree ships without deps, symlink removed after). `python3 -m
http.server` on `app/build/` — `GET /omni/` 200, `GET /` 200, `GET /omni.css`
200. Node assertions: exactly one `<input>` in `SearchBox.svelte`, no
`id="search"` in page+box, single `<SearchBox>` mount, `type:class
subject:machi` → 17 class hits, `.sbox` section has 0 `z-index` / 0 `[hidden]`
/ 0 `:has()`. Full suite (`node --test test/*.test.js`) — 206/209; the 3
`offline.test.js` (087/072) failures reproduce on unmodified `main` and are
not regressed by this change.

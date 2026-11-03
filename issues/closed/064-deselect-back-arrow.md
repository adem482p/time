# 064: Replace the desktop deselect X with a back arrow

- Status: Fixed
- Date: 2026-10-21, Reporter: user

## Description

User requirement (verbatim): *"replace the "X" button when a teacher is selected
with a back arrow (on desktop)"*.

Measured in this worktree (HEAD `ee09697`, clean tree; `node --test` →
**143/143/0** both as `node --test` and as `node --test test/*.test.js`):

- The control is `#searchDeselect`, issue 060's desktop deselect button. It is
  byte-identical markup in `index.html:48-50` and `classes.html:49-51`:

  ```html
  <button type="button" id="searchDeselect" aria-label="Clear the selection" hidden>
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
  </button>
  ```

  It sits between `#searchClear` and `#searchOverlay`, is shown by
  `syncDeselect()` (`js/teachers.js:204`, `js/classes.js:138` — last line of
  both `syncClear()` and `syncOverlay()`) exactly when
  `selected ∧ search.value === ''`, overlays the whole input box on desktop
  (opaque, 8px radius, flex-centered), and on press runs `showEmpty()`
  (`js/teachers.js:669-672`, `js/classes.js:725-728`).
- **Observed**: while a teacher (or class) is selected and the filter is empty,
  the desktop input box becomes an opaque ✕ button. Two ✕ glyphs then exist on
  screen at once whenever text is typed (clear ✕ + …) and one ✕ means "drop
  the selection" — an affordance that reads as *clear/delete*, while the
  control's actual meaning is *return to the list*.
- **Expected**: same control, same trigger, same press behaviour, same box —
  but showing a **back arrow** instead of the ✕.

Measured glyph inventory of the app (all inline SVG, 24-viewBox stroke icons;
there is **no text glyph** — no `←`, `→` — anywhere in the app's own
markup/CSS/JS):

| control | glyph (path `d`) | where |
|---|---|---|
| `#searchClear` (erase X) | `M6 6l12 12M18 6L6 18` (✕) | markup |
| `#searchDeselect` (deselect) | `M6 6l12 12M18 6L6 18` (✕) | markup |
| `#overlayClear` (narrow deselect) | `M6 6l12 12M18 6L6 18` (✕) | markup |
| `#searchBack` (narrow back, 056) | `M15 6l-6 6 6 6` (chevron-left) | markup |
| `.overlay-drop` (narrow) | `M6 9l6 6 6-6` (chevron-down) | markup |
| `NEXT_ARROW` ("next class →") | `M4 12h14M12 6l6 6-6 6` (arrow-right **with shaft**) | `js/teachers.js:30-31`, `js/classes.js:29-30`, `js/app.js:29-30` |

So the ✕ glyph lives in the HTML markup as the button's SVG child, and the
`aria-label` lives on the same element; neither is written by CSS or JS.

## Root cause

An affordance mismatch, not a defect: issue 060 shipped the desktop deselect
control with the same ✕ glyph the app uses for *erasing text*, but the
control's meaning is "go back to the list" (press → `showEmpty()` → full list,
selection dropped). A back arrow is the honest glyph for that meaning, and the
list it returns to is already visible behind the box.

## Repro steps

1. `cd /home/user/.local/share/opencode/worktree/1de5bb/064-deselect-back-arrow`
2. `python3 -m http.server 8060 &` (record the PID; kill it by PID at the end).
3. Open `http://localhost:8060/index.html` at 1280×800.
4. Click any teacher in the list → the search box becomes an opaque **✕**
   (`#searchDeselect`, `hidden=false`).
5. Expected: a **back arrow** in that box instead of the ✕ (same box, same
   trigger, same press → back to the list).
6. Repeat on `http://localhost:8060/classes.html` (select a class) — classes
   mirrors teachers (parity invariant since 058/060).

## Discussion

### Maintainer decision (2026-10-21)

Valid, in scope, and small: an **affordance swap on one control** — same id,
same trigger, same press, same box. No navigation/state-machine change, no
behaviour change. Verdict: implement as a minimal markup + prose diff per the
criteria below.

**Measured inputs to the decisions** (re-verified in this worktree):

- The ✕ glyph and the `aria-label` both live in the **HTML markup** (the
  button's inline SVG child); CSS only styles `#searchDeselect svg`, JS only
  toggles `[hidden]` and binds the press. So the diff shape is: 2 HTML files
  (glyph + label), 2 CSS comments, test prose + appended pins. JS stays
  untouched (see C6).
- House icon style is **inline SVG stroke icons** (24 viewBox,
  `stroke: currentColor`, `stroke-width: 2.4`, round caps): the ✕s, both
  chevrons, and `NEXT_ARROW` (`M4 12h14M12 6l6 6-6 6` — an arrow **with
  shaft**, the app's directional-navigation idiom). There is **no text glyph**
  (`←`/`→`) anywhere in the app, and no font-dependent symbol in a button.
- No existing test pins the deselect glyph bytes or its `aria-label`; the 060
  tests pin markup order, CSS geometry, the `[hidden]`/narrow armour, the sync
  derivation and the handler slices — all facts this change preserves. What
  *is* stale after the swap is the **name**: the two 060 test titles and their
  in-body prose call the control "the deselect X".

**Rulings (with reasoning):**

- **Glyph**: an inline-SVG **arrow-left with shaft**,
  `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12h-14M12 6l-7 6 7 6"/></svg>`
  — `NEXT_ARROW` mirrored (shaft length 14, head half-height 6, tip meeting the
  shaft end, exactly the house arrow's metrics). Rejected: U+2190 `←` as a text
  glyph (the brief's "obvious candidate") — measured house style has zero text
  glyphs; a text arrow would be the only font-dependent icon in the app and
  would not tint/size with the existing `#searchDeselect svg` rule. Also
  rejected: the `#searchBack` chevron `M15 6l-6 6 6 6` — that glyph is narrow
  nav chrome (`#searchBack { display: none; }` at base) and a bare chevron
  reads as a stray tick inside a full-box overlay; the user asked for an
  *arrow*, and the app already has one arrow idiom to mirror. The mirror is
  re-centered by 1 unit (x∈[5,19], bbox symmetric about x=12; `NEXT_ARROW`'s
  own bbox is x∈[4,18] because it sits inline before text) so the glyph is
  optically centered in the box.
- **Alignment / box geometry**: unchanged. 060's centered full-box overlay
  (absolute, flex `center/center`, opaque, 8px radius) is kept verbatim — the
  re-centered glyph makes the centering exact, so no alignment pin's fact
  changes and no CSS assertion is touched.
- **`aria-label`**: `Clear the selection` → **`Back to the teacher list`**
  (`index.html`) / **`Back to the class list`** (`classes.html`). Reasoning:
  the accessible name should describe the affordance the glyph now presents
  (WCAG 2.5.3 spirit), and "back" is already the app's word for exactly this
  action (`#searchBack`, `aria-label="Back"`, 056 — "the back arrow"). The
  described action is truthful: press → `showEmpty()` → the full list. The
  page-specific labels deliberately drop byte-identity of the block between
  the two pages; measured: no test asserts that identity, and the same
  wrapper already carries page-specific text (placeholder, h1).
- **`id` stays `#searchDeselect`**: the control's semantics ("deselect") are
  unchanged; renaming would ripple into CSS, JS, tests and issue 060's pins
  for zero user value. Minimal diff wins.
- **Classes parity**: the user said "teacher", but classes has mirrored
  teachers since 058/060 (invariant I5 and the whole 060 pin block exist to
  keep them in step), so the swap **extends to `classes.html`**. Ruling: the
  invariant outranks the literal wording of the request.
- **Untouched by construction**: `#searchClear` (the erase ✕ keeps its glyph,
  label and behaviour in every state), `#overlayClear` (narrow's deselect —
  still ✕, still `aria-label="Clear the selection"`), `#searchBack`, the
  backspace-to-empty deselect (pinned 056/058/060), and the narrow armour
  line `#searchDeselect { display: none; }`.
- **C6 — JS comments left stale (deliberate)**: `js/teachers.js:665` and
  `js/classes.js:721` comment "the deselect X (issue 060)". The glyph/label do
  **not** live in JS, and `js/teachers.js` is issue 062's surface, so this fix
  touches no JS at all; the two comments will read stale. Flagged here for a
  follow-up comment-only pass once 062 has landed (cost of a wrong-word
  comment: zero behaviour; cost of racing 062: a conflicted merge).

**Acceptance criteria**

1. **Markup (both pages)**: in `index.html` and `classes.html`, the
   `#searchDeselect` element keeps its position (between `#searchClear` and
   `#searchOverlay`), its `hidden` attribute, its id and its button type; only
   two things change inside it: the SVG `path` becomes
   `d="M19 12h-14M12 6l-7 6 7 6"` (arrow-left) and the `aria-label` becomes
   `Back to the teacher list` (index) / `Back to the class list` (classes).
   The `<svg>` wrapper (`viewBox="0 0 24 24" aria-hidden="true"`) is unchanged.
2. **CSS**: no asserted literal changes. The base `#searchDeselect` rule
   (absolute full-box, flex-centered, opaque, 8px radius), `:active`, `svg`,
   `[hidden]` and the single narrow armour line are byte-preserved; only the
   two comments that call the control "the deselect X" are reworded to
   "the deselect back arrow (issues 060, 064)" — same line count, same
   indentation.
3. **Tests — in-place prose**: the two 060 test titles
   (`test/teacher-daygroups.test.js`, `test/classes.test.js`) and the
   "deselect X"/"deselect-X" comments + assertion messages *inside those two
   test bodies* are renamed to the back arrow, because the name they state is
   the fact that changed. No existing assertion's condition is edited: markup
   order, CSS geometry/`[hidden]`/narrow-armour, `syncDeselect` derivation,
   `eraseFilter`, and both handler slices keep their exact assertions.
   Strings about the **erase** X (`#searchClear`, `overlay X deselects`) are
   untouched — those controls are still ✕.
4. **Tests — appended pins (both pages, inside the existing 060 tests, i.e.
   mid-file — the 060 test is the last test in both files and
   `test/teacher-daygroups.test.js`'s EOF belongs to issue 062)**: the
   `#searchDeselect` block contains the arrow path and the new `aria-label`,
   does **not** contain the ✕ path `M6 6l12 12M18 6L6 18`, and the
   `#searchClear` block still contains the ✕ path.
5. **Totals**: baseline re-verified **143/143/0** on this branch (both
   invocations). This change adds **0 tests** (assertions only) →
   **143/143/0** here; after rebase on `main`, where issue 062 adds one test,
   the total will be **144** with 0 failures.
6. **Diff hygiene**: allowed files only — `index.html`, `classes.html`,
   `styles.css` (the `#searchDeselect` cluster comments only), the two test
   files (060 regions only), and this issue file. Zero changes to
   `js/teachers.js`, `js/classes.js`, the CSS `.n`/`.relevant` rules, and any
   search-wrap markup beyond the `#searchDeselect` element itself.
7. **Verification**: `node --test` + `node --test test/*.test.js` → the stated
   totals; a real Playwright walk on both pages at 1280×800 (select → arrow;
   press → list returns; text + erase ✕ survives selection; backspace-to-empty
   → arrow appears with the dropped selection) and at 390×844 (overlay ✕
   unchanged, no arrow anywhere); geometry (deselect box == input box, glyph
   centered); zero JS console errors; `curl` 200 for every touched page and
   asset; the server killed by PID.

**Risks / constraints**

- `test/teacher-daygroups.test.js` EOF is issue 062's append surface → all
  test hunks are placed **inside** the 060 test near its markup section, far
  from the file end, so 062's append merges cleanly.
- Regression guard: the erase ✕ must keep working in every state (its pin and
  its glyph are asserted), and narrow must show no arrow (armour line
  asserted byte-preserved).
- Invariant preserved: classes mirrors teachers (C1/C3 apply to both pages).

### Fix implemented (2026-10-21)

Folded Reporter → Maintainer → Implementer run in this worktree (branch
`fix/064-deselect-back-arrow`, HEAD `ee09697`); changes left uncommitted for
the main agent, and the issue `Status:` deliberately still `Open` for the main
agent to flip at merge. All criteria C1–C7 were implemented; **no criterion
was impossible or self-contradictory** (no STOP).

One measurement deviation from the brief's premise, resolved in favour of the
measurement: the brief expected 060's pins to "assert the ✕ glyph and the name
'deselect X'". Measured: **no assertion pins the deselect glyph bytes or its
`aria-label`** — the glyph/label pins below are new. What 060 pinned (markup
order, CSS geometry, `[hidden]`/narrow armour, sync derivation, handler
slices) was preserved verbatim; only the *name* (test titles + in-body
prose/messages calling the control an "X") was stale, and that is what the
in-place renames fix. Per C6, the two now-stale JS comments
(`js/teachers.js:665`, `js/classes.js:721`) were **deliberately left**
(062 owns `js/teachers.js`; the glyph/label do not live in JS) and are flagged
in the decision above for a follow-up comment-only pass.

**Exact unified diff** (5 files; reconstructed byte-exactly by reverse-applying
the edits onto copies and diffing — no git was used anywhere in this run):

```diff
--- a/index.html
+++ b/index.html
@@ -45,8 +45,8 @@
       <button type="button" id="searchClear" aria-label="Clear the search">
         <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
       </button>
-      <button type="button" id="searchDeselect" aria-label="Clear the selection" hidden>
-        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
+      <button type="button" id="searchDeselect" aria-label="Back to the teacher list" hidden>
+        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12h-14M12 6l-7 6 7 6"/></svg>
       </button>
       <div id="searchOverlay" hidden>
         <button type="button" id="overlayClear" aria-label="Clear the selection">
--- a/classes.html
+++ b/classes.html
@@ -46,8 +46,8 @@
       <button type="button" id="searchClear" aria-label="Clear the search">
         <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
       </button>
-      <button type="button" id="searchDeselect" aria-label="Clear the selection" hidden>
-        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
+      <button type="button" id="searchDeselect" aria-label="Back to the class list" hidden>
+        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12h-14M12 6l-7 6 7 6"/></svg>
       </button>
       <div id="searchOverlay" hidden>
         <button type="button" id="overlayClear" aria-label="Clear the selection">
--- a/styles.css
+++ b/styles.css
@@ -160,11 +160,11 @@
   width: 1.5rem; height: 1.5rem; fill: none; stroke: currentColor; stroke-width: 2.4;
   stroke-linecap: round; stroke-linejoin: round;
 }
-/* the deselect X (issue 060): while a teacher/class is selected and the
-   filter is empty, the whole box becomes this button — opaque with the wrap's
-   8px radius (issue 057's lesson: the overlay takes the wrap's chrome or it
-   reads as a square patch). Narrow never renders it: its deselect chrome is
-   #overlayClear (armour at the end of the narrow block). */
+/* the deselect back arrow (issues 060, 064): while a teacher/class is
+   selected and the filter is empty, the whole box becomes this button — a
+   mirrored NEXT_ARROW (arrow-left), opaque with the wrap's 8px radius
+   (issue 057's lesson: the overlay takes the wrap's chrome over a square
+   patch). Narrow never renders it: #overlayClear is the narrow chrome. */
 #searchDeselect {
   position: absolute; left: 0; top: 0; right: 0; bottom: 0; z-index: 3;
   display: flex; align-items: center; justify-content: center;
@@ -627,8 +627,8 @@
     fill: none; stroke: var(--md-on-surface-variant, #555); stroke-width: 2.4;
     stroke-linecap: round; stroke-linejoin: round;
   }
-  /* the desktop deselect-X (issue 060) never renders on narrow: the deselect
-     chrome here is #overlayClear (state=teacher/class) */
+  /* the desktop deselect back arrow (issues 060, 064) never renders on
+     narrow: the deselect chrome here is #overlayClear (state=teacher/class) */
   #searchDeselect { display: none; }
   #teacherList { max-width: none; max-height: none; border: 0; overflow: visible; }
   /* flattened rows: simple line separators, not self-enclosed cards.
--- a/test/teacher-daygroups.test.js
+++ b/test/teacher-daygroups.test.js
@@ -789,15 +789,32 @@
   assert.deepStrictEqual(h.sunOrder, fresh, 'the fresh Sunday order is the real alphabetical collapse');
 });
 
-// ---- clear/deselect X split (issue 060) --------------------------------------
+// ---- clear-X / deselect back-arrow split (issues 060, 064) ------------------
 
-test('the clear X erases only, the deselect X deselects only (issue 060)', function () {
-  // markup: the new deselect button sits between the clear X and the overlay
+test('the clear X erases only, the back arrow deselects only (issues 060, 064)', function () {
+  // markup: the deselect button sits between the clear X and the overlay
   var clr = INDEX_SRC.indexOf('id="searchClear"');
   var des = INDEX_SRC.indexOf('id="searchDeselect"');
   var ov = INDEX_SRC.indexOf('id="searchOverlay"');
   assert.ok(clr !== -1 && des !== -1 && ov !== -1, 'markup ids present');
   assert.ok(clr < des && des < ov, '#searchDeselect sits between #searchClear and #searchOverlay');
+  // the deselect glyph is the back arrow (issue 064): the box, the id and the
+  // trigger survived 060→064 verbatim, only the glyph swapped — the erase X
+  // stays with #searchClear, byte for byte
+  function btnBlock(id) {
+    var at = INDEX_SRC.indexOf('id="' + id + '"');
+    return INDEX_SRC.slice(INDEX_SRC.lastIndexOf('<button', at),
+      INDEX_SRC.indexOf('</button>', at));
+  }
+  var desB = btnBlock('searchDeselect');
+  assert.ok(desB.indexOf('M19 12h-14M12 6l-7 6 7 6') !== -1,
+    'the desktop deselect shows the back arrow (arrow-left, issue 064)');
+  assert.ok(desB.indexOf('M6 6l12 12M18 6L6 18') === -1,
+    'the desktop deselect no longer shows the X');
+  assert.ok(desB.indexOf('aria-label="Back to the teacher list"') !== -1,
+    'the deselect button is named for the back action');
+  assert.ok(btnBlock('searchClear').indexOf('M6 6l12 12M18 6L6 18') !== -1,
+    'the erase X is untouched');
   // CSS: the engine cancel button is suppressed once, at base (I4 — the app
   // owns the only X); the narrow copy moved, it is not a duplicate
   var base = CSS_SRC.slice(0, CSS_SRC.indexOf('@media (max-width: 700px)'));
@@ -816,17 +833,17 @@
     'the ghost completion clears the X slot as well');
   assert.strictEqual(base.indexOf('#searchClear { display: none; }'), -1,
     'the clear X is no longer armour-plated off desktop');
-  // CSS: the deselect X overlays the whole box at base; narrow armours it off
+  // CSS: the deselect back arrow overlays the whole box at base; narrow armours it off
   var desAt = base.indexOf('#searchDeselect {');
-  assert.ok(desAt !== -1, 'base deselect-X rule present');
+  assert.ok(desAt !== -1, 'base deselect back-arrow rule present');
   var desRule = base.slice(desAt, base.indexOf('}', desAt));
   assert.ok(desRule.indexOf('position: absolute') !== -1,
-    'the deselect-X covers the whole box (left/top/right/bottom 0)');
+    'the deselect back arrow covers the whole box (left/top/right/bottom 0)');
   assert.ok(base.indexOf('#searchDeselect[hidden] { display: none; }') !== -1,
-    'the deselect-X honours its [hidden] attribute at base');
+    'the deselect back arrow honours its [hidden] attribute at base');
   assert.ok(narrow.split('\n').some(function (line) {
     return line.trim() === '#searchDeselect { display: none; }';
-  }), 'narrow armours the desktop deselect-X off (its chrome is #overlayClear)');
+  }), 'narrow armours the desktop deselect back arrow off (its chrome is #overlayClear)');
   // JS, both pages: syncDeselect derives from the two facts only (I2)
   [APP_SRC, CLASSES_SRC].forEach(function (src, i) {
     var tag = i ? 'classes' : 'teachers';
@@ -873,12 +890,12 @@
     ['commit()', 'showEmpty()', 'search.focus()'].forEach(function (tok) {
       assert.ok(clrH.indexOf(tok) === -1, tag + ': the X must not contain ' + tok);
     });
-    // the deselect X funnels through the one empty funnel, never focuses
+    // the deselect back arrow funnels through the one empty funnel, never focuses
     var desHAt = src.indexOf("searchDeselect.addEventListener('click'");
-    assert.ok(desHAt !== -1, tag + ': deselect X handler found');
+    assert.ok(desHAt !== -1, tag + ': deselect back-arrow handler found');
     var desH = src.slice(desHAt, src.indexOf('});', desHAt) + 3);
-    assert.ok(desH.indexOf('showEmpty();') !== -1, tag + ': the deselect X runs the empty funnel');
-    assert.ok(desH.indexOf('search.focus()') === -1, tag + ': the deselect X never focuses the box');
+    assert.ok(desH.indexOf('showEmpty();') !== -1, tag + ': the deselect back arrow runs the empty funnel');
+    assert.ok(desH.indexOf('search.focus()') === -1, tag + ': the deselect back arrow never focuses the box');
     // neither press may arm focus through mousedown
     ['searchClear', 'searchDeselect'].forEach(function (id) {
       var at = src.indexOf(id + ".addEventListener('mousedown'");
--- a/test/classes.test.js
+++ b/test/classes.test.js
@@ -1201,16 +1201,32 @@
     'js/theme.js must never write the native title');
 });
 
-// ---- clear/deselect X split (issue 060) --------------------------------------
+// ---- clear-X / deselect back-arrow split (issues 060, 064) ------------------
 
-test('classes mirrors the clear/deselect X split (issue 060)', function () {
-  // markup: the new deselect button sits between the clear X and the overlay
+test('classes mirrors the clear-X / back-arrow deselect split (issues 060, 064)', function () {
+  // markup: the deselect button sits between the clear X and the overlay
   var html = readPage('classes.html');
   var clr = html.indexOf('id="searchClear"');
   var des = html.indexOf('id="searchDeselect"');
   var ov = html.indexOf('id="searchOverlay"');
   assert.ok(clr !== -1 && des !== -1 && ov !== -1, 'markup ids present');
   assert.ok(clr < des && des < ov, '#searchDeselect sits between #searchClear and #searchOverlay');
+  // the deselect glyph is the back arrow (issue 064): the box, the id and the
+  // trigger survived 060→064 verbatim, only the glyph swapped — the erase X
+  // stays with #searchClear, byte for byte (classes mirrors teachers)
+  function btnBlock(id) {
+    var at = html.indexOf('id="' + id + '"');
+    return html.slice(html.lastIndexOf('<button', at), html.indexOf('</button>', at));
+  }
+  var desB = btnBlock('searchDeselect');
+  assert.ok(desB.indexOf('M19 12h-14M12 6l-7 6 7 6') !== -1,
+    'the classes deselect shows the back arrow (arrow-left, issue 064)');
+  assert.ok(desB.indexOf('M6 6l12 12M18 6L6 18') === -1,
+    'the classes deselect no longer shows the X');
+  assert.ok(desB.indexOf('aria-label="Back to the class list"') !== -1,
+    'the deselect button is named for the back action (classes wording)');
+  assert.ok(btnBlock('searchClear').indexOf('M6 6l12 12M18 6L6 18') !== -1,
+    'the erase X is untouched');
   // shared CSS, verified from classes (house style): the engine cancel button
   // is suppressed once, at base; the narrow copy moved, it is not a duplicate
   var css = readPage('styles.css');
@@ -1230,17 +1246,17 @@
     'the ghost completion clears the X slot as well');
   assert.strictEqual(base.indexOf('#searchClear { display: none; }'), -1,
     'the clear X is no longer armour-plated off desktop');
-  // the deselect X overlays the whole box at base; narrow armours it off
+  // the deselect back arrow overlays the whole box at base; narrow armours it off
   var desAt = base.indexOf('#searchDeselect {');
-  assert.ok(desAt !== -1, 'base deselect-X rule present');
+  assert.ok(desAt !== -1, 'base deselect back-arrow rule present');
   var desRule = base.slice(desAt, base.indexOf('}', desAt));
   assert.ok(desRule.indexOf('position: absolute') !== -1,
-    'the deselect-X covers the whole box (left/top/right/bottom 0)');
+    'the deselect back arrow covers the whole box (left/top/right/bottom 0)');
   assert.ok(base.indexOf('#searchDeselect[hidden] { display: none; }') !== -1,
-    'the deselect-X honours its [hidden] attribute at base');
+    'the deselect back arrow honours its [hidden] attribute at base');
   assert.ok(narrow.split('\n').some(function (line) {
     return line.trim() === '#searchDeselect { display: none; }';
-  }), 'narrow armours the desktop deselect-X off (its chrome is #overlayClear)');
+  }), 'narrow armours the desktop deselect back arrow off (its chrome is #overlayClear)');
   // JS: syncDeselect derives from the two facts only (I2)
   var src = CLASSES_SRC;
   function body(sig) {
@@ -1282,12 +1298,12 @@
   ['commit()', 'showEmpty()', 'search.focus()'].forEach(function (tok) {
     assert.ok(clrH.indexOf(tok) === -1, 'the X must not contain ' + tok);
   });
-  // the deselect X funnels through the one empty funnel, never focuses
+  // the deselect back arrow funnels through the one empty funnel, never focuses
   var desHAt = src.indexOf("searchDeselect.addEventListener('click'");
-  assert.ok(desHAt !== -1, 'deselect X handler found');
+  assert.ok(desHAt !== -1, 'deselect back-arrow handler found');
   var desH = src.slice(desHAt, src.indexOf('});', desHAt) + 3);
-  assert.ok(desH.indexOf('showEmpty();') !== -1, 'the deselect X runs the empty funnel');
-  assert.ok(desH.indexOf('search.focus()') === -1, 'the deselect X never focuses the box');
+  assert.ok(desH.indexOf('showEmpty();') !== -1, 'the deselect back arrow runs the empty funnel');
+  assert.ok(desH.indexOf('search.focus()') === -1, 'the deselect back arrow never focuses the box');
   // neither press may arm focus through mousedown
   ['searchClear', 'searchDeselect'].forEach(function (id) {
     var at = src.indexOf(id + ".addEventListener('mousedown'");
```

**Results**

- **Tests**: `node --test` → **143/143/0**; `node --test test/*.test.js` →
  **143/143/0**. Delta **+0 tests** (the two 060 tests were renamed in place
  and gained the appended glyph/label pins). After rebase on `main` (which
  gains issue 062's one test) the total will be **144/144/0**.
- **Playwright walk** (headless Chromium against this worktree served by
  `python3 -m http.server 8064`; the recorded PID 973128 died but left its
  python child — content-verified as *this* worktree's server, then killed by
  PID 973131; port refuses afterwards):
  - (a) teachers 1280×800: click "Abbassi" → input empty, `#searchDeselect`
    shown (`display: flex`), glyph `M19 12h-14M12 6l-7 6 7 6`,
    `aria-label="Back to the teacher list"`, `#searchClear` hidden (still ✕).
  - (b) press the arrow → control hidden (`display: none`), list back to 132,
    empty state "No Teacher Selected", no active row.
  - (c) select again, type "abb" → erase ✕ visible (glyph `M6 6l12 12M18 6L6 18`,
    `aria-label="Clear the search"`), arrow absent; press ✕ → text erased
    **only** (selection, detail "Abbassi" and the active row survive), list
    restored, arrow reappears.
  - (d) select + type + Backspace-to-empty → keyboard deselect works: value
    "", full list, empty state, no active row — and the arrow is correctly
    **absent** (with no selection there is no list to return to; state table
    walked exactly).
  - (e) teachers 390×844: select → `#searchDeselect` computed `display: none`
    (armour intact), overlay shows the name with `#overlayClear` ✕
    ("Clear the selection"), **0 visible arrows anywhere**; press ✕ →
    deselects to the empty state.
  - (f) classes mirror, desktop: select "LBC2-BI_A Groupe 1" → arrow +
    `aria-label="Back to the class list"`; press → list (94) + empty state;
    type "lbc" → erase ✕ only, selection/detail survive; erase → arrow
    returns. classes narrow: armour + overlay ✕ + 0 arrows; ✕ deselects.
  - (g) geometry: deselect box == input box exactly (teachers 25,181.34,
    350×38.375; classes 25,201.34, 350×38.375); glyph center == box center to
    the pixel (200,200.53 / 200,220.53) — 060's centered alignment preserved.
  - (h) console: **0 errors, 0 warnings** across the whole walk. Element
    screenshots saved outside the worktree
    (`…/clean/.playwright-mcp/064-teachers-arrow.png`, `064-classes-arrow*.png`)
    and visually confirmed: a clean centered ← with shaft.
- **`curl` 200**: `index.html`, `classes.html`, `styles.css`, `js/teachers.js`,
  `js/classes.js`, `time.html`, `timetable.html`, `emplois.csv`; the server is
  down afterwards (port 8064 refuses).
- **Diff hygiene** (C6): only `index.html`, `classes.html`, `styles.css` (two
  comment hunks), `test/teacher-daygroups.test.js` (060 test region),
  `test/classes.test.js` (060 test region) + this issue file. `js/` was never
  written to (no edit call on `js/teachers.js`/`js/classes.js`); the EOF of
  `test/teacher-daygroups.test.js` is byte-identical to its pre-edit state
  (issue 062's append surface intact); the erase ✕ markup, `#overlayClear`,
  `#searchBack`, the `[hidden]` rule and the narrow armour line are
  byte-preserved (visible as context in the diff above and asserted by the new
  pins).

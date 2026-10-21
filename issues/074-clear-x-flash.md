# 074: The filter box's clear X flashes on first paint

- Status: Fixed
- Date: 2026-10-21, Reporter: user

## Description

**Observed:** when a page with the filter box initially loads, the `X` button of
the filter box appears and then disappears immediately — a visible flash of the
clear button on the very first frames, gone a moment later.

**Expected:** on a cold load the filter is empty, so the clear `X` must never be
painted at all — the first frame and every frame until the user types must show
the plain box (placeholder only). The `X` appears only while the filter holds
text, exactly as it does during use.

## Root cause

`#searchClear` is the only conditionally-visible chrome node in `#searchWrap`
that ships **without** its `hidden` attribute: `#searchDeselect`,
`#searchOverlay` and `#suggest` all start `[hidden]` in the markup, and
`#searchBack`/`#searchOverlay` are covered by base `display: none` armour
(`styles.css:226-227`) — but `teachers/index.html:66` and `classes/index.html:67`
render `<button type="button" id="searchClear" …>` visible. The rule that paints
it is the id rule `#searchClear { display: flex; … }` (`styles.css:192`), and the
only rule that can suppress it is `#searchClear[hidden] { display: none; }`
(`styles.css:230`), which needs the attribute to be present.

The only writer of that attribute is `syncClear()`
(`js/teachers.js:192-195`, `js/classes.js:171-174`:
`searchClear.hidden = !search.value`), and its **first** call sits at the end of
`initTeachersPage`/`initClassesPage` (`js/teachers.js:679`, `js/classes.js:785`)
— which is only reached after `DOMContentLoaded → TT.data.loadStore()`
resolves the asynchronous `fetch(emplois.csv)` (`js/teachers.js:692-697`,
`js/classes.js:804-809`, `js/data.js:94`). So the timeline is: HTML + CSS
parsed → first paint paints the button visible (no `[hidden]`, id rule wins) →
the CSV fetch is still in flight → fetch resolves, boot runs, `syncClear()`
writes `hidden = true` → the `X` disappears. The slower the network (cold
cache, real device), the longer the flash; a script-delay experiment keeps it on
screen for as long as the page's JS is withheld, which pins the causality on the
markup default rather than on any later state write.

Hypothesis (a) — *markup/CSS default = visible, JS corrects to hidden* — is the
mechanism. Not (b): no `data-state`/absent attribute matches a "show" rule
before init; the show rule is the unconditional id rule. Not (c): the glyph is
inline SVG in markup, no font swap involved.

## Repro steps

```
cd <worktree> && python3 -m http.server 8123 &   # record PID, kill only it later
```

1. Open `http://localhost:8123/teachers/` (cold load, DevTools → Network →
   Slow 3G or just a cache-disabled reload) — the `X` at the right edge of the
   search box appears on the first frame and vanishes once
   `status` flips from "Loading emplois.csv…" to
   "2093 sessions · …".
2. Repeat on `http://localhost:8123/classes/` — same flash.
3. `at/`, `all/`, the root `index.html` and the `classes.html` stub carry no
   `#searchClear`, so they are unaffected.

## Discussion

### Fix implemented (2026-10-21)

**Approach:** make the markup declare the true initial state instead of letting
JS correct a wrong first frame. The filter boots empty, so `[hidden]` *is* the
initial state of `#searchClear` — exactly what every sibling conditional node in
`#searchWrap` already declares (`#searchDeselect`, `#searchOverlay`, `#suggest`
ship `hidden`; `#searchBack`/`#searchOverlay` ship base `display: none`
armour). `#searchClear` was the lone exception. The fix adds the missing
attribute to the two pages that own the box. **No JS, CSS, timer, flag or new
visibility mechanism was touched**: `syncClear()` stays the single writer of the
attribute and the single derivation (`hidden = !search.value`), so the diff
*removes* the "markup default lies until boot" special case rather than adding
state. No `setTimeout`/`requestAnimationFrame`, no inline style, no CSS
`display: none` armour (060's pins explicitly forbid re-adding it).

**Exact diff (4 files):**

```diff
--- a/teachers/index.html
+++ b/teachers/index.html
@@ -63,7 +63,7 @@
       <button type="button" id="searchBack" aria-label="Back">
         <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>
       </button>
-      <button type="button" id="searchClear" aria-label="Clear the search">
+      <button type="button" id="searchClear" aria-label="Clear the search" hidden>
         <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
       </button>
       <button type="button" id="searchDeselect" aria-label="Back to the teacher list" hidden>

--- a/classes/index.html
+++ b/classes/index.html
@@ -64,7 +64,7 @@
       <button type="button" id="searchBack" aria-label="Back">
         <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>
       </button>
-      <button type="button" id="searchClear" aria-label="Clear the search">
+      <button type="button" id="searchClear" aria-label="Clear the search" hidden>
         <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
       </button>
       <button type="button" id="searchDeselect" aria-label="Back to the class list" hidden>
```

```diff
--- a/test/teacher-daygroups.test.js
+++ b/test/teacher-daygroups.test.js
@@ (after the issues-060/064 test, before the issue-062 section) @@
   });
 });
+
+// ---- clear X absent from the first frame (issue 074) ------------------------
+
+test('the clear X ships hidden in the markup, so an empty filter never paints it (issue 074)', function () {
+  // The filter boots empty, so [hidden] IS the true initial state: the markup
+  // declares it, and syncClear() stays the sole writer of the attribute. Its
+  // first write lands only after the CSV fetch resolves (initTeachersPage /
+  // initClassesPage), so a markup default of "visible" paints the X from the
+  // first frame and yanks it away at boot — the reported flash.
+  var CLASSES_HTML = fs.readFileSync(path.join(ROOT, 'classes/index.html'), 'utf8');
+  var base = CSS_SRC.slice(0, CSS_SRC.indexOf('@media (max-width: 700px)'));
+  [INDEX_SRC, CLASSES_HTML].forEach(function (src, i) {
+    var tag = i ? 'classes' : 'teachers';
+    var clr = /<button[^>]*id="searchClear"[^>]*>/.exec(src);
+    assert.ok(clr, tag + ': #searchClear opening tag found');
+    assert.ok(/\shidden\s*>$/.test(clr[0]),
+      tag + ': the clear X ships hidden at first paint (issue 074), got: ' + clr[0]);
+    // the state the markup declares is real: the input itself ships empty, so
+    // [hidden] can never mask a pre-filled filter at first paint
+    var input = /<input[^>]*id="search"[^>]*>/.exec(src);
+    assert.ok(input, tag + ': #search input found');
+    assert.ok(!/\svalue=/.test(input[0]), tag + ': the filter boots empty');
+    // and the declared state really renders hidden: the id rule (flex +
+    // geometry) outranks the UA [hidden] default, so the base armour must stay
+    assert.ok(base.indexOf('#searchClear[hidden] { display: none; }') !== -1,
+      tag + ': base CSS honours #searchClear[hidden] so the markup default renders');
+    // every sibling chrome node in the wrap ships hidden or base armour too —
+    // no other node in #searchWrap can paint before boot writes its state
+    assert.ok(/<div id="searchOverlay" hidden>/.test(src), tag + ': overlay ships hidden');
+    assert.ok(/<ul id="suggest" hidden>/.test(src), tag + ': suggest ships hidden');
+    assert.ok(/id="searchDeselect"[^>]*\shidden>/.test(src), tag + ': deselect ships hidden');
+  });
+  // JS keeps exactly one visibility writer for the X — no second mechanism
+  [APP_SRC, CLASSES_SRC].forEach(function (src, i) {
+    var tag = i ? 'classes' : 'teachers';
+    assert.strictEqual((src.match(/searchClear\.hidden\s*=/g) || []).length, 1,
+      tag + ': syncClear is the only writer of the clear X visibility');
+  });
+});
```

```diff
--- a/test/classes.test.js
+++ b/test/classes.test.js
@@ (after the issues-060/064 test, before the issue-065 section) @@
   assert.ok(body('function onInput()').indexOf('showEmpty();') !== -1,
     'backspace-to-empty still deselects');
 });
+
+// ---- clear X absent from the first frame (issue 074) ------------------------
+
+test('classes ships the clear X hidden in the markup, so an empty filter never paints it (issue 074)', function () {
+  // Mirror of the teachers-side pin (test/teacher-daygroups.test.js): the
+  // filter boots empty, so [hidden] IS the true initial state — the markup
+  // declares it and syncClear() stays the sole writer of the attribute. Its
+  // first write lands only after the CSV fetch resolves, so a markup default
+  // of "visible" paints the X from the first frame and yanks it away at boot.
+  var html = readPage('classes/index.html');
+  var css = readPage('styles.css');
+  var base = css.slice(0, css.indexOf('@media (max-width: 700px)'));
+  var clr = /<button[^>]*id="searchClear"[^>]*>/.exec(html);
+  assert.ok(clr, '#searchClear opening tag found');
+  assert.ok(/\shidden\s*>$/.test(clr[0]),
+    'the clear X ships hidden at first paint (issue 074), got: ' + clr[0]);
+  // the state the markup declares is real: the input itself ships empty
+  var input = /<input[^>]*id="search"[^>]*>/.exec(html);
+  assert.ok(input, '#search input found');
+  assert.ok(!/\svalue=/.test(input[0]), 'the filter boots empty');
+  // the declared state really renders: the id rule outranks the UA [hidden]
+  // default, so the base armour rule must stay (no first-frame show rule)
+  assert.ok(base.indexOf('#searchClear[hidden] { display: none; }') !== -1,
+    'base CSS honours #searchClear[hidden] so the markup default renders');
+  // no second visibility mechanism for the X creeps in alongside [hidden]
+  assert.strictEqual((CLASSES_SRC.match(/searchClear\.hidden\s*=/g) || []).length, 1,
+    'syncClear is the only writer of the clear X visibility');
+});
```

**Verification (all in place, no commit):**

1. `node --test test/*.test.js` → **180 pass / 0 fail** (baseline on `main`:
   178 pass / 0 fail, run before the edit; +2 new tests, none weakened).
   Per-file: classes 66 · deadcode 3 · fusion 16 · libgroups 19 · offline 11 ·
   pwa 11 · redact 10 · teacher-daygroups 26 · teacher-subjects 5 · theme-boot 7
   · time-live 6.
2. `curl` from `python3 -m http.server 8123` (recorded PID, killed by PID only
   afterwards): `/teachers/` 200, `/classes/` 200, `/styles.css` 200.
3. **Playwright, cold loads** (fresh context per run; a `requestAnimationFrame`
   sampler installed via init script records `#searchClear`'s
   `[hidden]`/`display`/box on *every painted frame* until `load`; a variant
   delays `emplois.csv` by 800 ms to pin causality; screenshots in
   `/tmp/opencode/074/`):

   | run | viewport/scheme | before: visible frames | after: visible frames |
   |---|---|---|---|
   | teachers, CSV delayed 800 ms | 1280×800 light | **35/35** (X shown the whole window; probe at 400 ms `hidden:false display:flex`) | **0/24** (first frame `[hidden]=1`; probe `hidden:true display:none w:0`) |
   | classes, CSV delayed 800 ms | 1280×800 light | **31/31** | **0/47** |
   | teachers, plain cold | 1280×800 light | **3/19** (~348→377 ms) | **0/36** |
   | classes, plain cold | 1280×800 light | **4/29** (~558→589 ms) | **0/46** |
   | teachers, CSV delayed 800 ms | 390×844 dark | **46/46** | **0/41** |
   | classes, CSV delayed 800 ms | 390×844 dark | **36/36** | — (see restore row) |
   | classes, 065 restore (`emplois-class=GLSI3D1`), CSV delayed | 1280×800 light | n/a | **0/50**; after boot: X `[hidden]=true`, `#searchDeselect` `[hidden]=false display:flex`, value `""`, status "2093 sessions · 94 classes" |

   Before-fix screenshots show the `X` in the box while `#status` still reads
   "Loading emplois.csv…"; the after-fix screenshot of the same instant shows
   the bare box (placeholder only).
4. **Behaviour re-checks after the fix** (0 console errors on every run):
   - typing shows the X (`[hidden]=false display:flex`, 43 px box) on both pages
     at both viewports; clicking it empties the value and re-hides it;
   - 060/064 desktop walk on classes: row click → X hidden + back arrow
     `display:flex`, value `""`, detail "LBC2-BI_A Groupe 1"; typing while
     selected → X visible + arrow hidden; pressing the X → value `""` and the
     back arrow still visible (selection fact intact = erase-only); pressing
     the arrow → `.empty-state` renders, arrow hidden (deselect-only);
   - 065 restore at 390 px: boot shows `#searchOverlay` + `#overlayClear`
     `display:flex` with the restored week (detail "LCS3-GLSI_D Groupe 1…"),
     X hidden, value `""` — correct narrow chrome, no flash.

**Not done (deliberately):** no `setTimeout`/`requestAnimationFrame`/inline
`style="display:none"` delay or band-aid; no new flag, phase or state; no
duplicated visibility logic (the attribute stays the one channel); no CSS
`#searchClear { display: none; }` armour (060's pins forbid it and it would
duplicate `[hidden]`); no JS changes at all; `styles.css`, `js/*`, `data/`,
`vendor/*`, `assets/*`, `emplois.csv`, docs and sibling issues untouched; no
test assertion edited or weakened.

**Risks for review:**
- 060/064 invariants re-checked and pinned live: markup order
  `clr < des < ov`, glyph bytes of `#searchClear`, base armour absent,
  `[hidden]` honoured, erase-only/deselect-only split, keyboard backspace
  divergence (JS untouched, so source pins cannot have moved).
- teachers/classes `#searchClear` tags remain byte-identical (064's mirror
  claim): the same attribute was appended to both.
- Edge: if a browser restores a typed input value on a history navigation
  before first paint, the X would now appear at boot instead of from frame 1
  (opposite direction, one boot late; bfcache normally restores the whole JS
  state and avoids the re-render entirely). Acceptable: the channel is the same
  `[hidden]` attribute, and the restore path *should* derive from the value —
  no code was added for this hypothetical.
- Without JS (CSV fetch failure) the X no longer renders — previously it
  rendered as a dead button (its listeners are only bound at boot anyway).


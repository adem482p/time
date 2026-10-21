# 065: classes.html remembers the last selected class

- Status: Fixed
- Date: 2026-10-21, Reporter: user

## Description

Scope: the **classes page** — `classes.html` + `js/classes.js`
(`body data-page="classes"`, script `classes.html:72`). The user's binding
requirement, verbatim:

> "classes.html should remember the last selected class"

**Observed** (reproduced on this worktree at HEAD 8dcc676):

1. Open `classes.html`, pick a class (type + Enter, or tap a row) → its week
   detail renders, the row is marked, the name overlay shows the class.
2. Reload the page (F5 / Cmd-R), or navigate away and come back.
3. The page boots to the **empty funnel**: the kaomoji "No Class Selected"
   state, full catalogue, no overlay, no mark. The selection is gone.

Every load starts from zero; the user must re-find the class each visit.

**Expected**: after a class has been selected once, reloading `classes.html`
(or leaving and returning) lands on **that class's detail** — the same state
a fresh selection produces (detail rendered, active row marked, name overlay
up) — instead of the empty list. The selection persists in the browser.
If the user has explicitly deselected (deselect X / keyboard emptying),
a reload must restore **nothing** and show the empty state, as today.

## Root cause

The selection is **memory-only state**. The classes page keeps it in two
closure facts inside `initClassesPage` (`js/classes.js:107-108`):

```js
var selectedClass = null;
var activeKey = null;
```

Both are written only by the two funnels — `selectClass()` (the single
selection funnel, `js/classes.js:175-182`) and `showEmpty()` (the single
deselect funnel, `js/classes.js:165-171`) — and both live inside a closure
that is rebuilt from scratch on every page load. The boot tail
(`js/classes.js:730-736`) unconditionally runs `showEmpty()`, so the page
always restarts in the empty state. Nothing is ever written to
`localStorage` (the site's only persistence today is the theme scheme under
`emplois-theme`, `js/theme.js:749`), so there is nothing for boot to
restore. The state machine itself (issue 058: `empty` / `list` / `class`)
and every walk pin are correct — only the *longevity* of the selection fact
is missing.

## Repro steps

Commands (from the issue worktree root):

```
python3 -m http.server 8065        # note the PID; kill it by PID when done
```

Browser: `http://localhost:8065/classes.html`

1. Click the search box → type `GLSI3D1` → press **Enter** (or click the
   single row): the week detail renders, `#overlayName` shows the class,
   the list row is marked.
2. Reload the page (F5).
   - **Observed:** the empty state renders ("No Class Selected" kaomoji);
     no overlay, no marked row, nothing remembered.
   - **Expected:** the same class's detail renders, exactly as after step 1.
3. Select a class, then deselect it with the deselect X (or backspace the
   filter to empty), reload:
   - **Observed:** empty state (correct).
   - **Expected:** unchanged — an explicit deselect must restore nothing.

Baseline at reporting: `node --test` → **144 tests, 144 pass, 0 fail**.

## Discussion

### Maintainer decision (2026-10-21)

Triage: **valid and in scope** as stated — `classes.html` only. Measured
research before deciding:

- *Selection facts*: `selectedClass` (`js/classes.js:107`) is THE selection
  fact; `activeKey` (`js/classes.js:108`) is a downstream mark of the list
  row, re-derived by `renderList`/`markActive`. Only two funnels write
  `selectedClass`: `selectClass()` (`js/classes.js:175-182`, every picking
  path — row tap, commit's three gates, onInput auto-jump, acceptSuggest —
  lands here) and `showEmpty()` (`js/classes.js:165-171`, every deselect:
  `#overlayClear`, `#searchDeselect`, keyboard emptying, boot). `eraseFilter()`
  (`js/classes.js:578-585`) deliberately writes no selection fact (pinned 060)
  — so it must write no storage either. **Storage mirrors `selectedClass`
  exactly: one write site per funnel, no third site** (this preserves the
  058 discipline that only the funnels write selection state).
- *What a restore must reproduce*: measured against a fresh row click
  (row click does NOT rewrite the filter — pinned "G1 keep-filter"). The
  restorable state is: `menuOpen=false`, `selectedClass=ref`, week detail
  rendered by `showClass(ref)`, `markActive(ref)` on the already-rendered
  full catalogue, overlay visible with the name, filter empty (so the
  deselect X derives visible exactly as after a row click). Calling
  `selectClass(storedRef)` at boot after the normal initial paint produces
  byte-identical side effects to a row click — no other fact rides along.
- *Persistence precedent*: `js/theme.js:749` stores under
  `var STORAGE_KEY = 'emplois-theme'` — house convention is the
  `emplois-*` localStorage key prefix, with `readState`/`writeState`
  (`js/theme.js:886-903`) guarding every access with
  `typeof localStorage === 'undefined'` inside `try/catch`. Match it.
- *URL/deep link*: measured — **none exists**. The only `location.search`
  read in the whole site is `?redact=1` in `js/data.js:101`;
  `js/classes.js` and `classes.html` read no URL state, and `match.js`
  `resolveClass` (`js/match.js:96`) is an exact-key resolver, not URL
  handling. So there is no priority conflict to arbitrate today. Ruling for
  the future: a URL param is a *fresh, explicit* intent and must beat
  stored state — if a deep-link param is ever added it is read first and
  the stored restore is skipped. Adding such a param is **out of scope**
  here (scope fence: no URL/hash change).
- *Boot path*: the pin `test/classes.test.js:1164-1165` slices the boot
  tail from `// initial paint` to `clock.subscribe(onTick);` and asserts
  `showEmpty();` — "boot paints through the empty funnel".

**Decision — how to implement it** (folding was authorized; I proceed
straight to implementation as the Implementer):

**Acceptance criteria**

1. **Mechanism/key/value**: `localStorage` (not `sessionStorage` — "remember
   the last selected class" must survive browser restarts, exactly like the
   theme scheme does), key **`emplois-class`** (house `emplois-*` prefix per
   `emplois-theme`). Value: the raw ref string `selectedClass` holds (e.g.
   `GLSI3D1`, or whatever spelling `selectClass` received) — no JSON
   envelope needed for a single string.
2. **Write site**: exactly one — inside `selectClass()`, at the same
   statement group where `selectedClass = ref` is written, so fact and
   storage can never diverge. No other `writeStoredClass` call may exist
   (pinned by count).
3. **Clear site**: exactly one — inside `showEmpty()`, next to
   `selectedClass = null`. Consequences (all intended): explicit deselect →
   reload restores nothing; boot with no/stale/invalid stored key →
   `showEmpty()` at boot clears the key (stale keys self-clean);
   `commit()`'s nomatch branch and `eraseFilter()` (which never deselect,
   pinned 060) do **not** touch storage — the last *selection* stands, which
   is precisely what the user asked to remember.
4. **Boot restore shape (the `bootTail` pin ruling)**: the boot tail keeps
   `showEmpty();` **verbatim as the no-stored-state fallback**, and the
   restore is structured AROUND it, in this order: (i) `readStoredClass()`
   into a local **before** the funnel runs (the funnel clears storage);
   (ii) current paint unchanged (`renderList`, `showEmpty();`, `syncList`,
   `syncClear()`); (iii) `if (stored && restorable(groups, stored))
   selectClass(stored);` (iv) `clock.subscribe(onTick);` last, as today.
   Result: no stored state → today's behavior byte-for-byte; stored state →
   boot lands in the `class` state a fresh click produces (detail, marked
   row, overlay, empty filter, menu closed). The existing pin at
   `test/classes.test.js:1164-1165` therefore survives **verbatim and
   unchanged** — it was written to assert the fallback, which stays true.
5. **Validation**: the stored key must still resolve against the **live**
   index (CSV is the single source of truth) via `model.classWeek(groups,
   ref).leaves.length === 1` — an interior node (>1 leaves), an unknown or
   removed class, or a non-string fails. The check runs inside `try/catch`:
   measured pre-existing quirk — `groups.byKey` is a plain object
   (`js/libgroups.js:715`), so `classWeek(groups, 'constructor')` throws
   (`byKey['constructor']` hits the prototype and `n.leaves` is not a
   function). That quirk already exists for typed input and is **out of
   scope** (`model.js` is not an allowed file); the boot gate must simply
   swallow it so a tampered value can never break boot. On failure the
   empty funnel stands and the key is already cleared (criterion 3).
6. **Storage failures**: every access (`read`/`write`) wrapped in
   `try/catch` with a `typeof localStorage === 'undefined'` guard, the exact
   `theme.js` `readState`/`writeState` shape — private mode, quota
   exceptions, and test contexts without `localStorage` degrade to today's
   no-memory behavior; boot never throws from persistence.
7. **Scope fences**: `index.html` / `js/teachers.js` untouched (no
   cross-page persistence); search query NOT persisted (transient — the
   filter box boots empty as today); no URL/hash change; no
   service-worker/offline interaction (none exists); week/clock state
   unchanged (it derives from the clock — `renderWeek` from `Date`, not from
   the selection); `eraseFilter()` / `syncClear()` / `syncOverlay()` /
   `syncDeselect()` semantics untouched; zero diff to `classes.html`,
   `styles.css`, `js/theme.js`, `js/data.js`.
8. **Tests** (appended as one line-local block at the EOF of
   `test/classes.test.js`):
   - (a) **write sites**: `writeStoredClass(` occurs exactly 3× in
     `js/classes.js` (definition + `selectClass` + `showEmpty`) — no other
     write site; `selectClass` body carries `writeStoredClass(ref)`.
   - (b) **read + validate**: boot order pinned — `readStoredClass()` index
     precedes `showEmpty();` in the boot tail; the gate
     `restorable(groups, stored)` and `selectClass(stored)` present,
     `selectClass(stored)` exactly once.
   - (c) **clear-on-deselect**: `showEmpty` body carries the clear
     (`writeStoredClass(null)`); `eraseFilter` body carries no storage call
     (060 erase-only stays pure).
   - (d) **boot fallback structure**: re-pin that the boot tail still
     contains `showEmpty();` (the fallback the `bootTail` pin at
     `test/classes.test.js:1165` asserts).
   - **Behavioral** (real logic in node, per AGENTS.md): the persistence
     helpers + `restorable` sliced from source into a vm sandbox —
     write/read round-trip, falsy write removes, absent `localStorage`
     → `null`/no-throw, throwing storage → `null`/no-throw, and
     `restorable` against the real `groups`/`model`: real leaf `GLSI3D1` →
     true, interior `LCS` → false, unknown `ZZZZ` → false, prototype key
     `constructor` → false **without throwing**, `null` → false.
   - **Expected delta, stated explicitly**: baseline re-verified on this
     branch before any edit → **144/144/0**. This issue adds **5 tests** →
     **149/149/0** on `fix/065-remember-class`. Sibling issue 064 also
     appends to main, so the post-rebase total on main will be
     `144 + 064's delta + 5` — the rebase verifies each side's stated count.
9. **Risks to guard**: all 056/058/060 walk pins must survive (enumerated):
   the funnels' `fnBody` pins (`test/classes.test.js:1115-1122`) — the new
   lines are additions inside the bodies, all pinned tokens remain; the
   week-slice purity pin (`test/classes.test.js:1099-1103`) — the new
   helpers live *before* `initClassesPage`, outside the
   `indexByDaySlot`→`showClass` slice, and the boot restore sits *after*
   `function showClass`; the `eraseFilter` pins
   (`test/classes.test.js:1265-1276`) — untouched; the `bootTail` pin —
   criterion 4 keeps it verbatim; the 051 clock pins (`new Date()` count
   === 3, `currentWeek = null;` count === 3) — the new code adds neither
   token. **No 056/051 resurrection**: the restore runs once at boot,
   *before* `clock.subscribe(onTick)`, and re-enters only `selectClass` (the
   same funnel a click uses); the deselect path still nulls `currentWeek`,
   so a tick after a deselect can never repaint, exactly as pinned at
   `test/classes.test.js:1040-1052`. Re-run those walks in verification.

**Requests**: none — folding authorized, proceeding directly to
implementation.

### Fix implemented (2026-10-21)

Implemented in place by the folded Reporter→Maintainer→Implementer agent
(user-authorized collapse for this small task), worktree
`/home/user/.local/share/opencode/worktree/1de5bb/065-remember-class`.
**No git of any kind was used, nothing was committed, `Status:` stays
`Open`** for the main agent to flip at merge. Process order honoured:
issue file (Description/Root cause/Repro) → the Maintainer entry above →
the implementation → this entry.

**Files changed — allowed list only, three files:**

- `js/classes.js` — 3 hunks (new persistence block after the clock IIFE,
  one call line in each of the two funnels, boot-tail restore)
- `test/classes.test.js` — one EOF append (3 helpers + 5 tests)
- `issues/065-remember-last-class.md` — new file (this document; its diff
  is `--- /dev/null` → `+++ b/issues/065-remember-last-class.md`, entirely
  new — not re-inlined here to avoid quoting this entry inside itself)

**Exact unified diff.** No git was available (subagent rule), so the base
was reconstructed by reverse-applying the four edits above (line-based,
each removal/replacement asserted unique) and sanity-checked against the
pre-edit reads: reconstructed `js/classes.js` = **755 lines** and
`test/classes.test.js` = **1301 lines** — exactly the pre-edit file
lengths — then `diff -u` of reconstructed-base → current worktree:

```diff
--- a/js/classes.js
+++ b/js/classes.js
@@ -55,6 +55,51 @@
     };
   })();
 
+  // ---- last selected class (issue 065) --------------------------------------
+  // classes.html remembers the selection across loads. House persistence
+  // precedent: js/theme.js stores its scheme under the `emplois-*`
+  // localStorage key ('emplois-theme'); this page mirrors its selection fact
+  // (selectedClass) under 'emplois-class'. localStorage, not sessionStorage:
+  // "remember the last class" spans browser sessions, like the theme does.
+  // The value is the raw ref selectClass received — the ref the one funnel
+  // already renders from, so a restore re-runs the exact selection path. One
+  // write site per funnel (writeStoredClass in selectClass and showEmpty)
+  // and nowhere else, so fact and storage can never diverge; every access is
+  // wrapped like theme.js's readState/writeState — private mode, quota
+  // exceptions, or a context without localStorage degrade to today's
+  // no-memory behavior and never break boot.
+  var CLASS_STORE_KEY = 'emplois-class';
+
+  function readStoredClass() {
+    try {
+      if (typeof localStorage === 'undefined' || !localStorage) return null;
+      var v = localStorage.getItem(CLASS_STORE_KEY);
+      return typeof v === 'string' && v ? v : null;
+    } catch (e) { return null; }
+  }
+
+  // one writer: a ref persists it, a falsy ref clears it (the deselect
+  // funnel and the stale-key clear at boot both land here)
+  function writeStoredClass(ref) {
+    try {
+      if (typeof localStorage === 'undefined' || !localStorage) return;
+      if (ref) localStorage.setItem(CLASS_STORE_KEY, ref);
+      else localStorage.removeItem(CLASS_STORE_KEY);
+    } catch (e) { /* storage unavailable (private mode) */ }
+  }
+
+  // Boot validation gate: the CSV is the single source of truth, so a stored
+  // ref must still resolve to exactly one live leaf or it is stale (class
+  // removed/renamed since it was selected) and the empty funnel stands. The
+  // check runs inside try/catch because groups.byKey is a plain object
+  // (libgroups.js): prototype keys ('constructor'…) throw instead of
+  // missing, and a tampered stored value must never break boot.
+  function restorable(groups, ref) {
+    if (!ref || typeof ref !== 'string') return false;
+    try { return model.classWeek(groups, ref).leaves.length === 1; }
+    catch (e) { return false; }
+  }
+
   // ---- classes page -----------------------------------------------------------
 
   // Student-facing class timetable (issue 032). The class is chosen through a
@@ -164,6 +209,7 @@
     // can leave tick ownership behind and repaint over the empty page
     function showEmpty() {
       selectedClass = null;
+      writeStoredClass(null); // explicit deselect forgets the class (issue 065)
       currentWeek = null;
       detail.innerHTML = emptyStateHTML();
       markActive(null);
@@ -174,6 +220,7 @@
     // here; blurs because the overlay owns the box in state=class
     function selectClass(ref) {
       selectedClass = ref;
+      writeStoredClass(ref); // persist the committed selection (issue 065)
       showClass(ref);
       search.blur();
       menuOpen = false;
@@ -727,11 +774,20 @@
       searchDeselect.addEventListener('click', function () { showEmpty(); });
     }
 
-    // initial paint: full leaf catalogue, empty detail
+    // initial paint: full leaf catalogue, empty detail. The last selected
+    // class is read BEFORE the funnel below — showEmpty clears storage —
+    // and restored after it (issue 065).
+    var stored = readStoredClass();
     renderList(leafRows(match.classSearch(index, '')));
     showEmpty();
     syncList();
     syncClear();
+    // restore (issue 065): a stored ref that still resolves against the live
+    // catalogue re-enters the one selection funnel, so the page boots into
+    // the exact state a fresh row click produces (detail, marked row, name
+    // overlay, closed menu, empty filter). Anything stale/unknown falls
+    // through to the empty state above — which already cleared its key.
+    if (stored && restorable(groups, stored)) selectClass(stored);
     // the page subscribes once at init; the clock owns the cadence (issue 051)
     clock.subscribe(onTick);
   }
--- a/test/classes.test.js
+++ b/test/classes.test.js
@@ -1299,3 +1299,144 @@
   assert.ok(body('function onInput()').indexOf('showEmpty();') !== -1,
     'backspace-to-empty still deselects');
 });
+
+// ---- last selected class (issue 065) -----------------------------------------
+
+// The persistence block of js/classes.js (CLASS_STORE_KEY + the two guarded
+// accessors + the boot validation gate), sliced straight from source and run
+// in a vm with an injected localStorage — the real logic against real
+// storage stand-ins, mirroring the week/list harnesses above.
+function persistenceBlock() {
+  var start = CLASSES_SRC.indexOf('var CLASS_STORE_KEY');
+  var end = CLASSES_SRC.indexOf('// ---- classes page', start);
+  assert.ok(start !== -1 && end !== -1 && end > start, 'persistence block bounds');
+  return CLASSES_SRC.slice(start, end);
+}
+
+function runPersistence(localStorage) {
+  var sandbox = { console: console, model: model };
+  if (localStorage !== undefined) sandbox.localStorage = localStorage;
+  vm.createContext(sandbox);
+  vm.runInContext(persistenceBlock(), sandbox, { filename: 'classes-persistence-harness' });
+  return sandbox;
+}
+
+function memoryStorage() {
+  var map = {};
+  return {
+    map: map,
+    getItem: function (k) { return Object.prototype.hasOwnProperty.call(map, k) ? map[k] : null; },
+    setItem: function (k, v) { map[k] = String(v); },
+    removeItem: function (k) { delete map[k]; }
+  };
+}
+
+test('the selection funnels are the only storage write sites (issue 065)', function () {
+  var src = CLASSES_SRC;
+  // (a) definition + selectClass + showEmpty — exactly three, no other site
+  assert.strictEqual(countTok(src, 'writeStoredClass('), 3,
+    'one definition, one write in selectClass, one clear in showEmpty');
+  assert.strictEqual(countTok(src, 'readStoredClass('), 2,
+    'one definition, one read at boot');
+  function body(sig) {
+    var start = src.indexOf(sig);
+    assert.ok(start !== -1, sig + ' found');
+    var end = src.indexOf('\n    }', start);
+    assert.ok(end !== -1, sig + ' bounds');
+    return src.slice(start, end + '\n    }'.length);
+  }
+  // write on selection commit, at the same statement group as the fact
+  var sel = body('function selectClass(ref)');
+  assert.ok(sel.indexOf('selectedClass = ref') !== -1, 'the fact write stays');
+  assert.ok(sel.indexOf('writeStoredClass(ref)') !== -1, 'selectClass persists the ref');
+  assert.ok(sel.indexOf('selectedClass = ref') < sel.indexOf('writeStoredClass(ref)'),
+    'storage mirrors the fact, in order');
+  // (c) clear on explicit deselect, next to the fact clear
+  var emp = body('function showEmpty()');
+  assert.ok(emp.indexOf('selectedClass = null') !== -1, 'the fact clear stays');
+  assert.ok(emp.indexOf('writeStoredClass(null)') !== -1, 'showEmpty forgets the class');
+  // the 060 erase-only funnel stays pure: no selection fact, no storage
+  var ef = body('function eraseFilter()');
+  assert.ok(ef.indexOf('StoredClass') === -1 && ef.indexOf('localStorage') === -1,
+    'eraseFilter never touches persistence');
+});
+
+test('boot reads, validates and restores around the empty funnel (issue 065)', function () {
+  var src = CLASSES_SRC;
+  var bootAt = src.indexOf('// initial paint');
+  var subAt = src.indexOf('clock.subscribe(onTick);');
+  assert.ok(bootAt !== -1 && subAt > bootAt, 'boot tail bounds');
+  var boot = src.slice(bootAt, subAt);
+  // (b) read BEFORE the funnel — showEmpty clears storage, so the local wins
+  assert.ok(boot.indexOf('var stored = readStoredClass();') !== -1, 'boot reads the stored key');
+  assert.ok(boot.indexOf('var stored = readStoredClass();') < boot.indexOf('showEmpty();'),
+    'the read precedes the clearing funnel');
+  // (b) live validation gate, then re-entry through the one selection funnel;
+  // the slice ends at clock.subscribe(onTick);, so the restore is one-shot at
+  // boot, before the page ever subscribes
+  assert.ok(boot.indexOf('if (stored && restorable(groups, stored)) selectClass(stored);') !== -1,
+    'validated restore re-enters selectClass');
+  assert.strictEqual(countTok(src, 'selectClass(stored)'), 1, 'exactly one restore call');
+  // (d) the no-stored-state fallback keeps the pinned shape verbatim — the
+  // existing bootTail pin (test/classes.test.js, issue 058) asserts it
+  assert.ok(boot.indexOf('showEmpty();') !== -1,
+    'boot still paints through the empty funnel');
+});
+
+test('the stored class round-trips and clears through the guarded accessors (issue 065)', function () {
+  var store = memoryStorage();
+  var sb = runPersistence(store);
+  // write + read round-trip of the exact ref selectClass hands over
+  sb.writeStoredClass('GLSI3D1');
+  assert.strictEqual(store.map['emplois-class'], 'GLSI3D1', 'written under the house key');
+  assert.strictEqual(sb.readStoredClass(), 'GLSI3D1', 'read back the same ref');
+  // another spelling selectClass accepts (full name) survives verbatim
+  sb.writeStoredClass('LCS2-GLSI_C Groupe 2');
+  assert.strictEqual(sb.readStoredClass(), 'LCS2-GLSI_C Groupe 2');
+  // (c) a falsy write clears the key — the showEmpty path
+  sb.writeStoredClass(null);
+  assert.strictEqual('emplois-class' in store.map, false, 'deselect removes the key');
+  assert.strictEqual(sb.readStoredClass(), null, 'nothing left to restore');
+  // the empty string reads as nothing, never as a class
+  sb.writeStoredClass('GLSI3D1');
+  sb.writeStoredClass('');
+  assert.strictEqual(sb.readStoredClass(), null, 'the empty string is not a class');
+});
+
+test('storage failures degrade to no-memory behavior (issue 065)', function () {
+  // no localStorage at all (node/test context): both accessors no-op
+  var bare = runPersistence(undefined);
+  assert.strictEqual(bare.readStoredClass(), null, 'read yields null without storage');
+  assert.doesNotThrow(function () { bare.writeStoredClass('GLSI3D1'); },
+    'write never throws without storage');
+  assert.doesNotThrow(function () { bare.writeStoredClass(null); },
+    'clear never throws without storage');
+  // private mode / quota: every method throws — both accessors swallow it
+  var broken = {
+    getItem: function () { throw new Error('SecurityError'); },
+    setItem: function () { throw new Error('QuotaExceededError'); },
+    removeItem: function () { throw new Error('SecurityError'); }
+  };
+  var sb = runPersistence(broken);
+  assert.strictEqual(sb.readStoredClass(), null, 'a throwing read yields null');
+  assert.doesNotThrow(function () { sb.writeStoredClass('GLSI3D1'); },
+    'a throwing write never escapes');
+  assert.doesNotThrow(function () { sb.writeStoredClass(null); },
+    'a throwing clear never escapes');
+});
+
+test('restorable validates the stored ref against the live catalogue (issue 065)', function () {
+  var sb = runPersistence(memoryStorage());
+  // a real leaf restores
+  assert.strictEqual(sb.restorable(groups, 'GLSI3D1'), true);
+  // an interior node unions >1 leaves and was never selectable: falls through
+  assert.strictEqual(sb.restorable(groups, 'LCS'), false);
+  // unknown / removed class (the CSV is the single source of truth): falls through
+  assert.strictEqual(sb.restorable(groups, 'ZZZZ'), false);
+  // tampered prototype-key value: classWeek's plain-byKey quirk must not escape
+  assert.strictEqual(sb.restorable(groups, 'constructor'), false);
+  // non-strings never pass
+  [null, undefined, 42, {}].forEach(function (v) {
+    assert.strictEqual(sb.restorable(groups, v), false, 'rejects ' + String(v));
+  });
+});
```

**Verification results.**

- **Tests:** `node --test` → **149 tests, 149 pass, 0 fail**;
  `node --test test/*.test.js` → **149/149/0** (8 test files). Baseline
  re-verified **144/144/0** on this branch before any edit → delta **+5**,
  exactly as ruled (post-rebase main = `144 + 064's delta + 5`).
- **Playwright walk** (headless Chromium, this worktree served by
  `python3 -m http.server 8065`, wrapper PID 973996 recorded in
  `/tmp/opencode/http065.pid`) — **0 console errors across the entire
  walk** (only the pre-existing repo-wide favicon absence; the walk's
  error tally was read repeatedly via `browser_console_messages`):
  - **(a) select → reload → same class ✓** — select `GLSI3D1` (Enter) →
    `page.reload()`; the navigation entry is `type: reload` (a first F5
    attempt via key press was silently swallowed by the MCP — caught
    because the search input cannot carry text into a new document, and
    re-done with a real reload): detail `<h2>LCS3-GLSI_D Groupe 1</h2>`,
    active row `['GLSI3D1']`, overlay name `GLSI3D1`, filter empty (query
    NOT persisted — matches a fresh row-click), deselect X derived visible,
    `localStorage['emplois-class'] = 'GLSI3D1'`, 0 errors.
  - **(b) deselect → reload → nothing ✓** — desktop deselect X → key
    removed *immediately* (`'emplois-class' in localStorage === false`);
    reload → empty funnel, key absent, no restore, 0 errors.
  - **(c) bogus keys ✓** — planted `ZZZ999` → reload → empty funnel, key
    **cleared**, 0 errors; planted `constructor` (the `byKey` prototype
    quirk that *throws* inside `classWeek` without the gate) → empty
    funnel, key cleared, boot intact (`status: 2093 sessions · 94
    classes`), 0 errors.
  - **(d) storage failure ✓** — init script installs a `localStorage`
    getter that throws under `#breakstorage`: boot completes to today's
    behavior (status set, empty funnel, `localStorage` provably throws in
    page); selecting a class still renders the full detail (write
    swallowed); reload under broken storage → empty funnel (today's
    behavior); 0 errors; without the hash the getter delegates to the real
    storage again (walk steps after (d) verified it working).
  - **(e) URL param ✓ (measured: none exists)** — the only URL read site
    in the codebase is `?redact=1` in `js/data.js:101`; `?class=SD1&foo=bar`
    is completely ignored: with stored state the stored class renders, with
    storage cleared the page boots empty. No URL/hash change was made; the
    future priority rule (a fresh param must beat stored state) is recorded
    in the Maintainer entry.
  - **(f) no cross-page leakage ✓** — after using classes.html,
    `index.html` boots its own default (teacher empty funnel, `status:
    2093 sessions · 132 teachers`, no class detail), 0 errors;
    `emplois-class` exists in the shared origin but is only ever read by
    `js/classes.js` (sole reader, pinned by `readStoredClass(` count = 2);
    navigating back to classes.html restores the class (leave & come
    back ✓).
  - **(g) 058 + 060 walks re-run ✓** — *058 narrow, 390×844*: boot empty →
    focus = list state → typing = 2 leaf suggestions → row tap = class
    state (detail + overlay + key) → overlay tap = list + focused box →
    back arrow = class still selected → overlay X = empty + key cleared →
    keyboard emptying (reopen menu, Ctrl+A, Backspace) = empty + key
    cleared (pinned 058 ruling 5) → after a deselect, a forced clock tick
    (`visibilitychange` with `document.hidden === false`) leaves the page
    **empty — no 056/051 resurrection**. *060 desktop, 1280×800*: select →
    clear X erases the text only (selection, detail, active row **and
    storage** all stand; deselect X derives visible) → deselect X clears
    selection + key, and the press never focuses (`activeElement` stays
    `BODY`). Back-arrow/X *glyph* changes belong to sibling 064 — this walk
    verified current behavior, not its pending glyphs. 0 errors on both.
  - **(h) reload stability ✓** — three consecutive reloads: identical
    every time (1 `h2`, 1 `table.week`, 6 `section.day-group`, 1 active
    row, 94 list rows, overlay name, key stable) — no drift, no
    duplication.
- **HTTP:** `/`, `/classes.html`, `/index.html`, `/time.html`,
  `/timetable.html` → **200 (5/5)**.
- **Server killed by PID**: the recorded PID 973996 was a wrapper
  subshell; `ss -ltnp` identified the real `python3 -m http.server` process
  **973998**, killed individually; verified dead (`kill -0` fails, port
  8065 closed, curl → connection refused). No `pkill -f` was used at any
  point; the sibling servers on ports 8085/45815/8113 (other worktrees)
  were left untouched.
- **Diff hygiene:** my write/edit calls touched exactly three files —
  `js/classes.js`, `test/classes.test.js`, `issues/065-remember-last-class.md`.
  Zero diff to `classes.html` (still carries the 060 X glyph byte-for-byte,
  confirmed absent of 064's arrow), `index.html`, `js/theme.js`,
  `js/teachers.js`, `styles.css` — no CSS need arose, per criterion 7.
  Cross-check against the `clean` worktree (main, which now carries sibling
  064): the only differences are 065's three files, plus 064's own surfaces
  (`classes.html`, `index.html`, `js/teachers.js`, `styles.css`,
  `test/teacher-daygroups.test.js`, `issues/064-deselect-back-arrow.md`) —
  none of which I wrote.
- **Sibling-overlap analysis for the merge (064 in main):** 064's
  `js/classes.js` hunks are **comment-only** at three regions (the
  syncDeselect comment ~line 131, the eraseFilter comment ~577, the
  searchDeselect-handler comment ~722) — disjoint from my three hunks
  (block after line 55, funnel call lines 209/220, boot tail 774), though
  the last pair is adjacent with touching (unchanged) context; 064's
  `test/classes.test.js` hunks are all mid-file (`@@ -1201`, `@@ -1230`,
  `@@ -1282`) and 064 did **not** append at EOF — its file still ends at
  the same `});` (line 1301), so my EOF append lands cleanly.

**Criterion checklist** (numbering from the Maintainer entry):

1. ✓ `localStorage`, key `emplois-class`, value = the raw `selectedClass`
   ref — implemented as ruled.
2. ✓ Write site: exactly one — inside `selectClass`, next to the fact;
   pinned by `writeStoredClass(` count = 3.
3. ✓ Clear site: exactly one — inside `showEmpty`, next to the fact clear;
   deselect → reload restores nothing; stale keys cleared at boot;
   `commit()` nomatch and `eraseFilter()` untouched (pinned).
4. ✓ Boot shape: read → `renderList` → `showEmpty();` (verbatim fallback)
   → `syncList`/`syncClear` → conditional `selectClass(stored)` →
   `clock.subscribe(onTick)`; the existing `bootTail` pin at
   `test/classes.test.js:1164-1165` survives **unchanged and passing** (no
   edit to the 058 test block).
5. ✓ Validation: `model.classWeek(groups, ref).leaves.length === 1` against
   the live index, behind `try/catch` (prototype-key quirk); failure falls
   through to the empty funnel with the key already cleared — proven live
   in walk (c) and pinned by the `restorable` behavior test.
6. ✓ Storage failures: theme.js-shaped guards on both accessors — proven
   live in walk (d) (throwing `localStorage`: boot + select + reload all
   fine) and pinned by the degradation test (absent storage + all-throwing
   storage).
7. ✓ Scope fences: `index.html` untouched; search query not persisted
   (walk a/h: filter empty after every reload); no URL/hash change (walk
   e); no service-worker interaction; week/clock unchanged (051 pins pass);
   `eraseFilter`/`syncClear`/`syncOverlay` semantics untouched (060 pins
   pass + walk g).
8. ✓ Tests: (a) write sites, (b) read+validate site, (c) clear-on-deselect
   site, (d) boot fallback structure — all appended in one line-local EOF
   block; `bootTail` ruling implemented as preferred (pin survives
   verbatim); stated delta **+5 → 149/149/0** achieved.
9. ✓ Risks: all 144 pre-existing tests pass untouched (056/058/060/051
   pins included); the forced-tick-after-deselect step of walk (g) proves
   no resurrection.

**Deviations: none.** No criterion was impossible or self-contradictory.
Two notes recorded above and already ruled in the Maintainer entry: (i)
the underlying `classWeek` prototype-key quirk is pre-existing and
out-of-scope (`model.js` not in the allowed file list) — it is *gated*,
not fixed; (ii) `commit()`'s nomatch branch leaves the previous selection
(and therefore the stored key) standing, because it does not deselect
today — storage mirrors the `selectedClass` fact exactly (criterion 3).


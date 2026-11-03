# 062: Remove the per-name session-count badges from the teachers list

- Status: Fixed
- Date: 2026-10-20, Reporter: user

## Description

**Request (user, verbatim):**

> in the list of teachers, each teacher name is followed by `(n)` where `n` is
> the number of sessions. this is useless, so remove it.

### Observed (measured on this worktree, HEAD `9d5e407`)

The teachers page is `index.html` (`body data-page="teachers"`, loads
`js/teachers.js`); the badge is emitted in two render sites and styled by one
shared CSS rule:

1. **List rows** — `js/teachers.js:266-268`, inside `renderItem(r)` (the sole
   builder of `#teacherList` rows, called from `renderList`):

   ```js
   var h = match.highlightHTML(r.teacher, r.nameRanges) +
     ' <span class="n">(' + store.sessionsOf(r.teacher).length + ')</span>';
   ```

   The span is appended **unconditionally**, so every row reads e.g.
   `Barboura (18)`. The leading space travels inside the same string
   literal as the span.

2. **Search-suggest rows** — `js/teachers.js:443-445`, inside
   `renderSuggest(rows)` for `r.kind === 'teacher'`:

   ```js
   body = match.highlightHTML(r.label, r.ranges) +
     ' <span class="n">(' + store.sessionsOf(r.label).length + ')</span>';
   ```

   Autocomplete rows read e.g. `teacher Barboura (18)` (the `kind` chip
   precedes `body` at `js/teachers.js:449`).

3. **The styling** — `styles.css:174`:
   `#suggest .n, #teacherList .n { color: var(--md-on-surface-variant, #666); font-size: .85em; }`
   — it exists solely for the two badges above (grep of every
   `class="n"` producer: only `js/teachers.js:268,270,445`).

4. **Dead sibling rule** — `styles.css:728`:
   `#classList .n { color: …; font-size: .85em; }` has **no consumer**:
   `js/classes.js` emits `class="n"` nowhere (its list rows use
   `class="alias"` at `js/classes.js:260-261`, its suggest rows use
   `class="alias"` at `js/classes.js:479-480`), and no `.html` file in the
   tree contains `class="n"` (grep over `*.html` → 0 hits). No test pins it.

5. **Count-free surfaces that must stay that way** — the classes page list
   and suggest rows carry no count (already pinned by the negative
   `test/classes.test.js:864`
   `'no count badge in class rows'`), and the teachers **detail** page counts
   (`breakdownHTML`/`treeHTML` `class="hours"` spans, `js/teachers.js:325,335`)
   plus the `#status` totals line
   (`js/teachers.js:173` `store.size + ' sessions · ' + store.teachers.length + ' teachers'`)
   are different surfaces, not the per-name badge the user reports.

6. **Adjacent, same row, different badge** — `js/teachers.js:269-270`
   appends ` <span class="n">(Xh00 relevant)</span>` **only when
   `r.relevantSessions > 0`**, which `js/match.js:250-258` can only make
   positive for an *exact* query (the whole query equals a teacher name, a
   subject, or a class). It is an hours label with a word, not "the number of
   sessions", and it never appears on the unfiltered list the user described.

No test pins the teachers-side count: `grep -rn 'class="n"' test/` matches
only `test/classes.test.js:864`, which pins the **absence** of the badge in
`js/classes.js` and must stay green untouched.

### Expected

Teacher rows show the teacher's name and nothing else: no `(n)` after the
name in `#teacherList`, no `(n)` after teacher rows in the `#suggest`
overlay, no leftover gap where the badge was. Detail-page counts, the
`#status` totals line, and the classes page stay exactly as they are.

## Root cause

The list renderer bakes the session count into row identity:
`renderItem` concatenates `' <span class="n">(' + store.sessionsOf(…).length + ')</span>'`
onto the highlighted name for every hit (`js/teachers.js:268`), and the
autocomplete renderer does the same for teacher-kind rows
(`js/teachers.js:445`); `styles.css:174` then styles both `.n` spans. The
badge predates the count-free convention the project already follows
elsewhere — the classes list/suggest rows were stripped of counts and the
absence was pinned at `test/classes.test.js:864`, while the teachers page was
never aligned. `styles.css:728` (`#classList .n`) is the leftover of that
same badge era: no producer survived, so the rule is dead.

## Repro steps

1. From the worktree root, serve over HTTP (browsers block `fetch` on
   `file://`): `python3 -m http.server 8013`.
2. Open `http://localhost:8013/index.html` at a desktop viewport (1280×800).
   → **Teachers list**: every row is `<name> (n)` — e.g. `Barboura (18)`.
3. Click the search box and type `barb`.
   → **Suggest overlay**: teacher rows read `teacher Barboura (18)` — the
   same badge after the name.
4. Click `Barboura`.
   → **Detail page**: `<h2>Barboura</h2>`, day-group tables, and the
   `Subjects/Classes (ranked by hours)` breakdown keep their counts (this
   issue does not touch them); the `#status` line still reads
   `… sessions · … teachers`.
5. Open `http://localhost:8013/classes.html`.
   → **Classes list**: plain names, no `(n)` (unchanged, and pinned by
   `test/classes.test.js:864`).
6. Repeat step 2-4 at a mobile viewport (390×844, `@media (max-width: 700px)`
   list layout) — same badges, same result.

## Discussion

### Maintainer decision (2026-10-20)

Verdict: **valid, in scope, fix it now** — the user's rationale ("useless")
applies verbatim to both render sites of the same badge, and the project
already follows the count-free convention everywhere else (classes page
pinned count-free at `test/classes.test.js:864`). The change is a deletion
of two string concatenations, one shared CSS rule, and one dead rule; no
behaviour, ranking, or data path changes.

Research that shaped the decision (read-only):

- `js/teachers.js:268` (list) and `:445` (suggest) are the only producers of
  the session-count badge; `grep -rn 'class="n"' js/ test/ *.html` → those
  two, `:270` (see criterion 2), and the negative pin
  `test/classes.test.js:864`.
- `styles.css:728` (`#classList .n`) is **truly unconsumed**: `js/classes.js`
  emits no `class="n"` (list `:260-261` and suggest `:479-480` both use
  `.alias`), no HTML file carries `class="n"`, and no test references the
  selector → it dies.
- No test pins the teachers-side count (`grep -rn 'class="n"' test/` → only
  the classes-side *negative* pin, which stays green untouched), so no
  existing test needs editing; the convention for this kind of removal is an
  appended negative pin, mirroring `test/classes.test.js:864`.

**Deviation from the coordinator's brief, settled here (documented on
purpose):** the brief's "CSS rule at 174 removed" and "pin the absence of
`class="n"` in teachers.js" assumed `:270` also disappears. It does not —
`:269-270` renders `(Xh00 relevant)`, an *hours* label that only appears for
an exact query and explains why a row ranked; it is not "the number of
sessions", so the user's binding requirement does not reach it. Rather than
delete an out-of-scope badge or leave a stale name behind, the criterion
renames that span `n` → `relevant` (markup-only; identical text and
styling), which makes the brief's two literals true at once: no
`class="n"` left anywhere in `js/teachers.js`, and the `.n` selectors gone
from `styles.css`. The rendered output for the surviving badge is unchanged.

Acceptance criteria (implementation-ready):

1. **Both teachers-page count sites removed.** `js/teachers.js:268` (list
   rows) and `js/teachers.js:445` (teacher-kind suggest rows) lose the
   `' <span class="n">(' + store.sessionsOf(…).length + ')</span>'`
   concatenation **including the leading space inside that same string**, so
   nothing is left dangling. Result: `var h = match.highlightHTML(r.teacher, r.nameRanges);`
   and the suggest branch no longer appends a count. Both sites go — the
   "useless" rationale covers the overlay exactly as it covers the list.
2. **The `(Xh00 relevant)` badge stays, renamed.** `js/teachers.js:269-270`
   keeps its behaviour and text; only its class changes
   `<span class="n">` → `<span class="relevant">`. No other line of that
   block changes (the `if (r.relevantSessions > 0)` guard and the leading
   space before its span stay, so its spacing is untouched).
3. **Spacing invariant.** After criterion 1 a plain list row must end at the
   name: no trailing space, no double space, no orphan gap where the badge
   was. Verified in the rendered DOM (`textContent` of a row equals the
   highlighted name with no trailing whitespace) and visually at 1280×800 and
   390×844. A row that still shows the relevant badge (exact query) reads
   `<name> (Xh00 relevant)` — one space, as before.
4. **Suggest special case collapsed.** Once the count is gone from
   `js/teachers.js:443-447`, the `kind === 'teacher'` branch is
   byte-identical to the final `else`, so it is removed: the structure
   becomes `if (kind === 'class') … else …` (removing the need instead of
   keeping a branch that adds nothing). The `kind` chip and the `mousedown`
   accept guard are untouched.
5. **CSS rule `styles.css:174` removed.** The whole shared rule
   `#suggest .n, #teacherList .n { … }` is deleted: `#suggest .n` has no
   producer left after criterion 1, and `.n` no longer names any markup
   (criterion 2). The surviving badge's declarations are re-established as
   `#teacherList .relevant { … }` inside the `/* ---- teacher list ---- */`
   section, right beside `#teacherList li.empty` — mirroring how
   `#classList .alias` sits beside `#classList li.empty`. Rationale for the
   placement: a `#teacherList` selector does not belong in the `#suggest`
   rules cluster, and keeping my line out of that cluster also keeps the
   hunk away from sibling 060's search-CSS surface. Same declarations, no
   styling loss.
6. **Dead rule `styles.css:728` (`#classList .n`) deleted** — verified
   unconsumed (see Research), and its `.alias` neighbour on 729 stays.
7. **Out of scope, must remain byte-identical:** detail-page counts
   (`js/teachers.js` `breakdownHTML`/`treeHTML` `class="hours"` spans), the
   `#status` totals line (`js/teachers.js:173`), `#suggest .alias`,
   `#classList .alias`, `js/classes.js`, `js/theme.js`, `js/match.js`
   (ranking keeps using `relevantSessions`), all four HTML files, README,
   Design.md, and every existing test — `test/classes.test.js:864` in
   particular stays green without being touched.
8. **Sibling boundary (060 in flight).** 060 owns the search/X machinery of
   `js/teachers.js` (~158-230, ~580-640) and the search CSS + both HTMLs.
   My hunks are line-local to ~266-270 and ~441-447 in `js/teachers.js` and
   to CSS lines 174 and 728; nothing else is edited, nothing else is
   reformatted.
9. **Allowed files (exactly):** `js/teachers.js`, `styles.css`,
   `test/teacher-daygroups.test.js` (append-only), `issues/062-*.md`.
10. **Tests: baseline re-verified 131** (`node --test` → `# tests 131`,
    `node --test test/*.test.js` → `# tests 131`, 0 fail, run on this
    worktree before any edit). Convention: **+1** appended `test(...)` block
    at the end of `test/teacher-daygroups.test.js` (no existing test edited)
    pinning the removal and its guards → **expected total 132**. The block
    asserts: (a) `js/teachers.js` contains no `class="n"` and no
    `sessionsOf(r.teacher).length` / `sessionsOf(r.label).length` count span;
    (b) `styles.css` contains no `#suggest .n`, no `#teacherList .n`, no
    `#classList .n`; (c) positives — `class="relevant"` survives in
    `js/teachers.js` and `#teacherList .relevant` in `styles.css`, so the
    surviving badge keeps its styling. Justification for any other delta:
    none expected; if the count lands elsewhere, this entry is the only place
    a new number may be recorded.
11. **Verification before reporting:** both test invocations at 132/0 fail;
    a real browser walk (Playwright, served over HTTP) at 1280×800 and
    390×844 covering — plain list names with no badges and no doubled
    spacing, plain suggest rows for a typed query, detail page counts
    unchanged, `#status` totals unchanged, classes page unchanged, **0
    console errors**; `curl` of `/`, `/index.html`, `/classes.html`,
    `/time.html` (or `/timetable.html`) → 200, server killed **by PID** (never
    `pkill -f`, which would self-match); and a file-level diff-hygiene check (checksum
    snapshot of the tree taken before the first edit) showing only the four
    allowed files changed. No git of any kind; `Status:` stays `Open` for
    the main agent to flip at merge.

Risks / constraints to guard:

- The classes-side negative pin (`test/classes.test.js:864`) must stay green
  untouched — do not "fix" it by editing the test.
- `match.searchSections` / `liveSearch` ranking still depends on
  `relevantSessions`; criterion 1 only removes a *display* concatenation, so
  no `match.js` or ranking change is in scope.
- The rename in criterion 2 must not alter the rendered text of the relevant
  badge (`(Xh00 relevant)` identical, `getComputedStyle` colour/size
  identical) — the browser walk checks it explicitly.
- `#suggest .n` removal must not disturb `#suggest .alias` / `.kind-*`
  rules on the neighbouring lines (criterion 5 is one line).

### Fix implemented (2026-10-20)

Implemented in place by the folded Reporter→Maintainer→Implementer agent
(user-authorized collapse for this small task), worktree
`/home/user/.local/share/opencode/worktree/1de5bb/062-teacher-count`.
**No git of any kind was used, nothing was committed, `Status:` stays
`Open`** for the main agent to flip at merge. Process order honoured:
issue file first (Description/Root cause/Repro), then the Maintainer entry
above, then the implementation, then this entry.

**Exact unified diff** (base reconstructed by reverse-applying the edits
below and md5-verifying each reconstructed file against the pre-edit
checksum snapshot of all 63 files — so this diff is byte-exact):

```diff
--- a/js/teachers.js
+++ b/js/teachers.js
@@ -264,10 +264,9 @@
       cls.push(r.exact ? C.exact : C.partial);
       li.className = cls.join(' ');
       li.dataset.name = r.teacher;
-      var h = match.highlightHTML(r.teacher, r.nameRanges) +
-        ' <span class="n">(' + store.sessionsOf(r.teacher).length + ')</span>';
+      var h = match.highlightHTML(r.teacher, r.nameRanges);
       if (r.relevantSessions > 0)
-        h += ' <span class="n">(' + model.hoursLabel(r.relevantSessions) + ' relevant)</span>';
+        h += ' <span class="relevant">(' + model.hoursLabel(r.relevantSessions) + ' relevant)</span>';
       r.subjectMatches.slice(0, 3).forEach(function (m) {
         h += '<br><span class="fmatch">' + match.highlightHTML(m.label, m.ranges) + '</span>';
       });
@@ -440,9 +439,6 @@
         if (r.kind === 'class') {
           body = match.highlightHTML(r.label, r.ranges) +
             (r.detail ? ' <span class="alias">— ' + esc(r.detail) + '</span>' : '');
-        } else if (r.kind === 'teacher') {
-          body = match.highlightHTML(r.label, r.ranges) +
-            ' <span class="n">(' + store.sessionsOf(r.label).length + ')</span>';
         } else {
           body = match.highlightHTML(r.label, r.ranges);
         }
--- a/styles.css
+++ b/styles.css
@@ -171,7 +171,6 @@
 #suggest .kind-subject { background: var(--md-secondary, #6a3fa0); color: var(--md-on-secondary, #fff); }
 #suggest .kind-teacher { background: var(--md-tertiary, #0b6e2f); color: var(--md-on-tertiary, #fff); }
 #suggest .alias { color: var(--md-on-surface-variant, #555); font-size: .82em; }
-#suggest .n, #teacherList .n { color: var(--md-on-surface-variant, #666); font-size: .85em; }
 
 /* ---- teacher list (single list, identical on all viewports) ---- */
 #teacherList {
@@ -184,6 +183,7 @@
   color: var(--md-on-secondary-container, #1b1b1b);
 }
 #teacherList li.empty { cursor: default; color: var(--md-on-surface-variant, #555); font-style: italic; }
+#teacherList .relevant { color: var(--md-on-surface-variant, #666); font-size: .85em; }
 /* grouped-list section header rows (inserted by JS between teacher rows):
    non-clickable labels, never matched by the li hover/active rules. */
 #teacherList li.group-head {
@@ -725,7 +725,6 @@
   color: var(--md-on-secondary-container, #1b1b1b);
 }
 #classList li.empty { cursor: default; color: var(--md-on-surface-variant, #555); font-style: italic; }
-#classList .n { color: var(--md-on-surface-variant, #666); font-size: .85em; }
 #classList .alias { color: var(--md-on-surface-variant, #555); font-size: .82em; }
 
 /* week grid */
--- a/test/teacher-daygroups.test.js
+++ b/test/teacher-daygroups.test.js
@@ -788,3 +788,28 @@
   var fresh = teacherOrderOf(match.searchSections(index, '', availSun).sections);
   assert.deepStrictEqual(h.sunOrder, fresh, 'the fresh Sunday order is the real alphabetical collapse');
 });
+
+// ---- per-name session-count badges (issue 062) ------------------------------
+
+test('teacher rows carry no session-count badge, in the list and in suggest (issue 062)', function () {
+  // mirrors the classes-side negative pin (test/classes.test.js:864): the
+  // teachers page emits no `.n` span anywhere any more.
+  assert.ok(APP_SRC.indexOf('class="n"') === -1, 'no class="n" left in js/teachers.js');
+  assert.ok(APP_SRC.indexOf('store.sessionsOf(r.teacher).length') === -1,
+    'the list row no longer appends the session count');
+  assert.ok(APP_SRC.indexOf('store.sessionsOf(r.label).length') === -1,
+    'the suggest row no longer appends the session count');
+  // the badge styles die with the badges: the shared rule and the dead
+  // classes-page rule are both gone.
+  assert.ok(CSS_SRC.indexOf('#suggest .n') === -1, 'no #suggest .n rule');
+  assert.ok(CSS_SRC.indexOf('#teacherList .n') === -1, 'no #teacherList .n rule');
+  assert.ok(CSS_SRC.indexOf('#classList .n') === -1, 'the unconsumed #classList .n rule is gone');
+  assert.ok(!/[^a-zA-Z-]\.n\s*\{/.test(CSS_SRC), 'styles.css defines no .n rule at all');
+  // out of scope, still there: the exact-query relevant badge keeps its text
+  // and its styling (renamed from .n), and so do the detail counts and the
+  // status totals line.
+  assert.ok(APP_SRC.indexOf('class="relevant"') !== -1, 'the exact-query relevant badge stays');
+  assert.ok(CSS_SRC.indexOf('#teacherList .relevant') !== -1, 'the relevant badge keeps its styling');
+  assert.ok(APP_SRC.indexOf('class="hours"') !== -1, 'detail-page counts stay');
+  assert.ok(APP_SRC.indexOf("store.size + ' sessions · '") !== -1, 'the #status totals line stays');
+});
```

A new file, `issues/062-remove-teacher-session-counts.md`, is added (this
issue); it is not part of the diff above.

**Criterion-by-criterion results**

1. **met** — both count sites gone: `js/teachers.js` hunk 1 (`@@ -264,10`)
   drops the list-row span *with its leading space*; hunk 2 (`@@ -440,9`)
   drops the suggest-row span with its leading space. `grep -rn 'class="n"' js/ *.html`
   → no matches; `store.sessionsOf(r.teacher).length` /
   `store.sessionsOf(r.label).length` no longer appear in `js/teachers.js`.
2. **met** — `js/teachers.js:269-270` still renders the exact-query badge:
   guard, text and leading space unchanged; only the class is now
   `relevant`.
3. **met** — spacing: on the served page (Playwright) 132/132 named rows at
   1280×800 and at 390×844 report `rowsEndingWithCount: 0`,
   `rowsWithTrailingSpace: 0`, `rowsWithDoubleSpace: 0`; row text is exactly
   the name (`"Abbassi"`, …). Exact query `Barboura` →
   `"Barboura (27h00 relevant)"` (single space), computed
   `color: rgb(68,71,79)` (the theme's `--md-on-surface-variant`) and
   `font-size: 13.6px` = .85em of the row's 16px — the same declarations the
   old rule carried, so the surviving badge looks untouched.
4. **met** — suggest structure is now `if (kind === 'class') … else …`;
   the `kind` chip and the `mousedown` guard are unchanged. Rendered rows:
   `teacherBarboura`, `teacherBouchareb` (chip + name, no count).
5. **met** — `styles.css:174` deleted (`grep -n '\.n {' styles.css` → no
   match; `#suggest .alias` and the `.kind-*` rules on the neighbouring
   lines untouched), and `#teacherList .relevant { … }` added inside the
   `/* ---- teacher list ---- */` section right after
   `#teacherList li.empty`. **Recorded deviation:** this criterion was first
   drafted as "rewritten in place at line 174"; during implementation the
   surviving rule was placed in the teacher-list section instead (a
   `#teacherList` selector does not belong in the `#suggest` cluster, and
   the move keeps my line out of sibling 060's search-CSS surface), and the
   criterion text was amended in the same step. Both forms are kept visible
   here; nothing else about the rule changed (same declarations).
6. **met** — the dead `#classList .n` rule is deleted, verified unconsumed
   before removal (`js/classes.js` emits no `class="n"`; list/suggest rows
   use `.alias`; no HTML file carries `class="n"`; no test references the
   selector). `#classList .alias` on the next line stays and still styles 94
   live alias spans (`rgb(68,71,79)`, `13.12px`).
7. **met** — out-of-scope surfaces untouched and observed unchanged:
   detail page for `Barboura` renders `<h2>Barboura</h2>`, **39**
   `class="hours"` counts, day heads `jeudi/vendredi/samedi`, 15 session
   rows; `#status` reads `2093 sessions · 132 teachers` on both viewports;
   `/classes.html` shows 0 count rows and 0 `.n` spans; `js/classes.js`,
   `js/theme.js`, `js/match.js`, all four HTML files, README, Design.md and
   every existing test are byte-identical (see criterion 9), and
   `test/classes.test.js:864` passes unedited.
8. **met** — hunks are line-local: `js/teachers.js` lines 264-273 and
   439-445 (nothing in 060's ~158-230 / ~580-640 regions), `styles.css`
   lines 171-176, 183-187, 725-728, test appended at EOF. No reformatting
   outside the cited lines.
9. **met** — git-free diff hygiene: md5 of all 63 files taken before the
   first edit, recomputed after. Changed: `js/teachers.js`, `styles.css`,
   `test/teacher-daygroups.test.js`; added: `issues/062-remove-teacher-session-counts.md`.
   The other 60 files are byte-identical, and the reconstructed bases of the
   three edited files md5-match their pre-edit snapshots exactly.
10. **met** — tests: baseline re-verified **131**/131 pass, 0 fail (both
    `node --test` and `node --test test/*.test.js`) before any edit; after
    the implementation and the single appended block: `node --test` →
    `# tests 132 / # pass 132 / # fail 0`, and `node --test test/*.test.js`
    → `# tests 132 / # pass 132 / # fail 0`. Exactly as ruled: **132**, no
    existing test edited, no other delta.
11. **met** — verification, all of it run on this worktree:
    - **Browser walk** (Playwright headless Chromium over
      `http://127.0.0.1:8062`, server started with `python3 -m http.server`):
      *desktop 1280×800* — list: 132 rows, plain names, `.n` spans anywhere
      = 0, no `(digits)` row endings, no trailing/double spaces; typed query
      `barb` → suggest rows `teacherBarboura`, `teacherBouchareb` with no
      count and no `.n`; exact query `Barboura` → the styled
      `Barboura (27h00 relevant)` badge; click `Barboura` → detail page
      unchanged (39 `.hours` counts, day tables, `#status` intact);
      `/classes.html` → unchanged (0 count rows, `.alias` styled).
      *mobile 390×844* — same list checks (0 badges, 0 trailing spaces,
      `#status` intact); typed `bou` → 8 plain suggest rows; tapping the
      first → detail `<h2>Boukthir</h2>` with 19 `.hours` counts, suggest
      overlay hidden. **0 console errors on every page** (only the
      pre-existing `pillsFor: refusing program reduction across years`
      warnings from `js/model.js:242`).
    - **HTTP:** `/`, `/index.html`, `/classes.html`, `/time.html`,
      `/timetable.html` → **200 (5/5)**.
    - **Server killed by PID**: the recorded shell PID 970582 was a wrapper
      subshell, so the real `python3 -m http.server` process 970584 was
      found from `ss -ltnp` and killed individually; verified dead
      (`kill -0` fails, port 8062 closed, curl → connection refused).
      No `pkill -f` was used at any point.
    - **Diff hygiene:** only `js/teachers.js`, `styles.css`, one appended
      block in `test/teacher-daygroups.test.js`, and this issue file —
      confirmed by checksum (criterion 9), i.e. exactly the allowed file
      list and no sibling-060 surface.

**Deviation report (no unresolved self-contradiction — nothing was left
half-done):** two deviations, both recorded above and in the Maintainer
entry — (a) criterion 2's `n` → `relevant` class rename, adopted so that
the brief's "no `class="n"` in teachers.js" pin holds while the
out-of-scope relevant badge keeps its styling; (b) criterion 5's placement
amendment (delete `styles.css:174`, add the rule to the teacher-list
section) instead of rewriting line 174 in place. The test total stayed at
the ruled **132**, so criterion 10 needed no adjustment.

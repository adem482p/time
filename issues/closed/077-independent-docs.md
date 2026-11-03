# 077: Documentation files cross-reference each other

- Status: Fixed
- Date: 2026-10-22, Reporter: user

## Description

The user's requirement, verbatim:

> remove cross references of documentation files, each files should be independant.

Observed (base main @ f37c1e9): the site's documentation files point at each
other in 7 places — a reader who opens one file is sent to another to complete
the picture:

1. `README.md:8-9` — two lines whose entire purpose is describing `CONTEXT.md`
   and `FEATURES.md` (a documentation index naming its siblings).
2. `CONTEXT.md:7` — "is catalogued separately in [FEATURES.md](FEATURES.md)".
3. `CONTEXT.md:133` — "those services are catalogued in
   [FEATURES.md](FEATURES.md)".
4. `FEATURES.md:9` — "is documented in [CONTEXT.md](CONTEXT.md); this file only
   says what the app does with it".
5. `FEATURES.md:14` — "([CONTEXT.md](CONTEXT.md) describes how it is produced)".
6. `FEATURES.md:149` — "the README's captures are taken in this mode".

Expected: no documentation file names, links, or points to another documentation
file. Where a sentence only made sense because of its pointer, it is rewritten
so the fact it pointed at either stands on its own or is simply not claimed —
without losing any information about the host file's own subject matter.

## Root cause

Documentation accreted an index/pointer style: each file carried a one-line
"the rest is over there" courtesy. Harmless in isolation, but it makes every
file incomplete on its own and creates a maintenance coupling (a rename breaks
every pointer). Not a defect in code; the fix is prose-only.

## Repro steps

```
grep -n "README\|CONTEXT\.md\|FEATURES\.md\|Design\.md" README.md CONTEXT.md FEATURES.md data/README.md AGENTS.md
node --test test/*.test.js           # baseline on this base: 189 pass / 0 fail
```

Observed: the grep exits 0 with the 7 lines listed above. Expected: exit 1
(no matches), tests unchanged.

## Discussion

### Fix implemented (2026-10-22)

**What changed — 3 files, docs only** (`README.md`, `CONTEXT.md`,
`FEATURES.md`). `data/README.md` and `AGENTS.md` were swept and already carry
zero cross-references to any documentation file — untouched. `test/redact.test.js`
was not touched either: its README pins (lines ~191/204) only parse the
`](assets/…)` image links and their alt texts, all of which are preserved
byte-for-byte, and it ends green (10/10).

**Every cross-reference, and what happened to the fact it pointed at:**

1. `README.md:8-9` (the "# Documentation" index naming `CONTEXT.md` and
   `FEATURES.md`) — **dropped, section and all**. A doc index that names its
   siblings is exactly the cross-reference being removed; no fact about the
   README's own subject matter lived in those lines.
2. `CONTEXT.md:7` — "…is catalogued separately in [FEATURES.md](FEATURES.md)" →
   "…is outside this file's scope." The scoping sentence survives standalone;
   the *cataloguing* claim was about the other file and is deliberately not
   re-stated here.
3. `CONTEXT.md:133` — "those services are catalogued in
   [FEATURES.md](FEATURES.md). No backend, no build step…" → the clause is
   dropped: "…provide services on top of it. No backend, no build step…". The
   pipeline facts (static pages, no backend, no build step) all stay.
4. `FEATURES.md:9` — "is documented in [CONTEXT.md](CONTEXT.md); this file only
   says what the app does with it" → "is outside this file's scope; this file
   only says what the app does with it". The scope statement stands alone; the
   pointer is gone.
5. `FEATURES.md:14` — "and nothing else ([CONTEXT.md](CONTEXT.md) describes how
   it is produced)" → "and nothing else." The parenthetical was pure courtesy;
   the claim about the host file (four pages, one CSV) is unchanged.
6. `FEATURES.md:149` — "the README's captures are taken in this mode" → "the
   screenshots shipped with the project are taken in this mode". The fact
   (captures are taken in `?redact=1` mode) stands on its own.

**Staleness fixed while owning these files (issue 075, verified against the
actual files in this worktree):**

7. `FEATURES.md` views section — "Only the classes app carries the cross-page
   nav bar (Teachers / Classes)" was stale: `grep "<nav" classes/index.html
   teachers/index.html at/index.html all/index.html index.html classes.html`
   returns nothing (075 deleted the classes `<nav>`, pinned by
   `test/deadcode.test.js`). Rewritten to: no page carries a cross-page nav
   bar; the classes app is a dead-end reachable only by its URL and the root
   `classes.html` redirect stub (the stub verified present, and already named
   elsewhere in this same file).
8. `FEATURES.md` classes view — "listed, offered by autocomplete and
   selectable" was stale (no `#suggest`/`#ghost` in `classes/index.html`;
   `js/classes.js` carries no suggest machinery). Rewritten to: leaves are
   listed and selectable, typing only filters the list (no autocomplete,
   issue 075); also added the 075 heading fact — the detail heads with the
   shortcut form, `LCS3-GLSI_D Groupe 2` → `GLSI3 D<sub>2</sub>`, cohort as a
   real `<sub>`, unknown shapes falling back to the full name — pinned
   byte-for-byte by `test/classes.test.js` (`heading('LCS3-GLSI_D Groupe 2')
   === 'GLSI3 D<sub>2</sub>'`, `heading('LCS1') === 'LCS1'`).
9. `FEATURES.md` search section — "the catalogue, the autocomplete and the
   commit gate are restricted to leaf classes" dropped "the autocomplete" (the
   classes page consumes no suggest layer; the engine-level autocomplete
   paragraph a few lines up still describes the teachers page truthfully —
   `js/teachers.js` keeps `renderSuggest`/`renderGhost`/`isCoarsePointer`,
   verified).

**Staleness checked and deliberately NOT touched:**

- The 076 status/heading passages the brief flagged do not exist in this
  worktree's `FEATURES.md`: it makes no claim about `#status`'s position or
  any h1 size (grepped). For the record, the files here show `#status`
  *above* the search box (`classes/index.html:58`, `teachers/index.html:58`)
  and h1 at `1.3rem` generic / `2em` on the two search pages
  (`styles.css:72,82`) — nothing to correct, and no 076 issue file exists on
  this base.
- `README.md:15` caption ("each list row shows a rectangle and a session
  count") describes the shipped screenshot, which genuinely shows `(26)`-style
  count badges (image inspected) — but the UI moved on: the per-name count was
  removed in issue 062 (`js/teachers.js` keeps only the query-scoped
  `(… relevant)` badge). The caption is accurate about the *image*; the real
  staleness is the pre-062 screenshot itself, which only a capture refresh can
  fix — out of this issue's scope.
- `FEATURES.md` mobile-layouts "Coarse pointers get an Enter that commits the
  typed query instead of pre-selecting the first suggestion (issue 007)" —
  still true where suggestions exist: the teachers page keeps the
  pre-selection gate (`js/teachers.js:453`). Left as is.

**Exact diff (3 files; the new issue file is not self-diffed):**

```diff
--- a/README.md
+++ b/README.md
@@ -3,10 +3,6 @@
 See the complete timetable of any teacher, find teachers by name, subjects they teach and their classes of students.
 Data is scraped from student timetables on the official university website.
 
-# Documentation
-
-`CONTEXT.md` documents the context around the app, mainly the data model of the world.
-`FEATURES.md` documents the features that make up the website: the snapshot model, the views, search, the theme system and the rest.
-
 # Screenshots
 
 Opening any page with `?redact=1` renders every teacher name as a rectangle filled with the text foreground, so the UI can be shown without any name in it; the captures below use that mode across pages, viewports and color schemes.
--- a/CONTEXT.md
+++ b/CONTEXT.md
@@ -3,8 +3,8 @@
 The context around the app, mainly the data model of the world: what a session,
 a subject, a teacher and a class are, how classes are grouped and named, and how
 the published PDFs become the CSV every page reads. The behavior the website
 ships on top of that world — the views, search, the snapshot model, the theme —
-is catalogued separately in [FEATURES.md](FEATURES.md).
+is outside this file's scope.
 
 ## The world
@@ -130,8 +130,7 @@
    from (lowercase `#rrggbb`; empty when no fill contains it). This file is the
    single source of truth; every page reads it and nothing else.
 3. **Web pages** — static pages that load the CSV and provide services on top of
-   it; those services are catalogued in [FEATURES.md](FEATURES.md). No backend,
-   no build step: re-running the parser updates the site.
+   it. No backend, no build step: re-running the parser updates the site.
 
 The purpose is not to add information but to remove friction: the same data,
    queryable.
--- a/FEATURES.md
+++ b/FEATURES.md
@@ -6,12 +6,11 @@
 behaviors. Every claim here is read off the code and the issue tracker — issue
 numbers appear as parenthetical provenance, not as a changelog. What the world
 *is* (sessions, subjects, teachers, the class hierarchy, the PDF→CSV pipeline)
-is documented in [CONTEXT.md](CONTEXT.md); this file only says what the app does
-with it.
+is outside this file's scope; this file only says what the app does
+with it.
 
 ## Material: what the site models
 
-All four pages read `emplois.csv` and nothing else ([CONTEXT.md](CONTEXT.md)
-describes how it is produced). On top of the raw rows, the model layer builds
+All four pages read `emplois.csv` and nothing else. On top of the raw rows, the model layer builds
 the material the views are drawn from:
@@ -34,8 +33,9 @@
 live unlisted at `at/index.html` and `all/index.html` — reachable only by
 their URL, never by navigation (issue 073) — and the root landing page does
-nothing but redirect to `teachers/`. Only the classes app carries the cross-page
-nav bar (Teachers / Classes).
+nothing but redirect to `teachers/`. No page carries a cross-page nav bar: the
+classes app's own one was removed (issue 075), leaving that app a dead-end
+reachable only by its URL and the root `classes.html` redirect stub.
 
 ### Matrix — `all/index.html`
@@ -65,11 +65,14 @@
 A view with classes as the main object — the student-facing counterpart to the
 teacher and time views. The class is chosen through a live search over the
 catalogue: only leaves — fully specified classes that own a timetable of their
-own — are listed, offered by autocomplete and selectable, and a reference to a
-broader class reports no match. Selecting a class draws its
-week as a grid with the days as columns and the six slots as rows; each cell lists
-the sessions held then, every line giving the subject, the teacher and the room. A
+own — are listed and selectable, typing only filters the list (the page ships
+no autocomplete, issue 075), and a reference to a broader class reports no
+match. Selecting a class draws its
+week as a grid with the days as columns and the six slots as rows; the detail
+heads with the class's shortcut form — `LCS3-GLSI_D Groupe 2` renders as
+`GLSI3 D<sub>2</sub>`, the cohort as a real subscript, any shape the shortcut
+rule does not know falling back to the full name (issue 075). Each cell lists
+the sessions held then, every line giving the subject, the teacher and the room. A
 semi-transparent red cursor crosses the grid at the current time, its arrowhead
@@ -122,7 +125,7 @@
-- On the classes page the catalogue, the autocomplete and the commit gate are
+- On the classes page the catalogue and the commit gate are
   restricted to leaf classes (issue 047); empty results say so ("No teachers
@@ -146,7 +149,7 @@
 name overlay and the search suggestions all redact through the same helper, and
 the autocomplete ghost is suppressed so a completion cannot leak a name (issue
 061). It exists so the UI can be screenshotted and shared without any name in it;
-the README's captures are taken in this mode.
+the screenshots shipped with the project are taken in this mode.
```

**Verification run (docs-only change; no server needed):**

- Cross-reference grep, both cases, on all five owned/suspect docs:

  ```
  grep -n "README\|CONTEXT\.md\|FEATURES\.md\|Design\.md" README.md CONTEXT.md FEATURES.md data/README.md AGENTS.md
  ```

  → **exit code 1, zero output** (no matches). Case-insensitive variant
  (`grep -in "readme\|context\.md\|features\.md\|design\.md" …`) → also exit 1.
- `node --test test/*.test.js` → **189 pass / 0 fail** (identical to the
  baseline taken before any edit). Per file: classes 70, deadcode 5, fusion 16,
  libgroups 22, offline 11, pwa 11, redact 10, teacher-daygroups 26,
  teacher-subjects 5, theme-boot 7, time-live 6.
- Every rewritten sentence was cross-checked against the code it describes;
  the specific pins are cited inline above.

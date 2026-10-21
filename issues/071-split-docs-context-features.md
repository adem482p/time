# 071: Split the docs: Design.md → CONTEXT.md (the world), add FEATURES.md (the features)

- Status: Fixed
- Date: 2026-10-21, Reporter: user

## Description

**Request (user, verbatim):**

> rename DESIGN.md to CONTEXT.md and say in the README that CONTEXT.md
> documents the context around the app, mainly the data model of the world.
> create FEATURES.md where you document the features that make up the website:
> The snapshot model, the material you model, etc..

### Observed (measured on this worktree, HEAD `bdf3821`)

- The repository root holds one design document, `Design.md` (mixed case — the
  user's `DESIGN.md` does not exist under that spelling), 186 lines, titled
  `# Design`.
- That single file mixes two different subjects:
  1. **The world the app models** — `## Context` (classes, sessions, subjects,
     teachers, the PDFs as the only source of truth), `## Grouping model` (the
     five-level hierarchy, names, resolution, semester semantics),
     `## Purpose and pipeline` (PDFs → `data/extract.py` → `emplois.csv` →
     static pages), `## PDF structure` (page per class, cohort pages, the
     six-slot grid, `C_`/`TD_`/`TP_` kinds, `S1`/`SA`/`SB` tags, cell fill
     colors).
  2. **Service prose about app behavior** — `## Service: Matrix`,
     `## Service: Teachers`, `## Service: Time`, `## Service: Classes`, which
     describe what each page *does* (search, live now/next marking, the red
     cursor, mobile collapse), i.e. features, not the world.
- No feature catalog exists anywhere: `README.md` links neither document, and
  there is no `FEATURES.md`, so the snapshot/offline model (issues 063 + 070),
  the theme system, redaction mode, the PWA surface and the rest of the shipped
  behavior are undocumented outside code comments and `issues/`.
- Live references to the old name: `grep -rni "design\.md"` over the working
  tree (excluding `.git/`) returns **only** hits inside `issues/*.md`
  (historical, append-only records of issues 046–070). `README.md`, `AGENTS.md`,
  `*.html`, `js/*.js`, `styles.css` and `test/*.js` never name the file, so no
  live link breaks on the rename — only the file itself and this record.

### Expected

- `Design.md` is renamed to `CONTEXT.md` and re-titled as the context around
  the app, mainly the data model of the world (its world-model content kept
  faithful).
- The feature/service prose moves to a new `FEATURES.md`, a readable catalog of
  the features that make up the website (the snapshot model, the material the
  app models, search, theme, redaction, PWA, …), derived from the code and the
  issue tracker.
- `README.md` gains a short pointer saying that `CONTEXT.md` documents the
  context around the app, mainly the data model of the world (plus an equally
  brief line for `FEATURES.md`), with every relative link resolving.

## Root cause

Documentation debt, not a defect: the document was written as one "Design" file
before the site had a feature surface to speak of, and the four `## Service: …`
sections accreted in it as pages were built (issues 046–062). It never grew a
boundary between *what the world is* (the CSV's data model, the grouping
hierarchy, the PDF pipeline) and *what the app does with it* (the views, the
snapshot model, the theme), and nothing else in the repository points at it, so
neither subject had a name a reader could find.

## Repro steps

1. `ls /home/user/.local/share/opencode/worktree/1de5bb/071-context-features/*.md`
   → `AGENTS.md`, `Design.md`, `README.md` — no `CONTEXT.md`, no `FEATURES.md`.
2. `grep -n "^## " Design.md` → `Context`, `Grouping model`,
   `Purpose and pipeline`, `PDF structure`, `Service: Matrix`,
   `Service: Teachers`, `Service: Time`, `Service: Classes` — world model and
   service prose interleaved in one file.
3. `grep -rni "design\.md" . --exclude-dir=.git` → hits only under `issues/`
   (records of 046–070); `README.md` contains no link to any of these docs
   (`grep -ni "context\|features\|design" README.md` → nothing).
4. Expected after this issue: `CONTEXT.md` and `FEATURES.md` exist at the root,
   `Design.md` does not, `README.md` points at both, and
   `grep -rni "design\.md"` outside `issues/` and `.git/` returns nothing.

## Discussion

### Maintainer decision (2026-10-21)

Folded Reporter+Maintainer run on `fix/071-context-features` (worktree based on
main @ `bdf3821`, baseline `node --test` → **173/173/0** in both invocation
forms). Read-only research: `Design.md` in full, `README.md`, the four HTML
pages, `sw.js`, `js/register.js`, `js/data.js`, `js/match.js`, `js/app.js`,
`js/color.js`, `manifest.json`, headers + feature sites of `js/teachers.js`,
`js/classes.js`, `js/theme.js`, and the titles/descriptions of issues 046–070.

**Triage — VALID, in scope, doc-only.** The three asks are user requirements
(verbatim in `## Description`), the fix is a documentation re-homing, and the
scope fences keep it inside five paths.

**Findings that shape the decision**

- The file is `Design.md` (mixed case), not `DESIGN.md`. Case-insensitive grep
  for `design\.md` over the live tree returns hits **only inside `issues/`**
  (records of 046, 047, 049–055, 062, 063, 068–070, which name it as an
  untouched/edited file in their own diffs). `README.md`, `AGENTS.md`, all four
  HTML files, `js/*.js`, `styles.css` and `test/*.js` never reference it, so
  **no live link breaks on the rename and no live file needs a text update.**
  Historical `issues/*.md` are append-only records and stay byte-identical.
- `Design.md`'s first four sections are the world (sessions/subjects/teachers,
  the grouping hierarchy, the PDF→CSV pipeline, the PDF structure); its last
  four are `## Service: Matrix|Teachers|Time|Classes`, i.e. page behavior.
- The only two places where the old text breaks once the service sections move:
  (a) the opening `## Context` heading becomes tautological under the new title
  `# Context`; (b) `Purpose and pipeline` §3 says the pages "provide services on
  top of it **(below)**" — the antecedent moves to `FEATURES.md`.
- `test/redact.test.js:190-217` is the only test that reads `README.md`: it
  pins that the README links ≥7 `assets/…` images that exist and that every
  capture's alt is non-empty and professor-token-free. It says nothing about
  headings or prose, so an added documentation section is free as long as the
  `# Screenshots` images are untouched.
- Feature inventory (code, not memory): snapshot model + IndexedDB status
  (`sw.js`, `js/register.js`, 063/067/070); four views with live now/next, the
  red cursor, day groups from today, whole-week grid (`app.js`, `teachers.js`,
  `classes.js`, 048–051); search engine with sections, ghost autocomplete and
  committed `teacher:`/`class:`/`subject:` queries (`match.js`); theme presets +
  pre-paint replay (`theme.js` + one inline script per page, 059/066);
  `?redact=1` (`data.js`, 061); manifest + ISIMa icons (`manifest.json`, 068/
  069); remembered class (`classes.js`, 065); ≤700px three-state navigation
  (056–058); back-arrow deselect (060/064); kaomoji empty states on both search
  pages (`vendor/kaomoji.js`).
  Two "expected" items from the brief needed a truth ruling rather than a
  copy:
  **count badges** — the per-name `(n)` session badge was *removed* by 062, so
  the catalog must not advertise it; what survives is the `(N relevant)` hours
  badge on a filtered row, the status line's totals, the time page's per-day
  counts and the teacher detail's hours/share rankings (053 makes subject
  counts case/whitespace-insensitive). **week alternation `SA`/`SB`** — the
  marker is *model* material, not a rendered badge: `js/model.js:317-319` keeps
  a single marker only when every member of a fused slot agrees (`''`
  otherwise, never `S1`), and no view prints it; what the UI shows of
  alternation is the fused row (`room`/`subject` joined with `or`). The catalog
  will say exactly that.

**Decision — split as requested; re-home, do not rewrite.**

1. `Design.md` is renamed to `CONTEXT.md` (title `# Context`), keeping its
   world-model prose faithful. The two forced edits above are the only changes
   to moved text; a single forward link to `FEATURES.md` is added.
2. The four `## Service: …` sections move into `FEATURES.md` verbatim in
   meaning, re-headed `### Matrix|Teachers|Time|Classes` under `## The views`:
   "Service:" was the old document's organizing word, and a feature catalog
   should name features the way the user does.
   *Rejected alternatives:* keep the service sections in `CONTEXT.md` (the
   user's binding sentence scopes it to the world — behavior belongs in
   FEATURES); rewrite them while moving (this is a re-homing, and a rewrite
   would silently re-decide issues 046–062); split the pipeline into a third
   document (the user named two, and the pipeline is the world's provenance).
3. `FEATURES.md` is a catalog of short per-feature sections in the order
   below, every claim derived from the code and the tracker, issue numbers as
   light parenthetical provenance — no changelog.
4. `README.md` gains a `# Documentation` section (same H1 style as the
   existing sections) **inserted before `# Screenshots`**, carrying the user's
   sentence for `CONTEXT.md` verbatim in meaning and one equally brief line
   for `FEATURES.md`. Nothing inside `# Screenshots`, `# Data Pipeline` or
   `# Disclaimer` changes.

**Acceptance criteria**

1. `Design.md` no longer exists; `CONTEXT.md` and `FEATURES.md` exist at the
   repo root, and `README.md` links both (relative links that resolve).
2. `CONTEXT.md` opens with `# Context` and contains the world model —
   `## The world` (was `## Context`), `## Grouping model`,
   `## Purpose and pipeline`, `## PDF structure` — with its prose unchanged
   except the two forced edits (the retitled opening heading, and
   "(below)" → a link to `FEATURES.md`), plus one forward link to
   `FEATURES.md`. No `## Service:` section remains in it.
3. `CONTEXT.md` contains no feature/service catalog; `FEATURES.md` contains no
   re-derivation of the grouping hierarchy or the PDF pipeline — it links to
   `CONTEXT.md` instead.
4. `FEATURES.md` documents, each as its own short section: the modeled
   material; the four views (moved `Service:` prose, re-headed); live time
   (30 s clock, NOW/NEXT, red cursor, day groups from today, whole-week grid);
   search & matching (including the honest badge ruling and 062's removal);
   the theme system (presets, dark, tooltip, pre-paint replay); redaction mode;
   the snapshot/offline model (network-first, wholesale take, install
   precache, persisted IndexedDB status, erase+retake, dev escape hatch); the
   installable app (manifest, shortcuts, ISIMa icons); remembering the last
   class; mobile layouts; deselect/back arrow; the kaomoji empty states.
5. The per-name session-count badge is **not** documented as a feature (062
   removed it); `SA`/`SB` is documented as model material whose UI effect is
   the fused `or` row, not as a rendered badge.
6. `README.md` says, in its new documentation section, that `CONTEXT.md`
   documents the context around the app, mainly the data model of the world,
   and gives `FEATURES.md` one equally short line.
7. `grep -rni "design\.md"` over the working tree → zero hits outside `.git/`
   and `issues/`.
8. `node --test` and `node --test test/*.test.js` → **173 tests, 173 pass,
   0 fail** in both forms (docs-only change: the total must not move).
9. Diff touches exactly `Design.md` (removed), `CONTEXT.md`, `FEATURES.md`,
   `README.md`, `issues/071-split-docs-context-features.md`. No code, CSS,
   test or other issue file — no `Status:` line anywhere is edited.

**Risks / constraints**

- *`test/redact.test.js` pins on the README* (7 image links resolve, alts
  non-empty and professor-token-free): the `# Screenshots` section is left
  byte-identical; only an insertion above it.
- *Anchor drift*: `Design.md` links `#grouping-model` internally — that
  heading survives unchanged in `CONTEXT.md`, so the link keeps resolving.
- *Scope creep into the maintainability review*: only the doc split lands here;
  the review's other findings (e.g. the worker being absent from the docs) are
  addressed only insofar as `FEATURES.md` documents the snapshot model.
- *Append-only history*: no `issues/046…070` file is edited, even where it
  names `Design.md`.

### Fix implemented (2026-10-21)

Folded implementer run on `fix/071-context-features` (worktree based on main @
`bdf3821`). No git command was run; changes are left uncommitted for the main
agent. No `Status:` line was edited anywhere — this issue reads `Open` and the
23 `Fixed` records are untouched.

**Files (exactly the five in scope):**

| path | change |
|---|---|
| `Design.md` | removed (renamed) |
| `CONTEXT.md` | new — the world model, re-homed from `Design.md` |
| `FEATURES.md` | new — the feature catalog |
| `README.md` | +5 lines: a `# Documentation` section inserted before `# Screenshots` |
| `issues/071-split-docs-context-features.md` | new — this record |

**Acceptance criteria — results**

1. **Met.** `Design.md` gone (`ls *.md` → `AGENTS.md CONTEXT.md FEATURES.md
   README.md`); `CONTEXT.md` + `FEATURES.md` at the root; `README.md` links both.
2. **Met.** `CONTEXT.md` = `# Context` → `## The world`, `## Grouping model`,
   `## Purpose and pipeline`, `## PDF structure`; no `## Service:` section
   remains. Fidelity check: `diff` of the pre-change body (old lines 5–148)
   against the same slice of `CONTEXT.md` reports **one hunk only** — the
   `(below)` pointer retargeted to `FEATURES.md`. The old `## Context` heading
   became `## The world` (a tautology under the new title); everything else is
   byte-identical, including the `#grouping-model` anchor.
3. **Met.** No grouping-hierarchy or PDF-pipeline prose was copied into
   `FEATURES.md`; it links `[CONTEXT.md](CONTEXT.md)` instead, and `CONTEXT.md`
   links forward to `FEATURES.md` twice (title paragraph, pipeline §3).
4. **Met.** `FEATURES.md` sections: Material / The views (Matrix, Teachers,
   Time, Classes) / Live time / Search and matching / Theme system / Redaction
   mode / Offline: the snapshot model / Installable app / Remembering the last
   class / Mobile layouts / Deselect and the back arrow / Empty states. The four
   moved `Service:` bodies were diffed against `Design.md`: **verbatim** apart
   from their headings (`## Service: Matrix` → ``### Matrix — `timetable.html` ``
   etc.).
5. **Met.** The `(n)` per-name session badge (removed by 062) is documented as
   deliberately absent, never as a feature; `SA`/`SB` is documented as model
   material whose only UI effect is the fused `A or B` row (verified: `week` is
   written by `js/model.js:317-319` and read by no view).
6. **Met.** `README.md` now says `CONTEXT.md` documents the context around the
   app, mainly the data model of the world (user's wording), plus one equally
   brief line for `FEATURES.md`.
7. **Met.** `grep -rni "design\.md" . --exclude-dir=.git | grep -v '^\./issues/'`
   → **no output** (all remaining hits are inside `issues/`, which is
   append-only and was not edited).
8. **Met.** `node --test` → **173 tests, 173 pass, 0 fail**; `node --test
   test/*.test.js` → **173 tests, 173 pass, 0 fail**. Baseline 173 → 173: the
   total did not move, and `test/redact.test.js`'s README pins (7 image links
   resolve, alts non-empty and professor-token-free) pass with `# Screenshots`
   byte-identical — the only README change is an insertion above it.
9. **Met.** Files modified after checkout (`find … -newermt`): `CONTEXT.md`,
   `FEATURES.md`, `README.md`, `issues/071-split-docs-context-features.md` —
   plus the removal of `Design.md`. No code, CSS, test, HTML or other issue
   file.

**Link check.** 12 relative/image links across the three documents, **0
broken**; the only in-document anchor added (`#grouping-model`) resolves to
`## Grouping model`.

**Notes / deviations.** The `a/Design.md` side of the rename diff below was
reconstructed for the comparison (the file itself is removed; 186 lines,
structure re-read line by line) — git was not used, so no `git show`/`git diff`
was available. Everything else is generated from the files as they now stand.
No criterion was found impossible or self-contradictory; nothing was stopped.

**Layouts as shipped**

`CONTEXT.md`: `# Context` → `## The world` · `## Grouping model` ·
`## Purpose and pipeline` · `## PDF structure`.

`FEATURES.md`: `# Features` → `## Material: what the site models` ·
`## The views` (`### Matrix`, `### Teachers`, `### Time`, `### Classes`) ·
`## Live time` · `## Search and matching` · `## Theme system` ·
`## Redaction mode` · `## Offline: the snapshot model` · `## Installable app` ·
`## Remembering the last class` · `## Mobile layouts` ·
`## Deselect and the back arrow` · `## Empty states`.

**The exact diff**

```diff
--- a/README.md
+++ b/README.md
@@ -5,2 +5,7 @@
 
+# Documentation
+
+`CONTEXT.md` documents the context around the app, mainly the data model of the world.
+`FEATURES.md` documents the features that make up the website: the snapshot model, the views, search, the theme system and the rest.
+
 # Screenshots
--- a/Design.md
+++ b/CONTEXT.md
@@ -1,4 +1,10 @@
-# Design
+# Context
 
-## Context
+The context around the app, mainly the data model of the world: what a session,
+a subject, a teacher and a class are, how classes are grouped and named, and how
+the published PDFs become the CSV every page reads. The behavior the website
+ships on top of that world — the views, search, the snapshot model, the theme —
+is catalogued separately in [FEATURES.md](FEATURES.md).
+
+## The world
 
@@ -125,4 +131,5 @@
    single source of truth; every page reads it and nothing else.
-3. **Web pages** — static pages that load the CSV and provide services on top of it
-   (below). No backend, no build step: re-running the parser updates the site.
+3. **Web pages** — static pages that load the CSV and provide services on top of
+   it; those services are catalogued in [FEATURES.md](FEATURES.md). No backend,
+   no build step: re-running the parser updates the site.
 
@@ -148,39 +155 @@
 sessions.
-
-## Service: Matrix
-
-The full timetable matrix: teachers crossed with the six time slots of the week.
-Each cell where a teacher is engaged shows where they can be found — the room,
-plus the day and subject of the session. It answers "when and where is this
-teacher teaching?" at a glance, and can be filtered by day or teacher.
-
-## Service: Teachers
-
-A view with teachers as the main object. The teacher list is searchable and
-filterable live; teachers available today are raised to the top. Selecting a
-teacher reveals their week: sessions grouped by day, the current and next session
-highlighted, and days with no live stake dimmed. The same view adapts to narrow
-screens: the list and the session table collapse into stacked cards.
-
-## Service: Time
-
-A view with time slots as the main object. The week is grouped by day; today's
-section is marked and scrolled into view, with the current and next slots
-highlighted. Selecting a slot lists the teachers teaching then, where each can be
-found, and which classes they teach. It answers "who is teaching right now, and
-where?"
-
-## Service: Classes
-A view with classes as the main object — the student-facing counterpart to the
-teacher and time views. The class is chosen through a live search over the
-catalogue: only leaves — fully specified classes that own a timetable of their
-own — are listed, offered by autocomplete and selectable, and a reference to a
-broader class reports no match. Selecting a class draws its
-week as a grid with the days as columns and the six slots as rows; each cell lists
-the sessions held then, every line giving the subject, the teacher and the room. A
-semi-transparent red cursor crosses the grid at the current time, its arrowhead
-resting in a small gutter beside the time column, and the current and next slots
-are highlighted — the next only while it is still today, with nothing marked at
-all on Sunday, before the day begins, or once it has ended. On narrow screens the
-week collapses into stacked session cards, as the teachers view does. It answers
-"what does this class have right now, and where?"
--- /dev/null
+++ b/FEATURES.md
@@ -0,0 +1,223 @@
+# Features
+
+The features that make up the website: the snapshot model that keeps it working
+offline, the material the pages model, the four views, search and matching, the
+theme system, redaction, the installable-app surface, and the small navigation
+behaviors. Every claim here is read off the code and the issue tracker — issue
+numbers appear as parenthetical provenance, not as a changelog. What the world
+*is* (sessions, subjects, teachers, the class hierarchy, the PDF→CSV pipeline)
+is documented in [CONTEXT.md](CONTEXT.md); this file only says what the app does
+with it.
+
+## Material: what the site models
+
+All four pages read `emplois.csv` and nothing else ([CONTEXT.md](CONTEXT.md)
+describes how it is produced). On top of the raw rows, the model layer builds
+the material the views are drawn from:
+
+- **Session fusion** — the same teacher, day and slot in different rooms (or the
+  two alternating halves of one slot) collapse into a single row whose room and
+  subject read `A or B`. The `SA` / `SB` week marker is model material rather
+  than a rendered badge: a fused row keeps one marker only when every member of
+  the slot agrees, and empty otherwise (never the stripped `S1` tag), while the
+  views simply show the fused row.
+- **Grouping pills** — the time page's slot detail lists the classes in that
+  slot as pills resolved through the grouping hierarchy.
+- **Indexes and availability** — unique teachers, subjects and grouping nodes,
+  plus per-teacher availability (teaching now / free), which the teachers list
+  re-ranks on every clock tick.
+
+## The views
+
+Four pages over the same CSV; only `classes.html` carries the cross-page nav bar
+(Teachers / Timetable matrix / Time / Classes).
+
+### Matrix — `timetable.html`
+
+The full timetable matrix: teachers crossed with the six time slots of the week.
+Each cell where a teacher is engaged shows where they can be found — the room,
+plus the day and subject of the session. It answers "when and where is this
+teacher teaching?" at a glance, and can be filtered by day or teacher.
+
+### Teachers — `index.html`
+
+A view with teachers as the main object. The teacher list is searchable and
+filterable live; teachers available today are raised to the top. Selecting a
+teacher reveals their week: sessions grouped by day, the current and next session
+highlighted, and days with no live stake dimmed. The same view adapts to narrow
+screens: the list and the session table collapse into stacked cards.
+
+### Time — `time.html`
+
+A view with time slots as the main object. The week is grouped by day; today's
+section is marked and scrolled into view, with the current and next slots
+highlighted. Selecting a slot lists the teachers teaching then, where each can be
+found, and which classes they teach. It answers "who is teaching right now, and
+where?"
+
+### Classes — `classes.html`
+
+A view with classes as the main object — the student-facing counterpart to the
+teacher and time views. The class is chosen through a live search over the
+catalogue: only leaves — fully specified classes that own a timetable of their
+own — are listed, offered by autocomplete and selectable, and a reference to a
+broader class reports no match. Selecting a class draws its
+week as a grid with the days as columns and the six slots as rows; each cell lists
+the sessions held then, every line giving the subject, the teacher and the room. A
+semi-transparent red cursor crosses the grid at the current time, its arrowhead
+resting in a small gutter beside the time column, and the current and next slots
+are highlighted — the next only while it is still today, with nothing marked at
+all on Sunday, before the day begins, or once it has ended. On narrow screens the
+week collapses into stacked session cards, as the teachers view does. It answers
+"what does this class have right now, and where?"
+
+## Live time
+
+One clock per page (issue 051): a single 30-second interval hands a fresh `Date`
+to every subscribed region, and each region re-renders its own markup wholesale —
+no diffing, no gates — with a catch-up tick when the tab becomes visible again.
+The matrix page runs no timer at all. What it drives:
+
+- the `● NOW` and `→ NEXT` tags on slots, session rows and grid cells, with
+  today's day group raised and days with no live stake dimmed; `NEXT` is
+  today-only — Sunday, before the first slot and after the last one show nothing,
+  and the time page says so ("No sessions on Sunday…", "Day over — no more
+  sessions today.");
+- day-group listings that start from today and cycle forward (issue 050), with
+  today's bucket auto-scrolled to the top of the slot list;
+- the red cursor on the classes week grid, moved in place on every tick without a
+  full re-render;
+- the classes page's detail: per-day tables with desktop day headings restored
+  (issue 048), the first of them starting at today, and exactly one week
+  rendering below — the whole-week grid, the flat full-session list that used to
+  follow it being gone (issue 049).
+
+## Search and matching
+
+A small pure search engine over the store: live fuzzy filtering that returns one
+sorted list (exact matches first, then partial) with a header per fallback
+section, and an autocomplete whose ghost line completes the rest of the typed
+value inline, including prefix hints such as `subject:`. Queries can be typed
+exactly with the `teacher:`, `class:` and `subject:` prefixes, alone or mixed
+with free text; ranking keeps own identity above alias-only matches (the legacy
+alias vocabulary, issues 010 and 029).
+
+- A free-text query gives each teacher row its best matching subjects and
+  classes (up to three each), highlighted where they match, plus a
+  `(… relevant)` hours badge counted from the sessions that satisfy every typed
+  constraint. The per-name `(n)` session-count badge is deliberately **absent**
+  — it was removed as useless (issue 062).
+- The teacher detail ranks a teacher's subjects and classes by hours with their
+  share percentages; subject counting is case- and whitespace-insensitive so
+  `GLSI` and `gl si` add up (issue 053).
+- On the classes page the catalogue, the autocomplete and the commit gate are
+  restricted to leaf classes (issue 047); empty results say so ("No teachers
+  match." / "No classes match."), an exact reference to a broader class reports
+  `No match for "…"`, and an exact name still wins over longer partial matches
+  so picking a row always dismisses the menu.
+
+## Theme system
+
+One button cycles the color presets: 15 named presets — Monochrome first in the
+cycle, a fresh visitor landing on the default ISIM Blue — plus a leading
+"System" preset when the platform exposes an accent color. The light/dark scheme
+follows `prefers-color-scheme` and re-applies live when it changes;
+`js/theme.js` derives every Material-3 role from the preset's seed and writes it
+as CSS custom properties on `<html>`.
+
+- The button's styled tooltip names the active scheme — `Theme: <name> — click
+  to change` — as its accessible label too; the native `title` survives only in
+  the static markup as the no-JavaScript fallback (issue 059).
+- The applied preset and the exact property maps for *both* schemes are persisted
+  in `localStorage`, and an inline script in each page's `<head>` replays them
+  before first paint, so a reload starts themed instead of flashing the unthemed
+  fallback (issue 066).
+
+## Redaction mode
+
+Opening any page with `?redact=1` swaps every rendered teacher name for a
+rectangle filled with the text foreground, sized to the name it replaces and
+hidden from assistive technology — lists, tables, detail headings, the selected
+name overlay and the search suggestions all redact through the same helper, and
+the autocomplete ghost is suppressed so a completion cannot leak a name (issue
+061). It exists so the UI can be screenshotted and shared without any name in it;
+the README's captures are taken in this mode.
+
+## Offline: the snapshot model
+
+A network-first service worker (issues 063 + 070) with a "last snapshot" model —
+the stored copy is a snapshot of the site, never a cache the app trusts:
+
+- **Online, the network wins.** Every request is fetched with `cache: 'no-cache'`
+  so an HTTP-cache hit can never fake connectivity; the snapshot is only ever
+  *built*, wholesale.
+- **Offline, the snapshot answers** (navigations ignoring the query string); a
+  miss is an honest failure, never fabricated content.
+- **Wholesale takes only.** Install precaches the 26 URLs all-or-nothing (a
+  failing install writes nothing and retries), every network-served navigation
+  retakes the whole snapshot, and concurrent takes share one in-flight run.
+- **Erase + retake on reconnect** (issue 070): the last online/offline status is
+  logged and persisted in IndexedDB — outside Cache Storage, so teardown can never
+  erase it — and the transition offline → online tears down every cache and
+  retakes the snapshot from scratch. Storage errors are best-effort and never
+  wedge the chain; the snapshot name carries a version suffix so a semantics
+  change forces a clean retake, and activation destroys every non-current cache.
+- Registration happens once per load with an immediate `update()` byte-diff
+  check (`js/register.js`); `file://` and other non-http(s) origins are a silent
+  no-op. When the worker gets in the way in development, the console escape
+  hatch unregisters it and deletes every cache.
+
+Deployment caveat: the GitHub Pages subpath deploy still has an open offline
+reload report (issue 067).
+
+## Installable app
+
+Every page links `manifest.json`: a standalone-window app named "Emplois — ISIM
+Mahdia Timetable" with theme/background colors, and shortcuts straight to the
+Classes, Time and Matrix pages (issue 068). The icon set is the official ISIM
+Mahdia logo — 192, 512 and maskable 512 PNGs plus the apple-touch icon, also
+serving as the favicon (issue 069). Chrome's own install affordance does the
+rest: there is deliberately no in-page install button and no
+`beforeinstallprompt` capture.
+
+## Remembering the last class
+
+`classes.html` remembers the last selected class across loads: the committed
+selection is mirrored under the `emplois-class` `localStorage` key, and a reload
+lands on the same detail a fresh selection produces. An explicit deselect forgets
+it, so a deliberately cleared page still boots empty (issue 065).
+
+## Mobile layouts
+
+Below ~700px the two-pane layouts show one pane at a time. The teachers and
+classes pages share a three-state navigation — the filterable list, the selected
+name overlay, and the detail — driven by the same search box and reachable in
+both directions: the list collapses into stacked session cards, the overlay's
+chevron opens the list, and the classes page hides the whole-week grid in favour
+of per-day cards (issues 046, 056, 057, 058). Coarse pointers get an Enter that
+commits the typed query instead of pre-selecting the first suggestion, since
+there is no Escape key to back out of it (issue 007).
+
+## Deselect and the back arrow
+
+The search box keeps its two jobs on two controls instead of overloading one
+(issue 060). The app's `X` (`#searchClear`) only erases the typed filter — every
+state, every viewport — and the engine's native cancel button is suppressed
+app-wide so only one X can be on screen; getting back to the list has a dedicated
+control per viewport: `#searchDeselect` on desktop, visible while a selection is
+up and the filter is empty, whose glyph is a **back arrow** rather than an X
+(issue 064), and the selected-name overlay's own `X` (`#overlayClear`) on narrow
+screens. Emptying the box from the keyboard still deselects — a deliberate,
+pinned divergence from the button, since a keystroke and a press travel
+structurally separate funnels. Every deselect runs through one funnel that
+preserves the filter text, drops the clock-owned detail view so nothing repaints
+over the empty page, and on the classes page forgets the remembered class
+(issue 065).
+
+## Empty states
+
+Nothing selected is a state, not a blank pane: both search pages draw a kaomoji
+face from the vendored `vendor/kaomoji.js` (CC BY 4.0) above the prompt, and
+pressing the empty area swaps in another face that hops in — a reduced-motion
+setting swaps it without the hop. The classes page gained the same empty state
+when it mirrored the teachers page's chrome (issue 046).
```
